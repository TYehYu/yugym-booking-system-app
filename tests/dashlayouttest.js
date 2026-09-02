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
/* 2026-09-02 使用者指示（附截圖）：「從一列改成一欄　第一列是教練名稱
   在教練下面排他當天的課卡」—— 桌機面板改排 colHtml（一位教練一欄）。
   cardHtml（橫排版）留著沒刪：同一批卡片的另一種容器，版面被來回改過五次。 */
ok('★ 桌機面板直接排 colHtml（一日行事曆退場）',
   /<div class="tcol-scroll">\$\{rows\.map\(r=>r\.colHtml\)\.join\(''\)\}<\/div>/.test(src));
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
/* 0822：改成三欄排法後再加寬到 190px（120 放不下「章＋三列＋時間／教練」） */
/* 2026-08-23 使用者指示：「是不是可以再改窄一點」→ 190px 收到 165px（高度不變） */
ok('★ .tcard-std 收窄到 165px（高度維持 98px）',
   /\.tcard\.tcard-std\{width:165px;min-height:98px;\}/.test(src));
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
/* 0822：「N 人上課中」標籤移除（那一列本來就有流星邊框），只留日期翻頁 */
ok('★ 日期翻頁照舊；「N 人上課中」標籤已移除',
   /onclick="dashDayShift\(-1\)"/.test(src) && !/\$\{_liveCount\} 人上課中/.test(src));

console.log('\n日期列改成一整週（2026-08-21 使用者：「改成一週 [8/17一][8/18二] 依序下去排到週日」）');
/* 0822：七個日期鈕從上方橫排搬到左側直欄（見 tests/deskrailtest.js） */
/* 0822 改成左側直欄 → 0823 使用者指示搬回上方橫列 */
ok('★ 桌機面板的日期鈕在上方、橫向一列',
   /<div class="twk-barin">\$\{_wkDays\}<\/div>/.test(src)
   && !/<div class="twk-railin">/.test(src)
   /* 2026-08-23：「回到今天」搬到日期列的翻頁鈕旁邊 → 標題列只剩右邊的圖例 */
   && /<div class="tl-panel tl-desktop-only">[\s\S]{0,400}?<div class="tl-panel-top"><div class="tl-top-right">\$\{legend\}<\/div><\/div>/.test(src));
ok('　　手機版維持一天一天翻（螢幕放不下七個鈕）',
   /<div class="mtc-wrap-top"><div class="tl-title tl-title-date">[\s\S]{0,200}?<span class="tl-date">\$\{_taskDateLbl\}<\/span>/.test(src));
ok('★ 週一起算（健身房的排班與課表都以週一為一週的開始）',
   /mon\.setDate\(_tdD\.getDate\(\)-\(\(_tdD\.getDay\(\)\+6\)%7\)\);/.test(src)
   && /const W='一二三四五六日';/.test(src));
ok('★ 顯示 M/D＋星期（8/17 一）',
   /<span class="twk-md">\$\{d\.getMonth\(\)\+1\}\/\$\{d\.getDate\(\)\}<\/span><span class="twk-w">\$\{W\[i\]\}<\/span>/.test(src));
ok('　　點一下換那天（沿用既有的 dashPickDay）', /onclick="dashPickDay\('\$\{ds\}'\)"/.test(src));
ok('★ 左右鍵直接 ±7 天，不另外維護週偏移狀態（會和 _dashViewDate 打架）',
   /onclick="dashDayShift\(-7\)" title="上一週"/.test(src)
   && /onclick="dashDayShift\(7\)" title="下一週"/.test(src)
   && /不另外維護一個週偏移狀態（那會和 _dashViewDate 兩份狀態互相打架）/.test(src));
/* 0822 使用者定版：兩個維度交換 —— 今天＝品牌綠底、選取＝黑框（可以同時成立） */
/* 0823：選取改金色底（使用者：「桌機首頁這邊日期列 選取也改成金色底」「今日維持綠色底」）
   —— 與手機首頁 .a2-day.on、手機行事曆 .admh .msb-date.on 同一組數值。 */
ok('　　選中的那天與今天分得開（今天＝綠底、選中＝金色底）',
   /\.twk-day\.today\{background:var\(--green\);color:#fff;border-color:var\(--green\);\}/.test(src)
   && /\.twk-day\.on\{border-color:var\(--gold,#B48A56\);border-width:2px;\}/.test(src)
   && /\.twk-day\.on:not\(\.today\)\{background:rgba\(180,138,86,\.14\);color:var\(--gold-d,#8a6a30\);\}/.test(src));
ok('　　今天被選取時綠底不被蓋掉（底色那條帶 :not(.today)）',
   /今天被選取時＝綠底＋金框，綠底不被蓋掉/.test(src));
ok('　　滑過看得到那天有幾堂', /title="\$\{ds\}\$\{n\?`　\$\{n\} 堂`:'　沒有課'\}"/.test(src));
/* 0823 使用者指示：「首頁的月曆翻頁的按鈕跟日期列翻頁的按鈕都改成品牌紅」
   「月曆翻頁的按鈕改成左右」——日期格剛改成金色底，翻頁鈕再是金的就變成兩種金互相稀釋。 */
/* 同日再修（使用者看了實機）：「首頁月曆左右按鈕改回綠色加上透明」——
   綠卡上的紅鈕變成整張卡最搶眼的東西，但它只是翻月。日期列那顆維持紅（米底＋金格才分得開）。 */
ok('★★ 日期列的翻頁鈕是品牌紅（與「回到今天」同一支紅）',
   /\.twk-bar>\.tl-daynav\{flex:0 0 auto;margin:0;align-self:center;\s*\n\s*background:var\(--danger,#7F0303\);color:#fff;\}/.test(src));
ok('★★ 月曆翻頁鈕改回半透明白（疊在品牌綠底上＝透出來的綠），不再被紅色覆蓋',
   !/\.mcal-btn\.mcal-btn-nav\{background:var\(--danger/.test(src)
   && /\.cal-side \.mcal-btn,\.cag-mcal \.mcal-btn\{background:rgba\(255,255,255,\.14\);\}/.test(src)
   && /綠卡上的紅鈕變成整張卡最搶眼的東西，\s*\n\s*但它只是翻月，不是提醒/.test(src));
ok('★★ 月曆翻頁改左右箭頭（上下會被讀成「捲動這張表」）',
   /<button class="mcal-btn mcal-btn-nav" onclick="admCalShift\(-1\)" title="上個月">‹<\/button>/.test(src)
   && /<button class="mcal-btn mcal-btn-nav" onclick="admCalShift\(1\)" title="下個月">›<\/button>/.test(src)
   && !/onclick="admCalShift\(-1\)">︿/.test(src));
ok('　　class 留著但沒有樣式，是刻意的（‹ › 兩顆要與日後其他頭列鈕分得出來）',
   /mcal-btn-nav 這個 class 留在標記上但目前沒有樣式，是刻意的/.test(src));
/* 0823 使用者指示：「可以把內容距離邊界的空間縮小，不要讓邊邊白一區那麼多，今日營收也是」 */
ok('★ 卡片內距收斂（日期列與 KPI 卡都不要四周留一條白帶）',
   /\.tl-panel\{background:var\(--card\);border:1px solid var\(--bd\);border-radius:16px;padding:12px 14px 8px;/.test(src)
   && /\.dash-sum-card\{background:var\(--card\);border:1px solid var\(--bd\);border-radius:16px;padding:14px 16px;/.test(src));
{
  /* 週一起算的算法（與 index.html 同一條式子） */
  const monOf=d=>{ const x=new Date(d); x.setDate(d.getDate()-((d.getDay()+6)%7)); return x; };
  const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
  const week=d=>{ const m=monOf(d); return Array.from({length:7},(_,i)=>{
    const x=new Date(m); x.setDate(m.getDate()+i); return fmt(x); }); };
  eq('★ 8/21（五）那一週＝8/17 一 … 8/23 日',
     week(new Date(2026,7,21)), ['8/17','8/18','8/19','8/20','8/21','8/22','8/23']);
  eq('　　週日看到的是同一週（不會跳到下一週）',
     week(new Date(2026,7,23))[0], '8/17');
  eq('　　週一看到的也是同一週', week(new Date(2026,7,17))[0], '8/17');
  eq('　　跨月照樣連續（8/31 一 → 9/6 日）',
     week(new Date(2026,7,31)), ['8/31','9/1','9/2','9/3','9/4','9/5','9/6']);
}

console.log('\n課卡加一列「第幾堂／共幾堂」（使用者：「這第幾堂/總堂數在名字下面」）');
/* 2026-08-21 四修：姓名與出席章包成 .tcard-nmrow 一列，這一行接在那一列後面
   （.tcard-txt 是直排 → 等於名字下面一列） */
ok('★ 接在姓名那一列的下面（0822 起是第二欄的第三列）',
   /<span class="t3-l3">\$\{\(\(\)=>\{\s*\n\s*const q=\(window\._bkSeq\|\|\{\}\)\[b\.id\];/.test(src)
   && /return q\?\(q\.n>=999\?\('第 '\+q\.i\+' 堂'\):\(q\.i\+'\/'\+q\.n\+' 堂'\)\):'';/.test(src));
ok('　　無限次卡只標「第 N 堂」（9999 堂的票寫成 45/9999 沒有意義）',
   /無限次卡（親友自主訓練 sessions_total=9999）寫「45\/9999 堂」沒有意義，只標第幾堂/.test(src));
ok('★ 沿用 computeLastBkMarks 已建好的索引，不另外掃一次 bookings',
   /window\._bkSeq=\{\};/.test(src)
   && /const arr=_bkByTk\[t\.id\]; if\(!arr\|\|!arr\.length\) return;/.test(src)
   && /arr\.forEach\(\(b,i\)=>\{ window\._bkSeq\[b\.id\]=\{i:i\+1,n\}; \}\);/.test(src));
ok('　　分母沒有 sessions_total 就退回「目前排了幾堂」',
   /const n=Number\(t\.sessions_total\)\|\|arr\.length;/.test(src));
ok('　　樣式比姓名小一階、淡一點（不跟人名搶視線）',
   /\.tcard-seq\{font-family:var\(--num\);font-size:10\.5px;font-weight:700;opacity:\.7;/.test(src));
ok('　　沒扣到票的課不畫這一列（體驗／場租／待簽約／團課）',
   /只有扣到票的課才有（體驗／場租／待簽約沒有票，就不畫這一列）/.test(src));
{
  /* 序號算法（與 computeLastBkMarks 同一套）：取消的不佔序號、依日期時間排序 */
  const seqOf=(tickets,bookings)=>{
    const by={};
    bookings.forEach(b=>{ if(b.ticket_id&&b.status!=='cancelled'){ (by[b.ticket_id]=by[b.ticket_id]||[]).push(b); } });
    Object.values(by).forEach(a=>a.sort((x,y)=>((x.date||'')+(x.start_time||'')).localeCompare((y.date||'')+(y.start_time||''))));
    const out={};
    tickets.forEach(t=>{ const arr=by[t.id]; if(!arr||!arr.length) return;
      const n=Number(t.sessions_total)||arr.length;
      arr.forEach((b,i)=>{ out[b.id]={i:i+1,n}; }); });
    return out;
  };
  const tk=[{id:'T1',sessions_total:12}];
  const bk=[{id:'B3',ticket_id:'T1',date:'2026-08-21',start_time:'12:00',status:'booked'},
            {id:'B1',ticket_id:'T1',date:'2026-08-10',start_time:'10:00',status:'checked_in'},
            {id:'B2',ticket_id:'T1',date:'2026-08-15',start_time:'09:00',status:'checked_in'},
            {id:'BX',ticket_id:'T1',date:'2026-08-12',start_time:'09:00',status:'cancelled'},
            {id:'N1',ticket_id:null,date:'2026-08-21',start_time:'13:00',status:'booked'}];
  const r=seqOf(tk,bk);
  eq('★ 依日期時間排序，8/21 那堂是第 3 堂 / 共 12 堂', [r.B3.i, r.B3.n], [3,12]);
  eq('★ 取消的那堂不佔序號（8/12 被取消，8/15 仍是第 2 堂）', r.B2.i, 2);
  eq('　　沒有票的課不列入', r.N1===undefined, true);
  eq('　　沒有 sessions_total → 分母＝目前排了幾堂',
     seqOf([{id:'T1'}],[{id:'A',ticket_id:'T1',date:'2026-08-01',start_time:'09:00',status:'booked'}]).A, {i:1,n:1});
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
