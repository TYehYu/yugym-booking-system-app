/* 2026-08-04 讀取量優化第三批（使用者指示：「一批批調整，調整前確認不會弄壞」）

   第二批做到「沒人改過就不抓表」；但只要有人動一筆，簽章就變，下一次仍是整張
   bookings 重抓。第三批用 DB 觸發器寫的 change_log，只把變動的那幾列撈回來補進快取。

   這支測試把資料層真的跑起來，重點在「補完之後的快取要跟整表重抓一模一樣」，
   以及所有不確定的情況都必須退回整表重抓（預設安全方向）：
   ① 改一筆 → 只撈那一筆，內容正確      ② 新增一筆 → 進得來
   ③ 刪一筆 → 從快取消失                ④ 動太多筆 → 放棄增量、整表重抓
   ⑤ 日誌讀不到（權限/會員端）→ 整表重抓 ⑥ 沒有水位（第一次讀）→ 整表重抓
   ⑦ 補完的結果 === 整表重抓的結果（逐筆比對） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

let _clock=0; const _realNow=Date.now; Date.now=()=>_realNow.call(Date)+_clock;
const advance=ms=>{ _clock+=ms; };

/* 假資料庫：一張 bookings 表＋一份 change_log，寫入時自動記日誌（模擬 DB 觸發器） */
function makeDB(){
  const rows=new Map(); let logSeq=0; const log=[];
  const bump=()=>{ logSeq++; return '2026-08-04T00:00:'+String(logSeq).padStart(2,'0')+'Z'; };
  const db={
    rows, log, calls:{full:0,delta:0,byId:0},
    put(r){ rows.set(r.id, Object.assign({},r)); log.push({tbl:'bookings',row_id:r.id,op:'U',at:bump()}); },
    del(id){ rows.delete(id); log.push({tbl:'bookings',row_id:id,op:'D',at:bump()}); },
    /* 假簽章要跟正式版一樣「任何欄位改動都反映」——只用筆數＋長度會撞號
       （新增一筆＋刪除一筆剛好抵銷），測試就驗不到東西 */
    sigOf(){ const s=[...rows.values()].map(r=>JSON.stringify(r)).sort().join('|');
      let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return rows.size+':'+h; },
    logAt(){ return log.length?log[log.length-1].at:''; },
  };
  for(let i=1;i<=5;i++) rows.set('BK-'+i,{id:'BK-'+i,note:'n'+i,status:'booked'});
  return db;
}
function makeEnv(db,o){
  o=o||{};
  const env={
    tbl:s=>s, _dbCache:new Map(), _dbInflight:new Map(), _leanSel:new Map(),
    DB_CACHE_TTL:20000, DB_CACHE_TTL_BY:{}, DB_SWR_MAX:600000, DELTA_MAX:o.deltaMax||400,
    occCacheClear:()=>{},
    sb:{
      rpc:async()=>({data:Object.assign({bookings:db.sigOf()},{_log:db.logAt()}),error:null}),
      from:(t)=>({
        select(){
          if(t==='change_log'){
            db.calls.delta++;
            const q={_gt:null};
            const api={ eq:()=>api, gt:(c,v)=>{ q._gt=v; return api; }, order:()=>api,
              limit:(n)=>{ if(o.logFail) return Promise.resolve({data:null,error:{message:'denied'}});
                if(o.logEmpty) return Promise.resolve({data:[],error:null});   // 會員端：RLS 擋掉＝查得到但沒資料
                const r=db.log.filter(x=>q._gt==null||x.at>q._gt).slice(0,n);
                return Promise.resolve({data:r,error:null}); } };
            return api;
          }
          return { in:(c,ids)=>{ db.calls.byId++;
                     return Promise.resolve({data:ids.map(i=>db.rows.get(i)).filter(Boolean),error:null}); },
                   range:()=>{ db.calls.full++; return Promise.resolve({data:[...db.rows.values()],error:null}); } };
        }
      })
    },
    _dbGetAllFresh:async()=>{ db.calls.full++; return [...db.rows.values()].map(r=>Object.assign({},r)); },
  };
  /* 2026-08-04 第三批第二段：dbGetAll 會順手排程存檔到 IndexedDB。
     這支測的是增量補資料，存檔行為由 idbcachetest 驗，這裡放個空的即可。 */
  const code=['function cacheMarkDirty(){}', grabFn('dbCacheClear'),
    'let _sigPromise=null,_sigAt=0;\n'+grabFn('tableSigs'),
    'async '+grabFn('dbDeltaPatch'),
    'async '+grabFn('dbGetAll')].join('\n');
  return new Function(...Object.keys(env), code+'\nreturn {dbGetAll,dbCacheClear,dbDeltaPatch,_cache:_dbCache};')(...Object.values(env));
}
const sortById=a=>a.slice().sort((x,y)=>String(x.id).localeCompare(String(y.id)));

(async()=>{
console.log('① 改一筆 → 只撈那一筆');
{
  const db=makeDB(); const api=makeEnv(db);
  await api.dbGetAll('bookings');
  db.calls.full=0; db.calls.byId=0;
  db.put({id:'BK-3',note:'別台改過的',status:'booked'});
  advance(60000);
  const rows=await api.dbGetAll('bookings');
  ok('★ 沒有整表重抓', db.calls.full===0, db.calls);
  ok('★ 只撈變動的那幾列', db.calls.byId===1);
  ok('★★ 內容是新的', (rows.find(r=>r.id==='BK-3')||{}).note==='別台改過的');
  ok('　　其他列還在、沒有重複', rows.length===5 && new Set(rows.map(r=>r.id)).size===5);
}

console.log('\n② 新增／③ 刪除');
{
  const db=makeDB(); const api=makeEnv(db);
  await api.dbGetAll('bookings');
  db.put({id:'BK-9',note:'新的',status:'booked'});
  db.del('BK-2');
  advance(60000); db.calls.full=0;
  const rows=await api.dbGetAll('bookings');
  ok('★ 新增的進得來', !!rows.find(r=>r.id==='BK-9'));
  ok('★ 刪掉的從快取消失', !rows.find(r=>r.id==='BK-2'));
  ok('　　仍然沒有整表重抓', db.calls.full===0);
}

console.log('\n④⑤⑥ 不確定的情況一律退回整表重抓');
{
  const db=makeDB(); const api=makeEnv(db,{deltaMax:2});
  await api.dbGetAll('bookings');
  db.put({id:'BK-1',note:'a'}); db.put({id:'BK-2',note:'b'}); db.put({id:'BK-3',note:'c'});
  advance(60000); db.calls.full=0;
  await api.dbGetAll('bookings');
  ok('★ 動太多筆 → 整表重抓', db.calls.full===1, db.calls);

  const db2=makeDB(); const api2=makeEnv(db2,{logFail:true});
  await api2.dbGetAll('bookings');
  db2.put({id:'BK-1',note:'x'});
  advance(60000); db2.calls.full=0;
  const r2=await api2.dbGetAll('bookings');
  ok('★ 日誌讀不到（會員端沒權限）→ 整表重抓', db2.calls.full===1);
  ok('　　而且資料仍然正確', (r2.find(r=>r.id==='BK-1')||{}).note==='x');

  const db3=makeDB(); const api3=makeEnv(db3);
  await api3.dbGetAll('bookings');
  const hit=api3._cache.get('bookings'); delete hit.logAt;     // 模擬舊版留下的快取（沒有水位）
  db3.put({id:'BK-1',note:'y'});
  advance(60000); db3.calls.full=0;
  await api3.dbGetAll('bookings');
  ok('★ 沒有水位 → 整表重抓', db3.calls.full===1);
}

console.log('\n⑨ 兩個「悄悄用到舊資料」的漏洞');
{
  /* 會員端讀不到 change_log（RLS 只開給員工）→ 查詢回空陣列而不是錯誤。
     若把「空的」當成「這張表沒變」，會員的快取會一直被續命、永遠看不到新資料。 */
  const db=makeDB(); const api=makeEnv(db,{logEmpty:true});
  await api.dbGetAll('bookings');
  db.put({id:'BK-1',note:'手機上剛約的'});
  advance(60000); db.calls.full=0;
  const rows=await api.dbGetAll('bookings');
  ok('★★ 簽章變了但日誌查不到 → 整表重抓（不可沿用舊快取）', db.calls.full===1, db.calls);
  ok('　　所以資料還是對的', (rows.find(r=>r.id==='BK-1')||{}).note==='手機上剛約的');

  /* 增量補資料會把時間戳往後推；期限若看時間戳，這份快取可以無限延壽而永不校正。
     期限要看「上一次整表重抓」的時間。 */
  const db2=makeDB(); const api2=makeEnv(db2);
  await api2.dbGetAll('bookings');
  db2.calls.full=0;
  // 連續 12 分鐘、每 90 秒改一筆並讀一次（全都走得到增量）
  for(let i=0;i<8;i++){ db2.put({id:'BK-1',note:'第'+i+'次'}); advance(90000); await api2.dbGetAll('bookings'); }
  ok('★★ 一路增量下去，超過 10 分鐘會整表重抓校正一次', db2.calls.full===1, db2.calls);
  ok('　　其餘幾次都是增量（沒有每次都重抓）', db2.calls.byId>=6, db2.calls);
}

console.log('\n⑦ 增量補完 === 整表重抓（逐筆比對）');
{
  const db=makeDB(); const api=makeEnv(db);
  await api.dbGetAll('bookings');
  // 一連串混合異動
  db.put({id:'BK-2',note:'改1',status:'checked_in'});
  db.del('BK-4');
  db.put({id:'BK-7',note:'新1',status:'booked'});
  db.put({id:'BK-2',note:'改2',status:'cancelled'});
  advance(60000);
  const delta=await api.dbGetAll('bookings');
  advance(60000);
  const fresh=await api.dbGetAll('bookings',{fresh:true});      // 強制整表重抓當對照組
  ok('★★ 兩者完全一致', JSON.stringify(sortById(delta))===JSON.stringify(sortById(fresh)),
     {delta:sortById(delta), fresh:sortById(fresh)});
  ok('　　同一筆改兩次只留最後一次', (delta.find(r=>r.id==='BK-2')||{}).note==='改2');
}

console.log('\n⑧ 程式碼把關');
{
  const f=grabFn('dbDeltaPatch');
  ok('★ 任何一步不順就回 null（呼叫端整表重抓）', (f.match(/return null;/g)||[]).length>=5);
  ok('★ 水位與簽章來自同一個瞬間（sigs._log）', /if\(sigs\._log===hit\.logAt\) return null;/.test(f)
     && /logAt:sigs\._log/.test(f));
  ok('★ in() 分段避免 URL 過長', /for\(let i=0;i<ids\.length;i\+=200\)/.test(f));
  ok('★ 精簡欄位一致（補進來的列跟列表同一組欄位）', /const sel=_leanSel\.get\(key\)\|\|'\*';/.test(f));
  ok('　　補資料期間被寫入清掉就不採用', /if\(patched && _dbCache\.get\(key\)===hit\)/.test(src));
  ok('　　migration 留檔', fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260804_change_log.sql'));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
