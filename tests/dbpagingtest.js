/* 整表讀取改「游標分頁」＋每頁問大一點（2026-10-28）

   ── 為什麼改 ──────────────────────────────────────────────────────
   使用者：「最近從行事曆點課卡 跳出來變慢了」。查到兩件事，這支守第二件：
   `.range(f, f+999)` 等同 OFFSET，**第 11 頁要先掃過前 10,000 列**才開始回傳
   （正式庫實測 bookings 第一頁 18ms、最後一頁 93ms）。表每長一萬筆就多付一次。

   ── 改法 ──────────────────────────────────────────────────────────
   ① 每一波記住最後一個 id，下一波 `id > 游標` 接著撈 →
      波內位移最多 2×PAGE，**不隨表長大**；並行度維持 3 頁。
   ② 第一頁改問 5000 筆，實際回幾筆由 Supabase 後台 Max rows 決定；
      程式從第一頁的筆數**學出**每頁上限。後台若還是 1000，行為與改版前相同。

   ── 這支測試在守什麼 ──────────────────────────────────────────────
   **一列都不可以漏、也不可以重複**。1002 那次事故（bookings 9,504 筆在漏、
   每次重新整理漏的列還不一樣、金額每天看都不同）就是分頁出錯，
   而且**完全不會報錯**，只會靜靜少資料 —— 所以這裡用實跑比對，不是看正則。

   ⚠ 最容易踩的那一格：第一頁剛好回 1000 筆時，**不可以當成資料到底了**，
     那極可能是伺服器上限切出來的。整數筆數一律再探下一波。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});

/* 把 dbGetAll 裡「分頁」那一段原封不動抽出來實跑（從 PAGE_TRY 到 return out）。 */
const A=src.indexOf('  const PAGE_TRY=5000;');
const B=src.indexOf('  _statPush(out.length, out[0]);\n  return out;\n}', A);
ok('★★★ 抽得到分頁那一段（抽不到就是有人改了結構，下面全部不算數）', A>0 && B>A);
const SLICE=src.slice(A, B)+'  _statPush(out.length, out[0]);\n  return out;';
/* 這一段還含著「精簡欄位」那幾行（tbl／LEAN_DROP／_leanSel），
   一起餵假的進去就好 —— 不要為了測試去動正式碼的結構。 */
const mkPager=()=>new Function('sb','store','leanLearn','dbFriendlyError','_statPush','tbl','LEAN_DROP','_leanSel',
  'return (async()=>{'+SLICE+'})();');

/* 假的 PostgREST：
   ・rows 依 id 排序，`.gt('id',cur)` 與 `.range(f,t)` 照實作
   ・cap＝伺服器一次最多回幾筆（Supabase 後台的 Max rows）
   ・記下每一次請求的位移，用來驗「位移不會愈來愈深」 */
function server(rows, cap){
  const log=[];
  const sorted=rows.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const sb={from:()=>{
    let cur=null;
    const api={
      select:()=>api, order:()=>api,
      gt:(c,v)=>{ cur=v; return api; },
      range:(f,t)=>{
        const pool=cur==null?sorted:sorted.filter(r=>String(r.id)>String(cur));
        const want=t-f+1;
        log.push({from:f, want, cur});
        return Promise.resolve({data:pool.slice(f, f+Math.min(want,cap)), error:null});
      }};
    return api;
  }};
  return {sb, log};
}
const mkRows=n=>Array.from({length:n},(_,i)=>({id:'BK-'+String(i).padStart(6,'0')}));
async function run(n, cap){
  const {sb,log}=server(mkRows(n), cap);
  const out=await mkPager()(sb,'bookings',()=>{},e=>e,()=>{},t=>t,{},new Map());
  return {out, log};
}

(async()=>{
  console.log('\n① 一列都不能漏（各種筆數 × 各種伺服器上限）');
  for(const cap of [1000, 5000]){
    for(const n of [0, 1, 999, 1000, 1001, 2000, 4999, 5000, 5001, 10670, 12001]){
      const {out}=await run(n, cap);
      const idsOk=out.length===n && out.every((r,i)=>r.id==='BK-'+String(i).padStart(6,'0'));
      ok(`★★★ 上限 ${cap}／共 ${n} 筆 → 抓到 ${out.length} 筆、順序正確`, idsOk,
         {want:n, got:out.length});
    }
  }

  console.log('\n② 不可以重複（游標要用 > 不是 >=）');
  const {out:dup}=await run(10670, 1000);
  eq('★★★ 10,670 筆沒有任何重複 id', new Set(dup.map(r=>r.id)).size, 10670);

  console.log('\n③ 位移不會愈來愈深（這就是改版的全部目的）');
  const {log:L}=await run(10670, 1000);
  const maxFrom=Math.max(...L.map(x=>x.from));
  ok('★★★ 最深的位移 ≤ 2×PAGE（改版前會到 10,000）', maxFrom<=2000, {maxFrom});
  ok('★★ 第一頁之後每一次都帶游標', L.slice(1).every(x=>x.cur!=null));
  ok('★★ 並行度沒變少：每一波仍然 3 頁（上限 1000 時）',
     L.filter(x=>x.from===0).length>=4, {waves:L.filter(x=>x.from===0).length});
  /* 表再大十倍，最深位移還是一樣 —— 這才叫「不隨表長大」。 */
  const {log:L10}=await run(100000, 1000);
  eq('★★★ 十萬筆時最深位移還是一樣', Math.max(...L10.map(x=>x.from)), maxFrom);

  console.log('\n④ 整數筆數不可以當成結尾（1002 那類事故的反面）');
  for(const n of [1000, 2000, 5000]){
    const {out}=await run(n, 1000);
    ok(`★★★ 剛好 ${n} 筆：有再探下一波，沒有提早收工`, out.length===n, {got:out.length});
  }
  /* 反過來：不是整數就該立刻收工，不要白跑一波（省往返）。 */
  const {log:Lsm}=await run(300, 1000);
  eq('★★ 300 筆（不是整數）→ 只打一次請求', Lsm.length, 1);

  console.log('\n⑤ 後台把 Max rows 調大就自動跟著變快（不用再改程式）');
  const {log:Lbig}=await run(10670, 5000);
  ok('★★★ 上限 5000 時請求數大幅下降', Lbig.length<=5, {reqs:Lbig.length});
  ok('★★★ 上限 1000 時維持原本的次數', (await run(10670,1000)).log.length>=11);
  ok('★★ 頁變大就少並行幾頁（波內位移才不會又變深）',
     /WAVE=\(PAGE>=3000\)\?2:3;/.test(src));

  console.log('\n⑥ 規則寫在原地（下一個人不要改回 OFFSET）');
  ok('★★★ 整數筆數不可當結尾的理由', /不可以當成資料到底了/.test(src));
  ok('★★ 游標比 OFFSET 安全的理由（抓到一半有人新增／刪除）',
     /OFFSET 會讓後面的列整個位移（漏掉或重複），游標不會/.test(src));
  ok('★★ 實測數字留著（18ms vs 93ms）', /第一頁 18ms、最後一頁 93ms/.test(src));
  ok('★★ Max rows 在哪裡調', /Settings → API/.test(src));

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
