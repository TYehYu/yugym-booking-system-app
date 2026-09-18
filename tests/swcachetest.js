/* 2026-09-18 使用者回報「會員跟教練都反應開啟介面很久才進入」。
   sw.js 從「網路優先」改成「快取優先＋HEAD 把關」。

   ⚠ 這支刻意**把 sw.js 真的載進沙盒執行**，而不是用正則比對字串：
     快取策略寫錯的後果是「客人卡在舊版」或「拿到壞頁面」，兩種都不會讓語法檢查變紅，
     而且極難在正式環境重現。要驗的是行為，不是有沒有寫那幾行字。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/sw.js','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const ORIGIN='https://tyehyu.github.io';

/* 每個情境都重載一次 sw.js —— 裡面的 _revalAt 節流是模組層級的狀態，
   共用一份會讓第二個情境靜默跳過背景更新，測出來的「沒抓」是假的。 */
function loadSW(net){
  const handlers={};
  const store=new Map();                      // url → Response
  const log={head:0, get:0, put:[], full:0};

  const cacheObj={
    async put(req,res){ const u=(typeof req==='string')?new URL(req,ORIGIN).href:req.url;
      store.set(u,res); log.put.push(u); },
    async match(req){ const u=(typeof req==='string')?new URL(req,ORIGIN).href:req.url;
      return store.get(u)||undefined; },
    async addAll(){ /* install 時的預載，這裡不驗 */ },
  };
  const caches={
    open:async()=>cacheObj,
    match:async(req)=>cacheObj.match(req),
    keys:async()=>['yugym-v1'],
    delete:async()=>true,
  };
  const fetchImpl=async(reqOrUrl, opts)=>{
    const url=(typeof reqOrUrl==='string')?reqOrUrl:reqOrUrl.url;
    if(opts&&opts.method==='HEAD'){ log.head++; return net.head(url); }
    log.get++; log.full++; return net.get(url);
  };
  const self={
    addEventListener:(k,fn)=>{ handlers[k]=fn; },
    skipWaiting(){}, clients:{claim(){}},
    location:{origin:ORIGIN, href:ORIGIN+'/yugym-booking-system-app/sw.js'},
  };
  new Function('self','caches','fetch','Response','URL','Date',src)
    (self, caches, fetchImpl, Response, URL, Date);
  return {handlers, store, log, cacheObj};
}

// 發一個請求進 fetch handler，回傳 {res, intercepted}
async function hit(sw, url, init){
  const req=new Request(url, Object.assign({}, init));
  const waits=[];
  let out=null, intercepted=false;
  const ev={ request:req,
    respondWith(p){ intercepted=true; out=p; },
    waitUntil(p){ waits.push(p); } };
  sw.handlers.fetch(ev);
  const res=intercepted?await out:null;
  await Promise.all(waits);                  // 等背景更新跑完才檢查
  return {res, intercepted};
}
const R=(body,etag,status)=>new Response(body,{status:status||200,
  headers: etag?{etag:etag}:{}});

(async()=>{

console.log('① 快取裡有 → 立刻回快取，不等那 1.7MB');
{
  const net={ head:async()=>R('', '"v1"'), get:async()=>R('NEW','"v1"') };
  const sw=loadSW(net);
  await sw.cacheObj.put(ORIGIN+'/yugym-booking-system-app/index.html', R('OLD','"v1"'));
  const {res,intercepted}=await hit(sw, ORIGIN+'/yugym-booking-system-app/index.html');
  ok('★★★ 有攔截，而且回的是快取那份', intercepted && (await res.text())==='OLD');
  ok('★★ 指紋一樣 → 背景沒有去抓完整檔案（不浪費行動數據）', sw.log.full===0, sw.log);
  ok('　　但確實有發 HEAD 去問', sw.log.head===1, sw.log);
}

console.log('\n② 推了新版 → 背景抓回來存著，下一次生效');
{
  const net={ head:async()=>R('', '"v2"'), get:async()=>R('NEW','"v2"') };
  const sw=loadSW(net);
  const key=ORIGIN+'/yugym-booking-system-app/index.html';
  await sw.cacheObj.put(key, R('OLD','"v1"'));
  const {res}=await hit(sw, key);
  ok('★★ 這一次仍然先回舊版（不讓客人等 48 秒）', (await res.text())==='OLD');
  ok('★★★ 指紋不同 → 背景有抓完整檔案', sw.log.full===1, sw.log);
  ok('★★★ 而且存進快取了（下一次開啟就是新版）',
     sw.log.put.includes(key) && (await (await sw.cacheObj.match(key)).text())==='NEW');
}

console.log('\n③ 帶查詢字串的完全不攔截（版本檢查與「重新整理」要靠它拿到新版）');
{
  const net={ head:async()=>R('','"v1"'), get:async()=>R('NEW','"v2"') };
  const sw=loadSW(net);
  const a=await hit(sw, ORIGIN+'/yugym-booking-system-app/?v=260918.2118');
  ok('★★★ ?v=版本 沒有被攔 → 直接走網路，一定拿得到新版', a.intercepted===false);
  const b=await hit(sw, ORIGIN+'/yugym-booking-system-app/?_vc=1758000000');
  ok('★★ 版本檢查的探針 ?_vc= 也沒被攔', b.intercepted===false);
  ok('　　也沒有把時間戳留在快取裡', sw.log.put.length===0, sw.log.put);
}

console.log('\n④ 第一次來（快取是空的）→ 照常走網路並存起來');
{
  const net={ head:async()=>R('','"v1"'), get:async()=>R('FIRST','"v1"') };
  const sw=loadSW(net);
  const key=ORIGIN+'/yugym-booking-system-app/index.html';
  const {res}=await hit(sw, key);
  ok('★★ 回的是網路那份', (await res.text())==='FIRST');
  ok('★★ 並且存進快取', (await (await sw.cacheObj.match(key)).text())==='FIRST');
}

console.log('\n⑤ 壞掉的回應不可以進快取（2026-08-29 曾邦紅手機打不開）');
{
  const net={ head:async()=>R('','"v1"'), get:async()=>R('<html>404</html>','"v1"',404) };
  const sw=loadSW(net);
  const key=ORIGIN+'/yugym-booking-system-app/index.html';
  await hit(sw, key);
  ok('★★★ 404 沒有被存起來（存進去會一直拿壞的出來且清不掉）',
     (await sw.cacheObj.match(key))===undefined);
}
{
  const net={ head:async()=>R('','"v2"'), get:async()=>R('BROKEN','"v2"',503) };
  const sw=loadSW(net);
  const key=ORIGIN+'/yugym-booking-system-app/index.html';
  await sw.cacheObj.put(key, R('GOOD','"v1"'));
  await hit(sw, key);
  ok('★★★ 背景更新抓到 5xx → 不覆蓋掉快取裡那份好的',
     (await (await sw.cacheObj.match(key)).text())==='GOOD');
}

console.log('\n⑥ 斷線時不要一片空白');
{
  const boom=async()=>{ throw new Error('offline'); };
  const sw=loadSW({head:boom, get:boom});
  const {res}=await hit(sw, ORIGIN+'/yugym-booking-system-app/index.html',
    {headers:{accept:'text/html'}});
  const body=await res.text();
  ok('★★ 快取也沒有、網路又斷 → 給重試頁，不是空白',
     res.status===503 && /重新載入/.test(body), res.status);
}
{
  const boom=async()=>{ throw new Error('offline'); };
  const sw=loadSW({head:boom, get:boom});
  const key=ORIGIN+'/yugym-booking-system-app/index.html';
  await sw.cacheObj.put(key, R('CACHED','"v1"'));
  const {res}=await hit(sw, key);
  ok('★★★ 斷線但快取有 → 照樣開得起來（離線可用）', (await res.text())==='CACHED');
}

console.log('\n⑦ 跨網域不攔截（Supabase 的 API 不可以被快取）');
{
  const sw=loadSW({head:async()=>R('','"v1"'), get:async()=>R('DATA','"v1"')});
  const a=await hit(sw, 'https://rlpiomzplckzqnqrvrwc.supabase.co/rest/v1/bookings');
  ok('★★★ Supabase 的請求沒有被攔', a.intercepted===false);
  const b=await hit(sw, ORIGIN+'/yugym-booking-system-app/index.html', {method:'POST'});
  ok('★★ 非 GET 也沒有被攔', b.intercepted===false);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
