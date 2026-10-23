import crypto from 'node:crypto';

export const clientIp = req =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';

// ---- Gumroad licence check (subscription must still be active) ----
const lic = new Map();
export async function checkLicense(key) {
  key = String(key || '').trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(key)) return { ok: false, reason: 'format' };
  const hit = lic.get(key);
  if (hit && hit.until > Date.now()) return hit.res;
  const pid = process.env.GUMROAD_PRODUCT_ID;
  if (!pid) return { ok: false, reason: 'not_configured' };
  try {
    const r = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: pid, license_key: key, increment_uses_count: 'false' }),
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => ({}));
    const p = d.purchase || {};
    const ok = !!d.success && !p.subscription_ended_at && !p.subscription_failed_at &&
      !p.refunded && !p.chargebacked && !p.disputed;
    const res = { ok, reason: ok ? 'ok' : 'invalid' };
    lic.set(key, { res, until: Date.now() + (ok ? 600000 : 60000) });
    if (lic.size > 2000) lic.clear();
    return res;
  } catch {
    return hit ? hit.res : { ok: false, reason: 'unavailable' }; // keep last known answer if Gumroad is down
  }
}

// ---- rate limits: Upstash Redis if configured, otherwise per-instance memory ----
const mem = new Map();
export async function hit(key, limit, windowSec) {
  const u = process.env.UPSTASH_REDIS_REST_URL, t = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (u && t) {
    try {
      const r = await fetch(u + '/pipeline', {
        method: 'POST', headers: { Authorization: 'Bearer ' + t },
        body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSec, 'NX']]),
        signal: AbortSignal.timeout(2500),
      });
      const d = await r.json();
      return d[0].result <= limit;
    } catch { /* fall through to memory */ }
  }
  const now = Date.now();
  let e = mem.get(key);
  if (!e || e.exp < now) { e = { n: 0, exp: now + windowSec * 1000 }; mem.set(key, e); }
  e.n++;
  if (mem.size > 5000) mem.clear();
  return e.n <= limit;
}

// ---- free trial counter in a signed cookie (cannot be edited by the visitor) ----
const sign = n => crypto.createHmac('sha256', process.env.TRIAL_SECRET || process.env.ANTHROPIC_KEY || 'dev')
  .update('t' + n).digest('hex').slice(0, 16);
export function readTrial(req) {
  const m = /(?:^|; )dai_t=(\d+)\.([a-f0-9]{16})/.exec(req.headers.cookie || '');
  if (!m) return 0;
  return sign(m[1]) === m[2] ? +m[1] : 99; // tampered cookie = trial used up
}
export const trialCookie = n => `dai_t=${n}.${sign(n)}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`;
