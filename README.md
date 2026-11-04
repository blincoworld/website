# Piers Blinco website

A minimal review copy of the two public pages at https://piersblinco.com,
using the live website captured on 4 November 2026 as the baseline.

- `index.html`: homepage, with the pending “for more than 30 years.” correction.
- `agency-partners/index.html`: the live Agency Partners page and enquiry form.
- `styles.css`, `site.js`, `enquiry.js`, `brands.json`, `assets/`: their dependencies.
- `robots.txt`, `sitemap.xml`, favicon: existing live SEO/discovery assets.

Production is served by the **website-cms Worker**, whose source is in the
separate `~/website-cms` repository. Its D1 database remains the source for
editable content. These HTML files are a review mirror, not a replacement CMS.
Pushing this repository does not update that Worker. Do not upload this
repository or `dist/` to Pages or replace the CMS with a static deployment.

The current form posts to `/api/enquiries/agency` on the public website. The CMS
stores accepted enquiries in D1 and sends notifications through the existing SMTP
mailbox. The legacy Agency OS form is no longer loaded on the live page and is
removed here with the owner's agreement. Agency OS infrastructure is untouched.
A plain local static server cannot process this endpoint; browser checks mock it.

## Local checks

Requires Python 3, Node.js 22+ and Google Chrome (or `CHROME_BIN`). No npm install
is needed in this repository.

```sh
python3 scripts/build.py
python3 scripts/check.py
# Capture the current public baseline with GET requests only:
python3 scripts/capture_live.py
node scripts/check-browser.mjs
```

`production-files.json` explicitly lists all 50 files allowed into `dist/`.
The generated directory is a review bundle, about 1 MB. It contains no Git data,
Wrangler state, docs, scripts, tests or patch files. It has no standalone backend.
`dist/`, captures and screenshots in `.audit/`, and local state are gitignored.
Capture only writes `.audit/`; importing a later capture into the reviewed pages
is a separate deliberate edit.

See [AUDIT.md](AUDIT.md) for retained/deleted files, the live/repository comparison,
verified hostname ownership and the production update procedure awaiting approval.
[cms-wording.patch](cms-wording.patch) is the prepared one-line Worker template
change. It has not been applied to the CMS repository or deployed.
