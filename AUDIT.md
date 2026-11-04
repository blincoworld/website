> **Release update:** The owner subsequently approved two homepage changes: the counter to 30+ and the heading to “I’ve spent over 30 years building software for businesses that depend on it.” Both are now deployed. See [EXPERIENCE-RELEASE.md](EXPERIENCE-RELEASE.md). The cleanup audit below records the earlier baseline; its pending one-line wording proposal is superseded.

# Website cleanup and production handover — 4 November 2026

## Outcome and boundary

The obsolete static website has been reduced to the two public pages and their
transitive dependencies. Live HTML/assets are the baseline. The only intended
visual/content difference from live is the homepage experience heading:

> I’ve been building things online for more than 30 years.

The “20+ years of professional development experience” badge and existing SEO
metadata remain as on live: the change describes time building online, without
rewriting the distinct professional-experience claims on either page.

No production code, Cloudflare settings, data, domains, routes, secrets, bindings,
mailboxes or other repositories were changed. No enquiry was submitted to a live
backend. No Pages deployment was made. The wording is prepared locally; it is
**not yet on the live homepage**.

## Verified hostname ownership

Cloudflare's account-level Workers custom-domain API, zone Worker routes API,
Worker settings, both applications' local configuration and public GET responses
were inspected read-only. There are no zone Worker route patterns; hostnames are
assigned using Workers custom domains.

| Hostname | Actual Worker/application | Observed response |
| --- | --- | --- |
| `piersblinco.com` | `website-cms`, source `~/website-cms` | Homepage and Agency Partners: 200 |
| `admin.piersblinco.com` | `website-refresh-outreach`, source `~/projects/testing` | Website Outreach app: 200; old `/login`: 404 |
| `testing.piersblinco.com` | `website-refresh-outreach` | 301 to the current admin host |
| `partners.piersblinco.com` | `website-refresh-outreach` | Referral Partner Programme: 200 |
| `new.piersblinco.com` | `website-cms` | 404; current code dispatches the public app only for PUBLIC_HOST |

The current Testing application contains Website Outreach, Partner Outreach and
the partner portal. Its configured domains match the remote assignments. It has
its own D1 database, R2 upload bucket, static asset binding and two Durable Object
bindings, with no service binding to `website-cms`.

`website-cms/wrangler.jsonc` still lists the **stale** admin domain assignment,
and the deployed `ADMIN_HOST` variable still names that hostname. Neither makes
the CMS the application actually served there. Do not use that host to edit CMS
content, do not reclaim it, and do not run a broad deployment/triggers command
that would try to apply the stale domain configuration.

The `piersblinco` Pages project has no deployments or custom domain and is not in
the public website's request path. `CNAME` was an obsolete GitHub Pages artifact;
removing it locally does not change any Cloudflare hostname assignment.

## How the public website works

The deployed `website-cms` version is
`2678f356-1095-4d5e-83e5-cf0d802be16d`, serving 100% of traffic since
22 October 2026. The deployment source is Wrangler.

- Entry point: `~/website-cms/worker.js`; public routing: `website/routes.js`.
- Page copy is Markdown in the `pages` table of D1 `website-cms-db`, ID
  `9186994d-08df-4481-99ac-54f9d24a1978`, bound as `DB`. Slugs are `home` and
  `agency-partners`. Read-only public content APIs confirm the currently
  published copy at `/api/pages/home` and `/api/pages/agency-partners`.
- HTML is rendered on each request by `website/templates.js`, `website/hero.js`
  and `website/agency.js`. Publication state is respected. The experience heading
  to correct is **hardcoded in `website/templates.js`**, not stored in D1.
- CSS, scripts, the local Inter font, portrait, social assets and all 33 logo
  images are bundled into the Worker using Text/Data module rules. Uploaded
  media is in R2 `website-cms-media`, bound as `MEDIA`, with D1 metadata.
- Existing release settings are `PUBLIC_PAGES=home,agency-partners`,
  `PUBLIC_BLOG=false`, `SHOW_MAIN_NAV=false`, `SITE_INDEXABLE=true`,
  `PUBLIC_HOST=piersblinco.com`, `CANONICAL_ORIGIN=https://piersblinco.com`.
- Both `/agency-partners` and `/agency-partners/` work; canonical is no-slash.
  Redirect mappings are empty. Missing/obsolete sections return 404.
- The form posts JSON to `/api/enquiries/agency` in the same Worker. Accepted
  enquiries are stored in CMS D1 before SMTP notification through the existing
  Namecheap mailbox. Validation, consent, honeypot, rate limiting, idempotent
  submission IDs and uncertain-delivery handling remain implemented there.
- Current secret binding names include `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`,
  `ENQUIRY_HMAC_SECRET` and `ENQUIRY_SMTP_PASSWORD`. Only names were inspected;
  no secret values are in this repository. No Agency OS service binding exists.

Historical CMS README/handover notes describe staging and unperformed cutover
steps. Remote assignments, deployed code/settings and live responses establish
the current production state; those older notes are not current routing evidence.

## Live versus original repository

| Area | Original `~/website` | Live baseline now mirrored here |
| --- | --- | --- |
| Homepage | “I build things that help businesses make more money”; blue portrait panel; Google Fonts | “Senior technical expertise, without the agency overhead”; consultancy layout; local Inter/WebP portrait; experience logos |
| Experience wording | “for more than 30 years.” | Live still had “over 20 years”; exact requested online-building sentence prepared locally |
| Agency design | Older layout, static plain company names, separate CSS | Shared consultancy design, 33 rotating logos, shared CSS/scripts |
| Form | External Agency OS session/enquiry API, session token and confirmation dialog | Same-origin CMS endpoint, idempotency ID, SMTP notifications, updated live privacy text |
| SEO | Limited tags; Agency canonical | Canonicals, descriptions, robots, Open Graph, Twitter cards, social preview and branded icons preserved |
| Navigation | Homepage anchors and email; Agency back to home | Homepage project CTA to Agency enquiry, reciprocal home link and Agency section anchors; footer Agency/contact links |

The owner explicitly chose **keep live form only**. The unloaded legacy chatbot
and older Agency OS enquiry script are removed. This does not delete or change
Agency OS or any external infrastructure.

Neither retained page references Property Films, TradeOS or the other obsolete
pages. Both share assets outside `agency-partners/`. `site.js` fetches
`/brands.json`, and its queue preloads logo paths from that manifest. All 33
images are retained even though only six appear in the initial HTML. CSS font
URLs, social metadata images/icons and the local font licence are retained.
No broken links required rewriting; adopting the live baseline preserves working
navigation to the retained pages and their anchors. No blanket redirect was added.

## Validation

- Captured 49 live files using GET requests only; added the Inter font licence
  from the CMS source. Production bundle: 50 files, 1,001,252 bytes.
- Largest production file: local Inter font, 352,240 bytes, below 25 MiB.
- `python3 scripts/build.py`: creates only the explicit allowlisted files.
- `python3 scripts/check.py`: page links/fragments, HTML/CSS/SEO assets, dynamic
  logo paths, retained form endpoint, exact wording, sizes and bundle contents pass.
- `node --check site.js`, `node --check enquiry.js` and browser script syntax pass.
- Real Chrome at 1440, 768 and 375px: fonts/images load, no horizontal overflow,
  valid section anchors and no JavaScript exceptions or missing assets.
- Agency screenshots are pixel-identical to the captured live baseline at all
  three widths. Homepage uses the same assets/design with the one heading change.
- Logo rotation, pause/resume, homepage CTA navigation, HTML form validation,
  mocked failure/retry/success and stable retry payloads pass. Browser test traffic
  is loopback-only. This does not prove live SMTP inbox delivery.
- Prepared Worker wording patch passes `git apply --check`. An isolated copy
  inside this repository passed Wrangler 4.151.1 `versions upload --dry-run`.
  After normalising dependency source paths, its executable Worker bundle matches
  the downloaded deployed bundle except for the single heading correction.
  No version was uploaded. The CMS source repository remains unchanged.
- Capture/screenshot/check reports remain in ignored `.audit/`; they are excluded
  from Git and the review bundle. `dist/` is also ignored.

## Exact production update path — awaiting approval, not executed

Use the existing **`~/website-cms` source repository**, with its pinned Wrangler
4.151.1 and current lockfile. Do not deploy `~/website`, `dist/` or any Pages project.

1. Re-read the active version, settings, bindings and domain ownership immediately
   before release. Confirm the public Worker and storage identities still match.
   Preserve the Testing app's domains and all other current infrastructure.
2. Review/apply `~/website/cms-wording.patch` to `website/templates.js` in the CMS
   repository, on its latest main, preserving other contributors' changes. The
   patch changes exactly one homepage heading; no D1 edit, seed, migration,
   secret operation, routing change or form change is needed. Commit the reviewed
   CMS change in that repository only after that work is authorised.
3. Run that repository's `npm test`, `npm run test:ui`, and
   `npm run check:bundle`. Compare its bundle to the active version. Keep bindings,
   release variables, compatibility date and all domain settings unchanged.
4. Upload a version without applying triggers, through the existing private
   operator authentication workflow (never paste token values into chat/logs):

   ```sh
   cd ~/website-cms
   npx wrangler versions upload --name website-cms --keep-vars --strict --message "Update homepage online experience wording to more than 30 years"
   ```

   This is a future remote write requiring approval. Inspect the returned version
   ID and its bindings before deployment. Do not enable preview URLs: they are
   currently disabled. `--keep-vars` retains remote variables; configured values
   must still match the approved current settings.

5. Once that exact version is approved, deploy it to the existing Worker:

   ```sh
   npx wrangler versions deploy NEW_VERSION_ID@100 --name website-cms --message "Publish approved homepage experience wording"
   ```

   Replace `NEW_VERSION_ID` with the reviewed uploaded ID. Version promotion
   changes the selected code version, without deploying route/custom-domain
   triggers. Do **not** run `wrangler deploy`, `wrangler triggers deploy`, a Pages
   command, or any domain reassignment from the stale CMS config. The installed
   Wrangler's version-upload implementation explicitly separates trigger updates.
6. Verify homepage/Agency URLs, the exact wording, both slash forms, assets, SEO,
   navigation and form availability. Do not submit a live test enquiry without a
   separately approved controlled delivery test. Re-read domain assignments to
   confirm Testing still owns admin/testing/partners. Code rollback, if needed,
   promotes the recorded prior version; no database rollback is needed for this
   wording-only change.

Cloudflare documents separate upload/promotion in [deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/)
and [gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/).
The exact flags above were also checked against installed Wrangler 4.151.1 help.
No production operation in this sequence has been performed.

## Can the old CMS be retired?

**Not as a whole today.** Despite losing its old admin hostname, `website-cms`
actively renders both public pages, serves their assets and receives enquiries;
its D1 and R2 bindings are still part of that application. Deleting the Worker or
its resources would break the public website and form. A static copy alone is
not a replacement for the enquiry backend or editable content.

The obsolete administration UI/configuration could be reviewed separately for
future removal, while retaining public rendering/content/enquiries in the same
Worker. Full CMS/Worker retirement would require a separately approved replacement
for those responsibilities and data/retention handling. It is not authorised here.
Testing/Website Outreach/Partner Outreach are a separate application and must
remain untouched throughout any such future work.

## File inventory

The following lists record this cleanup. Git history is preserved. Generated
review files and essential audit/check documentation are not production content.

### Production files retained

```text
agency-partners/index.html
assets/brands/aon-e4e22b0a6b.webp
assets/brands/aps-group-1065ce8cce.webp
assets/brands/autoweb-design-a2b4c66113.webp
assets/brands/betfair-6f2e374d15.webp
assets/brands/betsson-group-ff9ac04ba5.webp
assets/brands/bt-fresca-5241dae7b3.webp
assets/brands/dw-sports-fitness-aff34148ff.webp
assets/brands/ebay-f3889dbff4.webp
assets/brands/farrow-and-ball-75d2f0b0e0.webp
assets/brands/feed-dept-d21f3fd952.webp
assets/brands/foxwoods-daa441e0dd.webp
assets/brands/gan-ca80348de1.webp
assets/brands/great-little-trading-company-a805e98627.webp
assets/brands/gumtree-3681f0fc75.webp
assets/brands/habitat-b2da217ff5.webp
assets/brands/house-of-fraser-1193920075.webp
assets/brands/jd-sports-5ee6cc3781.webp
assets/brands/journl-b9848afe2d.webp
assets/brands/ladbrokes-371dd8785b.webp
assets/brands/liberty-90e09aba04.webp
assets/brands/lyle-and-scott-7aa1ebf51a.webp
assets/brands/matalan-b918178b6d.webp
assets/brands/matches-fashion-2e5d45d342.webp
assets/brands/mint-velvet-f0fe04baee.webp
assets/brands/oxford-bus-company-00b3e80d13.webp
assets/brands/rfa-0b97aac390.webp
assets/brands/runners-need-a872ddbaf8.webp
assets/brands/snow-and-rock-9ea6984ddc.webp
assets/brands/tesco-d41542ec29.webp
assets/brands/the-range-81d8dd58b8.webp
assets/brands/thomas-pink-363bf4d665.webp
assets/brands/westfield-685f02ee8a.webp
assets/brands/wiley-8936104ad9.webp
assets/fonts/OFL.txt
assets/fonts/inter-variable-693b77d4f3.woff2
assets/images/apple-touch-icon-c3bdb44f4c.png
assets/images/favicon-16-e1e3c8dadd.png
assets/images/favicon-32-5f175f8291.png
assets/images/favicon-a14aef9084.ico
assets/images/piers-portrait-3b2768d94f.webp
assets/images/social-preview-3deead63c6.png
brands.json
enquiry.js
favicon.ico
index.html
robots.txt
site.js
sitemap.xml
styles.css
```

### Original files removed

Removed 105 original files (53 previously tracked, 52 untracked), including
Property Films and its 29 MB video, TradeOS/offer pages, backups, old tests/tools,
old deployment cache, superseded assets and obsolete hosting notes.
The font licence is retained at its new asset path.

```text
.wrangler/cache/pages.json
.wrangler/cache/wrangler-account.json
AGENCY-PARTNERS.md
CNAME
PROPERTY-FILMS.md
agency-partners/enquiry.js
agency-partners/fonts/InterVariable.woff2
agency-partners/fonts/OFL.txt
agency-partners/partners.js
agency-partners/style.css
docs/property-films-funnel.md
docs/property-films-release-2026-09-20.md
index-before-personal-rebuild-20260914-061503.html
offer.html
piers-portrait.png
property-films/availability.js
property-films/chat.css
property-films/chat.css.bak-sales-funnel-20261004
property-films/chat.js
property-films/chat.js.bak-callback-guard-20261004
property-films/chat.js.bak-d1-callback-source-20261004
property-films/chat.js.bak-existing-callback-fix-20261004
property-films/chat.js.bak-multi-checkout-20261004
property-films/chat.js.bak-persistence-20261003
property-films/chat.js.bak-reschedule-20261004
property-films/chat.js.bak-sales-funnel-20261004
property-films/chat.js.bak-visitor-callback-20261004
property-films/config.js
property-films/funnel.css
property-films/funnel.css.bak-20260921
property-films/funnel.css.bak-callback-selector-20260929
property-films/funnel.css.bak-colour-type-20260922
property-films/funnel.css.bak-cta-final-20260930
property-films/funnel.css.bak-legacy-mobile-20260929
property-films/funnel.css.pre-cleanup-20260921
property-films/funnel.css.pre-left-align-20260921
property-films/funnel.js
property-films/funnel.js.bak-callback-v2-20260929
property-films/funnel.js.bak-page-tracking-20260930
property-films/funnel.js.bak-visitor-id-20261001
property-films/index.html
property-films/index.html.bak-20260921
property-films/index.html.bak-callback-selector-20260929
property-films/index.html.bak-chat-v1-20261003
property-films/index.html.bak-content-package-20260922
property-films/index.html.bak-cta-final-20260930
property-films/index.html.bak-cta-source-20260930
property-films/index.html.bak-full-sales-story-20260922
property-films/index.html.bak-modal-20260929
property-films/index.html.bak-sales-copy-20260922
property-films/index.html.bak-section-colours-20260922
property-films/intake/index.html
property-films/intake/intake.css
property-films/intake/intake.js
property-films/next-steps/index.html
property-films/next-steps/index.html.bak-chat-20261003
property-films/next-steps/index.html.bak-content-package-20260922
property-films/next-steps/index.html.bak-short-cta-20260930
property-films/next-steps/next-steps.js
property-films/next-steps/next-steps.js.bak-content-package-20260922
property-films/packages/catalog.mjs
property-films/packages/catalog.mjs.bak-content-package-20260922
property-films/packages/checkout-config.mjs
property-films/packages/index.html
property-films/packages/packages.css
property-films/packages/packages.js
property-films/page.js
property-films/page.js.bak-callback-selector-20260929
property-films/page.js.bak-callback-v2-20260929
property-films/page.js.bak-cta-source-20260930
property-films/page.js.bak-event-safe-20260929
property-films/page.js.bak-exclusive-callbacks-20260930
property-films/page.js.bak-hourly-callbacks-20260929
property-films/page.js.bak-legacy-mobile-20260929
property-films/page.js.bak-modal-20260929
property-films/page.js.bak-submit-fix-20260930
property-films/preview/index.html
property-films/preview/preview.js
property-films/privacy.html
property-films/property-showcase.jpg
property-films/property-showcase.mp4
property-films/prospect-popups.js
property-films/shared.css
property-films/style.css
property-films/style.css.bak-modal-20260929
property-films/thank-you/index.html
property-films/thank-you/thank-you.js
tests/PROPERTY-PACKAGES.md
tests/PROPERTY-THANK-YOU-PREVIEW.md
tests/property-checkout-browser.mjs
tests/property-films-browser.mjs
tests/property-films-release-smoke.mjs
tests/property-funnel-browser.mjs
tests/property-intake-browser.mjs
tests/property-marketing-browser.mjs
tests/property-packages-browser.mjs
tests/property-packages.test.mjs
tests/property-preview-browser.mjs
tests/property-preview.test.mjs
tests/property-thank-you-preview.test.py
tests/serve-property-films.py
tools/preview-property-films-thank-you.py
tradeos-offer.html
tradeos-payment-success.html
tradeos-payment.html
```
