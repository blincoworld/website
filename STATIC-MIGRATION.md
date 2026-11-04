# Static portfolio preparation and migration review — 4 November 2026

## Prepared result

The Website repository now contains one standalone static homepage. Its HTML is
the authoritative content source; the build just copies an explicit allowlist.
No CMS rendering, D1, R2 binding, SMTP, session token, credentials or external
font/image service is needed to view or interact with it.

The latest amendment supersedes previous experience wording:

- Counter: **25+ years of professional development experience**.
- Heading: **I’ve spent over 25 years building software for businesses that depend on it.**
- SEO and Open Graph description: **Over 25 years of professional development experience.**

The retained design and content are the existing positioning, main headline,
introductory paragraph, portrait, professional experience section, 33 rotating
logos, What I do, How I work and minimal footer branding. No design rewrite or
asset replacement was performed. Removing CTA blocks lets the existing grid and
spacing flow naturally without empty placeholders.

## Cleanup inventory

Retained:

- `index.html`, `styles.css`, logo-only `site.js` and `brands.json`.
- All 33 logo WebPs: only six are initially visible, but the JavaScript queue
  uses the entire manifest. The directory also lists all 33 names without JS.
- Local Inter font and its licence, the portrait WebP, social preview and branded
  favicons, including the root favicon fallback.
- Existing robots directives, a homepage-only sitemap and static security headers.
- Git/history, explicit build allowlist, local checks and current documentation.

Removed from the homepage:

- Hero action links, including Discuss your project and Explore my experience.
- The Let's talk/contact banner and its project CTA.
- Footer contact/Agency navigation and unused hidden hero detail markup.

Removed from the repository:

- `agency-partners/` and `enquiry.js`. Its font/portrait/styles were shared and
  were retained where the homepage needs them; no dedicated Agency assets remain.
- `scripts/capture_live.py`: the static source no longer imports a CMS capture.
- `cms-wording.patch`, `AUDIT.md`, `EXPERIENCE-RELEASE.md`,
  `EXPERIENCE-COMPLETION.md` and `EXPERIENCE-CONTENT-PLAN.md`: superseded release
  instructions remain recoverable in Git history.
- Unused menu JavaScript and 175 unused CSS selectors for Agency, enquiries,
  article/page templates, CTAs and obsolete navigation. Dynamic logo/focus/hidden
  states were explicitly retained rather than inferred unused from initial HTML.

No files outside `~/website` were deleted or edited. The separate CMS repository
and its recoverable content backups remain intact. Production files are listed
individually in `production-files.json`; docs, tests, `.git`, `.wrangler`, local
backups and screenshots cannot enter `dist/` through that build.

## Existing production hosting, inspected read-only

The current account API reports `website-cms` production version
`79fc8a1e-9f8f-4af9-b2de-a360b61496a3` serving 100% of traffic.
The public custom domain `piersblinco.com` belongs to that Worker.

Source inspection of `~/website-cms` confirms:

- `worker.js` dispatches public requests to `website/routes.js`.
- `/` queries the D1 `pages` record `home`, then renders it with Worker templates.
  `/agency-partners` uses the same content store and a dedicated renderer.
- Public CSS, scripts, font, portrait, logos and social assets are bundled modules,
  served by the Worker at exact public asset paths. Uploaded media uses R2.
- `DB` is `website-cms-db` (`9186994d-08df-4481-99ac-54f9d24a1978`);
  `MEDIA` is `website-cms-media`. The existing public enquiry endpoint belongs
  to the Agency page and uses D1 plus existing SMTP/HMAC secret bindings.
- Public release settings still allow `home,agency-partners`. The present live
  site and its 30-year wording remain unchanged by this preparation.
- `admin.piersblinco.com`, `testing.piersblinco.com` and
  `partners.piersblinco.com` belong to `website-refresh-outreach`, the current
  Testing application. Family Hub has its own Worker/domain. Neither was changed.
- There are no zone Worker route patterns; hostname ownership uses custom domains.
- The CMS source config still contains a stale admin-domain entry. It must not
  be reused for the static deployment or allowed to reclaim Testing's hostname.

The static page was extracted from the existing design once and is now ordinary
HTML. It does not call these content routes, enquiry routes or storage bindings.
Retiring the current Worker now would still break production, so it remains intact.

## Recommended migration path — review required, not executed

Use **Cloudflare Workers Static Assets** for the independent static site. It can
serve a directory without CMS code or database bindings. Reference documentation:
[Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/),
[HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

1. Review this static homepage and its 25-year wording at desktop, tablet and
   mobile sizes. Keep `dist/` as the only publish directory and review `_headers`.
2. After separate approval to create a staging deployment, use a **new, separately
   named static Worker**, for example `piers-portfolio-static`, on a preview-only
   `workers.dev` address. Such previews are public. Give it no production custom
   domains, no CMS entry point, no D1/R2/SMTP bindings and no credentials. Pin a
   local Wrangler version when preparing that hosting project; no deployment CLI
   or deployable production config is added to this repository by this task.
3. Configure `assets.directory` to `./dist`. Use ordinary HTML serving, with
   `not_found_handling: "none"`, not an SPA fallback. Verify the homepage and all
   assets, 25-year metadata, rotation, pause, directory, security headers, robots
   and sitemap. Removed Agency/API URLs should return 404. The static site must
   never silently fall back to the old CMS or enquiry handler.
4. Before cutover, record the old Worker version, domain assignment and current
   content/resource backups. Review the intentional removal of the Agency URL
   from production. Preserve the old Worker/resources for rollback and any
   outstanding enquiry retention obligations; don't copy them into the static site.
5. Obtain explicit approval for moving **only `piersblinco.com`** to the reviewed
   static Worker. Change that custom-domain assignment in a controlled cutover;
   do not apply the old CMS route list. Recheck the exact hostname ownership first.
   Admin, Testing, partners, Family Hub and other hostnames are outside the cutover.
6. Verify HTTPS, homepage/assets, canonical/social metadata, robots/sitemap, all
   interactions and removed-route 404s on the live domain. Confirm the other
   hostname assignments remain untouched. If rollback is needed, restore only
   the public-domain assignment to the still-running original CMS Worker.
7. Only after a successful observation period and separate approval should the
   CMS, data, media and enquiry retention/recovery plan be reviewed for retirement.
   This task does not retire, modify or delete any of them.

No Worker, Pages deployment, route change, domain change, database write or binding
change was made for this task. Pushing GitHub updates the static source only; it
does not publish this version to the live domain.

## Validation record

The checks and final build size are recorded below after running the completed
static build and real-browser verification. Test servers are loopback file-only
servers; they have no proxy, credentials, database, SMTP or CMS route implementation.

- Build: **49 allowlisted files, 968,860 bytes (946.15 KiB)** uncompressed.
- Largest file: Inter font, 352,240 bytes; all files are below 25 MiB.
- Static dependency/content checks and JavaScript syntax checks pass.
- Real Chrome at 1440, 768 and 375px: portrait and fonts load, no horizontal
  overflow, no missing assets or JavaScript errors. All 33 logo images decode.
- On the same simplified 25-year HTML, screenshots using the trimmed stylesheet
  are pixel-identical to screenshots using the original full stylesheet at all
  three widths. This isolates CSS cleanup from the intentional CTA removals.
- Rotation, a sustained pause, resume, reduced motion, keyboard view-all with all
  33 organisation names, keyboard skip link and no-JavaScript fallback pass.
- Browser traffic stays on loopback and consists only of local static requests.
  The page makes no CMS/API call. Separate test-harness probes confirm removed
  pages and API paths return 404 rather than rendering the homepage or proxying.
- The counter, heading, description and Open Graph description all use 25 years;
  no 30-year experience claim remains in homepage text or metadata.
- Final read-only audit confirms the production Worker version, bindings, domain
  ownership and zone routes match the pre-task snapshot. No production deployment
  or infrastructure change was performed.
