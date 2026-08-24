
from __future__ import annotations
import json, re
from pathlib import Path
from data_sources import quote_tencent_cn, market_for_code
BASE=Path(__file__).resolve().parent

def classify(name):
    n=name or ''
    if re.search(r'货币|现金|添利|保证金', n): return {'excluded': True, 'reason': '货币/现金类ETF，不适用股票ETF评分'}
    if re.search(r'债|国债|地方债|可转债|政金债', n): return {'excluded': True, 'reason': '债券类ETF，不适用当前股票ETF模型'}
    if re.search(r'黄金|原油|豆粕|商品', n): return {'excluded': True, 'reason': '商品类ETF，不适用当前股票ETF模型'}
    if re.search(r'红利|股息|低波|银行|煤炭', n): return {'type': 'dividend_low_vol' if '低波' in n else 'dividend', 'category':'红利/红利低波'}
    if re.search(r'沪深300|上证50|中证500|中证1000|中证2000|A500|A50|恒生|标普|日经|德国|法国|美国50', n): return {'type':'broad','category':'宽基'}
    if re.search(r'创业板|科创|芯片|半导体|科技|人工智能|AI|云计算|计算机|通信|数字|游戏|传媒|机器人|软件|纳指', n): return {'type':'growth','category':'科技成长'}
    if re.search(r'医药|医疗|创新药|生物', n): return {'type':'growth','category':'医药医疗'}
    if re.search(r'消费|酒|食品|家电|旅游', n): return {'type':'growth','category':'消费'}
    if re.search(r'新能源|光伏|电池|汽车|智能车', n): return {'type':'growth','category':'新能源'}
    if re.search(r'证券|券商|金融|地产|基建', n): return {'type':'growth','category':'金融地产周期'}
    return {'type':'growth','category':'待审核'}

def discover(limit=120):
    candidates=json.loads((BASE/'discovery_candidates.json').read_text())
    templates=json.loads((BASE/'templates.json').read_text())
    out=[]
    for code in candidates:
        if code in templates: continue
        try:
            market=market_for_code(code)
            q=quote_tencent_cn(code, market)
            if not q.get('ok'): continue
            cls=classify(q.get('name'))
            row={'code':code,'name':q.get('name'), 'market':market, 'price':q.get('price'), 'pct':q.get('change_pct'), 'time':q.get('raw_time')}
            if cls.get('excluded'):
                row.update({'status':'excluded','reason':cls['reason']})
            else:
                core=bool(re.search(r'沪深300|上证50|中证500|中证1000|A500|A50|红利|恒生|标普|纳指', q.get('name') or ''))
                row.update(cls); row.update({'status':'pending','suggested_pool':'core' if core else 'extended','reason':f"自动识别为{cls['category']}，建议进入{'核心池' if core else '扩展池'}待审核"})
            out.append(row)
            if len(out)>=limit: break
        except Exception:
            pass
    return {'count': len(out), 'items': out}
