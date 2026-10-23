import { hit, clientIp } from './_lib.js';

export default async function handler(req, res) {
  const key = process.env.PEXELS_KEY;
  const q = String((req.query && req.query.q) || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().slice(0, 60);
  if (!key || !q) return res.status(200).json({ photos: [] });
  if (!(await hit('ph:' + clientIp(req), 40, 3600))) return res.status(429).json({ photos: [] });
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=9&orientation=landscape`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(200).json({ photos: (d.photos || []).map(p => ({ thumb: p.src.medium, url: p.src.large2x || p.src.large, by: p.photographer })) });
  } catch { return res.status(200).json({ photos: [] }); }
}
