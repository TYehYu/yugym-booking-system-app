/* 折抵券顯示折抵使用日期（2026-10-12 使用者：「折抵券可以顯示折抵使用日期嗎」）

   折抵券不是上課用掉的，是買方案時折掉的 → 沒有 bookings → 圓點只畫得出一個 ✓。
   日期其實在帳本裡：扣抵時逐張寫了 ticket_logs.action='deduct'、
   note「折抵 $300（購買 ○○）」。

   ⚠ 只給折抵券用。一般課程票的 deduct 筆數跟圓點格子對不齊 —— 正式庫就有
     4 堂的團課匯入票帶 8 筆 deduct，拿去填會填出一排錯日期。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

function grab(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到 '+name);
  let d=0;
  for(let k=src.indexOf('{', i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
  throw new Error('括號沒收完 '+name);
}
const tkVoucherUseDates=new Function(grab('tkVoucherUseDates')+'; return tkVoucherUseDates;')();

const LOGS=[
  {ticket_id:'V1', action:'grant',  created_at:'2026-07-22T03:00:00Z'},
  {ticket_id:'V1', action:'deduct', created_at:'2026-10-11T18:50:57Z'},   // 台北 10/12 02:50
  {ticket_id:'V2', action:'deduct', created_at:'2026-09-26T04:59:29Z'},
  {ticket_id:'C1', action:'deduct', created_at:'2026-08-01T04:00:00Z'},
  {ticket_id:'C1', action:'deduct', created_at:'2026-08-08T04:00:00Z'},
];

console.log('① 折抵券抓得到日期');
eq('★★★ 新票種（tt-discount-pt300）',
   tkVoucherUseDates({id:'V2', ticket_type_id:'tt-discount-pt300', plan_name:'教練課折抵券 $300'}, LOGS),
   ['2026-09-26']);
eq('★★★ 舊系統匯入的（靠名稱認，ticket_type_id 可能是別的）',
   tkVoucherUseDates({id:'V2', ticket_type_id:'tt-pt', plan_name:'教練課折抵300'}, LOGS),
   ['2026-09-26']);

console.log('\n② 時區：created_at 是 UTC，要算台北的日期');
eq('★★★ UTC 10/11 18:50 → 台北 10/12（不能直接切字串）',
   tkVoucherUseDates({id:'V1', ticket_type_id:'tt-discount-pt300'}, LOGS), ['2026-10-12']);

console.log('\n③ 一般課程票一律不給（日期要來自課卡）');
eq('★★★ 教練課票即使有 deduct 也回空陣列',
   tkVoucherUseDates({id:'C1', ticket_type_id:'tt-pt', plan_name:'私人教練課 1V1'}, LOGS), []);
eq('★★ 團課匯入票（正式庫有 4 堂帶 8 筆 deduct 的）也不給',
   tkVoucherUseDates({id:'C1', ticket_type_id:'tt-group', plan_name:'團課【4堂優惠】'}, LOGS), []);

console.log('\n④ 邊界');
eq('★★ 沒有票就回空', tkVoucherUseDates(null, LOGS), []);
eq('★★ 沒有帳本也不會爆', tkVoucherUseDates({id:'V1', ticket_type_id:'tt-discount-pt300'}, null), []);
eq('★★ grant／adjust 不算，只看 deduct',
   tkVoucherUseDates({id:'V1', ticket_type_id:'tt-discount-pt300'}, LOGS).length, 1);

console.log('\n⑤ 接上畫面');
ok('★★★ wallet 吐得出來', /useDatesOf:tid=>tkVoucherUseDates\(/.test(src));
ok('★★★ 圓點把它當作沒有課卡那格的日期（手動補登優先）',
   /const _md=\(!b && _it\.g!=null\) \? \(_mu\[_it\.g\]\|\|_ud\[_it\.g\]\|\|''\) : '';/.test(src));
ok('★★ 說明文字要分得出來源（折抵使用日 vs 舊系統補登）',
   /折抵使用日/.test(src) && /舊系統補登（沒有對應課卡）/.test(src));
ok('★★★ 三個會看到折抵券的清單都帶了日期進去',
   (src.match(/useDates:WAL\.useDatesOf\(t\.id\)/g)||[]).length===3);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
