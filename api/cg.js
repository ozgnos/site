// CoinGecko proxy — runs as a Vercel Serverless Function at /api/cg
//
// Why this exists:
//   1. Keeps the API key server-side (set COINGECKO_API_KEY in Vercel env vars),
//      instead of exposing it in the page source.
//   2. Lets Vercel's edge CDN cache responses, so 100 visitors in a minute
//      become 1 real CoinGecko call instead of 100 — no more rate-limit "—".
//
// Client usage:  fetch('/api/cg?path=' + encodeURIComponent('/simple/price?ids=bitcoin&vs_currencies=usd'))

// Only these CoinGecko paths are allowed through (prevents open-proxy abuse).
const ALLOWED = ['/simple/price', '/coins/markets', '/coins/', '/global'];

// How long the edge may serve a cached copy, per endpoint (seconds).
function maxAgeFor(path) {
  if (path.startsWith('/coins/') && path.includes('market_chart')) return 600; // daily candles barely move intraday
  if (path.startsWith('/coins/markets')) return 120;
  if (path.startsWith('/global')) return 300;
  if (path.startsWith('/simple/price')) return 60;
  return 60;
}

module.exports = async (req, res) => {
  const raw = req.query && req.query.path;
  const path = Array.isArray(raw) ? raw[0] : raw;

  if (!path || !path.startsWith('/') || !ALLOWED.some((a) => path.startsWith(a))) {
    res.status(400).json({ error: 'Invalid or disallowed path' });
    return;
  }

  const key = process.env.COINGECKO_API_KEY;
  const sep = path.includes('?') ? '&' : '?';
  const url =
    'https://api.coingecko.com/api/v3' + path + (key ? sep + 'x_cg_demo_api_key=' + key : '');

  try {
    const upstream = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await upstream.text();
    const maxAge = maxAgeFor(path);

    // Vercel's edge caches this for `s-maxage` seconds; stale-while-revalidate
    // keeps serving the old copy while a fresh one is fetched in the background.
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(upstream.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed' });
  }
};
