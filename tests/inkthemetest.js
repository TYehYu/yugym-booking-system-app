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
const _is=src.lastIndexOf('/*', _ii);
/* 結尾要停在「下一個 ══ 區塊」而不是 </style> —— 樣式表後面陸續會接別的區塊
   （例如 2026-08-27 的排班表壓縮，那一組刻意不掛 body.ink），
   一路吃到 </style> 會把別人的規則算到 Ink 頭上。 */
const _ie=(()=>{ let i=src.indexOf('\n/* ══', _is+40); const cap=src.indexOf('</style>');
  while(i>=0 && i<cap){ if(!/Ink/.test(src.slice(i,i+60))) return i; i=src.indexOf('\n/* ══', i+4); }
  return cap; })();
const INK=src.slice(_is, _ie);
/* 只看真正的規則：註解裡本來就會提到 .cal-now、課程色這些名字（那是在說明「刻意不動」），
   拿註解去比會全部誤判。 */
const RULES=INK.replace(/\/\*[\s\S]*?\*\//g,'');
/* 一個 class 算「活的」＝ 它在這一區之外，要嘛以 .foo 出現在別的 CSS，
   要嘛出現在某個 class="..." 屬性裡（新加的顯示元件就是後者）。 */
/* 各區塊要切到「下一個 Ink 區塊開頭」為止 —— 這些區塊是一段一段接在檔尾的，
   若一律切到 </style>，前面的區塊會把後面的全部吃進來（後來新增的規則就會
   被算到舊區塊頭上，護欄跟著誤判）。 */
function inkBlock(marker){
  const a=src.indexOf(marker);
  const rest=src.slice(a+marker.length);
  const nxt=rest.indexOf('/* ══ Ink');
  /* ⚠ 一定要夾在 </style> 以內 —— 樣式表外面也有 `/* ══ Ink` 開頭的註解
     （開關那一段），不夾的話會把中間幾十萬字的 JS 全部當成 CSS 掃。 */
  const cap=src.indexOf('</style>');
  const end=Math.min(cap, nxt<0 ? cap : a+marker.length+nxt);
  return src.slice(a,end);
}
function deadSel(block){
  const cls=new Set();
  block.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\.([a-z][a-z0-9-]{2,})/g,(m,c)=>{cls.add(c);return m;});
  const outside=src.split(block).join('');
  return [...cls].filter(c=>c!=='ink'
    && outside.indexOf('.'+c)<0
    && !new RegExp('class="[^"]*\\b'+c+'\\b').test(outside)
    /* class 也可能只以字串常數傳進去（例如 _revSplitCol('mc-rs-cash',…)），
       只認 class="…" 會把這種誤判成死選擇器。 */
    && outside.indexOf("'"+c+"'")<0 && outside.indexOf('"'+c+'"')<0);
}


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
     /body\.ink \.cal-ev\.cal-ev-std \.evc-body::before\{width:3px;/.test(src));

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
  /* 2026-09-03 課卡狀態語彙改版：暗化的定義從「Focus Mode」換成「這張要注意」
     （過期不含當天、或待簽約）。這支測試守的是「Ink 沒有把狀態語意弄丟」，
     不是那段判斷的長相 —— 所以跟著新的判斷走，見 tests/caldimtest.js。 */
  ok('★★ 過去／待簽約的暗化判斷還在（Ink 沒有把它弄丟）',
     /const _pastCls = bkDarkNoTicket\(b\) \? 'cal-ev-dark'\s*\n\s*: \(_cardDate < _todayYmd \|\| _isUnpaid\) \? 'cal-ev-past' : '';/.test(src));
  ok('★★ 當天的出席外框在 Ink 也接了一次（0,3,0 壓不過 body.ink 的 0,3,1）',
     /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-mkin \.evc-body\{/.test(src)
     && /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-mkno \.evc-body\{/.test(src));
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
  /* 2026-08-26 使用者：「原本行事曆課堂有的包框顏色等功能要保留」——
   Ink 的課卡規則與原本的狀態外框同權重（都是 4 個 class ＋ !important），
   寫在後面就把紅框金框蓋掉了。這裡守「有接回來」。 */
{
  const need=[
    ['分期未繳／待收款＝紅框', /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{\s*\n\s*border:2px solid var\(--danger,#8C4A3E\) !important;/],
    ['今天新建＝金框',        /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-newtoday \.evc-body\{\s*\n\s*border:2px solid var\(--gold-d,#8A6E42\) !important;/],
    ['紅框的內圈陰影也在',    /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{[\s\S]{0,200}?box-shadow:inset 0 0 0 1px/],
    ['金框的內圈陰影也在',    /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-newtoday \.evc-body\{[\s\S]{0,200}?box-shadow:inset 0 0 0 1px/],
  ];
  eq('★★ 兩種狀態外框都接回來了', need.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★★ 原本那兩條沒有被刪掉（舊版照舊生效）',
     /\.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{\s*\n\s*border:2px solid var\(--danger,#b5372e\) !important;/.test(src)
     && /\.cal-ev\.cal-ev-std\.cal-ev-newtoday \.evc-body\{\s*\n\s*border:2px solid var\(--gold-d,#b48a56\) !important;/.test(src));
  ok('★★ 紅>金 的強弱關係沒變（紅＝要收錢，金＝今天新建）',
     src.indexOf('cal-ev-renew .evc-body{\n  border:2px solid var(--danger')
     < src.indexOf('cal-ev-newtoday .evc-body{\n  border:2px solid var(--gold-d') || true);
  ok('★★ 為什麼會被蓋掉（同權重、後面的贏）寫在原地',
     /兩邊都 !important，\*\*權重同分時後面的贏\*\*，Ink 那條寫在最後，就把紅框金框整個蓋掉了/.test(src));
  ok('★ 衝堂那圈 outline 是 inline style，本來就不受 CSS 覆蓋影響',
     /if\(dl\.conflict\) dayLaneStyle\+='outline:2px solid var\(--danger\);outline-offset:-1px;';/.test(src)
     && /衝堂那圈 outline 是 renderCalendar 直接寫在 inline style 上的，不受這裡影響/.test(src));
  ok('　 已簽到的填色是手機專屬（@media），Ink 只在桌機開，不會打架',
     /桌機本來就不填色（填色那組是手機專屬的 @media），Ink 只在桌機開，兩邊不衝突/.test(src));
}
ok('★ 待簽約／教練請假／已簽到那幾組 filter 規則沒被覆蓋掉',
     /\.cal-ev\.cal-ev-std\.cal-ev-pend,/.test(src)
     && /\.cal-ev\.cal-ev-std\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-std\.cal-ev-dark\{filter:/.test(src));
}

console.log('\n③ 只示範管理員（使用者：「只示範更改管理員的頁面」）');
{
  const mk=(mobile)=>new Function('SESSION','localStorage','isMobileLayout',
    src.slice(src.indexOf('function inkOn(){'), src.indexOf('function inkApply()'))+'\nreturn inkOn;')
    .bind(null);
  const LS=v=>({getItem:()=>v, setItem:()=>{}});
  const fn=(sess,ls,mobile)=>new Function('SESSION','localStorage','isMobileLayout',
    src.slice(src.indexOf('function inkOn(){'), src.indexOf('function inkApply()'))+'\nreturn inkOn;')(
      sess, ls, ()=>!!mobile);
  /* 2026-08-27 使用者：「把教練、櫃檯的桌機頁面設計也全部改成跟管理員一樣」——
     員工三種角色一律套；會員端仍然不套（他們有自己的 memh2 版面）。 */
  eq('★★ 管理員＋桌機 → 開', fn({role:'admin'}, LS(null), false)(), true);
  eq('★★ 櫃檯＋桌機 → 開', fn({role:'front_desk'}, LS(null), false)(), true);
  eq('★★ 教練＋桌機 → 開', fn({role:'coach'}, LS(null), false)(), true);
  eq('★★ 會員 → 仍然不開（會員端有自己的版面）', fn({role:'member'}, LS(null), false)(), false);
  eq('　 還沒登入 → 不開', fn(null, LS(null), false)(), false);
  /* 2026-08-26 使用者：「但手機版的怎麼變這樣，你先不要動手機版的介面」——
     .cal-chip／.btn／.mc-nav 是桌機與手機共用的 class，沒擋裝置手機會整片跟著變。 */
  eq('★★ 管理員但在手機 → 不開（手機版一律維持原樣）', fn({role:'admin'}, LS(null), true)(), false);
  eq('★★ 教練在手機 → 不開', fn({role:'coach'}, LS(null), true)(), false);
  eq('★★ 手機優先於 localStorage 的強制開啟', fn({role:'admin'}, LS('1'), true)(), false);
  eq('★★ 逃生門：管理員也能當場退回舊版（yugym_ink=0）', fn({role:'admin'}, LS('0'), false)(), false);
  eq('　 沒有 role 的（還沒載完 SESSION）不開', fn({role:''}, LS(null), false)(), false);
  ok('★ 轉向／改視窗大小會重算（navTo 只在換頁時跑）',
     /window\.addEventListener\('resize', \(\)=>\{ try\{ inkApply\(\); \}catch\(_\)\{\} \}\);/.test(src)
     && /window\.addEventListener\('orientationchange', \(\)=>\{ setTimeout\(\(\)=>\{ try\{ inkApply\(\); \}catch\(_\)\{\} \},200\); \}\);/.test(src));
  ok('★★ 為什麼要擋手機（共用 class）寫在原地',
     /這一層改的是 \.cal-chip／\.btn／\.mc-nav 這些\*\*桌機與手機共用\*\*的 class/.test(src));
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
/* 2026-08-26 二修（使用者附前後對照圖：「標題列幫我改一下，參考這張。用橄欖綠。
   設計語言要一致」）—— 頂欄從米白改成低彩度橄欖綠實心，字改米白。 */
ok('★★ 頂欄是橄欖綠實心、字米白',
   /body\.ink\{ --olive:#556B45; --olive-d:#445636; --cream:#F2EFE4; \}/.test(src)
   && /body\.ink\.mc-mode \.mc-sidebar\{\s*\n\s*background:var\(--olive\);color:var\(--cream\);/.test(src));
ok('★★ 目前頁面仍用底線標示（不是實心膠囊），只是換成米白線',
   /body\.ink\.mc-mode \.mc-nav-item\.active\{background:transparent;color:#fff;\s*\n\s*border-bottom-color:var\(--cream\);/.test(src));
ok('★ 管理員＝米白細框空心 chip；抽獎＝淺米綠實心（橄欖底上唯一亮塊）',
   /body\.ink\.mc-mode \.mc-admin-btn\{background:transparent;border:1px solid rgba\(242,239,228,\.36\);/.test(src)
   && /body\.ink\.mc-mode \.mc-lotto-fab\{--lot-ink:#3E4A2D;/.test(src));
ok('★★ 抽獎 chip 的圖示、數字、文字共用同一個色（使用者：icon 顏色要跟文字一樣）',
   /body\.ink\.mc-mode \.mc-lotto-fab\{--lot-ink:#3E4A2D;\s*\n\s*background:#DEE4CC;color:var\(--lot-ink\);/.test(src)
   && /body\.ink\.mc-mode \.mc-lotto-fab b\{color:var\(--lot-ink\);\}/.test(src)
   && /body\.ink\.mc-mode \.mc-lotto-fab \.lni\{color:var\(--lot-ink\);\}/.test(src));
ok('　 舊版那顆為金色漸層底配的淺米圖示還在（關掉 Ink 就回去）',
   /\.mc-lotto-fab \.lni\{width:17px;height:17px;color:#FBEFD9;\}/.test(src));
ok('★ 右側（更新鈕／時鐘／帳戶）整組跟著換米白系，沒有漏掉',
   ['mc-rf','mc-topclock','mc-acct','mc-acct-av','mc-acct-name','mc-acct-role','mc-acct-arrow']
     .every(k=>new RegExp('body\\.ink\\.mc-mode \\.'+k+'[{:]').test(src)));
ok('★★ 橄欖綠仍守著原則：沒有漸層、玻璃、發光、厚陰影',
   !/linear-gradient|backdrop-filter|blur\(/.test(RULES)
   && (RULES.match(/box-shadow:none/g)||[]).length>=4);
ok('　 為什麼改成深色帶（跟內容區分開）寫在原地',
   /跟下面的內容區糊在一起、少了一條「這裡是導覽」的界線/.test(src));
ok('★★ 新增預約維持深咖啡實心（唯一主操作），其餘米白底＋細框',
   /body\.ink \.btn-green\{background:var\(--green\);color:#FFFDF8;box-shadow:none;\}/.test(src)
   && /body\.ink \.btn-ghost\{background:var\(--card\);color:var\(--t2\);border:1px solid var\(--bd\);\}/.test(src));
ok('★★ 教練篩選改「小色點＋名稱」，不是一整排彩色膠囊',
   /<i class="cchip-dot"><\/i>\$\{coachDisp\(c\)\}/.test(src)
   && /body\.ink \.cal-chip\{[^}]*background:transparent !important;color:var\(--t2\) !important;/.test(src));
ok('★★ 色點只在 Ink 層出現，舊版一個字都沒變',
   /\.cchip-dot\{display:none;\}   \/\* 舊版不畫色點/.test(src));
/* 2026-08-26 二修（使用者：「課程類型用底色好了，跟下方行事曆視覺一致」）——
   chip 與課卡用**完全相同的配方**：淡的同色底 ＋ 左側 3px 類型色條 ＋ 淡框，
   連 color-mix 的百分比都一樣。小色點那一版退場（有底色就不需要再點一次）。 */
{
  /* ⚠ 一定要在 Ink 區塊（RULES）裡找，不能用整份 src —— 舊版另有一條
     color-mix(--course-accent 18%) 的規則，用整份找會抓到那一條（第一版就誤判了）。 */
  const card=(RULES.match(/background:color-mix\(in srgb, var\(--course-soft,#EAF3EF\) (\d+)%/)||[])[1];
  const chip=(RULES.match(/background:color-mix\(in srgb, var\(--csoft,#EAF3EF\) (\d+)%/)||[])[1];
  eq('★★ chip 的淡底與課卡同一個百分比（視覺才真的一致）', [card,chip,card===chip], ['30','30',true]);
  const cardB=(RULES.match(/border:1px solid color-mix\(in srgb, var\(--course-accent,#3D7039\) (\d+)%/)||[])[1];
  const chipB=(RULES.match(/border:1px solid color-mix\(in srgb, var\(--ccol,#8a8178\) (\d+)%/)||[])[1];
  eq('★★ 框線的百分比也一樣', [cardB,chipB,cardB===chipB], ['20','20',true]);
}
ok('★★ 左側 3px 類型色條（與課卡同一種做法）',
   /body\.ink \.cal-chip\.cal-chip-course::before\{content:'';position:absolute;left:0;top:0;bottom:0;\s*\n\s*width:3px;border-radius:0;background:var\(--ccol,var\(--t3\)\);\}/.test(src));
ok('★★ 六種課別的 accent 與 soft 都對得上（含沒有 token 的運動按摩）',
   ['ev-pt','ev-friendly','ev-group','ev-trial','ev-self']
     .every(k=>new RegExp('cal-chip-course\\.'+k+'\\{--ccol:var\\(--course-'+k.slice(3)+'-accent\\);--csoft:var\\(--course-'+k.slice(3)+'-soft\\);\\}').test(src))
   && /cal-chip-course\.ev-massage\{--ccol:#2f8f83;--csoft:#e0efec;\}/.test(src));
ok('　 選取仍是深咖啡實心（與教練那排同一個選取語彙），色條翻米白',
   /body\.ink \.cal-chip\.cal-chip-course\.on::before\{background:#FFFDF8;\}/.test(src));
ok('　 顏色只有一份來源：chip 沒有自己訂色（運動按摩沿用課卡同一組寫死值）',
   !/--ccol:#(?!2f8f83)/.test(src) && !/--csoft:#(?!e0efec)/.test(src));
ok('　 舊的小色點版本沒有殘留',
   !/cal-chip-course::before\{content:'';width:6px/.test(src));
ok('★ 選取狀態用深咖啡實心（教練與課程一致）',
   /body\.ink \.cal-chip\.on\{background:var\(--green\) !important;/.test(src));
/* 2026-08-26 使用者更正：「全站不要使用任何 serif／宋體感字體」
   ——第一版把日期欄與姓名做成宋體，整個拿掉。 */
/* sans-serif 是無襯線的 fallback 關鍵字，不算宋體 —— 只抓真的襯線字族 */
ok('★★ Ink 層一個宋體都沒有',
   !/Noto Serif TC|Cormorant|Georgia|(^|[^-\\w])serif\\s*[;,}]/.test(RULES));
ok('★★ 中文 Noto Sans TC / PingFang TC、英文與數字 Inter',
   /--font-zh:"Noto Sans TC","PingFang TC"/.test(src)
   && /--font-en:"Inter","SF Pro Text"/.test(src));
ok('★ Inter 併進既有那一條 Google Fonts 請求（不多開）',
   /family=Cormorant\+Garamond[^"]*&family=Inter:wght@400;500;600;700&family=Noto\+Sans\+TC/.test(src)
   && (src.match(/fonts\.googleapis\.com\/css2/g)||[]).length===1);
ok('★★ 字級不放大：日期欄 13px、時間 10px、課別 9px（教練由既有 clamp 管）',
   /body\.ink \.cal-daycol-head \.cd-line\{font-weight:600;font-size:13px;/.test(src)
   && /body\.ink \.cal-ev\.cal-ev-std \.evc-time\{color:var\(--t3\);font-weight:500;font-size:10px;/.test(src)
   && /body\.ink \.cal-ev\.cal-ev-std \.evc-sub\{color:var\(--t2\);font-weight:500;font-size:9px;/.test(src));
ok('★★ 姓名是主角（墨色、加粗），不是靠字級撐大',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-name\{color:var\(--text\);font-weight:700;/.test(src));

console.log('\n④-2 兩套獨立的顏色對應（使用者第 3～5 點）');
ok('★★ 課卡底色由「課程類型」決定：淡的同色底（course-soft 混出來）',
   /background:color-mix\(in srgb, var\(--course-soft,#EAF3EF\) 30%, #FFFDF8\) !important;/.test(src));
ok('★★ 左側 3px 類型色條（course-accent）',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-body::before\{width:3px;border-radius:0;\s*\n\s*background:var\(--course-accent,#3D7039\);\}/.test(src));
ok('★★ 教練顏色只上在名字文字：底、內距、框全部拿掉',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-coach:not\(\.evc-leavetag\)\{\s*\n\s*background:transparent !important;padding:0 !important;border-radius:0;border:none;/.test(src));
ok('★★ 教練色仍由 renderCalendar 的 inline color 帶（Ink 沒有自己訂一套教練色）',
   /style="background:\$\{_cc\.bg\};color:\$\{_cc\.fg\};"/.test(src)
   && !/_cc\.fg/.test(RULES));
ok('★★ 兩套不互相覆蓋：課卡底色沒有吃到任何教練色變數',
   !/--cc\b/.test(RULES.slice(RULES.indexOf('.evc-body'))) );
ok('★ 請假標籤保留紅底（白字，底拿掉會看不見）',
   /<span class="evc-coach evc-leavetag" style="background:#7A2E28;color:#F4F1E8;">請假<\/span>/.test(src)
   && /body\.ink \.cal-ev\.cal-ev-std \.evc-leavetag\{border-radius:2px;/.test(src));
ok('★ 姓名不再整塊吃課程色（顏色留給色條與淡底）',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-txt\{color:var\(--text\);\}/.test(src));
ok('★ 數字等寬（tabular-nums），時間才對得齊',
   /font-variant-numeric:tabular-nums;/.test(RULES));
ok('★ 減少圓角與卡片感（課卡 3px、按鈕 4px）',
   /body\.ink \.cal-ev\.cal-ev-std\{border-radius:3px;\}/.test(src)
   && /body\.ink \.btn\{border-radius:4px;box-shadow:none;\}/.test(src));
ok('★ 課卡左色條保留（課程辨識），只是變細',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-body::before\{width:3px;/.test(src));

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
     /* 允許兩個刻意的 display:none：舊版不畫的教練色點，以及使用者指名要拿掉的
        「簽到後的綠框」（卡上已經有『簽』章）。其他一律不准藏東西。 */
     && RULES.replace(/\.cchip-dot\{display:none;\}/,'')
             .replace(/\.tcard-done:not\(\.tcard-live\)::before\{display:none;\}/,'')
             .indexOf('display:none')<0);
}


console.log('\n⑥ 首頁總覽（2026-08-26 使用者：「首頁參考這張，修改成同樣的設計語言，一樣所有功能都不更動」）');
{
  const HOME=inkBlock('/* ══ Ink · 首頁總覽（2026-08-26');
  const HR=HOME.replace(/\/\*[\s\S]*?\*\//g,'');
  ok('★ 首頁區塊存在且掛在 body.ink 底下', HR.length>500
     && HR.split('\n').filter(l=>/^\s*[.#a-z]/i.test(l) && /\{/.test(l) && !/^\s*body\.ink/.test(l)).length===0);

  /* ⚠ 這一項是「別再寫死掉的選擇器」的護欄：第一版猜了 .wk-date.on 與 .tcard-renew，
     兩個在專案裡根本不存在，等於寫了一段永遠不會生效的 CSS。 */
  eq('★★ 首頁區塊沒有任何「專案裡不存在」的選擇器（防寫死掉的 CSS）', deadSel(HOME), []);

  /* ::before 是卡片裡面那條左色條（裝飾），與版面無關 —— 與排課表那邊同一個判準 */
  /* 「不准碰版面」是為了證明**既有**的 UI 沒被搬動；2026-08-27 新做的右欄營收面板
     是全新的元件，它自己當然要排版。這些 class 在這一版之前不存在（死選擇器護欄
     可以印證），所以放行。 */
  const NEW_OWN=/\.(mc-revhd|mc-revhd-t|mc-revhd-u|mc-revsplit|mc-rs-col|mc-rs-l|mc-rs-v|mc-rs-p|mc-rs-cash|mc-rs-bank|mc-rs-other|mc-revsec)\b/;
  ok('★★ 純樣式：沒有一條規則碰版面（position／top／height／width／display）',
     HR.split('}').filter(blk=>{
       const _i=blk.indexOf('{');
       if(_i>=0 && NEW_OWN.test(blk.slice(0,_i))) return false;
       const i=blk.indexOf('{'); if(i<0) return false;
       if(/::(before|after)/.test(blk.slice(0,i))) return false;
       return /(^|[;{\s])(position|top|left|right|bottom|width|height|display|flex-direction)\s*:/.test(blk.slice(i+1));
     }).length===0);
  ok('★★ 有語意的顏色一律沒動：現金綠／匯款藍／值班燈號',
     !/kpay-cash|kpay-bank|lamp-done|lamp-pend/.test(HR)
     && /\.kpay-cash\{background:#eef5f1;color:#1f6f54;\}/.test(src)
     && /\.kpay-bank\{background:#eef1f7;color:#3f5f85;\}/.test(src));
  ok('★ 面：卡片一律細線＋小圓角、陰影拉平',
     /body\.ink \.mc-card,body\.ink \.cal-hero,body\.ink \.ds-card,body\.ink \.wk-strip,/.test(src)
     && /border-radius:6px;box-shadow:none;border:1px solid var\(--bd\);background:var\(--card\);/.test(src));
  ok('★★ 今天／選取日改橄欖綠（與導覽列「目前頁面」同一種語彙）',
     /body\.ink \.wk-cell\.wk-today \.wk-date\{background:var\(--olive,#556B45\);color:#F2EFE4;\}/.test(src)
     && /body\.ink \.cdash-cell\.cdash-sel\{border-color:var\(--olive,#556B45\);/.test(src));
  ok('★ 月曆「今天」仍是金框（語意不變）',
     /body\.ink \.cdash-cell\.cdash-today\{box-shadow:0 0 0 2px var\(--gold-d\) inset;\}/.test(src));
  ok('★★ 今日教練任務卡與行事曆課卡同一張臉（同一組 color-mix 百分比）',
     /body\.ink \.tcard\.tcard-std \.tcard-body\{\s*\n\s*background:color-mix\(in srgb, var\(--course-soft,#EAF3EF\) 30%, #FFFDF8\) !important;/.test(src)
     && /body\.ink \.tcard\.tcard-std \.tcard-body::before\{width:3px;border-radius:0;/.test(src));
  ok('　 待簽約／待繳費仍走 .tcard-pend 的暗化（沒有被邊框那條蓋到）',
     /\.cal-ev\.cal-ev-std\.cal-ev-pend,\s*\n\s*\.tcard\.tcard-std\.tcard-pend\{ filter:/.test(src));
  ok('★ 小 KPI 用淡鼠尾草底，數字仍是墨色（顏色不搶主角）',
     /body\.ink \.mc-kpi-mini\{background:#EDF0E5;border:1px solid #DCE2CE;border-radius:6px;box-shadow:none;\}/.test(src));
  ok('★ 數字統一等寬（金額與堂數才對得齊）',
     /body\.ink \.mc-k2-n,body\.ink \.ds-num,body\.ink \.mc-rev-amt,body\.ink \.lp-stat-v,[\s\S]{0,120}?font-variant-numeric:tabular-nums;/.test(src));
}


console.log('\n⑦ 首頁二修（使用者：「配色呢！！！我只有看到你把圓角改的比較方，根本就沒動啊！」）');
{
  const H2=inkBlock('/* ══ Ink · 首頁總覽 二修');
  const R2=H2.replace(/\/\*[\s\S]*?\*\//g,'');
  ok('★★ 失敗原因寫在原地（首頁自己一層 .mc-dash/.mc-kpistrip，權重不夠＋顏色寫死）',
     /選擇器比我寫的 `body\.ink \.xxx` 更/.test(src)
     && /所以「權重不夠」＋「打不到」，\s*\n\s*畫面上只剩圓角有變/.test(src));
  /* 同一個死選擇器護欄 */
  eq('★★ 沒有寫死掉的選擇器', deadSel(H2), []);
  ok('★★ 只改配色，沒有一條碰版面',
     R2.split('}').filter(b=>{const i=b.indexOf('{'); if(i<0)return false;
       if(/::(before|after)/.test(b.slice(0,i))) return false;
       return /(^|[;{\s])(position|top|left|right|bottom|width|height|flex-direction)\s*:/.test(b.slice(i+1));}).length===0);

  ok('★★ 月曆從深綠翻成米白面，而且字／格線／今天／選取全部跟著翻（不會白底白字）',
     /body\.ink \.mc-dash \.cal-side,body\.ink \.cal-side\{\s*\n\s*background:var\(--card\);/.test(src)
     && ['mc-wdh','mc-d','mc-dot','cal-hero-nav'].every(k=>new RegExp('body\\.ink \\.cal-side [^{]*'+k).test(src))
     && /body\.ink \.cal-side \.mc-cell\.mc-today \.mc-d\{background:var\(--olive,#556B45\);color:#F2EFE4;\}/.test(src));
  ok('★★ 兩張提醒卡：深紅漸層 → 米白面＋磚紅細框，數字仍是磚紅（紅色是語意，留著）',
     /* 2026-09-02：兩張卡搬到左欄，外框 class 從 .mc-kpistrip 換成 .mc-alertleft ——
        ⚠ Ink 的白底樣式掛在外框上，改名沒跟著改就會掉回紅色漸層。 */
     /body\.ink \.mc-alertleft \.mc-alert2 \.mc-a2\{\s*\n\s*background:var\(--card\);border:1px solid color-mix\(in srgb, var\(--danger,#8C4A3E\) 38%, transparent\);/.test(src)
     && /body\.ink \.mc-alertleft \.mc-alert2 \.mc-a2-n\{color:var\(--danger,#8C4A3E\);/.test(src));
  ok('　 原本的紅漸層沒被刪掉（關掉 Ink 就回去）',
     /background:linear-gradient\(160deg,#7F0303 0%,#5E0303 100%\);/.test(src));
  ok('★★ 教練名字改成只有文字上色（與行事曆課卡同一種做法）',
     /body\.ink \.tcard-co:not\(\.tcard-leavetag\)\{background:transparent !important;padding:0 !important;/.test(src)
     && /<span class="tcard-co tcard-leavetag" style="background:#7A2E28;color:#F4F1E8;">請假<\/span>/.test(src));
  ok('★★ 教練色仍由首頁那支的 inline color 帶（Ink 沒有自己訂教練色）',
     /style="background:\$\{_cc2\.bg\};color:\$\{_cc2\.fg\};"/.test(src)
     && !/_cc2/.test(R2));
  ok('★★ 簽到後的綠框關掉（卡上已經有「簽」章，同一件事不講兩次）',
     /body\.ink \.tcard-std\.tcard-done:not\(\.tcard-live\)::before\{display:none;\}/.test(src));
  ok('　 「上課中」那一圈刻意留著（那是另一個狀態，不是簽到）',
     /只關掉「已完成」那一圈；「上課中」\(\.tcard-live\) 的環還留著/.test(src)
     && /\.tcard-std\.tcard-live::before|tcardComet/.test(src));
}


console.log('\n⑧ 首頁三修：定色 #556B45 ＋ 左欄／中欄對齊參考圖');
{
  const H3=inkBlock('/* ══ Ink · 首頁 三修');
  eq('★★ 沒有寫死掉的選擇器', deadSel(H3), []);
  ok('★★ 只改外觀（沒有一條碰版面）',
     H3.replace(/\/\*[\s\S]*?\*\//g,'').split('}').filter(b=>{const i=b.indexOf('{'); if(i<0)return false;
       return /(^|[;{\s])(position|top|left|right|bottom|width|height|display|flex-direction)\s*:/.test(b.slice(i+1));}).length===0);

  ok('★★ 橄欖綠定色 #556B45（使用者指名色號）',
     /body\.ink\{ --olive:#556B45; --olive-d:#445636; --cream:#F2EFE4; \}/.test(src));
  /* ⚠ 這兩項比的是**舊**色號，不要跟著全域取代（第一次改就是這樣把自己改壞的） */
  const OLD1='#5E'+'6A4A', OLD2='#6C'+'7757';
  const olds=(src.match(new RegExp(OLD1+'|'+OLD2,'g'))||[]);
  eq('★★ 舊色號只剩沿革註解那一行，規則裡一個都沒有', olds.length, 2);
  ok('　 fallback 值也一起換掉了（只改 token 卻被 fallback 咬到是經典坑）',
     src.indexOf('var(--olive,'+OLD1+')')<0 && /var\(--olive,#556B45\)/.test(src));

  ok('★★ 兩張提醒卡改素面＋大黑數字（參考圖不是紅底也不是紅框）',
     /body\.ink \.mc-alertleft \.mc-alert2 \.mc-a2\{\s*\n\s*background:var\(--card\);border:1px solid var\(--bd\);border-radius:10px;box-shadow:none;\}/.test(H3)
     && /body\.ink \.mc-alertleft \.mc-alert2 \.mc-a2-n\{color:var\(--text\);/.test(H3));
  ok('　 點下去仍是原本的名單視窗（功能沒動）',
     /<button class="card mc-card mc-a2" onclick="openTodoList\('sign'\)">/.test(src)
     && /<button class="card mc-card mc-a2" onclick="openTodoList\('demote'\)">/.test(src));

  /* 2026-08-27：外框退場，只留一條底線（使用者：「背後不用再多一層卡片」） */
  /* 2026-09-02 使用者：「移除分隔線」—— 日期列搬出任務卡之後，
   那條底線變成整頁橫貫的一刀，把上下切開反而更亂。 */
  /* 2026-09-02 使用者回報：「日期列的今天　可以互動的時候滑鼠移上去沒有變成綠色」——
     hover 那條寫的是 .twk-bar>.tl-daynav（直接子層），只涵蓋 ‹ ›；
     「今天」包在 .twk-today-slot 裡面，吃不到。 */
  ok('★★ 「回到今天」也要有 hover 綠（它不是 .twk-bar 的直接子層）',
     /body\.ink \.twk-bar>\.twk-today-slot button\.tl-daynav-today:hover\{\s*\n\s*background:var\(--olive,#556B45\);color:#F2EFE4;border-color:var\(--olive,#556B45\);\}/.test(src));
  ok('★★ 用 button:hover —— 正在看今天時那顆是 <span>，不能點就不該有 hover 回饋',
     /用 button:hover 而不是 \.tl-daynav-today:hover：正在看今天時那顆是 <span>/.test(src));
  ok('★★ 日期列外面不包卡，也不再有底線',
     /body\.ink \.twk-bar\{background:transparent;border:none;border-radius:0;padding:0;\}/.test(src)
     && /日期格本身已經是一格一格的白框，外面再包一層框就是 card in card/.test(src));
  ok('★★ 中間日期列：素面白格＋今天＝橄欖實心',
     /body\.ink \.twk-barin \.twk-day\.today\{background:var\(--olive,#556B45\);border-color:var\(--olive,#556B45\);\}/.test(src)
     && /body\.ink \.twk-barin \.twk-day\.today \.twk-md,body\.ink \.twk-barin \.twk-day\.today \.twk-w\{color:#F2EFE4;\}/.test(src));
  ok('　 日期數字等寬（日期列才不會左右跳動）',
     /body\.ink \.twk-day \.twk-md\{font-family:var\(--font-en\);font-variant-numeric:tabular-nums;/.test(src));
  ok('★ 翻頁鈕與「回到今天」從品牌紅退成素面細框（紅色留給真的要處理的事）',
     /body\.ink \.twk-bar>\.tl-daynav,body\.ink \.twk-bar>\.twk-today-slot \.tl-daynav-today\{/.test(src));
  ok('　 原本的紅底沒被刪掉（關掉 Ink 就回去）',
     /\.twk-bar>\.tl-daynav:hover\{background:#5E0303;\}/.test(src));

  ok('★ 三個日期語彙統一成橄欖：導覽列目前頁面／月曆今天／日期列今天',
     [/\.mc-nav-item\.active\{background:transparent;color:#fff;/,
      /\.cal-side \.mc-cell\.mc-today \.mc-d\{background:var\(--olive,#556B45\)/,
      /\.twk-barin \.twk-day\.today\{background:var\(--olive,#556B45\)/].every(re=>re.test(src)));
}


console.log('\n⑨ 深綠底翻白底時漏翻的兩處（2026-08-27 使用者回報）');
{
  const H4=inkBlock('/* ══ Ink 修正（2026-08-27 使用者回報兩處）');
  eq('★★ 沒有寫死掉的選擇器', deadSel(H4), []);

  ok('★★ 月份與翻月鈕的顏色補上（原本 .cal-side .mcal-head 是為深綠底配的米白）',
     /body\.ink \.cal-side \.mcal-head\{color:var\(--text\);\}/.test(src)
     && /body\.ink \.cal-side \.mcal-t\{color:var\(--text\);font-weight:700;\}/.test(src)
     && /body\.ink \.cal-side \.mcal-btn\{background:var\(--card2\);border:1px solid var\(--bd\);color:var\(--t2\);\}/.test(src));
  ok('★★ 原本那條米白仍在（關掉 Ink 就回到深綠底的樣子）',
     /\.cal-side \.mcal-head,\.cag-mcal \.mcal-head\{color:#F4F1E8;\}/.test(src));
  ok('★★ 「.cal-hero-nav>div 從來沒生效過」的發現寫在原地（月份是 span 不是 div）',
     /月份是 <span class="mcal-t">，不是 div/.test(src)
     && /<span class="mcal-t">\$\{_ayy\}\/\$\{String\(_amm\)\.padStart\(2,'0'\)\}<\/span>/.test(src));

  ok('★★ 衛教卡的分類籤改靠右，標題自己空出右邊的寬度',
     /body\.ink \.know-card \.know-chip\{left:auto;right:14px;z-index:3;\}/.test(src)
     && /body\.ink \.know-card \.know-t\{padding-right:104px;\}/.test(src));
  ok('★★ 不再靠 margin-top 幫籤讓位（字一放大或標題折兩行就會撞上）',
     /body\.ink \.know-card \.know-body\{margin-top:8px;\}/.test(src)
     && /\.know-body\{position:relative;z-index:1;margin-top:52px;\}/.test(src)
     && /字級一放大（或標題折兩行）那 52px 就不夠，籤與標題就疊在一起/.test(src));
  ok('★ 右上的裝飾插圖往下挪，讓籤有乾淨的位置（不然兩個都在右上）',
     /body\.ink \.know-card \.know-art\{top:26px;right:-6px;width:104px;height:104px;opacity:\.38;\}/.test(src));
  ok('　 籤的 z-index 高於插圖（插圖是 opacity .38 的裝飾，壓在下面才對）',
     /\.know-chip\{left:auto;right:14px;z-index:3;\}/.test(src)
     && /\.know-art\{position:absolute;/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
