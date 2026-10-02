/* 2026-08-04 讀取量優化第三批第二段（使用者指示：「一批批調整，調整前確認不會弄壞」）

   前兩段解決「同一次使用中換頁」；重新整理／關掉再開／隔天開店，整組表仍要重抓一次
   —— 這正是使用者最早說的「開首頁會 lag」。這一段把快取存進 IndexedDB，
   下次開場先載回來，再走既有的簽章校驗。

   最怕出事的是「拿到不該拿的舊資料」，所以逐項驗：
   ① 載回來的快取一律 t=0（一定先校驗簽章，不會直接拿舊的畫）
   ② 別人的存檔（不同 auth uid）不會被載進來
   ③ 超過 1 天的存檔丟掉（水位可能已過日誌保留期）
   ④ 壞掉／殘缺的存檔不載
   ⑤ 登出清空；⑥ 存檔是排程寫入（不擋操作）；⑦ IndexedDB 出錯一律安靜略過

   ⑧ 2026-10-03 新增：**換版本就把舊快取清掉一次**。
     9/30 的「分頁沒有 ORDER BY」會讓大表隨機漏列，而那份漏列的資料會原封不動
     存進 IndexedDB 跟著裝置活下去 —— 簽章是對的，所以簽章校驗救不回來。
     ⚠ 10/02 曾經想用「筆數對不對」來擋，結果踩進 RLS 的坑（簽章數的是整張表、
       讀回來的是自己那一份，兩個數字本來就不同），當天回退。
       改成在升級那一刻清一次：代價是升級後第一次開場多抓一次，一個版本只發生一次。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

/* 假 IndexedDB：只要能 getAll / put / clear 就夠 */
function makeStore(rows){
  const map=new Map((rows||[]).map(r=>[r._k||(r.uid+'|'+r.table), r]));
  return { map,
    getAll(){ const rq={onsuccess:null,onerror:null,result:[...map.values()]};
      setTimeout(()=>rq.onsuccess&&rq.onsuccess(),0); return rq; },
    put(v,k){ map.set(k,v); }, clear(){ map.clear(); } };
}
function load(store, o){
  o=o||{};
  /* 0823：cacheHydrate 會呼叫 dbWhy() 並寫 window._dbHydrated（純量測）——沙箱補上。 */
  const env={ _dbCache:new Map(), IDB_MAX_AGE:86400000, APP_VERSION:(o.ver||'TEST.1'),
    idbTx:async()=>(o.broken?null:store), dbWhy:()=>{}, window:{} };
  const code=['let _idbUid=null,_idbSaveT=null; const _idbDirty=new Set();',
    'async '+grabFn('cacheHydrate'), 'async '+grabFn('cacheWipe'),
    'function _uid(){ return _idbUid; }'].join('\n');
  const api=new Function(...Object.keys(env), code+'\nreturn {cacheHydrate,cacheWipe,_uid};')(...Object.values(env));
  return {api, cache:env._dbCache};
}
const row=(uid,table,o)=>Object.assign({uid,table,data:[{id:'BK-1'}],sig:'1:1',logAt:'2026-08-04T00:00:00Z',savedAt:Date.now()},o||{});
/* 版本戳記那一列 —— 沒有它（或對不上）就是「剛升級」，整份快取丟掉。
   所以①～⑤每一組都要先放一張對得上的，否則驗的會變成⑧。 */
const vrow=(uid,ver)=>({uid,table:'__ver',ver:(ver||'TEST.1'),savedAt:Date.now()});

(async()=>{
console.log('① 載回來的快取一定先校驗簽章');
{
  const {api,cache}=load(makeStore([vrow('U1'),row('U1','bookings')]));
  const n=await api.cacheHydrate('U1');
  ok('★ 有載到', n===1 && !!cache.get('bookings'));
  ok('★★ t=0 → 下一次讀取一定先問簽章（不會直接拿舊的畫）', cache.get('bookings').t===0);
  ok('　　fullAt 是現在 → 之後照常每 10 分鐘整表校正一次', Date.now()-cache.get('bookings').fullAt<3000);
  ok('　　簽章與日誌水位一起載回來（才補得了增量）',
     cache.get('bookings').sig==='1:1' && !!cache.get('bookings').logAt);
}

console.log('\n② 別人的存檔不會被載進來');
{
  const {api,cache}=load(makeStore([vrow('U1'),vrow('U2'),row('U1','bookings'),row('U2','members')]));
  const n=await api.cacheHydrate('U2');
  ok('★★ 只載自己那份', n===1 && !cache.get('bookings') && !!cache.get('members'));
}

console.log('\n③④ 過期與殘缺的存檔不載');
{
  const {api,cache}=load(makeStore([
    vrow('U1'),
    row('U1','bookings',{savedAt:Date.now()-2*86400000}),   // 兩天前
    row('U1','members',{data:null}),                         // 殘缺
    row('U1','shifts',{sig:null}),                           // 沒有簽章＝無法校驗
    row('U1','purchases'),                                   // 正常
  ]));
  const n=await api.cacheHydrate('U1');
  ok('★ 只載得回正常那一份', n===1 && !!cache.get('purchases'));
  ok('　　超過 1 天的丟掉', !cache.get('bookings'));
  ok('　　資料殘缺的丟掉', !cache.get('members'));
  ok('　　沒有簽章的丟掉（無從校驗）', !cache.get('shifts'));
}

console.log('\n⑤⑦ 登出清空／IndexedDB 出錯安靜略過');
{
  const st=makeStore([vrow('U1'),row('U1','bookings')]);
  const {api}=load(st);
  await api.cacheHydrate('U1');
  await api.cacheWipe();
  ok('★★ 登出後本機不留這個人的資料', st.map.size===0);
  const {api:api2,cache:c2}=load(makeStore([vrow('U1'),row('U1','bookings')]),{broken:true});
  const n=await api2.cacheHydrate('U1');
  ok('★ 開不了 IndexedDB（無痕/容量不足）→ 回 0，不炸也不留下半套', n===0 && c2.size===0);
}

console.log('\n⑧ 換版本就清掉一次舊快取（2026-10-03）');
{
  /* 升級：存檔還是舊版本號 → 一張都不載，而且本機那份直接清掉 */
  const st=makeStore([vrow('U1','OLD.0'),row('U1','bookings'),row('U1','members')]);
  const {api,cache}=load(st,{ver:'NEW.9'});
  const n=await api.cacheHydrate('U1');
  ok('★★★ 版本對不上 → 一張都不載（漏列時期的快取不會被沿用）', n===0 && cache.size===0);
  ok('★★★ 而且本機那份被清掉（不是只是這次不用）',
     ![...st.map.values()].some(r=>r&&r.table==='bookings'));
  ok('★★★ 新版本號留下來（下一次開場就正常載了，不會每次都清）',
     [...st.map.values()].some(r=>r&&r.table==='__ver'&&r.ver==='NEW.9'));
}
{
  /* 全新裝置：一張存檔都沒有 → 不要爆，也要把版本號記下來 */
  const st=makeStore([]);
  const {api}=load(st,{ver:'NEW.9'});
  const n=await api.cacheHydrate('U1');
  ok('★★ 全新裝置（沒有任何存檔）→ 回 0，不爆', n===0);
  ok('★★ 並記下版本號', [...st.map.values()].some(r=>r&&r.table==='__ver'&&r.ver==='NEW.9'));
}
{
  /* 同版本重開：照常載回來（⑧不可以把每次開場都變成整表重抓） */
  const {api,cache}=load(makeStore([vrow('U1','SAME.1'),row('U1','bookings')]),{ver:'SAME.1'});
  const n=await api.cacheHydrate('U1');
  ok('★★★ 版本相同 → 照常載回來（這道只在升級那一刻作用）', n===1 && !!cache.get('bookings'));
}
{
  /* 換人登入：別人的版本戳記不算數 */
  const {api,cache}=load(makeStore([vrow('U2','SAME.1'),row('U2','bookings')]),{ver:'SAME.1'});
  const n=await api.cacheHydrate('U1');
  ok('★★ 別人的版本戳記不算（只看自己那一張）', n===0 && cache.size===0);
}

console.log('\n⑨ 2301 的筆數檢查已經拆掉（它會跟 RLS 打架）');
{
  ok('★★★ dbGetAll 不再比筆數', !/cacheRowsOk\(/.test(src));
  ok('★★★ 成因留在原地（避免有人再想一次同樣的點子）',
     /簽章是用管理員的眼睛數的，資料是用你自己的眼睛讀的/.test(src));
}

console.log('\n⑥ 接線與把關（原始碼）');
{
  ok('★ 資料層每次更新快取都會排程存檔',
     (src.match(/cacheMarkDirty\(key\);/g)||[]).length>=3);
  ok('★ 存檔是延後＋閒置才寫（不擋操作）',
     /_idbSaveT=setTimeout\(\(\)=>\{ if\(window\.requestIdleCallback\) requestIdleCallback\(run,\{timeout:3000\}\); else run\(\); \}, 2000\);/.test(src));
  ok('★ 存檔鍵含 auth uid（換人登入讀不到別人的）',
     /_idbUid\+'\|'\+k/.test(src) && /if\(!r \|\| r\.uid!==uid/.test(src));
  ok('★ 開場在 enterApp 之前載回來（兩條登入路徑都有）',
     (src.match(/try\{ await cacheHydrate\(uid\); \}catch\(_\)\{\}/g)||[]).length===2);
  ok('★ 登出會清空', /async function doLogout\(\)\{[\s\S]{0,400}?await cacheWipe\(\);/.test(src));
  ok('　　只存有簽章的表（沒簽章的存了也不能用）',
     /if\(!hit \|\| !hit\.sig\)\{ dbWhy\(k,'沒存進 IndexedDB','沒有簽章'\); continue; \}/.test(src));
  /* 0823：使用者回報開會員資料十幾秒，量到 contracts 走「簽章相符」（有存到）
     但 bookings 整張重抓。原本整批表塞在同一個 readwrite 交易裡，而 IndexedDB 的交易
     是全有全無 —— 一張寫失敗就整批不留，大表失敗會把小表一起拖掉。 */
  ok('★★ 一張表一個交易（一張失敗不會把整批拖掉）',
     /for\(const k of keys\)\{[\s\S]{0,400}?const st=await idbTx\('readwrite'\);/.test(src)
     && /IndexedDB 的交易是全有全無/.test(src));
  ok('★★ 寫入失敗不再靜靜吞掉（記進 _dbWhy 查得到）',
     /catch\(e\)\{ dbWhy\(k,'沒存進 IndexedDB',\(\(e&&e\.name\)\|\|''\)\+' '\+\(\(e&&e\.message\)\|\|e\)\); \}/.test(src)
     && /rq\.onerror=\(\)=>rej\(rq\.error\|\|new Error\('put failed'\)\);/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
