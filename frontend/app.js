const $ = (id) => document.getElementById(id);
let templates = {};
let currentCode = '159545';

function fmtNumber(n, digits = 3) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '--';
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: digits });
}
function fmtPct(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '--';
  return `${Number(n).toFixed(digits)}%`;
}
function fmtAmount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '--';
  const v = Number(n);
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return fmtNumber(v, 0);
}

function fmtMaybePct(n, digits = 2) {
  return n === null || n === undefined || Number.isNaN(Number(n)) ? '未填/暂无' : fmtPct(n, digits);
}
function fmtMaybeNumber(n, digits = 2, suffix = '') {
  return n === null || n === undefined || Number.isNaN(Number(n)) ? '未填/暂无' : `${fmtNumber(n, digits)}${suffix}`;
}
function fmtBool(v) {
  return v ? '是' : '否';
}
function metricItem(label, value, note = '') {
  return `<div class="raw-item"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

function getPeerGroup(code, t) {
  const c = String(code || '').toUpperCase();
  const index = t.tracking_index || '';
  if (['159545', '520890', '513630'].includes(c) || index.includes('高股息低波') || index.includes('低波红利')) return ['159545', '513630', '520890'];
  if (['513050', '513220'].includes(c) || index.includes('中国互联网')) return ['513050', '513220'];
  if (['513180', '513130'].includes(c) || index.includes('恒生科技')) return ['513180', '513130'];
  if (['VTI', 'VOO', 'SPY', 'IVV'].includes(c) || index.includes('Total Market') || index.includes('S&P')) return ['VTI', 'VOO'];
  if (['QQQM', 'QQQ'].includes(c) || index.includes('NASDAQ')) return ['QQQM', 'QQQ'];
  return [c];
}
function comparisonSummary(code) {
  const c = String(code || '').toUpperCase();
  const map = {
    '159545': '同指数对比520890：159545规模更大、费率更低，更适合作为恒生港股通高股息低波动方向主仓；同类对比513630：159545费率更低，513630流动性通常更强。',
    '520890': '同指数对比159545：520890指数逻辑相同，但规模偏小、费率较高，不建议作为主仓，除非只小额观察。',
    '513630': '同类对比159545：513630规模和流动性强，适合沪市红利低波主仓；但跟踪的是标普港股通低波红利指数，不是恒生高股息低波指数。',
    '513050': '同类对比513220：513050规模和成交额明显更大，更适合中概互联网主仓；513220价格位置也可能有吸引力，但产品规模较小。',
    '513220': '同类对比513050：513220跟踪指数不同且规模较小，适合补充观察；若做主仓，513050通常更稳妥。',
    '513180': '同指数对比513130：两者都跟踪恒生科技指数，513180规模通常更大，作为恒生科技弹性仓略优先。',
    '513130': '同指数对比513180：两者底层接近，513130可以用，但若只选一只，513180通常更优先。',
    'VTI': '同类对比VOO：VTI覆盖美国全市场，分散度更高；VOO更集中于标普500大盘龙头。当前若已有科技仓，VTI更适合作为美股底座。',
    'QQQM': '同类对比QQQ：QQQM同样跟踪纳斯达克100，费率通常更低，更适合长期持有；但科技集中和估值风险仍高。'
  };
  return map[c] || '暂无内置同类对比。后续可在模板中补充同指数/同类ETF。';
}
function recommendationDegree(score, status) {
  if (status === 'conflict' || status === 'unavailable') return {label:'不推荐', cls:'bad', text:'数据源不可用或冲突，先不做买入动作。'};
  if (score >= 80) return {label:'强推荐分批', cls:'strong', text:'数据较好，可考虑分批建立较完整仓位。'};
  if (score >= 70) return {label:'推荐小买', cls:'good', text:'有吸引力，但仍建议先小底仓。'};
  if (score >= 60) return {label:'谨慎小底仓', cls:'watch', text:'可以观察或极小仓试探，不建议一次性买多。'};
  if (score >= 50) return {label:'暂不推荐', cls:'neutral', text:'当前数据一般，等待更好价格或更可信数据。'};
  return {label:'不推荐', cls:'bad', text:'当前评分偏低，不建议新买入。'};
}
function buildReasons(data) {
  const t = data.template || {};
  const q = data.quote || {};
  const h = data.history_metrics || {};
  const s = data.score || {};
  const comps = s.components || {};
  const mm = t.manual_metrics || {};
  const reasons = [];
  const cautions = [];
  const score = Number(s.score || 0);
  if (q.status === 'trusted') reasons.push('行情通过多源校验，数据可信度较高。');
  if (q.status === 'single_source') cautions.push('当前只有单一免费数据源可用，下单前建议用券商App再核对价格。');
  if (q.status === 'unavailable' || q.status === 'conflict') cautions.push('数据源不可用或冲突，工具暂停买入判断。');
  if (h.price_percentile_52w !== null && h.price_percentile_52w !== undefined) {
    if (h.price_percentile_52w <= 25) reasons.push(`52周价格分位约${fmtPct(h.price_percentile_52w,1)}，位置偏低。`);
    else if (h.price_percentile_52w >= 70) cautions.push(`52周价格分位约${fmtPct(h.price_percentile_52w,1)}，价格位置偏高。`);
    else reasons.push(`52周价格分位约${fmtPct(h.price_percentile_52w,1)}，处于中间区间。`);
  }
  if (t.type === 'dividend_low_vol') {
    if (mm.dividend_yield !== null && mm.dividend_yield !== undefined) reasons.push(`指数股息率模板值约${fmtPct(mm.dividend_yield,2)}，具备红利吸引力。`);
    if (mm.pe_percentile !== null && mm.pe_percentile !== undefined && mm.pe_percentile <= 35) reasons.push(`PE分位约${fmtPct(mm.pe_percentile,1)}，估值不高。`);
    if (t.fund_size_billion !== null && t.fund_size_billion !== undefined && t.fund_size_billion < 1) cautions.push('基金规模小于1亿元，流动性和存续稳定性要谨慎。');
  } else {
    if (mm.valuation_percentile !== null && mm.valuation_percentile !== undefined) {
      if (mm.valuation_percentile <= 35) reasons.push(`估值分位约${fmtPct(mm.valuation_percentile,1)}，估值位置偏低。`);
      else if (mm.valuation_percentile >= 60) cautions.push(`估值分位约${fmtPct(mm.valuation_percentile,1)}，估值不算便宜。`);
    }
    if (h.annual_volatility_pct !== null && h.annual_volatility_pct !== undefined && h.annual_volatility_pct > 25) cautions.push(`近一年波动率约${fmtPct(h.annual_volatility_pct,1)}，仓位需要控制。`);
  }
  if (t.is_qdii) cautions.push('QDII/跨境ETF存在净值滞后、汇率和溢价风险。');
  if (score >= 65) reasons.push('综合评分达到“小底仓”以上，适合按计划分批而非一次性买入。');
  if (score < 65) cautions.push('综合评分未达到明确推荐区间，当前更偏观察。');
  return {reasons, cautions};
}
function renderRecommendation(data) {
  const root = $('recommendationDetails');
  if (!root) return;
  const t = data.template || {};
  const q = data.quote || {};
  const s = data.score || {};
  const score = Number(s.score || 0);
  const degree = recommendationDegree(score, q.status);
  const rc = buildReasons(data);
  const peers = getPeerGroup(data.code, t);
  root.className = 'recommendation-details';
  root.innerHTML = `
    <div class="recommend-card ${degree.cls}">
      <span>是否推荐</span>
      <strong>${degree.label}</strong>
      <small>${degree.text}</small>
    </div>
    <div class="recommend-card">
      <span>推荐程度</span>
      <strong>${fmtNumber(score,1)} / 100</strong>
      <small>首笔建议：${s.first_buy_ratio_pct || 0}%；最高仓位建议：${s.max_position_ratio_pct || 0}%</small>
    </div>
    <div class="recommend-block">
      <h3>推荐原因</h3>
      <ul>${(rc.reasons.length ? rc.reasons : ['暂无明显推荐理由。']).map(x => `<li>${x}</li>`).join('')}</ul>
    </div>
    <div class="recommend-block caution">
      <h3>谨慎点</h3>
      <ul>${(rc.cautions.length ? rc.cautions : ['暂无额外谨慎点。']).map(x => `<li>${x}</li>`).join('')}</ul>
    </div>
    <div class="recommend-block compare">
      <h3>同指数/同类对比</h3>
      <p><strong>同类组：</strong>${peers.join(' / ')}</p>
      <p>${comparisonSummary(data.code)}</p>
    </div>
  `;
}
function setServer(ok, text) {
  const dot = $('serverStatus');
  dot.className = `dot ${ok ? 'ok' : 'bad'}`;
  $('serverStatusText').textContent = text;
}
async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
async function loadTemplates() {
  try {
    templates = await api('/api/templates');
    setServer(true, '运行正常');
    renderChips();
  } catch (e) {
    setServer(false, '无法连接');
    console.error(e);
  }
}
function renderChips() {
  const root = $('templateChips');
  root.innerHTML = '';
  Object.values(templates).forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip ${t.code === currentCode ? 'active' : ''}`;
    btn.textContent = t.code;
    btn.title = t.name;
    btn.onclick = () => {
      currentCode = t.code;
      $('codeInput').value = t.code;
      renderChips();
    };
    root.appendChild(btn);
  });
}
function setScore(score) {
  const val = Number(score);
  $('scoreValue').textContent = Number.isFinite(val) ? val.toFixed(0) : '--';
  const deg = Number.isFinite(val) ? Math.max(0, Math.min(100, val)) * 3.6 : 0;
  let color = '#2563eb';
  if (val < 50) color = '#dc2626';
  else if (val < 65) color = '#d97706';
  else if (val >= 80) color = '#16a34a';
  $('scoreRing').style.background = `conic-gradient(${color} ${deg}deg, #e5e7eb ${deg}deg)`;
}
function renderResult(data) {
  const t = data.template || {};
  const q = data.quote || {};
  const p = q.primary || {};
  const h = data.history_metrics || {};
  const s = data.score || {};
  $('etfTitle').textContent = `${data.code} ${t.name || ''}`;
  $('etfSub').textContent = `${t.tracking_index || '未配置指数'} · ${t.type === 'dividend_low_vol' ? '红利低波' : '非红利/成长'} · ${t.is_qdii ? 'QDII/跨境' : '普通/非QDII'}`;
  setScore(s.score);
  $('verdict').textContent = `${s.level || '--'}：${s.action || ''}`;
  $('price').textContent = fmtNumber(p.price, 3);
  $('changePct').textContent = fmtPct(p.change_pct, 2);
  $('changePct').style.color = p.change_pct > 0 ? '#16a34a' : (p.change_pct < 0 ? '#dc2626' : '#172033');
  $('amount').textContent = fmtAmount(p.amount);
  $('pricePct').textContent = fmtPct(h.price_percentile_52w, 1);
  $('volatility').textContent = fmtPct(h.annual_volatility_pct, 1);
  $('drawdown').textContent = fmtPct(h.max_drawdown_pct, 1);
  const gap = q.source_gap_pct === null || q.source_gap_pct === undefined ? '--' : `${q.source_gap_pct.toFixed(3)}%`;
  $('dataStatus').textContent = `数据状态：${q.status || '--'}；原因：${q.reason || '--'}；源间误差：${gap}；抓取时间：${data.fetched_at || '--'}`;
  renderRisks(s.risk_tags || []);
  renderRecommendation(data);
  renderRawMetrics(data);
  renderComponents(s.components || {});
  renderSources(q);
}
function renderRisks(tags) {
  const root = $('riskTags');
  root.innerHTML = '';
  tags.forEach(x => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = x;
    root.appendChild(span);
  });
}

function renderRawMetrics(data) {
  const root = $('rawMetrics');
  if (!root) return;
  const t = data.template || {};
  const q = data.quote || {};
  const p = q.primary || {};
  const h = data.history_metrics || {};
  const mm = t.manual_metrics || {};
  const isDividend = t.type === 'dividend_low_vol';
  const rows = [];

  rows.push(metricItem('ETF代码', data.code || '--', t.name || ''));
  rows.push(metricItem('跟踪指数', t.tracking_index || '未配置'));
  rows.push(metricItem('ETF类型', isDividend ? '红利/红利低波' : '非红利/成长型'));
  rows.push(metricItem('是否QDII', fmtBool(t.is_qdii), t.is_qdii ? '净值和折溢价可能滞后' : ''));
  rows.push(metricItem('是否跨境/港股相关', fmtBool(t.is_cross_border)));

  rows.push(metricItem('最新价', fmtMaybeNumber(p.price, 3), `来源：${p.source || '--'}`));
  rows.push(metricItem('昨收', fmtMaybeNumber(p.prev_close, 3)));
  rows.push(metricItem('今开', fmtMaybeNumber(p.open, 3)));
  rows.push(metricItem('最高/最低', `${fmtMaybeNumber(p.high, 3)} / ${fmtMaybeNumber(p.low, 3)}`));
  rows.push(metricItem('涨跌幅', fmtMaybePct(p.change_pct, 2)));
  rows.push(metricItem('成交量', fmtMaybeNumber(p.volume, 0)));
  rows.push(metricItem('成交额', fmtAmount(p.amount)));

  rows.push(metricItem('52周最低/最高', `${fmtMaybeNumber(h.low_52w, 3)} / ${fmtMaybeNumber(h.high_52w, 3)}`));
  rows.push(metricItem('52周价格分位', fmtMaybePct(h.price_percentile_52w, 1), '越低代表越接近近一年低位'));
  rows.push(metricItem('20日均线', fmtMaybeNumber(h.ma20, 3)));
  rows.push(metricItem('60日均线', fmtMaybeNumber(h.ma60, 3)));
  rows.push(metricItem('近一年波动率', fmtMaybePct(h.annual_volatility_pct, 1)));
  rows.push(metricItem('近一年最大回撤', fmtMaybePct(h.max_drawdown_pct, 1)));
  rows.push(metricItem('历史价格天数', h.days ? `${h.days}天` : '暂无'));
  rows.push(metricItem('历史数据日期', h.last_history_date || '暂无'));

  if (isDividend) {
    rows.push(metricItem('指数股息率', fmtMaybePct(mm.dividend_yield, 2), '模板/月度慢频数据'));
    rows.push(metricItem('股息率历史分位', fmtMaybePct(mm.dividend_yield_percentile, 1), '模板/可后续手动更新'));
    rows.push(metricItem('PE分位', fmtMaybePct(mm.pe_percentile, 1), '越低越便宜'));
    rows.push(metricItem('PB分位', fmtMaybePct(mm.pb_percentile, 1), '越低越便宜'));
    rows.push(metricItem('分红可持续性评分', fmtMaybeNumber(mm.sustainability_score, 0, '分'), '人工/模板评分'));
  } else {
    rows.push(metricItem('估值分位', fmtMaybePct(mm.valuation_percentile, 1), '越低越便宜；模板慢频数据'));
    rows.push(metricItem('盈利趋势评分', fmtMaybeNumber(mm.earnings_trend_score, 0, '分'), '人工/模板评分'));
    rows.push(metricItem('政策/汇率风险评分', fmtMaybeNumber(mm.policy_risk_score, 0, '分'), '越高代表风险越可控'));
  }

  rows.push(metricItem('基金规模', t.fund_size_billion === null || t.fund_size_billion === undefined ? '未配置' : `${fmtNumber(t.fund_size_billion, 2)}亿元`));
  rows.push(metricItem('综合费率', fmtMaybePct(t.expense_ratio, 2), '管理费+托管费模板值'));
  rows.push(metricItem('模板折溢价', fmtMaybePct(mm.premium_pct, 2), '未填时评分按中性处理'));
  rows.push(metricItem('跟踪误差', fmtMaybePct(mm.tracking_error, 2), '未填时评分按中性处理'));
  rows.push(metricItem('数据状态', q.status || '--', q.reason || ''));
  rows.push(metricItem('源间误差', q.source_gap_pct === null || q.source_gap_pct === undefined ? '暂无' : fmtPct(q.source_gap_pct, 3)));
  rows.push(metricItem('抓取时间', data.fetched_at || '--'));

  root.className = 'raw-metrics';
  root.innerHTML = rows.join('');
}
function renderComponents(components) {
  const root = $('components');
  const entries = Object.entries(components);
  if (!entries.length) { root.textContent = '暂无数据'; root.className = 'components empty'; return; }
  root.className = 'components';
  root.innerHTML = '';
  entries.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'component-row';
    const vv = Math.max(0, Math.min(100, Number(v) || 0));
    row.innerHTML = `<div class="component-top"><span>${k}</span><span>${vv.toFixed(1)}</span></div><div class="bar"><i style="width:${vv}%"></i></div>`;
    root.appendChild(row);
  });
}
function renderSources(q) {
  const root = $('sources');
  const quotes = q.quotes || [];
  if (!quotes.length) { root.textContent = '暂无数据'; root.className = 'sources empty'; return; }
  root.className = 'sources';
  root.innerHTML = '';
  quotes.forEach(src => {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `<div><strong>${src.source}</strong><small>${src.ok ? '可用' : '不可用'} · ${src.raw_time || src.fetched_at || ''}${src.error ? ' · ' + src.error : ''}</small></div><div><strong>${fmtNumber(src.price, 3)}</strong><small>${fmtPct(src.change_pct, 2)}</small></div>`;
    root.appendChild(row);
  });
  (q.errors || []).forEach(err => {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `<div><strong>${err.source || 'error'}</strong><small>${err.error || '抓取失败'}</small></div><div>--</div>`;
    root.appendChild(row);
  });
}
async function analyze(code) {
  currentCode = code.toUpperCase().trim();
  $('codeInput').value = currentCode;
  renderChips();
  $('verdict').textContent = '正在抓取免费数据源并校验...';
  try {
    const data = await api(`/api/quote?code=${encodeURIComponent(currentCode)}`);
    renderResult(data);
    return data;
  } catch (e) {
    $('verdict').textContent = `抓取失败：${e.message}`;
    setScore(null);
    throw e;
  }
}
async function renderWatchlist() {
  const root = $('watchlist');
  root.innerHTML = '<div class="empty">正在刷新观察清单...</div>';
  try {
    const wl = await api('/api/watchlist');
    const items = wl.items || [];
    root.innerHTML = '';
    for (const code of items) {
      const card = document.createElement('div');
      card.className = 'watch-card';
      card.innerHTML = `<strong>${code}</strong><p>正在抓取...</p>`;
      root.appendChild(card);
      try {
        const data = await api(`/api/quote?code=${encodeURIComponent(code)}`);
        const p = (data.quote || {}).primary || {};
        const s = data.score || {};
        card.innerHTML = `<strong>${code} ${data.template.name || ''}</strong><p>最新价：${fmtNumber(p.price, 3)} · ${fmtPct(p.change_pct, 2)}</p><p>评分：${fmtNumber(s.score, 1)} · ${s.level}</p><p>数据：${data.quote.status}</p>`;
        card.onclick = () => { renderResult(data); currentCode = code; $('codeInput').value = code; renderChips(); };
      } catch (e) {
        card.innerHTML = `<strong>${code}</strong><p>抓取失败：${e.message}</p>`;
      }
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">观察清单读取失败：${e.message}</div>`;
  }
}
$('analyzeBtn').onclick = () => analyze($('codeInput').value);
$('refreshAllBtn').onclick = renderWatchlist;
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') analyze($('codeInput').value); });
(async function init() {
  await loadTemplates();
  await analyze(currentCode).catch(() => {});
  renderWatchlist();
})();
