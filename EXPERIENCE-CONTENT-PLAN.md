# Approved CMS content update — completed

The live D1 `pages` table is authoritative for three requested references:

- `home.seo_description`: replace only “Over 20 years” with “Over 30 years”.
- `agency-partners.body_markdown`: replace only “More than 20 years” with “More than 30 years” in the experience heading, and “20+ years of relevant experience” with “30+ years of relevant experience” in its paragraph.

The fourth reference, the Agency Partners counter, is template-owned and can be changed through a Worker version.

Proposed content operation: update only those existing fields on those two existing page records, preserving all other content, IDs, slugs, publication state and timestamps other than the normal update timestamp. Require exact matches to the captured old field values before updating. No schema, database resource, binding, route, domain, SMTP, enquiry, Testing or Family Hub changes.

The owner explicitly approved these targeted D1 content edits. The prepared guarded SQL was applied after full-record backups and exact baseline checks. Worker version `79fc8a1e-9f8f-4af9-b2de-a360b61496a3` is deployed at 100%. See [EXPERIENCE-COMPLETION.md](EXPERIENCE-COMPLETION.md) for verification and recovery details. No render-time content substitutions were introduced.
