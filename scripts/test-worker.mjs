#!/usr/bin/env node
// Tests for worker/index.js (D-209): what the site's Worker forwards to the Back Office, and that the site's answers
// stay sensible when the Back Office is down or erroring. No network.
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const SITE = 'https://piersblinco.com';
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };
const waits = [];
const ctx = { waitUntil: p => waits.push(p) };
const settle = () => Promise.all(waits.splice(0));
const assets = { fetch: async () => new Response('Not found', { status: 404 }) };
const post = (path, body, headers = {}) => new Request(`${SITE}${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', Origin: SITE, 'CF-Connecting-IP': '203.0.113.5', 'User-Agent': 'Mozilla/5.0 (X11) Test', ...headers } });
/** A Back Office stand-in that records what it received and answers with a fresh `answer()` each time. */
const backOffice = answer => {
  const seen = [];
  return { seen, fetch: async req => { seen.push({ url: req.url, headers: Object.fromEntries(req.headers), body: await req.text() }); return answer(); } };
};

await test('forwards a visit ping with the visitor’s IP address and the page’s origin, answering 204 at once', async () => {
  const bo = backOffice(() => new Response(null, { status: 204 }));
  const res = await worker.fetch(post('/api/v', { p: '/' }), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
  assert.equal(res.status, 204);
  await settle();
  assert.equal(bo.seen.length, 1);
  assert.equal(bo.seen[0].url, 'https://back-office.internal/visit');
  assert.equal(bo.seen[0].headers['x-pb-client-ip'], '203.0.113.5');
  assert.equal(bo.seen[0].headers['x-pb-origin'], SITE);
  assert.equal(bo.seen[0].headers['user-agent'], 'Mozilla/5.0 (X11) Test');
  assert.equal(bo.seen[0].body, '{"p":"/"}');
});

await test('a visit ping is dropped silently when the Back Office is down or erroring', async () => {
  for (const env of [{ ASSETS: assets, BACK_OFFICE: { fetch: async () => { throw new Error('down'); } } }, { ASSETS: assets, BACK_OFFICE: backOffice(() => new Response('x', { status: 500 })) }, { ASSETS: assets }]) {
    const res = await worker.fetch(post('/api/v', { p: '/' }), env, ctx);
    assert.equal(res.status, 204);
    await settle();
  }
});

await test('passes the Back Office’s answer to the form through', async () => {
  for (const [status, body] of [[200, { ok: true }], [400, { ok: false, error: 'invalid', fields: { email: 'x' } }], [403, { ok: false, error: 'verification_failed' }], [429, { ok: false, error: 'rate_limited' }]]) {
    const bo = backOffice(() => Response.json(body, { status }));
    const res = await worker.fetch(post('/api/enquiry', { name: 'A' }), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), body);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(bo.seen[0].url, 'https://back-office.internal/enquiry');
  }
});

await test('the form gets "unavailable" when the Back Office is down, erroring or answers oddly', async () => {
  const cases = [
    { fetch: async () => { throw new Error('down'); } },
    backOffice(() => new Response('Internal error', { status: 500 })),
    backOffice(() => Response.json({ ok: false }, { status: 503 })),
    backOffice(() => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })),
    undefined
  ];
  for (const bo of cases) {
    const res = await worker.fetch(post('/api/enquiry', { name: 'A' }), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, error: 'unavailable' });
  }
});

await test('only POSTs from the site’s own pages are forwarded; other paths are the static 404', async () => {
  const bo = backOffice(() => Response.json({ ok: true }));
  const env = { ASSETS: assets, BACK_OFFICE: bo };
  assert.equal((await worker.fetch(post('/api/enquiry', {}, { Origin: 'https://evil.example' }), env, ctx)).status, 403);
  assert.equal((await worker.fetch(post('/api/v', {}, { Origin: 'https://evil.example' }), env, ctx)).status, 204);
  const noOrigin = new Request(`${SITE}/api/enquiry`, { method: 'POST', body: '{}' });
  assert.equal((await worker.fetch(noOrigin, env, ctx)).status, 403);
  const get = await worker.fetch(new Request(`${SITE}/api/enquiry`), env, ctx);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('Allow'), 'POST');
  assert.equal((await worker.fetch(post('/api/enquiry', 'x'.repeat(17 * 1024)), env, ctx)).status, 413);
  for (const path of ['/api/pages/home', '/api/enquiries/agency', '/missing']) assert.equal((await worker.fetch(new Request(`${SITE}${path}`), env, ctx)).status, 404, path);
  await settle();
  assert.equal(bo.seen.length, 0);
});

// D-238: the pre-call assessment at piersblinco.com/assessment, served by the Back Office through the binding.
const ASSESSMENT_HTML = '<!doctype html><title>Tell Me About Your Business</title>';
const ASSESSMENT_CSP = "default-src 'self'; script-src 'nonce-abc'";

await test('GET /assessment is the Back Office’s form, with ?sector= and ?ref= passed on and its own security headers', async () => {
  const bo = backOffice(() => new Response(ASSESSMENT_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': ASSESSMENT_CSP, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Set-Cookie': 'x=1' } }));
  const res = await worker.fetch(new Request(`${SITE}/assessment?sector=garage&ref=p_1`, { headers: { 'CF-Connecting-IP': '203.0.113.9' } }), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), ASSESSMENT_HTML);
  assert.equal(res.headers.get('Content-Security-Policy'), ASSESSMENT_CSP);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('Set-Cookie'), null);
  assert.equal(bo.seen[0].url, 'https://back-office.internal/assessment?sector=garage&ref=p_1');
  assert.equal(bo.seen[0].headers['x-pb-client-ip'], '203.0.113.9');
  const head = await worker.fetch(new Request(`${SITE}/assessment`, { method: 'HEAD' }), { ASSETS: assets, BACK_OFFICE: backOffice(() => new Response(ASSESSMENT_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } })) }, ctx);
  assert.equal(head.status, 200);
  assert.equal((await worker.fetch(new Request(`${SITE}/assessment`, { method: 'POST', body: 'x' }), { ASSETS: assets, BACK_OFFICE: bo }, ctx)).status, 405);
});

await test('GET /assessment says "email me" when the Back Office is down or erroring', async () => {
  for (const bo of [{ fetch: async () => { throw new Error('down'); } }, backOffice(() => new Response('x', { status: 500 })), backOffice(() => new Response('x', { status: 404 })), undefined]) {
    const res = await worker.fetch(new Request(`${SITE}/assessment`), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
    assert.equal(res.status, 503);
    assert.match(await res.text(), /piers@piersblinco\.com/);
  }
});

await test('POST /api/public/assessment is forwarded with the visitor’s IP (from Cloudflare, not the request) and the page’s origin', async () => {
  for (const [status, body] of [[200, { ok: true }], [400, { ok: false, error: 'invalid', fields: { email: 'x' } }], [429, { ok: false, error: 'rate_limited' }]]) {
    const bo = backOffice(() => Response.json(body, { status }));
    const res = await worker.fetch(post('/api/public/assessment', { email: 'a@b.c' }, { 'x-pb-client-ip': '10.9.9.9' }), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), body);
    assert.equal(bo.seen[0].url, 'https://back-office.internal/assessment/submit');
    assert.equal(bo.seen[0].headers['x-pb-client-ip'], '203.0.113.5');
    assert.equal(bo.seen[0].headers['x-pb-origin'], SITE);
    assert.equal(bo.seen[0].headers['content-type'], 'application/json');
    assert.equal(bo.seen[0].body, '{"email":"a@b.c"}');
  }
  // The form posted normally (no script): a page comes back.
  const bo = backOffice(() => new Response('<p>Thanks!</p>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  const res = await worker.fetch(post('/api/public/assessment', 'email=a%40b.c&services=website', { 'Content-Type': 'application/x-www-form-urlencoded' }), { ASSETS: assets, BACK_OFFICE: bo }, ctx);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<p>Thanks!</p>');
  assert.equal(bo.seen[0].headers['content-type'], 'application/x-www-form-urlencoded');
});

await test('POST /api/public/assessment: only from the site’s pages, size-limited, and "unavailable" when the Back Office fails', async () => {
  const bo = backOffice(() => Response.json({ ok: true }));
  const env = { ASSETS: assets, BACK_OFFICE: bo };
  assert.equal((await worker.fetch(post('/api/public/assessment', {}, { Origin: 'https://evil.example' }), env, ctx)).status, 403);
  assert.equal((await worker.fetch(post('/api/public/assessment', 'x', { 'Content-Type': 'text/plain' }), env, ctx)).status, 415);
  assert.equal((await worker.fetch(post('/api/public/assessment', 'x'.repeat(65 * 1024)), env, ctx)).status, 413);
  assert.equal((await worker.fetch(new Request(`${SITE}/api/public/assessment`), env, ctx)).status, 405);
  assert.equal(bo.seen.length, 0);
  for (const failing of [{ fetch: async () => { throw new Error('down'); } }, backOffice(() => new Response('x', { status: 500 }))]) {
    const res = await worker.fetch(post('/api/public/assessment', {}), { ASSETS: assets, BACK_OFFICE: failing }, ctx);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, error: 'unavailable' });
  }
  // Nothing else changes: other paths are still the static files' answer.
  for (const path of ['/assessment/', '/assessment.html', '/api/public/other']) assert.equal((await worker.fetch(new Request(`${SITE}${path}`), env, ctx)).status, 404, path);
});

console.log(`${passed} worker tests passed`);
