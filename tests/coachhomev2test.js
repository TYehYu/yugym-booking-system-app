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
ok('★ 分岔在 PAGES.coach_today 的第一行；2026-08-21 上線後看的是「手機版面」',
   /if\(typeof isMobileLayout==='function' && isMobileLayout\(\)\)\{\s*\n\s*return coachHomeV2\(\);\s*\n\s*\}/.test(src));
ok('★ 判斷用「真實身分」而不是目前角色（預覽只換 SESSION.role，不動 _realRole）',
   /function isRealAdmin\(\)\{ return SESSION && SESSION\._realRole==='admin'; \}/.test(src)
   /* 預覽切換確實只改 role */
   && /function switchPreviewRole\(role\)\{\s*\n\s*if\(!isRealAdmin\(\)\) return;[\s\S]{0,40}?SESSION\.role=role;/.test(src));
ok('★ 上線的理由與桌機仍走舊版的原因寫在原地',
   /使用者：「教練手機版新版可以上線了」/.test(src)
   && /桌機仍走下面整段舊版/.test(src));

console.log('\n版面：直接沿用管理員手機首頁的 .admh（使用者：「上方大日期＋kpi 再來是日期列 再來是今日課卡列表」）');
ok('★ 大日期＋KPI 一列（.admh-bigrow）',
   /<div class="admh chv2">[\s\S]{0,400}?<div class="admh-bigrow">/.test(src)
   && /<div class="admh-bigdate"><span class="admh-dnum">\$\{_dv\.getDate\(\)\}<\/span>/.test(src));
ok('★ 再來是日期列（.admh-sticky > .admh-week），最後是課卡列表（.admh-cards）',
   /<div class="admh-sticky">\s*\n\s*<div class="admh-week">[\s\S]{0,300}?<\/div>\s*\n\s*<div class="admh-cards">/.test(src));
/* 0822：與管理員手機首頁同步，改用雙欄版型的 .admh2-card（同一組 class，不是另做一種） */
ok('★ 課卡沿用管理員那套（.admh2-card，不是自己另做一種卡）',
   /<div class="admh2-card\$\{done\?' admh-done':''\}" style="--admh-c:\$\{_col\};" onclick="admhCardTap\(event,'\$\{b\.id\}'\)">/.test(src));
ok('★ 教練篩選列拿掉（只有自己的課）',
   /教練篩選列拿掉（使用者：只要顯示該教練自己的課卡就好）/.test(src)
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
ok('★ 點這一格 → chv2DutyTap（0821 二修：依打卡狀態分流，見 dutytaptest）',
   /class="admh-kpi admh-rev admh-rev-lb chv2-dutytap"[\s\S]{0,120}?onclick="chv2DutyTap\(\)"/.test(src)
   && /function openStaffScanModal\(\)\{/.test(src));
ok('　　鍵盤也能開（role=button 要能按 Enter／空白）',
   /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);chv2DutyTap\(\);\}"/.test(src));
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
ok('　　0822 起右下角只標「代課」那種（不是自己帶的），教練請假仍要標',
   /右下角原本一律不標教練名/.test(src)
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
   /document\.body\.classList\.toggle\('chv2-shell', _chv\);/.test(src)
   && /&& SESSION && SESSION\.role==='coach'\s*\n\s*&& typeof isMobileLayout==='function' && isMobileLayout\(\);/.test(src));
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
ok('　　點下去走 chv2DutyTap（還沒上班才是掃碼）', /class="admh-kpi admh-rev chv2-dutytap" onclick="chv2DutyTap\(\)"/.test(src));

/* 0822 雙欄之後不需要那條分隔線：日期列在左邊、課卡在右邊，本來就分得開 */
ok('★ 日期列與課卡改成左右並排（原本的分隔線退場）',
   /<div class="admh2-body">\s*\n\s*<div class="admh2-rail">/.test(src)
   && !/<div class="admh-div chv2-div2"><\/div>/.test(src));
ok('★ 本月成績改回進度環（沿用教練端舊版那組 .mstat）',
   /const ringCardOf=\(title,o,color\)=>\{/.test(src)
   && /<div class="mstat-row mstat-row-2">\$\{ringCardOf\('教練課',_mPt,'#1f6f54'\)\}\$\{ringCardOf\('團體課',_mGp,'#9a5a1e'\)\}<\/div>/.test(src)
   && !/chv2-score-row/.test(V2CODE));
ok('　　環仍然只有堂數（沒有跟著把金額帶回來）',
   /<div class="mstat-center"><div class="mstat-num">\$\{o\.done\}<\/div><div class="mstat-unit">堂<\/div><\/div>/.test(src));
ok('★ 下拉更新沿用 admPtrInit（它的做法就是「頂欄不動」）',
   /try\{ if\(typeof admPtrInit==='function'\) admPtrInit\(\); \}catch\(_\)\{\}/.test(src)
   && /不要靠瀏覽器原生的整頁回彈（那一定會把頂欄一起拉走）/.test(src));

console.log('\n三修（2026-08-21）：頂欄字色、KPI 溢出、尚未打卡、間距、重整鈕');
ok('★ ⚠ 頂欄底色與字色要成對改（手機原本是綠底米白字 → 只換底色就整排字不見）',
   /body\.chv2-shell \.topbar \.tb-mark span\{color:var\(--green\) !important;\}/.test(src)
   && /body\.chv2-shell \.topbar \.tb-ver\{color:var\(--t3\) !important;\}/.test(src)
   && /只換背景的話字還是米白的，變成米底米字＝整排字不見/.test(src));
ok('★ KPI 欄要能縮（flex 的 min-width:auto 會讓它撐出畫面）',
   /body\.chv2-shell \.admh-bigrow\{min-width:0;\}/.test(src)
   && /body\.chv2-shell \.admh-kpi\{min-width:0;max-width:100%;/.test(src)
   && /\.admh-bigrow 是 flex row，KPI 欄預設 min-width:auto/.test(src));
ok('★ 「尚未打卡」不顯示（還沒打卡是常態，天天掛一行等於噪音）',
   /: \(att&&att\.clock_in\) \? `\$\{att\.clock_in\} 上班中` : '';/.test(src)
   && !/尚未打卡/.test(V2CODE));
/* 四問之後才發現：全站有三份「本月成績」，我一直只改預覽版那一份。
   現在三份都掛 .mstat-card，間距與分隔線寫一次。 */
ok('★ 本月成績與課卡之間留距離（三份共用一條間距）',
   /\.mstat-card\{margin-top:34px;position:relative;\}/.test(src)
   && /全站有三份「本月成績」（管理員首頁、教練舊版首頁、教練預覽版）/.test(src));
ok('★ 分隔線退場：使用者回報「最後一張課卡多了一條線」（線貼在課卡列下緣像課卡長出來的）',
   !/\.mstat-card::before\{/.test(src)
   && /最後一張課卡多了一條線/.test(src));
ok('★ 三份都掛上標記（管理員首頁兩種版面＋教練舊版＋預覽版）',
   (src.match(/class="card mc-card mstat-card"/g)||[]).length===2
   && /const ringCard=`<div class="dcard mstat-card">/.test(src)
   && /const scoreCard=`<div class="chv2-scorewrap mstat-card"><div class="dcard chv2-score">/.test(src));
/* 0822 使用者：「下方的本月成績 外面再幫我加一層米色視窗」 */
ok('★ 本月成績外面多一層米色視窗（間距仍由外層的 .mstat-card 提供）',
   /\.chv2-scorewrap\{background:var\(--card2,#FAF7F0\);border:1px solid var\(--bd\);\s*\n\s*border-radius:20px;padding:10px;\}/.test(src)
   && /\.chv2-scorewrap \.dcard\{border:none;box-shadow:none;border-radius:14px;\}/.test(src));
ok('★ 頂欄重整鈕退場（這一頁已經有下拉更新）',
   /body\.chv2-shell \.topbar \.tb-right \.rf-btn\{display:none !important;\}/.test(src));

console.log('\n四修（2026-08-21）：KPI 四列左右分、成績間距、行事曆搬管理員版');
ok('★ KPI 每列自己左右分（教練課／團體課：名稱靠左、堂數靠右）',
   /body\.chv2-shell \.admh-kpis\{min-width:0;flex:1;align-items:stretch;gap:5px;\}/.test(src)
   && /body\.chv2-shell \.admh-kpi\{min-width:0;max-width:100%;width:100%;justify-content:space-between;/.test(src));
ok('★ 第三列「今日值班」整條靠左、第四列（打卡鈕）整條靠右',
   /body\.chv2-shell \.admh-kpi\.admh-rev-lb\{justify-content:flex-start;\}/.test(src)
   && /body\.chv2-shell \.admh-kpi\.chv2-dutytap:not\(\.admh-rev-lb\)\{justify-content:flex-end;\}/.test(src));
ok('★ 本月成績的間距改由 .mstat-card 統一提供',
   /\.mstat-card\{margin-top:34px;position:relative;\}/.test(src));

console.log('\n教練行事曆 V2（使用者：搬管理員手機端的行事曆，別人的課只能看）');
ok('★ 同一道旗標：手機版面走 V2（2026-08-21 起含教練本人），桌機維持舊 agenda',
   /if\(typeof isMobileLayout==='function' && isMobileLayout\(\)\)\{\s*\n\s*try\{ return await coachCalV2\(\); \}/.test(src));
ok('　　出錯就退回教練原本的行事曆，不讓頁面卡住',
   /catch\(e\)\{ console\.error\('coachCalV2 失敗，退回教練原本的行事曆', e\);/.test(src));
ok('★ 直接走管理員手機行事曆那條路（表頭＋一日 agenda／多日欄狀）',
   /const _hdr=await admCalHeaderHTML\(\);/.test(src)
   && /await admCalMultiHTML\(_nD\)/.test(src)
   && /await renderCoachAgenda\(\);/.test(src));
ok('★ 圖層全開、範圍全店（教練要看得到別人的佔用，不然排課會撞到）',
   /window\._coachScope='all';              \/\/ 看得到全店（別人的課只能看）/.test(src));
/* 2026-08-21 後續定案：這條不再只在預覽版生效，改成「所有非店長教練」通用
   （見 tests/staffpermtest.js）。 */
ok('★ 別人的課純檢視：開卡前依「這堂是不是我帶的」現算 _coachReadonly',
   /if\(SESSION && SESSION\.role==='coach' && !SESSION\.is_manager\)\{\s*\n\s*try\{ window\._coachReadonly = !bkIsCoach\(b, SESSION\.id\); \}/.test(src));
ok('　　兩個課卡入口都要設（admh 卡走 expandBkCard、agenda 走 openCourseCard）',
   (src.match(/window\._coachReadonly = !bkIsCoach\(b, SESSION\.id\)/g)||[]).length===2);
ok('　　代課的課算自己的（bkIsCoach 含代課）', /return bkIsCoach\(b,myId\); \/\/ 月曆\/週量只看我的課/.test(src));
ok('★ 離開行事曆就把旗標關掉，別頁的課卡不會被鎖成唯讀',
   /if\(!\(_chv && key==='coach_calendar'\)\)\{ window\._chvCal=false; window\._coachReadonly=false; \}/.test(src));
ok('　　外框樣式也套用在行事曆頁',
   /const _chv=\(key==='coach_today'\|\|key==='coach_calendar'\)/.test(src));

console.log('\n行事曆 V2 補完（2026-08-21 使用者：日期列／一日一週／浮動鈕）');
ok('★ agenda 的表頭條件原本只認 admin —— 預覽版也要吃',
   /const monthRow=\(\(\(SESSION&&SESSION\.role==='admin'\)\|\|window\._chvCal\)&&!window\._admCalHdrOff\)\?/.test(src)
   && /使用者回報\s*\n\s*「上方日期列跟一日一週篩選列都沒進來」，就是這個條件只認 admin/.test(src));
ok('★ 表頭的動作要回到目前這一頁（寫死 calendar 會把人踢到管理員的預約管理頁）',
   /function admCalPage\(\)\{ return window\._chvCal \? 'coach_calendar' : 'calendar'; \}/.test(src)
   && (src.match(/navTo\(admCalPage\(\)\)/g)||[]).length>=3);
ok('★ 右下角浮動打卡鈕退場（值班那格就能掃碼，浮動鈕還會蓋住課卡）',
   /body\.chv2-shell #punch-fab\{display:none !important;\}/.test(src));


/* ═══ 2026-08-22：把管理員手機首頁今天做的內容同步過來（使用者指示）═══════════════
   「幫我把今天做的管理員手機首頁內容 也更新到教練版手機首頁」 */
console.log('\n雙欄版面同步到教練首頁');
ok('★ 日期列從上方橫排改成左側直欄（與管理員同一組 class）',
   /_a2Rail\+=`<button class="a2-day\$\{ds===date&&ds!==today\?' on':''\}\$\{ds===today\?' a2-today':''\}" onclick="ctPickDay\('\$\{ds\}'\)">/.test(src)
   && /<div class="admh2-body">\s*\n\s*<div class="admh2-rail">/.test(src));
ok('★ 上下箭頭換週走教練自己的 coachWeekShift',
   /<span class="a2-arw a2-arw-up" onclick="coachWeekShift\(-1\)"><\/span>/.test(src)
   && /<span class="a2-arw a2-arw-dn" onclick="coachWeekShift\(1\)"><\/span>/.test(src));
ok('★★ 掛載沿用 admh2Mount，換週函式用參數帶進去（兩頁唯一的差別）',
   /function admh2Mount\(shiftFn\)\{/.test(src)
   && /admh2Mount\(coachWeekShift\)/.test(src)
   && /try\{ _shift\(d\); \}catch\(_\)\{\}/.test(src));
ok('　　⚠ resize／轉向重掛要帶回同一支，否則教練頁轉向後換週會跳到別的週',
   /window\._admh2Shift=_shift;/.test(src)
   && /admh2Mount\(window\._admh2Shift\)/.test(src));
ok('★ 課卡換成雙欄版型（出席章左上、中間三列、右上時間、右下教練）',
   /return `<div class="admh2-card\$\{done\?' admh-done':''\}" style="--admh-c:\$\{_col\};"/.test(src));
ok('★★ 教練名只在「不是自己帶的」才標 —— 也就是代課，這一頁唯一會出現別人的情況',
   /const _cnm=\(_cid && String\(_cid\)!==String\(SESSION\.id\) && _cm2\[_cid\]\)\?_cm2\[_cid\]:'';/.test(src)
   && /改成「只有不是自己帶的才標」/.test(src));
ok('　　貼頂偵測退場（日期列已經不是 sticky，它就在左邊不動）',
   !/const st=document\.querySelector\('\.admh-sticky'\), sen=document\.getElementById\('admh-sentinel'\);[\s\S]{0,400}?coachWeekShift/.test(src));

/* 2026-08-22 使用者指示：「在右邊課卡下方新增一個快速預約＋，點了以後跳出視窗顯示
   今天還可以安排的時段」 */
console.log('\n快速預約');
ok('★ 按鈕放在課卡列的最後一張（跟著一起捲；0822 二修改成圓形品牌綠）',
   /<div class="admh2-cards">\$\{_cards\}[\s\S]{0,320}?<button class="a2-quickadd" title="快速預約" onclick="chvQuickSlots\('\$\{date\}'\)">＋<\/button>/.test(src)
   && /\.a2-quickadd\{flex:0 0 auto;align-self:center;width:52px;height:52px;border-radius:50%;/.test(src));
ok('★ 只列「還能安排」的時段：打烊前、已過去的不列、自己有課的不列',
   /const last=\(typeof quickBookLastMin==='function'\)\?quickBookLastMin\(date\):\(21\*60\);/.test(src)
   && /if\(nowMin>=0 && mm<nowMin\) continue;/.test(src)
   && /if\(busy\.some\(iv=>mm<iv\[1\] && \(mm\+60\)>iv\[0\]\)\) continue;/.test(src));
ok('　　取消的課不算佔用（status!=cancelled 才進 busy）',
   /b\.date===date && b\.status!=='cancelled'/.test(src)
   && /String\(bkCoachId\(b\)\)===String\(who\)/.test(src));
/* 0822 四修（使用者：「18:00 應該只能約團體教室才對」）：場地改成也要算，
   原本那條「不擋場地」的取捨被推翻 —— 排不進場地的時段本來就不該出現在「還能安排」裡。 */
ok('★★ 場地也要算（見下方 allocateVenue 那幾條）', /const dayAll=\(bks\|\|\[\]\)\.filter/.test(src));
ok('★ 點一格直接進既有的建立預約流程（日期時間帶進去）',
   /function chvQuickPick\(t\)\{[\s\S]{0,200}?closeModal\(\); dtlAddAt\(d,t\);/.test(src)
   && /onclick="chvQuickPick\('\$\{minToTime\(o\.mm\)\}'\)"/.test(src));
/* 0822 三修（使用者）：「幫我統一改成管理員的風格 左右兩張平均的卡片 背景暗化」 */
/* 0822 二修（使用者）：「快速預約就不要顯示不可預約的時段了」——
   版型維持兩欄等寬，但內容只留可約的；不走 slotPanelHTML（那支的職責是「整天的時段狀態」）。 */
ok('★★ 兩欄等寬、只列可預約的時段',
   /<div class="cag-slots chvqs2">\$\{cells\}<\/div>/.test(src)
   && /\.modal \.cag-slots\.chvqs2\{display:grid;grid-template-columns:1fr 1fr;gap:8px;\}/.test(src)
   && !/const panel=slotPanelHTML\(\{/.test(src));
ok('　　理由寫在原地（這一頁只是「挑一個空檔」，不可約的放著只是雜訊）',
   /這一頁的用途只是「挑一個空檔」，不可約的放著只是雜訊/.test(src));
ok('★★ ⚠ .cag-slot 原本畫在深色圖層上（白字、半透明白底），搬進白色視窗要整組重新上色',
   /\.modal \.cag-slots \.cag-slot\{background:#fff;border:1px solid var\(--bd\);color:var\(--green\);/.test(src)
   && /直接搬進白色視窗會看不見/.test(src));
ok('★ 快速預約鈕改成圓形品牌綠（使用者二修）',
   /\.a2-quickadd\{flex:0 0 auto;align-self:center;width:52px;height:52px;border-radius:50%;[\s\S]{0,80}?background:var\(--green\);color:#fff;/.test(src));
ok('★ 管理員手機首頁也有同一顆（帶目前篩選的教練；All 時不判教練衝堂）',
   /<button class="a2-quickadd" title="快速預約" onclick="chvQuickSlots\('\$\{date\}','\$\{_cSel\|\|''\}'\)">＋<\/button>/.test(src)
   && /const who=\(coachId===undefined\)\?String\(SESSION\.id\|\|''\):String\(coachId\|\|''\);/.test(src)
   && /先在這裡假設一位反而會擋掉可用時段/.test(src));
ok('　　一格都沒有時講清楚，不要給一個空格子',
   /這一天已經沒有可安排的時段了。/.test(src));

/* 2026-08-22 使用者回報：「這個快速預約有問題，18:00 應該只能約團體教室才對；
   然後教練跟管理員的首頁快速預約，只能建立教練課，不能建立自主訓練跟團體課」 */
console.log('\n快速預約：場地與課別');
ok('★★ 場地也要算 —— 用行事曆同一支 allocateVenue 以「私人教練 60 分」試排，排不進去就不列',
   /let a=null; try\{ a=allocateVenue\('私人教練', dayAll, mm, mm\+60, null\); \}catch\(_\)\{ return \{ok:true,tag:''\}; \}/.test(src)
   && /if\(!a \|\| a\.error\) return \{ok:false,tag:''\};/.test(src));
ok('★ 只剩團課教室／跑步機時照列，但標出來（那是「還有位子，但只剩這個」）',
   /return \{ok:true, tag: vid==='group'\?'教室' : \(vid==='treadmill'\?'跑步機':''\)\};/.test(src)
   && /標「教室／跑步機」的代表那個時段只剩該場地/.test(src));
ok('★★ ⚠ 場地是全店共用的 → 判斷要用當天全部未取消的預約，不是只有這位教練的',
   /const dayAll=\(bks\|\|\[\]\)\.filter\(b=>b && b\.date===date && b\.status!=='cancelled'\);/.test(src)
   && /判斷用\*\*當天全部\*\*未取消的預約/.test(src));
ok('★ 快速預約只建教練課（自主訓練是會員自約、團課從後台開）',
   /window\._bkCoachCourseOnly=true;/.test(src)
   && /if\(window\._bkCoachCourseOnly && t\.category!=='私人教練'\) return false;/.test(src));
ok('　　一次性旗標：開窗過濾完就清掉，不影響下一次一般的新增預約',
   /window\._bkCoachCourseOnly=false;   \/\* 一次性旗標/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
