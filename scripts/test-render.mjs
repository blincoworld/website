#!/usr/bin/env node
// Renderer tests (D-208): today's content renders today's page byte for byte, preview differs only by its markers,
// and the validator refuses unsafe or broken content. No network, no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSite, richTextError, stripPreviewMarkers, validateContent } from '../renderer/site.mjs';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(join(root, name), 'utf8');
const bundle = () => ({ site: JSON.parse(read('content/site.json')), pages: { home: JSON.parse(read('content/home.json')) } });
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };


test('current content renders index.html and brands.json byte for byte', () => {
  const out = renderSite(bundle(), { year: Number(/© (\d{4})/.exec(read('index.html'))[1]) });
  assert.equal(out['index.html'], read('index.html'));
  assert.equal(out['brands.json'], read('brands.json'));
});

test('the copyright year comes from the build', () => {
  const out = renderSite(bundle(), { year: 2031 })['index.html'];
  assert.match(out, /© 2031 Piers Blinco/);
  assert.throws(() => renderSite(bundle(), {}), /year/);
});

test('one experience value feeds the counter, heading, meta and social descriptions', () => {
  const b = bundle();
  b.site.experienceYears = 26;
  const out = renderSite(b, { year: 2026 })['index.html'];
  assert.match(out, /experience-number">26<span/);
  assert.match(out, /I’ve spent over 26 years building software/);
  assert.equal((out.match(/Over 26 years of professional development experience\./g) || []).length, 2);
  assert.doesNotMatch(out, /\b25\b/);
});

test('preview output equals production once the editor markers are removed', () => {
  const b = bundle();
  b.pages.home.sections.splice(2, 0, { id: 'extra', type: 'content', blocks: [
    { id: 'h1', type: 'heading', eyebrow: 'Note', text: 'A new {years}-year heading' },
    { id: 'c1', type: 'copy', paragraphs: ['One <strong>bold</strong> and <em>italic</em>.', 'Two with <a href="https://example.com/?a=1&amp;b=2">a link</a>.'] },
    { id: 'i1', type: 'image', src: '/assets/images/example-0123456789.webp', alt: 'An example', width: 1200, height: 800, caption: 'A caption' }
  ] });
  const prod = renderSite(b, { year: 2026 })['index.html'];
  const preview = renderSite(b, { year: 2026, preview: true, resolveAsset: p => `/api/site/asset${p}` })['index.html'];
  assert.match(preview, /<cms-f data-cms="pages\.home\.sections\.0\.headline" data-kind="plain">/);
  assert.match(preview, /data-cms-block="c1"/);
  assert.doesNotMatch(preview, /site\.js/);
  const unmapped = stripPreviewMarkers(preview).replaceAll('/api/site/asset/', '/')
    .replace('<link rel="stylesheet" href="/styles.css">', '<link rel="stylesheet" href="/styles.css"><script type="module" src="/site.js"></script>');
  assert.equal(unmapped, prod);
});

test('new blocks render with the site’s own classes', () => {
  const b = bundle();
  b.pages.home.sections.push({ id: 'more', type: 'content', blocks: [{ id: 'x', type: 'copy', paragraphs: ['Hello'] }] });
  const out = renderSite(b, { year: 2026 })['index.html'];
  assert.match(out, /<div class="wrap home-sections"><section class="home-section expertise-section">.*<section class="home-section content-section"><div class="prose"><p>Hello<\/p>\n<\/div><\/section><\/div>/s);
  // A content section between hero and experience gets its own wrapper.
  b.pages.home.sections.splice(1, 0, { id: 'early', type: 'content', blocks: [{ id: 'y', type: 'heading', text: 'Early' }] });
  const out2 = renderSite(b, { year: 2026 })['index.html'];
  assert.match(out2, /<\/section>\n    <div class="wrap home-sections"><section class="home-section content-section"><div class="section-heading"><h2>Early<\/h2><\/div><\/section><\/div>\n    <section class="experience-section/);
});

test('rich text allows bold, italic, links and line breaks only', () => {
  for (const ok of ['plain', 'a &amp; b', '<strong>x</strong> <em>y</em>', 'a<br>b', '<a href="/x">x</a>', '<a href="mailto:a@b.c">m</a>', '<a href="#experience">e</a>', 'it’s &nbsp; fine'])
    assert.equal(richTextError(ok), null, ok);
  for (const bad of ['<script>x</script>', '<a href="javascript:alert(1)">x</a>', '<a href="//evil.com">x</a>', '<a href="/x" onclick="y">x</a>', '<strong>x', '<em><strong>x</em></strong>', 'a & b', '<img src=x>', '<a href="/a"><a href="/b">x</a></a>', '<STRONG>x</STRONG>', 'x < y', '<p>x</p>'])
    assert.notEqual(richTextError(bad), null, bad);
});

test('the validator refuses broken content', () => {
  const cases = [
    [b => { delete b.pages.home.sections[0].portrait.alt; }, 'sections.0.portrait.alt'],
    [b => { b.site.experienceYears = 'lots'; }, 'site.experienceYears'],
    [b => { b.site.logos[1].src = b.site.logos[0].src; }, 'site.logos.1.src'],
    [b => { b.site.logos[0].src = 'https://evil.example/x.webp'; }, 'site.logos.0.src'],
    [b => { b.pages.home.sections.reverse(); }, 'the hero must be the first section'],
    [b => { b.pages.home.sections.push({ id: 'img', type: 'content', blocks: [{ id: 'i', type: 'image', src: '/assets/images/a-1.webp', alt: '', width: 10, height: 10 }] }); }, 'blocks.0.alt'],
    [b => { b.pages.home.sections.push({ id: 'hero', type: 'content', blocks: [{ id: 'z', type: 'heading', text: 'x' }] }); }, 'is used twice'],
    [b => { b.pages.home.sections[1].heading = 'two\nlines'; }, 'sections.1.heading'],
    [b => { b.pages.home.sections.splice(1, 1); }, 'exactly one experience section'],
    [b => { b.pages.home.seo.title = ''; }, 'seo.title']
  ];
  for (const [mutate, expected] of cases) {
    const b = bundle(); mutate(b);
    const r = validateContent(b);
    assert.equal(r.ok, false, expected);
    assert(r.errors.some(e => `${e.path} ${e.message}`.includes(expected)), `${expected}: ${JSON.stringify(r.errors)}`);
  }
  assert.deepEqual(validateContent(bundle()), { ok: true, errors: [] });
  // Optional fields may be left out altogether.
  const b = bundle();
  b.pages.home.sections.push({ id: 'opt', type: 'content', blocks: [{ id: 'h', type: 'heading', text: 'No eyebrow' }, { id: 'i', type: 'image', src: '/assets/images/a-0123456789.webp', alt: 'A', width: 10, height: 10 }] });
  delete b.pages.home.seo.socialDescription;
  assert.deepEqual(validateContent(b), { ok: true, errors: [] });
});

console.log(`${passed} renderer tests passed`);
