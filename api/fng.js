// /api/fng — Fear & Greed Index proxy (alternative.me).
//
// Same idea as /api/cg: the front-end never calls the upstream API directly.
//   1. The browser only ever talks to ozgnos.com (one less third party on
//      the privacy page, no third-party request to block or fail client-side).
//   2. Responses are edge-cached, so a burst of visitors produces one
//      upstream request instead of hundreds. The index updates roughly once
//      a day, so a 30-minute cache is more than fresh enough.

const UPSTREAM = 'https://api.alternative.me/fng/?limit=1';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const upstream = await fetch(UPSTREAM, { headers: { accept: 'application/json' } });
    const text = await upstream.text();

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=7200');
    res.setHeader('Content-Type', 'application/json');
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'Upstream unavailable' });
  }
};
