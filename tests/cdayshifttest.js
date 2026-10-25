/* 班表與值班標注停課（2026-10-25 使用者：「另外因為這個月有兩天因為颱風停課
   員工值班也要標注一下」→「這邊值班也沒有標示」）

   10/23、10/24 颱風停課。店沒開，但班表上三個人照樣排著班、首頁「今日值班」
   四個人全掛紅色「未打卡」—— 看起來像全員翹班。

   這支盯五件事：
     ① 停課日哪裡來（沒有專用資料表，真相在那天被取消的預約的 cancel_reason）
     ② 查失敗不可以假裝「沒停課」
     ③ 班表：表頭掛「停」、格子打斜線，而且班照留
     ④ 停課日不算空班
     ⑤ 值班圈：停課取代紅色未打卡，但有打卡的人照原樣畫 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');
 let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]=='{')d++;else if(src[k]=='}'){d--;if(!d)return src.slice(i,k+1);}}};
const css=(src.match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join('\n');

console.log('\n① 停課日的來源');
const fnSrc=grab('closedDaysOfMonth');
ok('★ 有 closedDaysOfMonth 這支', !!fnSrc);
ok('★ 讀的是 bookings 的 cancel_reason，不是另一張表',
   /sb\.from\('bookings'\)\.select\('date,cancel_reason'\)/.test(fnSrc));
ok('★ 兩種前綴都認（10/23 以前寫的是「天災停課」）',
   /cancel_reason\.like\.臨時停課%/.test(fnSrc) && /cancel_reason\.like\.天災停課%/.test(fnSrc));
ok('　　只撈當月、只撈兩個欄位（不走 dbGetAll 把整張表拉下來）',
   /\.gte\('date'/.test(fnSrc) && /\.lte\('date'/.test(fnSrc) && !/dbGetAll/.test(fnSrc));
ok('　　只認已取消的那些', /\.eq\('status','cancelled'\)/.test(fnSrc));

/* 實跑：給一批假資料，看它整理出來的是不是「日期 → 理由」 */
const mk=(data,err)=>({ from:()=>({ select:()=>{ const q={ gte:()=>q, lte:()=>q, eq:()=>q,
  or:()=>Promise.resolve(err?{error:err}:{data,error:null}) }; return q; } }) });
const run=async(data,err)=>{
  /* 2026-10-25：員工端講「停班」，理由尾巴的「停課」兩字會被 cdayStaffWhy 去掉。 */
  const g={ window:{_closedDayCache:{}}, console:{warn(){}}, sb:mk(data,err),
            cdayStaffWhy:b=>String(b.cancel_reason||'').replace(/^臨時停課・/,'')
              .replace(/（[^（）]*）\s*$/,'').replace(/停課$/,'')||'停班' };
  const f=new Function('window','sb','cdayStaffWhy','console', fnSrc+';return closedDaysOfMonth;')
    (g.window,g.sb,g.cdayStaffWhy,g.console);
  return await f('2026-10');
};
(async()=>{
  const r1=await run([{date:'2026-10-23',cancel_reason:'天災停課（2026-10-23）'},
                      {date:'2026-10-23',cancel_reason:'天災停課（2026-10-23）'},
                      {date:'2026-10-24',cancel_reason:'臨時停課・設備維修（2026-10-24）'}]);
  ok('★ 實跑：同一天多筆只留一個，理由取人看的那一段（員工端去掉尾巴的「停課」）',
     r1 && r1['2026-10-23']==='天災' && r1['2026-10-24']==='設備維修', r1);

  console.log('\n② 查失敗不可以假裝沒停課');
  const r2=await run(null,{message:'boom'});
  ok('★★ 實跑：讀失敗回 null，不是空物件',
     r2===null, r2);
  ok('　　而且留下痕跡（空 catch 會偽裝成沒資料，0820 的教訓）',
     /console\.warn\('\[closedDaysOfMonth\]/.test(fnSrc));
  ok('　　呼叫端把 null 當成「這個月不標」', /closedDaysOfMonth\(month\) \|\| \{\}/.test(src));

  console.log('\n③ 班表');
  const sh=grab('renderShiftsTab');
  ok('★ 表頭掛一枚「停」', /class="sh-closed-tag"[\s\S]{0,160}>停</.test(sh));
  ok('★ 表頭不吃「過去日期」的淡化（停課正是回頭要看的東西）',
     /\$\{_cw\?' sh-closed-h':\(_isPast\(ds\)\?' sh-past-h':''\)\}/.test(sh));
  ok('★ 停課日不畫空班紅點（兩個紅記號疊同一格會互相干擾）',
     /\$\{_cw\?closedMark:gapMark\}/.test(sh));
  ok('★★ 班照留 —— 格子只加 class，inner 一個字都沒改',
     /\$\{_cwc\?' sh-closed':\(_past\?' sh-past':''\)\}/.test(sh)
     && /sh-closed[\s\S]{0,400}\$\{inner\|\|\(_canEditShifts\?'<span class="sh-plus">＋<\/span>':''\)\}/.test(sh));
  ok('　　支援班那一列也標', /支援班那一列也要跟著標/.test(sh));
  ok('　　請假那一列也標', /\$\{_closedMap\[dateStr\]\?' sh-closed':''\} sh-cell-ro/.test(sh));
  ok('　　滑過去看得到原因與日期', /全館停班・\$\{_cwc\}/.test(sh) && /全館停班・\$\{_cw\}/.test(sh));

  console.log('\n④ 停課日不算空班');
  ok('★ 表頭的空班紅點集合濾掉停課日',
     /monthShiftGaps\(monthShifts, month\)\s*\n?\s*\.filter\(g=>!_closedMap\[g\.date\]\)/.test(sh));
  ok('★ 下面那張空班警告卡也濾掉', /\.filter\(g=>!_closedMap\[g\.date\]\);\s*\/\* 停課日不算空班/.test(sh));
  ok('　　理由寫在原地（店沒開，「營業時間內無人值班」不成立）',
     /店沒開，「營業時間內無人值班」不成立/.test(sh));

  console.log('\n⑤ 值班圈');
  const dr=grab('dutyRingHTML');
  ok('★ 多收一個 closedWhy', /function dutyRingHTML\(name, att, shift, nowMinV, isToday, closedWhy\)/.test(dr));
  ok('★★ 停課的日子不算遲到（紅色未打卡要讓位）',
     /const late=!_cw && !!\(isToday/.test(dr));
  ok('★ 停班畫中性灰圈、寫「停班」（員工端的講法）',
     /dr-closed/.test(dr) && />停</.test(dr) && />停班</.test(dr) && !/>停課</.test(dr));
  ok('★★ 只影響沒打卡的那一支 —— 有來打卡的照原樣畫圈',
     dr.indexOf('dr-closed') < dr.indexOf('const _rawIn=timeToMin(att.clock_in)'));
  /* 這一段註解寫在 function 那一行的上面，grab 抓不到，所以比 src */
  ok('　　理由寫在原地（颱風天有人進來顧店，那是真的值班）',
     /颱風天有人進來顧店/.test(src));

  console.log('\n　首頁傳得進去');
  ok('★ 停班原因由當天的預約推出來，不另外查一次',
     /const _dayClosedWhy=\(\(\)=>\{ const b=\(dayBkAll\|\|\[\]\)\.find\(bkClosedDay\); return b\?cdayStaffWhy\(b\):''; \}\)\(\);/.test(src));
  ok('★ 傳進每一顆圈', /nowMin, isTodayView, _dayClosedWhy\)/.test(src));
  ok('★ 卡片上掛一條停班橫標', /mc-closed-bar">全館停班・\$\{escH\(_dayClosedWhy\)\}/.test(src));
/* ⚠ 桌機的卡片標題是 display:none（.mc-hide-h），櫃檯看的正是桌機 ——
   掛在標題裡等於只有手機看得到。第一版就是這樣寫的，mock 上才發現。 */
  ok('★★★ 停班橫標不可以掛在 .mc-hide-h 的標題裡（桌機看不到）',
     !/mc-card-h mc-hide-h">今日值班\$\{_dayClosedWhy/.test(src)
     && /\.mc-hide-h 在桌機是 display:none/.test(src));
  ok('　　打卡紀錄／時數／值班費一律不動（要不要照給是老闆的決定）',
     /只改顯示：打卡紀錄、時數、值班費一律不動/.test(src));

  console.log('\n　教練自己那頁（2026-10-25 使用者：「教練那頁要改」）');
  ok('★ 停課的判斷用手上的 bookings，不另外查',
     /const _closedWhyToday=\(\(\)=>\{ const b=\(bookings\|\|\[\]\)\.find\(x=>x && x\.date===today && bkClosedDay\(x\)\);/.test(src));
  ok('★★ 看 today 不是 viewDate（週曆翻到別天不影響這張卡）',
     /看 today 不是 viewDate：這張卡講的是今天的打卡/.test(src));
  ok('★★★ 停班日不再叫人打卡（原本寫「排班 6h・點圓圈打卡」）',
     /if\(_closedWhyToday && !punched\)\{[\s\S]{0,260}全館停班・\$\{escH\(_closedWhyToday\)\}/.test(src));
  ok('★★ 已經打卡的人不走這條（颱風天進來顧店就是真的值班）',
     /if\(_closedWhyToday && !punched\)/.test(src)
     && /已經打卡的人不走這條/.test(src));
  ok('★★ 免打卡的也擋掉（那一支會拿班表冒充打卡、畫出上滿班的圈）',
     /停課日照推會畫出一個「上滿班」的圈/.test(src));
  ok('★★★ 小管家不再說「記得先打卡上班」',
     /const _punchHint = _closedWhyToday\s*\n?\s*\? `<span style="color:#8E1A14;">今天全館停班/.test(src));
  ok('★★ 但堂數照講 —— 停課日來上課的那幾堂，課堂薪資照算',
     /那幾堂的課堂薪資照算，所以堂數不能藏起來/.test(src));

  console.log('\n⑥ 員工講「停班」、會員講「停課」（使用者：「停課是學生在用的」）');
  ok('★★★ 有一支專門換講法的（而且只動畫面字）',
     /function cdayStaffWhy\(b\)\{\s*\n\s*return String\(bkClosedWhy\(b\)\|\|''\)\.replace\(\/停課\$\/,''\) \|\| '停班';/.test(src));
  ok('★★★ 員工端三個畫面都改了（班表／首頁值班／教練首頁）',
     (src.match(/全館停班/g)||[]).length>=5 && (src.match(/cdayStaffWhy\(/g)||[]).length>=4);
  ok('★★★ 會員那一邊一個字都沒動 —— cancel_reason 的前綴仍是「臨時停課」',
     /return `臨時停課・\$\{why\}（\$\{ds\}）`;/.test(src)
     && /\{key:'typhoon',\s*label:'颱風停課'/.test(src));
  ok('　　理由寫在原地（為什麼要去掉尾巴那兩個字）',
     /直接拿來接在「停班」後面會變成/.test(src));

  console.log('\n　樣式');
  ok('★★ 斜線底要 !important —— .sh-cell.has 用 background 簡寫，會把它洗掉',
     /\.sh-table \.sh-cell\.sh-closed\{[\s\S]{0,180}!important;\}/.test(css));
  ok('　　那個坑寫在原地', /會把這裡的 background-image 整個洗掉/.test(css));
  ok('★ 停課用斜線不用淡化（淡化已經是「過去的班」的語彙）',
     /淡化已經是「過去的班」的語彙/.test(css));
  ok('★ 紅色只給表頭那一枚字（品牌色階：重要警示用紅）',
     /\.sh-closed-tag\{[\s\S]{0,200}background:#8E1A14/.test(css));
  ok('★ 值班圈的停課不用紅色虛線', /\.dr-closed \.dr-cup-rim\{stroke:rgba\(29,24,19,\.22\)/.test(css));

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  if(fail) process.exit(1);
})();
