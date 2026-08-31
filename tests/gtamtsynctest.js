/* 成交金額要跟著方案走（2026-08-31 陳瀚竣案例）＋ 教練請假補登排班表

   使用者：「幫我查一筆今天陳瀚竣的儲值#6為什麼金額會變成10400」

   正式庫的形狀（2026-08-31）：
     TK-mtgozj1l5dj4  03:42  自訂方案 4 堂・單價 1300 → **amount_paid 10,400**（已退回作廢）
     TK-mtgpbx0sut6u  03:51  自訂方案 4 堂・單價 1300 →   amount_paid  5,200（正確的那張）
   unit_price 1300 是 round(總價/堂數) 回推的 → 送出當下方案是「4 堂 $5,200」，
   但成交金額欄還停在 $10,400。

   成因：gt-amount 的 dataset.touched 一旦設上就**永遠**不再同步。
   櫃檯先填了金額、再回上一步把方案改小，回到這一步金額不會跟著改，
   而「確認已經收到錢了嗎？」只是原封不動顯示那個數字，看起來完全正常。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 方案變了就重新帶入金額');
{
  ok('★★★ 用方案簽章判斷「換方案了沒」，不是只看 touched',
     /const _sig=\[plan\.name\|\|'',total,listPrice,plan\.ticket_type_id\|\|''\]\.join\('\|'\);/.test(src)
     && /if\(amtEl && amtEl\.dataset\.sig!==_sig\)\{ delete amtEl\.dataset\.touched; amtEl\.dataset\.sig=_sig; \}/.test(src));
  ok('★★★ 同一個方案上打的折還是保留（那是 touched 當初要保護的東西）',
     /只有「同一個方案上打的折」才會被保留/.test(src));
  ok('★★ 陳瀚竣那個案例寫在原地',
     /4 堂 \$5,200 的自訂方案，收款卻記成 \$10,400/.test(src));
  ok('★★★ 成交金額高於定價要出聲（折扣不吵、超收才吵）',
     /function gtAmtWarn\(listPrice\)\{/.test(src)
     && /成交金額比定價多 <b>\$\$\{\(amt-lp\)\.toLocaleString\(\)\}<\/b>/.test(src)
     && /if\(lp>0 && amt>lp\)\{/.test(src));
  ok('★★ 警示框在總金額欄下面，而且改金額時會即時重算',
     /<div id="gt-amt-warn" class="gt-amt-warn" style="display:none;"><\/div>/.test(src)
     && /amtEl\.oninput=\(\)=>\{amtEl\.dataset\.touched='1';refreshInstallPreview\(\);gtVoucherCalc\(\);gtAmtWarn\(listPrice\);\};/.test(src));
}

console.log('\n② 實跑：換方案後金額有沒有跟上');
{
  /* 只模擬那三行的行為（來源由上面的字面斷言釘住） */
  const el={dataset:{}, value:0};
  const sync=(plan)=>{
    const total=plan.sessions, listPrice=plan.listPrice;
    const sig=[plan.name,total,listPrice,plan.tt].join('|');
    if(el.dataset.sig!==sig){ delete el.dataset.touched; el.dataset.sig=sig; }
    if(!el.dataset.touched) el.value=listPrice;
  };
  const type=v=>{ el.value=v; el.dataset.touched='1'; };
  const P8={name:'自訂方案', sessions:8, listPrice:10400, tt:'tt-pt'};
  const P4={name:'自訂方案', sessions:4, listPrice:5200,  tt:'tt-pt'};

  sync(P8);            eq('★★ 第一次進來帶入定價', el.value, 10400);
  sync(P4);            eq('★★★ 回上一步改成 4 堂 $5,200 → 金額跟著變（原本會卡在 10,400）', el.value, 5200);

  type(4800);          // 同一個方案上打折
  sync(P4);            eq('★★★ 同一個方案再刷新，折扣不會被蓋掉', el.value, 4800);
  sync(P8);            eq('★★★ 但換成別的方案就重新帶入（折扣不會跟著跑到新方案上）', el.value, 10400);

  type(9000); sync(P8);
  eq('　 換回同一個方案不算換（簽章一樣）', el.value, 9000);
}

console.log('\n③ 教練請假補登排班表（2026-08-31 使用者指示）');
{
  ok('★★★ 兩條路（教練課／團課）都會補登',
     (src.match(/await coachLeaveToRoster\(bkCoachId\(b\), b\.date, b\.start_time,/g)||[]).length===2);
  ok('★★★ 薪資中立：leave_type 不落 leaveSummary 的四個桶、時數 0',
     /leave_type:'教練請假', leave_hours:0,/.test(src)
     && /hours:0, leave_type:'教練請假'/.test(src)
     && !/if\(s\.leave_type==='教練請假'\)/.test(src));
  ok('★★★ 請假的那一列不算值班時段（否則反過來扣兼職的值班費）',
     /const myShifts=\(shifts\|\|\[\]\)\.filter\(s=>s\.emp_id===empId&&\(s\.date\|\|''\)\.slice\(0,7\)===month&&!s\.leave_type\);/.test(src)
     && /變成「因為請假所以被扣值班費」/.test(src));
  ok('★★ 同一天請假兩堂只留一列',
     /if\(\(all\|\|\[\]\)\.some\(x=>x && x\.emp_id===empId && String\(x\.date\|\|''\)\.slice\(0,10\)===String\(dateStr\)\.slice\(0,10\)\s*\n\s*&& x\.leave_type\)\) return null;/.test(src));
  ok('★★ 補登失敗不能把請假整個弄壞（包在 try 裡、只記 console）',
     /try\{ await coachLeaveToRoster\(bkCoachId\(b\), b\.date, b\.start_time,[\s\S]{0,220}?\}catch\(_\)\{\}/.test(src));
  ok('★★★ 這一支擋不住「櫃檯用一般取消」那條路，程式裡老實寫出來',
     /它\*\*擋不住\*\*\s*\n\s*「櫃檯用一般取消」那條路 —— 那才是 7\/13 真正的破口/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
