#!/usr/bin/env node
// Social preview image tests (D-213).
// Locally: generates the card in headless Chrome for today's content, for a changed headline and for a very long
// headline; checks each is a 1200×630 PNG, that the pictures differ, and that the long headline was shrunk to fit.
// With SITE_ORIGIN (the production check): the live page's og:image and twitter:image are the card, served as a
// 1200×630 PNG identical to the build's.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dims = png => [png.readUInt32BE(16), png.readUInt32BE(20)];
const isPng = png => png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };

const remote = process.env.SITE_ORIGIN?.replace(/\/$/, '');
if (remote) {
  await test('the live page shares the generated card as a 1200×630 PNG', async () => {
    const html = await (await fetch(`${remote}/`, { cache: 'no-store' })).text();
    const og = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
    const tw = /name="twitter:image" content="([^"]+)"/.exec(html)?.[1];
    assert.match(og ?? '', /^https:\/\/piersblinco\.com\/assets\/images\/social-card-[0-9a-f]{10}\.png$/);
    assert.equal(tw, og);
    const res = await fetch(og.replace('https://piersblinco.com', remote));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const png = Buffer.from(await res.arrayBuffer());
    assert.ok(isPng(png));
    assert.deepEqual(dims(png), [1200, 630]);
    assert.ok(png.equals(readFileSync(join(root, 'dist', new URL(og).pathname.slice(1)))), 'the live image is the one this build made');
  });
} else {
  const dir = join(root, '.audit/social-card');
  mkdirSync(dir, { recursive: true });
  const home = JSON.parse(readFileSync(join(root, 'content/home.json'), 'utf8'));
  const generate = (name, edit) => {
    const h = structuredClone(home);
    if (edit) edit(h.sections.find(s => s.type === 'hero'));
    const homeFile = join(dir, `${name}.json`), out = join(dir, `${name}.png`);
    writeFileSync(homeFile, JSON.stringify(h));
    const log = execFileSync('node', [join(root, 'scripts/social-card.mjs'), '--home', homeFile, '--out', out], { encoding: 'utf8' });
    return { png: readFileSync(out), size: Number(/headline (\d+)px/.exec(log)[1]) };
  };
  const today = generate('test-today');
  await test('the card is generated as a 1200×630 PNG', () => {
    assert.ok(isPng(today.png));
    assert.deepEqual(dims(today.png), [1200, 630]);
    assert.ok(today.png.length > 20000, 'not blank');
  });
  await test('the picture changes when the headline changes', () => {
    const other = generate('test-headline', h => { h.headline = 'Practical software,'; h.headlineBlue = 'delivered properly.'; });
    assert.deepEqual(dims(other.png), [1200, 630]);
    assert.ok(!other.png.equals(today.png));
  });
  await test('a long headline is shrunk to fit the card', () => {
    const long = generate('test-long', h => { h.headline = 'Senior technical expertise for growing businesses and the agencies that serve them,'; h.headlineBlue = 'without the overhead, the jargon or the surprises.'; });
    assert.ok(long.size < today.size && long.size >= 32, `headline ${long.size}px`);
  });
}
console.log(`${passed} social card tests passed`);
