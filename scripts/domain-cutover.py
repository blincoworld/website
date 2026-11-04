#!/usr/bin/env python3
"""Move only the approved apex custom domain; defaults to a read-only dry run."""
import argparse
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

ACCOUNT = 'c39888a9363fce8762763f0c60a9a388'
ZONE = 'ceed470e2cef4ebefa4d4b941e909834'
HOST = 'piersblinco.com'
OLD = 'website-cms'
NEW = 'piers-portfolio-static'
ENDPOINT = f'/accounts/{ACCOUNT}/workers/domains'

def api(path, method='GET', body=None):
    credential = os.environ.get('CLOUDFLARE_API_TOKEN') or (Path.home() / '.config/website-cms/cloudflare-token').read_text().strip()
    request = urllib.request.Request('https://api.cloudflare.com/client/v4' + path, method=method,
        headers={'Authorization': 'Bearer ' + credential, 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
            # Cloudflare's successful detach returns HTTP 204 with no JSON body.
            if not content.strip() and method == 'DELETE': return None
            result = json.loads(content)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Cloudflare HTTP {error.code}: {error.read().decode()[:1000]}') from None
    if not result.get('success'): raise RuntimeError(str(result.get('errors')))
    return result.get('result')

def owner(domains):
    matches = [domain for domain in domains if domain['hostname'] == HOST]
    if len(matches) != 1: raise RuntimeError('STOP: missing or ambiguous apex assignment')
    domain = matches[0]
    if domain['zone_id'] != ZONE or domain.get('environment') != 'production' or not domain.get('enabled'):
        raise RuntimeError('STOP: unexpected apex zone/environment/state')
    return domain

def unrelated(domains):
    return sorted([domain for domain in domains if domain['hostname'] != HOST], key=lambda domain: domain['hostname'])

def payload(service):
    return {'hostname': HOST, 'zone_id': ZONE, 'service': service, 'enabled': True, 'previews_enabled': False}

def restore_cms(client):
    domains = client(ENDPOINT)
    matches = [domain for domain in domains if domain['hostname'] == HOST]
    if len(matches) > 1: raise RuntimeError('STOP: ambiguous apex during recovery')
    if matches:
        current = owner(domains)
        if current['service'] == OLD: return
        if current['service'] != NEW: raise RuntimeError('STOP: unexpected owner during recovery')
        client(ENDPOINT + '/' + current['id'], 'DELETE')
    client(ENDPOINT, 'PUT', payload(OLD))
    if owner(client(ENDPOINT))['service'] != OLD:
        raise RuntimeError('STOP: CMS recovery could not be confirmed')

def move(action, apply=False, client=api):
    desired, expected = (NEW, OLD) if action == 'cutover' else (OLD, NEW)
    before = client(ENDPOINT)
    matches = [domain for domain in before if domain['hostname'] == HOST]
    if not matches and action == 'rollback':
        current = None  # Recovery after a successful detach and failed attach.
    else:
        current = owner(before)
        if current['service'] == desired:
            return {'status': 'already assigned', 'hostname': HOST, 'service': desired}
        if current['service'] != expected:
            raise RuntimeError('STOP: unexpected apex owner: ' + current['service'])
    operations = ([{'method':'DELETE','endpoint':ENDPOINT + '/' + current['id']}] if current else [])
    operations.append({'method':'PUT','endpoint':ENDPOINT,'body':payload(desired)})
    if not apply:
        return {'status':'dry run','operations':operations,'unrelated_domains':'unchanged'}
    try:
        # The existing apex assignment must be detached before Cloudflare accepts
        # a new service. Execute these back-to-back, without DNS/ownership overrides.
        if current: client(ENDPOINT + '/' + current['id'], 'DELETE')
        client(ENDPOINT, 'PUT', payload(desired))
        after = client(ENDPOINT)
        if owner(after)['service'] != desired: raise RuntimeError('Unexpected apex owner after change')
        if unrelated(after) != unrelated(before): raise RuntimeError('Unrelated custom-domain inventory changed')
    except Exception:
        restore_cms(client)
        raise
    return {'status':'assigned','hostname':HOST,'service':desired,'domain':owner(after)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['cutover', 'rollback'])
    parser.add_argument('--apply', action='store_true', help='Apply the exact guarded apex assignment; otherwise read-only')
    args = parser.parse_args()
    try: print(json.dumps(move(args.action, args.apply), indent=2))
    except Exception as error: raise SystemExit(str(error)) from None
