# Piers Blinco — static portfolio

https://piersblinco.com is served directly by **Cloudflare Workers Static Assets**
from this repository. The Worker is **`piers-portfolio-static`**, with no CMS code,
D1, R2, SMTP or backend API binding. `index.html` is the content source; the build
copies only the production allowlist to `dist/`.

Current production version: `434aeb2f-26aa-4d0e-9d7c-b3eeb5c993da`.
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
npm run test:rollback
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
Do not redeploy the old CMS or apply its stale route configuration.

## Rollback

The original `website-cms` Worker remains intact at version
`79fc8a1e-9f8f-4af9-b2de-a360b61496a3`. Its database, media, SMTP settings, source
repository and backups are preserved. Rollback changes only the apex assignment:

```sh
python3 scripts/domain-cutover.py rollback         # Read-only plan
python3 scripts/domain-cutover.py rollback --apply # Detach static apex, attach CMS
```

The helper uses `CLOUDFLARE_API_TOKEN` when supplied, otherwise the existing private
operator-token file. It validates the exact account/zone/hostname and owner,
uses no ownership/DNS override flags, and attempts CMS recovery on failures.
Verify HTTPS and the restored CMS homepage immediately. See
[STATIC-MIGRATION.md](STATIC-MIGRATION.md) for backup locations and full recovery
instructions. Testing, partners, Family Hub, email and unrelated DNS are outside
this operation. `www.piersblinco.com` still has its pre-existing GitHub Pages CNAME
and 404 response; it was not included in the authorised apex cutover.

## Repository layout

```text
index.html / styles.css / site.js / brands.json   Static homepage
assets/brands/                                  33 logo WebPs
assets/fonts/                                   Inter and OFL licence
assets/images/                                  Portrait, social preview, icons
favicon.ico / robots.txt / sitemap.xml           Discovery assets
_headers / production-files.json                Headers and publish allowlist
wrangler.jsonc / package.json / package-lock.json Hosting config and pinned tooling
scripts/                                        Build, browser, deployed checks and guarded rollback
STATIC-MIGRATION.md                              Deployment and recovery record
```

`dist/`, `node_modules/`, `.wrangler/` and `.audit/` are gitignored. Verification
reports/screenshots are under `.audit/`; private configuration/code backups are
under `.audit/static-cutover/`. Historical CMS content backups remain untouched
in the separate CMS repository's ignored backup directory.
