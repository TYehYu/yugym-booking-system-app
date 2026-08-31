/* 教練課的票可以上友善教練課（2026-08-31 使用者指示）

   「教練課的票券應該也要能預約友善教練課的課程」
   「今天李寶蓮抽到教練課　下週9/7無法用這個教練課轉正」

   正式庫的形狀：李寶蓮 8/31 抽到 TK-mtgpo4hnoltq「抽獎－教練課 1 堂」
   （ticket_type_id = tt-mqdt435bbizd＝教練課），但她固定上的是**友善教練課**，
   9/7 那堂扣不到這張票 —— 因為 bkTicketTypeOk 對票種是嚴格比對。

   ⚠ 只放行一個方向：友善票**不能**上一般教練課（那等於用優惠價買到正課）。
   ⚠ 折抵券（tt-discount-pt300）也掛在「私人教練」這個 category 底下，
     它是折 $300 的券、不是一堂課，不能被這條規則放進來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 規則寫在原地');
{
  ok('★★★ 只放行「一般教練課票 → 友善課」這一個方向，理由寫出來',
     /只有這個方向\*\*：友善票不能上一般教練課 —— 那等於用優惠價買到正課/.test(src));
  ok('★★★ 折抵券要先擋掉（它掛在私人教練底下，但不是一堂課）',
     /function bkIsPtVoucherType\(tt\)\{/.test(src)
     && /&& !bkIsPtVoucherType\(tty\)\) return true;/.test(src));
  ok('★★ 李寶蓮那個案例寫在原地（下次有人想改回嚴格比對看得到）',
     /李寶蓮 8\/31 抽到「教練課 1 堂」，但她固定上的是友善教練課/.test(src));
}

console.log('\n② 實跑 bkTicketTypeOk（用正式庫真實的票種）');
{
  const i=src.indexOf('function bkIsMergedPT(t){');
  const j=src.indexOf('// 把一個 ticket_type_id 解析成它代表的課程類別');
  if(i<0||j<0) throw new Error('切不到 bkTicketTypeOk 那一段');
  const W={_ttCache:[
    {id:'tt-mqdt435bbizd', name:'教練課',        category:'私人教練', color:'pt'},
    {id:'tt-mqdt4ijw29ga', name:'友善教練課',    category:'私人教練', color:'friendly'},
    {id:'tt-discount-pt300', name:'教練課折抵300', category:'私人教練', color:'pt'},
    {id:'tt-vip-legacy',   name:'VIP 教練課',    category:'私人教練', color:'pt'},
    {id:'tt-limited-legacy', name:'限定教練課',  category:'私人教練', color:'pt'},
    {id:'tt-mqdt55uosz5n', name:'自主訓練',      category:'自主訓練', color:'self'},
  ]};
  const api=new Function('window', src.slice(i,j)+'\nreturn {bkTicketTypeOk,bkIsMergedPT,bkIsPtVoucherType};')(W);
  const PT='tt-mqdt435bbizd', FR='tt-mqdt4ijw29ga', VO='tt-discount-pt300',
        VIP='tt-vip-legacy', LIM='tt-limited-legacy', SELF='tt-mqdt55uosz5n';
  const f=(ticketType, classType)=>api.bkTicketTypeOk({ticket_type_id:ticketType}, classType);

  eq('★★★ 李寶蓮：教練課的票 → 友善教練課的課　→ 可以',   f(PT, FR), true);
  eq('★★★ 反過來：友善票 → 一般教練課的課　→ 不行',        f(FR, PT), false);
  eq('★★★ 折抵券 → 友善課　→ 不行（它不是一堂課）',        f(VO, FR), false);
  eq('★★★ 折抵券 → 一般教練課　→ 不行（本來就不行，沒被改壞）', f(VO, PT), false);

  eq('★★ 原本就成立的：同票種當然可以',  [f(PT,PT), f(FR,FR)], [true,true]);
  eq('★★ 原本就成立的：VIP／限定舊票 → 一般教練課',  [f(VIP,PT), f(LIM,PT)], [true,true]);
  eq('★★ VIP／限定舊票 → 友善課也可以（它們至少和一般教練課等值）',
     [f(VIP,FR), f(LIM,FR)], [true,true]);
  eq('★★ 跨類別一律不行（自主訓練的票不能上教練課）',
     [f(SELF,PT), f(SELF,FR), f(PT,SELF)], [false,false,false]);
  eq('　 票種查不到時不要亂放行', [f('tt-不存在',FR), f(PT,'tt-不存在')], [false,false]);
}

console.log('\n③ bkIsPtVoucherType 認得出折抵券');
{
  const i=src.indexOf('function bkIsMergedPT(t){');
  const j=src.indexOf('// 把一個 ticket_type_id 解析成它代表的課程類別');
  const api=new Function('window', src.slice(i,j)+'\nreturn {bkIsPtVoucherType};')({_ttCache:[]});
  eq('★★ id 前綴與名稱兩種都認（舊資料的 id 不一定照規則）', [
    api.bkIsPtVoucherType({id:'tt-discount-pt300', name:'教練課折抵300'}),
    api.bkIsPtVoucherType({id:'tt-whatever', name:'教練課折抵券 $300'}),
    api.bkIsPtVoucherType({id:'tt-mqdt435bbizd', name:'教練課'}),
    api.bkIsPtVoucherType(null),
  ], [true,true,false,false]);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
