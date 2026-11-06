#!/usr/bin/env node
// Generates index.html, brands.json and privacy.html from content/*.json with renderer/site.mjs (D-208, D-211).
// Run by scripts/build.py. Fails, writing nothing, if the content doesn't validate.
//   node scripts/render.mjs            write index.html, brands.json and privacy.html
//   node scripts/render.mjs --check    exit 1 if the committed files differ from a fresh render (same year)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSite, siteYear, validateContent } from '../renderer/site.mjs';

const root = resolve(import.meta.dirname, '..');
const read = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
const bundle = { site: read('content/site.json'), pages: { home: read('content/home.json'), privacy: read('content/privacy.json') } };
const result = validateContent(bundle);
if (!result.ok) {
  for (const e of result.errors) console.error(`::error title=Content invalid::${e.path} ${e.message}`);
  process.exit(1);
}
const year = process.env.SITE_YEAR ? Number(process.env.SITE_YEAR) : siteYear();
const files = renderSite(bundle, { year });
if (process.argv.includes('--check')) {
  const stale = Object.keys(files).filter(name => readFileSync(join(root, name), 'utf8') !== files[name]);
  if (stale.length) {
    console.error(`::error title=Generated files out of date::${stale.join(', ')} differ from a fresh render of content/ (year ${year})`);
    process.exit(1);
  }
  console.log(`Render check: ${Object.keys(files).join(', ')} match content/ (year ${year})`);
} else {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  console.log(`Rendered ${Object.keys(files).join(', ')} from content/ (year ${year})`);
}
