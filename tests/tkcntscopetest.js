/* 點課卡變慢：佔用表不再整表抓（2026-10-28）

   ── 使用者怎麼說的 ────────────────────────────────────────────────
   「最近從行事曆點課卡 跳出來變慢了」。

   ── 查出來是什麼 ──────────────────────────────────────────────────
   先排除畫面：150 張課卡實測插入／移除各 0.2ms，把 A／B 面那套 3D 關掉也一樣，
   跟 10/26 的課卡改版無關。

   真正的路徑是：點課卡 → bkCardPop 算「這位會員還有哪些票可以換」
   → listUsableTickets → tkBookedCountMap → **整表 bookings ＋ 整表 ticket_logs**。
   兩張表各 10,000 多筆、每 1000 筆一頁 ＝ 各 11 次請求，而 .range() 等同 OFFSET，
   愈深愈慢（正式庫實測：bookings 最後一頁 93ms、第一頁 18ms）。
   pg_stat_statements：ticket_logs 那一支 38,795 次呼叫、平均 159ms、累計 6,160 秒。

   **為什麼是「最近」**：ticket_logs 10/01 是 8,557 筆、10/28 已 10,683 筆 ——
   這個月剛跨過 10,000，分頁從 9 次變 11 次。bookings 同期 9,504 → 10,670。

   ── 改法 ──────────────────────────────────────────────────────────
   tkBookedCountMap 多收一個 ticketIds：有傳就只抓那幾張票用得到的列
   （兩次小查詢取代 22 次分頁），不傳就是原本的整表行為。
   listUsableTickets 改兩段式：先用空的 cnt 篩出候選（必為超集），再只查那幾張。

   ⚠ 只縮小「點課卡」這一條路。另外 11 個 tkBookedCountMap() 呼叫點（超約防線、
     挑票清單、報表）**刻意維持整表**，這次不動它們。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});
/* ⚠ 這兩支是 async function，抽的時候要把 async 一起帶上 ——
   少了它 new Function 會爆「await is only valid in async functions」。 */
const grab=n=>{let i=src.indexOf('async function '+n+'(');
 if(i<0) i=src.indexOf('function '+n+'(');
 let d=0;
 for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 兩種模式都還在');
ok('★★★ 不傳參數＝原本的整表（另外 11 個呼叫點靠它）',
   /bks=await dbGetAll\('bookings'\);\s*\n\s*logs=await dbGetAll\('ticket_logs'\)\.catch/.test(src));
ok('★★★ 傳 ticketIds＝只抓那幾張票用得到的列',
   /logs=await _tkRowsIn\('ticket_logs','ticket_id',ids,'ticket_id,booking_id,action,delta'\);/.test(src)
   && /byTk=await _tkRowsIn\('bookings','ticket_id',ids,'id,ticket_id,status'\);/.test(src));
/* ⚠ 團課的預約沒有 ticket_id，佔用要靠 ticket_logs 的淨值算；
   而那一段要先知道「那筆預約有沒有 ticket_id」（st[bid]），
   所以帳本裡出現過的 booking 也要撈回來。少了這一句團課的超約防線會失效。 */
ok('★★★ 帳本裡出現過的 booking 也要撈（團課那一段靠它）',
   /byId=_bidLg\.length\?await _tkRowsIn\('bookings','id',_bidLg,'id,ticket_id,status'\):\[\];/.test(src));
ok('★★ .in() 要分批（PostgREST 走 GET，id 全塞網址裡）',
   /const out=\[\], CH=150,/.test(src));
ok('　　為什麼要分批寫在原地', /一次塞太多會被網址長度擋掉/.test(src));

console.log('\n② listUsableTickets 的兩段式');
ok('★★★ 第一段用空的 cnt 篩出候選',
   /const cand=all\.filter\(t=>tkFitsBooking\(t,member_id,type_id,bookDate,bookTime,\{\}\)\);/.test(src));
ok('★★★ 第二段只查候選那幾張票',
   /const cnt=await tkBookedCountMap\(cand\.map\(t=>t\.id\)\);/.test(src));
/* ⚠ 不能用「這位會員名下的票」當範圍：共享票與家庭共用的持有人是別人，
   真正的可用範圍是 tkUsableBy，而它就在 tkFitsBooking 裡。 */
ok('★★★ 範圍是 tkFitsBooking 篩出來的，不是「這位會員名下的票」',
   /共享票與家庭共用的持有人是別人/.test(src)
   && !/all\.filter\(t=>t\.member_id===member_id\)/.test(src));

console.log('\n③ 超集性質：空的 cnt 不會先篩掉任何一張（這條成立，兩段式才等價）');
const over=new Function(grab('tkOverBooked')+';return tkOverBooked;')();
eq('★★★ 空表 → 一律沒排滿', over({id:'A',sessions_total:4},{}), false);
eq('★★★ 空表 → 連總堂數 1 的票也不排除', over({id:'A',sessions_total:1},{}), false);
eq('★★ 有值才判定排滿', over({id:'A',sessions_total:4},{A:4}), true);
eq('★★ 沒排滿就放行', over({id:'A',sessions_total:4},{A:3}), false);
eq('　 總堂數 0（點數票）一律不受超約防線管', over({id:'A',sessions_total:0},{A:9}), false);
/* 超集的意思：cnt 只會讓票「被排除」，不會讓票「被加回來」。
   所以第一段用 {} 得到的集合，一定包含第二段的結果。 */
ok('★★★ cnt 只會讓票被排除（單調），所以第一段必為超集',
   [[0,4],[3,4],[4,4],[9,4]].every(([n,tot])=>
     !over({id:'A',sessions_total:tot},{}) || over({id:'A',sessions_total:tot},{A:n})));

console.log('\n④ 縮小版的算法要跟整表版完全一樣');
/* 把函式抽出來實跑：整表模式與縮小模式餵同一份資料，結果必須逐鍵相同。 */
const DATA={
  bookings:[
    {id:'b1', ticket_id:'T1', status:'checked_in'},    // 單人課，佔 1
    {id:'b2', ticket_id:'T1', status:'cancelled'},     // 取消，不佔
    {id:'b3', ticket_id:'T2', status:'booked'},        // 佔 1
    {id:'b4', ticket_id:'T2', status:'checked_in'},    // 帳本說退回來了 → 不佔
    {id:'b5', ticket_id:null, status:'checked_in'},    // 團課，靠帳本算
    {id:'b9', ticket_id:'T9', status:'booked'},        // 別人的票，縮小模式不該出現
  ],
  ticket_logs:[
    {ticket_id:'T2', booking_id:'b4', action:'deduct', delta:-1},
    {ticket_id:'T2', booking_id:'b4', action:'refund', delta:1},   // 淨 0 → 不佔
    {ticket_id:'T3', booking_id:'b5', action:'deduct', delta:-2},  // 團課兩個名額 → 佔 2
    {ticket_id:'T9', booking_id:'b9', action:'deduct', delta:-1},
  ]};
function makeFn(){
  const body=grab('tkBookedCountMap');
  const rowsIn=grab('_tkRowsIn');
  /* 假的 sb：.from().select().in() 就地在 DATA 上過濾，模擬 PostgREST。 */
  const sb={from:(t)=>({select:()=>({in:(col,vals)=>Promise.resolve(
    {data:(DATA[t]||[]).filter(r=>vals.includes(String(r[col]))), error:null})})})};
  const dbGetAll=async t=>DATA[t]||[];
  /* _tkCntMemo 是模組層的 const，抽函式時不會跟著出來 —— 補一份進沙箱。
     TTL 餵 0：測試要兩次都真的重算，不要被 20 秒記憶體吃掉。 */
  return new Function('sb','dbGetAll','dbFriendlyError','DB_CACHE_TTL','_tkCntMemo',
    rowsIn+';'+body+';return tkBookedCountMap;')
    (sb, dbGetAll, e=>e, 0, new Map());
}
(async()=>{
  const fn=makeFn();
  const full=await fn();
  const scoped=await fn(['T1','T2','T3']);
  /* ⚠ 不能直接 JSON.stringify 比：鍵的順序是 insert order，
     兩條路徑建表的先後本來就不同（團課那一段是最後才補的），順序不是規格。 */
  const sortKV=o=>Object.keys(o).sort().map(k=>k+'='+o[k]).join(',');
  eq('★★★ 整表模式算出來的佔用', sortKV(full), 'T1=1,T2=1,T3=2,T9=1');
  eq('★★★ 縮小模式＝整表模式去掉範圍外的票', sortKV(scoped), 'T1=1,T2=1,T3=2');
  ok('★★★ 範圍內的每一張，兩邊數字一樣',
     ['T1','T2','T3'].every(k=>(full[k]||0)===(scoped[k]||0)), {full,scoped});
  ok('★★ 空陣列直接回空表（不打任何查詢）',
     JSON.stringify(await fn([]))==='{}');

  console.log('\n⑤ 記憶體要跟著寫入一起丟');
  /* dbCacheClear 管的是 _dbCache，縮小版的 memo 不在裡面 —— 不另外丟的話，
     剛簽到／剛取消的那一堂在 20 秒內還會被算成佔著位子。 */
  ok('★★★ dbCacheClear 會呼叫 tkCntMemoClear',
     /_sigPromise=null; _sigAt=0;[\s\S]{0,200}try\{ tkCntMemoClear\(\); \}catch\(_\)\{\}/.test(src));
  ok('★★ 那支函式存在', /function tkCntMemoClear\(\)\{ _tkCntMemo\.clear\(\); \}/.test(src));
  /* ⚠ 兩者在不同的 <script> 區塊（dbCacheClear 在第一段、tkCntMemoClear 在第二段），
     所以呼叫端一定要包 try —— 與既有的 occCacheClear 同一個寫法。 */
  ok('★★ 跨 script 區塊所以包 try（同 occCacheClear 的寫法）',
     /try\{ tkCntMemoClear\(\); \}catch\(_\)\{\}/.test(src));

  console.log('\n⑥ 另外那些呼叫點刻意沒動');
  const calls=(src.match(/tkBookedCountMap\(\)/g)||[]).length;
  ok('★★ 整表呼叫點還在（超約防線／挑票清單／報表）', calls>=10, {calls});
  ok('★★ 只有 listUsableTickets 那一支改成帶範圍',
     (src.match(/tkBookedCountMap\(cand\.map/g)||[]).length===1);
  ok('　　只縮小點課卡那條路的理由寫在原地',
     /另外 11 個呼叫點（超約防線、\s*\n?\s*挑票清單、報表）維持原樣/.test(src));

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
