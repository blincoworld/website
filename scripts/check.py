#!/usr/bin/env python3
"""Validate local page, CSS, manifest, metadata and navigation dependencies."""
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
from capture_live import References

root = Path(__file__).resolve().parent.parent
files = set(json.loads((root / 'production-files.json').read_text()))
html = { '/': (root / 'index.html').read_text(), '/agency-partners/': (root / 'agency-partners/index.html').read_text() }
ids = {url: set(re.findall(r'\bid="([^"]+)"', text)) for url, text in html.items()}

def check_ref(ref, source):
    url = urlsplit(urljoin('https://piersblinco.com' + source, ref))
    if url.scheme in ('mailto', 'tel', 'data'): return
    assert url.netloc == 'piersblinco.com', f'Unexpected external dependency: {ref}'
    page = '/' if url.path == '/' else '/agency-partners/' if url.path.rstrip('/') == '/agency-partners' else None
    if page:
        if url.fragment: assert unquote(url.fragment) in ids[page], (source, ref)
    else:
        assert url.path.lstrip('/') in files, (source, ref)
        assert (root / url.path.lstrip('/')).is_file(), ref

for source, text in html.items():
    parser = References(); parser.feed(text)
    for ref in parser.assets | parser.links: check_ref(ref, source)
    assert '<meta name="description"' in text and 'rel="canonical"' in text
    assert 'og:image' in text and 'twitter:card' in text
    assert not re.search(r'property-films|tradeos|fonts.googleapis.com', text, re.I)
for ref in re.findall(r'url\([\s\"\']*([^\)\"\'\s]+)', (root / 'styles.css').read_text()): check_ref(ref, '/styles.css')
for brand in json.loads((root / 'brands.json').read_text()): check_ref(brand['src'], '/brands.json')
assert "fetch('/brands.json')" in (root / 'site.js').read_text()
assert "fetch('/api/enquiries/agency'" in (root / 'enquiry.js').read_text()
assert 'I’ve spent over 30 years building software for businesses that depend on it.' in html['/']
assert 'experience-number">30<span' in html['/']
assert 'experience-number">30<span' in html['/agency-partners/']
assert 'More than 30 years of software, ecommerce and systems experience.' in html['/agency-partners/']
assert '30+ years of relevant experience' in html['/agency-partners/']
assert 'Over 30 years of professional development experience.' in html['/']
assert not any(re.search(r'\b20(?:\+)? years', text) for text in html.values())
assert 'data-enquiry-ready="true"' in html['/agency-partners/']
for name in files:
    path = root / name
    assert path.is_file() and not path.is_symlink(), name
    assert path.stat().st_size <= 25 * 1024 * 1024, name
    assert (root / 'dist' / name).read_bytes() == path.read_bytes(), name
actual = {str(p.relative_to(root / 'dist')) for p in (root / 'dist').rglob('*') if p.is_file()}
assert actual == files, 'Build includes extra/missing files'
print(f'PASS: two pages, navigation/fragments, CSS/font/SEO assets, {len(json.loads((root / "brands.json").read_text()))} dynamic logos, form endpoint, wording, {len(files)} production files and size limits')
