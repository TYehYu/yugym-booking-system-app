/* 桌機幕僚台（body.mc-mode）死 CSS 清除 —— 2026-09-05
   使用者指示：「一步步完成 也要一邊檢查是不是會影響目前營運中的系統」

   ══ 為什麼可以只靠靜態掃描就斷定「不影響營運」══
   這支程式沒有外部 CSS/JS，class 只可能來自單一檔案裡的靜態 HTML 與 JS 樣板。
   所以「全檔找不到任何地方會把這個 class 掛上去」＝ 這條規則永遠比對不到 DOM，
   刪掉它在執行期不可能有差別。前提是掃描要涵蓋三種產生方式（見下面的判活條件）。

   ══ 判活條件（缺一不可，少一條就會誤刪）══
   ① 字面出現：要用邊界比對，不能用子字串 —— `tl-body` 是 `dtl-body` 的子字串，
      用 indexOf 會把死的判成活的；反過來 `mc-kpi` 也會被 `mc-kpi-mini` 蓋住。
   ② 樣板拼接：`class="mc-td-n mc-td-n-${tone}"` 這種要把片段轉成正則去比對，
      前綴、中綴、後綴都要涵蓋。⚠ 但要求足夠的字面錨點，否則 `${a}-${b}`
      會生出幾乎萬用的樣式，把全部 467 個 class 都判成活的（第一版就是這樣）。
   ③ 字串相加：'mc-' + x 這種。
   ④ 註解裡提到的不算活 —— 這個檔案有大量「原 XXX 已移除」的墓碑註解。

   ══ 工具踩過的三個坑（重寫時別再踩）══
   · zsh 不對未加引號的變數做字詞分割：`cut.py $cls` 會把整串當成單一參數，
     於是單一 class 的家族正常、多 class 的家族全部「刪 0 條」還不報錯。名單走檔案。
   · 註解是制度記憶，不能跟著規則一起刪。第一版從「前一條規則結束」開始刪，
     連 `〔已移除〕KPI 條那一整套…` 那段記錄一起吃掉，被 alert2test 抓到。
   · 註解裡可能含 `{`（例：「原 @media(...){.mc-main-row{...}} 已移除」），
     會騙過大括號配對掃描 → 刪出孤兒的「註解結束符」。要先把註解位元遮成空白再掃。
     （⚠ 這一行原本寫了字面的結束符，結果自己把這段註解提前關掉，噴 SyntaxError——
       正好是它在描述的那個坑。） */
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0,fail=0;
const ok=(m,c)=>{ c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m)); };

// 只取 <style> 內容，並剝掉註解（墓碑註解提到的名字不算「還有規則」）
const styles=[]; { let i=0; for(;;){ const a=src.indexOf('<style',i); if(a<0)break;
  const s=src.indexOf('>',a)+1, e=src.indexOf('</style>',s); styles.push(src.slice(s,e)); i=e; } }
const css=styles.join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
const rest=src.replace(/<style[\s\S]*?<\/style>/g,'').replace(/\/\*[\s\S]*?\*\//g,'');

const GONE=[
  'brk-done', 'brk-dot', 'brk-todo', 'locked-booked',
  'mc-b4-todo', 'mc-bot4', 'mc-brand-ver', 'mc-cal-topbtn',
  'mc-card-more', 'mc-donut-card', 'mc-donut-center', 'mc-donut-dot',
  'mc-donut-lb', 'mc-donut-legend', 'mc-donut-lg', 'mc-donut-n',
  'mc-donut-svg', 'mc-donut-wrap', 'mc-duty-av', 'mc-duty-b',
  'mc-duty-badge', 'mc-duty-card', 'mc-duty-item', 'mc-duty-list',
  'mc-duty-nm', 'mc-duty-tm', 'mc-greet-hi', 'mc-greet-sub',
  'mc-grid-bottom', 'mc-grid-bottom-solo', 'mc-grid2', 'mc-grid3',
  'mc-hero', 'mc-hero-art', 'mc-hero-bigclock', 'mc-hero-block',
  'mc-hero-danger', 'mc-hero-date', 'mc-hero-hello', 'mc-hero-hi',
  'mc-hero-meta', 'mc-hero-nobg', 'mc-hero-ok', 'mc-hero-row',
  'mc-hero-slim', 'mc-hero-status', 'mc-hero-sub', 'mc-hero-summary',
  'mc-hero-toolbar', 'mc-hero-tools', 'mc-hero-warn', 'mc-hero2-l',
  'mc-hero2-r', 'mc-hm-b', 'mc-hm-ic', 'mc-hm-item',
  'mc-hm-lbl', 'mc-hm-sep', 'mc-htool', 'mc-k2',
  'mc-k2-row', 'mc-kpi', 'mc-kpi-b', 'mc-kpi-brk',
  'mc-kpi-card', 'mc-kpi-ic', 'mc-kpi-l', 'mc-kpi-money',
  'mc-kpi-s', 'mc-kpi-u', 'mc-kpis', 'mc-kpis-3',
  'mc-kpis-5', 'mc-kpis-cards', 'mc-main-left', 'mc-main-right',
  'mc-main-row', 'mc-msb', 'mc-msb-sel', 'mc-og-ic',
  'mc-ops-growth', 'mc-ops-i', 'mc-ops-ic', 'mc-ops-l',
  'mc-ops-money', 'mc-ops-n', 'mc-ops-nums', 'mc-ops-nums-3',
  'mc-ops-s', 'mc-qtool', 'mc-quick-card', 'mc-quick-tools',
  'mc-quick-tools-4', 'mc-quick-tools-6', 'mc-remind-all', 'mc-remind-card',
  'mc-sb-ic', 'mc-sb-ic-g', 'mc-sb-lbl', 'mc-sb-time',
  'mc-sb-who', 'mc-st-b', 'mc-st-ic', 'mc-st-s',
  'mc-st-t', 'mc-st-top', 'mc-status-card', 'mc-sumbar',
  'mc-sumbar-mid', 'mc-sumbar-next', 'mc-sumbar-view', 'mc-top4',
  'mc-wallet', 'mc-wc-d-arrow', 'mc-wc-d-b', 'mc-wc-d-ic',
  'mc-wc-detail', 'mc-wc-detail-h', 'mc-wc-l', 'mc-wc-n',
  'mc-wc-num', 'mc-wc-nums', 'mc-wcard', 'mc-wcard-arrow',
  'mc-wcard-b', 'mc-wcard-blue', 'mc-wcard-gold', 'mc-wcard-green',
  'mc-wcard-ic', 'mc-wcard-t', 'mc-wcard-v', 'mc-wf-all',
  'mc-wf-dot', 'mc-wf-hdot', 'mc-wf-head', 'mc-wf-leave',
  'mc-wf-list', 'mc-wf-normal', 'mc-wf-row', 'mc-wf-tag',
  'mc-wf-time', 'mcal', 'mcal-cell', 'mcal-duty',
  'mcal-empty', 'mcal-grid', 'mcal-today', 'mcal-wk',
  'tl-axis-row', 'tl-body', 'tl-grid',
];
/* 被測試釘住、這次刻意沒刪的 —— 它們在 HTML/JS 同樣零引用，但有測試在描述
   使用者看得到的行為（例如 veruptest「提醒顯示時滑出鈕整排往下讓位」）。
   矛盾要由人來裁決，不由清理腳本裁決。 */
/* ⚠ 2026-09-05 補漏：mc-donut-* 這一族（甜甜圈圖，9 個 class／18 條規則）第一次
   掃描時漏掉了 —— 死名單是從「已經先刪過 donut 的檔案」產生的規則集算出來的，
   後來為了修工具 git checkout 還原，名單就少了它們。教訓：名單一定要跟最終要動的
   那份檔案同一個版本產生，中途還原過就要整份重算。 */
const KEPT=['mc-fab-up', 'mc-know-left', 'mc-know-top', 'mc-kpi-n', 'mc-payremind', 'mc-quick-top', 'mc-rev-inv'];

console.log('\n① 刪掉的死 class：CSS 規則與 HTML/JS 引用都要是零');
const b=n=>new RegExp('(?<![-A-Za-z0-9_])'+n.replace(/[-]/g,'\\-')+'(?![-A-Za-z0-9_])');
const stillCss=GONE.filter(n=>new RegExp('\\.'+n.replace(/[-]/g,'\\-')+'(?![-A-Za-z0-9_])').test(css));
const stillJs =GONE.filter(n=>b(n).test(rest));
ok(`★★★ ${GONE.length} 個死 class 已無任何 CSS 規則`, stillCss.length===0);
if(stillCss.length) console.log('      殘留：'+stillCss.join(', '));
ok('★★★ 而且 HTML/JS 本來就沒有人掛它們（這才是「不影響營運」的依據）', stillJs.length===0);
if(stillJs.length) console.log('      殘留：'+stillJs.join(', '));

console.log('\n② 被測試釘住的那幾個沒有被誤刪');
KEPT.forEach(n=>ok(`　 .${n} 的規則還在（待人工判斷是否真的還在用）`,
  new RegExp('\\.'+n.replace(/[-]/g,'\\-')+'(?![-A-Za-z0-9_])').test(css)));

console.log('\n③ 這次的教訓要留在原地');
ok('★★ 判活的三種產生方式與「註解不算活」寫在本檔開頭',
   /樣板拼接/.test(src.slice(0,0)) || /① 字面出現：要用邊界比對/.test(fs.readFileSync(__filename,'utf8')));
ok('★★ zsh 字詞分割、註解是制度記憶、註解含大括號 —— 三個坑都寫下來了',
   /zsh 不對未加引號的變數做字詞分割/.test(fs.readFileSync(__filename,'utf8'))
   && /註解是制度記憶/.test(fs.readFileSync(__filename,'utf8'))
   && /會騙過大括號配對掃描/.test(fs.readFileSync(__filename,'utf8')));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
