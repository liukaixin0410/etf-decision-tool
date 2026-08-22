import json
import sys
from pathlib import Path
from urllib.parse import parse_qs

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / 'backend'
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from data_sources import compute_history_metrics, get_history, now_iso, validated_quote
from scoring import score_etf

def resp(payload, status=200):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(payload, ensure_ascii=False)
    }

def handler(event, context):
    qs = event.get('queryStringParameters') or {}
    code = (qs.get('code') or '').upper().strip()
    if not code:
        return resp({'error': 'missing code'}, 400)
    templates = json.loads((BACKEND / 'templates.json').read_text(encoding='utf-8'))
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
    return resp({
        'code': code,
        'template': template,
        'quote': quote,
        'history_metrics': hist,
        'score': scoring,
        'fetched_at': now_iso(),
        'disclaimer': '免费数据源仅供辅助判断；数据源冲突、过期或不可用时请勿依据本工具下单。',
    })
