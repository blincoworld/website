# Piers Blinco — static portfolio

https://piersblinco.com is served directly by **Cloudflare Workers Static Assets**
from this repository. The Worker is **`piers-portfolio-static`**, with no CMS code,
D1, R2, SMTP or backend API binding. `index.html` is the content source; the build
copies only the production allowlist to `dist/`.

Current production version: `cfb7b262-8e10-4a7d-97f2-b057e8ac7cc2`.
The public inspection URL is
https://piers-portfolio-static.pbwebonlinesales.workers.dev — it now mirrors the
same production version and is not an isolated staging environment.

The counter, experience heading, description and Open Graph description use
**25 years**. The page retains its existing visual identity, introduction,
portrait, professional experience, 33 rotating company logos, What I do, How I
work and footer branding. There are no sales/contact CTAs, forms or extra pages.
The pause/resume button is a functional logo control; the organisation directory
also works without JavaScript. Rotation respects reduced motion and visibility.

## Build and check

Python 3 and Node.js 22+ are required. Browser tests use installed Google Chrome
(or `CHROME_BIN`). Wrangler is pinned in `package-lock.json`; no credentials are
needed for the local build and tests.

```sh
npm ci
npm run build
npm run check
npm test
```

Deployed checks issue only GET requests and do not send enquiries or emails:

```sh
npm run check:deployment -- https://piersblinco.com --label production
SITE_ORIGIN=https://piersblinco.com SITE_LABEL=production npm test
```

Replace the origin and label with the `workers.dev` URL and `preview` to check the
public mirror. `SITE_ORIGIN` uses the same browser tests as the local file server.

For a plain local preview:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

All fonts, images, scripts and CSS are local. JavaScript fetches only the local
`brands.json` asset. `_headers` defines the security policy and preserves the
previous cache policy: mutable HTML/CSS/JS/metadata use `no-store`, hashed assets
use one-year immutable caching, and the root favicon uses one-day caching.
Python's basic preview server does not interpret `_headers`; the automated local
browser server applies the security policy.

## Production configuration and updates

`wrangler.jsonc` names only the new static Worker and the apex custom domain.
It has no `main` script or backend bindings. Unknown paths return 404, without an
SPA fallback. `production-files.json` prevents Git data, docs, test scripts,
credentials and local state from entering `dist/`.

For future code/assets updates, use the pinned CLI and the existing private
operator authentication workflow. Build/check first, then upload a version:

```sh
npx wrangler versions upload --name piers-portfolio-static --strict --message "Describe the reviewed change"
```

Check the returned version and confirm there are no backend bindings. Promotion
is a separate production action:

```sh
npx wrangler versions deploy REVIEWED_VERSION_ID@100 --name piers-portfolio-static
```

Version-specific preview URLs are currently disabled. Use a separately approved
staging/version-preview setup if a future candidate needs remote testing before
promotion; the existing `workers.dev` mirror alone does not isolate a deployment.
## Rollback

Rollback is **deploy the previous Worker version**. List the versions, then send
100% of traffic back to the one that was live before the faulty release:

```sh
npx wrangler deployments list --name piers-portfolio-static
npx wrangler versions deploy PREVIOUS_VERSION_ID@100 --name piers-portfolio-static
```

Then run the deployed checks above against `https://piersblinco.com`. The old
`website-cms` Worker, its D1, R2 bucket and repository were retired on
6 November 2026 (backups in `~/website-backups/website-cms-retired-2026-11-06/`),
so there is no CMS to roll back to.

`www.piersblinco.com` no longer points at GitHub Pages (switched off for this
repository on 6 November 2026). Its DNS record is a proxied placeholder (`AAAA 100::`)
for a Cloudflare Redirect Rule that sends www to `https://piersblinco.com` with a 301,
keeping the path and query. The rule is added in the Cloudflare dashboard (Rules ›
Redirect Rules), because the API credentials on hand can't manage rules.

## Repository layout

```text
index.html / styles.css / site.js / brands.json   Static homepage
assets/brands/                                  33 logo WebPs
assets/fonts/                                   Inter and OFL licence
assets/images/                                  Portrait, social preview, icons
favicon.ico / robots.txt / sitemap.xml           Discovery assets
_headers / production-files.json                Headers and publish allowlist
wrangler.jsonc / package.json / package-lock.json Hosting config and pinned tooling
scripts/                                        Build, browser and deployed checks
STATIC-MIGRATION.md                              Deployment and recovery record
```

`dist/`, `node_modules/`, `.wrangler/` and `.audit/` are gitignored. Verification
reports/screenshots are under `.audit/`; private configuration/code backups from
the 4 November cutover are under `.audit/static-cutover/`. The retired CMS's
database export and source are in `~/website-backups/website-cms-retired-2026-11-06/`.
