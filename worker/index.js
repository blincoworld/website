// piersblinco.com's only server code (D-209 in the Back Office's DECISIONS.md). Everything else is static files.
//
// It runs for /api/* only (wrangler.jsonc: assets.run_worker_first), so the pages, styles, images and site.js are served
// straight from the static assets and never depend on it. It forwards two things to the Back Office
// (website-refresh-outreach) through a service binding to that Worker's SiteIngest entrypoint, which has no public URL:
//   POST /api/v        one visit ping per page load (always answered 204, at once; the forward happens afterwards)
//   POST /api/enquiry  the contact form (JSON in, JSON out)
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
