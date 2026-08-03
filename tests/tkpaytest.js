/* 2026-08-03 使用者指示：「會員資料的票券，金額旁邊新增現金或匯款」

   票券本身不存付款方式 —— 開會員資料時把該會員收款紀錄建成 ticket_id → 付款方式
   的對照（分期多筆取最新），tkMoneyHtml 在金額後面掛標籤。
   舊系統匯入（payment_method='imported'）不標；金額本來就只給櫃檯／管理員看。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 實跑 tkMoneyHtml');
{
  const mk=(desk,payMap)=>new Function('isDeskLike','window','return '+grabFn('tkMoneyHtml'))(()=>desk,{_tkPayMap:payMap||{}});
  const f=mk(true,{T1:'cash',T2:'transfer',T3:'imported'});
  ok('★ 現金：金額後掛綠標', /\$3,000<\/b><span class="tk-pay">現金<\/span>/.test(f({id:'T1',amount_paid:3000})));
  ok('★ 匯款：金色（同今日營收色階）', /<span class="tk-pay tk-pay-tr">匯款<\/span>/.test(f({id:'T2',amount_paid:5000})));
  ok('★ 舊系統匯入不標', !/tk-pay/.test(f({id:'T3',amount_paid:8000})));
  ok('★ 沒對照到的票不標（不掛空標籤）', !/tk-pay/.test(f({id:'T9',amount_paid:1000})));
  ok('★ 會員端／教練端整段不顯示（金額本來就只給櫃檯）', mk(false,{T1:'cash'})({id:'T1',amount_paid:3000})==='');
  ok('　　$0 的票照舊顯示原因標籤，不掛付款方式', /tk-amt-zero/.test(f({id:'T9',amount_paid:0,note:''})));
}

console.log('\n② 對照表的建法');
ok('★ 開會員資料時就地建表（分期多筆取最新：依 created_at 排序後覆寫）',
   /window\._tkPayMap=\{\};\n\s*c\.myPc\.slice\(\)\.sort\(\(a,b\)=>String\(a\.created_at\|\|''\)\.localeCompare\(String\(b\.created_at\|\|''\)\)\)\n\s*\.forEach\(p=>\{ if\(p\.ticket_id&&p\.payment_method\) window\._tkPayMap\[p\.ticket_id\]=p\.payment_method; \}\);/.test(src));
ok('　　為什麼掛 window，寫在程式裡', /掛在 window 給 tkMoneyHtml 用（它是無資料存取的純顯示 helper）。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
