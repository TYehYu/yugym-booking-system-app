/* 待收款的兩種欠款（2026-09-06）——
   原本全系統只認「分期未繳清的期數」，`payment_status==='unpaid'`（發放時選未付款、
   櫃檯還沒按〔收款〕）沒有任何一個計數或名單看得到，只有管理員的「今日事項」那頁有。
   蔡佳音 TK-msmvv10rgdpo 就這樣掛了 26 天。
   收成 tkOwesMoney／tkOwedAmount 兩支，首頁待辦、營運中心待辦、財務待收款共用同一份。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

/* 從 index.html 抽出真正的原始碼來跑（不是複製貼上的副本） */
const grab=(name)=>{
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到 '+name);
  return src.slice(i, src.indexOf('\n}\n', i)+3);
};
const { tkOwesMoney, tkOwedAmount } = (new Function(
  grab('tkOwesMoney') + grab('tkOwedAmount') + 'return {tkOwesMoney, tkOwedAmount};'))();

console.log('① tkOwesMoney：誰還欠錢');
ok('★★ 待付款的票算欠錢（蔡佳音那型）',
   tkOwesMoney({status:'usable', payment_status:'unpaid'})===true);
ok('★★ 分期還沒繳完算欠錢（原本就有的那型）',
   tkOwesMoney({status:'usable', payment_status:'paid', installment:{current:1,count:3}})===true);
ok('★  已付款又沒分期＝不欠',
   tkOwesMoney({status:'usable', payment_status:'paid'})===false);
ok('★  分期繳完了＝不欠',
   tkOwesMoney({status:'usable', payment_status:'paid', installment:{current:3,count:3}})===false);
ok('★★ 已退費的不算（帳結掉了，錢不會再進來）',
   tkOwesMoney({status:'refunded', payment_status:'unpaid'})===false);
ok('★★ 已作廢的不算',
   tkOwesMoney({status:'void', payment_status:'unpaid'})===false);
ok('　  null 不會炸', tkOwesMoney(null)===false);

console.log('\n② tkOwedAmount：還欠多少');
ok('★★ 待付款＝整張的價（單價 × 總堂數）',
   tkOwedAmount({status:'usable', payment_status:'unpaid', unit_price:1300, sessions_total:8})===10400);
ok('★★ 分期＝未繳期數加總（第 2、3 期）',
   tkOwedAmount({status:'usable', installment:{current:1,count:3,amounts:[4000,3000,3000]}})===6000);
ok('★  分期優先於待付款（同時成立時不會兩種都算）',
   tkOwedAmount({status:'usable', payment_status:'unpaid', unit_price:1300, sessions_total:8,
                 installment:{current:1,count:2,amounts:[5200,5200]}})===5200);
ok('★  不欠錢的是 0', tkOwedAmount({status:'usable', payment_status:'paid'})===0);
ok('　  缺欄位不會算成 NaN',
   tkOwedAmount({status:'usable', payment_status:'unpaid'})===0);

console.log('\n③ 三個出口都改用同一份判斷（別再各寫一套）');
ok('★★ 首頁待辦計數', src.includes('const _unpaidTickets=(mtickets||[]).filter(tkOwesMoney);'));
ok('★★ 營運中心待辦計數', src.includes('const unpaidTickets=(mtickets||[]).filter(tkOwesMoney);'));
const fin=src.slice(src.indexOf('async function finReceivable'), src.indexOf('async function finReceivable')+3000);
ok('★★ 財務・待收款名單', fin.includes('const pending=(tickets||[]).filter(tkOwesMoney);'));
ok('★★ 待付款那一列給的是〔收款〕不是〔開通下一期〕',
   /r\.isInst[\s\S]{0,220}openInstallNext[\s\S]{0,120}tkPayOpen/.test(fin));
ok('★  待收款會員數不重複計（同一人兩張欠款票只算一位）',
   fin.includes("new Set(rowsData.map(r=>r.member_id)).size"));
ok('　  舊的 installment 內聯判斷已經沒有殘留在這三處',
   (src.match(/i\.current<i\.count; \}\);/g)||[]).length===0);

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
