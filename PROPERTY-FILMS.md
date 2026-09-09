# Cinematic Property Films landing page

Static, dependency-free page at `/property-films` (directory index; a static host may redirect to `/property-films/`). Existing root and TradeOS pages are untouched. Deploy the `property-films/` directory through the website's existing static/GitHub Pages deployment. Do not publish the testing scripts as a separate app or change the site's CNAME/routing.

## Files

- `property-films/index.html`: standalone page, native form/video, editable copy and metadata.
- `property-films/style.css`: responsive editorial design; system fonts, no external images/fonts/framework.
- `property-films/config.js`: public API URL, MP4 path and claim verification switch. No credentials.
- `property-films/page.js`: validation, submission/retry/success, video detection and analytics hooks.
- `property-films/privacy.html`: enquiry-specific privacy information.
- `tests/serve-property-films.py`, `tests/property-films-browser.mjs`: isolated local browser testing.

Backend implementation is in `../business-os`: `src/property-business/`, `migrations/0013_property_films.sql`, `public/modules/property-business/`, `test/property-films.spec.js`, and `docs/property-films.md` and `docs/property-business.md`. Existing `src/index.js`, `public/index.html`, and `public/assets/js/router.js` have small routing/navigation additions. See that document for the server configuration, private access and release steps.

## Add the final example

Place the final MP4 at this exact filesystem path:

`/home/piers-blinco/website/property-films/property-showcase.mp4`

Public path: `/property-films/property-showcase.mp4`.

Adding this file is sufficient: the page checks its availability and video MIME type, then uses native controls, no autoplay and `playsinline`. Until then it displays a designed neutral placeholder. A missing file produces an expected HEAD 404 in the browser's network log; there is no uncaught JavaScript error or broken player. Hosting should serve `video/mp4` and byte-range requests. Use broadly compatible H.264/AAC with the MP4 metadata at the start (`faststart`), and keep its size appropriate for mobile. The final film's playback/content must be checked after supply.

The example-specific photography claim is **off by default**. Only after confirming the actual example was created from existing property photography, set `photographyClaimVerified: true` in `config.js`. The exact claim text is adjacent and editable. If it is not verified, the page uses general service copy and makes no assertion about what the visitor just watched. If the video errors, the placeholder and general copy return.

## Submission and Formspree

The configured public endpoint is `https://business-os.pbwebonlinesales.workers.dev/api/property-business/property-films/submit`. It saves to the existing Business OS D1 database in its own Property Business film-enquiry table, then delivers Formspree server-side. All required fields are validated in both browser and API. URLs without a scheme are normalised to HTTPS. Errors stay inline, entered data is retained, retries in a page session reuse a unique submission ID, and success replaces the form.

Piers needs to supply a real Formspree endpoint and configure the Business OS secret `PROPERTY_FILMS_FORMSPREE_ENDPOINT`. No production Formspree ID has been invented. Property Business lead storage works without Formspree; its lead detail shows unconfigured/failed notification state and supports retry. No private Business OS tokens are exposed on this site.

## Analytics

No existing analytics integration was found in this static website. Lightweight `property-films:analytics` CustomEvents expose `detail.event` values prefixed `property_films_`: `page_viewed`, `example_video_started`, `example_video_50_percent`, `example_video_completed`, `cta_clicked`, `form_started`, `form_submitted_successfully`. They also push to `window.dataLayer` if one already exists. They contain no contact details. No third-party analytics dependency or tracking cookie was added. Video milestones are once per page session; 50% indicates playback position, not guaranteed watched duration.

## Release order

1. Apply the new Business OS table migration, reviewing unrelated pending migrations.
2. Deploy the Business OS changes. Configure Formspree when the real endpoint is available; reuse the existing internal token or configure a dedicated Property Films token.
3. Publish the static `property-films/` directory using the existing website deployment.
4. Add the final MP4 when supplied; verify its provenance before enabling the claim.
5. Perform one authorised live enquiry check and confirm Formspree delivery once configured.

No production deployment, remote database changes or live notification were performed during implementation.

## Test results

- Existing Business OS suites plus new capture/storage/Formspree tests: **115 passed across 8 files** (`npm test -- --run` in an isolated copy). Installed domain files are verified against the tested copy.
- Chrome browser checks passed at **375×812, 412×915, 768×1024 and 1440×1000**: no horizontal overflow, 44px+ form touch targets, correct 16:9 video, missing-film placeholder. Desktop and mobile screenshots were visually reviewed.
- Real local Worker/D1 round trip passed: inline required/email validation, network failure retention and retry, success replacement and focus, Business OS navigation/detail, saved notes/status and literal HTML escaping.
- Disposable two-second H.264 test clip verified automatic asset detection, native controls/playback, no autoplay, photography claim guard, start/50%/completion events and media-error fallback. The fixture was removed and is not a public asset.
- No JavaScript exceptions or console error calls. The missing MP4 intentionally returns HEAD 404 until supplied.
- JavaScript syntax checks, both repositories' `git diff --check`, public credential checks and a production Worker **deploy dry-run** passed.
- The pre-existing Vitest Workers runtime emits a compatibility-date fallback warning (2026-07-29 to 2026-03-10). No existing compatibility settings were changed. The separate browser test ran against the newer local Wrangler runtime.
- A real Formspree delivery still needs verification after Piers supplies and activates the endpoint; all automated notification tests used mocks and sent no live messages.

## Property Business navigation revision

The Business OS sidebar now has a separate **PROPERTY BUSINESS** section near the bottom: **Overview**, **Prospects**, **Leads**, **Property Films**. The enquiry UI moved to `#property-business-leads`. Overview shows counts/recent updates; Prospects provides the Premier Cottages importer and outbound operator call list; Property Films shows offer configuration and notification delivery counts. Backend, UI and status definitions live within their own `property-business/` folders, with no TradeOS domain dependencies.

The public route/design remain `/property-films`. Only the capture API configuration changed to `/api/property-business/property-films/submit`. The former public `/api/property-films/submit` remains a compatibility adapter; former private routes are removed. **Migration 0013 is unchanged**, with no extra migration or record copying. Preferred private secret is now `PROPERTY_BUSINESS_API_TOKEN`, with existing token fallbacks retained. Deploy the backend/domain assets before the updated public config when release is approved. Deployment authorised on 9 September 2026.


## Production release — 9 September 2026

The supplied `property-showcase.mp4` is a 50.88-second 1920×1080 H.264/AAC film. It decoded without errors and passed desktop/mobile native playback and seeking checks. Its MP4 metadata was moved to the start for progressive playback; compressed audio/video stream hashes match the original exactly. The photography-specific claim remains disabled pending confirmation of the actual production provenance.

The public endpoint remains `/api/property-business/property-films/submit` on the existing Business OS Worker. Production migrations 0013 and 0014 were applied unchanged. Formspree is not configured in production; lead storage works independently and records notification status as unconfigured.

Business OS passed all 139 automated tests before release. `tests/property-films-release-smoke.mjs` checks the real finished video and public form; its default is read-only. A labelled production enquiry requires the explicit `--submit` flag. The existing production token is read privately for authenticated verification and never embedded in website assets. Detailed deployment identifiers and final verification are recorded in the Business OS release notes.

The website still deploys from `main` through its existing GitHub Pages configuration. The root site, CNAME and TradeOS pages are unchanged. Premier Cottages FULL IMPORT has not been run.


## Offer refinement — 9 September 2026

The existing editorial design is retained. Hero/example/benefit/process/enquiry copy now focuses on a cinematic property film and explains that production starts only once the project is agreed and paid for. Added a substantial production-ingredients section, the Love Your Film Guarantee, a secondary explanation of generative AI, and an empty hidden `#customer-proof` section reserved for verified future customer material. No public pricing, checkout or promise of a free bespoke preview is included.

The form handler, API configuration, video file and photography-provenance switch are unchanged. To verify the refined page against local D1, start the existing local Worker on 8793 and `python3 tests/serve-property-films.py` on 8792, then run `node tests/property-films-release-smoke.mjs --local-submit`. The preview server supports MP4 byte ranges. The browser suite checks real video playback/seeking, 1440/375/412/768px layouts, CTA scrolling (including the page-bottom limit), real local enquiry storage, guarantee visibility, working links, hidden future proof and absence of pricing/checkout. Production checks use `PROPERTY_FILMS_TEST_URL=https://piersblinco.com node tests/property-films-release-smoke.mjs` and submit nothing unless explicitly requested with `--submit`.


## Direct-response revision — 9 September 2026

Replaced the editorial hierarchy with large, heavy sans-serif headlines, tighter spacing, stronger contrast and larger interest-led CTAs. The hero leads directly into a wider film; its top is visible at common desktop viewports. The page now covers the core idea, five production steps, the work beyond DIY AI, a compact technology explanation, a major guarantee section and a direct final close. Production still starts only after agreement and payment. No pricing, checkout, unsupported booking/ranking claims or invented proof is included.

`property-showcase.jpg` is a cover frame extracted at six seconds from the supplied MP4; no new property imagery was invented. Replace/regenerate it when changing the film (`ffmpeg -ss 6 -i property-films/property-showcase.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 property-films/property-showcase.jpg`). The example heading is deliberately neutral while photography provenance remains unconfirmed.

The form/API contract is unchanged. `page.js` now restores the current markup’s CTA after submission failure and the current example heading after a video failure, rather than restoring the old editorial copy. Browser checks cover 1366×768, 1440×900, 1920×1080, 375px and 412px mobile, and 768px tablet; they additionally verify desktop first-viewport video visibility, cover loading, large type/buttons, every CTA, failure recovery and the agreement/payment wording. All 139 Business OS regression tests passed.
