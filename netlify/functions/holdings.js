function clean(s){ return String(s||'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(); }
function safeFloat(v){
  if(v===null || v===undefined) return null;
  const s=String(v).replace(/[$,%]/g,'').replace(/,/g,'').trim();
  if(!s || s==='-' || s==='--') return null;
  const n=Number(s); return Number.isFinite(n)?n:null;
}
function scalePrice(v){ return v && v>100 ? v/1000 : v; }
function extractSecid(tdHtml, rawCode){
  const href = String(tdHtml||'').match(/unify\/r\/([0-9]+\.[A-Za-z0-9]+)/);
  if(href) return href[1];
  const code = String(rawCode||'').trim();
  if(/^\d{5}$/.test(code)) return '116.' + code; // HK stocks in Eastmoney
  if(/^6/.test(code)) return '1.' + code;
  if(/^\d{6}$/.test(code)) return '0.' + code;
  return null;
}
async function fetchText(url, headers={}){
  const res = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://quote.eastmoney.com/', ...headers}, signal:AbortSignal.timeout(9000)});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
async function stockQuote(secid){
  if(!secid) return {};
  try{
    const fields='f43,f58,f162,f173,f9,f23,f115,f116,f117';
    const text=await fetchText(`https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=${fields}`);
    const d=(JSON.parse(text).data)||{};
    const pe = safeFloat(d.f173) ?? safeFloat(d.f9) ?? safeFloat(d.f162);
    const peScaled = pe && pe>300 ? pe/100 : pe;
    return {price:scalePrice(safeFloat(d.f43)), pe:peScaled, pb:safeFloat(d.f23), pe_percentile:null, pe_source:'eastmoney_quote'};
  }catch(e){ return {error:e.message}; }
}
async function stockHistoryPercentile(secid, currentPrice){
  if(!secid) return {price_percentile_1y:null};
  try{
    const params=new URLSearchParams({secid,fields1:'f1,f2,f3,f4,f5,f6',fields2:'f51,f52,f53,f54,f55,f56,f57',klt:'101',fqt:'1',beg:'0',end:'20500101',lmt:'260'});
    const text=await fetchText('https://push2his.eastmoney.com/api/qt/stock/kline/get?'+params.toString());
    const klines=((JSON.parse(text).data)||{}).klines||[];
    const closes=klines.map(x=>safeFloat(String(x).split(',')[2])).filter(x=>x!==null);
    if(!closes.length) return {price_percentile_1y:null};
    const price=currentPrice || closes[closes.length-1];
    const lo=Math.min(...closes), hi=Math.max(...closes);
    const pct=hi>lo ? Math.max(0,Math.min(100,(price-lo)/(hi-lo)*100)) : null;
    return {price_percentile_1y:pct, low_1y:lo, high_1y:hi, history_days:closes.length};
  }catch(e){ return {price_percentile_1y:null, history_error:e.message}; }
}
async function enrichHolding(h){
  const quote=await stockQuote(h.secid);
  const hist=await stockHistoryPercentile(h.secid, quote.price);
  return {...h, ...quote, ...hist};
}
exports.handler = async (event) => {
  const code = ((event.queryStringParameters||{}).code || '').trim().toUpperCase();
  if(!code) return {statusCode:400, headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'missing code'})};
  const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${encodeURIComponent(code)}&topline=10`;
  try{
    const res = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://fundf10.eastmoney.com/'}, signal:AbortSignal.timeout(12000)});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const date = (text.match(/截止至：<font[^>]*>([^<]+)/)||[])[1] || '';
    const rows=[];
    const tbody = (text.match(/<tbody>([\s\S]*?)<\/tbody>/)||[])[1] || '';
    const trs = tbody.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    for(const tr of trs){
      const tds = tr.match(/<td[\s\S]*?<\/td>/g) || [];
      if(tds.length < 7) continue;
      const rank = Number(clean(tds[0]));
      const stockCode = clean(tds[1]);
      const stockName = clean(tds[2]);
      const weight = clean(tds[6]);
      const secid = extractSecid(tds[1], stockCode);
      if(rank && stockName && weight) rows.push({rank, code:stockCode, secid, name:stockName, weight});
      if(rows.length >= 10) break;
    }
    const enriched=[];
    for(const h of rows){ enriched.push(await enrichHolding(h)); }
    return {statusCode:200, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({code, source:'eastmoney_fund_archives', date, holdings:enriched}, null, 2)};
  }catch(e){
    return {statusCode:200, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({code, source:'eastmoney_fund_archives', error:e.message, holdings:[]})};
  }
};
