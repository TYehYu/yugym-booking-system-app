/* 合約列印自動收進兩頁（2026-09-07 使用者回報：蘇月華的紙本印成三頁）。

   0729 與 0731 各手調過一次字級與邊界，兩次都在「內容再長一點」時又變回三頁 ——
   合約長度本來就會變：分期 3 期的購買內容表比不分期多 4 列、方案名稱長短也差一行。
   蘇月華 CT-mtpvegfdwnzy 就是分期那一種（fill_snapshot 10 列 ＋ 本文 58 行）。

   改成量完再決定：載入後量 .ct-flow 實際高度，超過兩頁就把 --ct-fit 一格一格調小。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const CSS=src.slice(src.indexOf('const CT_PRINT_CSS=`'), src.indexOf('/* 真正產出 PDF 檔'));
const JSB=src.slice(src.indexOf('const CT_PDF_JS=`'), src.indexOf('function ctPrintOpen('));

console.log('① 版面尺寸真的跟著 --ct-fit 走');
ok('★★ 有預設值（內容本來就夠短時，外觀跟以前一樣）', /html\{--ct-fit:1;\}/.test(CSS));
ok('★★ 字級跟著縮，但縮得慢（0.6+0.4×fit，fit=0.7 時還有 8.8pt）',
   /font-size:calc\(10pt \* \(0\.6 \+ 0\.4 \* var\(--ct-fit\)\)\)/.test(CSS));
ok('★★ 行高不能直接乘 —— 字級已經在縮了，乘兩次會擠成一團',
   /line-height:calc\(1\.2 \+ 0\.35 \* var\(--ct-fit\)\)/.test(CSS));
ok('★★ 留白直接乘（縮得快）：表格內距、簽名區間距、簽名線高度',
   /padding:calc\(5pt \* var\(--ct-fit\)\) calc\(7pt \* var\(--ct-fit\)\)/.test(CSS)
   && /margin-top:calc\(8mm \* var\(--ct-fit\)\)/.test(CSS)
   && /height:calc\(10mm \* var\(--ct-fit\)\)/.test(CSS));
ok('★  已簽名的圖也跟著縮（不然簽名區自己就吃掉一大塊）',
   /max-height:calc\(22mm \* var\(--ct-fit\)\)/.test(CSS));

console.log('\n② 量得到、也收得動');
ok('★★ 內容包了一層 .ct-flow 才量得準（.ct-page 螢幕版有 min-height:297mm）',
   /<div class="ct-page"><div class="ct-flow">\$\{inner\}<\/div><\/div>/.test(src)
   && /querySelector\('\.ct-flow'\)/.test(JSB));
ok('★★ 用探針換算 px/mm（不同 DPI、不同縮放都要對）',
   /height:100mm/.test(JSB) && /pxPerMm=probe\.getBoundingClientRect\(\)\.height\/100/.test(JSB));
ok('★★ 預算取比較嚴的那一個（PDF 的 263mm，不是列印的 267mm）',
   /budget=CONTENT_H\*2\*pxPerMm/.test(JSB));
ok('★★ 每次重量都從 1 開始（不然重印會愈縮愈小）',
   /document\.documentElement\.style\.setProperty\('--ct-fit','1'\);[\s\S]{0,80}for\(var i=0/.test(JSB));
ok('★★ 有下限 0.62 —— 再小就不好簽名了，寧可三頁也不要印出看不清楚的合約',
   /if\(fit<0\.62\)/.test(JSB) && /下限 0\.62/.test(JSB));
ok('★★ 迴圈有上限，不會卡死', /for\(var i=0;i<20;i\+\+\)/.test(JSB));

console.log('\n③ 三個時機都會重量（字型晚到是最常見的失準來源）');
ok('★★ 開窗當下', /ctFitLater\(\);/.test(JSB));
ok('★★ 字型載入完', /document\.fonts\.ready\.then/.test(JSB));
ok('★★ 按下列印前', /addEventListener\('beforeprint'/.test(JSB));
ok('★★ 下載 PDF 拍照前（那時寬度會被改成 CONTENT_W）',
   /pg\.style\.width=CONTENT_W\+'mm'[\s\S]{0,400}try\{ ctFitPages\(\); \}catch\(e\)\{\}/.test(src));

console.log('\n④ 每一個 catch 都不能讓列印視窗開不起來');
ok('★★ 收頁失敗只是版面沒收，不能擋住列印',
   (JSB.match(/try\{ ctFitPages\(\); \}catch\(e\)\{\}/g)||[]).length>=3);

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
