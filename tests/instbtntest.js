/* 2026-08-14 使用者指示（附截圖）：「繳費第二期的按鈕可以設計在這邊嗎 操作比較直覺」
   —— 分期票券卡（會員資料票券分頁）直接放「💰 繳第 N 期・$金額」鈕，點開既有的 openInstallNext。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
ok('★★ 票券卡上有繳下期鈕（限櫃檯、usable、分期且還有未開通期數）',
   /t\.installment&&typeof t\.installment==='object'&&\(t\.installment\.current\|\|1\)<t\.installment\.count/.test(src)
   && /onclick="openInstallNext\('\$\{t\.id\}'\)">💰 繳第 \$\{_cur\+1\} 期/.test(src));
ok('★ 鈕上帶期數與應收金額（amounts\[current\]）',
   /const _amt=Number\(\(t\.installment\.amounts\|\|\[\]\)\[_cur\]\)\|\|0;/.test(src));
ok('★ 走既有的 openInstallNext（收款→解鎖→保留課自動補綁，不另做一套）',
   /async function openInstallNext\(ticket_id\)\{/.test(src));
console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
