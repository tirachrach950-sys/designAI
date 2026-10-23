import { checkLicense, hit, clientIp } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!(await hit('lic:' + clientIp(req), 20, 3600))) return res.status(429).json({ valid: false });
  const r = await checkLicense(req.body && req.body.licenseKey);
  return res.status(200).json({ valid: r.ok, reason: r.reason });
}
