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

//   3. Rate limit — at most RL_MAX submits per IP per minute. In-memory,
//      per warm function instance, so it's not a perfect guarantee (each
//      serverless instance has its own memory) — but it stops sustained
//      single-IP spam at zero cost and with zero dependencies. If real
//      abuse ever shows up, upgrade this to a shared store (e.g. Upstash).
const RL_WINDOW_MS = 60000; // 1 minute
const RL_MAX = 3;           // max submits per IP per window
const rlMap = new Map();

function rateLimited(ip) {
  const now = Date.now();
  if (rlMap.size > 5000) rlMap.clear(); // memory safety valve
  const rec = rlMap.get(ip);
  if (!rec || now - rec.start > RL_WINDOW_MS) {
    rlMap.set(ip, { start: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > RL_MAX;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    (String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests — please try again in a minute' });
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
      // Send the single welcome email via Listmonk's transactional API —
      // only for genuinely NEW subscribers (already-subscribed hits the 409
      // branch below and is skipped). Failure here must never break the
      // subscription itself.
      const user = process.env.LISTMONK_API_USER;
      const token = process.env.LISTMONK_API_TOKEN;
      const tplId = Number(process.env.LISTMONK_WELCOME_TEMPLATE_ID);
      if (user && token && Number.isFinite(tplId)) {
        try {
          await fetch('https://list.ozgnos.com/api/tx', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Basic ' + Buffer.from(user + ':' + token).toString('base64'),
            },
            body: JSON.stringify({
              subscriber_email: email,
              template_id: tplId,
              content_type: 'html',
            }),
          });
        } catch (e) { /* welcome email is best-effort */ }
      }
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
