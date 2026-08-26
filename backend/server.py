from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
FRONTEND = ROOT / "frontend"
TEMPLATES_PATH = BASE / "templates.json"
WATCHLIST_PATH = BASE / "watchlist.json"

sys.path.insert(0, str(BASE))
from data_sources import compute_history_metrics, get_history, now_iso, validated_quote  # noqa
from scoring import score_etf  # noqa
from discovery import discover  # noqa
from holdings import get_holdings  # noqa


def load_templates():
    return json.loads(TEMPLATES_PATH.read_text(encoding="utf-8"))


def load_watchlist():
    if WATCHLIST_PATH.exists():
        return json.loads(WATCHLIST_PATH.read_text(encoding="utf-8"))
    return []


def save_watchlist(items):
    WATCHLIST_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def json_response(handler, payload, status=200):
    raw = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (now_iso(), fmt % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/templates":
            return json_response(self, load_templates())
        if parsed.path == "/api/watchlist":
            return json_response(self, {"items": load_watchlist()})
        if parsed.path == "/api/discover":
            return json_response(self, discover())
        if parsed.path == "/api/holdings":
            qs = parse_qs(parsed.query)
            code = (qs.get("code") or [""])[0].upper().strip()
            if not code:
                return json_response(self, {"error": "missing code"}, 400)
            return json_response(self, get_holdings(code))
        if parsed.path == "/api/quote":
            qs = parse_qs(parsed.query)
            code = (qs.get("code") or [""])[0].upper().strip()
            if not code:
                return json_response(self, {"error": "missing code"}, 400)
            return self.handle_quote(code)
        return self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw or "{}")
        except Exception:
            return json_response(self, {"error": "invalid json"}, 400)
        if parsed.path == "/api/watchlist":
            items = body.get("items") or []
            items = [str(x).upper().strip() for x in items if str(x).strip()]
            save_watchlist(items)
            return json_response(self, {"items": items})
        return json_response(self, {"error": "not found"}, 404)

    def handle_quote(self, code: str):
        templates = load_templates()
        template = templates.get(code) or {
            "code": code,
            "name": code,
            "market": "us" if not code.isdigit() else ("cn_sz" if code.startswith(("15", "16", "18")) else "cn_sh"),
            "type": "growth",
            "tracking_index": "未配置",
            "manual_metrics": {},
            "risk_tags": ["未配置模板，估值数据缺失"],
        }
        try:
            quote = validated_quote(code, template)
        except Exception as e:
            quote = {"status": "unavailable", "reason": str(e), "primary": None, "quotes": [], "errors": [{"error": str(e)}], "market": template.get("market")}
        hist_rows = []
        hist = {"ok": False, "error": "not fetched"}
        try:
            hist_rows = get_history(code, template)
            current = (quote.get("primary") or {}).get("price")
            hist = compute_history_metrics(hist_rows, current)
        except Exception as e:
            hist = {"ok": False, "error": str(e)}
        scoring = score_etf(template, quote, hist)
        payload = {
            "code": code,
            "template": template,
            "quote": quote,
            "history_metrics": hist,
            "score": scoring,
            "fetched_at": now_iso(),
            "disclaimer": "免费数据源仅供辅助判断；数据源冲突、过期或不可用时请勿依据本工具下单。",
        }
        return json_response(self, payload)

    def serve_static(self, path):
        if path in {"/", ""}:
            file = FRONTEND / "index.html"
        else:
            rel = path.lstrip("/")
            file = FRONTEND / rel
        try:
            file = file.resolve()
            if not str(file).startswith(str(FRONTEND.resolve())) or not file.exists() or file.is_dir():
                self.send_error(404)
                return
            content = file.read_bytes()
            ctype = "text/plain; charset=utf-8"
            if file.suffix == ".html":
                ctype = "text/html; charset=utf-8"
            elif file.suffix == ".css":
                ctype = "text/css; charset=utf-8"
            elif file.suffix == ".js":
                ctype = "application/javascript; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, str(e))


def main():
    port = int(os.environ.get("PORT") or os.environ.get("ETF_TOOL_PORT", "8877"))
    host = os.environ.get("ETF_TOOL_HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"ETF decision tool running: http://127.0.0.1:{port}")
    if host == "0.0.0.0":
        print("LAN access enabled. Use your Mac LAN IP with this port, for example http://<mac-ip>:%s" % port)
    server.serve_forever()


if __name__ == "__main__":
    main()
