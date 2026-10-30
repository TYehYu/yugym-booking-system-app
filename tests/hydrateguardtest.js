/* 開場還原：逐表還原＋連續崩潰自救（2026-10-30）

   使用者回報「mango 打不開手機行事曆」，畫面是 iOS Safari 的「重複發生問題」——
   分頁被系統砍掉、自動重載、再被砍，一直循環。

   成因是記憶體：教練行事曆要用的 bookings 當時 10,847 筆／11MB JSON、
   member_tickets 4,397 筆／4.5MB，而還原時是 `st.getAll()`
   **一口氣把整份快取解序列化**（每張表存成一筆，每筆就是整張表的陣列）。

   ① 逐表還原 —— 峰值從「16MB 一次」降成「最大的那一張表」
   ② 連續崩潰自救 —— 上一次死在還原途中，這一次就跳過還原並清快取，
      否則使用者只能自己去 iPhone 設定裡刪網站資料才出得來。

   ⚠ 這支測試的重點是**旗子一定要拔乾淨**：cacheHydrate 有四個 return，
     任何一條漏拔，下一次開場就誤判成「上次崩潰」→ 變成每次開場都清快取。
     寫的時候就先漏了「紀元不同」那一條，所以這裡逐條實跑。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{const i=src.indexOf('async function '+n+'(');let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 原始碼的形狀');
ok('★★★ 不再一口氣 getAll（那是記憶體峰值的來源）',
   !/const rows=await new Promise\(res=>\{ try\{ const rq=st\.getAll\(\);/.test(src)
   && /const rq=st\.getAllKeys\(\)/.test(src));
ok('★★★ 一張表一個交易（交易在 await 之間會自己結束，不能重用）',
   /const st1=await idbTx\('readonly'\); if\(!st1\) break;/.test(src));
ok('★★★ 拔旗放在 finally（四個 return 都要拔）',
   /finally\{ if\(_flagged\) try\{ localStorage\.removeItem\(BOOT_FLAG\); \}catch\(_\)\{\} \}/.test(src));
ok('★★  旗子用 localStorage，不是記憶體變數（分頁被砍時記憶體什麼都不剩）',
   /const BOOT_FLAG='yugym_boot_hydrating';/.test(src)
   && /localStorage\.setItem\(BOOT_FLAG,'1'\); _flagged=true;/.test(src));
ok('★★  還原規則改了 → CACHE_EPOCH 跳號（CLAUDE.md 的規矩）',
   /const CACHE_EPOCH='2026-10-30\.hydrate';/.test(src));

console.log('\n② 四條 return 都要把旗拔乾淨（實跑）');
{
  const mkEnv=(opts)=>{
    const o=opts||{};
    const LS={_v:{...(o.ls||{})},
      getItem(k){return this._v[k]||null;},
      setItem(k,v){this._v[k]=String(v);},
      removeItem(k){delete this._v[k];}};
    const store={
      getAllKeys(){ const rq={}; setTimeout(()=>rq.onsuccess&&rq.onsuccess(),0);
        Object.defineProperty(rq,'result',{get:()=>o.keys||[]}); return rq; },
      get(k){ const rq={}; setTimeout(()=>rq.onsuccess&&rq.onsuccess(),0);
        Object.defineProperty(rq,'result',{get:()=>(o.rows||[]).find(r=>r && (r.uid+'|'+r.table)===k)||null});
        return rq; },
      put(){}, clear(){}
    };
    let wiped=false;
    const env={
      localStorage:LS,
      idbTx:async()=> o.noStore ? null : store,
      cacheWipe:async()=>{ wiped=true; },
      dbWhy:()=>{},
      CACHE_EPOCH:'2026-10-30.hydrate',
      IDB_MAX_AGE:86400000,
      _dbCache:new Map(),
      window:{},
      Date:Date,
    };
    return {env, LS, wiped:()=>wiped};
  };
  const run=async(opts)=>{
    const {env,LS,wiped}=mkEnv(opts);
    const body=grab('cacheHydrate')
      .replace(/^async function cacheHydrate\(uid\)\{/,'')
      .replace(/\}$/,'');
    const fn=new Function(...Object.keys(env),'_idbUid','BOOT_FLAG',
      'return async function cacheHydrate(uid){'+body+'};')(
      ...Object.values(env), null, 'yugym_boot_hydrating');
    const n=await fn(opts.uid||'U1');
    return {n, flag:LS.getItem('yugym_boot_hydrating'), wiped:wiped(), cache:env._dbCache};
  };

  const NOW=Date.now();
  const okRows=[{uid:'U1',table:'__ver',ver:'2026-10-30.hydrate'},
                {uid:'U1',table:'bookings',data:[1,2,3],sig:'s',savedAt:NOW}];
  const okKeys=['U1|__ver','U1|bookings'];

  (async()=>{
    let r;
    r=await run({keys:okKeys,rows:okRows});
    eq('★★★ 正常走完：還原 1 張表、旗拔掉了', [r.n,r.flag,r.wiped], [1,null,false]);

    r=await run({keys:okKeys,rows:[{uid:'U1',table:'__ver',ver:'舊紀元'},okRows[1]]});
    eq('★★★ 紀元不同：清快取、回 0，**旗也要拔掉**（原本漏了這條）',
       [r.n,r.flag,r.wiped], [0,null,true]);

    r=await run({noStore:true});
    eq('★★  拿不到 store：回 0、旗拔掉', [r.n,r.flag,r.wiped], [0,null,false]);

    r=await run({keys:okKeys,rows:okRows,ls:{'yugym_boot_hydrating':'1'}});
    eq('★★★ 上次死在還原途中：跳過還原、清快取、旗拔掉',
       [r.n,r.flag,r.wiped], [0,null,true]);

    console.log('\n③ 自救不會把好的快取白白清掉');
    r=await run({keys:okKeys,rows:okRows});
    eq('　　沒有插旗的正常開場不會清快取', r.wiped, false);

    console.log('\n'+pass+' 通過 / '+fail+' 失敗');
    process.exit(fail?1:0);
  })();
}
