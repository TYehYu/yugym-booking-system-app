/* 兩張視窗的版面收斂（2026-09-07 使用者兩則指示）：
   ①「新增團體課·步驟2的視窗　內容收斂一下　好雜亂」
   ②「教練課簽約的視窗　也收斂一下　一列兩個方案　下方返回跟確認凍結顯示在視窗下方」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 團課步驟 2：說明收起來，不是刪掉');
ok('★★ 六條規則收進 <details>，預設收合',
   /<details class="tipfold"><summary>名單怎麼選？（六條規則）<\/summary>/.test(src)
   && !/<details class="tipfold" open>/.test(src));
ok('★★★ 六條一條都沒少（新來的櫃檯還是要看得到）',
   ['名單可以<b>現在選</b>','只列<b>有團體課票券</b>的會員','加入扣 1 堂、移除退回',
    '票券設了使用人會<b>分開一列</b>','同一位要<b>再加一個名額</b>按「＋」',
    '手上有多張票時，點下面的圓形卡選要扣哪一張'].every(t=>src.includes(t)));
ok('★★ .tipfold 有 ＋／− 的開合標記（沿用 .bam-guest 的語彙）',
   /\.tipfold>summary::before\{content:'＋ '/.test(src)
   && /\.tipfold\[open\]>summary::before\{content:'− ';\}/.test(src));
ok('★  人數上限那句副標拿掉（欄位本身就有上下限）',
   !/預設 5 人，場地有餘裕可放寬<\/span><\/div>\s*\n\s*<div style="margin-top:4px;">/.test(src));
ok('★  標籤裡的廢話拿掉（有勾選框就看得出來可以複選）',
   !/<label>加入會員（點選即可複選）<\/label>/.test(src));

console.log('\n② 簽約視窗：一列兩張方案');
ok('★★ .modal-wide 的方案矩陣改成兩欄',
   /\.modal-wide \.gt-matrix-row\{display:grid;grid-template-columns:repeat\(2,1fr\)/.test(src));
ok('★  窄視窗（非 modal-wide）維持橫向捲，沒被改到',
   /\.gt-matrix-row\{display:flex;gap:8px;overflow-x:auto;/.test(src));

console.log('\n③ 簽約視窗：底列凍結在下方');
ok('★★ 只給那張視窗的步驟底列，不動全站 .modal-foot',
   /\.modal-wide \.gt-step>\.modal-foot\{/.test(src)
   && /position:sticky;bottom:0;z-index:3;/.test(src));
ok('★★★ 全站的 .modal-foot 沒有被改成 sticky（那會一次改掉幾十個視窗）',
   /\.modal-foot\{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;\}/.test(src));
ok('★★ 負邊距用 --mpad，不寫死 —— 內距有三種尺寸',
   /margin:18px calc\(var\(--mpad,26px\) \* -1\) calc\(var\(--mpad,26px\) \* -1\);/.test(src)
   && /padding:16px var\(--mpad,26px\) var\(--mpad,26px\);/.test(src));
ok('★★★ 三處 .modal 都要有 --mpad（少一處那個尺寸就會露出縫隙）',
   /\.modal\{--mpad:26px;/.test(src) && /\.modal\{--mpad:18px;/.test(src) && /\.modal\{--mpad:22px;/.test(src));
ok('★★ 三處的 padding 都改成吃變數（寫死的話變數就只是裝飾）',
   (src.match(/padding:var\(--mpad\)/g)||[]).length===3);
/* 2026-09-08 使用者：「移除背景列　兩個按鈕像浮動按鈕」——
   實心底列退場，改成底部一段漸層淡出（見 tests/footbtntest.js）。
   「捲動的內容不能直接頂到按鈕」這件事沒有變，只是換了做法。 */
ok('★  內容不會直接頂到按鈕（實心列 → 底部漸層淡出）',
   /background:linear-gradient\(to bottom, rgba\(0,0,0,0\) 0%, var\(--surface-3\) 55%\);/.test(src)
   && !/\.modal-wide \.gt-step>\.modal-foot\{[\s\S]{0,320}background:var\(--surface-3\);\s*\n\s*border-top/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
