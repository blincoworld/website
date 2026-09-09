"""Local preview only: points the static page at the isolated Business OS Worker."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import re
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def video_fixture(self, head=False):
        if self.path != '/property-films/property-showcase.mp4': return False
        fixture = Path('/tmp/property-films-browser-fixture.mp4')
        film = fixture if fixture.exists() else Path('property-films/property-showcase.mp4')
        if not film.exists(): return False
        size = film.stat().st_size
        requested = self.headers.get('Range', '') if not head else ''
        match = re.fullmatch(r'bytes=(\d+)-(\d*)', requested)
        start = int(match[1]) if match else 0
        end = min(int(match[2]), size - 1) if match and match[2] else size - 1
        if start >= size or end < start:
            self.send_error(416); return True
        self.send_response(206 if match else 200)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        if match: self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if not head:
            try:
                with film.open('rb') as stream:
                    stream.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        chunk = stream.read(min(65536, remaining))
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError): pass
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
