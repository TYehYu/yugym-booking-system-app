/* 舊系統匯入、沒有逐堂日期的那幾格 → 圓形卡寫「舊」（2026-10-31 使用者指示）

   使用者：「1的打勾都幫我統一改成［舊］ 標示為舊系統的意思」

   ⚠ 這不是美化，是**把話講對**：打勾看起來像「這堂有紀錄、只是沒顯示」，
     但那幾堂的日期**在舊系統裡本來就不存在**。
     證據不是推測 —— 舊系統的匯出檔 docs/import-0727/pkg_benefits.json
     自己就有一個 `used_nodate` 欄位，數字與程式算出來的 _ghost 完全對得上：
       陳敏慧 16、胡嘉珍 10、張舒淩 6、古欣巧 4、侯玟卉 3、洪毓敏 3、陳怡臻 1
     所以「補上日期」這件事做不到，只能誠實標示它是舊的。

   ⚠ 堂數本身是對的：剩餘、已用都對，缺的只有「哪一天上的」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 沒課卡又沒補日期 → 寫「舊」');
ok('★★★ 退路是「舊」不是「✓」',
   /\$\{_shBody\(b, b\?md\(b\):\(_md\?md\(\{date:_md\}\):'舊'\)\)\}/.test(src));
ok('★★★ 判準寫成一個變數，而且只在「沒課卡且沒補登日期」時才成立',
   /const _oldMark=\(!b && !_md\);/.test(src));
ok('★★  掛上 mtk-old 讓樣式分得開', /\$\{_oldMark\?' mtk-old':''\}/.test(src));

console.log('\n② 補登過日期的不受影響');
ok('★★★ _md 有值就印日期（那是人刻意寫上去的更正，優先序最高）',
   /_md\?md\(\{date:_md\}\)/.test(src)
   && /管理員手動補登的 _mu 優先：那是人刻意寫上去的更正/.test(src));
ok('★★  有課卡的照樣印課卡日期', /b\?md\(b\):/.test(src));

console.log('\n③ 滑過去說得出為什麼');
ok('★★★ tooltip 寫明是舊系統、而且堂數是對的',
   /舊系統匯入，沒有逐堂日期（堂數是對的）/.test(src));
ok('★★  可以補登時順便告訴他點得下去',
   /點一下可以補登日期/.test(src));

console.log('\n④ 樣式：是說明不是資料，不要跟日期搶');
ok('★★ 字淡一階、字級收小（中文方塊字在 35px 的圓裡 11px 太擠）',
   /\.mtk-old\{font-size:10\.5px;font-weight:700;letter-spacing:0;opacity:\.78;\}/.test(src));
ok('★★ 實心底色與課種色沒有被動到（那一格確實是「已用」）',
   /\.mtk\{position:relative;width:35px;height:35px;[\s\S]{0,200}?background:var\(--tk-acc,#1F6F54\);\}/.test(src));

console.log('\n⑤ 別的狀態的 ✓ 退路不要一起改');
/* _eatBody（取消未退）與 _clxDot（教練請假）也有 b?md(b):'✓' 的退路，
   但那兩種一定有課卡，實際不會印出 ✓ —— 改了只是製造混淆。 */
ok('★★★ 取消未退那一處維持原樣', /\$\{_eatBody\(b, b\?md\(b\):'✓'\)\}/.test(src));
ok('★★★ 教練請假那一處維持原樣', /\$\{_lvBody\(b, b\?md\(b\):'✓'\)\}/.test(src));

console.log('\n⑥ 為什麼只能標示、不能補日期 —— 理由留在程式裡');
ok('★★★ 寫明舊檔自己就有 used_nodate 欄位（不是我們遷移時弄丟的）',
   /used_nodate/.test(src) && /日期在舊系統裡就不存在/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
