import { checkLicense, hit, readTrial, trialCookie, clientIp } from './_lib.js';

const FREE_LIMIT = 3;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const TYPES = {
  instagram: 'Instagram post (square format, eye-catching, bold typography, engaging caption)',
  linkedin: 'LinkedIn post card (professional, clean, with headline and body text)',
  landing: 'Landing page hero section (headline, subheadline, CTA button, features)',
  flyer: 'Event flyer or promotional poster (vertical format, bold headline, details)',
  cv: 'Modern CV/Resume (clean, professional, with photo at top, experience, skills, contact sections)',
  slide: 'Presentation slide (widescreen 16:9, title + key points)',
};
const STYLES = {
  modern: 'ultra-clean minimal design, lots of whitespace, subtle typography',
  bold: 'bold impactful design, large typography, strong contrast, commanding',
  elegant: 'luxury elegant design, refined typography, sophisticated spacing',
  playful: 'creative playful design, dynamic layouts, expressive typography',
  corporate: 'professional corporate design, structured, trustworthy',
  dark: 'dark premium design, deep backgrounds, glowing accents',
};
const LAYOUT = {
  cv: 'name + photo side by side at top, then sections: Summary, Experience, Skills, Languages, Contact',
  instagram: 'bold hero image at top, headline below, caption, hashtags',
  landing: 'hero image full width, headline, CTA button, 3 feature cards',
  flyer: 'image at top, bold headline, details, CTA',
  linkedin: 'professional header, body text, author',
  slide: 'full-bleed image or clean background, title, bullet points',
};
const SYSTEM = `You are a senior creative director and UI designer. You produce production-ready, visually striking HTML designs.
Rules:
- Output ONLY inner HTML (no DOCTYPE/html/head/body, no markdown fences, no explanations).
- Inline styles plus at most one <style> tag. You may @import 1-2 Google Fonts (Plus Jakarta Sans, Syne, Outfit, Playfair Display).
- Use the exact brand colors given, adding tints and shades with care.
- Clear visual hierarchy with one dominant element, generous whitespace, high text contrast, mobile-friendly proportions.
- Refined CSS: gradients, soft shadows, rounded corners, glassmorphism where it fits. Avoid generic layouts.
- No <script>, no event-handler attributes, no external resources except the fonts and the image placeholders.
- Write real, persuasive copy based on the topic, in the requested language.`;

const hex = v => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
const clip = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function findPhoto(query) {
  const key = process.env.PEXELS_KEY;
  if (!key || !query) return null;
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    const list = (d.photos || []).slice(0, 5);
    if (!list.length) return null;
    const p = list[Math.floor(Math.random() * list.length)];
    return { url: p.src.large2x || p.src.large, by: p.photographer };
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'config', message: 'Server is not configured' });

  const b = req.body || {};
  const type = TYPES[b.type] ? b.type : null, style = STYLES[b.style] ? b.style : null;
  const content = clip(b.content, 1500);
  if (!type || !style || !content) return res.status(400).json({ error: 'bad_request', message: 'Missing or invalid fields' });
  const brand = clip(b.brand, 80), lang = clip(b.lang, 30) || 'English';
  const c = b.colors || {};
  if (!hex(c.bg) || !hex(c.accent) || !hex(c.text)) return res.status(400).json({ error: 'bad_request', message: 'Invalid colors' });

  const ip = clientIp(req);
  if (!(await hit('rl:' + ip, 20, 3600))) return res.status(429).json({ error: 'rate', message: 'Too many requests, try again later' });

  // ---- who is this? Pro (paid Gumroad subscription) or free trial ----
  let trialUsed = null;
  if (b.licenseKey) {
    const l = await checkLicense(b.licenseKey);
    if (!l.ok) return res.status(402).json({ error: 'license_invalid', reason: l.reason });
    if (!(await hit('pro:' + String(b.licenseKey).slice(-12), 150, 86400)))
      return res.status(429).json({ error: 'rate', message: 'Daily Pro limit reached' });
  } else {
    trialUsed = readTrial(req);
    if (trialUsed >= FREE_LIMIT || !(await hit('trial:' + ip, 12, 30 * 86400)))
      return res.status(402).json({ error: 'trial_over' });
  }
  const pro = trialUsed === null;

  const pick = b.photo && /^https:\/\/images\.pexels\.com\/[\w\/.%?=&:+-]+$/.test(String(b.photo.url || ''))
    ? { url: b.photo.url, by: clip(b.photo.by, 60) } : null;
  const photoQuery = content.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  const photoP = pick ? Promise.resolve(pick) : findPhoto(photoQuery);

  const brief = `Design type: ${TYPES[type]}
Topic/content: ${content}
Brand name: ${brand || 'none'}
Style: ${STYLES[style]}
Colors: background ${c.bg}, accent ${c.accent}, text ${c.text}
Language of all copy: ${lang}
Layout: ${LAYOUT[type]}
${type === 'cv' && b.cvPhoto ? `Profile photo (circular 90px, next to the name): <img src="__CV_PHOTO__" alt="profile" style="width:90px;height:90px;object-fit:cover;border-radius:50%;border:3px solid ${c.accent};flex-shrink:0">` : ''}
${type === 'cv' ? 'Slim banner photo across the top' : 'Hero photo, place it prominently'}, exactly once: <img src="__PHOTO__" alt="photo" style="width:100%;height:${type === 'cv' ? 110 : pro ? 300 : 240}px;object-fit:cover;border-radius:16px;margin-bottom:1.4rem">`;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: pro ? 5000 : 3800, stream: true, system: SYSTEM,
      messages: [{ role: 'user', content: brief }] }),
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    if (upstream) console.error('anthropic', upstream.status, await upstream.text().catch(() => ''));
    const busy = upstream && (upstream.status === 429 || upstream.status === 529);
    return res.status(busy ? 503 : 502).json({ error: 'upstream', message: busy ? 'Service is busy, try again in a moment' : 'Generation failed, try again' });
  }

  const photo = await photoP;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Photo', encodeURIComponent(JSON.stringify(photo)));
  if (!pro) res.setHeader('Set-Cookie', trialCookie(trialUsed + 1));

  const reader = upstream.body.getReader(), dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(ln.slice(5));
          if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') res.write(ev.delta.text);
        } catch { /* ignore keep-alive / partial lines */ }
      }
    }
  } catch (e) { console.error('stream', e); }
  res.end();
}
