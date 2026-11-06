#!/usr/bin/env python3
"""Check the static homepage and privacy notice, their assets, the contact form, the site Worker and the allowlist."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
from xml.etree import ElementTree

root = Path(__file__).resolve().parent.parent
files = set(json.loads((root / 'production-files.json').read_text()))
html = (root / 'index.html').read_text()
# Expected values come from the content the page is rendered from (D-208), not from today's wording.
site = json.loads((root / 'content/site.json').read_text())
home = json.loads((root / 'content/home.json').read_text())
privacy = json.loads((root / 'content/privacy.json').read_text())
# The contact form (D-211) is a movable homepage section; the page has no form controls without it.
has_contact = any(s['type'] == 'contact' for s in home['sections'])
years = site['experienceYears']

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = set(); self.links = []; self.ids = set(); self.meta = {}; self.buttons = []; self.text = []
        self.scripts = []; self.forbidden = []; self.controls = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'): self.ids.add(a['id'])
        if tag == 'nav': self.forbidden.append(tag)
        if tag in ('form', 'input', 'textarea', 'select'): self.controls.append((tag, a.get('name') or a.get('id')))
        if tag == 'button': self.buttons.append(a.get('id') or a.get('class'))
        if tag == 'script': self.scripts.append(a.get('src')); self.assets.add(a.get('src', ''))
        if tag in ('img', 'source') and a.get('src'): self.assets.add(a['src'])
        if a.get('srcset'): self.assets.update(s.strip().split()[0] for s in a['srcset'].split(','))
        if tag == 'link':
            if a.get('rel') == 'canonical': self.canonical = a['href']
            else: self.assets.add(a['href'])
        if tag == 'meta':
            key = a.get('property', a.get('name')); self.meta[key] = a.get('content')
            if key in ('og:image', 'twitter:image'): self.assets.add(a['content'])
        if tag == 'a': self.links.append(a.get('href', ''))
    def handle_data(self, value): self.text.append(value)

page = Page(); page.feed(html)

def check_ref(ref, source):
    if ref.startswith('mailto:'): return
    url = urlsplit(urljoin('https://piersblinco.com' + source, ref))
    assert url.scheme == 'https' and url.netloc == 'piersblinco.com', f'Non-local link/dependency: {ref}'
    if url.path == '/':
        if url.fragment: assert unquote(url.fragment) in page.ids, ref
    else:
        name = url.path.lstrip('/')
        # Pages are served without ".html" (assets html_handling: auto-trailing-slash): /privacy is privacy.html.
        if f'{name}.html' in files: name = f'{name}.html'
        assert name in files and (root / name).is_file(), (source, ref)

assert not page.forbidden, page.forbidden
if has_contact:
    assert page.controls == [('form', 'contact-form'), ('input', 'name'), ('input', 'email'), ('input', 'phone'), ('input', 'business'), ('select', 'need'), ('textarea', 'message'), ('input', 'website')], page.controls
    assert page.buttons == ['brand-pause', 'contact-submit'], page.buttons
    assert 'href="/privacy"' in html.split('id="contact-form"')[1].split('</form>')[0], 'The form links to the privacy notice'
    key = site.get('turnstileSiteKey')
    assert (f'data-sitekey="{key}"' in html) if key else 'data-sitekey' not in html
else:
    assert not page.controls, page.controls
    assert page.buttons == ['brand-pause'], 'Only the functional logo pause control may remain'
assert page.scripts == ['/site.js']
assert page.canonical == 'https://piersblinco.com/'
assert page.meta['og:url'] == page.canonical
assert page.meta['description'] == page.meta['og:description']
assert home['seo']['description'].replace('{years}', str(years)) in page.meta['description'].replace('&amp;', '&')
assert f'experience-number">{years}<span' in html
assert not re.search(r'\b(?:20|30)\s*\+?\s*years', ' '.join(page.text), re.I)
# Markup from the removed agency pages must not come back. (Copy-phrase bans were dropped in D-208: the editor may add links and copy.)
assert not re.search(r'agency-partners|contact-banner|hero-actions', html, re.I)
for ref in page.assets | set(page.links): check_ref(ref, '/')
styles = (root / 'styles.css').read_text()
for ref in re.findall(r'url\([\s\"\']*([^\)\"\'\s]+)', styles): check_ref(ref, '/styles.css')
assert not re.search(r'agency-|contact-banner|hero-actions|article-|#site-nav|#menu-toggle', styles)
assert '.is-changing' in styles and ':focus-visible' in styles and 'prefers-reduced-motion' in styles
brands = json.loads((root / 'brands.json').read_text())
assert brands == [{'name': l['name'], 'src': l['src']} for l in site['logos']] and len({b['src'] for b in brands}) == len(brands)
for brand in brands: check_ref(brand['src'], '/brands.json')
script = (root / 'site.js').read_text()
# Its only requests: the logo list, the visit ping and the contact form (D-210, D-211); the only outside script is Turnstile.
assert re.findall(r"fetch\(['\"]([^'\"]+)", script) == ['/brands.json', '/api/v', '/api/enquiry'], re.findall(r"fetch\(['\"]([^'\"]+)", script)
assert set(re.findall(r'https://[a-z0-9.-]+', script)) == {'https://challenges.cloudflare.com'}
assert not re.search(r'agency-partners|sessionStorage|document\.cookie|#menu-toggle|#site-nav|innerHTML', script)
assert (root / 'assets/fonts/OFL.txt').is_file()
assert {f for f in files if f.endswith('.html')} == {'index.html', 'privacy.html'}
assert set(root.glob('*.html')) == {root / 'index.html', root / 'privacy.html'}
for name in files:
    source = root / name
    assert source.is_file() and not source.is_symlink(), name
    assert source.stat().st_size <= 25 * 1024 * 1024, name
    assert (root / 'dist' / name).read_bytes() == source.read_bytes(), name
actual = {str(p.relative_to(root / 'dist')) for p in (root / 'dist').rglob('*') if p.is_file()}
assert actual == files, 'Build includes extra/missing files'
sitemap = ElementTree.fromstring((root / 'sitemap.xml').read_text())
assert [e.text for e in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')] == ['https://piersblinco.com/', 'https://piersblinco.com/privacy']
assert 'Sitemap: https://piersblinco.com/sitemap.xml' in (root / 'robots.txt').read_text()
# The privacy notice (D-211): rendered from content/privacy.json, linked from the footer, same assets and script.
assert 'href="/privacy"' in html.split('<footer')[1], 'The footer links to the privacy notice'
legal_html = (root / 'privacy.html').read_text()
legal = Page(); legal.feed(legal_html)
assert legal.canonical == 'https://piersblinco.com/privacy'
assert legal.scripts == ['/site.js'] and not legal.forbidden and not legal.controls and not legal.buttons
assert privacy['title'] in legal_html and f"Last updated {privacy['updated']}" in legal_html
assert 'href="/privacy"' in legal_html.split('<footer')[1]
assert not re.search(r'\b(?:20|30)\s*\+?\s*years', ' '.join(legal.text), re.I)
for ref in legal.assets: check_ref(ref, '/privacy')
for ref in legal.links:
    if ref.startswith(('mailto:', 'https://')) and not ref.startswith('https://piersblinco.com'): continue
    check_ref(ref, '/privacy')
# The site Worker (D-209) handles /api/* only and forwards to the Back Office's SiteIngest entrypoint.
wrangler = (root / 'wrangler.jsonc').read_text()
assert '"run_worker_first": ["/api/*"]' in wrangler and '"entrypoint": "SiteIngest"' in wrangler and '"main": "worker/index.js"' in wrangler
assert not (root / 'dist' / 'worker').exists() and 'worker/index.js' not in files
headers = (root / '_headers').read_text()
assert headers.count('https://challenges.cloudflare.com') == 2 and '\n! ' not in headers, 'Turnstile is allowed on the homepage only, without detach rules'
assert headers.count('Content-Security-Policy:') == 3, 'One policy per path: /:file, /assets/* and the homepage'
print(f'PASS: static homepage and privacy notice rendered from content/; {years}-year counter and SEO; contact form {"present" if has_contact else "not on the page"}; site Worker /api/* only; local assets and {len(brands)} logo paths; homepage and privacy sitemap; {len(files)} production files')
