/* 教練桌機首頁優化（2026-09-09 使用者：「教練的桌機首頁　版面有什麼優化建議嗎」
   →「照你建議做」→「先做1、2」）：① 寬度上限 ② 日期列對比 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 寬螢幕不要把內容拉成一條');
ok('★★★ .dash-wrap 在 ≥1024 給寬度上限並置中',
   /@media\(min-width:1024px\)\{ \.dash-wrap\{max-width:1180px;margin:0 auto;width:100%;\} \}/.test(src));
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

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
