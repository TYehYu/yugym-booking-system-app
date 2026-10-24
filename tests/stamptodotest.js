/* 出席章：空心圈退場、改成浮水印（2026-10-25）

   ── 這支原本在守什麼 ──────────────────────────────────────────────
   2026-10-09 使用者：「課卡左上角出席章　在沒有出席情況下可以顯示一個圓圈嗎
   有顯示的時候才填滿章」，接著「包含首頁的課卡也這樣處理」，
   理由是「閱讀的時候卡片的規格會統一」。
   當時的問題是：沒簽到＝什麼都不畫，掃一排卡片要靠「缺了一塊」辨認，很容易漏。

   ── 為什麼 1025 推翻 ──────────────────────────────────────────────
   使用者：「出席章可以改成浮水印在卡片中間嗎　這樣卡片資訊可以釋放一點空間」。
   角章跟姓名搶同一列：實測 56px 的卡「劉忠緯」被切成「劉忠…」、
   72px 的「李嘉芳」折成兩行。改成卡片中央的大字浮水印之後，整列都讓給名字。
   那個空心圈也就沒有存在的理由了 —— 浮水印夠大，有／沒有一眼分得出來，
   使用者同日定案：「沒簽到就不使用浮水印了」。

   ⚠ 首頁課卡（.tcard-todo）**刻意沒有跟著改**：使用者這次只講行事曆。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 空心圈整組退場');
ok('★★★ 行事曆不再有任何 .evc-todo（markup 與 CSS 都沒了）',
   src.indexOf('evc-todo')<0);
ok('★★ 沒簽到就是空字串，不畫任何東西',
   /: '';   \/\* 沒簽到＝沒有浮水印（1025 定案，空心圈退場）/.test(src));
ok('★★ 退場理由寫在原地（下一個人不要又把它加回來）',
   /〔已退場〕未簽到的空心圈（2026-10-09 加，2026-10-25 拿掉）/.test(src));
ok('★★ 「章與 ❗ 在 40px 以下會撞」那條也退場（浮水印不佔那塊位子）',
   /〔已退場，2026-10-25〕這一條在解「章與 ❗ 在 40px 以下會撞」/.test(src)
   && !/:has\(\.ev-payalert\) \.evc-check/.test(src));

console.log('\n② 四種狀態改畫浮水印');
ok('★★★ 四種都還在，而且順序沒變（停 → 假 → 未 → 簽）',
   /const _wmKind = _closedDay \? 'stop'/.test(src)
   && /_allLeave \? 'leave'/.test(src)
   && /\{stop:'停', leave:'假', noshow:'未', ok:'簽'\}/.test(src));
ok('★★★ 浮水印畫在 .evc-txt 之前（壓在文字底下）',
   /\$\{_wmOut\}<div class="evc-txt">/.test(src));
ok('★★ z-index 0、不吃滑鼠（點得到底下的卡片）',
   /\.cal-ev\.cal-ev-std \.evc-wm\{position:absolute;inset:0;z-index:0;pointer-events:none;/.test(src));
ok('★★ 顏色沿用角章時代的語意（簽綠／假紅／未金／停墨）',
   /\.evc-wm\.wm-leave\{color:var\(--danger,#b5372e\)/.test(src)
   && /\.evc-wm\.wm-noshow\{color:var\(--gold-d,#9a6a1e\)/.test(src)
   && /\.evc-wm\.wm-stop\{color:#14120E/.test(src));
ok('★★ 透明度壓低（它是狀態，不是裝飾）',
   /opacity:\.13;\}/.test(src) && /壓過名字就本末倒置/.test(src));
ok('★ 字級跟著卡片走，不是寫死（窄卡字太大會糊）',
   /font-size:clamp\(22px,58cqh,42px\)/.test(src));

console.log('\n③ _stampOut 留著只為了跟 NEW 互斥');
ok('★★ NEW 與出席章仍然互斥（0904 使用者：「新跟簽不用同時出現」）',
   /const _newOut = \(_isNewToday && !_stampOut\)/.test(src));
ok('★ 它不再進 DOM（畫出來的是 _wmOut）',
   /_stampOut 留著只為了「有沒有出席章」這個判斷/.test(src)
   && !/\$\{_stampOut\}/.test(src));

console.log('\n④ 首頁課卡刻意不動');
ok('★★ .tcard-todo 還在（那是另一張卡）', /\.tcard-todo\{/.test(src));
ok('★ 原因寫在原地', /首頁課卡（\.tcard-todo）\*\*沒有跟著改\*\*/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
