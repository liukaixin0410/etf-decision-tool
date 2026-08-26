from __future__ import annotations
import json, re
from urllib.request import Request, urlopen

def clean(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    return s.replace('&nbsp;', ' ').replace('&amp;', '&').strip()

def get_holdings(code: str):
    url=f'https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10'
    req=Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':'https://fundf10.eastmoney.com/'})
    try:
        text=urlopen(req, timeout=12).read().decode('utf-8','replace')
        m=re.search(r'截止至：<font[^>]*>([^<]+)', text)
        date=m.group(1) if m else ''
        tbody=(re.search(r'<tbody>([\s\S]*?)</tbody>', text) or [None,''])[1]
        rows=[]
        for tr in re.findall(r'<tr>[\s\S]*?</tr>', tbody):
            tds=re.findall(r'<td[\s\S]*?</td>', tr)
            if len(tds) < 7: continue
            rank_txt=clean(tds[0])
            if not rank_txt.isdigit(): continue
            row={'rank':int(rank_txt), 'code':clean(tds[1]), 'name':clean(tds[2]), 'weight':clean(tds[6])}
            if row['name'] and row['weight']: rows.append(row)
            if len(rows)>=10: break
        return {'code': code, 'source':'eastmoney_fund_archives', 'date':date, 'holdings': rows}
    except Exception as e:
        return {'code': code, 'source':'eastmoney_fund_archives', 'error': str(e), 'holdings': []}
