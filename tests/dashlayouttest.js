/* 首頁教練任務的版面（2026-08-21 同一天走了一圈又回來）
   ① 「首頁這邊教練任務 改成一日行事曆 最上方一排教練篩選列 課堂最多的往左邊排序」
   ② 「移除上方篩選列」
   ③ 「紅線沒對到時間」（線只在畫面產生當下定位一次）
   ④ 「排序可以新增一個規則 待會有要上課的教練往左邊排」→「zoe 應該要排到第二個來」
   ⑤ 「首頁改回原本的樣式 只是課卡要維持現在這個版本的大小」
   ⑥ 「課堂數最多的擺最上面 因為現在沒有紅跟時段了 所以只要維持課堂最多的在最上方」

   最後的結論：版面回到「一列一位教練、課卡橫排」，排序也回到「課堂最多的在最上面」；
   一日行事曆與 nextMin 排序整組移除。這一天唯一留下來的是**課卡放大後的尺寸**。 */
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
   && /留下來的：課卡放大後的尺寸/.test(src));
ok('★ .tcard-zoom 沒有跟著回來（課卡要維持固定大小，縮放會讓它忽大忽小）',
   !/class="tcard-zoom"/.test(src) && !/TCARD_ZOOM_MIN=/.test(src)
   && !/setProperty\('--tcz'/.test(src));
ok('　　教練多到放不下就內捲（.tcard-body 本來就是捲動容器）',
   /\.mc-coachcenter \.tcard-body\{flex:1;min-height:0;overflow-y:auto;/.test(src));

console.log('\n這一天唯一留下來的：課卡維持行事曆版的大小');
ok('★ .tcard-std 由 84px 加寬到 120px（高度維持 98px）',
   /\.tcard\.tcard-std\{width:120px;min-height:98px;\}/.test(src));
ok('　　原因寫在原地', /一日行事曆版的課卡寬度是欄寬（實測約 120px），改回橫排後沿用那個尺寸/.test(src));
ok('　　課卡 HTML 本身仍然沒被動過（產生器與版面分開）',
   /const _cardsArr=_bkSorted\.map\(b=>\{/.test(src)
   && /const cards=_cardsArr\.join\(''\);/.test(src)
   && /onclick="onTcardClick\(event,'\$\{b\.id\}'\)"/.test(src));

console.log('\n排序回到「課堂最多的在最上面」');
/* 2026-08-21 使用者定案：「課堂數最多的擺最上面 因為現在沒有紅跟時段了
   所以只要維持課堂最多的在最上方」—— 中途那條「下一堂越早的越左」（nextMin）
   是為了搭配一日行事曆（有時間軸與現在線），版面收掉後跟著退場。 */
ok('★ 第一順位是課堂數（0723 定案），nextMin 整個退場',
   /const _taskSort=\(a,b\)=> \(b\.total-a\.total\) \|\| \(b\.isLive-a\.isLive\)/.test(src)
   && !/nextMin:/.test(src) && !/a\.nextMin-b\.nextMin/.test(src));
ok('　　桌機列與手機列表仍共用同一條',
   /rows\.sort\(_taskSort\);/.test(src)
   && /\$\{rows\.slice\(\)\.sort\(_taskSort\)\.map\(r=>r\.mobileHtml\)\.join\(''\)\}/.test(src));
ok('　　為什麼不要再加即時條件，寫在原地',
   /沒有時間軸的版面上，\s*\n\s*順序整天變動只會讓人找不到教練在哪一列/.test(src));
{
  const sort=(a,b)=> (b.total-a.total) || (b.isLive-a.isLive) || (b.isSelf-a.isSelf)
    || (a.rank-b.rank) || ((a.hireDate>b.hireDate)?1:(a.hireDate<b.hireDate?-1:0));
  const mk=(n,total,o)=>Object.assign({n,total,isLive:0,isSelf:0,rank:5,hireDate:'2020-01-01'},o||{});
  eq('★ 課堂多的在上面（不管待會有沒有課）',
     [mk('少',1), mk('多',6), mk('中',3)].sort(sort).map(x=>x.n), ['多','中','少']);
  eq('　　同堂數 → 上課中的優先',
     [mk('閒著',3), mk('上課中',3,{isLive:1})].sort(sort).map(x=>x.n), ['上課中','閒著']);
  eq('　　再同 → 自己優先，然後職等、到職日',
     [mk('別人',3), mk('我',3,{isSelf:1})].sort(sort).map(x=>x.n), ['我','別人']);
  eq('　　順序整天固定：時間走過去也不會重排（沒有任何條件吃「現在」）',
     [mk('A',5), mk('B',2)].sort(sort).map(x=>x.n), ['A','B']);
}

console.log('\n沒有動到的地方');
ok('★ 手機版維持原本的圓點列表', /r\.mobileHtml/.test(src));
ok('★ 預約管理仍是七日行事曆（_calDays 預設 7）', /let _calDays=7;/.test(src));
ok('★ 日期翻頁與「N 人上課中」照舊',
   /onclick="dashDayShift\(-1\)"/.test(src) && /\$\{_liveCount\} 人上課中/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
