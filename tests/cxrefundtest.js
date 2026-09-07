/* 取消退課不能靜靜失敗（2026-09-07 王秋香案例）——
   她的 9/12 那一堂被教練取消（refund_waived=false＝系統自己認定該退），
   但堂數沒有退回來：change_log 顯示當下只有 bookings 被改，
   member_tickets 與 ticket_logs 都沒有動作，refundTicket 的兩個失敗分支
   （讀不到票／餘額已滿）也各自會寫 delta 0 警示帳 —— 一筆都沒有，
   代表 refundTicket 根本沒被呼叫到，也就是那個 `_net>0` 的守門判成了 0。

   那個判斷讀的是 dbGetAll('ticket_logs') 整表快取。改成直接問資料庫，
   並且把「查得到、真的沒扣過」那條路從 console.warn 升級成警示帳＋吐司。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

/* 抽真正的 bkNetDeductDB 出來跑，雲端與快取兩種來源都餵假的 */
const mk=(rows, opts)=>{
  const o=opts||{};
  const sb={ from:()=>{ const q={ select:()=>q, eq:()=>q,
    then:(res)=>res(o.error?{error:{message:'boom'},data:null}:{error:null,data:rows}) }; return q; } };
  const dbGetAll=async()=>o.cache||[];
  return new Function('CLOUD','sb','dbGetAll', g('async function bkNetDeductDB(','\n}')
    +'\nreturn bkNetDeductDB;')(o.cloud!==false, sb, dbGetAll);
};
const D=(bid,tid)=>({action:'deduct',delta:-1,ticket_id:tid||'TK-1',booking_id:bid});
const R=(bid,tid)=>({action:'refund',delta:1,ticket_id:tid||'TK-1',booking_id:bid});

(async()=>{
console.log('① 淨扣課算得對');
ok('★★ 一筆扣課 → 1', await mk([D('BK-1')])('BK-1','TK-1')===1);
ok('★★ 扣了又退 → 0（不能再退一次）', await mk([D('BK-1'),R('BK-1')])('BK-1','TK-1')===0);
ok('★★ 完全沒有紀錄 → 0', await mk([])('BK-1','TK-1')===0);
ok('★★ delta 0 的補連結不算扣課（它只記歸屬，堂數當初就扣過了）',
   await mk([{action:'deduct',delta:0,ticket_id:'TK-1'}])('BK-1','TK-1')===0);

console.log('\n② 問不到要回 null，不能回 0');
ok('★★ 查詢失敗 → null（呼叫端才分得出「沒扣過」與「問不到」）',
   await mk([], {error:true})('BK-1','TK-1')===null);
ok('★  沒給 booking id → null', await mk([])(null,'TK-1')===null);

console.log('\n③ 本機 demo 模式（沒有雲端）退回讀快取');
const offline=mk([], {cloud:false, cache:[{booking_id:'BK-9',ticket_id:'TK-9',action:'deduct',delta:-1}]});
ok('★  離線時仍算得出 1', await offline('BK-9','TK-9')===1);

console.log('\n④ 取消那一段真的改用它了');
const C=src.slice(src.indexOf('    }else if(b.ticket_id){'), src.indexOf('    /* 「沒綁票就回頭找一張票退」的備援'));
ok('★★ 淨扣課問資料庫，不再 filter 整表快取',
   /const _net=await bkNetDeductDB\(b\.id, b\.ticket_id\);/.test(C)
   && !/dbGetAll\('ticket_logs'\)/.test(C));
ok('★★ 問不到＝照退（不要在查不到的時候吃掉客人一堂）',
   /if\(_net===null\)\{[\s\S]*?refundTicket\(b\.ticket_id,b\.id,SESSION\.id\)/.test(C));
ok('★★ 真的沒扣過才不退，而且要留警示帳',
   /取消未退課：帳本上查不到這一堂的淨扣課/.test(C));
ok('★★ 而且要當面說一聲（不是只有 console.warn）',
   /showToast\('這一堂在票券上查不到扣課紀錄，已取消但沒有退回堂數/.test(C));
ok('★  silent 模式不吵人（整串取消一次跳十次沒有意義）', /if\(!_silent\)\{ try\{ showToast/.test(C));

console.log('\n⑤ refund_waived 的語意不變（問不到就當沒扣過，安全的那一邊）');
const W=g('async function bkWasDeducted(','\n}');
ok('★★ 改走同一支查詢', /const net=await bkNetDeductDB\(b\.id, null\);/.test(W));
ok('★★ 問不到（null）不算扣過 —— 不會把沒扣過的格子畫成用掉了',
   /typeof net==='number' && net>0/.test(W));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
})();
