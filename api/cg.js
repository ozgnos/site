// /api/cg — CoinGecko proxy.
//
// The front-end never calls CoinGecko directly; everything goes through here
// (see cg() in markets/index.html and index.html). Why:
//   1. The API key stays server-side, in a Vercel env var (COINGECKO_API_KEY).
//      Works without a key too — the key just raises the rate limit.
//   2. Responses are edge-cached (Cache-Control: s-maxage), so a burst of
//      visitors produces one upstream request instead of hundreds.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   COINGECKO_API_KEY  (optional)  demo or pro key
//   COINGECKO_PRO      (optional)  set to "true" only if the key is a paid
//                                  Pro key (uses pro-api.coingecko.com)

const PUBLIC_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

// Only the endpoints the site actually uses — this is a proxy for our pages,
// not an open relay for the whole CoinGecko API.
const ALLOWED_PREFIXES = ['/global', '/simple/price', '/coins/'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const path = typeof req.query.path === 'string' ? req.query.path : '';

  // Basic safety: must be a relative v3 path, no protocol smuggling.
  const ok =
    path.startsWith('/') &&
    !path.includes('..') &&
    !path.includes('//') &&
    ALLOWED_PREFIXES.some((p) => path.startsWith(p));
  if (!ok) {
    res.status(400).json({ error: 'Bad path' });
    return;
  }

  const key = process.env.COINGECKO_API_KEY || '';
  const isPro = String(process.env.COINGECKO_PRO).toLowerCase() === 'true';
  const base = key && isPro ? PRO_BASE : PUBLIC_BASE;

  const headers = { accept: 'application/json' };
  if (key) headers[isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = key;

  try {
    const upstream = await fetch(base + path, { headers });
    const text = await upstream.text();

    // Edge cache: charts change slowly, prices need to feel live.
    const seconds = path.startsWith('/coins/') && path.includes('market_chart') ? 600 : 60;
    res.setHeader('Cache-Control', `s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`);
    res.setHeader('Content-Type', 'application/json');

    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'Upstream unavailable' });
  }
};
