/* 教練首頁 V2（2026-08-21）
   使用者：「這是手機端的用管理員預覽教練頁面 我們來修改這個頁面的版面
   但先不要影響到教練們在使用的頁面可以嗎?」→ 選 A（加旗標）。
   規格：「要參考這個首頁 只是上方的今日營收要改成今日值班[早班][中班][晚班]
   點選這邊顯示照相機掃描QRcode簽到 教練篩選列移除 因為只要顯示該教練自己的課卡就好」
   追加：「教練端下面本月成績 只要顯示教練課 團體課 已銷課堂/總課堂
   不用顯示任何銷課金額跟總營收」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

/* 負向比對要限定在 coachHomeV2 的函式本體內 —— 對整份原始碼比對會掃到別的頁面 */
const V2=(()=>{ const i=src.indexOf('async function coachHomeV2(){');
  const j=src.indexOf('\nPAGES.coach_notifications', i);
  return src.slice(i, j>i?j:src.length); })();
/* 註解裡會引用使用者的原話（「今日營收」「銷課金額」…），負向比對要先把註解拿掉，
   否則驗的是「有沒有提到」而不是「有沒有做」。 */
const V2CODE=V2.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('旗標：只有「管理員預覽教練視角」看得到');
ok('★ 分岔在 PAGES.coach_today 的第一行，教練本人走原本整段',
   /if\(typeof isRealAdmin==='function' && isRealAdmin\(\) && SESSION && SESSION\.role==='coach'\)\{\s*\n\s*return coachHomeV2\(\);\s*\n\s*\}/.test(src));
ok('★ 判斷用「真實身分」而不是目前角色（預覽只換 SESSION.role，不動 _realRole）',
   /function isRealAdmin\(\)\{ return SESSION && SESSION\._realRole==='admin'; \}/.test(src)
   /* 預覽切換確實只改 role */
   && /function switchPreviewRole\(role\)\{\s*\n\s*if\(!isRealAdmin\(\)\) return;[\s\S]{0,40}?SESSION\.role=role;/.test(src));
ok('★ 標明這是暫時分岔，定案後要收掉（兩份版面長期並存會漏改一邊）',
   /這是\*\*暫時\*\*的分岔。定案後要把舊版整段刪掉、旗標一起拿掉/.test(src));

console.log('\n版面：直接沿用管理員手機首頁的 .admh（使用者：「上方大日期＋kpi 再來是日期列 再來是今日課卡列表」）');
ok('★ 大日期＋KPI 一列（.admh-bigrow）',
   /<div class="admh chv2">[\s\S]{0,400}?<div class="admh-bigrow">/.test(src)
   && /<div class="admh-bigdate"><span class="admh-dnum">\$\{_dv\.getDate\(\)\}<\/span>/.test(src));
ok('★ 再來是日期列（.admh-sticky > .admh-week），最後是課卡列表（.admh-cards）',
   /<div class="admh-sticky">\s*\n\s*<div class="admh-week">[\s\S]{0,300}?<\/div>\s*\n\s*<div class="admh-cards">/.test(src));
ok('★ 課卡沿用 .admh-card（不是自己另做一種卡）',
   /<div class="admh-card\$\{done\?' admh-done':''\}" style="--admh-c:\$\{_col\};" onclick="admhCardTap\(event,'\$\{b\.id\}'\)">/.test(src));
ok('★ 教練篩選列拿掉（只有自己的課）',
   /教練篩選列拿掉（使用者：只要顯示該教練自己的課卡就好），只留日期列/.test(src)
   && !/admh-chip/.test(V2CODE));
ok('★ 週一起算，而且用共用的 heroWeekMonday（與管理員手機首頁同一支）',
   /const _mon=heroWeekMonday\(date\);/.test(src)
   && /function heroWeekMonday\(ds\)\{          \/\/ 取該日期所屬週的週一（週一為一週之始）/.test(src));
ok('　　⚠ 不要再多一個 _coachWeekOffset（那是舊版教練首頁的狀態，兩份會打架）',
   /onclick="coachWeekShift\(-1\)"/.test(src) && /onclick="coachWeekShift\(1\)"/.test(src)
   && !/coachWeekOffset/.test(V2CODE));
ok('　　選日與回今天沿用教練端既有的函式',
   /onclick="ctPickDay\('\$\{ds\}'\)"/.test(src) && /onclick="ctBackToday\(\)"/.test(src));
{
  /* 週一起算的算法（與 heroWeekMonday 同一條式子） */
  const mondayOf=d=>{ const x=new Date(d); const dow=x.getDay(); x.setDate(x.getDate()-(dow===0?6:dow-1)); return x; };
  const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
  eq('★ 8/21（五）→ 該週從 8/17（一）開始', fmt(mondayOf(new Date(2026,7,21))), '8/17');
  eq('★ 8/23（日）仍屬同一週，不會跳到下一週', fmt(mondayOf(new Date(2026,7,23))), '8/17');
  eq('　　8/17（一）本身就是週一', fmt(mondayOf(new Date(2026,7,17))), '8/17');
  eq('　　跨月：8/31（一）自己就是週一', fmt(mondayOf(new Date(2026,7,31))), '8/31');
}
ok('　　日期列上的堂數只算自己的',
   /if\(bkCoachId\(b\)!==SESSION\.id\) return; _cnt\[b\.date\]=\(_cnt\[b\.date\]\|\|0\)\+1;/.test(src));
ok('　　貼頂偵測與管理員首頁同一套（sentinel）',
   /<div id="admh-sentinel"><\/div>/.test(src)
   && /st\.classList\.toggle\('stuck', !es\[0\]\.isIntersecting\);/.test(src));

console.log('\nKPI：今日營收整組換成今日值班');
ok('★ 教練課／團體課兩格維持，第三四格換成今日值班',
   /<div class="admh-kpi"><span>教練課<\/span><b>\$\{_ptN\} 堂<\/b><\/div>/.test(src)
   && /<span>今日值班<\/span>/.test(src)
   && !/今日營收/.test(V2CODE));
/* 二修：三顆籤改成只畫今天那一班（驗在下方「二修」那一段），這裡只留班別定義 */
ok('★ 班別定義（早班／中班／晚班，各自顏色）',
   /const BANDS=\[\{k:'am',label:'早班',col:'#D9A441'\}/.test(src)
   && /\{k:'mid',label:'中班',col:'#1F6F54'\}/.test(src)
   && /\{k:'pm',label:'晚班',col:'#3A5BA0'\}/.test(src)
   && /\.chv2-band\.on\{background:var\(--bc\);border-color:var\(--bc\);color:#fff;\}/.test(src));
ok('★ 點這一格 → 既有的掃碼打卡視窗（沒有另外寫一套相機）',
   /class="admh-kpi admh-rev admh-rev-lb chv2-dutytap"[\s\S]{0,120}?onclick="openStaffScanModal\(\)"/.test(src)
   && /function openStaffScanModal\(\)\{/.test(src));
ok('　　鍵盤也能開（role=button 要能按 Enter／空白）',
   /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);openStaffScanModal\(\);\}"/.test(src));
ok('★ 班別界線沿用 0806 定案（12 點前早、12–15 中、15 點後晚）',
   /const bandOf=t=>\{ const m=timeToMin\(t\|\|'0:0'\); return m<12\*60\?'am':\(m<15\*60\?'mid':'pm'\); \};/.test(src)
   && /if\(m < 12\*60\) return '#D9A441';   \/\/ 早班：琥珀金/.test(src));
ok('　　沒排班就看實際打卡時間歸班（漏排班不該讓整條變灰）',
   /if\(!Object\.keys\(hit\)\.length && att&&att\.clock_in\) hit\[bandOf\(att\.clock_in\)\]/.test(src));
ok('　　上班中／已下班各有對應文字（請假改由班別籤本身顯示）',
   /const dutyTxt = onLeave \? ''/.test(src)
   && /`\$\{att\.clock_in\} 上班中`/.test(src)
   && /`\$\{att\.clock_in\}–\$\{att\.clock_out\}`/.test(src));

console.log('\n課卡與本月成績');
ok('★ 只取自己的（代課算在代課教練身上）',
   /\.filter\(b=>b&&bkCoachId\(b\)===SESSION\.id&&b\.date===date\s*\n?\s*&& b\.status!=='cancelled' && !b\.sibling_of\)/.test(src));
ok('　　右下角不標教練名（這頁的課全是自己的），但教練請假仍要標',
   /右下角不標教練名 —— 這一頁的課全是自己的/.test(src)
   && /admh-lvtag">教練請假/.test(src));
ok('　　無限次卡不寫「票券 3/9999」，只標第幾堂',
   /\(Number\(tk\.sessions_total\)\|\|0\)>=999\?`第 \$\{_nth\} 堂`:`票券 \$\{_nth\}\/\$\{tk\.sessions_total\}`/.test(src));
ok('★ 本月成績只有教練課與團體課、已銷課堂／總課堂（二修改成進度環，見下方）',
   /return \{done:a\.filter\(x=>x\.status==='checked_in'\|\|x\.status==='completed'\)\.length, all:a\.length\};/.test(src)
   && /<div class="mstat-sub">\$\{o\.done\} \/ \$\{o\.all\}<\/div>/.test(src));
ok('★ 整頁沒有任何金額（使用者：不用顯示任何銷課金額跟總營收）',
   !/monthSalesValue|銷課金額|總營收|admh-rev-amt|toLocaleString/.test(V2CODE));
ok('　　友善教練課併進「教練課」',
   /const c=evColorClass\(b,typeMap\); return c==='ev-pt'\|\|c==='ev-friendly';/.test(src));
ok('　　為什麼教練端不出現金額，寫在原地',
   /教練端不出現金額，避免把「這堂值多少錢」帶進上課現場/.test(src));

console.log('\n班別歸屬的算術（與 dutyShiftColor 同一組界線）');
{
  const timeToMin=t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);};
  const bandOf=t=>{ const m=timeToMin(t||'0:0'); return m<12*60?'am':(m<15*60?'mid':'pm'); };
  eq('★ 09:00 → 早班', bandOf('09:00'), 'am');
  eq('★ 12:00 整 → 中班', bandOf('12:00'), 'mid');
  eq('　　12:30 仍是中班', bandOf('12:30'), 'mid');
  eq('★ 15:00 整 → 晚班', bandOf('15:00'), 'pm');
  eq('　　小曾 15:02、BARRY 15:52 都是晚班（0806 回報的案例）',
     [bandOf('15:02'), bandOf('15:52')], ['pm','pm']);
  eq('　　14:59 還是中班', bandOf('14:59'), 'mid');
}

console.log('\n二修（2026-08-21）：外框、值班籤、分隔線、進度環、下拉更新');
ok('★ 外框樣式掛在 body.chv2-shell，由 navTo 每次換頁重算（離開自然拿掉）',
   /document\.body\.classList\.toggle\('chv2-shell',\s*\n\s*key==='coach_today' && typeof isRealAdmin==='function' && isRealAdmin\(\)\s*\n\s*&& SESSION && SESSION\.role==='coach'\)/.test(src));
ok('　　⚠ 這三樣都在頁面之外，直接改 CSS 會連教練本人一起改到 —— 理由寫在原地',
   /這三樣都在頁面之外的外框上，改 CSS 會連教練本人一起改到/.test(src));
ok('★ ① 頂列米色', /body\.chv2-shell \.topbar\{background:var\(--card2,#F4F0E8\);\}/.test(src));
ok('★ ② 小管家收進帳號資訊（帳號選單本來就有一顆 .tb-acct-butler）',
   /body\.chv2-shell \.tb-butler,body\.chv2-shell \.tb-greet-inline\{display:none !important;\}/.test(src)
   && /body\.chv2-shell \.tb-acct-butler\{display:flex !important;\}/.test(src)
   && /class="tb-acct-item tb-acct-butler"/.test(src));
ok('★ ④ 底部導覽品牌綠（文字翻淺色，否則綠底深字看不見）',
   /body\.chv2-shell \.bottom-nav\{background:var\(--green\) !important;/.test(src)
   && /body\.chv2-shell \.bottom-nav \.bn-item\{color:rgba\(255,255,255,\.72\);\}/.test(src));

ok('★ ③ 今日值班只畫「今天這一班」，沒排班畫「未排班」',
   /const _bandKey=Object\.keys\(hit\)\[0\]\|\|null;/.test(src)
   && /: `<span class="chv2-band chv2-band-off">未排班<\/span>`/.test(src)
   && /\? `<span class="chv2-band chv2-band-off">請假<\/span>`/.test(src));
ok('　　三顆一起排的舊做法退場（天天有兩顆是灰的雜訊）',
   /原本三顆籤一起排、只把有排到的上色，\s*\n\s*等於天天有兩顆是灰的雜訊/.test(src)
   && !/const bandChips=/.test(V2CODE));
ok('　　未排班／請假用虛線框，不要看起來像「有班」',
   /\.chv2-band-off\{border-style:dashed;\}/.test(src));
ok('　　點下去仍是掃碼打卡', /class="admh-kpi admh-rev chv2-dutytap" onclick="openStaffScanModal\(\)"/.test(src));

ok('★ 日期列與課卡之間補一條分隔線',
   /<div class="admh-div chv2-div2"><\/div>\s*\n\s*<div class="admh-cards">/.test(src));
ok('★ 本月成績改回進度環（沿用教練端舊版那組 .mstat）',
   /const ringCardOf=\(title,o,color\)=>\{/.test(src)
   && /<div class="mstat-row mstat-row-2">\$\{ringCardOf\('教練課',_mPt,'#1f6f54'\)\}\$\{ringCardOf\('團體課',_mGp,'#9a5a1e'\)\}<\/div>/.test(src)
   && !/chv2-score-row/.test(V2CODE));
ok('　　環仍然只有堂數（沒有跟著把金額帶回來）',
   /<div class="mstat-center"><div class="mstat-num">\$\{o\.done\}<\/div><div class="mstat-unit">堂<\/div><\/div>/.test(src));
ok('★ 下拉更新沿用 admPtrInit（它的做法就是「頂欄不動」）',
   /try\{ if\(typeof admPtrInit==='function'\) admPtrInit\(\); \}catch\(_\)\{\}/.test(src)
   && /不要靠瀏覽器原生的整頁回彈（那一定會把頂欄一起拉走）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
