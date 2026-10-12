/* 折抵券張數上限 ——「每 4 堂 1 張」（2026-10-12 使用者定版）

   使用者原話：「一次付清無使用張數限制　分3期 一期用一張也就是4堂可以用一張…
   如果是常態方案8堂優惠方案 因為不得分期所以只能一次付清也是無使用張數限制
   所以自訂方案的話課堂必須至少4堂才可以使用一張」

   這一條把過去兩條各自為政的規則收成同一個算式：
     ・0830 的「教練課一次最多 3 張」 ＝ 常態 12 堂 ÷ 4
     ・0729 的「分期一期 1 張」       ＝ 每期 4 堂 ÷ 4
   所以常態方案的行為一格沒變；真正被補上的是**自訂方案**
   —— 以前 1 堂也能折 3 張，$600 的方案折到 $0 還白燒一張。

   ⚠ 運動按摩折抵券維持不設限：它的方案本來就是一堂一張，套 ÷4 等於整個不能用
     （$1,500 折到剩 $300 是 0830 使用者確認過的預期行為）。
   ⚠ 這一支盯的重點仍是**上限只有一份**：畫面與送出各寫各的，
     櫃檯在畫面上被擋住、送出那關沒擋，等於完全沒擋。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 規則寫在原地');
{
  ok('★★★ 上限收成一支，四個呼叫端共用（不會有幾套數字）',
     /function voucherCapOf\(vt, sessions\)\{/.test(src)
     && /const cap=voucherCapOf\(vt,_segN\);/.test(src)
     && /const _vCap = voucherCapOf\(window\._gtVoucherTt, isInstall\?\(Number\(segs\[0\]\)\|\|0\):total\);/.test(src)
     && /const _vCap2 = voucherCapOf\(window\._grVoucherTt, isInstall\?\(Number\(segs\[0\]\)\|\|0\):total\);/.test(src)
     && /const byS=voucherCapOf\(window\._inxVoucherTt, n\);/.test(src));
  ok('★★★ 每 4 堂 1 張，常數只有一份', /const VOUCHER_SESSIONS_PER=4;/.test(src)
     && /Math\.floor\(\(Number\(sessions\)\|\|0\)\/VOUCHER_SESSIONS_PER\)/.test(src));
  ok('★★★ 只有教練課券套這條，運動按摩不限',
     /if\(vt!=='tt-discount-pt300'\) return Infinity;/.test(src));
  ok('★★ 看的是「這一次付錢換到幾堂」：一次付清＝總堂數、分期＝這一期的堂數',
     /const _segN=isInst\?\(\(splitSessions\(_tot,inst\)\|\|\[\]\)\[0\]\|\|0\):_tot;/.test(src));
  ok('★★ 送出那關仍然自己夾一次（不信任畫面傳來的值）',
     /Number\(window\._gtVoucherMax\)\|\|0, _vCap\)\);/.test(src));
  /* 2026-10-12 二修（使用者：「這邊也不用寫的那麼詳細」）——
     籤上只留結論「最多 N 張」，「為什麼是 N」收進滑鼠提示。
     ⚠ 原因不可以整個拿掉：有 5 張卻只能填 3，不寫原因櫃檯會以為壞了（0823 的語彙）。 */
  ok('★★ 上限寫在畫面上，原因收進提示',
     /<span class="gt-vh-lim" title="\$\{isInst\?`本期開通 \$\{_segN\} 堂`:`\$\{_segN\} 堂`\}・每 \$\{VOUCHER_SESSIONS_PER\} 堂可折抵 1 張">最多 \$\{cap\} 張<\/span>/.test(src)
     && /lim\.textContent=cap>0\?`最多 \$\{cap\} 張`:'這一期不能折抵';/.test(src)
     && /lim\.title=`這一期開通 \$\{_n\} 堂・每 \$\{VOUCHER_SESSIONS_PER\} 堂可折抵 1 張`;/.test(src));
  ok('★★ 堂數不夠換一張就整塊不畫（不要留一個永遠填不下去的欄位）',
     /if\(!total\)\{ wrap\.style\.display='none'; return; \}/.test(src));
  ok('★ 券的類別要存起來給送出那關用',
     /window\._gtVoucherTt=vt;/.test(src) && /window\._grVoucherTt=_vt;/.test(src));
  ok('★★ 舊的兩條規則已經收乾淨（不要留著兩套數字打架）',
     !/VOUCHER_MAX/.test(src) && !/分期：本期限用 1 張/.test(src));
}

console.log('\n② 實跑 voucherCapOf');
{
  const i=src.indexOf('const VOUCHER_SESSIONS_PER=4;');
  const j=src.indexOf('async function refreshGrantVoucher()');
  const {voucherCapOf}=new Function(src.slice(i,j)+'\nreturn {voucherCapOf};')();
  const PT='tt-discount-pt300', MS='tt-discount-ms300';

  console.log('   常態方案（行為必須與改版前一致）');
  eq('★★★ 教練課 12 堂一次付清 → 3 張（＝0830 的「最多 3 張」）', voucherCapOf(PT,12), 3);
  eq('★★★ 教練課 12 堂分 3 期、每期 4 堂 → 1 張（＝0729 的「一期 1 張」）', voucherCapOf(PT,4), 1);
  eq('★★★ 8 堂優惠（不得分期）一次付清 → 2 張', voucherCapOf(PT,8), 2);

  console.log('   自訂方案（這次真正要擋的）');
  eq('★★★ 1 堂 → 0 張（使用者：「課堂必須至少 4 堂才可以使用一張」）', voucherCapOf(PT,1), 0);
  eq('★★★ 3 堂 → 還是 0 張', voucherCapOf(PT,3), 0);
  eq('★★★ 4 堂 → 剛好 1 張', voucherCapOf(PT,4), 1);
  eq('★★ 7 堂 → 1 張（不足 8 不給第 2 張）', voucherCapOf(PT,7), 1);
  eq('★★ 24 堂 → 6 張', voucherCapOf(PT,24), 6);

  console.log('   運動按摩維持原樣');
  eq('★★★ 運動按摩不限（一堂一張的方案，套 ÷4 等於不能用）', voucherCapOf(MS,1), Infinity);
  eq('　 沒登記過的券別 → 不限（不會因為漏登記就變成 0 張）', voucherCapOf('tt-discount-新的',1), Infinity);
  eq('　 vt 是空的也不能變 0', voucherCapOf(null,1), Infinity);
  eq('　 堂數是 0／undefined 也不會變負數', [voucherCapOf(PT,0), voucherCapOf(PT,undefined)], [0,0]);
}

console.log('\n③ 實跑：實際能折幾張、實收多少');
{
  const i=src.indexOf('const VOUCHER_SESSIONS_PER=4;');
  const j=src.indexOf('async function refreshGrantVoucher()');
  const {voucherCapOf}=new Function(src.slice(i,j)+'\nreturn {voucherCapOf};')();
  const PT='tt-discount-pt300', MS='tt-discount-ms300';
  /* 畫面：total=min(持有, cap)；送出再夾一次「這筆金額吃得下幾張」 */
  const shown=(vt,held,sess)=>Math.min(held, voucherCapOf(vt,sess));
  const submit=(vt,typed,held,sess,amt)=>Math.min(
    Math.max(0,Math.min(Math.floor(typed), held, voucherCapOf(vt,sess))),
    Math.max(0,Math.floor(amt/300)));

  eq('★★★ 教練課 12 堂 $24,000、手上 5 張 → 折 3 張，實收 $23,100',
     [shown(PT,5,12), submit(PT,5,5,12,24000), 24000-3*300], [3,3,23100]);
  eq('★★★ 自訂 1 堂 $1,000、手上 3 張 → 一張都不能折（使用者擔心的那件事）',
     [shown(PT,3,1), submit(PT,3,3,1,1000)], [0,0]);
  eq('★★★ 自訂 4 堂 $4,000、手上 3 張 → 1 張，實收 $3,700',
     [submit(PT,3,3,4,4000), 4000-300], [1,3700]);
  eq('★★★ 自訂 8 堂 $2,000、手上 3 張 → 堂數給 2 張，但金額只吃得下 2 張 → 2 張',
     submit(PT,3,3,8,2000), 2);
  eq('★★★ 自訂 8 堂 $500、手上 3 張 → 金額只吃得下 1 張', submit(PT,3,3,8,500), 1);
  eq('★★ 手上只有 1 張就只能折 1（上限不是保證張數）', shown(PT,1,12), 1);
  eq('★★★ 運動按摩 $1,500、手上 4 張 → 4 張全折，實收 $300（0830 的行為沒被改壞）',
     [shown(MS,4,1), submit(MS,4,4,1,1500), 1500-4*300], [4,4,300]);
}

console.log('\n④ 規則要寫在券上（2026-10-12 使用者：「幫我在教練課折抵券寫上使用規則」）');
{
  const i=src.indexOf('function tkVoucherRule(t){');
  const j=src.indexOf('function tkVoucherRuleHtml(t){');
  const tkVoucherRule=new Function('VOUCHER_SESSIONS_PER', src.slice(i,j)+'\nreturn tkVoucherRule;')(4);
  /* 同日二修（使用者：「只要顯示『每4堂課可折抵1張』其他文字不用
     運動按摩折抵則不需要顯示」）—— 一句就好，而且只有教練課券有。 */
  eq('★★★ 教練課券就只有那一句（不再附 12 堂／8 堂／分期的換算）',
     tkVoucherRule({ticket_type_id:'tt-discount-pt300'}), '每 4 堂課可折抵 1 張');
  eq('★★★ 運動按摩券不畫（它本來就沒限制，寫「不限」只是為了對稱而多一行）',
     tkVoucherRule({ticket_type_id:'tt-discount-ms300'}), '');
  eq('★★ 舊系統匯入的教練課券靠名稱也認得出來（ticket_type_id 可能是別的）',
     tkVoucherRule({ticket_type_id:'tt-pt', plan_name:'教練課折抵300'}), '每 4 堂課可折抵 1 張');
  eq('★★ 舊系統匯入的按摩券同樣不畫',
     tkVoucherRule({ticket_type_id:'tt-x', plan_name:'運動按摩折抵300'}), '');
  ok('★★★ 一般課程票不要畫這一行廢話', tkVoucherRule({ticket_type_id:'tt-mqdt435bbizd', plan_name:'私人教練課 1V1'})==='');
  ok('★★ 文字跟著常數走（改規則不會漏改這一句）',
     /每 \$\{VOUCHER_SESSIONS_PER\} 堂課可折抵 1 張/.test(src));
  ok('★★★ 三張卡都畫得到（會員資料、票券夾持有中、票券夾歷史）',
     /* 4 ＝ 函式定義 1 ＋ 三個呼叫端 */
     (src.match(/tkVoucherRuleHtml\(t\)/g)||[]).length===4);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
