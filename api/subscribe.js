// Listmonk subscribe proxy — runs as a Vercel Serverless Function at /api/subscribe
//
// Why this exists:
//   The plain HTML form POST navigated the visitor away to list.ozgnos.com.
//   This endpoint forwards the email to Listmonk's public JSON API server-side,
//   so the front-end can subscribe via fetch() and keep the visitor on the page.
//   (Also sidesteps CORS, since the browser only ever talks to ozgnos.com.)
//
// Bot protection (important: the list is single opt-in, so junk goes straight in):
//   1. Honeypot — the form has a hidden "website" field humans never see.
//      If it's filled, it was a bot. We discard silently but answer 200 ok,
//      so the bot believes it succeeded and doesn't adapt.
//   2. Time gate — the form embeds a timestamp ("ts") when the page loads.
//      A submit faster than MIN_FILL_MS after page load is not a human typing
//      an email. Missing/garbage ts is also rejected: every legitimate submit
//      comes from our own JS, which always sends it.

const LISTMONK_URL = 'https://list.ozgnos.com/api/public/subscription';
const LIST_UUID = 'bfe81dc5-aca8-437e-a5c8-b7dc86e4d6cb';
const MIN_FILL_MS = 2000;          // humans need at least ~2s to type an email
const MAX_FORM_AGE_MS = 86400000;  // ts older than 24h is stale/replayed

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const email = (body.email ? String(body.email) : '').trim();
  const honeypot = (body.website ? String(body.website) : '').trim();
  const ts = Number(body.ts);

  // minimal sanity check — Listmonk validates properly on its side
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  // Bot checks — discard silently with a success response.
  const elapsed = Date.now() - ts;
  const isBot =
    honeypot !== '' ||
    !Number.isFinite(ts) ||
    elapsed < MIN_FILL_MS ||
    elapsed > MAX_FORM_AGE_MS;
  if (isBot) {
    res.status(200).json({ ok: true });
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
