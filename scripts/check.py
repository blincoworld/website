#!/usr/bin/env python3
"""Check the standalone homepage, transitive assets and production allowlist."""
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
years = site['experienceYears']

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = set(); self.links = []; self.ids = set(); self.meta = {}; self.buttons = []; self.text = []
        self.scripts = []; self.forbidden = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'): self.ids.add(a['id'])
        if tag in ('form', 'input', 'textarea', 'nav'): self.forbidden.append(tag)
        if tag == 'button': self.buttons.append(a.get('id'))
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
    url = urlsplit(urljoin('https://piersblinco.com' + source, ref))
    assert url.scheme == 'https' and url.netloc == 'piersblinco.com', f'Non-local link/dependency: {ref}'
    if url.path == '/':
        if url.fragment: assert unquote(url.fragment) in page.ids, ref
    else:
        name = url.path.lstrip('/')
        assert name in files and (root / name).is_file(), (source, ref)

assert not page.forbidden, page.forbidden
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
assert not re.search(r'agency-|enquiry|contact-banner|hero-actions|article-|#site-nav|#menu-toggle', styles)
assert '.is-changing' in styles and ':focus-visible' in styles and 'prefers-reduced-motion' in styles
brands = json.loads((root / 'brands.json').read_text())
assert brands == [{'name': l['name'], 'src': l['src']} for l in site['logos']] and len({b['src'] for b in brands}) == len(brands)
for brand in brands: check_ref(brand['src'], '/brands.json')
script = (root / 'site.js').read_text()
assert re.findall(r"fetch\(['\"]([^'\"]+)", script) == ['/brands.json']
assert not re.search(r'/api/|agency-partners|enquiry|sessionStorage|#menu-toggle|#site-nav', script)
assert (root / 'assets/fonts/OFL.txt').is_file()
assert {f for f in files if f.endswith('.html')} == {'index.html'}
assert set(root.glob('*.html')) == {root / 'index.html'}
for name in files:
    source = root / name
    assert source.is_file() and not source.is_symlink(), name
    assert source.stat().st_size <= 25 * 1024 * 1024, name
    assert (root / 'dist' / name).read_bytes() == source.read_bytes(), name
actual = {str(p.relative_to(root / 'dist')) for p in (root / 'dist').rglob('*') if p.is_file()}
assert actual == files, 'Build includes extra/missing files'
sitemap = ElementTree.fromstring((root / 'sitemap.xml').read_text())
assert [e.text for e in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')] == ['https://piersblinco.com/']
assert 'Sitemap: https://piersblinco.com/sitemap.xml' in (root / 'robots.txt').read_text()
print(f'PASS: one static homepage rendered from content/; {years}-year counter and SEO; no forms/APIs; local assets and {len(brands)} logo paths; homepage-only sitemap; {len(files)} production files')
