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

console.log('① 健身小知識移到右上角，與左上插畫對稱');
/* 0822 四修（使用者指示，附全頁截圖）：左欄由上至下＝月曆 → 今日值班 → 健身小卡；
   右欄＝三張快捷卡 → 今日收款；中間只剩兩張紅卡＋KPI。 */
ok('★ 右欄第一格＝三張快捷卡', /<div class="mc-g5-right">[\s\S]{0,240}<div class="mc-quick-top">\$\{quickCard\}<\/div>/.test(src));
ok('★ 左欄由上至下：月曆 → 今日值班 → 健身小卡',
   /<div class="mc-b4-cal">\$\{deskCalCard\}<\/div>\s*\n\s*<div class="mc-dutyplain">\$\{dutyRingCard\}<\/div>\s*\n\s*<div class="mc-know-left">\$\{knowCardHTML\(\)\}<\/div>/.test(src));
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
   /\.mc-g5-right\{flex:0 0 300px;min-width:0;display:flex;flex-direction:column;\s*\n\s*padding-top:0;\}/.test(src));
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

console.log('\n② 三顆按鈕移到 KPI 右邊');
/* 0822 三修：順序改成 兩張紅卡 → 三顆白鈕 → KPI 數字群（數字群靠最右） */
/* 0822 四修：三顆鈕又搬回右欄最上（KPI 條只留兩張紅卡＋數字群） */
ok('★ KPI 條只剩兩張紅卡＋數字群',
   /<div class="mc-kpistrip"><!--ALERTS-->\s*\n\s*<div class="mc-kpinums">/.test(src)
   && !/mc-kpistrip[\s\S]{0,80}\$\{quickCard\}/.test(src));
ok('★ quickCard 在右欄最上',
   /<div class="mc-g5-right">[\s\S]{0,240}<div class="mc-quick-top">\$\{quickCard\}<\/div>/.test(src));
ok('★ 三顆鈕的內容不變（新增會員／銷售／查看合約）',
   /openBackofficeMember\(\)">\$\{ICONS\.people\}<span>新增會員<\/span>/.test(src)
   && /openSalesModal\(\)">\$\{OPS_TODO_IC\.ticket\}<span>銷售<\/span>/.test(src)
   && /openContractQuickView\(\)"[\s\S]{0,320}<span>查看合約<\/span>/.test(src));
{
  /* quickCard 是 const，被 kpiStrip 的樣板字串引用 → 宣告一定要在前面，否則落在 TDZ 直接爆 */
  const q=src.indexOf('const quickCard=`<div class="mc-quick3">');
  const k=src.indexOf('let kpiStrip=`<div class="mc-kpistrip">');   /* 0822 改成 let：兩張紅卡算完數字才塞進插點 */
  ok('★ quickCard 宣告在 kpiStrip 之前（const 的 TDZ）', q>0 && k>0 && q<k, {q,k});
  ok('　　原處只留說明，沒有第二份定義',
     (src.match(/const quickCard=/g)||[]).length===1);
}
/* 2026-08-01 二修（使用者：「三個中間 KPI 要靠右 跟按鈕靠在一起」） */
ok('★ 整條靠右，數字與按鈕成為同一群',
   /\.mc-g5-mid \.mc-kpistrip\{margin-bottom:14px;padding:6px 14px 0;justify-content:flex-end;gap:clamp\(16px,2\.4vw,52px\);\}/.test(src)
   && !/\.mc-g5-mid \.mc-kpistrip \.mc-quick3\{margin-left:auto;\}/.test(src));
ok('　　按鈕群自己的間距比數字之間近', /\.mc-kpistrip \.mc-quick3\{gap:10px;flex:0 1 auto;min-width:0;\}/.test(src));
/* 2026-08-01 二修（使用者：「首頁 KPI 右邊的三個按鈕可以放大一點 改成直式卡片」）——
   原本壓扁的小方塊跟旁邊 44px 的大數字擺一起太小。 */
ok('　　三顆鈕改成直式卡片（加寬加高、圖示放大），寬度可隨螢幕伸縮',
   /\.mc-kpistrip \.mc-quick3 \.mc-q3\{flex:0 1 auto;width:clamp\(76px,6\.4vw,96px\);min-width:62px;min-height:96px;/.test(src)
   && /\.mc-kpistrip \.mc-quick3 \.mc-q3 svg\{width:26px;height:26px;\}/.test(src));
/* 2026-08-01 使用者回報：「我用 mac 上方會被切成兩列 用一般桌機就沒有」——
   筆電螢幕窄，固定 52px 間距＋三顆 96px 卡片擠不下，flex-wrap 一換行就變兩列。 */
/* 2026-08-08 使用者再回報（附截圖）：Mac 上 KPI 被壓成「18／堂／教練課」三行、
   「團體課」還斷成兩行 → 最小間距再收到 12px，並且數字與標籤一律不換行。 */
ok('★ 不換行，空間不夠時先縮間距（clamp）而不是折行',
   /\.mc-kpistrip\{display:flex;align-items:center;justify-content:flex-start;\s*\n\s*gap:clamp\(10px,1\.6vw,28px\);min-width:0;padding-right:14px;flex-wrap:nowrap;\}/.test(src));
ok('★★ 數字與標籤一律不換行（該縮的是字級，不是折行）',
   /\.kpi-n\{font-size:clamp\(30px,3\.4vw,44px\);[\s\S]{0,120}white-space:nowrap;\}/.test(src)
   && /\.kpi-l\{display:inline-flex;[\s\S]{0,120}white-space:nowrap;\}/.test(src));
ok('★★ 寬螢幕（≥1294px）字級維持原本的 44px，只有更窄才縮',
   /1294px 以上維持原本的 44px（寬螢幕完全沒變），/.test(src));
ok('★ 很窄時先讓副標與圖示讓位，數字本身不動',
   /@media\(max-width:1150px\)\{\n\s*\.mc-kpistrip \.kpi-sub\{display:none;\}\n\s*\.mc-kpistrip \.kpi-l svg\{display:none;\}/.test(src));
/* 0822 三修：改成「五張卡片靠左、數字群靠最右」，讓位順序也跟著反過來 ——
   先縮卡片（.mc-a2／.mc-q3 都給了 flex:0 1 auto＋min-width），數字群守住內容寬度。 */
ok('★★ 數字群守住內容寬度，要讓位的是兩側的固定寬卡片',
   /\.mc-kpistrip \.kpi-it\{min-width:max-content;\}/.test(src)
   && /\.mc-kpinums\{display:flex;align-items:center;gap:clamp\(12px,2\.4vw,44px\);\s*\n\s*margin-left:auto;flex:0 0 auto;min-width:max-content;\}/.test(src));
ok('★ 五張卡片可壓縮（頁面不夠寬時先縮卡片）',
   /\.mc-kpistrip \.mc-alert2 \.mc-a2\{flex:0 1 auto;width:clamp\(84px,6\.2vw,108px\);min-width:66px;/.test(src)
   && /\.mc-kpistrip \.mc-quick3 \.mc-q3\{flex:0 1 auto;width:clamp\(76px,6\.4vw,96px\);min-width:62px;/.test(src));
ok('　　發票拆分那行過長時截斷，不把整條撐開',
   /\.mc-kpistrip \.kpi-sub\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;\}/.test(src));

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
ok('★ 左欄整欄靠底，空白留在最上方',
   /\.mc-g5-left\{min-height:var\(--g5h,0\);justify-content:flex-end;\}/.test(src)
   && !/\.mc-g5-left>\.mc-dutyplain\{margin-top:auto/.test(src)
   && !/\.mc-g5-left>\*:last-child\{flex:1 1 auto/.test(src));
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
