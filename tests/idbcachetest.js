/* 2026-08-04 讀取量優化第三批第二段（使用者指示：「一批批調整，調整前確認不會弄壞」）

   前兩段解決「同一次使用中換頁」；重新整理／關掉再開／隔天開店，整組表仍要重抓一次
   —— 這正是使用者最早說的「開首頁會 lag」。這一段把快取存進 IndexedDB，
   下次開場先載回來，再走既有的簽章校驗。

   最怕出事的是「拿到不該拿的舊資料」，所以逐項驗：
   ① 載回來的快取一律 t=0（一定先校驗簽章，不會直接拿舊的畫）
   ② 別人的存檔（不同 auth uid）不會被載進來
   ③ 超過 1 天的存檔丟掉（水位可能已過日誌保留期）
   ④ 壞掉／殘缺的存檔不載
   ⑤ 登出清空；⑥ 存檔是排程寫入（不擋操作）；⑦ IndexedDB 出錯一律安靜略過 */
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
  const env={ _dbCache:new Map(), IDB_MAX_AGE:86400000,
    idbTx:async()=>(o.broken?null:store) };
  const code=['let _idbUid=null,_idbSaveT=null; const _idbDirty=new Set();',
    'async '+grabFn('cacheHydrate'), 'async '+grabFn('cacheWipe'),
    'function _uid(){ return _idbUid; }'].join('\n');
  const api=new Function(...Object.keys(env), code+'\nreturn {cacheHydrate,cacheWipe,_uid};')(...Object.values(env));
  return {api, cache:env._dbCache};
}
const row=(uid,table,o)=>Object.assign({uid,table,data:[{id:'BK-1'}],sig:'1:1',logAt:'2026-08-04T00:00:00Z',savedAt:Date.now()},o||{});

(async()=>{
console.log('① 載回來的快取一定先校驗簽章');
{
  const {api,cache}=load(makeStore([row('U1','bookings')]));
  const n=await api.cacheHydrate('U1');
  ok('★ 有載到', n===1 && !!cache.get('bookings'));
  ok('★★ t=0 → 下一次讀取一定先問簽章（不會直接拿舊的畫）', cache.get('bookings').t===0);
  ok('　　fullAt 是現在 → 之後照常每 10 分鐘整表校正一次', Date.now()-cache.get('bookings').fullAt<3000);
  ok('　　簽章與日誌水位一起載回來（才補得了增量）',
     cache.get('bookings').sig==='1:1' && !!cache.get('bookings').logAt);
}

console.log('\n② 別人的存檔不會被載進來');
{
  const {api,cache}=load(makeStore([row('U1','bookings'),row('U2','members')]));
  const n=await api.cacheHydrate('U2');
  ok('★★ 只載自己那份', n===1 && !cache.get('bookings') && !!cache.get('members'));
}

console.log('\n③④ 過期與殘缺的存檔不載');
{
  const {api,cache}=load(makeStore([
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
  const st=makeStore([row('U1','bookings')]);
  const {api}=load(st);
  await api.cacheHydrate('U1');
  await api.cacheWipe();
  ok('★★ 登出後本機不留這個人的資料', st.map.size===0);
  const {api:api2,cache:c2}=load(makeStore([row('U1','bookings')]),{broken:true});
  const n=await api2.cacheHydrate('U1');
  ok('★ 開不了 IndexedDB（無痕/容量不足）→ 回 0，不炸也不留下半套', n===0 && c2.size===0);
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
  ok('　　只存有簽章的表（沒簽章的存了也不能用）', /if\(!hit \|\| !hit\.sig\) return;/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
