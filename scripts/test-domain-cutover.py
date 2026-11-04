#!/usr/bin/env python3
"""Exercise controlled detach/attach and rollback without network access."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cutover', Path(__file__).with_name('domain-cutover.py'))
cutover = importlib.util.module_from_spec(spec); spec.loader.exec_module(cutover)

class Fake:
    def __init__(self, service=cutover.OLD, failure=None):
        self.domains = [{'id':'apex','hostname':cutover.HOST,'zone_id':cutover.ZONE,'environment':'production','enabled':True,'service':service}]
        self.domains += [{'id':host,'hostname':host,'zone_id':cutover.ZONE,'environment':'production','enabled':True,'service':service} for host,service in [('admin.piersblinco.com','website-refresh-outreach'),('partners.piersblinco.com','website-refresh-outreach'),('family.piersblinco.com','family-hub')]]
        self.writes=[]; self.failure=failure
    def __call__(self,path,method='GET',body=None):
        if method=='GET':
            if path!=cutover.ENDPOINT: raise AssertionError('Unexpected endpoint')
            return copy.deepcopy(self.domains)
        self.writes.append((method,path,copy.deepcopy(body)))
        if method=='DELETE':
            current=cutover.owner(self.domains)
            if path!=cutover.ENDPOINT+'/'+current['id']: raise AssertionError('Wrong deletion target')
            self.domains=[d for d in self.domains if d['hostname']!=cutover.HOST]
            if self.failure=='detach-timeout': self.failure=None; raise TimeoutError('Detached, response lost')
            return None
        if method!='PUT' or path!=cutover.ENDPOINT or body['hostname']!=cutover.HOST: raise AssertionError('Unexpected mutation')
        if any(d['hostname']==cutover.HOST for d in self.domains): raise RuntimeError('409: must detach first')
        if self.failure=='attach-fails': self.failure=None; raise RuntimeError('Attachment failed')
        result={**body,'id':body['service']+'-domain','environment':'production'};self.domains.append(result)
        if self.failure=='attach-timeout': self.failure=None; raise TimeoutError('Attached, response lost')
        return copy.deepcopy(result)

class Tests(unittest.TestCase):
    def test_empty_detach_response_is_success(self):
        class EmptyResponse:
            status=204
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self): return b''
        with patch.dict(cutover.os.environ,{'CLOUDFLARE_API_TOKEN':'test-only-placeholder'}), patch.object(cutover.urllib.request,'urlopen',return_value=EmptyResponse()):
            self.assertIsNone(cutover.api(cutover.ENDPOINT+'/apex','DELETE'))
    def test_dry_run_never_writes(self):
        fake=Fake(); result=cutover.move('cutover',client=fake); self.assertEqual([x['method'] for x in result['operations']],['DELETE','PUT']); self.assertEqual(fake.writes,[])
    def test_round_trip_preserves_other_apps(self):
        fake=Fake(); before=cutover.unrelated(fake.domains)
        cutover.move('cutover',True,fake); self.assertEqual(cutover.owner(fake.domains)['service'],cutover.NEW)
        cutover.move('rollback',True,fake); self.assertEqual(cutover.owner(fake.domains)['service'],cutover.OLD)
        self.assertEqual(cutover.unrelated(fake.domains),before)
    def test_conflicting_owner_stops_without_write(self):
        fake=Fake('unexpected-worker')
        with self.assertRaises(RuntimeError): cutover.move('cutover',True,fake)
        self.assertEqual(fake.writes,[])
    def test_missing_or_ambiguous_cutover_owner_stops(self):
        for domains in [[],[Fake().domains[0],Fake().domains[0]]]:
            fake=Fake(); fake.domains=domains
            with self.assertRaises(RuntimeError): cutover.move('cutover',True,fake)
            self.assertEqual(fake.writes,[])
    def test_detach_or_attach_failures_restore_cms(self):
        for failure in ['detach-timeout','attach-fails','attach-timeout']:
            with self.subTest(failure=failure):
                fake=Fake(failure=failure)
                with self.assertRaises((TimeoutError,RuntimeError)): cutover.move('cutover',True,fake)
                self.assertEqual(cutover.owner(fake.domains)['service'],cutover.OLD)
                self.assertEqual(len(cutover.unrelated(fake.domains)),3)
    def test_rollback_recovers_missing_apex(self):
        fake=Fake();fake.domains=cutover.unrelated(fake.domains)
        cutover.move('rollback',True,fake);self.assertEqual(cutover.owner(fake.domains)['service'],cutover.OLD)

if __name__=='__main__': unittest.main()
