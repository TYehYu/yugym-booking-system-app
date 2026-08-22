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
/* 0822 使用者定義「暗化＝這張課卡沒有有效票券」（過期／未付款／教練請假整堂取消的團課），
   三者共用同一組數值；教練請假這條改掛語意明確的 cal-ev-dark，不再借用 cal-ev-past。 */
/* 0822 使用者回報「今天這張請假的團課課卡 怎麼沒有暗化」：原本只判 bkShowsCancelled
   （團課＋教練請假＋**已取消**），還沒轉成取消的、以及全員請假的（0/N 人）都漏掉。
   抽成 bkDarkNoTicket 統一判「這堂還會不會產生扣課」。 */
ok('桌機課卡：走 bkDarkNoTicket → cal-ev-dark 暗化（不再借用 cal-ev-past）',
  src.includes("bkDarkNoTicket(b) ? 'cal-ev-dark'"));
ok('★★ 三種都算：已取消的／還沒轉取消的／全員請假的團課',
  /if\(bkShowsCancelled\(b\)\) return true;/.test(src)
  && /if\(typeof bkIsCoachLeave==='function' && bkIsCoachLeave\(b\)\) return true;/.test(src)
  && /if\(typeof grpAllOnLeave==='function' && grpAllOnLeave\(b\)\) return true;/.test(src));
ok('★★ ⚠ 1v1 的教練請假不算 —— 那堂會變成自主訓練，會員照樣可以自己來練（0817 規則）',
  /if\(typeof bkIsGroup!=='function' \|\| !bkIsGroup\(b\)\) return false;/.test(src)
  && /暗化會讓櫃檯以為這堂不用管/.test(src));
ok('★★ 手機課卡：從 .dim（opacity .4＝透明化）改成 .cal-ev-dark（暗化）',
  src.includes("${dim?' dim':''}${bkDarkNoTicket(b)?' cal-ev-dark':''}")
  && src.includes('.dim 留給「教練看別人的課」那種遮蔽卡'));
ok('★ 三種情況同一組數值（過期／教練請假團課共用一條規則）',
  /\.cal-ev\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-dark\{opacity:1;filter:brightness\(0\.9\) saturate\(0\.72\);/.test(src)
  && /\.tcard\.tcard-std\.tcard-pend\{ filter:brightness\(0\.9\) saturate\(0\.72\); \}/.test(src));
ok('★★ 請假的會員卡也改暗化（原本 opacity:.72，面板後面是模糊行事曆，一透明字就糊掉）',
  /\.ash-mleave\{opacity:1;filter:brightness\(0\.9\) saturate\(0\.72\);/.test(src)
  && /這條 0821 就定過：「用暗化表示 不要透明化」/.test(src));
ok('手機課卡：教練請假紅標（與桌機同款）',
  /const tag = bkIsCoachLeave\(b\) \? `<span class="evc-coach" style="background:#7A2E28/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
