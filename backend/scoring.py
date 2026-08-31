from __future__ import annotations

from typing import Any, Dict, List, Optional


def clamp(x: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, x))


def score_inverse_percentile(p: Optional[float]) -> float:
    if p is None:
        return 45
    return clamp(100 - p)


def score_price_percentile(p: Optional[float]) -> float:
    if p is None:
        return 45
    if p <= 20:
        return 90
    if p <= 40:
        return 75
    if p <= 60:
        return 55
    if p <= 80:
        return 35
    return 15


def score_size(billion: Optional[float]) -> float:
    if billion is None:
        return 55
    if billion >= 10:
        return 95
    if billion >= 5:
        return 85
    if billion >= 1:
        return 70
    if billion >= 0.5:
        return 50
    return 25


def score_amount(amount_yuan: Optional[float], market: str = "cn") -> float:
    if amount_yuan is None:
        return 55
    # CN quotes use yuan. US volume amount may be absent.
    if amount_yuan >= 1_000_000_000:
        return 95
    if amount_yuan >= 200_000_000:
        return 85
    if amount_yuan >= 50_000_000:
        return 70
    if amount_yuan >= 10_000_000:
        return 50
    return 25


def score_premium(premium: Optional[float]) -> float:
    if premium is None:
        return 55
    if premium <= 0:
        return 90
    if premium <= 0.5:
        return 80
    if premium <= 1:
        return 65
    if premium <= 2:
        return 40
    return 10


def score_volatility(vol: Optional[float]) -> float:
    if vol is None:
        return 55
    if vol <= 12:
        return 90
    if vol <= 18:
        return 75
    if vol <= 25:
        return 55
    if vol <= 35:
        return 35
    return 15


def score_expense(expense: Optional[float]) -> float:
    if expense is None:
        return 55
    if expense <= 0.15:
        return 95
    if expense <= 0.3:
        return 85
    if expense <= 0.6:
        return 65
    if expense <= 0.9:
        return 45
    return 25


def data_penalty(data_status: str) -> float:
    if data_status == "trusted":
        return 0
    if data_status == "single_source":
        return 8
    if data_status == "conflict":
        return 35
    return 45


def weighted(items: List[tuple]) -> float:
    total_w = sum(w for _, w in items)
    if not total_w:
        return 0
    return sum(score * w for score, w in items) / total_w


def score_dividend(template: Dict[str, Any], quote: Dict[str, Any], hist: Dict[str, Any], overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    overrides = overrides or {}
    mm = {**(template.get("manual_metrics") or {}), **overrides}
    data_status = quote.get("status")
    primary = quote.get("primary") or {}
    price_p = hist.get("price_percentile_52w")
    dividend_yield = mm.get("dividend_yield")
    dy_score = 50 if dividend_yield is None else clamp((float(dividend_yield) - 2) / 6 * 100)
    dy_percentile = mm.get("dividend_yield_percentile")
    pe_p = mm.get("pe_percentile")
    pb_p = mm.get("pb_percentile")
    valuation_score = (score_inverse_percentile(pe_p) + score_inverse_percentile(pb_p)) / 2
    components = {
        "股息率水平": dy_score,
        "股息率分位": 45 if dy_percentile is None else clamp(float(dy_percentile)),
        "PE/PB估值分位": valuation_score,
        "52周价格分位": score_price_percentile(price_p),
        "分红可持续性": float(mm.get("sustainability_score") or 55),
        "基金规模": score_size(template.get("fund_size_billion")),
        "成交额流动性": score_amount(primary.get("amount")),
        "折溢价": score_premium(mm.get("premium_pct")),
        "费率": score_expense(template.get("expense_ratio")),
        "数据可信度": 100 - data_penalty(data_status),
    }
    base = weighted([
        (components["股息率水平"], 18),
        (components["股息率分位"], 13),
        (components["PE/PB估值分位"], 14),
        (components["52周价格分位"], 10),
        (components["分红可持续性"], 13),
        (components["基金规模"], 8),
        (components["成交额流动性"], 7),
        (components["折溢价"], 5),
        (components["费率"], 5),
        (components["数据可信度"], 7),
    ])
    final = clamp(base - data_penalty(data_status))
    return build_result(final, components, template, quote, hist)


def score_growth(template: Dict[str, Any], quote: Dict[str, Any], hist: Dict[str, Any], overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    overrides = overrides or {}
    mm = {**(template.get("manual_metrics") or {}), **overrides}
    data_status = quote.get("status")
    primary = quote.get("primary") or {}
    components = {
        "估值分位": score_inverse_percentile(mm.get("valuation_percentile")),
        "52周价格分位": score_price_percentile(hist.get("price_percentile_52w")),
        "盈利趋势": float(mm.get("earnings_trend_score") or 55),
        "基金规模": score_size(template.get("fund_size_billion")),
        "成交额流动性": score_amount(primary.get("amount")),
        "折溢价": score_premium(mm.get("premium_pct")),
        "波动率": score_volatility(hist.get("annual_volatility_pct")),
        "政策/汇率风险": float(mm.get("policy_risk_score") or 55),
        "费率": score_expense(template.get("expense_ratio")),
        "数据可信度": 100 - data_penalty(data_status),
    }
    base = weighted([
        (components["估值分位"], 22),
        (components["52周价格分位"], 14),
        (components["盈利趋势"], 13),
        (components["基金规模"], 9),
        (components["成交额流动性"], 9),
        (components["折溢价"], 9),
        (components["波动率"], 6),
        (components["政策/汇率风险"], 6),
        (components["费率"], 5),
        (components["数据可信度"], 7),
    ])
    final = clamp(base - data_penalty(data_status))
    return build_result(final, components, template, quote, hist)


def build_result(score: float, components: Dict[str, float], template: Dict[str, Any], quote: Dict[str, Any], hist: Dict[str, Any]) -> Dict[str, Any]:
    history_missing = hist.get("ok") is False
    if quote.get("status") in {"conflict", "unavailable"}:
        level = "暂停判断"
        action = "数据源不可用或冲突，今天不要依据本工具下单。"
        first_ratio = 0
        max_ratio = 0
    elif history_missing:
        level = "数据不足"
        action = "历史行情未抓到，价格分位/波动率/回撤不可用；暂不输出买入建议，需先修复数据或用券商/权威源核对。"
        first_ratio = 0
        max_ratio = 0
    elif score >= 80:
        level = "积极建仓"
        action = "数据较好，可分批买入计划仓位的40%-50%，仍不要一次满仓。"
        first_ratio = 45
        max_ratio = 100
    elif score >= 65:
        level = "小底仓"
        action = "有一定吸引力，适合买计划仓位的20%-30%，后续按回调或趋势确认加仓。"
        first_ratio = 25
        max_ratio = 70
    elif score >= 50:
        level = "观察等待"
        action = "数据一般，先观察；若已有仓位，不建议追高加仓。"
        first_ratio = 0
        max_ratio = 30
    else:
        level = "暂不买入"
        action = "风险或估值/价格位置不理想，暂不建议新买入。"
        first_ratio = 0
        max_ratio = 0
    risks = list(template.get("risk_tags") or [])
    if template.get("fund_size_billion") is not None and template.get("fund_size_billion") < 1:
        risks.append("基金规模小于1亿元")
    if hist.get("annual_volatility_pct") and hist["annual_volatility_pct"] > 25:
        risks.append("近一年波动率较高")
    if hist.get("price_percentile_52w") and hist["price_percentile_52w"] > 70:
        risks.append("52周价格位置偏高")
    if quote.get("status") == "single_source":
        risks.append("仅单一免费数据源可用")
    if quote.get("status") == "conflict":
        risks.append("免费数据源价格冲突")
    return {
        "score": round(score, 1),
        "score_reliable": not history_missing,
        "level": level,
        "action": action,
        "first_buy_ratio_pct": first_ratio,
        "max_position_ratio_pct": max_ratio,
        "components": {k: round(v, 1) for k, v in components.items()},
        "risk_tags": sorted(set(risks)),
    }


def score_etf(template: Dict[str, Any], quote: Dict[str, Any], hist: Dict[str, Any], overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if template.get("type") in {"dividend_low_vol", "dividend"}:
        return score_dividend(template, quote, hist, overrides)
    return score_growth(template, quote, hist, overrides)
