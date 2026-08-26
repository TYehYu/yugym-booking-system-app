/* 抽獎名單的「簽到 N 堂」寫的是累計，不是本月（2026-08-26 使用者回報）
   「葉思葦簽到7堂?　這個月是4堂才對　這邊數字應該是代表這個月他上幾次了吧」

   資格算法本來就是對的（逐月 Math.floor(當月堂數/4)，教練課才算），
   錯在名單上那個數字：att 是 LOTTO_FROM(2026-07) 以來的累計，
   卻印在「當月教練課簽到滿 4 堂可抽 1 次」這句規則旁邊。
   葉思葦 7 月 3 堂 ＋ 8 月 4 堂 = 7 → 畫面寫「簽到 7 堂」。
   ⚠ 更糟的是 7 月那 3 堂**永遠不會**變成次數（門檻逐月算、餘數不累積），
     把它們算進去是雙重誤導。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabLine=s=>{const i=src.indexOf(s);return src.slice(i,src.indexOf('\n',i));};

const F=new Function(grabLine("const LOTTO_FROM=")+'\n'
  +grabFn('lottoEarnedByMember')+'\n'+grabFn('lottoPendingFrom')+'\n'+grabFn('lottoSubLabel')
  +'\nreturn {lottoEarnedByMember, lottoPendingFrom, lottoSubLabel};')();

/* 正式庫 2026-08-26 的真實資料 */
const bk=(mid,ym,d,n,cat)=>Array.from({length:n},(_,i)=>({member_id:mid, date:`${ym}-${String(d+i).padStart(2,'0')}`,
  category:cat||'私人教練', status:'checked_in'}));
const BOOKINGS=[].concat(
  bk('YE','2026-07',1,3),          // 葉思葦 7 月教練課 3 堂 → 0 次
  bk('YE','2026-08',5,4),          // 葉思葦 8 月教練課 4 堂 → 1 次
  bk('YE','2026-08',9,3,'自主訓練'), // 自主訓練 3 堂 → 不計
  bk('HU','2026-07',1,4),          // 黃淨萍 7 月 4 堂 → 1 次
  bk('HU','2026-08',1,4),          // 黃淨萍 8 月 4 堂 → 1 次
  [{member_id:'YE', date:'2026-08-26', category:'私人教練', status:'cancelled'}]   // 取消的不算
);

console.log('① 資格算法本來就對，不要改壞');
{
  const E=F.lottoEarnedByMember(BOOKINGS,'2026-08');
  eq('★★ 葉思葦：累計 7 堂、掙到 1 次（7 月 3 堂不滿 4，餘數不累積）',
     [E.YE.att, E.YE.earned], [7,1]);
  eq('★★ 黃淨萍：累計 8 堂、掙到 2 次', [E.HU.att, E.HU.earned], [8,2]);
  ok('★ 自主訓練／團課／體驗／按摩都不計（規則卡上就這樣寫）',
     /if\(b\.status==='cancelled' \|\| b\.category!=='私人教練'\) return;   \/\/ 團課／自主／體驗／按摩皆不計/.test(src));
  eq('　 取消的那一堂沒被算進去', E.YE.att, 7);
}

console.log('\n② 新增 cur＝這個月幾堂');
{
  const E=F.lottoEarnedByMember(BOOKINGS,'2026-08');
  eq('★★ 葉思葦本月 4 堂（不是累計的 7）', E.YE.cur, 4);
  eq('★★ 黃淨萍本月 4 堂（不是累計的 8）', E.HU.cur, 4);
  eq('★ 看 7 月時 cur 是 7 月的數字（歷史月份也對）',
     [F.lottoEarnedByMember(BOOKINGS,'2026-07').YE.cur,
      F.lottoEarnedByMember(BOOKINGS,'2026-07').HU.cur], [3,4]);
  eq('　 沒帶 ym 時 cur 為 0（不要回 undefined 讓畫面印 NaN）',
     F.lottoEarnedByMember(BOOKINGS,null).YE.cur, 0);
  ok('★ att 保留不動（那是「累計上過幾堂」，別處可能還要用）',
     /out\[id\]=\{earned, att, cur:\(ym\?\(months\[ym\]\|\|0\):0\), months:from\};/.test(src));
  ok('★ lottoStats 有把 cur 帶出去（不然畫面拿不到）',
     /\.map\(id=>\(\{id, att:E\[id\]\.att, cur:E\[id\]\.cur, earned:E\[id\]\.earned/.test(src));
}

console.log('\n③ 名單那一列要寫什麼');
{
  const E=F.lottoEarnedByMember(BOOKINGS,'2026-08');
  const row=(id,used)=>{ const e=E[id];
    return Object.assign({id, att:e.att, cur:e.cur, earned:e.earned, used, months:e.months},
                         {left:e.earned-used}); };
  eq('★★ 葉思葦：本月剛好 4 堂 → 不加「再 N 堂」的尾巴',
     F.lottoSubLabel(row('YE',0),'2026-08'), '本月簽到 4 堂');
  eq('★★ 黃淨萍：本月 4 堂、還欠 7 月那一次沒抽 → 兩件事都要看得到',
     F.lottoSubLabel(row('HU',0),'2026-08'), '本月簽到 4 堂　·　7 月未抽');
  eq('　 7 月那一次抽掉之後就不再提舊帳',
     F.lottoSubLabel(row('HU',1),'2026-08'), '本月簽到 4 堂');
  eq('★ 本月 5 堂 → 講出還差幾堂才多一次（櫃檯照著講就好）',
     F.lottoSubLabel({cur:5,left:1,months:[{ym:'2026-08',n:1}]},'2026-08'),
     '本月簽到 5 堂（再 3 堂多一次）');
  eq('★ 本月 8 堂（剛好兩次）也不加尾巴',
     F.lottoSubLabel({cur:8,left:2,months:[{ym:'2026-08',n:2}]},'2026-08'),
     '本月簽到 8 堂');
  /* lottoPendingFrom 只有「2 次以上」才寫次數（既有行為，1 次時省略） */
  eq('　 兩次以上會寫出次數',
     F.lottoSubLabel({cur:0,left:2,months:[{ym:'2026-07',n:2}]},'2026-08'),
     '本月簽到 0 堂　·　7 月 2 次未抽');
  eq('　 本月 0 堂（純舊帳）也講得出來',
     F.lottoSubLabel({cur:0,left:1,months:[{ym:'2026-07',n:1}]},'2026-08'),
     '本月簽到 0 堂　·　7 月未抽');
  eq('　 什麼都沒有也不會爆', F.lottoSubLabel(null,'2026-08'), '本月簽到 0 堂');
}

console.log('\n④ 接線與版面');
ok('★★ 畫面改吃 lottoSubLabel（原本是「有舊帳就只顯示舊帳」二選一）',
   /<span class="lot-btn-sub">\$\{lottoSubLabel\(x, ym\)\}<\/span>/.test(src)
   && !/簽到 \$\{x\.att\} 堂/.test(src));
ok('★ 為什麼兩件事都要顯示，寫在原地',
   /本月幾堂決定「還差幾堂再多一次」，舊帳決定「這次是哪個月欠的」/.test(src));
ok('★ 副標變長 → 允許縮＋省略號，姓名那格才不會被擠沒',
   /\.lot-btn-sub\{font-size:10\.5px;color:var\(--t3\);flex:0 1 auto;min-width:0;\s*\n\s*overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}/.test(src));
ok('★★ 使用者原話與案例數字寫在原地',
   /葉思葦簽到 7 堂\?　這個月是 4 堂才對/.test(src)
   && /葉思葦 7 月 3 堂＋8 月 4 堂＝7，畫面顯示「簽到 7 堂」/.test(src));
ok('★★ 「不滿 4 堂的餘數永遠不會變成次數」寫在原地',
   /7 月那 3 堂\*\*永遠不會\*\*變成次數（門檻是逐月算、不滿 4 堂的餘數不累積）/.test(src));
ok('　 規則卡的文案沒被動到（當月滿 4 堂可抽 1 次、沒抽的一直留著）',
   /當月<b>教練課（含友善）<\/b>簽到滿 4 堂可抽 1 次（可累計；團課\/自主訓練不計）/.test(src)
   && /<b>沒來抽的次數會一直留著<\/b>/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
