/* 2026-08-14 使用者指示（附截圖）：「繳費第二期的按鈕可以設計在這邊嗎 操作比較直覺」
   —— 分期票券卡（會員資料票券分頁）直接放「繳第 N 期・$金額」鈕，點開既有的 openInstallNext。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
/* 2026-08-14 二修（使用者指示：「不要預設期數——一次全繳或只繳兩堂都有」）：
   鈕改「分期繳費」，視窗內有下一期/剩餘全繳快速鍵＋自訂堂數金額。 */
ok('★★ 票券卡上有分期繳費鈕（限櫃檯、usable、分期且還有未開通期數）',
   /t\.installment&&typeof t\.installment==='object'&&\(t\.installment\.current\|\|1\)<t\.installment\.count/.test(src)
   && /onclick="openInstallNext\('\$\{t\.id\}'\)">分期繳費<\/button>/.test(src));
ok('★★ 視窗有「下一期」「剩餘全繳」快速鍵＋自訂堂數/金額輸入',
   /onclick="inxFill\(\$\{seg\},\$\{amt\}\)">下一期/.test(src)
   && /onclick="inxFill\(\$\{leftN\},\$\{restAmt\}\)">剩餘全繳/.test(src)
   && /id="inx-n" min="1" max="\$\{leftN\}"/.test(src) && /id="inx-amt"/.test(src));
ok('★★ 確認吃輸入值：堂數夾 1–剩餘、金額必填；期數進度依累計堂數重算、全開通＝最後一期',
   /if\(!Number\.isFinite\(n\)\|\|n<1\|\|n>leftN\)/.test(src)
   && /\(inst\.segments\|\|\[\]\)\.forEach\(\(sg,i\)=>\{ cum\+=\(Number\(sg\)\|\|0\);/.test(src)
   && /if\(t\.unlocked_sessions>=total\)\{ t\.unlocked_sessions=total; inst\.current=inst\.count; \}/.test(src));
ok('★ 走既有的 openInstallNext（收款→解鎖→保留課自動補綁，不另做一套）',
   /async function openInstallNext\(ticket_id\)\{/.test(src));
console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
