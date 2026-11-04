# Static portfolio migration — completed 4 November 2026

## Current production

| Item | Value |
| --- | --- |
| Public domain | `https://piersblinco.com/` |
| Worker | `piers-portfolio-static` |
| Version | `434aeb2f-26aa-4d0e-9d7c-b3eeb5c993da`, 100% traffic |
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
- `new.piersblinco.com`: still assigned to `website-cms`.
- `www.piersblinco.com`: existing proxied CNAME to `blincoworld.github.io`, not a
  Worker custom domain. Its pre-existing GitHub Pages 404 remains unchanged.

All other custom-domain objects and zone Worker route patterns match the backup.
All 20 unrelated DNS records, including MX/SPF/email and www records, match the
pre-cutover inventory exactly. The apex's managed record was intentionally
removed/recreated during the controlled domain transfer.

Code/runtime snapshots for all 13 Workers match their pre-cutover snapshots.
The 12 D1 database resource identities/configuration metadata remain unchanged.
No SQL or database writes, schema changes, SMTP/email changes, or edits to Testing,
Partner Outreach or Family Hub were performed. No Pages projects were changed.

## Former CMS and recoverable backups

`website-cms` remains deployed at version
`79fc8a1e-9f8f-4af9-b2de-a360b61496a3`, 100% traffic allocation within that Worker.
Its deployed modules, settings, compatibility flags, D1/R2/SMTP/secret bindings,
source repository, databases and prior backups are unchanged. It is retained
for rollback, without the public apex assignment.

Pre-cutover backups are stored locally under ignored `.audit/static-cutover/`:

- `cms-settings-before.json`: complete API-visible configuration and binding
  metadata; secret values are never exported by the API.
- `cms-deployments-before.json` and `cms-version-before.json`: deployment/version
  and compatibility data.
- `cms-deployed-modules.multipart` and `cms-code-backup.json`: complete deployed
  modules, content type and SHA-256 checksum.
- `cms-source-wrangler-before.jsonc`: the original source configuration copy.
- `domains-before.json`, `old-domain.json`, `routes-before.json` and
  `rollback-domain-payload.json`: original exact domain assignment and routes.
- `dns-zone-before.json`: all 21 zone DNS records; `dns-before.json`: exact apex
  and www records. These are private local backup files, not deployed assets.
- `workers-cutover-before.json` and `databases-cutover-before.json`: unaffected
  Worker code/runtime and database resource inventory used for verification.

Previously saved CMS content backups under
`~/website-cms/.wrangler/backups/` remain intact. No secret rotation or CMS
redeployment is needed to roll back: the old Worker/resources remain running.

The old CMS source config still lists the apex and an obsolete admin hostname.
Do not run a broad `wrangler deploy` or trigger deployment from that repository;
it could attempt to reclaim domains. Use the apex-only helper below.

## Cutover and exercised recovery

The direct attachment API initially returned ownership conflict 409/100116.
The owner then explicitly approved detaching the existing apex assignment before
attaching the new Worker. No ownership or DNS override flags were used.

`scripts/domain-cutover.py` validates the exact hostname, zone, environment and
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

1. Use the same account's private operator credentials, through the existing
   protected token file or `CLOUDFLARE_API_TOKEN`. Never put token values in chat,
   Git, command arguments or the publish directory.
2. Inspect the read-only rollback plan:

   ```sh
   python3 scripts/domain-cutover.py rollback
   ```

   It must show only the current apex domain object's DELETE followed by a PUT
   attaching `piersblinco.com` to `website-cms`. If ownership is unexpected, stop.
3. Restore the original assignment:

   ```sh
   python3 scripts/domain-cutover.py rollback --apply
   ```

   The helper also supports recovery if the apex is missing after a failed attach.
   It does not alter the old Worker code, database, bindings or other hostnames.
4. Immediately verify HTTPS and HTTP 200 at `https://piersblinco.com/`, the original
   CMS homepage (its 30-year wording), its assets, and the previous CMS version.
   Compare with the saved `home-before.bin` and backup settings/version. Confirm
   unrelated domain/DNS assignments remain unchanged.
5. Keep static source/configuration intact while investigating. Returning to the
   static site later uses the same guarded `cutover` dry run and `--apply`, after
   preview validation. Do not redeploy either Worker merely to move the domain.

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

## Potential later retirement — separate approval required

After a stable observation period and review of content/enquiry retention and
recovery requirements, the old CMS Worker, its remaining `new` hostname, CMS D1/R2
resources, unused SMTP/admin secrets and separate source repository can be reviewed
for retirement. Existing Pages projects and the legacy www DNS arrangement can
also be reviewed independently. None were deleted or changed by this migration.
