# Agency Partners page

`agency-partners/` is an additive static landing page using the existing GitHub Pages hosting and domain. Existing pages and DNS are unchanged. The page explains the white-label partnership and connects only to the standalone Agency OS visitor API at `agency.piersblinco.com/api/partners-public/`.

The current assistant is explicitly FAQ-based; paid AI is disabled pending separate owner configuration. Visitors can submit an enquiry, ask approved FAQ questions, or request a human handoff when availability permits. No automated email is sent. Saved visitor tokens are session-scoped, never URL parameters; the public website does not receive administrator credentials or research data.

Publish the reviewed additive commit only after the Agency OS backend migration and checks pass. Confirm the latest remote main before pushing, preserve other contributors' changes and verify GitHub Pages built the approved SHA. Roll back by reverting only this feature on the latest main. Do not reset other pages or alter hosting/DNS.

Browser checks cover desktop, tablet and mobile against a local isolated backend with mocked conversations. Avoid credentials, private conversation exports, prospect records and raw logs in this public repository.
