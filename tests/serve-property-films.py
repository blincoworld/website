"""Local preview only: points the static page at the isolated Business OS Worker."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def video_fixture(self, head=False):
        fixture = Path('/tmp/property-films-browser-fixture.mp4')
        if self.path != '/property-films/property-showcase.mp4' or not fixture.exists(): return False
        content = fixture.read_bytes()
        self.send_response(200); self.send_header('Content-Type','video/mp4'); self.send_header('Content-Length',str(len(content))); self.end_headers()
        if not head: self.wfile.write(content)
        return True
    def do_HEAD(self):
        if not self.video_fixture(head=True): super().do_HEAD()
    def do_GET(self):
        if self.video_fixture(): return
        if self.path == '/property-films/config.js':
            content = Path('property-films/config.js').read_text().replace('https://business-os.pbwebonlinesales.workers.dev', 'http://127.0.0.1:8793').encode()
            self.send_response(200); self.send_header('Content-Type','application/javascript'); self.end_headers(); self.wfile.write(content)
        else: super().do_GET()
ThreadingHTTPServer(('127.0.0.1',8792),Handler).serve_forever()
