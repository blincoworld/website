// piersblinco.com's only server code (D-209 in the Back Office's DECISIONS.md). Everything else is static files.
//
// It runs for /api/* and /assessment only (wrangler.jsonc: assets.run_worker_first), so the pages, styles, images and
// site.js are served straight from the static assets and never depend on it. It forwards two things to the Back Office
// (website-refresh-outreach) through a service binding to that Worker's SiteIngest entrypoint, which has no public URL:
//   POST /api/v        one visit ping per page load (always answered 204, at once; the forward happens afterwards)
//   POST /api/enquiry  the contact form (JSON in, JSON out)
//   GET  /assessment, POST /api/public/assessment  the pre-call assessment form and its submissions (D-238, below)
// If the Back Office is down or erroring, pings are dropped silently and the form gets {"ok":false,"error":"unavailable"},
// which site.js turns into "please email me instead". Nothing here can stop the site loading.

const ROUTES = { '/api/v': '/visit', '/api/enquiry': '/enquiry' };
const MAX_BODY = 16 * 1024;
const TIMEOUT_MS = 10_000;
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json', ...extra } });
const noContent = () => new Response(null, { status: 204, headers: HEADERS });

/** The request the Back Office receives: the body as sent, plus the visitor's IP address and the page's origin. */
function forward(env, target, request, body) {
  return env.BACK_OFFICE.fetch(new Request(`https://back-office.internal${target}`, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('User-Agent') || '',
      'x-pb-client-ip': request.headers.get('CF-Connecting-IP') || '',
      'x-pb-origin': request.headers.get('Origin') || ''
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }));
}

// The pre-call assessment (D-238): the form and its submissions live in the Back Office (its D-237); this is their public
// address. GET /assessment (with ?sector= and ?ref=) and POST /api/public/assessment are forwarded through the same
// service binding, with the visitor's IP address from Cloudflare's CF-Connecting-IP (a visitor can't set it). The Back
// Office's own security headers on the page (its CSP with a per-page script nonce) are passed through unchanged.
const ASSESSMENT_PAGE = '/assessment';
const ASSESSMENT_SUBMIT = '/api/public/assessment';
const ASSESSMENT_MAX_BODY = 64 * 1024;
const PASS_HEADERS = ['Content-Type', 'Content-Security-Policy', 'Cache-Control', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options'];
const UNAVAILABLE_PAGE = '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Tell Me About Your Business</title></head>'
  + '<body style="font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 16px"><h1>Tell Me About Your Business</h1>'
  + '<p>Sorry, the form isn’t available right now. Please try again in a few minutes, or email <a href="mailto:piers@piersblinco.com">piers@piersblinco.com</a>.</p></body></html>';
const PAGE_HEADERS = { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" };
const page = (status, html, extra = {}) => new Response(html, { status, headers: { ...PAGE_HEADERS, ...extra } });

function passThrough(res, head) {
  const headers = new Headers();
  for (const k of PASS_HEADERS) { const v = res.headers.get(k); if (v) headers.set(k, v); }
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  if (head) { res.body?.cancel(); return new Response(null, { status: res.status, headers }); }
  return new Response(res.body, { status: res.status, headers });
}

async function assessment(request, env, url) {
  const backOffice = (path, init) => env.BACK_OFFICE.fetch(new Request(`https://back-office.internal${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }));
  const visitor = { 'x-pb-client-ip': request.headers.get('CF-Connecting-IP') || '', 'User-Agent': request.headers.get('User-Agent') || '' };
  if (url.pathname === ASSESSMENT_PAGE) {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) return page(405, UNAVAILABLE_PAGE, { Allow: 'GET, HEAD' });
    try {
      const res = await backOffice(`/assessment${url.search}`, { method: 'GET', headers: visitor });
      if (res.status !== 200) { res.body?.cancel(); throw new Error(`Back Office answered ${res.status}`); }
      return passThrough(res, head);
    } catch {
      return page(503, head ? null : UNAVAILABLE_PAGE);
    }
  }
  // The submission: JSON from the form's script, or the form posted normally when scripts don't run.
  const type = request.headers.get('Content-Type') || '';
  const isJson = type.startsWith('application/json');
  const refuse = (status, error, message) => (isJson ? json(status, { ok: false, error, fields: {} }) : page(status, UNAVAILABLE_PAGE.replace(/<p>.*<\/p>/, `<p>${message}</p>`)));
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' });
  if (!isJson && !type.startsWith('application/x-www-form-urlencoded')) return refuse(415, 'invalid', 'This form couldn’t be read. Please go back and try again.');
  if (request.headers.get('Origin') !== url.origin) return refuse(403, 'verification_failed', 'This form can only be sent from its own page.');
  if (Number(request.headers.get('Content-Length') || 0) > ASSESSMENT_MAX_BODY) return refuse(413, 'invalid', 'Your answers are too long. Please shorten them.');
  let body;
  try { body = await request.text(); } catch { return refuse(400, 'invalid', 'This form couldn’t be read. Please go back and try again.'); }
  if (body.length > ASSESSMENT_MAX_BODY) return refuse(413, 'invalid', 'Your answers are too long. Please shorten them.');
  try {
    const res = await backOffice('/assessment/submit', { method: 'POST', body, headers: { ...visitor, 'Content-Type': type, 'x-pb-origin': request.headers.get('Origin') || '' } });
    if (res.status >= 500) { res.body?.cancel(); throw new Error(`Back Office answered ${res.status}`); }
    return passThrough(res, false);
  } catch {
    return isJson ? json(503, { ok: false, error: 'unavailable' }) : page(503, UNAVAILABLE_PAGE);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === ASSESSMENT_PAGE || url.pathname === ASSESSMENT_SUBMIT) return assessment(request, env, url);
    const target = ROUTES[url.pathname];
    // Any other /api/* path (and anything else that reaches here): whatever the static assets say, i.e. 404.
    if (!target) return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' });
    const visit = target === '/visit';
    // Only from the site's own pages: browsers send Origin on every POST.
    if (request.headers.get('Origin') !== url.origin) return visit ? noContent() : json(403, { ok: false, error: 'verification_failed' });
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return visit ? noContent() : json(413, { ok: false, error: 'invalid', fields: {} });
    let body;
    try { body = await request.text(); } catch { return visit ? noContent() : json(400, { ok: false, error: 'invalid', fields: {} }); }
    if (body.length > MAX_BODY) return visit ? noContent() : json(413, { ok: false, error: 'invalid', fields: {} });

    if (visit) {
      // Answer at once; the count is recorded after the response, and a failure is dropped silently.
      ctx.waitUntil(Promise.resolve().then(() => forward(env, target, request, body)).then(r => r.body?.cancel()).catch(() => {}));
      return noContent();
    }
    try {
      const res = await forward(env, target, request, body);
      const type = res.headers.get('Content-Type') || '';
      if (res.status >= 500 || !type.startsWith('application/json')) throw new Error(`Back Office answered ${res.status}`);
      return new Response(res.body, { status: res.status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
    } catch {
      return json(503, { ok: false, error: 'unavailable' });
    }
  }
};
