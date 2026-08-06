/* 2026-08-05 使用者回報：「櫃檯調整票券跟課堂分配，取消預約的時候讀取都要等很久」

   原因：dbPut/dbDel 寫入後 dbCacheClear 把整表快取丟掉，下一次重畫整表重抓
   （bookings 一表 5MB）——連續取消＝每一步重新下載 bookings＋member_tickets＋ticket_logs。
   改成 dbCacheApply 寫入直改快取那一列；t 歸 0 讓下一次讀取照常先做簽章校驗
   （章不同會走 change_log 增量把別端的改動補上），正確性不變、不再整表重抓。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① dbCacheApply 實跑');
{
  const mk=()=>{
    const st={dirty:[],occ:0};
    const env={
      _sigPromise:1,_sigAt:1,
      _dbCache:new Map(),
      LEAN_DROP:{bookings:['import_ref']},
      tbl:s=>s==='coaches'?'employees':s,
      cacheMarkDirty:k=>st.dirty.push(k),
      occCacheClear:()=>{st.occ++;},
    };
    const fn=new Function(...Object.keys(env),grabFn('dbCacheApply')+'\nreturn dbCacheApply;')(...Object.values(env));
    return {fn,env,st};
  };
  {
    const {fn,env,st}=mk();
    env._dbCache.set('bookings',{t:123,fullAt:1,data:[{id:'B1',date:'2026-08-01'},{id:'B2',date:'2026-08-02'}],sig:'s',logAt:'w'});
    fn('bookings',{id:'B1',date:'2026-08-09',import_ref:'x'});
    const e=env._dbCache.get('bookings');
    eq('★ 既有列就地覆蓋（不整表丟棄）', e.data.map(x=>x.date), ['2026-08-09','2026-08-02']);
    ok('★ 精簡欄位不寫進快取（與列表讀取同形）', !('import_ref' in e.data[0]));
    /* 2026-08-05 二修（使用者回報「連續預約/取消都好慢」）：原本 t 歸 0 →
       每寫一筆，下一次讀取就多打一支簽章 RPC；批次迴圈每輪要寫 3 筆再讀好幾張表，
       往返疊起來就是那個慢。這一列已就地改好、跟剛讀回來的一樣新 → 照 TTL 沿用。 */
    ok('★ 快取沿用正常有效期（不再每寫一筆就強制校驗）',
       Math.abs(Date.now()-e.t)<3000 && e.sig==='s' && e.logAt==='w');
    ok('★ 有排程寫回 IndexedDB＋場地佔用快取失效', st.dirty.includes('bookings') && st.occ===1);
  }
  {
    const {fn,env}=mk();
    env._dbCache.set('members',{t:9,fullAt:1,data:[{id:'M1'}],sig:'s',logAt:'w'});
    fn('members',{id:'M2',name:'新'});
    eq('★ 新列 push 進快取', env._dbCache.get('members').data.map(x=>x.id), ['M1','M2']);
    fn('members',{id:'M1'},true);
    eq('★ 刪除把那一列移掉', env._dbCache.get('members').data.map(x=>x.id), ['M2']);
  }
  {
    const {fn,env}=mk();
    fn('members',{id:'M1'});
    ok('★ 快取本來不在 → 照舊（不會憑空建出殘缺快取）', !env._dbCache.has('members'));
    env._dbCache.set('members',{t:9,data:[{id:'M1'}]});
    fn('members',null);
    ok('　　沒帶 row → 保守整表丟棄', !env._dbCache.has('members'));
  }
}

console.log('\n①b dbPeek：先畫再說（2026-08-06 使用者回報「首頁翻頁很常出現讀取中」）');
{
  /* 寫入／清快取會把時間戳歸零（代表要重新校驗），原本 dbPeek 直接回 null →
     首頁 11 張表全部要 await 網路才畫得出第一屏。改成有資料就先畫、標記 stale，
     呼叫端畫完再背景重抓。 */
  const env={ tbl:s=>s, _dbCache:new Map(), DB_CACHE_TTL:20000, DB_CACHE_TTL_BY:{} };
  const peek=new Function(...Object.keys(env), grabFn('dbPeek')+'\nreturn dbPeek;')(...Object.values(env));
  env._dbCache.set('bookings',{t:Date.now(),data:[{id:'B1'}],sig:'s'});
  const a=peek('bookings');
  ok('★ 剛抓過 → 直接用、不算過期', a && a.data.length===1 && a.stale===false);
  env._dbCache.set('bookings',{t:0,data:[{id:'B1'}],sig:'s'});   // 寫入後標記需校驗
  const b=peek('bookings');
  ok('★★ 標記需校驗（t=0）也先畫得出來，只是標成 stale（呼叫端會背景重抓）',
     !!b && b.data.length===1 && b.stale===true);
  env._dbCache.set('bookings',{t:Date.now()-90000000,data:[{id:'B1'}],sig:'s'});
  ok('　　超過一天的舊資料才放棄（寧可等網路也不畫太舊的）', peek('bookings')===null);
  env._dbCache.delete('bookings');
  ok('　　根本沒有快取 → 回 null（照常 await）', peek('bookings')===null);
}

console.log('\n② 接線');
ok('★ dbPut 寫入改走直改快取', /dbCacheApply\(store, data\|\|obj\);/.test(src)
   && !/dbCacheClear\(store\);   \/\/ 寫入即失效/.test(src));
ok('★ dbDel 也是', /dbCacheApply\(store, \{id\}, true\);/.test(src));
ok('★ 簽章一樣重新校驗（與 dbCacheClear 同步丟共用簽章）',
   /function dbCacheApply\(store,row,del\)\{\n\s*_sigPromise=null; _sigAt=0;/.test(src));
ok('　　其他呼叫端的 dbCacheClear 不受影響（RPC 路徑照舊全清）',
   /function dbCacheClear\(store\)\{/.test(src));

console.log('\n③ 桌機行事曆：從別頁進來也先畫再說（2026-08-06 使用者回報「導覽列從首頁回預約管理會出現長時間讀取」）');
/* 原本只有「左右翻頁」吃得到 _calDataCache，從首頁切回預約管理走 else 分支＝
   await 5 張表（含 bookings／member_tickets 兩張大表）才畫得出第一屏。
   改成手上有 10 分鐘內的整組資料就先畫，背景走既有 _calRevalidate 校驗。 */
ok('★ 進入時先吃 10 分鐘內的整組快取',
   /const _entryCache = window\._calDataCache && \(Date\.now\(\)-\(window\._calDataCache\._t\|\|0\) < 600000\);/.test(src)
   && /if\(_entryCache\)\{\n\s*\(\{bookings,coaches,members,types,allTickets\}=window\._calDataCache\);\n\s*_calRevalidate\(\);/.test(src));
ok('★ 用快取時不再 await 那 5 張表（現抓只留在 else 分支）',
   (src.match(/\[bookings,coaches,members,types,allTickets\]=await Promise\.all\(/g)||[]).length===1);
ok('★ 走的是既有背景校驗（有異動才悄悄重繪），不是另開一套',
   /async function _calRevalidate\(\)\{/.test(src)
   && (src.match(/_calRevalidate\(\);/g)||[]).length>=3);
ok('　　沒有 return 掉後續渲染（整段流程照走完）',
   !/_calRevalidate\(\);\n\s*return _calRender\(\);/.test(src));
ok('　　切週的靜態表快取（coaches/members/ticket_types 60 秒）仍保留',
   /const cacheFresh = window\._calStaticCache && \(Date\.now\(\)-window\._calStaticCache\._t < 60000\);/.test(src));

console.log('\n④ 冷開機（重新開系統）第一次進預約管理也不等網路（2026-08-06 使用者回報）');
/* _calDataCache 只活在記憶體，重開就沒了 → 第一次進來一定走網路。
   首頁本來就用 dbPeek 讀跨工作階段快取（IndexedDB，開場 cacheHydrate 載回來）先畫，
   行事曆（桌機 renderCalendar／手機 renderCoachAgenda）改成沿用同一套。 */
ok('★ 桌機：五張表都 peek 得到就直接畫',
   /const _pk = _entryCache \? null : \['bookings','coaches','members','ticket_types','member_tickets'\]\.map\(t=>dbPeek\(t\)\);/.test(src)
   && /\}else if\(_peekAll\)\{\n\s*\[bookings,coaches,members,types,allTickets\]=_pk\.map\(p=>p\.data\);/.test(src));
ok('★ 先落 _calDataCache 再校驗（_calRevalidate 沒有它會直接跳出）',
   /window\._calDataCache=\{bookings,coaches,members,types,allTickets,_t:Date\.now\(\)\};\n\s*_calRevalidate\(\);/.test(src));
ok('★ 背景校驗連名單三張表一起帶（否則剛新增的會員在行事曆上沒有名字）',
   /dbGetAll\('coaches'\)\.catch\(\(\)=>cached\.coaches\),/.test(src)
   && /coaches:cos\|\|cached\.coaches, members:mems\|\|cached\.members, types:tys\|\|cached\.types, _t:Date\.now\(\)\}/.test(src));
ok('★ 手機 agenda 也 peek 先畫，stale 才背景校驗',
   /const _cagPk=\['bookings','members','coaches'\]\.map\(t=>dbPeek\(t\)\);/.test(src)
   && /if\(_cagPk\.some\(p=>p\.stale\)\) _cagRevalidate\(_calSigBk\(bookings\)\);/.test(src));
ok('　　手機的大表（member_tickets／ticket_types）也走 peek',
   /const _tkPk=dbPeek\('member_tickets'\);/.test(src)
   && /const _tt=dbPeek\('ticket_types'\);/.test(src));
ok('★ 背景校驗不會無限重畫（簽章相同就收手、離開頁面／彈窗開著不打擾）',
   /if\(_calSigBk\(bks\)===sigBefore\) return;/.test(src)
   && /if\(!document\.getElementById\('wtl-page'\)\) return;/.test(src)
   && /if\(document\.getElementById\('modal-bg'\)\) return;/.test(src)
   && /if\(window\._cagRevalidating\) return;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
