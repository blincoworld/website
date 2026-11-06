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

console.log(`${passed} worker tests passed`);
