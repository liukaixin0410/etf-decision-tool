const templates = require('./templates_data.json');
const indexMetadata = require('./index_metadata.json');
const UA = 'Mozilla/5.0 ETFDecisionTool/1.0';

function nowIso(){ return new Date().toISOString(); }
function safeFloat(v){
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,%]/g,'').replace(/,/g,'').trim();
  if (!s || s === '-' || s === '--' || s === 'N/A') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function marketForCode(code){
  if (!/^\d+$/.test(code)) return 'us';
  if (code.startsWith('15') || code.startsWith('16') || code.startsWith('18')) return 'cn_sz';
  return 'cn_sh';
}
function tencentSymbol(code, market){ return (market === 'cn_sh' ? 'sh' : 'sz') + code; }
async function fetchText(url, headers={}){
  const res = await fetch(url, {headers: {'User-Agent': UA, ...headers}, signal: AbortSignal.timeout(9000)});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
async function fetchTencentText(url){
  const res = await fetch(url, {headers: {'User-Agent': UA, 'Referer':'https://gu.qq.com/'}, signal: AbortSignal.timeout(9000)});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  try { return new TextDecoder('gb18030').decode(buf); } catch(e) { return new TextDecoder('gbk').decode(buf); }
}
async function quoteTencentCN(code, market){
  const symbol = tencentSymbol(code, market);
  const text = await fetchTencentText(`https://qt.gtimg.cn/q=${symbol}`);
  const m = text.match(/="(.*)";/);
  if (!m) throw new Error('empty tencent response');
  const p = m[1].split('~');
  const price = safeFloat(p[3]);
  const prev = safeFloat(p[4]);
  const open = safeFloat(p[5]);
  let pct = safeFloat(p[32]);
  if (pct === null && price !== null && prev > 0) pct = (price / prev - 1) * 100;
  return {source:'tencent', ok: price !== null && price > 0, code, name:p[1]||code, price, prev_close:prev, change_pct:pct, open, high:safeFloat(p[33]), low:safeFloat(p[34]), volume:null, amount:null, fetched_at:nowIso(), raw_time:p[30]||null, error:null};
}
async function historyTencentCN(code, market){
  const symbol = tencentSymbol(code, market);
  const errors = [];
  for (const limit of [2600, 1200, 520, 320]) {
    try {
      const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + encodeURIComponent(`${symbol},day,,,${limit},qfq`);
      const text = await fetchText(url, {'Referer':'https://gu.qq.com/'});
      const data = JSON.parse(text).data || {};
      const block = data[symbol] || {};
      const rows = (block.qfqday || block.day || []).map(r => ({date:r[0], open:safeFloat(r[1]), close:safeFloat(r[2]), high:safeFloat(r[3]), low:safeFloat(r[4]), volume:safeFloat(r[5]), amount:null})).filter(r => r.close !== null);
      if (rows.length) return rows;
      errors.push(`limit ${limit}: empty`);
    } catch(e) { errors.push(`limit ${limit}: ${e.message}`); }
  }
  throw new Error(errors.join('; '));
}

async function historyEastmoneyCN(code, market){
  const secid = (market === 'cn_sh' ? '1.' : '0.') + code;
  const params = new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    klt: '101',
    fqt: '1',
    beg: '0',
    end: '20500101',
    lmt: '2600'
  });
  const text = await fetchText('https://push2his.eastmoney.com/api/qt/stock/kline/get?' + params.toString(), {'Referer':'https://quote.eastmoney.com/','Accept':'application/json,text/plain,*/*'});
  const data = JSON.parse(text).data || {};
  const rows = (data.klines || []).map(line => {
    const p = String(line).split(',');
    return {date:p[0], open:safeFloat(p[1]), close:safeFloat(p[2]), high:safeFloat(p[3]), low:safeFloat(p[4]), volume:safeFloat(p[5]), amount:safeFloat(p[6])};
  }).filter(r => r.close !== null);
  return rows;
}

async function historySinaCN(code, market){
  const symbol = (market === 'cn_sh' ? 'sh' : 'sz') + code;
  const errors = [];
  for (const len of [2600, 1200, 520, 320]) {
    try {
      const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${len}`;
      const text = await fetchText(url, {'Referer':'https://finance.sina.com.cn/','Accept':'application/json,text/plain,*/*'});
      const rows = JSON.parse(text).map(r => ({date:r.day, open:safeFloat(r.open), close:safeFloat(r.close), high:safeFloat(r.high), low:safeFloat(r.low), volume:safeFloat(r.volume), amount:null})).filter(r => r.close !== null);
      if (rows.length) return rows;
      errors.push(`len ${len}: empty`);
    } catch(e) { errors.push(`len ${len}: ${e.message}`); }
  }
  throw new Error(errors.join('; '));
}
async function historyCN(code, market){
  const errors = [];
  for (const fn of [historyTencentCN, historyEastmoneyCN, historySinaCN]) {
    try {
      const rows = await fn(code, market);
      if (rows && rows.length) return rows;
      errors.push(`${fn.name}: empty`);
    } catch(e) {
      errors.push(`${fn.name}: ${e.message}`);
    }
  }
  throw new Error(errors.join('; '));
}
async function quoteNasdaqUS(code){
  const text = await fetchText(`https://api.nasdaq.com/api/quote/${code}/info?assetclass=etf`, {'Accept':'application/json,text/plain,*/*','Referer':'https://www.nasdaq.com/'});
  const data = JSON.parse(text).data || {};
  const p = data.primaryData || {};
  const price = safeFloat(p.lastSalePrice);
  const ch = safeFloat(p.netChange);
  const prev = price !== null && ch !== null ? price - ch : null;
  const vol = safeFloat(p.volume);
  return {source:'nasdaq', ok:price !== null && price > 0, code, name:data.companyName||code, price, prev_close:prev, change_pct:safeFloat(p.percentageChange), open:null, high:null, low:null, volume:vol, amount:price&&vol ? price*vol : null, currency:'USD', fetched_at:nowIso(), raw_time:p.lastTradeTimestamp||null, error:null};
}
async function quoteCnbcUS(code){
  const text = await fetchText('https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=' + encodeURIComponent(code) + '&output=json', {'Referer':'https://www.cnbc.com/'});
  let q = (((JSON.parse(text).QuickQuoteResult||{}).QuickQuote)||[]);
  if (!Array.isArray(q)) q = [q];
  const r = q[0] || {};
  const price = safeFloat(r.last); const vol = safeFloat(r.volume || r.fullVolume);
  return {source:'cnbc', ok:price !== null && price > 0, code, name:r.name||code, price, prev_close:null, change_pct:safeFloat(r.change_pct), open:safeFloat(r.open), high:safeFloat(r.high), low:safeFloat(r.low), volume:vol, amount:price&&vol ? price*vol : null, currency:'USD', fetched_at:nowIso(), raw_time:r.last_time||r.reg_last_time||null, error:null};
}
async function historyNasdaqUS(code){
  const end = new Date(); const start = new Date(Date.now() - 3650*24*3600*1000);
  const fmt = d => d.toISOString().slice(0,10);
  const url = `https://api.nasdaq.com/api/quote/${code}/historical?assetclass=etf&fromdate=${fmt(start)}&todate=${fmt(end)}&limit=3000`;
  const text = await fetchText(url, {'Accept':'application/json,text/plain,*/*','Referer':'https://www.nasdaq.com/'});
  const rows = (((JSON.parse(text).data||{}).tradesTable||{}).rows||[]).reverse();
  return rows.map(r => ({date:r.date, open:safeFloat(r.open), close:safeFloat(r.close), high:safeFloat(r.high), low:safeFloat(r.low), volume:safeFloat(r.volume), amount:null})).filter(r => r.close !== null);
}
function computeHistory(rows, current){
  const closes = rows.map(r=>r.close).filter(v=>v!==null && Number.isFinite(v));
  if (!closes.length) return {ok:false, error:'no history'};
  const price = current || closes[closes.length-1];
  const percentileFor = (n) => {
    if (closes.length < Math.min(n, 120)) return {pct:null, low:null, high:null, days:closes.length};
    const win = closes.slice(-Math.min(n, closes.length));
    const lo = Math.min(...win), hi = Math.max(...win);
    const pct = hi>lo ? Math.max(0, Math.min(100, (price-lo)/(hi-lo)*100)) : null;
    return {pct, low:lo, high:hi, days:win.length};
  };
  const p1 = percentileFor(252), p2 = percentileFor(504), p3 = percentileFor(756), p5 = percentileFor(1260), p10 = percentileFor(2520);
  function annualizedReturnFor(n, years){
    if (closes.length < Math.min(n, 120)) return null;
    const win = closes.slice(-Math.min(n, closes.length));
    const start = win[0];
    const end = price || win[win.length-1];
    if (!start || start <= 0 || !end) return null;
    const actualYears = Math.max(win.length / 252, 1/252);
    return (Math.pow(end / start, 1 / Math.min(years, actualYears)) - 1) * 100;
  }
  const rets=[]; for(let i=1;i<closes.length;i++){ if(closes[i-1]>0) rets.push(closes[i]/closes[i-1]-1); }
  const mean = rets.reduce((a,b)=>a+b,0)/(rets.length||1); const variance = rets.reduce((a,b)=>a+(b-mean)**2,0)/(rets.length||1);
  const vol = rets.length>2 ? Math.sqrt(variance)*Math.sqrt(252)*100 : null;
  let peak=closes[0], maxDd=0; for(const c of closes){ if(c>peak) peak=c; const dd=c/peak-1; if(dd<maxDd) maxDd=dd; }
  const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
  return {ok:true, days:closes.length,
    low_52w:p1.low, high_52w:p1.high, price_percentile_52w:p1.pct,
    low_2y:p2.low, high_2y:p2.high, price_percentile_2y:p2.pct,
    low_3y:p3.low, high_3y:p3.high, price_percentile_3y:p3.pct,
    low_5y:p5.low, high_5y:p5.high, price_percentile_5y:p5.pct,
    low_10y:p10.low, high_10y:p10.high, price_percentile_10y:p10.pct,
    annualized_return_1y: annualizedReturnFor(252, 1),
    annualized_return_3y: annualizedReturnFor(756, 3),
    annualized_return_5y: annualizedReturnFor(1260, 5),
    annualized_return_10y: annualizedReturnFor(2520, 10),
    annual_volatility_pct:vol, max_drawdown_pct:maxDd*100, ma20:avg(closes.slice(-20)), ma60:avg(closes.slice(-60)), last_history_date:rows[rows.length-1]?.date};
}
function scorePricePercentile(p){ if(p==null) return 45; if(p<=20) return 90; if(p<=40) return 75; if(p<=60) return 55; if(p<=80) return 35; return 15; }
function inv(p){ return p==null ? 45 : Math.max(0, Math.min(100, 100-p)); }
function scoreSize(b){ if(b==null) return 55; if(b>=10) return 95; if(b>=5) return 85; if(b>=1) return 70; if(b>=0.5) return 50; return 25; }
function scoreAmount(a){ if(a==null) return 55; if(a>=1e9) return 95; if(a>=2e8) return 85; if(a>=5e7) return 70; if(a>=1e7) return 50; return 25; }
function scoreVol(v){ if(v==null) return 55; if(v<=12) return 90; if(v<=18) return 75; if(v<=25) return 55; if(v<=35) return 35; return 15; }
function scoreExp(e){ if(e==null) return 55; if(e<=0.15) return 95; if(e<=0.3) return 85; if(e<=0.6) return 65; if(e<=0.9) return 45; return 25; }
function dataPenalty(st){ if(st==='trusted') return 0; if(st==='single_source') return 8; if(st==='conflict') return 35; return 45; }
function weighted(items){ const tw=items.reduce((a,x)=>a+x[1],0); return items.reduce((a,x)=>a+x[0]*x[1],0)/tw; }
function buildScore(template, quote, hist){
  const mm = template.manual_metrics || {}; const primary = quote.primary || {}; const st=quote.status; let comps, base;
  if(['dividend_low_vol','dividend'].includes(template.type)){
    const dy = mm.dividend_yield == null ? 50 : Math.max(0, Math.min(100, (mm.dividend_yield-2)/6*100));
    const val = (inv(mm.pe_percentile)+inv(mm.pb_percentile))/2;
    comps = {'股息率水平':dy,'股息率分位':mm.dividend_yield_percentile??45,'PE/PB估值分位':val,'52周价格分位':scorePricePercentile(hist.price_percentile_52w),'分红可持续性':mm.sustainability_score??55,'基金规模':scoreSize(template.fund_size_billion),'成交额流动性':scoreAmount(primary.amount),'折溢价':55,'费率':scoreExp(template.expense_ratio),'数据可信度':100-dataPenalty(st)};
    base=weighted([[comps['股息率水平'],18],[comps['股息率分位'],13],[comps['PE/PB估值分位'],14],[comps['52周价格分位'],10],[comps['分红可持续性'],13],[comps['基金规模'],8],[comps['成交额流动性'],7],[comps['折溢价'],5],[comps['费率'],5],[comps['数据可信度'],7]]);
  } else {
    comps = {'估值分位':inv(mm.valuation_percentile),'52周价格分位':scorePricePercentile(hist.price_percentile_52w),'盈利趋势':mm.earnings_trend_score??55,'基金规模':scoreSize(template.fund_size_billion),'成交额流动性':scoreAmount(primary.amount),'折溢价':55,'波动率':scoreVol(hist.annual_volatility_pct),'政策/汇率风险':mm.policy_risk_score??55,'费率':scoreExp(template.expense_ratio),'数据可信度':100-dataPenalty(st)};
    base=weighted([[comps['估值分位'],22],[comps['52周价格分位'],14],[comps['盈利趋势'],13],[comps['基金规模'],9],[comps['成交额流动性'],9],[comps['折溢价'],9],[comps['波动率'],6],[comps['政策/汇率风险'],6],[comps['费率'],5],[comps['数据可信度'],7]]);
  }
  const historyMissing = hist && hist.ok === false;
  const score = Math.max(0, Math.min(100, base - dataPenalty(st)));
  let level, action, first=0, max=0;
  if(['conflict','unavailable'].includes(st)){ level='暂停判断'; action='数据源不可用或冲突，今天不要依据本工具下单。'; }
  else if(historyMissing){ level='数据不足'; action='历史行情未抓到，价格分位/波动率/回撤不可用；暂不输出买入建议，需先修复数据或用券商/权威源核对。'; }
  else if(score>=80){ level='积极建仓'; action='数据较好，可分批买入计划仓位的40%-50%，仍不要一次满仓。'; first=45; max=100; }
  else if(score>=65){ level='小底仓'; action='有一定吸引力，适合买计划仓位的20%-30%，后续按回调或趋势确认加仓。'; first=25; max=70; }
  else if(score>=50){ level='观察等待'; action='数据一般，先观察；若已有仓位，不建议追高加仓。'; max=30; }
  else { level='暂不买入'; action='风险或估值/价格位置不理想，暂不建议新买入。'; }
  const risks = Array.from(new Set([...(template.risk_tags||[]), st==='single_source'?'仅单一免费数据源可用':null, hist.annual_volatility_pct>25?'近一年波动率较高':null, hist.price_percentile_52w>70?'52周价格位置偏高':null, hist && hist.ok === false ? '历史行情不可用，价格分位/波动率/回撤不可用' : null].filter(Boolean)));
  return {score:Math.round(score*10)/10, score_reliable: !historyMissing, level, action, first_buy_ratio_pct:first, max_position_ratio_pct:max, components: Object.fromEntries(Object.entries(comps).map(([k,v])=>[k, Math.round(v*10)/10])), risk_tags:risks};
}

async function fetchFundInceptionCN(code){
  if (!/^\d+$/.test(code)) return {date:null, source:null, error:null};
  try {
    const text = await fetchText(`https://fundf10.eastmoney.com/jbgk_${code}.html`, {'User-Agent': UA, 'Referer':'https://fundf10.eastmoney.com/'});
    const m = text.match(/成立日期：\s*<span>([^<]+)<\/span>/);
    if (m && m[1]) return {date:m[1].trim(), source:'eastmoney_fund_profile', error:null};
    return {date:null, source:'eastmoney_fund_profile', error:'not found'};
  } catch(e) {
    return {date:null, source:'eastmoney_fund_profile', error:e.message};
  }
}
async function enrichTemplateMeta(code, template){
  const enriched = {...template};
  const idxMeta = indexMetadata[template.tracking_index] || null;
  if (idxMeta) {
    enriched.index_launch_date = idxMeta.index_launch_date || null;
    enriched.index_base_date = idxMeta.index_base_date || null;
    enriched.index_meta_note = idxMeta.note || null;
    enriched.methodology_public = idxMeta.methodology_public ?? true;
    enriched.methodology_summary = idxMeta.methodology_summary || null;
    enriched.methodology_url = idxMeta.methodology_url || '';
    enriched.methodology_status = idxMeta.methodology_status || '';
  } else {
    enriched.index_launch_date = enriched.index_launch_date || null;
    enriched.index_base_date = enriched.index_base_date || null;
    enriched.index_meta_note = enriched.index_meta_note || '待补充：该指数成立/基日信息未接入模板';
    enriched.methodology_public = enriched.methodology_public ?? true;
    enriched.methodology_summary = enriched.methodology_summary || '编制方案公开信息待接入，当前仅使用ETF模板进行评分。';
    enriched.methodology_url = enriched.methodology_url || '';
    enriched.methodology_status = enriched.methodology_status || '待补官方编制方案链接';
  }
  if (!enriched.fund_inception_date) {
    const fund = await fetchFundInceptionCN(code);
    enriched.fund_inception_date = fund.date;
    enriched.fund_inception_source = fund.source;
    enriched.fund_inception_error = fund.error;
  }
  return enriched;
}

async function getQuote(code, template){
  const market = template.market || ( /^\d+$/.test(code) ? marketForCode(code) : 'us'); const quotes=[]; const errors=[];
  const fns = market==='us' ? [quoteNasdaqUS, quoteCnbcUS] : [c=>quoteTencentCN(c, market)];
  for(const fn of fns){ try{ quotes.push(await fn(code)); }catch(e){ errors.push({source:fn.name||'source', error:e.message}); } }
  const valid = quotes.filter(q=>q.ok && q.price);
  let status='unavailable', reason='no valid quote', primary=valid[0]||null, gap=null;
  if(valid.length>=2){ const ps=valid.map(q=>q.price); const avg=ps.reduce((a,b)=>a+b,0)/ps.length; gap=(Math.max(...ps)-Math.min(...ps))/avg*100; if(gap<=0.8){status='trusted'; reason='multi-source matched';}else{status='conflict';reason=`source price gap ${gap.toFixed(2)}% exceeds threshold`;}}
  else if(valid.length===1){status='single_source'; reason='only one source available';}
  return {status, reason, primary, quotes, errors, source_gap_pct:gap, market};
}
exports.handler = async (event) => {
  const code = ((event.queryStringParameters||{}).code || '').toUpperCase().trim();
  if(!code) return {statusCode:400, headers:{'Content-Type':'application/json'}, body:JSON.stringify({error:'missing code'})};
  let template = templates[code] || {code, name:code, market:marketForCode(code), type:'growth', tracking_index:'未配置', manual_metrics:{}, risk_tags:['未配置模板，估值数据缺失']};
  template = await enrichTemplateMeta(code, template);
  let quote, hist;
  try{ quote = await getQuote(code, template); }catch(e){ quote={status:'unavailable', reason:e.message, primary:null, quotes:[], errors:[{error:e.message}], market:template.market}; }
  try{ const rows = template.market==='us' ? await historyNasdaqUS(code) : await historyCN(code, template.market); hist=computeHistory(rows, quote.primary?.price); }catch(e){ hist={ok:false,error:e.message}; }
  const score = buildScore(template, quote, hist);
  return {statusCode:200, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({code, template, quote, history_metrics:hist, score, fetched_at:nowIso(), disclaimer:'免费数据源仅供辅助判断；数据源冲突、过期或不可用时请勿依据本工具下单。'}, null, 2)};
};
