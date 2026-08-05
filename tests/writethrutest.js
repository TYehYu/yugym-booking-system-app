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

console.log('\n② 接線');
ok('★ dbPut 寫入改走直改快取', /dbCacheApply\(store, data\|\|obj\);/.test(src)
   && !/dbCacheClear\(store\);   \/\/ 寫入即失效/.test(src));
ok('★ dbDel 也是', /dbCacheApply\(store, \{id\}, true\);/.test(src));
ok('★ 簽章一樣重新校驗（與 dbCacheClear 同步丟共用簽章）',
   /function dbCacheApply\(store,row,del\)\{\n\s*_sigPromise=null; _sigAt=0;/.test(src));
ok('　　其他呼叫端的 dbCacheClear 不受影響（RPC 路徑照舊全清）',
   /function dbCacheClear\(store\)\{/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
