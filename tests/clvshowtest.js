/* 教練請假整堂取消的團課：課卡不應該從畫面上消失（2026-08-17 使用者指示）

   0824 13:00 案例：新排的小班肌力按了「教練請假」→ 整堂取消（status=cancelled），
   行事曆把 cancelled 全部濾掉，課卡就直接不見。
   修正：新增 bkShowsCancelled(b) ——「取消了、但因為是教練請假的團課，課卡照畫」。
   畫歸畫：堂數統計、時段佔用（＋ 新增按鈕）一律照舊不計。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i)+b.length);};

/* ── 實跑 bkShowsCancelled（連 bkIsGroup 替身一起） ── */
const bkIsGroup=b=>!!(b&&b.category==='小班肌力');
const bkShowsCancelled=new Function('bkIsGroup',
  g('function bkShowsCancelled(b){','}')+'\nreturn bkShowsCancelled;')(bkIsGroup);

console.log('bkShowsCancelled 判定');
ok('教練請假整堂取消的團課 → 要顯示',
  bkShowsCancelled({status:'cancelled',coach_leave:true,category:'小班肌力'})===true);
ok('一般取消的團課 → 不顯示',
  bkShowsCancelled({status:'cancelled',category:'小班肌力'})===false);
ok('教練請假取消的教練課（不是團課）→ 不顯示（教練課本來就走 status=coach_leave 保卡）',
  bkShowsCancelled({status:'cancelled',coach_leave:true,category:'私人教練'})===false);
ok('沒取消的團課 → 不歸這條管',
  bkShowsCancelled({status:'booked',coach_leave:true,category:'小班肌力'})===false);
ok('null 安全', bkShowsCancelled(null)===false);

/* ── 各掛載點：畫面留卡、統計不計 ── */
console.log('掛載點');
ok('renderCalendar 的 visible 篩選有放行',
  src.includes("if(b.status==='cancelled' && !bkShowsCancelled(b)) return false;"));
ok('renderCoachAgenda 的 allBk 有放行',
  src.includes("bookings.filter(b=>b.status!=='cancelled'||bkShowsCancelled(b))"));
ok('renderCoachAgenda 堂數統計不計取消卡',
  src.includes("cntSrc.forEach(b=>{ if(b.status==='cancelled')return;"));
ok('renderCoachAgenda ＋新增時段不被取消卡佔住',
  src.includes("allBk.filter(b=>b.date===selDate && b.status!=='cancelled')"));
ok('桌機課卡：保留的取消卡走 cal-ev-past 淡化',
  src.includes("bkShowsCancelled(b) ? 'cal-ev-past'"));
ok('手機課卡：保留的取消卡走 dim 淡化',
  src.includes("(dim||bkShowsCancelled(b))?' dim'"));
ok('手機課卡：教練請假紅標（與桌機同款）',
  /const tag = bkIsCoachLeave\(b\) \? `<span class="evc-coach" style="background:#7A2E28/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
