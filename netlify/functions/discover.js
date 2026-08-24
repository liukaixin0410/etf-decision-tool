const candidates = require('./candidates_data.json');
const templates = require('./templates_data.json');

function marketForCode(code){ return code.startsWith('15') || code.startsWith('16') || code.startsWith('18') ? 'cn_sz' : 'cn_sh'; }
function symbolOf(code){ return (marketForCode(code)==='cn_sh'?'sh':'sz') + code; }
function typeAndCategory(name){
  const n = name || '';
  if (/货币|现金|添利|保证金/.test(n)) return {excluded:true, reason:'货币/现金类ETF，不适用股票ETF评分'};
  if (/债|国债|地方债|可转债|政金债/.test(n)) return {excluded:true, reason:'债券类ETF，不适用当前股票ETF模型'};
  if (/黄金|原油|豆粕|有色期货|商品/.test(n)) return {excluded:true, reason:'商品类ETF，不适用当前股票ETF模型'};
  if (/红利|股息|低波|银行|煤炭/.test(n)) return {type:/低波/.test(n)?'dividend_low_vol':'dividend', category:'红利/红利低波'};
  if (/沪深300|上证50|中证500|中证1000|中证2000|A500|A50|恒生|标普|日经|德国|法国|美国50/.test(n)) return {type:'broad', category:'宽基'};
  if (/创业板|科创|芯片|半导体|科技|人工智能|AI|云计算|计算机|通信|数字|游戏|传媒|机器人|软件|纳指/.test(n)) return {type:'growth', category:'科技成长'};
  if (/医药|医疗|创新药|生物/.test(n)) return {type:'growth', category:'医药医疗'};
  if (/消费|酒|食品|家电|旅游/.test(n)) return {type:'growth', category:'消费'};
  if (/新能源|光伏|电池|汽车|智能车/.test(n)) return {type:'growth', category:'新能源'};
  if (/证券|券商|金融|地产|基建/.test(n)) return {type:'growth', category:'金融地产周期'};
  if (/军工|有色|稀土|钢铁|化工|农业|畜牧|养殖/.test(n)) return {type:'growth', category:'行业主题'};
  return {type:'growth', category:'待审核'};
}
async function fetchText(url){
  const res = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://gu.qq.com/'}, signal:AbortSignal.timeout(9000)});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
function parseAllTencent(text){
  const rows=[];
  const re=/v_([a-z]{2})(\d+)="([^"]*)";/g;
  let m;
  while((m=re.exec(text))){
    const code=m[2];
    const p=m[3].split('~');
    const price=Number(p[3]);
    if(!p[1] || !Number.isFinite(price) || price<=0) continue;
    rows.push({code, name:p[1]||code, price, pct:Number(p[32]), time:p[30]||'', market: marketForCode(code)});
  }
  return rows;
}
function chunk(arr, size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
exports.handler = async () => {
  const known = new Set(Object.keys(templates));
  const unknown = candidates.filter(code => !known.has(code));
  const out=[];
  for(const group of chunk(unknown, 60)){
    try{
      const symbols = group.map(symbolOf).join(',');
      const rows = parseAllTencent(await fetchText(`https://qt.gtimg.cn/q=${symbols}`));
      for(const q of rows){
        const cls = typeAndCategory(q.name);
        if(cls.excluded){
          out.push({...q, status:'excluded', reason:cls.reason});
        }else{
          const suggestedPool = /沪深300|上证50|中证500|中证1000|A500|A50|红利|恒生|标普|纳指/.test(q.name) ? 'core' : 'extended';
          out.push({...q, status:'pending', suggested_pool:suggestedPool, type:cls.type, category:cls.category, reason:`自动识别为${cls.category}，建议进入${suggestedPool==='core'?'核心池':'扩展池'}待审核`});
        }
        if(out.length >= 160) break;
      }
      if(out.length >= 160) break;
    }catch(e){
      // Free source failed for this batch; skip instead of returning fake data.
    }
  }
  return {statusCode:200, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({count:out.length, items:out}, null, 2)};
};
