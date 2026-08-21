from http.server import BaseHTTPRequestHandler
from _common import load_watchlist, send_json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, {'items': load_watchlist()})

    def do_POST(self):
        # Vercel serverless filesystem is not persistent, so keep the built-in watchlist.
        send_json(self, {'items': load_watchlist(), 'note': 'Cloud deployment uses the built-in watchlist.'})
