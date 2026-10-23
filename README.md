# designAI

AI design generator: free trial of 3 designs, then Pro at $10/month through Gumroad.

## How it works
- `index.html` – the page (design unchanged).
- `api/generate.js` – builds the prompt on the server, streams the design from Claude, enforces the free trial and Pro check.
- `api/license.js` – checks a Gumroad licence key.
- `api/_lib.js` – Gumroad verification, rate limits, signed trial cookie.

## Setup (once)
1. **Gumroad**: set the product to a **membership at $10/month**. In the product editor turn on
   **"Generate a unique license key per sale"**. Copy the **product ID** (Products > your product > Share > API).
   Check the product settings to see if Gumroad offers a free-trial option; the app already gives 3 free designs.
2. **Vercel > Project > Settings > Environment Variables**:
   - `ANTHROPIC_KEY` (required)
   - `GUMROAD_PRODUCT_ID` (required)
   - `TRIAL_SECRET` (required: any long random text)
   - `PEXELS_KEY` (optional, for photos)
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (optional, free tier: stronger limits that survive restarts)
   - `ANTHROPIC_MODEL` (optional, default `claude-sonnet-5-5`)
3. Redeploy. Buyers receive a licence key from Gumroad and paste it in **Enter license key**.

The Gumroad link is in `index.html` (search for `tirach.gumroad.com`).
