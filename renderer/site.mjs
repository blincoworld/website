// The one renderer for piersblinco.com (D-208 in the admin app's DECISIONS.md).
//
// Content (content/site.json + content/home.json) goes in; index.html and brands.json come out. The website build
// (scripts/render.mjs, run by scripts/build.py) and the admin app's editor preview both run THIS file: the admin app
// keeps a byte-identical copy, pinned by its git blob SHA, and refuses to publish if the two differ.
//
// Rules for editing this file:
// - No imports, no Node or browser APIs: it runs in Node (the build), a Cloudflare Worker (publish) and the browser
//   (the editor preview).
// - Production output for content/*.json must stay byte-identical to the committed index.html and brands.json
//   (scripts/test-render.mjs checks it).
// - Preview mode only adds markers the editor needs (data-cms* attributes, <cms-f>/<cms-t> wrappers), maps asset URLs
//   and leaves out site.js. Removing those gives the production output exactly (tested in both repos).

export const SCHEMA_VERSION = 1;
export const YEARS_TOKEN = '{years}';
/** How many logos the grid shows before site.js starts rotating the rest in. */
export const LOGO_GRID_COUNT = 6;
export const LOGO_SIZE = { width: 864, height: 231 };
export const LIMITS = { plain: 300, rich: 4000, sections: 40, blocks: 30, paragraphs: 20, items: 12, logos: 200 };

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LOGO_SRC = /^\/assets\/brands\/[a-z0-9][a-z0-9-]{0,80}\.webp$/;
const IMAGE_SRC = /^\/assets\/images\/[a-z0-9][a-z0-9-]{0,80}\.(webp|png)$/;
const ORIGIN = /^https:\/\/[a-z0-9.-]+$/;
const TURNSTILE_KEY = /^[0-9A-Za-z_-]{10,64}$/;
const DAY_TEXT = /^\d{1,2} [A-Z][a-z]+ \d{4}$/;
/** The address the contact form falls back to, and the privacy notice's contact (D-211). */
export const CONTACT_EMAIL = 'piers@piersblinco.com';
/** The contact form's "What do you need?" options; the Back Office accepts exactly these values (D-211). */
export const CONTACT_NEEDS = [
  ['new_website', 'New website'],
  ['online_booking', 'Online booking'],
  ['automations_ai', 'Automations / AI'],
  ['something_else', 'Something else']
];

// ---------------------------------------------------------------------------------------------------------------
// Escaping and rich text

export function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}

/** Link targets allowed in rich text: https/http pages, mailto, site paths and same-page anchors. */
export function isAllowedHref(href) {
  return /^(https?:\/\/[^\s"<>]+|mailto:[^\s"<>]+|\/[^\s"<>]*|#[A-Za-z][\w-]*)$/.test(href) && !/^\/\//.test(href);
}

const ENTITY = /^&(amp|lt|gt|quot|#39|#x27|nbsp|#\d{1,7}|#x[0-9a-fA-F]{1,6});$/;

/**
 * Checks rich text: text with <strong>, <em>, <br> and <a href="..."> only, properly nested, no nested links,
 * entities escaped. Returns null when valid, else a reason.
 */
export function richTextError(html) {
  if (typeof html !== 'string') return 'must be text';
  const stack = [];
  const re = /<\/?([A-Za-z][A-Za-z0-9]*)((?:\s+[^>]*)?)\s*\/?>|&[^\s;&<>]{0,12};?|[<>&]/g;
  let m;
  while ((m = re.exec(html))) {
    const token = m[0];
    if (token[0] === '&') {
      if (!ENTITY.test(token)) return `unescaped “&” near “${html.slice(m.index, m.index + 12)}”`;
      continue;
    }
    if (token === '<' || token === '>') return 'contains a stray “<” or “>”';
    const name = m[1].toLowerCase();
    const closing = token[1] === '/';
    const attrs = (m[2] || '').trim();
    if (name !== m[1]) return `tags must be lower case (${token})`;
    if (!['strong', 'em', 'a', 'br'].includes(name)) return `<${name}> is not allowed (bold, italic, links and line breaks only)`;
    if (name === 'br') {
      if (closing || attrs) return 'line breaks are written <br>';
      continue;
    }
    if (closing) {
      if (attrs) return `bad closing tag ${token}`;
      if (stack.pop() !== name) return `</${name}> doesn't match an open tag`;
      continue;
    }
    if (token.endsWith('/>')) return `<${name}/> isn't allowed`;
    if (name === 'a') {
      const href = /^href="([^"]*)"$/.exec(attrs);
      if (!href) return 'links need exactly one attribute: href="…"';
      const target = href[1].replace(/&amp;/g, '&');
      if (/[<>]/.test(href[1]) || /&(?!amp;)/.test(href[1])) return 'link address is not escaped';
      if (!isAllowedHref(target)) return `link address “${target}” isn't allowed (use https://…, mailto:…, /path or #anchor)`;
      if (stack.includes('a')) return 'links cannot be nested';
    } else if (attrs) {
      return `<${name}> takes no attributes`;
    }
    stack.push(name);
  }
  if (stack.length) return `<${stack[stack.length - 1]}> is not closed`;
  return null;
}

/** Plain text: one line, no control characters. */
function plainError(s, max = LIMITS.plain) {
  if (typeof s !== 'string') return 'must be text';
  if (s.length > max) return `is longer than ${max} characters`;
  if (/[\u0000-\u001f\u007f]/.test(s)) return 'contains a line break or control character';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Validation

/**
 * Validates a content bundle { site, pages: { home } }. Returns { ok, errors: [{ path, message }] }.
 * The same checks run in the editor, on every draft save, at publish and in the website build.
 */
export function validateContent(bundle) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const plain = (path, v, { required = true, max } = {}) => {
    if (!required && v === undefined) return;
    const e = plainError(v, max);
    if (e) err(path, e);
    else if (required && !v.trim()) err(path, 'is required');
  };
  const rich = (path, v, { required = true } = {}) => {
    if (typeof v !== 'string') return err(path, 'must be text');
    if (v.length > LIMITS.rich) return err(path, `is longer than ${LIMITS.rich} characters`);
    if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(v)) return err(path, 'contains a control character');
    const e = richTextError(v);
    if (e) err(path, e);
    else if (required && !v.replace(/<[^>]*>|&nbsp;/g, '').trim()) err(path, 'is required');
  };
  const image = (path, v, { src = IMAGE_SRC, altRequired = true } = {}) => {
    if (!isObj(v)) return err(path, 'must be an image');
    if (typeof v.src !== 'string' || !src.test(v.src)) err(`${path}.src`, 'must be a site image path');
    for (const k of ['width', 'height']) {
      if (!Number.isInteger(v[k]) || v[k] < 1 || v[k] > 4000) err(`${path}.${k}`, 'must be a whole number of pixels (1–4000)');
    }
    if (altRequired || v.alt !== undefined) plain(`${path}.alt`, v.alt, { required: altRequired });
  };
  const id = (path, v, seen) => {
    if (typeof v !== 'string' || !ID.test(v)) err(path, 'must be a short id (a–z, 0–9, hyphens)');
    else if (seen.has(v)) err(path, `id “${v}” is used twice`);
    else seen.add(v);
  };

  if (!isObj(bundle)) return { ok: false, errors: [{ path: '', message: 'content must be an object' }] };
  const { site } = bundle;
  if (!isObj(site)) err('site', 'is missing');
  else {
    if (site.schema !== SCHEMA_VERSION) err('site.schema', `must be ${SCHEMA_VERSION}`);
    plain('site.name', site.name, { max: 80 });
    if (typeof site.origin !== 'string' || !ORIGIN.test(site.origin)) err('site.origin', 'must be an https origin with no trailing slash');
    if (!Number.isInteger(site.experienceYears) || site.experienceYears < 1 || site.experienceYears > 80) err('site.experienceYears', 'must be a whole number of years (1–80)');
    plain('site.footerTagline', site.footerTagline, { max: 160 });
    // The contact form's Cloudflare Turnstile site key (public). Optional: without it the form asks people to email.
    if (site.turnstileSiteKey !== undefined && (typeof site.turnstileSiteKey !== 'string' || !TURNSTILE_KEY.test(site.turnstileSiteKey))) err('site.turnstileSiteKey', 'must be a Turnstile site key');
    if (!Array.isArray(site.logos) || site.logos.length < 1 || site.logos.length > LIMITS.logos) err('site.logos', `must list 1–${LIMITS.logos} logos`);
    else {
      const srcs = new Set();
      site.logos.forEach((logo, i) => {
        const p = `site.logos.${i}`;
        if (!isObj(logo)) return err(p, 'must be a logo');
        plain(`${p}.name`, logo.name, { max: 80 });
        if (typeof logo.src !== 'string' || !LOGO_SRC.test(logo.src)) err(`${p}.src`, 'must be a logo image path (/assets/brands/….webp)');
        else if (srcs.has(logo.src)) err(`${p}.src`, 'this logo image is listed twice');
        else srcs.add(logo.src);
        const extra = Object.keys(logo).filter(k => k !== 'name' && k !== 'src');
        if (extra.length) err(p, `unknown field ${extra[0]}`);
      });
    }
  }

  const page = isObj(bundle.pages) ? bundle.pages.home : undefined;
  if (!isObj(page)) err('pages.home', 'is missing');
  else {
    const P = 'pages.home';
    if (page.schema !== SCHEMA_VERSION) err(`${P}.schema`, `must be ${SCHEMA_VERSION}`);
    if (page.id !== 'home') err(`${P}.id`, 'must be "home"');
    if (page.path !== '/') err(`${P}.path`, 'must be "/"');
    const seo = page.seo;
    if (!isObj(seo)) err(`${P}.seo`, 'is missing');
    else {
      plain(`${P}.seo.title`, seo.title, { max: 120 });
      plain(`${P}.seo.description`, seo.description, { max: 320 });
      plain(`${P}.seo.socialTitle`, seo.socialTitle, { max: 120 });
      plain(`${P}.seo.socialDescription`, seo.socialDescription, { required: false, max: 320 });
      plain(`${P}.seo.socialImageAlt`, seo.socialImageAlt, { max: 420 });
      image(`${P}.seo.socialImage`, seo.socialImage, { altRequired: false });
    }
    const sections = page.sections;
    if (!Array.isArray(sections) || sections.length < 1 || sections.length > LIMITS.sections) err(`${P}.sections`, `must have 1–${LIMITS.sections} sections`);
    else {
      const ids = new Set();
      const counts = { hero: 0, experience: 0, expertise: 0, approach: 0, contact: 0 };
      sections.forEach((s, i) => {
        const p = `${P}.sections.${i}`;
        if (!isObj(s)) return err(p, 'must be a section');
        id(`${p}.id`, s.id, ids);
        switch (s.type) {
          case 'hero':
            counts.hero++;
            if (i !== 0) err(p, 'the hero must be the first section');
            plain(`${p}.eyebrow`, s.eyebrow, { max: 120 });
            plain(`${p}.eyebrowRole`, s.eyebrowRole, { required: false, max: 120 });
            plain(`${p}.headline`, s.headline, { max: 200 });
            plain(`${p}.headlineBlue`, s.headlineBlue, { required: false, max: 200 });
            if (!Array.isArray(s.intro) || s.intro.length < 1 || s.intro.length > LIMITS.paragraphs) err(`${p}.intro`, `must have 1–${LIMITS.paragraphs} paragraphs`);
            else s.intro.forEach((para, j) => rich(`${p}.intro.${j}`, para));
            image(`${p}.portrait`, s.portrait);
            rich(`${p}.experienceLabel`, s.experienceLabel);
            break;
          case 'experience':
            counts.experience++;
            plain(`${p}.eyebrow`, s.eyebrow, { max: 120 });
            plain(`${p}.heading`, s.heading, { max: 200 });
            rich(`${p}.description`, s.description);
            plain(`${p}.caption`, s.caption, { max: 200 });
            plain(`${p}.directoryLabel`, s.directoryLabel, { max: 80 });
            break;
          case 'items':
            if (s.variant !== 'expertise' && s.variant !== 'approach') err(`${p}.variant`, 'must be "expertise" or "approach"');
            else counts[s.variant]++;
            plain(`${p}.eyebrow`, s.eyebrow, { max: 120 });
            plain(`${p}.heading`, s.heading, { max: 200 });
            if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > LIMITS.items) err(`${p}.items`, `must have 1–${LIMITS.items} items`);
            else s.items.forEach((item, j) => {
              if (!isObj(item)) return err(`${p}.items.${j}`, 'must be an item');
              plain(`${p}.items.${j}.title`, item.title, { max: 120 });
              rich(`${p}.items.${j}.text`, item.text);
            });
            break;
          case 'contact':
            counts.contact++;
            plain(`${p}.eyebrow`, s.eyebrow, { max: 120 });
            plain(`${p}.heading`, s.heading, { max: 200 });
            if (!Array.isArray(s.intro) || s.intro.length < 1 || s.intro.length > LIMITS.paragraphs) err(`${p}.intro`, `must have 1–${LIMITS.paragraphs} paragraphs`);
            else s.intro.forEach((para, j) => rich(`${p}.intro.${j}`, para));
            break;
          case 'content':
            if (!Array.isArray(s.blocks) || s.blocks.length < 1 || s.blocks.length > LIMITS.blocks) err(`${p}.blocks`, `must have 1–${LIMITS.blocks} blocks`);
            else s.blocks.forEach((b, j) => {
              const bp = `${p}.blocks.${j}`;
              if (!isObj(b)) return err(bp, 'must be a block');
              id(`${bp}.id`, b.id, ids);
              if (b.type === 'heading') {
                plain(`${bp}.eyebrow`, b.eyebrow, { required: false, max: 120 });
                plain(`${bp}.text`, b.text, { max: 200 });
              } else if (b.type === 'copy') {
                if (!Array.isArray(b.paragraphs) || b.paragraphs.length < 1 || b.paragraphs.length > LIMITS.paragraphs) err(`${bp}.paragraphs`, `must have 1–${LIMITS.paragraphs} paragraphs`);
                else b.paragraphs.forEach((para, k) => rich(`${bp}.paragraphs.${k}`, para));
              } else if (b.type === 'image') {
                image(bp, b);
                if (b.caption !== undefined) rich(`${bp}.caption`, b.caption, { required: false });
              } else err(`${bp}.type`, 'must be heading, copy or image');
            });
            break;
          default:
            err(`${p}.type`, 'unknown section type');
        }
      });
      if (counts.hero !== 1) err(`${P}.sections`, 'must have exactly one hero');
      if (counts.experience !== 1) err(`${P}.sections`, 'must have exactly one experience section');
      if (counts.expertise > 1 || counts.approach > 1) err(`${P}.sections`, '“What I do” and “How I work” can appear once each');
      if (counts.contact > 1) err(`${P}.sections`, 'the contact form can appear once');
    }
  }
  // The privacy notice (D-211): optional in the bundle (the homepage editor works without it), rendered to privacy.html.
  const privacy = isObj(bundle.pages) ? bundle.pages.privacy : undefined;
  if (privacy !== undefined) {
    const P = 'pages.privacy';
    if (!isObj(privacy)) err(P, 'must be a page');
    else {
      if (privacy.schema !== SCHEMA_VERSION) err(`${P}.schema`, `must be ${SCHEMA_VERSION}`);
      if (privacy.id !== 'privacy') err(`${P}.id`, 'must be "privacy"');
      if (privacy.path !== '/privacy') err(`${P}.path`, 'must be "/privacy"');
      plain(`${P}.seoTitle`, privacy.seoTitle, { max: 120 });
      plain(`${P}.seoDescription`, privacy.seoDescription, { max: 320 });
      plain(`${P}.title`, privacy.title, { max: 120 });
      if (typeof privacy.updated !== 'string' || !DAY_TEXT.test(privacy.updated)) err(`${P}.updated`, 'must be a date like “6 November 2026”');
      if (!Array.isArray(privacy.intro) || privacy.intro.length > LIMITS.paragraphs) err(`${P}.intro`, `must have 0–${LIMITS.paragraphs} paragraphs`);
      else privacy.intro.forEach((para, j) => rich(`${P}.intro.${j}`, para));
      if (!Array.isArray(privacy.sections) || privacy.sections.length < 1 || privacy.sections.length > LIMITS.sections) err(`${P}.sections`, `must have 1–${LIMITS.sections} sections`);
      else privacy.sections.forEach((sec, i) => {
        const p = `${P}.sections.${i}`;
        if (!isObj(sec)) return err(p, 'must be a section');
        plain(`${p}.heading`, sec.heading, { max: 200 });
        const paras = sec.paragraphs ?? [], list = sec.list ?? [];
        if (!Array.isArray(paras) || paras.length > LIMITS.paragraphs) err(`${p}.paragraphs`, `must have 0–${LIMITS.paragraphs} paragraphs`);
        else paras.forEach((para, j) => rich(`${p}.paragraphs.${j}`, para));
        if (!Array.isArray(list) || list.length > LIMITS.paragraphs) err(`${p}.list`, `must have 0–${LIMITS.paragraphs} items`);
        else list.forEach((item, j) => rich(`${p}.list.${j}`, item));
        if (Array.isArray(paras) && Array.isArray(list) && !paras.length && !list.length) err(p, 'needs at least one paragraph or list item');
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering

const ICONS = `    <link rel="icon" href="/assets/images/favicon-a14aef9084.ico" sizes="16x16 32x32 48x48" type="image/x-icon">
    <link rel="icon" href="/assets/images/favicon-32-5f175f8291.png" sizes="32x32" type="image/png">
    <link rel="icon" href="/assets/images/favicon-16-e1e3c8dadd.png" sizes="16x16" type="image/png">
    <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon-c3bdb44f4c.png" sizes="180x180">
    <link rel="preload" href="/assets/fonts/inter-variable-693b77d4f3.woff2" as="font" type="font/woff2" crossorigin>
`;

/**
 * Renders the site. Returns { 'index.html': string, 'brands.json': string }, plus 'privacy.html' when the bundle has
 * pages.privacy (production only; the editor preview shows the homepage).
 * options.year: the copyright year (required, so the output never depends on a hidden clock).
 * options.preview: editor markers on; options.resolveAsset(path): maps site paths (preview only).
 */
export function renderSite(bundle, options) {
  const { site } = bundle;
  const page = bundle.pages.home;
  const year = options && options.year;
  if (!Number.isInteger(year)) throw new Error('renderSite needs options.year');
  const preview = !!(options && options.preview);
  const asset = preview && options.resolveAsset ? options.resolveAsset : p => p;
  const years = String(site.experienceYears);

  // Text with {years} substituted. Plain text is escaped; rich text is already safe HTML (validated).
  const yearsHtml = preview ? `<cms-t data-token="years" contenteditable="false">${years}</cms-t>` : years;
  const plainText = s => escapeText(s).split(YEARS_TOKEN).join(yearsHtml);
  const plainAttr = s => escapeAttr(s).split(YEARS_TOKEN).join(years);
  const richText = s => s.split(YEARS_TOKEN).join(yearsHtml);
  // An editable inline field (preview only): <cms-f> is an unknown element, so no site CSS selector matches it.
  const field = (path, html, kind = 'plain') => (preview ? `<cms-f data-cms="${path}" data-kind="${kind}">${html}</cms-f>` : html);
  const plainField = (path, s) => field(path, plainText(s));
  const richField = (path, s) => field(path, richText(s), 'rich');
  // Attributes for elements the editor treats as a unit (preview only). No site CSS uses attribute selectors.
  const attrs = obj => (preview ? Object.entries(obj).map(([k, v]) => ` data-cms-${k}="${escapeAttr(v)}"`).join('') : '');
  const paragraphs = list => list.map(p => `<p>${richText(p)}</p>\n`).join('');

  const P = 'pages.home';
  const seo = page.seo;
  const description = plainAttr(seo.description);
  const socialDescription = seo.socialDescription ? plainAttr(seo.socialDescription) : description;
  const canonical = `${site.origin}${page.path}`;
  const socialImage = `${site.origin}${seo.socialImage.src}`;
  const name = escapeText(site.name);

  const head = `<!doctype html><html lang="en-GB"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeText(seo.title)}</title>
    <meta name="description" content="${description}"><meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">
    <meta property="og:site_name" content="${escapeAttr(site.name)}"><meta property="og:locale" content="en_GB">
    <meta property="og:title" content="${plainAttr(seo.socialTitle)}"><meta property="og:description" content="${socialDescription}">
    <meta property="og:url" content="${canonical}"><meta property="og:type" content="website">
    <meta property="og:image" content="${socialImage}">
    <meta property="og:image:width" content="${seo.socialImage.width}"><meta property="og:image:height" content="${seo.socialImage.height}">
    <meta property="og:image:alt" content="${plainAttr(seo.socialImageAlt)}">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${socialImage}">
    <meta name="twitter:image:alt" content="${plainAttr(seo.socialImageAlt)}">
${preview ? ICONS.replace(/href="([^"]+)"/g, (_, h) => `href="${asset(h)}"`) : ICONS}    <link rel="stylesheet" href="${asset('/styles.css')}">${preview ? '' : '<script type="module" src="/site.js"></script>'}
  </head><body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header"><div class="wrap header-inner">
      <a class="brand" href="/" aria-label="${escapeAttr(site.name)}, home">${name}<span class="brand-dot" aria-hidden="true">.</span></a>
    </div></header>
    <main id="main" tabindex="-1">`;

  const hero = (s, p) => {
    const role = s.eyebrowRole ? ` <span aria-hidden="true">/</span> ${plainField(`${p}.eyebrowRole`, s.eyebrowRole)}` : '';
    const blue = s.headlineBlue ? ` <span class="blue">${plainField(`${p}.headlineBlue`, s.headlineBlue)}</span>` : '';
    const portrait = s.portrait;
    return `<section class="hero consultancy-hero wrap"${attrs({ section: s.id })}><div class="hero-copy"><p class="eyebrow">${plainField(`${p}.eyebrow`, s.eyebrow)}${role}</p>
    <h1>${plainField(`${p}.headline`, s.headline)}${blue}</h1><div class="prose hero-intro"${attrs({ paras: `${p}.intro` })}>${paragraphs(s.intro)}</div>
</div>
    <div class="hero-person"><figure class="portrait-frame"><img class="portrait" src="${escapeAttr(asset(portrait.src))}" alt="${plainAttr(portrait.alt)}" width="${portrait.width}" height="${portrait.height}" fetchpriority="high" decoding="async"${attrs({ image: `${p}.portrait` })}></figure><aside class="experience-note" aria-label="Professional experience"${attrs({ open: 'years' })}><span class="experience-number">${years}<span aria-hidden="true">+</span></span><p>${richField(`${p}.experienceLabel`, s.experienceLabel)}</p></aside></div></section>`;
  };

  const experience = (s, p) => {
    const grid = site.logos.slice(0, LOGO_GRID_COUNT).map(l => `<li class="brand-slot"><img src="${escapeAttr(asset(l.src))}" alt="${escapeAttr(l.name)}" width="${LOGO_SIZE.width}" height="${LOGO_SIZE.height}" decoding="async"></li>`).join('');
    const names = site.logos.map(l => `<li>${escapeText(l.name)}</li>`).join('');
    return `<section class="experience-section wrap" id="experience" aria-labelledby="experience-heading"${attrs({ section: s.id })}><div class="section-top"><div><p class="eyebrow">${plainField(`${p}.eyebrow`, s.eyebrow)}</p><h2 id="experience-heading">${plainField(`${p}.heading`, s.heading)}</h2></div><p class="section-description">${richField(`${p}.description`, s.description)}</p></div>
      <ul class="brand-grid" aria-label="Organisations from previous professional experience"${attrs({ open: 'logos' })}>${grid}</ul>
      <div class="brand-controls"><p>${plainField(`${p}.caption`, s.caption)}</p><button type="button" id="brand-pause" aria-pressed="false" hidden>Pause logo rotation</button></div>
      <details class="brand-directory"${attrs({ open: 'logos' })}><summary>${plainField(`${p}.directoryLabel`, s.directoryLabel)}</summary><ul>${names}</ul></details>
    </section>`;
  };

  const items = (s, p) => {
    const list = s.items.map((item, j) => `<li><strong>${plainField(`${p}.items.${j}.title`, item.title)}</strong> — ${richField(`${p}.items.${j}.text`, item.text)}</li>\n`).join('');
    return `<section class="home-section ${s.variant}-section"${attrs({ section: s.id })}><div class="section-heading"><p class="eyebrow">${plainField(`${p}.eyebrow`, s.eyebrow)}</p><h2>${plainField(`${p}.heading`, s.heading)}</h2></div><div class="prose"><ul>\n${list}</ul>\n</div></section>`;
  };

  const content = (s, p) => {
    const blocks = s.blocks.map((b, j) => {
      const bp = `${p}.blocks.${j}`;
      const mark = attrs({ block: b.id });
      if (b.type === 'heading') {
        const eyebrow = b.eyebrow ? `<p class="eyebrow">${plainField(`${bp}.eyebrow`, b.eyebrow)}</p>` : '';
        return `<div class="section-heading"${mark}>${eyebrow}<h2>${plainField(`${bp}.text`, b.text)}</h2></div>`;
      }
      if (b.type === 'copy') return `<div class="prose"${mark}${attrs({ paras: `${bp}.paragraphs` })}>${paragraphs(b.paragraphs)}</div>`;
      const caption = b.caption ? `<figcaption>${richField(`${bp}.caption`, b.caption)}</figcaption>` : '';
      return `<figure class="content-image"${mark}><img src="${escapeAttr(asset(b.src))}" alt="${plainAttr(b.alt)}" width="${b.width}" height="${b.height}" decoding="async"${attrs({ image: bp })}>${caption}</figure>`;
    }).join('');
    return `<section class="home-section content-section"${attrs({ section: s.id })}>${blocks}</section>`;
  };

  // The contact form (D-211). Its wording is editable; the fields are fixed (the Back Office accepts exactly these).
  // It works only with JavaScript (site.js sends it, with a Cloudflare Turnstile check); without, it says to email.
  const contact = (s, p) => {
    const key = site.turnstileSiteKey ? ` data-sitekey="${escapeAttr(site.turnstileSiteKey)}"` : '';
    const email = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
    const field = (id, label, input, hint = '') => `<div class="field"><label for="cf-${id}">${label}${hint}</label>${input}<p class="field-error" id="cf-${id}-error" hidden></p></div>`;
    const optional = ' <span class="optional">(optional)</span>';
    const needs = CONTACT_NEEDS.map(([v, l]) => `<option value="${v}">${escapeText(l)}</option>`).join('');
    return `<section class="contact-section wrap" id="contact" aria-labelledby="contact-heading"${attrs({ section: s.id })}><div class="contact-intro"><p class="eyebrow">${plainField(`${p}.eyebrow`, s.eyebrow)}</p><h2 id="contact-heading">${plainField(`${p}.heading`, s.heading)}</h2><div class="prose"${attrs({ paras: `${p}.intro` })}>${paragraphs(s.intro)}</div><p class="contact-direct">Or email me at ${email}.</p></div>
      <form class="contact-form" id="contact-form" novalidate${key}>
        ${field('name', 'Name', '<input id="cf-name" name="name" type="text" autocomplete="name" maxlength="100" required aria-describedby="cf-name-error">')}
        ${field('email', 'Email', '<input id="cf-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="cf-email-error">')}
        <div class="field-pair">${field('phone', 'Phone', '<input id="cf-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" aria-describedby="cf-phone-error">', optional)}${field('business', 'Business name', '<input id="cf-business" name="business" type="text" autocomplete="organization" maxlength="150" aria-describedby="cf-business-error">', optional)}</div>
        ${field('need', 'What do you need?', `<select id="cf-need" name="need" required aria-describedby="cf-need-error"><option value="">Choose one</option>${needs}</select>`)}
        ${field('message', 'Message', '<textarea id="cf-message" name="message" rows="6" maxlength="5000" required aria-describedby="cf-message-error"></textarea>')}
        <div class="contact-hp" aria-hidden="true"><label for="cf-website">Leave this field empty</label><input id="cf-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="contact-turnstile" id="cf-turnstile"></div>
        <p class="contact-privacy">I’ll only use your details to reply to you. See the <a href="/privacy">privacy notice</a>.</p>
        <div class="contact-actions"><button type="submit" class="contact-submit">Send message</button></div>
        <div class="contact-status" id="contact-status" role="status" aria-live="polite"></div>
      </form>
      <noscript><p class="contact-noscript">The form needs JavaScript. Please email me at ${email}.</p></noscript>
    </section>`;
  };

  // Hero, experience and the contact form stand alone; each run of "home sections" (items and content) shares one
  // wrapper, so the site's ".home-section + .home-section" divider applies between them.
  const parts = [];
  let run = null;
  page.sections.forEach((s, i) => {
    const p = `${P}.sections.${i}`;
    if (s.type === 'hero' || s.type === 'experience' || s.type === 'contact') {
      run = null;
      parts.push(s.type === 'hero' ? hero(s, p) : s.type === 'experience' ? experience(s, p) : contact(s, p));
      return;
    }
    const html = s.type === 'items' ? items(s, p) : content(s, p);
    if (run) run.push(html);
    else parts.push((run = [html]));
  });
  const main = parts.map(x => (Array.isArray(x) ? `<div class="wrap home-sections">${x.join('')}</div>` : x)).join('\n    ');

  const footer = tagline => `
</main>
    <footer class="site-footer wrap"><div><a class="brand" href="/">${name}<span class="brand-dot" aria-hidden="true">.</span></a><p>${tagline}</p></div>
      <p class="footer-links"><a href="/privacy">Privacy notice</a></p>
      <p class="copyright">© ${year} ${name}</p>
    </footer>
  </body></html>
`;

  const files = {
    'index.html': head + main + footer(plainField('site.footerTagline', site.footerTagline)),
    'brands.json': JSON.stringify(site.logos.map(l => ({ name: l.name, src: l.src })))
  };
  // The privacy notice (D-211), when the bundle has it: the same header, footer, styles and site.js as the homepage.
  const privacy = bundle.pages.privacy;
  if (privacy && !preview) {
    const url = `${site.origin}${privacy.path}`;
    const sections = privacy.sections.map(sec => `<section><h2>${plainText(sec.heading)}</h2>${paragraphs(sec.paragraphs ?? [])}${(sec.list ?? []).length ? `<ul>\n${sec.list.map(li => `<li>${richText(li)}</li>\n`).join('')}</ul>\n` : ''}</section>`).join('\n      ');
    files['privacy.html'] = `<!doctype html><html lang="en-GB"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeText(privacy.seoTitle)}</title>
    <meta name="description" content="${plainAttr(privacy.seoDescription)}"><meta name="robots" content="index, follow">
    <link rel="canonical" href="${url}">
${ICONS}    <link rel="stylesheet" href="/styles.css"><script type="module" src="/site.js"></script>
  </head><body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header"><div class="wrap header-inner">
      <a class="brand" href="/" aria-label="${escapeAttr(site.name)}, home">${name}<span class="brand-dot" aria-hidden="true">.</span></a>
    </div></header>
    <main id="main" tabindex="-1">
    <article class="legal wrap"><h1>${plainText(privacy.title)}</h1><p class="legal-updated">Last updated ${escapeText(privacy.updated)}</p>
      <div class="prose legal-body">${paragraphs(privacy.intro)}
      ${sections}
      </div>
    </article>${footer(plainText(site.footerTagline))}`;
  }
  return files;
}

/**
 * Removes the preview markers from preview output, for the tests that prove preview and production differ only
 * by them: <cms-f>/<cms-t> wrappers and data-cms-* attributes. Asset mapping and site.js are handled by the caller.
 */
export function stripPreviewMarkers(html) {
  return html
    .replace(/<cms-f data-cms="[^"]*" data-kind="[^"]*">/g, '')
    .replace(/<\/cms-f>/g, '')
    .replace(/<cms-t data-token="[a-z]+" contenteditable="false">([^<]*)<\/cms-t>/g, '$1')
    .replace(/ data-cms-[a-z]+="[^"]*"/g, '');
}

/** The copyright year for a build: the current year in London. */
export function siteYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric' }).format(date));
}
