function clean(s){ return String(s||'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(); }
function decodeEntities(s){ return clean(s); }
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
      if(rank && stockName && weight) rows.push({rank, code:stockCode, name:stockName, weight});
      if(rows.length >= 10) break;
    }
    return {statusCode:200, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({code, source:'eastmoney_fund_archives', date, holdings:rows}, null, 2)};
  }catch(e){
    return {statusCode:200, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({code, source:'eastmoney_fund_archives', error:e.message, holdings:[]})};
  }
};
