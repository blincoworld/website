#!/usr/bin/env python3
"""Read-only capture of the two public pages and their transitive assets."""
import hashlib
import json
import re
import subprocess
from email.parser import Parser
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen

ORIGIN = 'https://piersblinco.com'
OUTPUT = Path('.audit/live')

class References(HTMLParser):
    def __init__(self):
        super().__init__(); self.assets = set(); self.links = set()
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('img', 'script', 'source') and a.get('src'):
            self.assets.add(a['src'])
        if a.get('srcset'):
            self.assets.update(s.strip().split()[0] for s in a['srcset'].split(','))
        if tag == 'link' and a.get('rel') != 'canonical' and a.get('href'):
            self.assets.add(a['href'])
        if tag == 'meta' and a.get('property', a.get('name')) in ('og:image', 'twitter:image'):
            self.assets.add(a['content'])
        if tag == 'a' and a.get('href'):
            self.links.add(a['href'])

def capture():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pending = ['/', '/agency-partners', '/brands.json', '/robots.txt', '/sitemap.xml', '/favicon.ico']
    seen = {}; links = {}
    while pending:
        path = pending.pop(0)
        if path in seen: continue
        body = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '30', '-D', '.audit/response-headers', ORIGIN + path])
        raw_headers = Path('.audit/response-headers').read_text().strip().split('\n\n')[-1]
        response_headers = Parser().parsestr(raw_headers.split('\n', 1)[1])
        content_type = response_headers.get_content_type()
        headers = {key: response_headers.get(key) for key in ('Content-Type', 'Content-Security-Policy', 'Cache-Control', 'X-Robots-Tag') if response_headers.get(key)}
        target = 'index.html' if path == '/' else 'agency-partners/index.html' if path == '/agency-partners' else path.lstrip('/')
        out = OUTPUT / target
        out.parent.mkdir(parents=True, exist_ok=True); out.write_bytes(body)
        seen[path] = {'file': target, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'headers': headers}
        refs = set()
        if content_type == 'text/html':
            parser = References(); parser.feed(body.decode()); refs |= parser.assets; links[path] = sorted(parser.links)
        if content_type == 'text/css':
            refs.update(re.findall(r'url\([\s\"\']*([^\)\"\'\s]+)', body.decode()))
        if path == '/brands.json':
            refs.update(b['src'] for b in json.loads(body))
        if path == '/site.js':
            refs.update(re.findall(r"fetch\(['\"]([^'\"]+)", body.decode()))
        for ref in sorted(refs):
            url = urlsplit(urljoin(ORIGIN + path, ref))
            if url.netloc == 'piersblinco.com' and url.path not in seen: pending.append(url.path)
            elif url.netloc and url.netloc != 'piersblinco.com': raise RuntimeError('Unexpected external asset: ' + ref)
    Path('.audit/live-manifest.json').write_text(json.dumps({'origin': ORIGIN, 'files': dict(sorted(seen.items())), 'links': links}, indent=2) + '\n')
    for slug in ['home', 'agency-partners']:
        body = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', ORIGIN + '/api/pages/' + slug])
        Path('.audit/' + slug + '-public-content.json').write_bytes(body)
    print(f'Captured {len(seen)} files, {sum(x["bytes"] for x in seen.values()):,} bytes; no write requests.')

if __name__ == '__main__': capture()
