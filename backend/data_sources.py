from __future__ import annotations

import csv
import json
import math
import re
import statistics
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 ETFDecisionTool/1.0"


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def fetch_text(url: str, timeout: int = 8, headers: Optional[Dict[str, str]] = None) -> Tuple[str, Dict[str, str]]:
    req = Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        text = raw.decode(charset, errors="replace")
        if "�" in text:
            try:
                text = raw.decode("gbk", errors="replace")
            except Exception:
                pass
        return text, dict(resp.headers.items())


def safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if math.isnan(value) or math.isinf(value):
            return None
        return float(value)
    s = str(value).strip().replace(",", "")
    if not s or s in {"-", "--", "None", "null", "nan"}:
        return None
    try:
        v = float(s)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    except Exception:
        return None


def market_for_code(code: str) -> str:
    code = code.upper().strip()
    if code.isdigit():
        if code.startswith(("15", "16", "18")):
            return "cn_sz"
        return "cn_sh"
    return "us"


def em_sec_id(code: str, market: Optional[str] = None) -> str:
    market = market or market_for_code(code)
    if market == "cn_sh":
        return f"1.{code}"
    if market == "cn_sz":
        return f"0.{code}"
    raise ValueError("Eastmoney secid only supports CN markets")


def sina_symbol(code: str, market: Optional[str] = None) -> str:
    market = market or market_for_code(code)
    if market == "cn_sh":
        return f"sh{code}"
    if market == "cn_sz":
        return f"sz{code}"
    raise ValueError("Sina symbol only supports CN markets")



def quote_tencent_cn(code: str, market: Optional[str] = None) -> Dict[str, Any]:
    market = market or market_for_code(code)
    symbol = ('sh' if market == 'cn_sh' else 'sz') + code
    url = f"https://qt.gtimg.cn/q={symbol}"
    text, _ = fetch_text(url, headers={"Referer": "https://gu.qq.com/", "Accept": "text/plain,*/*"})
    m = re.search(r'="(.*)";', text)
    if not m:
        return {"source": "tencent", "ok": False, "code": code, "error": "empty tencent response", "fetched_at": now_iso()}
    parts = m.group(1).split('~')
    # Tencent A-share quote common fields: 1 name, 2 code, 3 latest, 4 prev close,
    # 5 open, 30 timestamp, 31 change, 32 change pct, 33 high, 34 low.
    name = parts[1] if len(parts) > 1 else code
    price = safe_float(parts[3] if len(parts) > 3 else None)
    prev = safe_float(parts[4] if len(parts) > 4 else None)
    open_p = safe_float(parts[5] if len(parts) > 5 else None)
    change = safe_float(parts[31] if len(parts) > 31 else None)
    pct = safe_float(parts[32] if len(parts) > 32 else None)
    high = safe_float(parts[33] if len(parts) > 33 else None)
    low = safe_float(parts[34] if len(parts) > 34 else None)
    raw_time = parts[30] if len(parts) > 30 else None
    if pct is None and price is not None and prev and prev > 0:
        pct = (price / prev - 1) * 100
    return {
        "source": "tencent",
        "ok": price is not None and price > 0,
        "code": code,
        "name": name or code,
        "price": price,
        "prev_close": prev,
        "change_pct": pct,
        "open": open_p,
        "high": high,
        "low": low,
        "volume": None,
        "amount": None,
        "fetched_at": now_iso(),
        "raw_time": raw_time,
        "error": None,
    }


def history_tencent_cn(code: str, market: Optional[str] = None, days: int = 320) -> List[Dict[str, Any]]:
    market = market or market_for_code(code)
    symbol = ('sh' if market == 'cn_sh' else 'sz') + code
    url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?" + urlencode({"param": f"{symbol},day,,,{days},qfq"})
    text, _ = fetch_text(url, headers={"Referer": "https://gu.qq.com/", "Accept": "application/json,text/plain,*/*"})
    data = json.loads(text).get('data') or {}
    block = data.get(symbol) or {}
    rows_raw = block.get('qfqday') or block.get('day') or []
    rows = []
    for r in rows_raw:
        if len(r) >= 6:
            rows.append({
                "date": r[0],
                "open": safe_float(r[1]),
                "close": safe_float(r[2]),
                "high": safe_float(r[3]),
                "low": safe_float(r[4]),
                "volume": safe_float(r[5]),
                "amount": None,
            })
    return rows


def quote_eastmoney_cn(code: str, market: Optional[str] = None) -> Dict[str, Any]:
    secid = em_sec_id(code, market)
    fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f116,f117,f118,f161,f162,f164,f168,f169,f170,f171,f292"
    url = "https://push2.eastmoney.com/api/qt/stock/get?" + urlencode({
        "secid": secid,
        "fields": fields,
        "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        "invt": "2"
    })
    text, _ = fetch_text(url, headers={"Referer": "https://quote.eastmoney.com/", "Accept": "application/json,text/plain,*/*", "Connection": "close"})
    data = json.loads(text).get("data") or {}
    price = safe_float(data.get("f43"))
    prev = safe_float(data.get("f60"))
    if price is not None and price > 100 and code.isdigit():
        price = price / 1000
    if prev is not None and prev > 100 and code.isdigit():
        prev = prev / 1000
    pct = safe_float(data.get("f170"))
    amount = safe_float(data.get("f48"))
    volume = safe_float(data.get("f47"))
    return {
        "source": "eastmoney",
        "ok": price is not None and price > 0,
        "code": code,
        "name": data.get("f58") or code,
        "price": price,
        "prev_close": prev,
        "change_pct": pct,
        "open": safe_float(data.get("f46")),
        "high": safe_float(data.get("f44")),
        "low": safe_float(data.get("f45")),
        "volume": volume,
        "amount": amount,
        "market_cap": safe_float(data.get("f116")),
        "fetched_at": now_iso(),
        "raw_time": None,
        "error": None,
    }


def quote_sina_cn(code: str, market: Optional[str] = None) -> Dict[str, Any]:
    symbol = sina_symbol(code, market)
    url = f"https://hq.sinajs.cn/list={symbol}"
    text, _ = fetch_text(url, headers={"Referer": "https://finance.sina.com.cn/"})
    m = re.search(r'="(.*)";', text)
    if not m:
        return {"source": "sina", "ok": False, "code": code, "error": "empty sina response", "fetched_at": now_iso()}
    parts = m.group(1).split(",")
    if len(parts) < 32:
        return {"source": "sina", "ok": False, "code": code, "error": "unexpected sina fields", "fetched_at": now_iso()}
    name = parts[0]
    open_p = safe_float(parts[1])
    prev = safe_float(parts[2])
    price = safe_float(parts[3])
    high = safe_float(parts[4])
    low = safe_float(parts[5])
    volume = safe_float(parts[8])
    amount = safe_float(parts[9])
    date = parts[30] if len(parts) > 30 else ""
    tm = parts[31] if len(parts) > 31 else ""
    pct = None
    if price is not None and prev and prev > 0:
        pct = (price / prev - 1) * 100
    return {
        "source": "sina",
        "ok": price is not None and price > 0,
        "code": code,
        "name": name or code,
        "price": price,
        "prev_close": prev,
        "change_pct": pct,
        "open": open_p,
        "high": high,
        "low": low,
        "volume": volume,
        "amount": amount,
        "fetched_at": now_iso(),
        "raw_time": f"{date} {tm}".strip(),
        "error": None,
    }



def _parse_money(value: Any) -> Optional[float]:
    if value is None:
        return None
    return safe_float(str(value).replace("$", "").replace("%", "").replace(",", ""))


def quote_nasdaq_us(symbol: str) -> Dict[str, Any]:
    symbol = symbol.upper()
    url = f"https://api.nasdaq.com/api/quote/{symbol}/info?" + urlencode({"assetclass": "etf"})
    text, _ = fetch_text(url, headers={"Accept": "application/json,text/plain,*/*", "Referer": "https://www.nasdaq.com/"})
    data = (json.loads(text).get("data") or {})
    primary = data.get("primaryData") or {}
    price = _parse_money(primary.get("lastSalePrice"))
    pct = _parse_money(primary.get("percentageChange"))
    change = _parse_money(primary.get("netChange"))
    prev = price - change if price is not None and change is not None else None
    volume = _parse_money(primary.get("volume"))
    return {
        "source": "nasdaq",
        "ok": price is not None and price > 0,
        "code": symbol,
        "name": data.get("companyName") or symbol,
        "price": price,
        "prev_close": prev,
        "change_pct": pct,
        "open": None,
        "high": None,
        "low": None,
        "volume": volume,
        "amount": price * volume if price is not None and volume is not None else None,
        "currency": "USD",
        "fetched_at": now_iso(),
        "raw_time": primary.get("lastTradeTimestamp"),
        "error": None,
    }


def quote_cnbc_us(symbol: str) -> Dict[str, Any]:
    symbol = symbol.upper()
    url = "https://quote.cnbc.com/quote-html-webservice/quote.htm?" + urlencode({"symbols": symbol, "output": "json"})
    text, _ = fetch_text(url, headers={"Accept": "application/json,text/plain,*/*", "Referer": "https://www.cnbc.com/"})
    quick = ((json.loads(text).get("QuickQuoteResult") or {}).get("QuickQuote") or [])
    if isinstance(quick, dict):
        quick = [quick]
    row = quick[0] if quick else {}
    price = safe_float(row.get("last"))
    pct = safe_float(row.get("change_pct"))
    volume = safe_float(row.get("volume") or row.get("fullVolume"))
    return {
        "source": "cnbc",
        "ok": price is not None and price > 0,
        "code": symbol,
        "name": row.get("name") or symbol,
        "price": price,
        "prev_close": None,
        "change_pct": pct,
        "open": safe_float(row.get("open")),
        "high": safe_float(row.get("high")),
        "low": safe_float(row.get("low")),
        "volume": volume,
        "amount": price * volume if price is not None and volume is not None else None,
        "currency": "USD",
        "fetched_at": now_iso(),
        "raw_time": row.get("last_time") or row.get("reg_last_time"),
        "error": None,
    }


def history_nasdaq_us(symbol: str) -> List[Dict[str, Any]]:
    from datetime import date, timedelta
    symbol = symbol.upper()
    end = date.today()
    start = end - timedelta(days=370)
    url = f"https://api.nasdaq.com/api/quote/{symbol}/historical?" + urlencode({
        "assetclass": "etf",
        "fromdate": start.isoformat(),
        "todate": end.isoformat(),
        "limit": "9999",
    })
    text, _ = fetch_text(url, headers={"Accept": "application/json,text/plain,*/*", "Referer": "https://www.nasdaq.com/"})
    rows = (((json.loads(text).get("data") or {}).get("tradesTable") or {}).get("rows") or [])
    out = []
    for r in reversed(rows):
        ds = r.get("date") or ""
        try:
            dt = datetime.strptime(ds, "%m/%d/%Y").date().isoformat()
        except Exception:
            dt = ds
        out.append({
            "date": dt,
            "open": _parse_money(r.get("open")),
            "close": _parse_money(r.get("close")),
            "high": _parse_money(r.get("high")),
            "low": _parse_money(r.get("low")),
            "volume": _parse_money(r.get("volume")),
            "amount": None,
        })
    return out


def _yahoo_chart(symbol: str, range_: str = "1d", interval: str = "1m") -> Dict[str, Any]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?" + urlencode({"range": range_, "interval": interval})
    text, _ = fetch_text(url)
    data = json.loads(text)
    result = (((data or {}).get("chart") or {}).get("result") or [None])[0]
    if not result:
        err = ((data or {}).get("chart") or {}).get("error")
        raise RuntimeError(f"yahoo error: {err}")
    return result


def quote_yahoo_us(symbol: str) -> Dict[str, Any]:
    try:
        result = _yahoo_chart(symbol.upper(), "1d", "1m")
    except Exception:
        result = _yahoo_chart(symbol.upper(), "5d", "1d")
    meta = result.get("meta") or {}
    price = safe_float(meta.get("regularMarketPrice"))
    prev = safe_float(meta.get("chartPreviousClose") or meta.get("previousClose"))
    pct = None
    if price is not None and prev and prev > 0:
        pct = (price / prev - 1) * 100
    t = meta.get("regularMarketTime")
    raw_time = None
    if t:
        raw_time = datetime.fromtimestamp(int(t), tz=timezone.utc).astimezone().isoformat(timespec="seconds")
    return {
        "source": "yahoo",
        "ok": price is not None and price > 0,
        "code": symbol.upper(),
        "name": symbol.upper(),
        "price": price,
        "prev_close": prev,
        "change_pct": pct,
        "open": safe_float(meta.get("regularMarketOpen")),
        "high": safe_float(meta.get("regularMarketDayHigh")),
        "low": safe_float(meta.get("regularMarketDayLow")),
        "volume": safe_float(meta.get("regularMarketVolume")),
        "amount": None,
        "currency": meta.get("currency"),
        "fetched_at": now_iso(),
        "raw_time": raw_time,
        "error": None,
    }


def quote_stooq_us(symbol: str) -> Dict[str, Any]:
    sym = symbol.lower() + ".us"
    url = "https://stooq.com/q/l/?" + urlencode({"s": sym, "f": "sd2t2ohlcv", "h": "", "e": "csv"})
    text, headers = fetch_text(url)
    rows = list(csv.DictReader(text.splitlines()))
    if not rows:
        return {"source": "stooq", "ok": False, "code": symbol.upper(), "error": "empty stooq response", "fetched_at": now_iso()}
    r = rows[0]
    price = safe_float(r.get("Close"))
    prev = None
    return {
        "source": "stooq",
        "ok": price is not None and price > 0,
        "code": symbol.upper(),
        "name": symbol.upper(),
        "price": price,
        "prev_close": prev,
        "change_pct": None,
        "open": safe_float(r.get("Open")),
        "high": safe_float(r.get("High")),
        "low": safe_float(r.get("Low")),
        "volume": safe_float(r.get("Volume")),
        "amount": None,
        "currency": "USD",
        "fetched_at": now_iso(),
        "raw_time": f"{r.get('Date','')} {r.get('Time','')}".strip(),
        "error": None,
        "http_date": headers.get("Date"),
    }


def history_eastmoney_cn(code: str, market: Optional[str] = None, days: int = 370) -> List[Dict[str, Any]]:
    secid = em_sec_id(code, market)
    last_error = None
    for lmt in (days, 260, 120):
        url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + urlencode({
            "secid": secid,
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": "101",
            "fqt": "1",
            "beg": "0",
            "end": "20500101",
            "lmt": str(lmt),
        })
        try:
            text, _ = fetch_text(url, headers={"Referer": "https://quote.eastmoney.com/", "Accept": "application/json,text/plain,*/*", "Connection": "close"})
            data = json.loads(text).get("data") or {}
            rows = []
            for line in data.get("klines") or []:
                p = line.split(",")
                if len(p) >= 7:
                    rows.append({
                        "date": p[0],
                        "open": safe_float(p[1]),
                        "close": safe_float(p[2]),
                        "high": safe_float(p[3]),
                        "low": safe_float(p[4]),
                        "volume": safe_float(p[5]),
                        "amount": safe_float(p[6]),
                    })
            if rows:
                return rows
        except Exception as e:
            last_error = e
    if last_error:
        raise last_error
    return []

def history_yahoo_us(symbol: str, range_: str = "1y") -> List[Dict[str, Any]]:
    result = _yahoo_chart(symbol.upper(), range_, "1d")
    ts = result.get("timestamp") or []
    q = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    rows = []
    for i, t in enumerate(ts):
        close = (q.get("close") or [None] * len(ts))[i]
        if close is None:
            continue
        rows.append({
            "date": datetime.fromtimestamp(int(t), tz=timezone.utc).date().isoformat(),
            "open": safe_float((q.get("open") or [None] * len(ts))[i]),
            "close": safe_float(close),
            "high": safe_float((q.get("high") or [None] * len(ts))[i]),
            "low": safe_float((q.get("low") or [None] * len(ts))[i]),
            "volume": safe_float((q.get("volume") or [None] * len(ts))[i]),
            "amount": None,
        })
    return rows


def compute_history_metrics(rows: List[Dict[str, Any]], current_price: Optional[float] = None) -> Dict[str, Any]:
    closes = [r.get("close") for r in rows if safe_float(r.get("close")) is not None]
    closes = [float(x) for x in closes]
    if not closes:
        return {"ok": False, "error": "no history"}
    price = current_price or closes[-1]
    lo = min(closes)
    hi = max(closes)
    price_percentile = None
    if hi > lo and price is not None:
        price_percentile = max(0.0, min(100.0, (price - lo) / (hi - lo) * 100))
    returns = []
    for a, b in zip(closes, closes[1:]):
        if a and a > 0 and b:
            returns.append(b / a - 1)
    vol = statistics.pstdev(returns) * math.sqrt(252) * 100 if len(returns) > 2 else None
    max_dd = 0.0
    peak = closes[0]
    for c in closes:
        if c > peak:
            peak = c
        if peak > 0:
            dd = c / peak - 1
            if dd < max_dd:
                max_dd = dd
    ma20 = sum(closes[-20:]) / min(20, len(closes)) if closes else None
    ma60 = sum(closes[-60:]) / min(60, len(closes)) if closes else None
    return {
        "ok": True,
        "days": len(closes),
        "low_52w": lo,
        "high_52w": hi,
        "price_percentile_52w": price_percentile,
        "annual_volatility_pct": vol,
        "max_drawdown_pct": max_dd * 100,
        "ma20": ma20,
        "ma60": ma60,
        "last_history_date": rows[-1].get("date"),
    }


def validated_quote(code: str, template: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    code = code.upper().strip()
    market = (template or {}).get("market") or market_for_code(code)
    quotes = []
    errors = []
    if market in {"cn_sh", "cn_sz"}:
        for fn in (quote_eastmoney_cn, quote_tencent_cn, quote_sina_cn):
            try:
                q = fn(code, market)
                quotes.append(q)
            except Exception as e:
                errors.append({"source": fn.__name__, "error": str(e)})
    elif market == "us":
        for fn in (quote_nasdaq_us, quote_cnbc_us, quote_yahoo_us, quote_stooq_us):
            try:
                q = fn(code)
                quotes.append(q)
            except Exception as e:
                errors.append({"source": fn.__name__, "error": str(e)})
    valid = [q for q in quotes if q.get("ok") and safe_float(q.get("price"))]
    status = "unavailable"
    reason = "no valid quote"
    primary = valid[0] if valid else None
    source_gap_pct = None
    if len(valid) >= 2:
        prices = [q["price"] for q in valid]
        avg = sum(prices) / len(prices)
        source_gap_pct = (max(prices) - min(prices)) / avg * 100 if avg else None
        threshold = 0.5 if market in {"cn_sh", "cn_sz"} else 0.8
        if source_gap_pct is not None and source_gap_pct <= threshold:
            status = "trusted"
            reason = "multi-source matched"
            primary = valid[0]
        else:
            status = "conflict"
            reason = f"source price gap {source_gap_pct:.2f}% exceeds threshold {threshold:.2f}%"
    elif len(valid) == 1:
        status = "single_source"
        reason = "only one source available"
        primary = valid[0]
    return {
        "status": status,
        "reason": reason,
        "primary": primary,
        "quotes": quotes,
        "errors": errors,
        "source_gap_pct": source_gap_pct,
        "market": market,
    }


def get_history(code: str, template: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    code = code.upper().strip()
    market = (template or {}).get("market") or market_for_code(code)
    if market in {"cn_sh", "cn_sz"}:
        try:
            return history_eastmoney_cn(code, market)
        except Exception:
            return history_tencent_cn(code, market)
    if market == "us":
        try:
            return history_nasdaq_us(code)
        except Exception:
            return history_yahoo_us(code, "1y")
    return []
