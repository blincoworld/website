#!/usr/bin/env node
// Generates the social preview image (D-213 in the Back Office's DECISIONS.md) from content/ on every build.
// The renderer gives the card's HTML and its content-hashed path; this opens the card in headless Chrome, fits the
// headline and saves a 1200×630 PNG at that path (assets/images/social-card-<hash>.png, gitignored). Old cards are
// removed. Run by scripts/build.py after render.mjs; CHROME_BIN picks the browser (default /usr/bin/google-chrome).
//   node scripts/social-card.mjs                 generate the card for content/
//   node scripts/social-card.mjs --out <file>    write the PNG elsewhere instead (tests), with --home <home.json>
import { createServer } from 'node:http';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fitSocialCard, renderSocialCard, socialCard, SOCIAL_CARD, validateContent } from '../renderer/site.mjs';
import { browser } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const read = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const bundle = { site: read('content/site.json'), pages: { home: read(arg('--home') || 'content/home.json') } };
const result = validateContent(bundle);
if (!result.ok) {
  for (const e of result.errors) console.error(`::error title=Content invalid::${e.path} ${e.message}`);
  process.exit(1);
}

const card = socialCard(bundle);
const out = arg('--out') ? resolve(arg('--out')) : join(root, card.src.slice(1));
// A one-page local server: the card at / and the two files it uses (the font and the portrait), nothing else.
const html = renderSocialCard(bundle);
const hero = bundle.pages.home.sections.find(s => s.type === 'hero');
const assets = new Map([[html.match(/url\("([^"]+)"\)/)[1], 'font/woff2'], ...(hero ? [[hero.portrait.src, hero.portrait.src.endsWith('.png') ? 'image/png' : 'image/webp']] : [])]);
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
  if (!assets.has(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': assets.get(path) }); res.end(readFileSync(join(root, path.slice(1))));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const chrome = await browser(join(root, '.audit/social-card'));
try {
  const { send, evaluate, waitFor } = chrome;
  await send('Emulation.setDeviceMetricsOverride', { width: SOCIAL_CARD.width, height: SOCIAL_CARD.height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await waitFor('document.readyState === "complete" && [...document.images].every(i => i.complete)');
  await evaluate('document.fonts.ready.then(() => true)');
  if (!await evaluate('document.fonts.check("800 68px Inter")')) throw new Error('The Inter font did not load for the social card');
  if (!await evaluate('[...document.images].every(i => i.naturalWidth > 0)')) throw new Error('The portrait did not load for the social card');
  const size = await evaluate(`(${fitSocialCard.toString()})(document)`);
  const png = Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: SOCIAL_CARD.width, height: SOCIAL_CARD.height, scale: 1 } })).data, 'base64');
  if (png.readUInt32BE(16) !== SOCIAL_CARD.width || png.readUInt32BE(20) !== SOCIAL_CARD.height) throw new Error('The social card is the wrong size');
  if (chrome.exceptions.length || chrome.badResponses.length) throw new Error(`The social card had errors: ${JSON.stringify([chrome.exceptions, chrome.badResponses])}`);
  if (!arg('--out')) {
    // Only the current card is kept, so the build's allow-list check sees exactly one.
    const dir = join(root, 'assets/images');
    for (const f of readdirSync(dir)) if (/^social-card-[0-9a-f]{10}\.png$/.test(f) && join(dir, f) !== out) rmSync(join(dir, f));
  }
  writeFileSync(out, png);
  console.log(`Social card: ${arg('--out') ? out : card.src} (${png.length.toLocaleString('en-GB')} bytes, headline ${size}px)`);
} finally {
  chrome.close();
  server.close(); server.closeAllConnections();
}
