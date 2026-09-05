/* 2026-08-01 使用者指示（附首頁截圖，桌機管理員/櫃檯首頁四件事）：
   ①「首頁右上角跟插圖對稱的位子擺健身小知識」
      追加：「健身小知識的圖卡跟左邊插圖的大小要對稱」
   ②「新增會員 銷售 查看合約三個按鈕改到 KPI 的右邊」
   ③「讓版面維持在不用滑動視窗就可以看到所有訊息的大小
      中間教練預約課卡如果當天有很多教練上課 則按比例縮小課卡 不要用卷軸捲動視窗」
   ④「移除『晚安,余東曄』『今天狀況不好』狀況好的那天叫比賽」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 桌機三欄的排法');
/* 2026-09-02 使用者指示：「移除健身小卡　把右上角三個按鈕（新增會員／銷售／查看合約）
   改到左邊員工上班資訊下面」——
   左欄＝月曆 → 今日值班 → 三顆快捷鈕；右欄只剩今日收款；健身小卡整張退場（桌機）。
   ⚠ 0819 那次首頁全頁改版被要求整個改回去，所以這次刻意只動這兩件，
     中欄（兩張紅卡＋KPI＋教練任務）一格都沒碰。 */
ok('★★ 左欄由上至下：月曆 → 今日值班 → 三顆快捷鈕',
   /<div class="mc-b4-cal">\$\{deskCalCard\}<\/div>\s*\n\s*<div class="mc-dutyplain">\$\{dutyRingCard\}<\/div>\s*\n\s*<div class="mc-quick-left">\$\{quickCard\}<\/div>/.test(src));
ok('★★ 桌機不再畫健身小卡（knowCardHTML 只剩手機在用，函式保留備援）',
   !/<div class="mc-know-left">/.test(src) && !/<div class="mc-know-top">/.test(src)
   && /function knowCardHTML\(\)/.test(src)
   /* 剩下 5 處＝1 個定義＋4 個呼叫，四個呼叫全部是手機路徑：
      手機 slime 版面、換卡自動更新、教練手機首頁、會員手機首頁。 */
   && (src.match(/knowCardHTML\(\)/g)||[]).length===5
   && !/isMobileLayout\(\)\?\(admMobHero\|\|adminCalCard\)[\s\S]{0,4000}?mc-grid5[\s\S]{0,3000}?knowCardHTML\(\)/.test(src));
/* 2026-09-02 四修（使用者：「ＫＰＩ教練課　團體課　今日營收　重新排列改到右邊欄上方
   做成三列　名稱靠左　數字＋單位靠右　所以中間教練任務欄就可以靠上方了」）——
   三個 KPI 全部進右欄一項一列；中間欄的 KPI 條整條退場，今日教練任務貼到最上面。 */
ok('★★★ 中間欄第一格就是今日教練任務（KPI 條整條退場）',
   !/\$\{kpiStrip\}/.test(src)
   && /<div class="mc-g5-mid">[\s\S]{0,200}?<div class="card mc-card mc-coachcenter">/.test(src)
   && /\.mc-g5-mid>\.mc-coachcenter:first-child\{margin:-10px 0 16px !important;\}/.test(src));
ok('★★ 右欄＝KPI 三列 → 今日收款名單',
   /<div class="mc-kpiright">\$\{kpiRows\}<\/div>\s*\n\s*\$\{revListCard\}/.test(src)
   && !/<div class="mc-quick-top">\$\{quickCard\}<\/div>/.test(src));
ok('★★ 三項一項一列：名稱靠左、數字＋單位靠右',
   /const kpiRows=`<div class="mc-kpirows">/.test(src)
   && /\[ICONS\.cal,'教練課',`\$\{_ptN\}`,'堂'\]/.test(src)
   && /\[OPS_TODO_IC\.calendar,'團體課',`\$\{_grpN\}`,'堂'\]/.test(src)
   && /\[OPS_TODO_IC\.money,'今日營收',`\$\$\{_fm\(_revTotal\)\}`,''\]/.test(src)
   && /<div class="kr"><span class="kr-l">\$\{ic\}\$\{l\}<\/span>`/.test(src)
   && /\.mc-kpirows \.kr\{display:flex;align-items:center;justify-content:space-between;/.test(src));
ok('★★ 三欄都貼齊頂欄（左欄月曆本來就有 −10px，中右兩欄跟上）',
   /\.mc-g5-left>\.mc-b4-cal:first-child\{margin:-10px 0 16px !important;\}/.test(src)
   && /\.mc-g5-mid>\.mc-coachcenter:first-child\{margin:-10px 0 16px !important;\}/.test(src)
   && /\.mc-g5-right>\.mc-kpiright\{margin:-10px 0 16px !important;\}/.test(src));
/* ⚠ 數字級距不能用 vw：vw 看的是**整個視窗**、不是這一欄的 340px。 */
ok('★★★ 右欄數字用固定級距，不是 vw',
   /\.mc-kpirows \.kr-n\{font-family:var\(--font-en\),var\(--num\);font-size:34px;/.test(src)
   && !/\.mc-kpirows[\s\S]{0,400}?vw/.test(src));
/* 2026-09-02（同一輪兩句）：「三個ＫＰＩ中間的分隔線移除」＋「ＫＰＩ只放大數字就好」 */
ok('★★ 三列之間沒有分隔線',
   !/\.mc-kpirows \.kr\{[^}]*border-bottom/.test(src)
   && !/\.mc-kpirows \.kr:last-child\{border-bottom:none;\}/.test(src));
ok('★★ 只放大數字，名稱維持原字級',
   /\.mc-kpirows \.kr-l\{[\s\S]{0,80}?font-size:13px;/.test(src));
ok('　　不畫白底（0819 使用者：「右上角ＫＰＩ去除白底」）',
   /不畫白底：0819 使用者指示過「右上角ＫＰＩ去除白底」/.test(src)
   && !/\.mc-kpirows\{[^}]*background/.test(src));
ok('★★ 左欄只有 300px，三顆並排的字距與字級要收窄（查看合約不能斷成兩行）',
   /\.mc-quick-left \.mc-quick3\{display:flex;gap:8px;\}/.test(src)
   && /\.mc-quick-left \.mc-q3\{flex:1 1 0;min-width:0;min-height:84px;padding:13px 2px;gap:8px;\s*\n\s*font-size:12px;font-weight:700;border-radius:var\(--radius-xl\);white-space:nowrap;\}/.test(src));
/* 2026-08-01 三修（使用者：「健身小知識因為縮得太小了 看不到完整訊息 要放大一點
   （左邊縮圖也放大一點）」）：兩張一起 114 → 150px，仍然對稱。 */
ok('★ 知識卡高度 150px（左右兩處共用同一組壓縮尺寸）',
   /\.mc-art\{position:relative;width:100%;height:150px;/.test(src)
   && /\.mc-know-top \.know-card,\.mc-know-left \.know-card\{min-height:150px;height:150px;/.test(src));
ok('★ 說明放到四行、字級回到 12.5px（原本兩行會把話截掉）',
   /-webkit-line-clamp:4;/.test(src) && /\.mc-know-top \.know-s,\.mc-know-left \.know-s\{font-size:12\.5px;/.test(src));
ok('★ 貼齊頂欄的負上邊距也一致（-10 / 下 16；2026-08-12 起左欄頂是收款提醒卡）',
   /\.mc-g5-left>\.mc-art-top,\.mc-g5-left>\.mc-payremind\{margin:-10px 0 16px !important;\}/.test(src)
   && /\.mc-g5-right>\.mc-know-top\{margin:-10px 0 16px !important;\}/.test(src));
ok('★ 右欄原本用 padding-top:43px 撐的齊頭留白要拿掉，否則空白跑到知識卡上面',
   /* 2026-08-24：欄寬 300 → 340（使用者：今日營收的米色區要加寬，讓購買項目顯示得完整）。 */
   /\.mc-g5-right\{flex:0 0 340px;min-width:0;display:flex;flex-direction:column;\s*\n\s*padding-top:0;\}/.test(src));
ok('　　壓成矮卡後內文改緊湊版（不再有 190px 直式卡的 52px 上留白）',
   /\.mc-know-top \.know-body,\.mc-know-left \.know-body\{margin-top:0;/.test(src));
ok('　　右側留給插圖，字不壓上去', /\.mc-know-top \.know-body,\.mc-know-left \.know-body\{margin-top:0;padding-right:62px;\}/.test(src));
/* 2026-08-01 使用者指示：「全系統的健身知識卡 背景色幫我參考首頁插圖的背景色套用」 */
ok('★ 知識卡底色與插圖卡一致（--card2 ＋ --bd 細框），不再是三個漸層',
   /\.know-card\{position:relative;min-height:190px;padding:16px 18px;overflow:hidden;cursor:pointer;\s*\n\s*background:var\(--card2,#FAF7F0\);border:1px solid var\(--bd\);/.test(src)
   && !/\.know-kc\{background:linear-gradient/.test(src));
ok('　　課別改由分類標籤的實色與插圖著色承接（資訊沒有少）',
   /\.know-kc\{--kc-acc:#134737;color:#134737;\}/.test(src)
   && /\.know-chip\{[\s\S]{0,120}background:var\(--kc-acc,#134737\);color:#fff;/.test(src));
ok('　　底色變淺後插圖透明度提高，才看得出筆觸', /width:120px;height:120px;opacity:\.5;/.test(src));
ok('　　點一下換下一則仍可用（knowNext 換的是卡本身，外層 .mc-know-top 保留）',
   /el\.outerHTML=knowCardHTML\(\);/.test(src));
ok('　　手機版知識卡不受影響（走另一條分支）',
   /\$\{monthCard\+todoCard\+knowCardHTML\(\)\}/.test(src));

console.log('\n② 三顆按鈕與三個 KPI 的落點');
/* 這一段從 0801 到 0902 搬過五次，最後的分佈是：
     左欄＝月曆 → 值班 → 三顆快捷鈕 → 兩張紅卡
     中欄＝今日教練任務（貼最上面）
     右欄＝KPI 三列 → 今日收款名單
   ⚠ 0822 那條「KPI 被壓縮」的收斂規則（.mc-kpistrip 與 1400／1150 兩個斷點）
     連同 KPI 條一起移除 —— 三邊各自在固定寬的欄位裡，不再互相擠。 */
ok('★★ quickCard 只出現一次，而且在左欄（搬家不能留下第二份）',
   (src.match(/\$\{quickCard\}/g)||[]).length===1
   && /<div class="mc-quick-left">\$\{quickCard\}<\/div>/.test(src));
ok('★ 三顆鈕的內容不變（新增會員／銷售／查看合約）',
   /openBackofficeMember\(\)">\$\{ICONS\.people\}<span>新增會員<\/span>/.test(src)
   && /openSalesModal\(\)">\$\{OPS_TODO_IC\.ticket\}<span>銷售<\/span>/.test(src)
   && /openContractQuickView\(\)"[\s\S]{0,320}<span>查看合約<\/span>/.test(src));
ok('　　原處只留說明，沒有第二份定義',
   (src.match(/const quickCard=/g)||[]).length===1);
ok('★★ 兩張紅卡在左欄、三顆鈕下面',
   /<div class="mc-quick-left">\$\{quickCard\}<\/div>\s*\n\s*\$\{alertBox\}/.test(src)
   && (src.match(/\$\{alertBox\}/g)||[]).length===1);
ok('★★★ 死掉的 KPI 條樣式沒有留在檔案裡',
   !/\.mc-kpistrip\{/.test(src) && !/\.mc-kpinums\{/.test(src)
   && !/^\.kpi-it\{/m.test(src) && !/^\.kpi-n\{/m.test(src) && !/^\.kpi-l\{/m.test(src)
   && !/@media\(max-width:1400px\)\{\s*\n\s*\.mc-kpistrip/.test(src));
ok('　　⚠ Ink 主題的白底樣式掛在外框 class 上，改名有跟著改（不然紅卡會掉回紅漸層）',
   /body\.ink \.mc-alertleft \.mc-alert2 \.mc-a2\{/.test(src)
   && !/body\.ink \.mc-kpistrip \.mc-alert2/.test(src));

console.log('\n③ 移除問候與那句話');
ok('★ kpi-greet 整塊不再產出', !/<div class="kpi-greet">/.test(src));
ok('★ greetingMsg 不再在首頁被呼叫', !/const _g5=greetingMsg\('staff', SESSION\.name\);/.test(src));
ok('　　.kg-t／.kg-s 樣式一併退場，不留無主規則',
   !/^\.kg-t\{/m.test(src) && !/^\.kg-s\{/m.test(src));
ok('　　使用者的原話寫在程式裡', /移除『晚安，余東曄』/.test(src));

console.log('\n④ 教練任務卡收進視窗、課卡按比例縮小');
ok('★ 有 fitCoachCards()，且首頁渲染完會呼叫',
   /function fitCoachCards\(\)\{/.test(src) && /try\{ fitCoachCards\(\); \}catch\(_\)\{\}/.test(src));
ok('★ 視窗改變大小要重算', /window\.addEventListener\('resize',\(\)=>\{/.test(src)
   && /fitCoachCards\(\);/.test(src));
ok('★ 高度量法與行事曆同一套（innerHeight − 元素 top − 留白）',
   /Math\.round\(window\.innerHeight - midTop - 14\)/.test(src)
   && /Math\.round\(window\.innerHeight - top - 14\)/.test(src));
/* 2026-08-21：課卡縮放整套退場（見下面第 ⑤ 區與 tests/dashdaycaltest.js）；
   「zoom 而不是 transform」那條斷言連同 zoom 一起收掉。 */
ok('★ 面板高度仍然是量出來的，不是寫死',
   /cc\.style\.maxHeight=Math\.max\(320, Math\.round\(window\.innerHeight - top - 14\)\)\+'px';/.test(src));
ok('★ 高度鏈一路傳到課卡群（卡→wrap→card→panel→body）',
   /\.mc-coachcenter\{display:flex;flex-direction:column;overflow:hidden;\}/.test(src)
   && /\.mc-coachcenter>\.mc-timeline-wrap\{flex:1;min-height:0;/.test(src)
   && /\.mc-coachcenter \.mc-timeline-wrap>\.card\{flex:1;min-height:0;/.test(src)
   && /\.mc-coachcenter \.tl-panel\{flex:1;min-height:0;/.test(src));
ok('★ 縮到下限仍放不下 → 保留內捲，不默默切掉整列教練',
   /overflow-y:auto/.test(src) && /寧可捲，也不要把整列教練默默切掉/.test(src));
ok('　　左右兩欄刻意不設 overflow（第一格用負上邊距貼齊頂欄，變捲動容器會被裁掉）',
   /一旦變成捲動容器就會被裁掉/.test(src));
ok('　　手機版不套（走另一套版面）',
   /if\(isMobileLayout\(\)\)\{\s*\n\s*if\(mid\)\{\s*\n\s*mid\.style\.removeProperty\('height'\);/.test(src));

console.log('\n⑤ 展延到視窗底＋課卡依教練數縮放（2026-08-02 使用者指示）');
/* 前兩次做法都讓整張卡在實機上變成一條空白（使用者回報「教練任務不見了」）：
   ① zoom 開到 >1，但套在 .tcard-body —— 那是 flex:1 的捲動容器，量到的 clientHeight
      本身就被 zoom 除過，放大時測量與版面互相餵食。
   ② 在 .mc-coachcenter 上直接設 height —— 它的 flex 是 1.45（flex-basis:0%），
      主軸尺寸由 flex 決定，height 根本不會生效。
   這一版改成「高度給欄、zoom 給新包的內層」，而且是在瀏覽器上量過才上線的。 */
/* 2026-08-21：課卡縮放整套退場（橫排課卡 → 一日行事曆，見 tests/dashdaycaltest.js）。
   ①② 兩條死路的紀錄留在程式裡，因為「height 給欄不給卡」這一條仍然成立。 */
ok('★ 縮放那套已完全移除（沒有殘留的死程式）',
   !/tcard-zoom">/.test(src) && !/TCARD_ZOOM_MIN/.test(src) && !/--tcz/.test(src));
ok('★ 高度仍然給「中間那一欄」，教練卡靠 flex-grow 自己撐滿',
   /const colH=Math\.max\(320, Math\.round\(window\.innerHeight - midTop - 14\)\);/.test(src)
   && /mid\.style\.height=colH\+'px';/.test(src));
ok('　　「height 不能給 .mc-coachcenter」那條教訓留著（flex-basis:0% 會蓋掉）',
   /主軸尺寸由 flex 決定，height 根本不會生效。/.test(src));
ok('　　為什麼 zoom 那條路作廢，寫在原地',
   /行事曆靠時間軸定位，縮放只會把課卡壓扁/.test(src));
ok('　　resize 仍然併到下一個影格只跑一次',
   /let _fitTick=false;/.test(src) && /requestAnimationFrame\(\(\)=>\{ _fitTick=false; try\{ fitCoachCards\(\); \}catch\(_\)\{\} \}\);/.test(src));

{
  const i2=src.indexOf('function fitCoachCards(){');
  const j2=src.indexOf('/* resize 期間每個事件都重算版面會卡', i2);
  const code=src.slice(i2,j2);
  const run=(winH, midTop, ccTop, mobile)=>{
    let midH=null, ccMax=null, cleared=0, g5h=null;
    const grid={ style:{ setProperty(k,v){ if(k==='--g5h') g5h=v; }, removeProperty(){ cleared++; } } };
    const mid={ getBoundingClientRect:()=>({top:midTop}), closest:()=>grid,
      style:{ set height(v){ midH=v; }, removeProperty(){ cleared++; } } };
    const cc={ getBoundingClientRect:()=>({top:ccTop}), closest:()=>mid,
      style:{ set maxHeight(v){ ccMax=v; }, removeProperty(){ cleared++; } } };
    new Function('document','window','isMobileLayout',
      code+'\nfitCoachCards();')({querySelector:()=>cc},{innerHeight:winH},()=>!!mobile);
    return {midH, ccMax, g5h, cleared};
  };
  eq('★ 中間欄撐到視窗底（900−106−14）', run(900,106,300).midH, '780px');
  eq('★ 同一個高度傳給左右兩欄（--g5h）', run(900,106,300).g5h, '780px');
  eq('　　教練卡自己的上限也跟著量（900−300−14）', run(900,106,300).ccMax, '586px');
  eq('　　視窗很矮時仍給下限（行事曆要放得下時間軸，320px）', run(300,200,260).midH, '320px');
  eq('　　手機版把尺寸還原、不設高度',
     [run(900,106,300,true).midH, run(900,106,300,true).cleared>=3], [null,true]);
}
console.log('\n⑥ 左右兩欄也疊到視窗底＋今日營收最多 10 名（2026-08-02 使用者指示）');
/* 「首頁左右兩邊的欄位也從視窗底部往上疊加，最高疊加到頂欄為止」
   「右側今日營收最多顯示 10 名」 */
ok('★ 三欄同高，高度放在 .mc-grid5 的 --g5h', /grid\.style\.setProperty\('--g5h', colH\+'px'\);/.test(src)
   && /\.mc-grid5\{min-height:var\(--g5h,0\);\}/.test(src));
/* 2026-08-02 二修（使用者：「左側欄月曆沒有靠到底，從下往上排列 月曆 值班 插畫」）——
   原本是把最後一張卡拉長來填滿，但月曆的格高是固定的：卡片外框變高，月曆本身
   還是浮在框的上緣，看起來就是「沒有靠到底」。改成不拉長任何一張卡，
   把多出來的空白推到「插畫與值班之間」。 */
ok('★ 左欄用 min-height（月曆是固定格高的表格，硬壓會切掉半排日期）',
   /\.mc-g5-left\{min-height:var\(--g5h,0\);/.test(src));
/* 三修（使用者：「左側空白留白在上方」）：空白不是夾在插畫與值班之間，是整欄靠底、
   多出來的全部留在最上面。 */
/* 0822 使用者：「左邊欄改從上方往下延展，所以月曆要貼在上方頂欄」——0801 的靠底退場 */
ok('★ 左欄從上往下排，月曆貼齊頂欄（空白留在最下面）',
   /\.mc-g5-left\{min-height:var\(--g5h,0\);justify-content:flex-start;\}/.test(src)
   && /\.mc-g5-left>\.mc-b4-cal:first-child\{margin:-10px 0 16px !important;\}/.test(src));
ok('★ 月曆那格不再被拉長（.mc-b4-cal 在另一個版面是 flex:1，會撐高外框）',
   /\.mc-g5-left>\.mc-b4-cal\{flex:0 0 auto;\}/.test(src));
ok('　　為什麼拉長卡片沒用，寫在程式裡',
   /把卡片外框拉高只是在框裡多出白，\n\s*月曆本身還是浮在上緣/.test(src)
   && /在這一欄會讓「外框」長高、\n\s*月曆本身還是浮在框的上緣/.test(src));
ok('　　也記下試過「空白夾在中間」那一版（免得又改回去）',
   /試過把空白夾在插畫與值班之間（插畫留在頂欄下），使用者要的是留在上方。/.test(src));
ok('★ 右欄用 height 真的封頂，讓收款名單在自己的框裡捲',
   /\.mc-g5-right\{height:var\(--g5h,auto\);\}/.test(src)
   && /\.mc-g5-right>\.mc-revlist-card\{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;\}/.test(src)
   && /\.mc-g5-right>\.mc-revlist-card \.mc-revlist\{flex:1;min-height:0;\}/.test(src));
ok('　　為什麼兩欄用不同擋法，寫在程式裡',
   /月曆是固定格高的表格，硬壓就會被切掉半排日期/.test(src)
   && /收款一多就讓它在自己的框裡捲，而不是把整欄往下推出視窗/.test(src));
ok('　　兩欄都不設 overflow（第一格用負上邊距貼齊頂欄，變捲動容器會被裁掉）',
   /兩邊都不設 overflow：第一格用負上邊距貼齊頂欄，變成捲動容器會被裁掉。/.test(src));
ok('　　手機版把 --g5h 也清掉', /const g=mid\.closest\('\.mc-grid5'\); if\(g\) g\.style\.removeProperty\('--g5h'\);/.test(src));

/* 2026-08-12 使用者指示「今天營收延伸到視窗底」：10 筆上限退場（當時設限是因為下方擠著待辦卡）。 */
ok('★ 今日營收名單全列、卡內捲（不再設 10 筆上限）', /const _revShown=_revRows, _revMore=0;/.test(src)
   && /\$\{_revShown\.map\(r=>`/.test(src));
ok('★ 超過的用一行帶到彈窗看全部（不是默默截掉）',
   /<button class="mc-rev-more" onclick="openTodayRevList\(\)">還有 \$\{_revMore\} 筆　·　看全部 ›<\/button>/.test(src));
ok('　　剛好 10 筆以內不顯示那一行', /\$\{_revMore>0\?`<button class="mc-rev-more"/.test(src));
ok('★ 改用筆數擋，不再用 max-height（欄高會隨螢幕變，用高度擋會忽多忽少）',
   !/\.mc-revlist-card \.mc-revlist\{max-height:248px/.test(src)
   && /改用筆數擋，因為右欄現在會撐滿視窗高度，用高度擋會隨螢幕大小忽多忽少。/.test(src));
ok('　　彈窗版仍列全部（window\._gdRev 收的是完整的 _revRows）',
   /window\._gdRev=\{date, rows:_revRows,/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
