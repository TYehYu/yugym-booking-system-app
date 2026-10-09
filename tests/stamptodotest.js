/* 未簽到也要有一個位子（2026-10-09 使用者：「課卡左上角出席章　在沒有出席情況下
   可以顯示一個圓圈嗎　有顯示的時候才填滿章」，接著「包含首頁的課卡也這樣處理」，
   理由是「閱讀的時候卡片的規格會統一」）。

   原本「沒簽到」＝什麼都不畫，掃一排卡片要靠「缺了一塊」辨認，很容易漏。
   改成一律留一個位子：沒簽到是空心圈，簽到了才是填滿的章。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 行事曆課卡');
ok('★★★ 沒有任何章時畫 .evc-todo',
   /: \(\(!hideMember && b\.status!=='cancelled'\) \? `<span class="evc-todo" title="未簽到"><\/span>` : ''\);/.test(src));
/* ⚠⚠ 不能叫 .evc-check：好幾條 :has(.evc-check) 在窄卡上靠「有沒有章」決定要不要藏時間 */
ok('★★★ class 不是 .evc-check（否則窄卡會一律把時間藏掉）',
   /:has\(\.evc-check\) \.evc-hm\{display:none;\}/.test(src)
   && !/<span class="evc-check" title="未簽到">/.test(src));
ok('★★★ 與章同位置同尺寸、只是空心',
   /\.cal-ev\.cal-ev-std \.evc-todo\{ position:absolute; left:9px; top:4px;\s*\n\s*width:16px; height:16px; border-radius:999px; box-sizing:border-box;\s*\n\s*border:1\.5px solid currentColor; opacity:\.34; background:transparent; z-index:3; \}/.test(src));
ok('★★ 窄卡跟著縮（與章同一組門檻）',
   /\.cal-ev\.cal-ev-std \.evc-todo\{width:14px;height:14px;left:7px;border-width:1\.2px;\}/.test(src));
/* 41px 以下有 ❗ 時讓章退，空心圈更該退（它是還沒發生的事） */
ok('★★★ 最窄又有 ❗ 時，章與空心圈一起退',
   /:has\(\.ev-payalert\) \.evc-check,\s*\n\s*\.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-todo\{display:none;\}/.test(src));
ok('★★ 取消的課不畫（那一張不談出席）', /b\.status!=='cancelled'\) \? `<span class="evc-todo"/.test(src));

console.log('\n② 首頁課卡（同一套）');
ok('★★★ 沒有章時畫 .tcard-todo',
   /:\(k==='cancel'\?'':'<span class="tcard-todo" title="未簽到"><\/span>'\);/.test(src));
ok('★★★ 與 .tcard-chk 同尺寸，三欄版一起放大',
   /\.tcard-todo\{flex:none;width:16px;height:16px;border-radius:999px;box-sizing:border-box;/.test(src)
   && /\.tcard-3c \.tcard-todo\{width:22px;height:22px;border-width:1\.8px;\}/.test(src)
   && /\.tcard-3c \.tcard-chk\{position:static;margin:0;width:22px;height:22px;/.test(src));
ok('★★ 取消的課不畫（右下角本來就有「刪」角標）',
   /\.tcard-del\{position:absolute;bottom:0;right:0;/.test(src));

console.log('\n③ 原本的章一個都沒動');
ok('★★★ 行事曆：假／未／簽三種照舊',
   /<span class="evc-check evc-leave" title="全員請假">假<\/span>/.test(src)
   && /<span class="evc-check evc-noshow" title="未到課">未<\/span>/.test(src)
   && /<span class="evc-check" title="\$\{\(_isMakeup&&!_isCheckedIn\)\?'補簽':'已完成'\}">簽<\/span>/.test(src));
ok('★★★ 首頁：假／未／簽三種照舊',
   /'<span class="tcard-chk tcard-chk-leave">假<\/span>'/.test(src)
   && /'<span class="tcard-chk tcard-chk-ns">未<\/span>'/.test(src)
   && /'<span class="tcard-chk">簽<\/span>'/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
