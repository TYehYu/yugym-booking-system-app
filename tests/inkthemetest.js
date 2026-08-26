/* Ink · 編輯排版風視覺層（2026-08-26 使用者指示，附視覺示意圖）
   「延續魚家財務室的設計語言，但排課系統仍要維持足夠清楚、俐落及高效率」
   「只示範更改管理員的頁面」

   這一支測試的重點**不是**新樣式好不好看，而是使用者第 11 條的硬要求：
   「必須完整保留排課表的資料語意與尺寸規則　這次是視覺樣式重整，不是重新設計排課邏輯」
   —— 所以主要在守「一行版面計算都沒被動到」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
/* 起點要往前含到開頭那個註解符號，否則下面的去註解正則配不到整塊，
   標題註解就會被當成規則（第一版誤判成「.cal-now 被動到」）。 */
const _ii=src.indexOf('   Ink · 編輯排版風視覺層');
const INK=src.slice(src.lastIndexOf('/*', _ii), src.indexOf('</style>'));
/* 只看真正的規則：註解裡本來就會提到 .cal-now、課程色這些名字（那是在說明「刻意不動」），
   拿註解去比會全部誤判。 */
const RULES=INK.replace(/\/\*[\s\S]*?\*\//g,'');

console.log('① 尺寸與位置：一行計算都不能動（使用者第 11 條）');
{
  /* 卡片的 top/height/left/width 全部來自 renderCalendar 算好的 inline style，
     所以只要 Ink 層沒有任何一條規則碰這幾個屬性，尺寸語意就不可能被改到。 */
  const banned=/(^|[;{\s])(position|top|left|right|bottom|width|height|min-height|max-height)\s*:/;
  const bad=[];
  RULES.split('}').forEach(blk=>{
    const i=blk.indexOf('{'); if(i<0) return;
    const sel=blk.slice(0,i), body=blk.slice(i+1);
    if(!/\.cal-ev|\.cal-daycol\b|\.cal-body|\.cal-timecol/.test(sel)) return;
    /* ::before／::after 是卡片「裡面」的裝飾（左邊那條課程色條），不是卡片本身的幾何。
       卡片的 top／height／left／width 全部來自 JS 的 inline style，那才是要守的東西。 */
    if(/::(before|after)/.test(sel)) return;
    if(banned.test(body)) bad.push(sel.trim().replace(/\s+/g,' ').slice(0,60));
  });
  eq('★★ Ink 層沒有任何一條規則碰課卡／欄位本身的定位與尺寸', bad, []);
  ok('　 唯一碰到寬度的是卡片內的左色條（裝飾，不是幾何）',
     /body\.ink \.cal-ev\.cal-ev-std \.evc-body::before\{width:3px;border-radius:0;\}/.test(src));

  ok('★★ 卡片垂直起點仍依實際開始時間（SLOT_PX 換算，沒被動過）',
     /const startMin=timeToMin\(b\.start_time\)-_startMin;/.test(src)
     && /const top=\(startMin\/SLOT_MIN\)\*SLOT_PX;/.test(src));
  ok('★★ 卡片高度仍依實際時長（30／60／90 分不同高）',
     /const fixedH=\(\(Number\(b\.duration\)\|\|60\)\/SLOT_MIN\)\*SLOT_PX; \/\/ 依實際時長/.test(src));
  ok('★★ 並排寬度仍依重疊張數（1 張整欄、2 張各半…）',
     /const UNIT = Math\.max\(1, dl\.unit\|\|1\);/.test(src)
     && /const laneWpct=100\/UNIT;/.test(src)
     && /const leftPct=dl\.laneIdx\*laneWpct;/.test(src));
  ok('★★ 半小時格高沒被改（7 日／5 日 48px）',
     /SLOT_PX = \(nDays===7\|\|nDays===5\) \? 48 : \(nDays===3 \? 44 : 48\);/.test(src));
  ok('　 inline style 仍然由 JS 輸出（沒有改成 class）',
     /style="\$\{useFixedLane\?dayLaneStyle:`top:\$\{top\}px;height:/.test(src));
}

console.log('\n② 狀態語意全部保留（顏色深淺、反灰、今日、紅線）');
{
  ok('★★ 過去時間反灰的判斷邏輯沒動（日期已過／今天但已結束）',
     /if\(_cardDate < _todayYmd\)\{ _isPastCard = true; \}/.test(src)
     && /if\(_endM <= _nowM\) _isPastCard = true;   \/\/ 已結束的課/.test(src));
  ok('★★ 「已結案才淡化、沒結案維持原色」那條沒動（cal-ev-past ／ cal-ev-todo）',
     /const _pastCls = bkDarkNoTicket\(b\) \? 'cal-ev-dark'\s*\n\s*: !_isPastCard \? '' : \(_settled \? 'cal-ev-past' : 'cal-ev-todo'\);/.test(src));
  ok('★ 過去欄位仍然反灰（只換色階，沒有拿掉）',
     /body\.ink \.cal-daycol\.col-past\{background:#F0EDE7;\}/.test(src)
     && /\.cal-daycol\.col-past\{background:#f3f2ef;\}/.test(src));
  ok('★★ 反灰欄裡「還沒處理」的課卡仍然不被一起淡化（原本那條例外還在）',
     /\.cal-daycol\.col-past \.cal-ev\.cal-ev-todo\{opacity:1;filter:none;\}/.test(src));
  ok('★★ 今日欄位仍然標示得出來（換成暖米底＋深墨字，不是拿掉）',
     /body\.ink \.cal-daycol\.daycol-today\{background:#FBF6EC;\}/.test(src)
     && /body\.ink \.cal-daycol-head\.today\{background:var\(--card2\);\}/.test(src)
     && /body\.ink \.cal-daycol-head\.today \.cd-line\{color:var\(--text\);font-weight:600;\}/.test(src));
  ok('★ 「今天」小標仍然畫得出來', /body\.ink \.cal-daycol-head \.cd-today\{background:var\(--gold\)/.test(src));
  ok('★★ 即時紅線一個字都沒動', /return `<div class="cal-now" style="top:\$\{ntop\}px;"><span class="cal-now-dot"><\/span><\/div>`;/.test(src)
     && !/\.cal-now/.test(RULES));
  ok('★★ 課程色（哪一種課）刻意不動 —— 那是資料語意不是裝飾',
     !/--course-(pt|friendly|group|trial|self)-accent\s*:/.test(RULES)
     && /課程色（--course-\*-accent）刻意不動 —— 那是資料語意（哪一種課），不是裝飾/.test(src));
  ok('★ 待簽約／教練請假／已簽到那幾組 filter 規則沒被覆蓋掉',
     /\.cal-ev\.cal-ev-std\.cal-ev-pend,/.test(src)
     && /\.cal-ev\.cal-ev-std\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-std\.cal-ev-dark\{filter:/.test(src));
}

console.log('\n③ 只示範管理員（使用者：「只示範更改管理員的頁面」）');
{
  const fn=new Function('SESSION','localStorage',
    src.slice(src.indexOf('function inkOn(){'), src.indexOf('function inkApply()'))+'\nreturn inkOn;');
  const LS=v=>({getItem:()=>v, setItem:()=>{}});
  eq('★★ 管理員 → 開', fn({role:'admin'}, LS(null))(), true);
  eq('★★ 櫃檯 → 不開', fn({role:'front_desk'}, LS(null))(), false);
  eq('★★ 教練 → 不開', fn({role:'coach'}, LS(null))(), false);
  eq('★★ 會員 → 不開', fn({role:'member'}, LS(null))(), false);
  eq('　 還沒登入 → 不開', fn(null, LS(null))(), false);
  eq('★★ 逃生門：管理員也能當場退回舊版（yugym_ink=0）', fn({role:'admin'}, LS('0'))(), false);
  eq('★ 也能在非管理員帳號上試看（yugym_ink=1）', fn({role:'coach'}, LS('1'))(), true);
  ok('★★ 三次版面大改被還原的紀錄寫在原地（所以第一天就帶逃生門）',
     /這個專案的版面大改被還原過三次/.test(src)
     && /就能立刻退回舊版，不必等重新部署/.test(src));
  ok('★ 每次換頁都重算一次（navTo 開頭）', /function navTo\(key, gkey\)\{\s*\n\s*inkApply\(\);/.test(src));
  ok('★ 全部掛在 body.ink 底下，關掉就完全回到舊版',
     RULES.split('\n').filter(l=>/^\s*[.#a-z]/i.test(l) && /\{/.test(l) && !/^\s*body\.ink/.test(l)
        && !/^\.cchip-dot/.test(l)).length===0);
}

console.log('\n④ 指示裡點名的視覺要求');
ok('★ 主要操作色改深咖啡（--brand／--green 一起換，舊程式碼自動跟上）',
   /--green:#4A3B2E; --green-l:#5D4B3B; --brand:#4A3B2E;/.test(src));
ok('★ 背景溫暖米白、文字深墨（不是純白純黑）',
   /--bg:#F7F3EB; --card:#FFFDF8; --card2:#F2ECE1;/.test(src)
   && /--text:#221C15;/.test(src));
ok('★ 不用厚重陰影與發光（陰影 token 一律拉平）',
   /--shadow-xs:none; --shadow-sm:none;/.test(src));
ok('★ 頂欄不再是深綠實心，改米白＋細線；目前頁面用底線標示',
   /body\.ink\.mc-mode \.mc-sidebar\{\s*\n\s*background:var\(--bg\);color:var\(--text\);/.test(src)
   && /body\.ink\.mc-mode \.mc-nav-item\.active\{background:transparent;color:var\(--green\);\s*\n\s*border-bottom-color:var\(--green\);/.test(src));
ok('★★ 新增預約維持深咖啡實心（唯一主操作），其餘米白底＋細框',
   /body\.ink \.btn-green\{background:var\(--green\);color:#FFFDF8;box-shadow:none;\}/.test(src)
   && /body\.ink \.btn-ghost\{background:var\(--card\);color:var\(--t2\);border:1px solid var\(--bd\);\}/.test(src));
ok('★★ 教練篩選改「小色點＋名稱」，不是一整排彩色膠囊',
   /<i class="cchip-dot"><\/i>\$\{coachDisp\(c\)\}/.test(src)
   && /body\.ink \.cal-chip\{[^}]*background:transparent !important;color:var\(--t2\) !important;/.test(src));
ok('★★ 色點只在 Ink 層出現，舊版一個字都沒變',
   /\.cchip-dot\{display:none;\}   \/\* 舊版不畫色點/.test(src));
ok('★ 課程類型改細框按鈕，不再整排彩色（也不再灰階淡化）',
   /body\.ink \.cal-chip\.cal-chip-course\{border:1px solid var\(--bd\);font-weight:500;\s*\n\s*opacity:1 !important;filter:none !important;\}/.test(src));
ok('★ 選取狀態用深咖啡實心（教練與課程一致）',
   /body\.ink \.cal-chip\.on\{background:var\(--green\) !important;/.test(src));
ok('★ 標題與日期欄用 Noto Serif TC（head 早就載了，不必多開請求）',
   /family=[^"]*Noto\+Serif\+TC/.test(src)
   && /body\.ink \.cal-daycol-head \.cd-line\{font-family:"Noto Serif TC",serif;/.test(src)
   && /body\.ink \.cal-ev\.cal-ev-std \.evc-name\{color:var\(--text\);font-family:"Noto Serif TC",serif;/.test(src));
ok('★ 數字等寬（tabular-nums），時間才對得齊',
   /font-variant-numeric:tabular-nums;/.test(RULES));
ok('★ 減少圓角與卡片感（課卡 2px、按鈕 3～4px）',
   /body\.ink \.cal-ev\.cal-ev-std\{border-radius:2px;\}/.test(src)
   && /body\.ink \.btn\{border-radius:4px;box-shadow:none;\}/.test(src));
ok('★ 課卡左色條保留（課程辨識），只是變細',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-body::before\{width:3px;border-radius:0;\}/.test(src));

console.log('\n⑤ 互動一個都不能少');
{
  const keep=[['切換週次', /calStepWeek\(-1\)/],['返回今天', /onclick="calToToday\(\);navTo\(CUR_PAGE\)"/],
    ['篩選教練', /function calSetCoach\(id\)\{/],['篩選課程', /function calSetCourse\(cls\)\{/],
    ['新增預約', /onclick="openBookingModal\(\)"/],['點擊課卡', /onEvClick/],
    ['並排預約', /assignLanesDay\(dayEvs\)/],['團體課人數', /grpHeadsNoLeave/],
    ['待簽約提示', /cal-ev-pend/],['即時紅線', /class="cal-now"/],
    ['滑鼠提示', /data-tip="\$\{_tipStr\}"/],['拖曳改期', /function initCalDrag\(\)\{/]];
  eq('★★ 十二項既有互動全部還在', keep.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★ Ink 層沒有動到任何 pointer-events／display（不會把東西藏掉或關掉點擊）',
     !/pointer-events\s*:/.test(RULES)
     && !/display\s*:\s*none/.test(RULES.replace(/\.cchip-dot\{display:none;\}/,'')));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
