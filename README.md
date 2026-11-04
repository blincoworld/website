# Piers Blinco — static portfolio

A single interim portfolio homepage. Edit `index.html` directly: it is the
content source, with no template renderer, CMS, database, SMTP or API requirement.
The counter, experience heading, description and Open Graph description use
**25 years**. This local version has not been deployed to production.

The page retains the existing consultancy visual identity, introduction, portrait,
professional experience, all 33 rotating company logos, What I do, How I work and
footer branding. There are no sales/contact CTAs, forms or extra pages. The only
button pauses/resumes the logos; the native organisation directory works without
JavaScript. Rotation respects reduced motion and page visibility.

## Build and check

Requires Python 3 and Node.js 22+. Browser checks use installed Google Chrome
(or `CHROME_BIN`). No package installation or credentials are needed.

```sh
python3 scripts/build.py
python3 scripts/check.py
node --check site.js
node scripts/check-browser.mjs
```

The build copies only the explicit `production-files.json` allowlist to `dist/`.
It excludes Git, local state, documentation, scripts, tests and screenshots.
The build has no network activity or code-generation step.

To preview with a normal static file server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8080/. All fonts, images, JavaScript and CSS are local.
`site.js` fetches only the local `brands.json` asset. `_headers` preserves the
existing security policy on a compatible static host; Python's basic preview
server does not interpret that hosting configuration file. Browser tests apply
that policy using a local file-only server.

## Files

```text
index.html                    Homepage and SEO metadata
styles.css                    Homepage styles and responsive/focus/motion states
site.js                       Logo rotation and pause/resume only
brands.json                   All 33 organisation names and image paths
assets/brands/                33 logo WebPs, including logos loaded indirectly
assets/fonts/                 Local Inter font and OFL licence
assets/images/                Portrait, social preview, branded icons
favicon.ico                   Root favicon fallback
robots.txt                    Preserved crawler directives and sitemap location
sitemap.xml                   Homepage only
_headers                      Static hosting security headers
production-files.json         Explicit production file allowlist
scripts/build.py              Static build
scripts/check.py              Content, SEO, links, assets and bundle checks
scripts/browser.mjs           Local file server and Chrome test helpers
scripts/check-browser.mjs     Responsive and interaction checks
STATIC-MIGRATION.md            Hosting audit, cleanup and migration plan
```

`dist/`, `.audit/` and other local state are ignored by Git. Screenshot and browser
reports are written to `.audit/static-portfolio/`. A fresh clone runs all static
and interaction checks; the one-time comparison against the pre-trim stylesheet
also runs when those ignored reference files are present.

The live domain still uses the existing `website-cms` Worker. No CMS source or
production infrastructure was changed for this static preparation. See
[STATIC-MIGRATION.md](STATIC-MIGRATION.md) before any deployment or domain cutover.
