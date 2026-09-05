const $ = (id) => document.getElementById(id);
let templates = {};
let currentCode = '159545';
let poolResults = [];
let scanningPool = false;

let indexResults = [];
let scanningIndex = false;
function representativeForGroup(list) {
  return [...list].sort((a,b) => {
    const pa = poolOf(a) === 'core' ? 1 : 0;
    const pb = poolOf(b) === 'core' ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return Number(b.fund_size_billion || 0) - Number(a.fund_size_billion || 0);
  })[0];
}
function groupedIndexes() {
  const groups = new Map();
  Object.values(templates).forEach(t => {
    const key = t.tracking_index || `未配置指数-${t.code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  return Array.from(groups.entries()).map(([indexName, etfs]) => ({indexName, etfs, representative: representativeForGroup(etfs)}));
}
function indexFilteredGroups() {
  const cat = $('indexCategoryFilter')?.value || 'all';
  const market = $('indexMarketFilter')?.value || 'all';
  const nature = $('indexNaturePageFilter')?.value || 'all';
  const text = ($('indexSearch')?.value || '').trim().toLowerCase();
  return groupedIndexes().filter(g => {
    const r = g.representative || {};
    if (cat !== 'all' && categoryOf(r) !== cat) return false;
    if (market !== 'all' && marketGroup(r) !== market) return false;
    if (nature !== 'all' && (isCustomIndex(r) ? 'custom' : 'standard') !== nature) return false;
    if (text) {
      const hay = `${g.indexName} ${g.etfs.map(x => `${x.code} ${x.name}`).join(' ')}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
function renderIndexCategoryOptions() {
  const select = $('indexCategoryFilter');
  if (!select || select.dataset.ready === '1') return;
  const categories = Array.from(new Set(Object.values(templates).map(categoryOf))).sort();
  for (const c of categories) {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; select.appendChild(opt);
  }
  select.dataset.ready = '1';
}
function renderHoldings(holdings) {
  if (!holdings || !holdings.length) return '<div class="holding-empty">暂无Top 10持仓数据（部分海外ETF/免费源可能缺失）。</div>';
  return `<div class="holdings-table">
    <div class="holding-head"><span>成分股</span><span>占比</span><span>1年价格分位</span><span>PE</span><span>PE分位</span></div>
    ${holdings.slice(0,10).map(h => `<div class="holding-row rich-holding-row">
      <span title="${h.code || ''}">${h.rank}. ${h.name}</span>
      <strong>${h.weight || '--'}</strong>
      <strong>${fmtMaybePct(h.price_percentile_1y, 1)}</strong>
      <strong>${fmtMaybeNumber(h.pe, 2, '倍')}</strong>
      <strong>${fmtMaybePct(h.pe_percentile, 1)}</strong>
    </div>`).join('')}
  </div>`;
}

function renderIndexDimensions(d) {
  const t = d.representative || {};
  const h = d.history_metrics || {};
  const q = d.quote || {};
  const s = d.score || {};
  const mm = t.manual_metrics || {};
  const comps = s.components || {};
  const isDividend = ['dividend_low_vol', 'dividend'].includes(t.type);
  const rows = [];
  rows.push(['指数类别', categoryOf(t)]);
  rows.push(['市场', marketLabel(t)]);
  rows.push(['同指数ETF数量', `${(d.etfs || []).length}只`]);
  rows.push(['指数属性', indexNatureLabel(t)]);
  rows.push(['代表ETF规模', t.fund_size_billion == null ? '未配置' : `${fmtNumber(t.fund_size_billion, 2)}亿元`]);
  rows.push(['综合费率', fmtMaybePct(t.expense_ratio, 2)]);
  rows.push(['滚动PE', fmtMaybeNumber(rollingPeValue(t), 2, '倍')]);
  rows.push(['滚动PE分位', fmtMaybePct(rollingPePercentile(t), 1)]);
  rows.push(['数据状态', q.status || '--']);
  rows.push(['1年价格分位', fmtMaybePct(h.price_percentile_52w, 1)]);
  rows.push(['2年价格分位', fmtMaybePct(h.price_percentile_2y, 1)]);
  rows.push(['3年价格分位', fmtMaybePct(h.price_percentile_3y, 1)]);
  rows.push(['5年价格分位', fmtMaybePct(h.price_percentile_5y, 1)]);
  rows.push(['10年价格分位', fmtMaybePct(h.price_percentile_10y, 1)]);
  rows.push(['52周最低/最高', `${fmtMaybeNumber(h.low_52w, 3)} / ${fmtMaybeNumber(h.high_52w, 3)}`]);
  rows.push(['1年年化收益率', fmtMaybePct(h.annualized_return_1y, 1)]);
  rows.push(['3年年化收益率', fmtMaybePct(h.annualized_return_3y, 1)]);
  rows.push(['5年年化收益率', fmtMaybePct(h.annualized_return_5y, 1)]);
  rows.push(['10年年化收益率', fmtMaybePct(h.annualized_return_10y, 1)]);
  rows.push(['近一年波动率', fmtMaybePct(h.annual_volatility_pct, 1)]);
  rows.push(['近一年最大回撤', fmtMaybePct(h.max_drawdown_pct, 1)]);
  if (isDividend) {
    rows.push(['指数股息率', fmtMaybePct(mm.dividend_yield, 2)]);
    rows.push(['股息率分位', fmtMaybePct(mm.dividend_yield_percentile, 1)]);
    rows.push(['PE分位', fmtMaybePct(mm.pe_percentile, 1)]);
    rows.push(['PB分位', fmtMaybePct(mm.pb_percentile, 1)]);
    rows.push(['分红可持续性', fmtMaybeNumber(mm.sustainability_score, 0, '分')]);
  } else {
    rows.push(['估值分位', fmtMaybePct(mm.valuation_percentile, 1)]);
    rows.push(['盈利趋势', fmtMaybeNumber(mm.earnings_trend_score, 0, '分')]);
    rows.push(['政策/汇率风险', fmtMaybeNumber(mm.policy_risk_score, 0, '分')]);
  }
  const topComponents = Object.entries(comps).slice(0, 6);
  const componentHtml = topComponents.length ? `<div class="index-components">${topComponents.map(([k,v]) => `<div class="index-component"><span>${k}</span><strong>${fmtNumber(v,1)}</strong></div>`).join('')}</div>` : '';
  return `<details class="index-dimensions" open>
    <summary>评分维度与评估指标</summary>
    <div class="index-dimension-grid">${rows.map(([k,v]) => `<div class="index-dimension"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
    ${componentHtml}
  </details>`;
}

function renderIndexRankList(items = indexResults) {
  const root = $('indexRankList');
  const summary = $('indexSummary');
  if (!root) return;
  const cat = $('indexCategoryFilter')?.value || 'all';
  const market = $('indexMarketFilter')?.value || 'all';
  const scoreF = $('indexScoreFilter')?.value || 'all';
  const nature = $('indexNaturePageFilter')?.value || 'all';
  const rec = $('indexRecommendFilter')?.value || 'all';
  const text = ($('indexSearch')?.value || '').trim().toLowerCase();
  let list = items.filter(d => {
    const t = d.representative || {};
    const score = Number(d.score?.score || 0);
    const bucket = recommendationBucket(score, d.quote?.status);
    if (cat !== 'all' && categoryOf(t) !== cat) return false;
    if (market !== 'all' && marketGroup(t) !== market) return false;
    if (scoreF !== 'all' && scoreBucket(score, d.quote?.status) !== scoreF) return false;
    if (nature !== 'all' && (isCustomIndex(t) ? 'custom' : 'standard') !== nature) return false;
    if (rec === 'recommended' && !['buy','cautious'].includes(bucket)) return false;
    if (rec !== 'all' && rec !== 'recommended' && bucket !== rec) return false;
    if (text) {
      const hay = `${d.indexName} ${d.etfs.map(x => `${x.code} ${x.name}`).join(' ')}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  }).sort((a,b) => Number(b.score?.score || 0) - Number(a.score?.score || 0));
  if (summary) summary.textContent = `当前显示 ${list.length} / ${indexResults.length || groupedIndexes().length} 个指数；按指数推荐买入值降序排列。Top10为代表ETF披露持仓。`;
  if (!list.length) { root.className = 'index-rank-list empty'; root.textContent = scanningIndex ? '正在扫描指数...' : '暂无符合条件的指数'; return; }
  root.className = 'index-rank-list';
  root.innerHTML = list.map((d, idx) => {
    const t = d.representative || {};
    const score = Number(d.score?.score || 0);
    const degree = effectiveRecommendationDegree(score, d.quote?.status, d.score?.score_reliable !== false);
    const related = d.etfs.map(x => x.code).join(' / ');
    const holdingsDate = d.holdings?.date ? ` · 持仓截止 ${d.holdings.date}` : '';
    return `<div class="index-card">
      <div class="index-card-head">
        <div class="rank-no">#${idx + 1}</div>
        <div class="index-title-block">
          <h3>${d.indexName}</h3>
          <p>${categoryOf(t)} · ${marketLabel(t)} · ${indexNatureLabel(t)} · 代表ETF：${t.code} ${t.name || ''}</p>
          <p class="index-related">同指数ETF：${related}</p>
        </div>
        <div class="rank-metrics">
          <span class="score-badge ${degree.cls}">${fmtNumber(score,1)}</span>
          <span>${degree.label}</span>
          <small>${d.quote?.status || '--'}${holdingsDate}</small>
        </div>
      </div>
      <div class="rank-reason index-reason">${shortReason(d)}</div>
      ${renderIndexDimensions(d)}
      <div class="methodology-box"><strong>编制方案摘要</strong><p>${t.methodology_summary || '编制方案信息待补充。'}</p><small>${t.methodology_status || ''}${t.methodology_url ? ` · ${t.methodology_url}` : ''}</small></div>
      <div class="holdings-title">Top 10 成分股/持仓占比</div>
      ${renderHoldings(d.holdings?.holdings || [])}
    </div>`;
  }).join('');
}
async function scanIndexes() {
  if (scanningIndex) return;
  scanningIndex = true;
  indexResults = [];
  const groups = indexFilteredGroups();
  const root = $('indexRankList');
  const summary = $('indexSummary');
  if (root) { root.className = 'index-rank-list empty'; root.textContent = '正在扫描指数...'; }
  for (let i=0; i<groups.length; i++) {
    const g = groups[i];
    const t = g.representative;
    if (summary) summary.textContent = `正在扫描 ${i+1} / ${groups.length}：${g.indexName}`;
    try {
      const quoteData = await api(`/api/quote?code=${encodeURIComponent(t.code)}`);
      let holdings = {holdings: []};
      try { holdings = await api(`/api/holdings?code=${encodeURIComponent(t.code)}`); } catch(e) {}
      indexResults.push({indexName:g.indexName, etfs:g.etfs, representative:t, quote:quoteData.quote, history_metrics:quoteData.history_metrics, score:quoteData.score, template:t, holdings});
      renderIndexRankList(indexResults);
    } catch(e) {
      indexResults.push({indexName:g.indexName, etfs:g.etfs, representative:t, quote:{status:'unavailable', reason:e.message}, history_metrics:{}, score:{score:0, level:'暂停判断', action:e.message, risk_tags:['抓取失败']}, template:t, holdings:{holdings:[]}});
    }
  }
  scanningIndex = false;
  renderIndexRankList(indexResults);
}


let discoverResults = [];
function renderDiscoverCategoryOptions(items) {
  const select = $('discoverCategoryFilter');
  if (!select) return;
  const current = select.value || 'all';
  select.innerHTML = '<option value="all">全部类别</option>';
  Array.from(new Set(items.map(x => x.category).filter(Boolean))).sort().forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; select.appendChild(opt);
  });
  select.value = Array.from(select.options).some(o => o.value === current) ? current : 'all';
}

function discoverScoreValue(x) {
  if (x.status === 'excluded') return 0;
  if (x.score && Number.isFinite(Number(x.score.score))) return Number(x.score.score);
  return -1;
}
function discoverRecommendationLabel(x) {
  if (x.status === 'excluded') return '已剔除';
  const score = discoverScoreValue(x);
  if (score < 0) return '评分中';
  return effectiveRecommendationDegree(score, x.quote?.status || 'single_source', x.score?.score_reliable !== false).label;
}
function discoverScoreClass(x) {
  if (x.status === 'excluded') return 'bad';
  const score = discoverScoreValue(x);
  if (score < 0) return 'neutral';
  return effectiveRecommendationDegree(score, x.quote?.status || 'single_source', x.score?.score_reliable !== false).cls;
}
function renderDiscoverList() {
  const root = $('discoverList');
  const summary = $('discoverSummary');
  if (!root) return;
  const mode = $('discoverModeFilter')?.value || 'score';
  const st = $('discoverStatusFilter')?.value || 'all';
  const pool = $('discoverPoolFilter')?.value || 'all';
  const cat = $('discoverCategoryFilter')?.value || 'all';
  const market = $('discoverMarketFilter')?.value || 'all';
  const quality = $('discoverQualityFilter')?.value || 'stock';
  const nature = $('discoverNatureFilter')?.value || 'all';
  const text = ($('discoverSearch')?.value || '').trim().toLowerCase();
  let list = discoverResults.filter(x => {
    if (st !== 'all' && x.status !== st) return false;
    if (pool !== 'all' && x.suggested_pool !== pool) return false;
    if (cat !== 'all' && x.category !== cat) return false;
    if (market !== 'all' && marketGroup(x) !== market) return false;
    if (quality === 'stock' && x.status === 'excluded') return false;
    if (nature !== 'all' && (isCustomIndex(x) ? 'custom' : 'standard') !== nature) return false;
    if (text) {
      const hay = `${x.code} ${x.name} ${x.reason} ${x.category || ''}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
  list = mode === 'score'
    ? list.sort((a,b) => discoverScoreValue(b) - discoverScoreValue(a))
    : list.sort((a,b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || String(a.code).localeCompare(String(b.code))); 
  const pending = discoverResults.filter(x => x.status === 'pending').length;
  const excluded = discoverResults.filter(x => x.status === 'excluded').length;
  if (summary) summary.textContent = mode === 'score'
    ? `当前显示 ${list.length} / ${discoverResults.length} 只；买入评分排行=发现候选里当前更值得关注的排序。待审核 ${pending} 只，已剔除 ${excluded} 只。`
    : `当前显示 ${list.length} / ${discoverResults.length} 只；入池审核=判断是否纳入核心池/扩展池。待审核 ${pending} 只，已剔除 ${excluded} 只。`; 
  if (!list.length) { root.className = 'pool-rank-list empty'; root.textContent = '暂无符合条件的发现结果'; return; }
  root.className = 'pool-rank-list';
  root.innerHTML = list.map((x, idx) => {
    const status = x.status === 'pending' ? '待审核' : '已剔除';
    const cls = x.status === 'pending' ? 'watch' : 'bad';
    const poolText = x.suggested_pool === 'core' ? '建议核心池' : (x.suggested_pool === 'extended' ? '建议扩展池' : '不纳入');
    const buyScore = discoverScoreValue(x);
    const buyLabel = discoverRecommendationLabel(x);
    const dataStatus = x.quote?.status || status;
    return `<button class="rank-card discover-card discover-card-split" data-code="${x.code}" type="button">
      <div class="rank-no">#${idx + 1}</div>
      <div class="rank-main">
        <div class="rank-title"><strong>${x.code}</strong><span>${x.name || ''}</span></div>
        <div class="rank-sub">${x.category || '未分类'} · ${marketLabel(x)} · ${indexNatureLabel(x)}</div>
        <div class="discover-two-col">
          <div class="discover-box review-box">
            <span class="box-label">入池判断</span>
            <strong>${poolText}</strong>
            <small>${x.reason || '等待审核'} · 状态：${status}</small>
          </div>
          <div class="discover-box score-box">
            <span class="box-label">买入评分</span>
            <strong>${buyScore < 0 ? '评分中' : `${fmtNumber(buyScore,1)}分 · ${buyLabel}`}</strong>
            <small>价:${fmtNumber(x.price,3)} · ${fmtPct(x.pct,2)} · 数据:${dataStatus}</small>
          </div>
        </div>
      </div>
      <div class="rank-metrics">
        <span class="score-badge ${discoverScoreClass(x)}">${buyScore < 0 ? '--' : fmtNumber(buyScore,1)}</span>
        <span>${mode === 'review' ? poolText : buyLabel}</span>
        <small>${status} · ${dataStatus}</small>
      </div>
    </button>`;
  }).join('');
  root.querySelectorAll('.discover-card').forEach(btn => {
    btn.onclick = async () => {
      const code = btn.dataset.code;
      currentCode = code;
      $('codeInput').value = code;
      switchPage('detail');
      await analyze(code);
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });
}

async function scoreDiscoveredEtfs() {
  const pending = discoverResults.filter(x => x.status === 'pending');
  const concurrency = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      try {
        const data = await api(`/api/quote?code=${encodeURIComponent(item.code)}`);
        item.score = data.score || {score: 0, level: '暂无评分'};
        item.quote = data.quote || {status: 'single_source'};
        item.history_metrics = data.history_metrics || {};
        item.reason = `${item.reason || '待审核'}；评分：${item.score.score}，${item.score.level || ''}`;
      } catch (e) {
        item.score = {score: 0, level: '评分失败'};
        item.quote = {status: 'unavailable', reason: e.message};
      }
      renderDiscoverList();
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, pending.length)}, () => worker()));
  renderDiscoverList();
}

async function discoverEtfs() {
  const root = $('discoverList');
  const summary = $('discoverSummary');
  if (root) { root.className = 'pool-rank-list empty'; root.textContent = '正在自动发现ETF...'; }
  if (summary) summary.textContent = '正在抓取候选ETF并做初步分类，请稍等。';
  try {
    const data = await api('/api/discover');
    discoverResults = (data.items || []).map(x => ({...x, score: x.status === 'excluded' ? {score:0, level:'已剔除'} : null}));
    renderDiscoverCategoryOptions(discoverResults);
    renderDiscoverList();
    scoreDiscoveredEtfs();
  } catch(e) {
    if (root) root.textContent = `发现失败：${e.message}`;
  }
}


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
function rollingPeValue(t) {
  const mm = t.manual_metrics || {};
  if (mm.rolling_pe !== undefined && mm.rolling_pe !== null) return mm.rolling_pe;
  if (mm.pe !== undefined && mm.pe !== null) return mm.pe;
  return null;
}
function rollingPePercentile(t) {
  const mm = t.manual_metrics || {};
  if (mm.rolling_pe_percentile !== undefined && mm.rolling_pe_percentile !== null) return mm.rolling_pe_percentile;
  if (mm.pe_percentile !== undefined && mm.pe_percentile !== null) return mm.pe_percentile;
  if (mm.valuation_percentile !== undefined && mm.valuation_percentile !== null) return mm.valuation_percentile;
  return null;
}
function fmtBool(v) {
  return v ? '是' : '否';
}
function displayType(type) {
  if (type === 'dividend_low_vol') return '红利低波';
  if (type === 'dividend') return '红利/高股息';
  if (type === 'broad') return '宽基';
  return '非红利/成长';
}
function categoryOf(t) {
  return t.category || displayType(t.type);
}
function poolOf(t) {
  return t.pool || 'core';
}
function isCustomIndex(t) {
  if (!t) return false;
  if (t.index_nature) return t.index_nature === 'custom';
  const idx = t.tracking_index || '';
  return /红利|低波|高股息|半导体|芯片|科技|互联网|医疗|医药|消费|新能源|证券|券商|军工|有色|煤炭|基建|云计算|人工智能|通信|游戏|传媒|港股通/.test(idx);
}
function indexNatureLabel(t) {
  return isCustomIndex(t) ? '定制指数基金' : '主流宽基指数';
}
function marketGroup(t) {
  if (t.market === 'us') return 'us';
  if (t.is_qdii) return 'qdii';
  if (t.is_cross_border) return 'hk_cross';
  return 'cn';
}
function marketLabel(t) {
  const g = marketGroup(t);
  if (g === 'us') return '美股本土';
  if (g === 'qdii') return 'QDII/跨境';
  if (g === 'hk_cross') return '港股/港股通';
  return 'A股场内';
}
function scoreBucket(score, status) {
  if (status === 'conflict' || status === 'unavailable' || score < 50) return '0';
  if (score >= 80) return '80';
  if (score >= 65) return '65';
  if (score >= 60) return '60';
  return '50';
}
function switchPage(page) {
  document.body.dataset.page = page;
  $('rankPageBtn')?.classList.toggle('active', page === 'rank');
  $('detailPageBtn')?.classList.toggle('active', page === 'detail');
  $('discoverPageBtn')?.classList.toggle('active', page === 'discover');
  $('indexPageBtn')?.classList.toggle('active', page === 'index');
}
function recommendationBucket(score, status) {
  if (status === 'conflict' || status === 'unavailable' || score < 50) return 'avoid';
  if (score >= 65) return 'buy';
  if (score >= 60) return 'cautious';
  return 'watch';
}
function shortReason(data) {
  const rc = buildReasons(data);
  const firstReason = rc.reasons[0] || '暂无明显推荐理由';
  const firstCaution = rc.cautions[0] || '暂无主要谨慎点';
  return `${firstReason} / ${firstCaution}`;
}
function metricItem(label, value, note = '') {
  return `<div class="raw-item"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

function getPeerGroup(code, t) {
  const c = String(code || '').toUpperCase();
  const index = t.tracking_index || '';
  if (['159545', '520890', '513630'].includes(c) || index.includes('高股息低波') || index.includes('低波红利')) return ['159545', '513630', '520890'];
  if (['510880', '515080', '159581', '512800', 'SCHD'].includes(c) || index.includes('红利') || index.includes('Dividend') || index.includes('银行')) return ['510880', '515080', '159581', '512800', 'SCHD'];
  if (['513050', '513220'].includes(c) || index.includes('中国互联网')) return ['513050', '513220'];
  if (['513180', '513130'].includes(c) || index.includes('恒生科技')) return ['513180', '513130'];
  if (['510300','159919','510050','510500','512100'].includes(c) || index.includes('沪深300') || index.includes('上证50') || index.includes('中证500') || index.includes('中证1000')) return ['510300','159919','510050','510500','512100'];
  if (['VTI', 'VOO', 'SPY', 'IVV', '513500'].includes(c) || index.includes('Total Market') || index.includes('S&P') || index.includes('标普500')) return ['VTI', 'VOO', 'SPY', 'IVV', '513500'];
  if (['QQQM', 'QQQ', '513100', '159941'].includes(c) || index.includes('NASDAQ') || index.includes('纳斯达克')) return ['QQQM', 'QQQ', '513100', '159941'];
  if (['159915','588000','588200','512480','512760','515000','159995'].includes(c) || index.includes('创业板') || index.includes('科创') || index.includes('半导体') || index.includes('芯片') || index.includes('科技龙头')) return ['159915','588000','588200','512480','512760','515000','159995'];
  if (['513330','513060','159740'].includes(c) || index.includes('恒生互联网') || index.includes('医疗')) return ['513330','513060','159740','513180','513130'];
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
    'QQQM': '同类对比QQQ：QQQM同样跟踪纳斯达克100，费率通常更低，更适合长期持有；但科技集中和估值风险仍高。',
    '510300': '同类对比159919：同跟踪沪深300，优先比较规模、成交额、费率和折溢价；沪深300适合做A股大盘核心底仓。',
    '159919': '同类对比510300：同跟踪沪深300，差异主要在交易所、规模、成交额、费率和折溢价。',
    '510050': '同类对比沪深300：上证50更集中于超大盘蓝筹和金融权重，防守属性更强。',
    '510500': '同类对比沪深300/中证1000：中证500偏中盘，弹性和波动通常高于沪深300。',
    '512100': '同类对比中证500：中证1000更偏小盘，弹性更强但波动也更高，仓位应更保守。',
    '159915': '同类对比科创/芯片：创业板覆盖成长资产，行业分布更宽；芯片/半导体ETF更集中。',
    '588000': '同类对比创业板：科创50更偏硬科技和科创板公司，波动较高，适合小比例弹性仓。',
    '588200': '同类对比512480/512760/159995：都偏芯片半导体，重点比较规模、成交额和跟踪指数。',
    '512480': '同类对比512760/159995/588200：同属芯片半导体方向，行业集中度高，不适合重仓单押。',
    '512760': '同类对比512480/159995：芯片主题ETF高度相关，通常选一只流动性和费率更好的即可。',
    '515000': '同类对比创业板/科创50：科技龙头比芯片ETF分散一些，但仍是成长高波动方向。',
    '159995': '同类对比512480/512760：芯片ETF之间高度相似，优先选规模、成交额、折溢价更好的。',
    '512800': '同类对比红利ETF：银行ETF股息属性强但行业极度集中，不能替代分散红利ETF。',
    '510880': '同类对比515080/159581：上证红利偏A股高股息，和红利低波相比波动过滤较弱。',
    '515080': '同类对比510880/159581：中证红利覆盖更广，适合A股红利配置；仍需看行业集中和股息可持续。',
    '159581': '同类对比普通红利ETF：红利低波多了一层波动筛选，通常更偏防守。',
    '513100': '同类对比QQQM/QQQ/159941：都是纳指100方向；境内QDII有净值滞后和溢价风险。',
    '159941': '同类对比513100：同为境内纳指ETF，重点看溢价、成交额和费率。',
    '513500': '同类对比VOO/SPY/IVV：都是标普500方向；境内ETF有QDII溢价和汇率换算问题。',
    '513330': '同类对比513050/513220：恒生互联网更偏港股互联网，和中概互联网高度相关。',
    '513060': '同类对比科技/互联网ETF：恒生医疗是医药方向，受政策、集采、研发周期影响更大。',
    '159740': '同类对比513180/513130：同跟踪恒生科技，差异主要在交易所、规模、成交额、费率和折溢价。',
    'SCHD': '同类对比港股/A股红利：SCHD是美股红利质量方向，分红质量和美元资产属性更强，但股息率通常低于港股红利。'
  };
  return map[c] || '暂无内置同类对比。后续可在模板中补充同指数/同类ETF。';
}
function effectiveRecommendationDegree(score, status, reliable = true) {
  if (!reliable) return {label:'数据不足', cls:'bad', text:'历史行情缺失，评分不完整；暂不输出买入建议。'};
  return recommendationDegree(score, status);
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
  if (s.score_reliable === false) cautions.push('历史行情缺失，价格分位、波动率、回撤不可用；该评分不应用作买入依据。');
  if (h.price_percentile_52w !== null && h.price_percentile_52w !== undefined) {
    if (h.price_percentile_52w <= 25) reasons.push(`52周价格分位约${fmtPct(h.price_percentile_52w,1)}，位置偏低。`);
    else if (h.price_percentile_52w >= 70) cautions.push(`52周价格分位约${fmtPct(h.price_percentile_52w,1)}，价格位置偏高。`);
    else reasons.push(`52周价格分位约${fmtPct(h.price_percentile_52w,1)}，处于中间区间。`);
  }
  if (['dividend_low_vol', 'dividend'].includes(t.type)) {
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
  const degree = effectiveRecommendationDegree(score, q.status, s.score_reliable !== false);
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
  // 顶部快捷ETF代码列表已移除；保留函数用于刷新类别筛选项。
  renderCategoryOptions();
  renderIndexCategoryOptions();
}
function renderCategoryOptions() {
  const select = $('categoryFilter');
  if (!select || select.dataset.ready === '1') return;
  const categories = Array.from(new Set(Object.values(templates).map(categoryOf))).sort();
  for (const c of categories) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
  select.dataset.ready = '1';
}

function goToLinkedIndex(indexName) {
  switchPage('index');
  const input = $('indexSearch');
  if (input) input.value = indexName || '';
  renderIndexRankList();
  if (!indexResults.length) scanIndexes();
  window.scrollTo({top: 0, behavior: 'smooth'});
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

async function renderSingleHoldings(code) {
  const root = $('singleHoldings');
  if (!root) return;
  root.className = 'single-holdings empty';
  root.textContent = '正在抓取Top 10持仓...';
  try {
    const data = await api(`/api/holdings?code=${encodeURIComponent(code)}`);
    const date = data.date ? `持仓截止：${data.date}` : '持仓日期：暂无';
    root.className = 'single-holdings';
    root.innerHTML = `<div class="holding-meta">来源：${data.source || '公开持仓数据'} · ${date}</div>${renderHoldings(data.holdings || [])}`;
  } catch (e) {
    root.className = 'single-holdings empty';
    root.textContent = `Top 10持仓抓取失败：${e.message}`;
  }
}

function renderResult(data) {
  const t = data.template || {};
  const q = data.quote || {};
  const p = q.primary || {};
  const h = data.history_metrics || {};
  const s = data.score || {};
  $('etfTitle').textContent = `${data.code} ${t.name || ''}`;
  $('etfSub').textContent = `${t.tracking_index || '未配置指数'} · ${displayType(t.type)} · ${t.is_qdii ? 'QDII/跨境' : '普通/非QDII'}`;
  const linked = $('linkedIndexAction');
  if (linked) {
    linked.innerHTML = t.tracking_index ? `<button class="link-index-btn" type="button">查看关联指数：${t.tracking_index}</button>` : '';
    const btn = linked.querySelector('button');
    if (btn) btn.onclick = () => goToLinkedIndex(t.tracking_index);
  }
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
  renderSingleHoldings(data.code);
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
  const isDividend = ['dividend_low_vol', 'dividend'].includes(t.type);
  const rows = [];

  rows.push(metricItem('ETF代码', data.code || '--', t.name || ''));
  rows.push(metricItem('跟踪指数', t.tracking_index || '未配置'));
  rows.push(metricItem('指数属性', indexNatureLabel(t), isCustomIndex(t) ? '行业/主题/策略/因子等非传统宽基' : '主流宽基或旗舰指数'));
  rows.push(metricItem('基金成立时间', t.fund_inception_date || '待补充', t.fund_inception_source || t.fund_inception_error || ''));
  rows.push(metricItem('指数发布日期', t.index_launch_date || '待补充', t.index_meta_note || ''));
  rows.push(metricItem('指数基日', t.index_base_date || '待补充'));
  rows.push(metricItem('编制方案', t.methodology_public ? '公开/待核验链接' : '待补充', t.methodology_summary || '')); 
  rows.push(metricItem('ETF类型', displayType(t.type))); 
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
  rows.push(metricItem('滚动PE', fmtMaybeNumber(rollingPeValue(t), 2, '倍'), '模板慢频数据，后续可接估值源'));
  rows.push(metricItem('滚动PE分位', fmtMaybePct(rollingPePercentile(t), 1), '越低代表估值越低'));
  rows.push(metricItem('1年价格分位', fmtMaybePct(h.price_percentile_52w, 1), '越低代表越接近近一年低位'));
  rows.push(metricItem('2年价格分位', fmtMaybePct(h.price_percentile_2y, 1)));
  rows.push(metricItem('3年价格分位', fmtMaybePct(h.price_percentile_3y, 1)));
  rows.push(metricItem('5年价格分位', fmtMaybePct(h.price_percentile_5y, 1)));
  rows.push(metricItem('10年价格分位', fmtMaybePct(h.price_percentile_10y, 1)));
  rows.push(metricItem('20日均线', fmtMaybeNumber(h.ma20, 3)));
  rows.push(metricItem('60日均线', fmtMaybeNumber(h.ma60, 3)));
  rows.push(metricItem('1年年化收益率', fmtMaybePct(h.annualized_return_1y, 1)));
  rows.push(metricItem('3年年化收益率', fmtMaybePct(h.annualized_return_3y, 1)));
  rows.push(metricItem('5年年化收益率', fmtMaybePct(h.annualized_return_5y, 1)));
  rows.push(metricItem('10年年化收益率', fmtMaybePct(h.annualized_return_10y, 1)));
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
function filteredTemplates() {
  const pool = $('poolFilter')?.value || 'all';
  const cat = $('categoryFilter')?.value || 'all';
  const market = $('marketFilter')?.value || 'all';
  const nature = $('indexNatureFilter')?.value || 'all';
  const text = ($('poolSearch')?.value || '').trim().toLowerCase();
  return Object.values(templates).filter(t => {
    if (pool !== 'all' && poolOf(t) !== pool) return false;
    if (cat !== 'all' && categoryOf(t) !== cat) return false;
    if (market !== 'all' && marketGroup(t) !== market) return false;
    if (nature !== 'all' && (isCustomIndex(t) ? 'custom' : 'standard') !== nature) return false;
    if (text) {
      const hay = `${t.code} ${t.name} ${t.tracking_index} ${categoryOf(t)}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
function renderPoolRankList(items = poolResults) {
  const root = $('poolRankList');
  const summary = $('poolSummary');
  if (!root) return;
  const pool = $('poolFilter')?.value || 'all';
  const cat = $('categoryFilter')?.value || 'all';
  const rec = $('recommendFilter')?.value || 'all';
  const market = $('marketFilter')?.value || 'all';
  const scoreF = $('scoreFilter')?.value || 'all';
  const nature = $('indexNatureFilter')?.value || 'all';
  const text = ($('poolSearch')?.value || '').trim().toLowerCase();
  let list = items.filter(d => {
    const t = d.template || {};
    const s = d.score || {};
    const bucket = recommendationBucket(Number(s.score || 0), d.quote?.status);
    if (pool !== 'all' && poolOf(t) !== pool) return false;
    if (cat !== 'all' && categoryOf(t) !== cat) return false;
    if (market !== 'all' && marketGroup(t) !== market) return false;
    if (scoreF !== 'all' && scoreBucket(Number(s.score || 0), d.quote?.status) !== scoreF) return false;
    if (nature !== 'all' && (isCustomIndex(t) ? 'custom' : 'standard') !== nature) return false;
    if (rec === 'recommended' && !['buy','cautious'].includes(bucket)) return false;
    if (rec !== 'all' && rec !== 'recommended' && bucket !== rec) return false;
    if (text) {
      const hay = `${d.code} ${t.name} ${t.tracking_index} ${categoryOf(t)}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  }).sort((a,b) => Number(b.score?.score || 0) - Number(a.score?.score || 0));
  if (summary) summary.textContent = `当前显示 ${list.length} / ${poolResults.length || Object.keys(templates).length} 只；默认按推荐买入值展示Top排序。`;
  if (!list.length) { root.className = 'pool-rank-list empty'; root.textContent = scanningPool ? '正在扫描...' : '暂无符合条件的数据'; return; }
  root.className = 'pool-rank-list';
  root.innerHTML = list.map((d, idx) => {
    const t = d.template || {};
    const q = d.quote || {};
    const p = q.primary || {};
    const h = d.history_metrics || {};
    const s = d.score || {};
    const score = Number(s.score || 0);
    const degree = effectiveRecommendationDegree(score, q.status, s.score_reliable !== false);
    const badge = poolOf(t) === 'core' ? '核心' : '扩展';
    const statusText = q.status === 'trusted' ? '双源可信' : (q.status === 'single_source' ? '单源参考' : '数据异常');
    return `<button class="rank-card" data-code="${d.code}">
      <div class="rank-no">#${idx + 1}</div>
      <div class="rank-main">
        <div class="rank-title"><strong>${d.code}</strong><span>${t.name || ''}</span></div>
        <div class="rank-sub">${categoryOf(t)} · ${marketLabel(t)} · ${indexNatureLabel(t)} · ${t.tracking_index || '未配置指数'} · ${badge}</div>
        <div class="rank-reason">${shortReason(d)}</div>
      </div>
      <div class="rank-metrics">
        <span class="score-badge ${degree.cls}">${fmtNumber(score,1)}</span>
        <span>${degree.label}</span>
        <small>价:${fmtNumber(p.price,3)} · 分位:${fmtPct(h.price_percentile_52w,1)} · ${statusText}</small>
      </div>
    </button>`;
  }).join('');
  root.querySelectorAll('.rank-card').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.code;
      const data = poolResults.find(x => x.code === code);
      if (data) {
        currentCode = code;
        $('codeInput').value = code;
        renderResult(data);
        renderChips();
        switchPage('detail');
        window.scrollTo({top: 0, behavior: 'smooth'});
      }
    };
  });
}
async function scanPool() {
  if (scanningPool) return;
  scanningPool = true;
  poolResults = [];
  const targets = filteredTemplates();
  const root = $('poolRankList');
  const summary = $('poolSummary');
  if (root) { root.className = 'pool-rank-list empty'; root.textContent = '正在扫描ETF池...'; }
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (summary) summary.textContent = `正在扫描 ${i + 1} / ${targets.length}：${t.code} ${t.name}`;
    try {
      const data = await api(`/api/quote?code=${encodeURIComponent(t.code)}`);
      poolResults.push(data);
      renderPoolRankList(poolResults);
    } catch (e) {
      poolResults.push({code: t.code, template: t, quote: {status:'unavailable', reason:e.message}, history_metrics: {}, score: {score:0, level:'暂停判断', action:e.message, risk_tags:['抓取失败']}});
    }
  }
  scanningPool = false;
  renderPoolRankList(poolResults);
}

$('analyzeBtn').onclick = async () => { switchPage('detail'); await analyze($('codeInput').value); };
if ($('refreshAllBtn')) $('refreshAllBtn').onclick = renderWatchlist;
$('scanPoolBtn').onclick = scanPool;
$('discoverBtn').onclick = discoverEtfs;
$('scanIndexBtn').onclick = scanIndexes;
$('rankPageBtn').onclick = () => switchPage('rank');
$('detailPageBtn').onclick = () => switchPage('detail');
$('discoverPageBtn').onclick = () => switchPage('discover');
$('indexPageBtn').onclick = () => switchPage('index');
['poolFilter','categoryFilter','marketFilter','indexNatureFilter','scoreFilter','recommendFilter','poolSearch'].forEach(id => { const el = $(id); if (el) el.addEventListener(id === 'poolSearch' ? 'input' : 'change', () => renderPoolRankList()); });
['discoverModeFilter','discoverStatusFilter','discoverPoolFilter','discoverCategoryFilter','discoverMarketFilter','discoverNatureFilter','discoverQualityFilter','discoverSearch'].forEach(id => { const el = $(id); if (el) el.addEventListener(id === 'discoverSearch' ? 'input' : 'change', () => renderDiscoverList()); });
['indexCategoryFilter','indexMarketFilter','indexNaturePageFilter','indexScoreFilter','indexRecommendFilter','indexSearch'].forEach(id => { const el = $(id); if (el) el.addEventListener(id === 'indexSearch' ? 'input' : 'change', () => renderIndexRankList()); });
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') analyze($('codeInput').value); });
(async function init() {
  await loadTemplates();
  switchPage('rank');
  await analyze(currentCode).catch(() => {});
  renderWatchlist();
  setTimeout(() => scanPool(), 300);
})();
