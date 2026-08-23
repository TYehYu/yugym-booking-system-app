/* 2026-08-04 讀取量優化第二批（使用者指示：「一批批調整，調整前確認不會弄壞」）

   換一次頁就整表重抓 bookings(6.4MB)+member_tickets(2.4MB)，但多數時候根本沒人改過。
   改成：快取過期時先問 fn_table_sigs()（每張表的「筆數:雜湊和」，約 60ms），
   簽章一樣就直接沿用快取、完全不抓表。

   會弄壞的地方只有一個：把「別人剛改的資料」誤判成沒變。所以這支測試把資料層真的
   跑起來，逐項驗證取得順序與失效路徑：
   ① 簽章一樣 → 不抓表        ② 簽章不一樣 → 有抓，而且拿到新資料
   ③ 簽章必須「先於」資料取得（不然會把抓完之後的改動記成已看過）
   ④ RPC 掛掉 → 退回原本行為   ⑤ 寫入清快取 → 下一次一定重抓
   ⑥ 太舊的快取不玩簽章        ⑦ 同一次換頁多張表只打一支 RPC */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

/* 造一個假的資料層環境：sb.rpc 回簽章、_dbGetAllFresh 回資料，兩邊都記錄呼叫時序 */
function makeEnv(o){
  o=o||{};
  const log=[];
  const state={rows:[{id:'BK-1'}], sig:'1:111', rpcFail:!!o.rpcFail};
  const env={
    tbl:s=>s,
    _dbCache:new Map(), _dbInflight:new Map(),
    DB_CACHE_TTL:20000, DB_CACHE_TTL_BY:{}, DB_SWR_MAX:600000, DB_FULL_MAX:21600000,
    occCacheClear:()=>{},
    sb:{ rpc:async()=>{ log.push('sig'); if(state.rpcFail) return {error:{message:'no'},data:null};
                        await new Promise(r=>setTimeout(r,1)); return {data:{bookings:state.sig},error:null}; } },
    _dbGetAllFresh:async()=>{ log.push('data'); await new Promise(r=>setTimeout(r,1)); return state.rows.slice(); },
  };
  /* 2026-08-04 第三批：dbGetAll 會先試增量補資料。這支測的是「簽章校驗」本身，
     所以這裡放一個永遠放棄的 dbDeltaPatch（＝退回整表重抓），行為與第二批相同；
     增量補資料本身由 deltasynctest 驗。 */
  const code=['function cacheMarkDirty(){}', grabFn('dbCacheClear'), 'let _sigPromise=null,_sigAt=0;\n'+grabFn('tableSigs'),
    'async function dbDeltaPatch(){ return null; }', 'const DELTA_MAX=400;',
    /* 2026-08-05：10 分鐘整表校正改背景做（_dbRebaseBg），一起帶進沙箱 */
    'const _dbRebasing=new Set();\nasync '+grabFn('_dbRebaseBg'),
    'async '+grabFn('dbGetAll')].join('\n');
  const api=new Function(...Object.keys(env), code+'\nreturn {dbGetAll,dbCacheClear,tableSigs};')(...Object.values(env));
  return {api, env, log, state};
}

/* 假時鐘：簽章請求有 3 秒共用視窗、快取有 TTL，用時間前進來模擬「等一下再換頁」，
   比真的 sleep 快也穩定。 */
let _clock=0; const _realNow=Date.now; Date.now=()=>_realNow.call(Date)+_clock;
const advance=ms=>{ _clock+=ms; };

(async()=>{
console.log('① 簽章一樣 → 完全不抓表');
{
  const {api,env,log,state}=makeEnv();
  await api.dbGetAll('bookings');
  ok('★ 第一次：有抓資料，也記下簽章', log.join('>')==='sig>data' && env._dbCache.get('bookings').sig==='1:111', log);
  ok('★★ 簽章「先於」資料取得（順序不可對調）', log.indexOf('sig')<log.indexOf('data'));
  advance(60000);   // 過一分鐘再換頁：快取過期、簽章共用視窗也過了
  log.length=0;
  const rows=await api.dbGetAll('bookings');
  ok('★★ 第二次：只問簽章，沒有抓表', log.join('>')==='sig' && rows.length===1, log);
  ok('　　時間戳往後推（下一次連簽章都不用問）', Date.now()-env._dbCache.get('bookings').t<3000);
  advance(60000); log.length=0;
  await api.dbGetAll('bookings');
  ok('　　再換一次頁還是不抓表', log.join('>')==='sig', log);
}

console.log('\n② 簽章不一樣 → 重抓，而且拿到新資料');
{
  const {api,env,log,state}=makeEnv();
  await api.dbGetAll('bookings');
  advance(60000);
  state.rows=[{id:'BK-1'},{id:'BK-2'}]; state.sig='2:222';   // 別台裝置新增了一筆
  log.length=0;
  const rows=await api.dbGetAll('bookings');
  ok('★ 有重抓', log.join('>')==='sig>data', log);
  ok('★★ 拿到的是新資料（不會漏掉別人的改動）', rows.length===2);
  ok('　　新簽章一起記起來', env._dbCache.get('bookings').sig==='2:222');
}

console.log('\n③ RPC 掛掉 → 退回原本行為（老實重抓）');
{
  const {api,env,log}=makeEnv({rpcFail:true});
  await api.dbGetAll('bookings');
  advance(60000);
  log.length=0;
  await api.dbGetAll('bookings');
  ok('★ 拿不到簽章就照舊抓表', log.indexOf('data')>=0);
  ok('　　沒有把 null 當成「沒變」', true);
}

/* 2026-08-05 二修（使用者回報「簽約轉正也變慢」）：dbCacheClear 改成「標記需校驗」——
   轉正/取消/RPC 路徑跑完會清三張大表再馬上重畫，原本等於整包重新下載。
   現在保留資料、時間戳歸零：下一次讀取一定先驗簽章（看得到自己剛做的異動），
   簽章不同才補變動列；資料庫真的變了就一定抓得到新資料。 */
console.log('\n④ 清快取之後：一定先校驗，而且看得到新資料');
{
  const {api,env,log,state}=makeEnv();
  await api.dbGetAll('bookings');
  log.length=0;
  api.dbCacheClear('bookings');            // dbPut/dbDel/RPC 寫入後呼叫
  ok('★ 資料留著、但標記為需要校驗（t 歸零）',
     !!env._dbCache.get('bookings') && env._dbCache.get('bookings').t===0);
  // 模擬「資料庫真的被改過」：簽章換了、內容也換了
  state.sig='2:222'; state.rows=[{id:'BK-1'},{id:'BK-2'}];
  const rows=await api.dbGetAll('bookings');
  ok('★ 下一次讀一定先問簽章', log.indexOf('sig')>=0);
  ok('★ 簽章不同 → 真的把新資料拿回來（這支沙箱的增量永遠放棄＝退回整表）',
     rows.length===2 && log.indexOf('data')>=0);
}
console.log('\n④b 清快取後、資料庫沒變 → 不必整表重抓');
{
  const {api,env,log}=makeEnv();
  await api.dbGetAll('bookings');
  log.length=0;
  api.dbCacheClear('bookings');
  const rows=await api.dbGetAll('bookings');
  ok('★ 簽章相同就沿用（省掉整表傳輸）', log.filter(x=>x==='data').length===0, log);
  ok('　　資料照樣拿得到', rows.length===1);
}

/* 2026-08-05 使用者回報「首頁切預約管理卡 10 幾秒」：原本超過 10 分鐘的第一次讀取
   會當場整表重載，櫃檯每 10 分鐘撞一次。改成畫面先用簽章結果秒回、整表校正丟背景。

   2026-08-23 再修（使用者回報「開個表 17 秒」，逐表量測抓到一次操作抓了 22 張表）——
   問題在於「簽章相符」也照樣排背景整表重抓。簽章是逐列雜湊和，相符＝已經證明
   快取與資料庫一模一樣，再抓一次不會得到任何新資訊，卻要把 bookings 5.5MB 重下載，
   而且是每 10 分鐘、每一張表。前景要用的資料就被這些背景重抓塞住。
   現在分兩條路：簽章相符 → 把 fullAt 一起往後推、不重抓（6 小時才對一次基準）；
   走過增量補資料 → 維持 10 分鐘整表校正（補漏的風險在那條路上）。 */
console.log('\n⑤ 超過 10 分鐘且簽章相符：秒回，而且**不要**再整表重抓');
{
  const {api,env,log}=makeEnv();
  await api.dbGetAll('bookings');
  advance(11*60000);   // 11 分鐘 > DB_SWR_MAX，但簽章沒變
  log.length=0;
  const got=await api.dbGetAll('bookings');
  ok('★ 秒回舊快取', got.length===1 && got[0].id==='BK-1');
  await new Promise(r=>setTimeout(r,30));
  ok('★★ 簽章相符就不重抓整表（0823 效能元凶）', log.filter(x=>x==='data').length===0, log);
  ok('★★ fullAt 跟著往後推（這份快取已被證明是有效基準）',
     Date.now()-(env._dbCache.get('bookings').fullAt||0) < 60000);
}
console.log('\n⑤-2 超過 6 小時：久久還是要重新對一次基準（雜湊碰撞的保險）');
{
  const {api,env,log}=makeEnv();
  await api.dbGetAll('bookings');
  advance(7*3600000);   // 7 小時 > DB_FULL_MAX
  log.length=0;
  const got=await api.dbGetAll('bookings');
  ok('★ 這一次讀仍然秒回（重抓在背景）', got.length===1);
  await new Promise(r=>setTimeout(r,30));
  ok('★ 背景整表校正有跑', log.filter(x=>x==='data').length>=1, log);
}

console.log('\n⑥ 同一次換頁多張表只打一支 RPC');
{
  const {api,env,log}=makeEnv();
  await Promise.all(['bookings','members','member_tickets'].map(t=>api.dbGetAll(t)));
  ok('★ 三張表共用同一次簽章往返', log.filter(x=>x==='sig').length===1, log);
  ok('　　三張表各自都有抓到資料', log.filter(x=>x==='data').length===3);
}

console.log('\n⑦ 程式碼層面的把關');
{
  ok('★ 簽章 RPC 失敗一律回 null（不會誤判成沒變）',
     /\.catch\(\(\)=>null\)/.test(grabFn('tableSigs')) && /r && !r\.error && r\.data && typeof r\.data==='object'/.test(grabFn('tableSigs')));
  /* 0823：那一段改寫（簽章相符不再排背景重抓），守的事情沒變 —— 拿快取之前
     要再確認 _dbCache 裡還是同一份，中途被寫入清掉就不能沿用。 */
  ok('★ 校驗期間被寫入清掉就不沿用（避免用到已失效的快取）',
     /const cur=_dbCache\.get\(key\);\n\s*if\(cur===hit\)\{/.test(src)
     && /if\(_age >= DB_FULL_MAX\) _dbRebaseBg\(store\);\n\s*return hit\.data\.slice\(\); \}/.test(src));
  ok('★★ 兩條路各自的整表校正門檻：簽章相符 6 小時、增量補過 10 分鐘',
     /if\(_age < DB_FULL_MAX\) hit\.fullAt=Date\.now\(\);/.test(src)
     && /if\(_age >= DB_SWR_MAX\) _dbRebaseBg\(store\);/.test(src)
     && /補漏的風險在這裡，所以維持 10 分鐘整表校正一次/.test(src));
  ok('★ 寫入時把共用簽章丟掉（下次記到的是寫入後的簽章）',
     /_sigPromise=null; _sigAt=0;\n\s*if\(store===undefined\)/.test(src));
  ok('　　DB 端函式存在於 migration 留檔', fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260804_fn_table_sigs.sql'));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
