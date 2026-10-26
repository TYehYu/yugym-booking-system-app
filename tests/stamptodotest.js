/* 出席章：空心圈退場（2026-10-25）、章回到第一列最左邊（2026-10-26）

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

   ── 1026 再修一次 ────────────────────────────────────────────────
   使用者：「出席章可以改回第一列左邊第一格嗎」。浮水印整組退場 ——
   第一列現在是**專門給標記用的**（友善、警示都在那裡），章放進去碰不到姓名，
   1025 改浮水印的理由（章跟姓名搶同一列）已經不成立。
   空心圈**沒有跟著回來**：那是角章時代的東西，1025 的退場理由仍然有效。
   順帶：浮水印沒了，姓名的「同底色光暈」也拿掉（使用者：「這樣名字就不用螢光了」）。

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
/* ⚠ 2026-10-27 又搬了一次：使用者「出席章改到卡片右上角　時間的右邊
   卡片左上角就只剩下標籤　友善＋體驗＋團課(新增）」。
   第一列從此是：左半＝標籤（含 NEW）、右半＝時間 → 章。 */
ok('★★★ 章畫在第一列**最後面**（時間的右邊＝卡片右上角）',
   /<span class="evc-r1">\$\{_friOut\}\$\{_stdTag\}\$\{_newOut\}<span class="evc-rr"><b class="evc-hm">\$\{b\.start_time\}<\/b>\$\{_wmOut\}<\/span><\/span>/.test(src));
ok('★★★ 畫出來的是圓章不是浮水印（.evc-wm 整組退場）',
   /<i class="evc-check\$\{_chkCls\}"/.test(src) && !/class="evc-wm/.test(src));
ok('★★ 15px 圓章（第一列就是 15px 高，再大會把那一列撐高）',
   /\.cal-ev\.cal-ev-std \.evc-r1 \.evc-check\{[\s\S]{0,200}width:15px;height:15px;border-radius:999px/.test(src));
ok('★★★ 不是斜體（它是 <i>，不寫就會斜）',
   /\.cal-ev\.cal-ev-std \.evc-r1 \.evc-check\{[\s\S]{0,260}font-style:normal;/.test(src));
ok('★★ 顏色沿用角章時代的語意（簽綠／假紅／未金／停墨）',
   /\.evc-r1 \.evc-check\.evc-leave\{background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.evc-r1 \.evc-check\.evc-noshow\{background:var\(--gold-d,#9a6a1e\);\}/.test(src)
   && /\.evc-r1 \.evc-check\.evc-stop\{background:#3A362F;\}/.test(src));
ok('★★ 浮水印的退場理由寫在原地（不要再改回去）',
   /〔已退場〕浮水印（2026-10-25 加，2026-10-26 拿掉）/.test(src));
ok('★★★ 姓名的光暈也跟著拿掉（背後沒東西要擋了）',
   !/text-shadow:0 0 4px var\(--course-soft\)/.test(src));
/* ⚠ 第一列原本是 space-between（只有兩項：友善靠左、警示靠右）。章進來變三項，
   space-between 會把友善推到中間，所以改靠左排＋警示用 margin-left:auto。 */
ok('★★★ 第一列靠左排，右半（時間＋章）包成 .evc-rr 一起靠右',
   /\.cal-ev\.cal-ev-std \.evc-r1\{display:flex;align-items:center;justify-content:flex-start;/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-r1 \.evc-rr\{margin-left:auto;/.test(src)
   && !/\.cal-ev\.cal-ev-std \.evc-r1 \.ev-payalert\{margin-left:auto;\}/.test(src));
ok('★★★ 時間收起來時章仍然靠右（.evc-rr 的存在理由）',
   !/\.evc-r1 \.evc-hm\{flex:none;margin-left:auto;/.test(src));
ok('★★ 警示改成絕對定位的左下角（1027 使用者：「警示三角形可以改到左下角嗎？右上角讓給時間」）',
   /\.cal-ev\.cal-ev-std \.ev-payalert\{top:auto;right:auto;left:5px;bottom:3px;\}/.test(src));

console.log('\n③ _stampOut 留著只為了跟 NEW 互斥');
ok('★★ NEW 與出席章仍然互斥（0904 使用者：「新跟簽不用同時出現」）',
   /const _newOut = \(_isNewToday && !_stampOut\)/.test(src));
ok('★ 它不再進 DOM（畫出來的是 _wmOut 那顆章）',
   /_stampOut 留著只為了「有沒有出席章」這個判斷/.test(src)
   && !/\$\{_stampOut\}/.test(src));

console.log('\n④ 首頁課卡刻意不動');
ok('★★ .tcard-todo 還在（那是另一張卡）', /\.tcard-todo\{/.test(src));
ok('★ 原因寫在原地', /首頁課卡（\.tcard-todo）\*\*沒有跟著改\*\*/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
