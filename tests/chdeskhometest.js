/* 教練桌機首頁優化（2026-09-09 使用者：「教練的桌機首頁　版面有什麼優化建議嗎」
   →「照你建議做」→「先做1、2」）：① 寬度上限 ② 日期列對比 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 寬螢幕不要把內容拉成一條');
ok('★★★ .dash-wrap 在 ≥1024 給寬度上限並置中',
   /@media\(min-width:1024px\)\{\s*\n\s*\.dash-wrap\{max-width:1180px;margin:0 auto;width:100%;\}/.test(src));
ok('★★ 只有教練首頁在用 .dash-wrap（加上限不會波及別頁）',
   (src.match(/class="dash-wrap"/g)||[]).length===1);
ok('★★ 理由寫在原地', /2000px 的螢幕上內容全擠在左邊、\s*\n\s*右半是空的/.test(src));

console.log('\n② 日期列看不見的真正原因：Ink 只換底色沒換字色');
ok('★★★ Ink 那條確實把 .cal-hero 的底壓平成米色（問題來源還在）',
   /body\.ink \.mc-card,body\.ink \.cal-hero,/.test(src)
   && /border-radius:var\(--radius-xs\);box-shadow:none;border:1px solid var\(--bd\);background:var\(--card\);\}/.test(src));
ok('★★★ 原本那組字色是為**綠底**寫的近白色（所以在米底上看不見）',
   /\.cal-hero\.cal-hero-week \.msb-date\{background:rgba\(255,255,255,\.08\);border-color:rgba\(255,255,255,\.14\);color:rgba\(244,241,232,\.82\);\}/.test(src));
ok('★★★ Ink 底下把整組字色改成墨色（底與字成對改）',
   /body\.ink \.cal-hero\.cal-hero-week \.msb-date\{background:#fff;border-color:var\(--bd\);color:var\(--t2\);\}/.test(src)
   && /body\.ink \.cal-hero\.cal-hero-week \.msb-date b\{color:var\(--text\);\}/.test(src)
   && /body\.ink \.cal-hero\.cal-hero-week \.msb-date \.cag-dn\{color:var\(--t3\);\}/.test(src));
ok('★★★ 標題與兩顆按鈕也一起（不然它們一樣是近白色）',
   /body\.ink \.cal-hero\.cal-hero-week \.mcal-t\{color:var\(--text\);\}/.test(src)
   && /body\.ink \.cal-hero\.cal-hero-week \.mcal-btn,\s*\n\s*body\.ink \.cal-hero\.cal-hero-week \.cag-thisweek\{/.test(src));
ok('★★★ 選到的那一天在米底上要有明確的實心（改成綠底白字）',
   /body\.ink \.cal-hero\.cal-hero-week \.msb-date\.on\{background:var\(--green\);border-color:var\(--green\);color:#fff;\}/.test(src));
ok('★★ 今天用金框標（與全站語彙一致）',
   /body\.ink \.cal-hero\.cal-hero-week \.msb-date\.hero-today\{border-color:var\(--gold,#B48A56\);\}/.test(src));
ok('★★★ 教訓寫在原地：只換底不換字（0821 頂欄字不見是同一個坑）',
   /顏色一定要成對改，只換底不換字就是這個下場（0821 頂欄字不見踩過同一個坑）/.test(src));
ok('★★ Ink 只在員工桌機開（手機版不吃這一層）',
   /function inkOn\(\)\{/.test(src) && /這一層改的是 \.cal-chip／\.btn／\.mc-nav 這些\*\*桌機與手機共用\*\*的 class/.test(src));

console.log('\n③ 兩張 KPI 卡收斂（桌機）');
ok('★★★ 桌機改成橫排一條（原本是置中直式大卡，一張佔半個螢幕只放一個數字）',
   /\.dash-wrap \.cds-card\{flex-direction:row;align-items:center;justify-content:flex-start;/.test(src)
   && /一張佔半個螢幕\s*\n\s*只為了放一個數字/.test(src));
ok('★★★ 值班那張是圓環版時仍維持直式（環要置中才好看）',
   /\.dash-wrap \.cds-card:has\(\.dr-wrap\)\{flex-direction:column;align-items:center;text-align:center;\}/.test(src));
ok('★★ 說明推到最右邊（橫排時它是附註，不該擠在數字旁邊）',
   /\.dash-wrap \.cds-card \.mc-kpi-rev-sub\{margin-left:auto;text-align:right;\}/.test(src));

console.log('\n④ 今日課程從圓圈攤成橫列（桌機）');
ok('★★★ 桌機一列一堂，圓圈留著當左邊的時間章',
   /\.dash-wrap \.task-dots\{flex-direction:column;flex-wrap:nowrap;gap:8px;\}/.test(src)
   && /\.dash-wrap \.task-dot-wrap\{flex-direction:row;width:100%;gap:12px;align-items:center;/.test(src));
ok('★★★ 右邊補上課種・場地與狀態（桌機才有空間放）',
   /const _tdSub=\[bookingTypeName\(b,typeMap\),/.test(src)
   && /<span class="task-dot-sub">\$\{escH\(_tdSub\)\}<\/span>/.test(src)
   && /<span class="task-dot-st">\$\{_tdSt\}<\/span>/.test(src));
ok('★★★ 手機維持圓圈，多帶的兩段不畫（那一版是為手機設計的）',
   /\.dash-wrap \.task-dot-sub,\.dash-wrap \.task-dot-st\{display:none;\}/.test(src));
/* 2026-09-09 二修（使用者：「今日任務也還是維持圓形課卡　我記得要改?」）——
   第一版整組沒生效：.task-dots／.cds-card 的原始定義寫在那一段**後面**，
   而 media query 不會增加權重，同權重時後面的贏。 */
ok('★★★ 桌機那一組全部加 .dash-wrap 前綴把權重墊高（media query 不加權重）',
   /\.dash-wrap \.task-dots\{flex-direction:column;/.test(src)
   && /\.dash-wrap \.cds-card\{flex-direction:row;/.test(src)
   && /media query \*\*不會增加權重\*\*：同權重時後面的贏，所以第一版整組沒有生效/.test(src));
ok('★★ .dash-wrap 只有教練首頁在用，加前綴不會波及別頁',
   (src.match(/class="dash-wrap"/g)||[]).length===1);
ok('★★ 桌機那一段把它們打開', /\.dash-wrap \.task-dot-sub\{display:block;color:var\(--t3\);/.test(src));
ok('★★ 場地名稱有跳脫（它會被組進 HTML）', /escH\(_tdSub\)/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
