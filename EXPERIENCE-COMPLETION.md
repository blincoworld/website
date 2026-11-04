# Completed public experience wording — 4 November 2026

Production Worker: `website-cms`.
Production version: **`79fc8a1e-9f8f-4af9-b2de-a360b61496a3`**, 100% traffic.
Previous version: `3c99d51a-683d-41c9-ac34-d47058d2d5bf`.
CMS source commit: **`30c1bf5`**.

## Final wording

- Homepage counter: **30+** years of professional development experience.
- Homepage heading: **I’ve spent over 30 years building software for businesses that depend on it.**
- Homepage description and Open Graph description: **Over 30 years of professional development experience.**
- Agency Partners counter: **30+** years of software, ecommerce and systems experience.
- Agency Partners heading: **More than 30 years of software, ecommerce and systems experience.**
- Agency Partners paragraph: **30+ years of relevant experience**.

No outdated 20-year claims remain in either public page's visible content or SEO descriptions. Other wording, design and functionality are preserved.

## Authoritative sources and approved content operation

The shared hero's default counter in `~/website-cms/website/hero.js` is now 30; the homepage's explicit 30 value is unchanged. The CMS source `seed.sql`, `content/agency-partners.md` and existing regression assertions reflect the approved wording. Seeds were **not** imported into production.

The owner explicitly authorised the targeted D1 edits in [the content plan](EXPERIENCE-CONTENT-PLAN.md). Before writing, every captured public field was compared against the complete existing D1 page records. Both records matched, and no page triggers were present.

The exact prepared guarded SQL was applied to D1 `website-cms-db` (`9186994d-08df-4481-99ac-54f9d24a1978`). One atomic statement required both old fields to match before updating either row. It updated only `home.seo_description`, the two approved phrases in `agency-partners.body_markdown`, and the normal `updated_at` timestamps. Full-record comparison confirmed every other field was unchanged. No schema, table structure, binding, unrelated record, publication state, ID or slug was altered.

The SQL had already been checked in memory for precise changes, safe repeat execution and no changes when either baseline field differs. Its execution and comparison records remain under ignored `.audit/experience-completion/`.

## Recoverable backup

Complete pre-update records for the two affected pages, saved before execution:

- Primary JSON: `/home/piers-blinco/website-cms/.wrangler/backups/experience-content-20261104T101640Z.json`
- Second JSON copy: `/home/piers-blinco/website/.audit/experience-completion/experience-content-20261104T101640Z.json`
- JSON SHA-256: `a019c4b0ff7c38d9cf0ae97d7e977f74ca744fdad336a605e0373b5d6e25330e`
- Matching `-restore.sql` files sit beside each JSON copy. They restore only the changed content fields and original update timestamps, with exact expected-new-content guards to protect subsequent edits. Recovery has **not** been executed.

Both backup copies and restore files are private local files, excluded from Git and the static review bundle. The complete JSON records also preserve every other original field for manual recovery if ever needed.

## Build, deployment and verification

- Existing checks: **46 tests passed**, **1 CMS browser smoke test passed**, production dry run passed; no tests skipped.
- Worker comparison with the current deployed baseline: `worker.js` differs only in the default counter value, 20 to 30; the source map changes accordingly. All 53 other modules match byte for byte. Content changes are stored in D1 rather than hidden in rendering substitutions.
- Uploaded using pinned Wrangler 4.151.1 `versions upload --name website-cms --keep-vars --strict`; verified bindings/runtime against the active version before promotion.
- Promoted the exact uploaded version with `versions deploy VERSION@100 --name website-cms`. No route/domain triggers or Pages deployment was performed.
- Both pages and both Agency URL variants return HTTP 200. Public content APIs show exactly the approved content-field replacements.
- Final live HTML differs from the captured baseline only by the approved text replacements. Enquiry JavaScript is byte-identical.
- Real Chrome against production at 1440, 768 and 375px: all four newly requested references and SEO descriptions verified, fonts/images load, no horizontal overflow or JS exceptions, and screenshots are pixel-identical to the reviewed local build.
- Agency enquiry fieldset and submit button remain enabled. Existing local mocks verified validation, failure/retry/success, stable submission IDs and the same endpoint. No live enquiry or real email was sent by this task.
- Post-deployment Worker settings, compatibility, bindings, D1/R2 resource identities, SMTP secret bindings, release variables and observability match the pre-deployment snapshot exactly. Domain assignments and zone routes are unchanged.
- Testing and Family Hub were not modified. The CMS remains active on `piersblinco.com`.

The cleaned `~/website` mirror, validations and sitemap are consistent with this release. Both source repositories retain their Git histories. No outstanding production issue was found; actual SMTP inbox delivery was not retested.
