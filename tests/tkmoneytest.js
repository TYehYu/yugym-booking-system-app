/* 舊系統導入的票也要能轉儲值金（2026-10-12 使用者：
     「舊系統導入的方案 是不是無法轉為儲值金？」
     「雖然沒有收款紀錄 但也有金額 不能直接採用金額嗎」）

   作廢視窗原本只從 purchases 算金額，導入的票一筆都沒有 → amt=0 →
   三個出場選項整組不畫，只剩「這張票沒有對應的收款紀錄（$0）」。
   正式庫：7/11–7/25 導入、狀態可用且沒有收款紀錄的票 3359 張，
   其中 1846 張 member_tickets.amount_paid 有金額（其餘是點數／補課券，本來就 $0）。
   使用者截圖那張：陳玉霞 IMPV-T202607162197086 友善教練課1V1 4 堂 $5,200。 */
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
const tkMoneyRows=new Function(grab('tkMoneyRows')+'; return tkMoneyRows;')();
const refundCalc=new Function('REFUND_FEE_CAP','CREDIT_FEE_PCT',grab('refundCalc')+'; return refundCalc;')(9000,20);

console.log('① 使用者截圖那一張（導入票、沒有收款紀錄）');
const TK={id:'IMPV-T202607162197086', plan_name:'友善 教練課1V1', sessions_total:4,
          sessions_remaining:4, unit_price:1300, amount_paid:5200};
const r1=tkMoneyRows(TK, []);
eq('★★★ 金額取自票券的 amount_paid', r1.amt, 5200);
eq('★★★ 標成 legacy（視窗要寫清楚沒有收款紀錄）', r1.legacy, true);
eq('★★★ 算錢用的那一列標成 virtual（寫入端要跳過）', r1.rows.map(x=>x.virtual), [true]);
eq('★★★ 全部未使用 → 可轉儲值金 $5,200', refundCalc(r1.amt,4,4,false).base, 5200);

console.log('\n② 有收款紀錄的票：行為完全不變');
const PC=[{id:'PC1',ticket_id:'T1',deal_amount:12000},{id:'PC2',ticket_id:'T1',deal_amount:6000}];
const r2=tkMoneyRows({id:'T1',amount_paid:99999}, PC);
eq('★★★ 以 purchases 為準，不看 amount_paid', r2.amt, 18000);
eq('★★★ 不是 legacy', r2.legacy, false);
eq('★★★ 兩筆都是真的（分期）', r2.rows.map(x=>!!x.virtual), [false,false]);
/* ⚠ 優先序不能反過來：amount_paid 會被作廢流程改寫，拿它當真相會算錯第二次作廢。 */

console.log('\n③ 本來就 $0 的票維持原樣');
eq('★★★ 點數／補課券沒有金額 → amt 0、沒有虛擬列',
   (x=>[x.amt,x.rows.length,x.legacy])(tkMoneyRows({id:'T2',amount_paid:0}, [])), [0,0,false]);
eq('★★ amount_paid 是 null 也不會爆',
   (x=>[x.amt,x.rows.length])(tkMoneyRows({id:'T3',amount_paid:null}, [])), [0,0]);

console.log('\n④ 導入票用過一部分：只退未使用的那一段');
const r4=tkMoneyRows({id:'T4',amount_paid:5200}, []);
eq('★★★ 4 堂用 1 堂 → 基數 $3,900', refundCalc(r4.amt,4,3,false).base, 3900);

console.log('\n⑤ 不能憑空生出一筆收款紀錄');
ok('★★★ 寫入迴圈跳過虛擬那筆', /if\(pc\.virtual\) continue;/.test(src));
ok('★★★ 發票那段只看真的收款（_pcAll，不是含虛擬的 purchases）',
   /const pids=new Set\(_pcAll\.map\(p=>p\.id\)\);/.test(src));
ok('★★★ 視窗與執行端用同一支算錢（不會畫一個數、做另一個數）',
   (src.match(/const _money=tkMoneyRows\(tk/g)||[]).length===2);

console.log('\n⑥ 畫面要講清楚這是導入票');
ok('★★ 寫明金額來自票券、系統裡沒有收款紀錄', /這張是<b>舊系統導入<\/b>的票/.test(src));
ok('★★★ 寫明退款不會減少本系統營收（那筆錢沒在這裡記過）',
   /本系統的營收不會跟著減少/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
