# Static portfolio migration — completed 4 November 2026

## Current production

| Item | Value |
| --- | --- |
| Public domain | `https://piersblinco.com/` |
| Worker | `piers-portfolio-static` |
| Version | `cfb7b262-8e10-4a7d-97f2-b057e8ac7cc2`, 100% traffic (6 Nov 2026; previous `434aeb2f-26aa-4d0e-9d7c-b3eeb5c993da`) |
| Public mirror | `https://piers-portfolio-static.pbwebonlinesales.workers.dev` |
| Account | `c39888a9363fce8762763f0c60a9a388` |
| Zone | `ceed470e2cef4ebefa4d4b941e909834` |
| Compatibility date | `2026-11-04` |
| Runtime/backend bindings | None |
| Source/build | `index.html`; allowlisted static files in `dist/` |
| Tooling | Project-local Wrangler `4.157.0`, pinned by lockfile |

The static portfolio from approved commit `68d7ebd` is live. Its content, design,
portrait, font, 33-company logo rotation and 25-year wording were preserved. The
only publish-file change during migration was explicit cache headers to retain
the previous browser caching policy. The build contains 49 allowlisted files,
969,231 bytes (the `_headers` configuration is not served as a public asset).

The site does not render from a CMS or query D1/R2/SMTP/APIs. JavaScript requests
only its local logo manifest and images. There is no enquiry form or contact CTA.
Canonical and social metadata refer to `https://piersblinco.com/`. Unknown routes,
including removed Agency and API URLs, return 404.

## Domain ownership and preserved infrastructure

Only `piersblinco.com` moved from `website-cms` to `piers-portfolio-static`.
Cloudflare managed the apex's routing DNS record as part of that assignment;
no unrelated DNS record was changed manually or through the API.

Unchanged assignments include:

- `admin.piersblinco.com`, `testing.piersblinco.com`, `partners.piersblinco.com`:
  `website-refresh-outreach` (Testing, Website Outreach and Partner Outreach).
- `family.piersblinco.com`: `family-hub`.
- `agency.piersblinco.com`: `agency-os`.
- `outreach.piersblinco.com`: `outreach-os`.
- `social.piersblinco.com`: `social-scheduler`.
- `new.piersblinco.com`: assigned to `website-cms` at cutover; removed with that
  Worker on 6 November 2026.
- `www.piersblinco.com`: a proxied CNAME to `blincoworld.github.io` (GitHub Pages
  404) at cutover. On 6 November 2026 GitHub Pages was switched off and the CNAME
  was replaced by a proxied placeholder (`AAAA 100::`) for a dashboard Redirect Rule:
  www → `https://piersblinco.com`, 301, path and query kept. Previous record saved in
  `.audit/www-redirect-2026-11-06/`.

All other custom-domain objects and zone Worker route patterns match the backup.
All 20 unrelated DNS records, including MX/SPF/email and www records, match the
pre-cutover inventory exactly. The apex's managed record was intentionally
removed/recreated during the controlled domain transfer.

Code/runtime snapshots for all 13 Workers match their pre-cutover snapshots.
The 12 D1 database resource identities/configuration metadata remain unchanged.
No SQL or database writes, schema changes, SMTP/email changes, or edits to Testing,
Partner Outreach or Family Hub were performed. No Pages projects were changed.

## Former CMS: retired 6 November 2026

`website-cms` was kept for rollback after the cutover and retired on 6 November 2026
(owner's approval): the Worker (with its `new.piersblinco.com` custom domain), D1
`website-cms-db` and R2 `website-cms-media` were deleted, and the GitHub repository
`blincoworld/website-cms` was archived. Backups are in
`~/website-backups/website-cms-retired-2026-11-06/`:

- `website-cms-db.sql`: a full remote export of the D1 database.
- `r2/README.txt`: the bucket was empty (0 objects), so there was nothing to copy.
- `secret-names.txt`: the Worker's secret names (values are never exported).
- `website-cms/`: the local repository, including its ignored `.wrangler/backups/`.

The 4 November pre-cutover configuration and code snapshots remain under ignored
`.audit/static-cutover/`.

## Cutover and exercised recovery

The direct attachment API initially returned ownership conflict 409/100116.
The owner then explicitly approved detaching the existing apex assignment before
attaching the new Worker. No ownership or DNS override flags were used.

`scripts/domain-cutover.py` (removed on 6 November 2026 with the CMS) validated the exact hostname, zone, environment and
expected owner. It detaches only that domain object and immediately attaches the
same hostname to the requested service. It refuses ambiguous/third-party owners,
checks unrelated domain objects, and attempts CMS restoration on failure. Its
read-only plan is the default; a write requires `--apply`.

The rollback path was exercised during cutover and the original CMS HTML/HTTP 200
was verified after recovery. An empty successful DELETE response exposed a client
JSON-decoding issue, which was fixed and regression-tested. A short initial
verification window also triggered recovery. Final checks use compression-aware
requests and bounded propagation waiting; the completed cutover passed every
production check and remained on the static Worker.

## Rollback procedure

There is no CMS to roll back to. Rollback is **deploy the previous Worker version**:

1. List the deployments and note the version that was live before the faulty release:

   ```sh
   npx wrangler deployments list --name piers-portfolio-static
   ```

2. Send 100% of traffic back to it:

   ```sh
   npx wrangler versions deploy PREVIOUS_VERSION_ID@100 --name piers-portfolio-static
   ```

3. Run the deployed checks against `https://piersblinco.com` (see README.md).

The `workers.dev` URL now mirrors production; it is not isolated staging for a
future code deployment. Future code/assets releases should use version upload
and deliberate promotion, or a separately approved staging/version-preview setup.

## Verification results

- Before mutation: Website was clean and GitHub-synchronised at `68d7ebd`;
  the old CMS version, settings, domains, routes and code were backed up read-only.
- Local build/content checks and browser smoke tests passed.
- Seven rollback helper tests passed, including empty successful detach response,
  guarded round-trip, missing/ambiguous/third-party ownership, attachment failure,
  lost responses and recovery of a detached apex.
- Preview and production: all 48 served files returned HTTP 200. Required asset
  bytes match the static build; robots directives account for zone-managed content.
  All 33 logo images, portrait, font, favicons, robots and sitemap were checked.
- Security headers and preserved cache policies pass on all served files.
- Removed/unknown/API paths and `/_headers` return HTTP 404, without SPA fallback.
- Real Chrome on preview and production at 1440, 768 and 375px: correct 25-year
  counter/heading/SEO/Open Graph metadata, no 30-year claims, no missing assets,
  console exceptions, horizontal overflow, external requests or CMS API calls.
- Rotation, sustained pause/resume, reduced motion, native view-all, all 33 names,
  keyboard skip link and no-JavaScript fallback pass. No live form/email was sent.
- Production screenshots are pixel-identical to the approved preview at all three
  widths. Both use the exact same static Worker version.
- Post-cutover API checks confirm the static Worker owns the apex, has no backend
  bindings, and the old CMS code/config/version and unrelated infrastructure match
  the snapshots. Deployment reports/screenshots remain under ignored `.audit/`.

## Later retirement — done 6 November 2026

The old CMS Worker, its `new` hostname, CMS D1/R2 and secrets were deleted and its
repository archived (see "Former CMS" above). The www CNAME to GitHub Pages was
replaced by a placeholder for a www → apex redirect rule and GitHub Pages was switched off. The Pages
projects were not changed.
