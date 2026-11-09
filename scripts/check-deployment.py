#!/usr/bin/env python3
"""Verify a deployed static build using GET requests only; never submits forms."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit
from xml.etree import ElementTree

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('origin')
parser.add_argument('--label', default='deployment')
args = parser.parse_args()
origin = args.origin.rstrip('/')
url = urlsplit(origin)
assert url.scheme == 'https' and not url.path and not url.query and not url.fragment
assert url.hostname == 'piersblinco.com' or url.hostname.startswith('piers-portfolio-static.') and url.hostname.endswith('.workers.dev'), 'Unexpected deployment target'
assert re.fullmatch('[a-z0-9-]+', args.label)
out = root / '.audit/static-cutover' / args.label
out.mkdir(parents=True, exist_ok=True)
files = json.loads((root / 'production-files.json').read_text())

def get(path, name):
    headers = out / (name.replace('/', '__') + '.headers')
    body = out / (name.replace('/', '__') + '.body')
    status = subprocess.check_output(['curl','--compressed','--silent','--show-error','--location','--max-time','30','-D',str(headers),'-o',str(body),'-w','%{http_code}',origin + path]).decode()
    blocks = headers.read_text().strip().split('\n\n')
    values = {}
    for line in blocks[-1].splitlines()[1:]:
        if ':' in line:
            key,value = line.split(':',1); values[key.lower()] = value.strip()
    return int(status), body.read_bytes(), values

def check(name):
    path = '/' if name == 'index.html' else '/privacy' if name == 'privacy.html' else '/' + name
    status, body, headers = get(path,name)
    assert status == 200, (path,status)
    expected = (root / 'dist' / name).read_bytes()
    # A zone-managed robots policy may prepend its own directives to the file.
    if name == 'robots.txt':
        assert expected.strip() in body, 'Unexpected robots content'
        assert b'Sitemap: https://piersblinco.com/sitemap.xml' in body
    else: assert body == expected, f'Deployed bytes differ: {path}'
    assert headers.get('x-content-type-options') == 'nosniff', path
    assert headers.get('referrer-policy') == 'no-referrer', path
    assert "default-src 'none'" in headers.get('content-security-policy',''), path
    cache = headers.get('cache-control','')
    if name in ['index.html','privacy.html','styles.css','site.js','brands.json','robots.txt','sitemap.xml']: assert 'no-store' in cache, (path,cache)
    # Turnstile (the contact form's spam check, D-211) is allowed on the homepage only.
    csp = headers.get('content-security-policy','')
    assert ('https://challenges.cloudflare.com' in csp) == (name == 'index.html'), (path, csp)
    assert csp.count('default-src') == 1, (path, 'one policy only')
    if name.startswith('assets/'): assert 'max-age=31536000' in cache and 'immutable' in cache, (path,cache)
    if name == 'favicon.ico': assert 'max-age=86400' in cache, (path,cache)
    if name == 'sitemap.xml':
        tree = ElementTree.fromstring(body)
        assert [e.text for e in tree.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')] == ['https://piersblinco.com/', 'https://piersblinco.com/privacy']
    return {'file':name,'status':status,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'cache_control':cache}

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(check,[name for name in files if name != '_headers']))
for index,path in enumerate(['/missing','/agency-partners/','/api/pages/home','/api/enquiries/agency','/property-films/','/offer.html','/_headers']):
    assert get(path,'missing-'+str(index))[0] == 404, f'Unknown route did not return 404: {path}'
# The site Worker's two routes (D-209) take POST only; a GET is refused without reaching the Back Office.
for index,path in enumerate(['/api/v','/api/enquiry']):
    assert get(path,'api-get-'+str(index))[0] == 405, f'GET {path} was not refused'
# The pre-call assessment (D-238): served by the Back Office through the binding, with its own nonce CSP; submissions POST only.
status, body, values = get('/assessment?sector=garage','assessment')
assert status == 200 and b'Tell Me About Your Business' in body and b'name="sector" value="garage"' in body, ('/assessment', status)
assert "script-src 'nonce-" in values.get('content-security-policy',''), values.get('content-security-policy')
assert get('/api/public/assessment','assessment-get')[0] == 405, 'GET /api/public/assessment was not refused'
report = {'origin':origin,'files':results,'logoAssets':sum(r['file'].startswith('assets/brands/') for r in results),'unknownRoutes404':True,'apiRoutesPostOnly':True,'securityAndCacheHeaders':True}
(out/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'PASS: {origin}; {len(results)} production assets HTTP 200, byte/content checks, every logo, favicon/robots/sitemap, cache/security headers, removed/API paths HTTP 404, /api/v and /api/enquiry POST only; /assessment served.')
