/* 首頁教練任務的版面（2026-08-21 同一天走了一圈又回來）
   ① 「首頁這邊教練任務 改成一日行事曆 最上方一排教練篩選列 課堂最多的往左邊排序」
   ② 「移除上方篩選列」
   ③ 「紅線沒對到時間」（線只在畫面產生當下定位一次）
   ④ 「排序可以新增一個規則 待會有要上課的教練往左邊排」→「zoe 應該要排到第二個來」
   ⑤ 「首頁改回原本的樣式 只是課卡要維持現在這個版本的大小」

   最後的結論：版面回到「一列一位教練、課卡橫排」，一日行事曆整組移除；
   留下來的只有兩樣 —— 課卡放大後的尺寸，與「下一堂越早的越左」那條排序。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('版面回到一列一位教練、課卡橫排');
ok('★ 桌機面板直接排 cardHtml（一日行事曆退場）',
   /<div class="tcard-body">\$\{rows\.map\(r=>r\.cardHtml\)\.join\(''\)\}<\/div>/.test(src));
/* 只驗「程式」不在了 —— 註解裡還留著這些名字，說明它們為什麼被拿掉 */
ok('★ 一日行事曆整組移除：沒有殘留的死程式',
   !/function dashDayCalHTML/.test(src) && !/dashDayCalHTML\(rows/.test(src)
   && !/function dcalLanes/.test(src) && !/const DCAL_SLOT/.test(src)
   && !/\.dcal-col\{/.test(src) && !/class="dcal-/.test(src));
ok('　　連現在線那段就地更新也一起拿掉（沒有 .dcal-now 可移了）',
   !/querySelectorAll\('\.dcal-now'\)/.test(src));
ok('　　為什麼移除、留下什麼，寫在原地',
   /首頁一日行事曆（教練當欄位＋時間軸＋現在線）於 2026-08-21 當天移除/.test(src)
   && /留下來的兩樣：課卡放大後的尺寸，以及「下一堂越早的越左」那條排序/.test(src));
ok('★ .tcard-zoom 沒有跟著回來（課卡要維持固定大小，縮放會讓它忽大忽小）',
   !/class="tcard-zoom"/.test(src) && !/TCARD_ZOOM_MIN=/.test(src)
   && !/setProperty\('--tcz'/.test(src));
ok('　　教練多到放不下就內捲（.tcard-body 本來就是捲動容器）',
   /\.mc-coachcenter \.tcard-body\{flex:1;min-height:0;overflow-y:auto;/.test(src));

console.log('\n留下來的①：課卡維持行事曆版的大小');
ok('★ .tcard-std 由 84px 加寬到 120px（高度維持 98px）',
   /\.tcard\.tcard-std\{width:120px;min-height:98px;\}/.test(src));
ok('　　原因寫在原地', /一日行事曆版的課卡寬度是欄寬（實測約 120px），改回橫排後沿用那個尺寸/.test(src));
ok('　　課卡 HTML 本身仍然沒被動過（產生器與版面分開）',
   /const _cardsArr=_bkSorted\.map\(b=>\{/.test(src)
   && /const cards=_cardsArr\.join\(''\);/.test(src)
   && /onclick="onTcardClick\(event,'\$\{b\.id\}'\)"/.test(src));

console.log('\n留下來的②：下一堂越早的越左');
ok('★ 排序第一順位是 nextMin（桌機與手機列表共用）',
   /rows\.sort\(_taskSort\);/.test(src)
   && /const _taskSort=\(a,b\)=> \(a\.nextMin-b\.nextMin\) \|\| \(b\.total-a\.total\)/.test(src)
   && /\$\{rows\.slice\(\)\.sort\(_taskSort\)\.map\(r=>r\.mobileHtml\)\.join\(''\)\}/.test(src));
ok('　　正在上課＝「現在」、還有下一堂＝那一堂的時間、今天上完＝Infinity',
   /nextMin: !isTodayView \? Infinity\s*\n\s*: \(inClass \? nowMin\s*\n\s*: \(nextBk \? timeToMin\(nextBk\.start_time\|\|'0:0'\) : Infinity\)\),/.test(src));
ok('　　看別天不套這條（沒有「現在」可比，會變成「誰最早開工」）',
   /只在檢視今天才算：看別天沒有「現在」可比/.test(src));
{
  const sort=(a,b)=> (a.nextMin-b.nextMin) || (b.total-a.total) || (b.isLive-a.isLive)
    || (b.isSelf-a.isSelf) || (a.rank-b.rank) || ((a.hireDate>b.hireDate)?1:(a.hireDate<b.hireDate?-1:0));
  const mk=(n,nextMin,total,isLive)=>({n,nextMin,total,isLive:isLive?1:0,isSelf:0,rank:5,hireDate:'2020-01-01'});
  const now=14*60+57;   // 使用者附圖的時間
  eq('★ 附圖情境：上課中的 RANDY 第一、15:00 的 ZOE 第二、16:00 的 MANGO 第三',
     [mk('MANGO',16*60,2), mk('RANDY',now,3,true), mk('ZOE',15*60,0)]
       .sort(sort).map(x=>x.n), ['RANDY','ZOE','MANGO']);
  eq('★ 課堂數退成第二順位：同一時間開課才由它決定',
     [mk('少課',15*60,1), mk('多課',15*60,6)].sort(sort).map(x=>x.n), ['多課','少課']);
  eq('★ 今天上完的整群落到最後，群內退回課堂數優先（0723 的規則）',
     [mk('上完了A',Infinity,1), mk('待會有課',20*60,1), mk('上完了B',Infinity,7)]
       .sort(sort).map(x=>x.n), ['待會有課','上完了B','上完了A']);
  eq('　　看別天：全部 Infinity → 退回課堂數優先',
     [mk('A',Infinity,2), mk('B',Infinity,5)].sort(sort).map(x=>x.n), ['B','A']);
}

console.log('\n沒有動到的地方');
ok('★ 手機版維持原本的圓點列表', /r\.mobileHtml/.test(src));
ok('★ 預約管理仍是七日行事曆（_calDays 預設 7）', /let _calDays=7;/.test(src));
ok('★ 日期翻頁與「N 人上課中」照舊',
   /onclick="dashDayShift\(-1\)"/.test(src) && /\$\{_liveCount\} 人上課中/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
