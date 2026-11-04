> **Completion update:** All remaining experience references listed below have now been updated in the authoritative CMS content and Worker. See [EXPERIENCE-COMPLETION.md](EXPERIENCE-COMPLETION.md). This document records the initial two-change release.

# Homepage experience update — deployed 4 November 2026

Production `website-cms` version: `3c99d51a-683d-41c9-ac34-d47058d2d5bf`, 100% traffic.
Previous version: `2678f356-1095-4d5e-83e5-cf0d802be16d`.
CMS source commit: `3cfe379` in the separate `~/website-cms` repository.

The owner approved exactly two homepage changes, superseding the earlier
“building things online for more than 30 years” proposal:

1. Experience counter: **30+**, followed by the unchanged “years of professional
   development experience” copy.
2. Experience heading: **I’ve spent over 30 years building software for businesses
   that depend on it.**

`website/hero.js` accepts a number with the original default of 20, and the
homepage passes 30 from `website/templates.js`. Agency Partners still uses the
original default, so its content and form are unaffected. Stylesheets, typography,
spacing and layout rules are unchanged. The cleaned repository mirror and checks
now reflect these deployed homepage values.

## Release checks and deployment

- Active version, configuration, bindings, custom-domain ownership and zone routes
  matched the prior audit before any upload.
- The unmodified local build matched all deployed executable code and assets.
  Source-map file paths differed only because of the output directory.
- The candidate changed only the shared counter parameter/homepage value and
  homepage heading in `worker.js`, plus generated source-map metadata. All 53
  remaining deployed modules were byte-identical to the previous version.
- `npm test`: 46 passed; `npm run test:ui`: 1 passed, none skipped.
- `npm run check:bundle`: passed without uploading.
- Reviewed desktop/tablet/mobile screenshots: no changed section geometry; pixels
  outside the edited experience note/heading regions were unchanged. The counter
  has the natural small glyph-width difference between “20” and “30”; no CSS changed.
- Uploaded with pinned Wrangler 4.151.1 `versions upload --name website-cms
  --keep-vars --strict`, through the existing private operator-token workflow.
- Checked uploaded version bindings and compatibility settings before promotion.
- Promoted this exact version with `versions deploy VERSION@100 --name website-cms`.
  No route/domain trigger deployment or Cloudflare Pages operation was performed.

## Production verification

- Homepage HTTP 200; rendered counter is 30+ and heading is the exact approved text.
- Homepage HTML differs from the captured production baseline by exactly the two
  numeric replacements. Agency Partners HTML and its enquiry client are unchanged.
- Real Chrome on production at 1440, 768 and 375px: screenshots pixel-identical to
  the reviewed local build; local fonts/images load; no missing assets, horizontal
  overflow or JavaScript exceptions. Agency enquiry fieldset and submit button
  are enabled. Verification issued GET/HEAD requests only.
- Existing local tests covered enquiry validation, mocked failure/retry/success,
  SMTP behaviour, idempotency and storage-before-notification. No live form was
  submitted and no real SMTP delivery was triggered by this task.
- Post-deployment settings exactly match the pre-deployment snapshot, including
  compatibility settings, D1/R2/secret bindings, release variables and observability.
- All custom domains and zone routes are unchanged. Testing/admin/partners remain
  on `website-refresh-outreach`; production remains on `website-cms`.
- No schema, D1 contents, SMTP secrets, CMS resources or Testing files were changed.

## Other experience claims found, deliberately unchanged

Visible Agency Partners content still includes:

- Hero counter: “20+ years of software, ecommerce and systems experience.”
- Background heading: “More than 20 years of software, ecommerce and systems experience.”
- Background paragraph: “20+ years of relevant experience”.

The homepage SEO description (also used in its Open Graph description) still says
“Over 20 years of professional development experience.” This is metadata rather
than visible body text. Updating those claims would be additional changes beyond
the two approved homepage changes, so they were reported without altering them.

No functional issue was found. Full SMTP inbox delivery was not retested.
