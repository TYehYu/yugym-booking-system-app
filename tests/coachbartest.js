/* 課卡左色條改成教練色（2026-10-18 使用者看過四種對照後：「改Ｃ」）

   四種方案並排給使用者挑：
     A 現在（底色＝課別）
     B 底色＝教練色      → 團課與教練課變成同一個顏色，而且 9 位教練的淡色分不開
     C 底色課別＋左條教練 → **選這個**
     D 課別浮水印         → 真實寬度（約 95px）下會壓在名字上

   做法：卡片 inline 設 --coach-bar，左色條 background 用 var() 接回課程色當預設。
   沒有教練（自主訓練、場租）、遮蔽身分、首頁今日教練課卡（.tcard-std）都不設，
   行為完全不變 —— 不必為它們另外寫規則。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 左色條吃 --coach-bar，預設仍是課程色');
ok('★★★ 一般課卡的左色條',
   /\.tcard\.tcard-std \.tcard-body::before\{[^}]*background:var\(--coach-bar, var\(--course-accent,#3D7039\)\); \}/.test(src));
ok('★★★ 運動按摩那條也要吃（它本來寫死色碼）',
   /\.tcard\.tcard-std\.course-massage \.tcard-body::before\{ background:var\(--coach-bar,#2f8f83\); \}/.test(src));
/* ⚠ Ink 視覺層另有一條同樣的規則、權重更高 —— 只改上面那條，開 Ink 的人看不到變化。
   這是 yugym-ink-override-trap 記過的坑，釘住。 */
ok('★★★ Ink 視覺層那條也要吃',
   /body\.ink \.cal-ev\.cal-ev-std \.evc-body::before\{width:3px;border-radius:0;\s*\n\s*background:var\(--coach-bar, var\(--course-accent,#3D7039\)\);\}/.test(src));
ok('★★ 不可以有任何一條左色條還寫死 --course-accent',
   !/evc-body::before\{[^}]*background:var\(--course-accent/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));

console.log('\n② 什麼時候才帶教練色');
ok('★★★ 有教練、沒被遮蔽才設 --coach-bar',
   /const _coachBarVar = \(!hideMember && _coachObj && _cc && _cc\.fg\)\s*\n?\s*\? `--coach-bar:\$\{_cc\.bg\};--co-bg:\$\{_cc\.bg\};--co-fg:\$\{_cc\.fg\};` : '';/.test(src));
ok('★★★ 真的寫進課卡的 style',
   /style="\$\{_coachBarVar\}\$\{useFixedLane\?dayLaneStyle:/.test(src));
/* ══ 2026-10-26 推翻 1018 的「色條用 fg」════════════════════════════════
   換成使用者自己的 Excel 配色之後，**RANDY 與 MANGO 共用同一個藍（#2452A2）、
   SANDY 與 BARRY 共用同一個綠（#35714E）**，差別只在誰當底誰當字。
   色條只有一個顏色：吃 fg 的話那兩對會變成一模一樣的深藍／深綠，完全分不出來。
   改吃 bg（淡藍 vs 深藍、淡綠 vs 深綠），靠深淺分。
   ⚠ 膠囊與 B 面底色另外用 --co-bg／--co-fg 那一對，兩者都要帶。 */
ok('★★★ 色條改吃 bg（同色相的兩位要靠深淺分）',
   /--coach-bar:\$\{_cc\.bg\}/.test(src) && !/--coach-bar:\$\{_cc\.fg\}/.test(src));
ok('★★★ 膠囊與 B 面底色拿到成對的 --co-bg／--co-fg',
   /--co-bg:\$\{_cc\.bg\};--co-fg:\$\{_cc\.fg\};/.test(src));
ok('　　理由寫在原地（為什麼不能再用 fg）',
   /那樣 RANDY 與 MANGO 會變成同一條深藍/.test(src));
/* 首頁今日教練課卡共用同一套 CSS，但那一頁整欄都是同一位教練，標教練色沒有意義。
   它不設變數就自動維持原樣 —— 這一條確認沒有人順手也加上去。 */
ok('★★ 首頁今日教練課卡沒有被一起改（不設變數＝維持課程色）',
   !/tcard[\s\S]{0,400}--coach-bar:/.test(src));

console.log('\n③ 教練色的來源沒有被動到');
ok('★★★ 九位教練的指定色還在',
   (src.match(/\/\/ (Randy|Sandy|Mango|Barry|Zoe|Ann|Rocky|小曾|Eric) /g)||[]).length>=9);
ok('★★ 無教練時 coachTagColor 回中性灰（自主訓練不會被染色）',
   /if\(!id\) return \{bg:'#EAE6DE',fg:'#6a655c'\};/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
