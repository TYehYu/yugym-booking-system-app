/* 折抵券張數上限（2026-08-30 使用者定案）

   「教練課折抵券限制最多只能使用 3 張」
   「分期一次只能使用 1 張」
   運動按摩：不設限，維持現狀（$1,500 折 4 張到剩 $300 是確認過的預期行為）

   ⚠ 這一支盯的重點是**上限只有一份**：
     畫面（refreshGrantVoucher）與送出（submitGrant）如果各寫各的，
     櫃檯在畫面上被擋住、但送出那關沒擋，等於完全沒擋。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 規則寫在原地');
{
  ok('★★★ 上限收成一支，畫面與送出共用（不會有兩套數字）',
     /function voucherCapOf\(vt, isInst\)\{ return isInst\?1:\(VOUCHER_MAX\[vt\]\|\|Infinity\); \}/.test(src)
     && /const cap=voucherCapOf\(vt,isInst\);/.test(src)
     && /const _vCap = voucherCapOf\(window\._gtVoucherTt, isInstall\);/.test(src));
  ok('★★★ 教練課 3 張、運動按摩不列（＝不限）',
     /const VOUCHER_MAX=\{'tt-discount-pt300':3\};/.test(src)
     && !/tt-discount-ms300'\s*:/.test(src.slice(src.indexOf('const VOUCHER_MAX='), src.indexOf('const VOUCHER_MAX=')+120)));
  ok('★★ 分期 1 張的規則比張數上限優先（isInst 先判）',
     /return isInst\?1:\(VOUCHER_MAX\[vt\]\|\|Infinity\);/.test(src));
  ok('★★ 送出那關仍然自己夾一次（不信任畫面傳來的值）',
     /Number\(window\._gtVoucherMax\)\|\|0, _vCap\)\);/.test(src));
  ok('★★ 上限寫在畫面上 —— 有 5 張卻只能填 3，不寫原因櫃檯會以為壞了',
     /本次最多 \$\{cap\} 張/.test(src));
  ok('★ 券的類別要存起來給送出那關用',
     /window\._gtVoucherTt=vt;/.test(src));
}

console.log('\n② 實跑 voucherCapOf');
{
  const i=src.indexOf('const VOUCHER_MAX=');
  const j=src.indexOf('async function refreshGrantVoucher()');
  const api=new Function(src.slice(i,j)+'\nreturn {VOUCHER_MAX,voucherCapOf};')();
  const PT='tt-discount-pt300', MS='tt-discount-ms300';

  eq('★★★ 教練課・一次付清 → 3 張', api.voucherCapOf(PT,false), 3);
  eq('★★★ 教練課・分期 → 1 張', api.voucherCapOf(PT,true), 1);
  eq('★★★ 運動按摩・一次付清 → 不限', api.voucherCapOf(MS,false), Infinity);
  eq('★★ 運動按摩・分期 → 還是 1 張（分期規則對所有券都成立）', api.voucherCapOf(MS,true), 1);
  eq('　 沒登記過的券別 → 不限（不會因為漏登記就變成 0 張）', api.voucherCapOf('tt-discount-新的',false), Infinity);
  eq('　 vt 是空的也不能變 0', api.voucherCapOf(null,false), Infinity);
}

console.log('\n③ 實跑：實際能折幾張、實收多少');
{
  const i=src.indexOf('const VOUCHER_MAX=');
  const j=src.indexOf('async function refreshGrantVoucher()');
  const {voucherCapOf}=new Function(src.slice(i,j)+'\nreturn {VOUCHER_MAX,voucherCapOf};')();
  /* 畫面：total=min(持有, cap)；預設值再夾一次「這筆金額吃得下幾張」 */
  const shown=(vt,held,isInst)=>Math.min(held, voucherCapOf(vt,isInst));
  const deflt=(vt,held,amt,isInst)=>Math.max(0,Math.min(shown(vt,held,isInst), Math.floor(amt/300)));
  /* 送出：submitGrant 的 voucherN 公式 */
  const submit=(vt,typed,held,isInst)=>Math.max(0,Math.min(
    Math.floor(typed), shown(vt,held,isInst), voucherCapOf(vt,isInst)));
  const PT='tt-discount-pt300', MS='tt-discount-ms300';

  eq('★★★ 教練課 12 堂 $24,000、手上 5 張 → 只給折 3 張，實收 $23,100',
     [shown(PT,5,false), deflt(PT,5,24000,false), 24000-3*300], [3,3,23100]);
  eq('★★★ 櫃檯硬填 5 張，送出那關也只認 3 張',
     submit(PT,5,5,false), 3);
  eq('★★ 手上只有 2 張就只能折 2（上限不是保證張數）',
     [shown(PT,2,false), deflt(PT,2,24000,false)], [2,2]);
  eq('★★★ 教練課分期：手上 5 張也只折 1 張',
     [shown(PT,5,true), submit(PT,5,5,true)], [1,1]);

  eq('★★★ 運動按摩 $1,500、手上 4 張 → 4 張全折，實收 $300（0830 確認過的行為沒被改壞）',
     [shown(MS,4,false), deflt(MS,4,1500,false), 1500-4*300], [4,4,300]);
  eq('★★ 運動按摩手上 8 張、$1,500 → 預設只帶 5 張（金額吃得下的量）',
     deflt(MS,8,1500,false), 5);
  eq('★★ 運動按摩分期仍只給 1 張', shown(MS,4,true), 1);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
