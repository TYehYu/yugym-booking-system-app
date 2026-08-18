/* 電子合約連簽（2026-08-18 陳秀蘭案例）：
   一次簽兩張，第二張從「我的合約」點進去是唯讀畫面、沒有簽名區，被迫重新從 LINE 登入。
   修正：① 清單裡「未簽的遠端合約」點下去直接進簽署畫面 ② 簽完一份，還有待簽的就問要不要接著簽。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

ok('① 我的合約清單：未簽遠端合約 → 簽署畫面（不是唯讀檢視）',
  src.includes(`onclick="\${(c.sign_type==='remote'&&!c.signed_at)?'closeModal();memSignContract':'openContractView'}('\${c.id}')"`));
ok('　　清單副標提示「點此簽署」', src.includes('尚未簽名・點此簽署'));
ok('② 簽完一份 → 還有待簽就跳「繼續簽署」',
  /還有 \$\{rest\.length\} 份合約待簽名/.test(src) && /memSignContract\('\$\{rest\[0\]\.id\}'\)/.test(src));
ok('　　只找自己的、未簽的遠端合約',
  src.includes(`c.sign_type==='remote'&&!c.signed_at&&c.id!==id&&c.member_id===SESSION.id`));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
