from http.server import BaseHTTPRequestHandler
from _common import load_templates, send_json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, load_templates())
