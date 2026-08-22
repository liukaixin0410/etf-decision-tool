import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def handler(event, context):
    data = json.loads((ROOT / 'backend' / 'watchlist.json').read_text(encoding='utf-8'))
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'items': data}, ensure_ascii=False)
    }
