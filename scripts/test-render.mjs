#!/usr/bin/env node
// Renderer tests (D-208): today's content renders today's page byte for byte, preview differs only by its markers,
// and the validator refuses unsafe or broken content. No network, no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CONTACT_NEEDS, renderSite, renderSocialCard, richTextError, sha256Hex, socialCard, stripPreviewMarkers, validateContent } from '../renderer/site.mjs';

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

/** The content without its contact form, so these tests add their own. */
const withoutContact = () => { const b = bundle(); b.pages.home.sections = b.pages.home.sections.filter(s => s.type !== 'contact'); delete b.site.turnstileSiteKey; return b; };
const contactSection = { id: 'contact', type: 'contact', eyebrow: 'Get in touch', heading: 'Tell me what you need', intro: ['I reply within <strong>one working day</strong>.'] };

test('the contact form section renders its fixed fields, links the privacy notice and carries the Turnstile key', () => {
  const b = withoutContact();
  b.site.turnstileSiteKey = '0x4AAAAAAAtestkey123';
  b.pages.home.sections.push(contactSection);
  assert.deepEqual(validateContent(b), { ok: true, errors: [] });
  const out = renderSite(b, { year: 2026 })['index.html'];
  assert.match(out, /<section class="contact-section wrap" id="contact" aria-labelledby="contact-heading">/);
  assert.match(out, /<form class="contact-form" id="contact-form" novalidate data-sitekey="0x4AAAAAAAtestkey123">/);
  for (const name of ['name', 'email', 'phone', 'business', 'need', 'message', 'website']) assert.match(out, new RegExp(`name="${name}"`), name);
  assert.deepEqual([...out.matchAll(/<option value="([a-z_]+)">/g)].map(m => m[1]), CONTACT_NEEDS.map(n => n[0]));
  assert.match(out, /See the <a href="\/privacy">privacy notice<\/a>/);
  assert.match(out, /<noscript>.*piers@piersblinco\.com.*<\/noscript>/s);
  // Stands alone, like the experience section: it ends the run of home sections before it.
  assert.match(out, /<\/section><\/div>\n    <section class="contact-section wrap"/);
  // Without a key the form renders with no data-sitekey (site.js then asks people to email).
  delete b.site.turnstileSiteKey;
  assert.doesNotMatch(renderSite(b, { year: 2026 })['index.html'], /data-sitekey/);
  // Preview marks its wording as editable and is otherwise the production page.
  const preview = renderSite(b, { year: 2026, preview: true, resolveAsset: p => `/api/site/asset${p}` })['index.html'];
  assert.match(preview, /data-cms-section="contact"/);
  assert.match(preview, /<cms-f data-cms="pages\.home\.sections\.4\.heading" data-kind="plain">Tell me what you need<\/cms-f>/);
});

test('the contact form section is checked: once only, wording required, a valid key', () => {
  const cases = [
    [b => { b.pages.home.sections.push(contactSection, { ...contactSection, id: 'contact-2' }); }, 'the contact form can appear once'],
    [b => { b.pages.home.sections.push({ ...contactSection, heading: '' }); }, 'heading is required'],
    [b => { b.pages.home.sections.push({ ...contactSection, intro: [] }); }, 'intro must have'],
    [b => { b.site.turnstileSiteKey = 'bad key!'; }, 'site.turnstileSiteKey']
  ];
  for (const [mutate, expected] of cases) {
    const b = withoutContact(); mutate(b);
    const r = validateContent(b);
    assert(r.errors.some(e => `${e.path} ${e.message}`.includes(expected)), `${expected}: ${JSON.stringify(r.errors)}`);
  }
});

test('the privacy notice renders from content/privacy.json, with the footer link on both pages', () => {
  const b = bundle();
  b.pages.privacy = JSON.parse(read('content/privacy.json'));
  assert.deepEqual(validateContent(b), { ok: true, errors: [] });
  const out = renderSite(b, { year: Number(/© (\d{4})/.exec(read('index.html'))[1]) });
  assert.equal(out['privacy.html'], read('privacy.html'));
  assert.match(out['privacy.html'], /<link rel="canonical" href="https:\/\/piersblinco\.com\/privacy">/);
  assert.match(out['privacy.html'], /<h1>Privacy notice<\/h1><p class="legal-updated">Last updated 6 November 2026<\/p>/);
  for (const html of [out['index.html'], out['privacy.html']]) assert.match(html, /<p class="footer-links"><a href="\/privacy">Privacy notice<\/a><\/p>/);
  // Not rendered in the editor preview, or without the page in the bundle.
  assert.equal(renderSite(b, { year: 2026, preview: true })['privacy.html'], undefined);
  assert.equal(renderSite(bundle(), { year: 2026 })['privacy.html'], undefined);
  for (const [mutate, expected] of [
    [p => { p.updated = 'yesterday'; }, 'pages.privacy.updated'],
    [p => { p.sections[0].paragraphs = ['<script>x</script>']; }, 'pages.privacy.sections.0.paragraphs.0'],
    [p => { p.sections.push({ heading: 'Empty' }); }, 'needs at least one paragraph'],
    [p => { p.path = '/privacy-policy'; }, 'pages.privacy.path']
  ]) {
    const c = bundle(); c.pages.privacy = JSON.parse(read('content/privacy.json')); mutate(c.pages.privacy);
    const r = validateContent(c);
    assert(r.errors.some(e => `${e.path} ${e.message}`.includes(expected)), `${expected}: ${JSON.stringify(r.errors)}`);
  }
});


// ---- Social preview image (D-213) ----
const hero = b => b.pages.home.sections.find(s => s.type === 'hero');
const metaOf = (html, key) => (new RegExp(`(?:property|name)="${key}" content="([^"]*)"`).exec(html) || [])[1];

test('og:image and twitter:image point at the generated card, with its size', () => {
  const b = bundle();
  const card = socialCard(b);
  assert.match(card.src, /^\/assets\/images\/social-card-[0-9a-f]{10}\.png$/);
  const html = renderSite(b, { year: 2026 })['index.html'];
  assert.equal(metaOf(html, 'og:image'), `https://piersblinco.com${card.src}`);
  assert.equal(metaOf(html, 'twitter:image'), `https://piersblinco.com${card.src}`);
  assert.equal(metaOf(html, 'og:image:width'), '1200');
  assert.equal(metaOf(html, 'og:image:height'), '630');
  assert.doesNotMatch(html, /social-preview/);
  assert.ok(JSON.parse(read('production-files.json')).includes(card.src.slice(1)), 'the allow-list carries the current card');
});

test('the card name changes when the headline, role, portrait or name changes, and only then', () => {
  const base = socialCard(bundle()).src;
  const changed = edit => { const b = bundle(); edit(b); return socialCard(b).src; };
  assert.notEqual(changed(b => { hero(b).headline = 'Practical software,'; }), base);
  assert.notEqual(changed(b => { hero(b).headlineBlue = 'delivered properly.'; }), base);
  assert.notEqual(changed(b => { hero(b).eyebrowRole = 'Software Consultant'; }), base);
  assert.notEqual(changed(b => { hero(b).portrait.src = '/assets/images/piers-portrait-0000000000.webp'; }), base);
  assert.notEqual(changed(b => { b.site.name = 'P Blinco'; }), base);
  // Nothing outside the card moves it, so a copy edit elsewhere doesn't invalidate shared previews.
  assert.equal(changed(b => { b.site.footerTagline = 'Something else.'; }), base);
  assert.equal(changed(b => { b.pages.home.seo.description = 'Other words.'; }), base);
  assert.equal(changed(b => { hero(b).intro = ['A different intro.']; }), base);
  assert.equal(socialCard(bundle()).src, base, 'the same content always gives the same name');
});

test('the card shows the name, role, headline (with {years}), portrait and domain, escaped', () => {
  const b = bundle();
  hero(b).headline = 'Over {years} years of <software>';
  const html = renderSocialCard(b);
  assert.match(html, /<p class="brand">Piers Blinco<span class="dot">\.<\/span><\/p>/);
  assert.match(html, /<p class="role">Independent Software Consultant<\/p>/);
  assert.match(html, /<h1>Over 25 years of &lt;software&gt; <span class="blue">without the agency overhead\.<\/span><\/h1>/);
  assert.match(html, /<img src="\/assets\/images\/piers-portrait-3b2768d94f\.webp" alt="">/);
  assert.match(html, /<div class="bar">piersblinco\.com<\/div>/);
  assert.match(html, /src: url\("\/assets\/fonts\/inter-variable-693b77d4f3\.woff2"\)/);
  const mapped = renderSocialCard(b, { resolveAsset: p => `/x${p}` });
  assert.match(mapped, /src="\/x\/assets\/images\/piers-portrait/);
  assert.match(mapped, /url\("\/x\/assets\/fonts\//);
});

test('the image description is automatic unless one is written', () => {
  const b = bundle();
  let html = renderSite(b, { year: 2026 })['index.html'];
  assert.equal(metaOf(html, 'og:image:alt'), 'Piers Blinco, Independent Software Consultant. “Senior technical expertise, without the agency overhead.” Portrait of Piers Blinco, with piersblinco.com.');
  assert.equal(metaOf(html, 'twitter:image:alt'), metaOf(html, 'og:image:alt'));
  b.pages.home.seo.socialImageAlt = 'My own words';
  html = renderSite(b, { year: 2026 })['index.html'];
  assert.equal(metaOf(html, 'og:image:alt'), 'My own words');
});

test('the legacy seo.socialImage field is accepted and ignored', () => {
  const b = bundle();
  b.pages.home.seo.socialImage = { src: '/assets/images/social-preview-3deead63c6.png', width: 1200, height: 630 };
  assert.ok(validateContent(b).ok);
  assert.equal(metaOf(renderSite(b, { year: 2026 })['index.html'], 'og:image'), `https://piersblinco.com${socialCard(bundle()).src}`);
});

test('sha256Hex matches SHA-256', () => {
  for (const s of ['', 'abc', 'Senior — expertise ’ é 😀', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), renderSocialCard(bundle())]) {
    assert.equal(sha256Hex(s), createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

console.log(`${passed} renderer tests passed`);
