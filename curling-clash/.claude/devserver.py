#!/usr/bin/env python3
"""Static dev server that disables caching so edits show up on every reload.
Plain `python -m http.server` sends no Cache-Control, so browsers heuristically
cache JS/CSS and keep serving stale files during iteration. This adds no-store."""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


with Server(("", PORT), NoCacheHandler) as httpd:
    print(f"serving on port {PORT} (no-cache)")
    httpd.serve_forever()
