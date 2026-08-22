from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from api_common import load_templates, send_json
from data_sources import compute_history_metrics, get_history, now_iso, validated_quote
from scoring import score_etf

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        code = (qs.get('code') or [''])[0].upper().strip()
        if not code:
            return send_json(self, {'error': 'missing code'}, 400)
        templates = load_templates()
        template = templates.get(code) or {
            'code': code,
            'name': code,
            'market': 'us' if not code.isdigit() else ('cn_sz' if code.startswith(('15', '16', '18')) else 'cn_sh'),
            'type': 'growth',
            'tracking_index': '未配置',
            'manual_metrics': {},
            'risk_tags': ['未配置模板，估值数据缺失'],
        }
        try:
            quote = validated_quote(code, template)
        except Exception as e:
            quote = {'status': 'unavailable', 'reason': str(e), 'primary': None, 'quotes': [], 'errors': [{'error': str(e)}], 'market': template.get('market')}
        try:
            rows = get_history(code, template)
            current = (quote.get('primary') or {}).get('price')
            hist = compute_history_metrics(rows, current)
        except Exception as e:
            hist = {'ok': False, 'error': str(e)}
        scoring = score_etf(template, quote, hist)
        send_json(self, {
            'code': code,
            'template': template,
            'quote': quote,
            'history_metrics': hist,
            'score': scoring,
            'fetched_at': now_iso(),
            'disclaimer': '免费数据源仅供辅助判断；数据源冲突、过期或不可用时请勿依据本工具下单。',
        })
