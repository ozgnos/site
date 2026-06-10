// Listmonk subscribe proxy — runs as a Vercel Serverless Function at /api/subscribe
//
// Why this exists:
//   The plain HTML form POST navigated the visitor away to list.ozgnos.com.
//   This endpoint forwards the email to Listmonk's public JSON API server-side,
//   so the front-end can subscribe via fetch() and keep the visitor on the page.
//   (Also sidesteps CORS, since the browser only ever talks to ozgnos.com.)

const LISTMONK_URL = 'https://list.ozgnos.com/api/public/subscription';
const LIST_UUID = 'bfe81dc5-aca8-437e-a5c8-b7dc86e4d6cb';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = (req.body && req.body.email ? String(req.body.email) : '').trim();
  // minimal sanity check — Listmonk validates properly on its side
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  try {
    const upstream = await fetch(LISTMONK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, list_uuids: [LIST_UUID] }),
    });

    if (upstream.ok) {
      res.status(200).json({ ok: true });
    } else {
      const body = await upstream.text();
      // Listmonk returns 409-ish errors for already-subscribed; treat as success
      // so we don't leak which emails are on the list.
      if (upstream.status === 409 || /subscribed/i.test(body)) {
        res.status(200).json({ ok: true });
      } else {
        res.status(502).json({ error: 'Subscription failed' });
      }
    }
  } catch (e) {
    res.status(502).json({ error: 'Upstream unreachable' });
  }
};
