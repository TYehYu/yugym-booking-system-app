/* 靠帳本撿回來的預約要看「淨值」（2026-09-02 許佳慈案例）

   症狀：許佳慈的團體課補課券（1 堂）上出現四顆圈 —— 9/8 一顆正常，
   10/2・10/9・10/16 三顆紅色超約圈。但那三堂她根本不在名單上。

   真相：那三堂是 0829 被加了又移除的空堂（member_ids 空、seat_tickets 空），
   帳本上留著成對的 deduct＋refund，**淨值是 0、帳目是平的**。
   票券夾原本只要「帳本上出現過這筆預約」就把它撿回來當成她的預約，
   於是三堂空堂被畫成超約。

   ⚠ delta 0 的 adjust（「已阻擋：這一堂在這張票上已經扣過 1 堂，不重複扣」）
     不是異動，不能算進淨值 —— 那種紀錄在這個案例裡有 9 筆。
   ⚠ 只影響「單靠帳本」進來的那幾筆：人真的在名單上（bkHasMember）
     或票直連（ticket_id）的照舊，不受這條影響。

   相關記憶：票券真相在帳本 —— status 與餘額打架時信餘額，超約防線看淨值。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 用 9/02 當天的真實帳本重現：三堂空堂各有 deduct＋refund（中間夾著 delta 0 的 adjust），
   9/8 那堂只有 deduct。 */
const LOGS=[
  {booking_id:'BK-9-8',  ticket_id:'TK-A', action:'grant',  delta:1},
  {booking_id:'BK-9-8',  ticket_id:'TK-A', action:'deduct', delta:-1},
  {booking_id:'BK-10-2', ticket_id:'TK-B', action:'deduct', delta:-1},
  {booking_id:'BK-10-2', ticket_id:'TK-B', action:'adjust', delta:0},   // 已阻擋：不重複扣
  {booking_id:'BK-10-2', ticket_id:'TK-B', action:'refund', delta:1},
  {booking_id:'BK-10-9', ticket_id:'TK-B', action:'deduct', delta:-1},
  {booking_id:'BK-10-9', ticket_id:'TK-B', action:'adjust', delta:0},
  {booking_id:'BK-10-9', ticket_id:'TK-B', action:'adjust', delta:0},
  {booking_id:'BK-10-9', ticket_id:'TK-B', action:'refund', delta:1},
  {booking_id:'BK-10-16',ticket_id:'TK-B', action:'deduct', delta:-1},
  {booking_id:'BK-10-16',ticket_id:'TK-B', action:'refund', delta:1},
  {booking_id:'BK-OTHER',ticket_id:'TK-Z', action:'deduct', delta:-1},  // 別人的票，不是她的
];

console.log('① buildWallet：帳本淨值 >0 才撿回來');
{
  const body=grab("  const _lgNet={};","  Object.keys(_lgNet).forEach(k=>{ if(_lgNet[k]>0) _lgBk[k]=1; });");
  const run=new Function('c','mineIds', body+'\nreturn {_lgNet,_lgBk};');
  const r=run({logs:LOGS},{'TK-A':1,'TK-B':1});
  eq('★★★ 扣了又退的三堂淨值 0，不撿回來', Object.keys(r._lgBk).sort(), ['BK-9-8']);
  eq('★★ delta 0 的 adjust 不算異動（這案例有 3 筆）', r._lgNet['BK-10-9'], 0);
  eq('★ 只扣沒退的那堂淨值 1', r._lgNet['BK-9-8'], 1);
  ok('★★ 別人的票不看（mineIds 沒有 TK-Z）', r._lgNet['BK-OTHER']===undefined);
}

console.log('\n② 只影響「單靠帳本」那條路');
{
  const F=grab("  const myBk=c.bookingsOf","|| _lgBk[b.id]));");
  ok('★★ 人真的在名單上、或票直連的照舊撿',
     /bkHasMember\(b,memberId\) \|\| \(b\.ticket_id&&mineIds\[b\.ticket_id\]\) \|\| _lgBk\[b\.id\]/.test(F));
}

console.log('\n③ 會員列表那條（0902 早上加的共享票聯集）同一套');
{
  ok('★★ 也是累加淨值，不是「出現過就算」',
     /const d=\(l\.action==='deduct'\)\?1:\(\(l\.action==='refund'\)\?-1:0\);\s*\n\s*if\(!d\) return;\s*\n\s*const m=\(_lgTkOfBk\[l\.ticket_id\]=_lgTkOfBk\[l\.ticket_id\]\|\|\{\}\);/.test(src));
  ok('★★ 撿的時候擋掉淨值 <=0 的', /if\(!\(_m\[bid\]>0\)\) return;\s*\/\/ 扣了又退＝這堂已經不是他的/.test(src));
}

console.log('\n④ 為什麼寫在原地');
ok('★★ 案例與成因留在程式裡',
   /10\/02・10\/09・10\/16 三堂在 0829 被加了又移除/.test(src)
   && /帳目其實是平的，什麼都沒超約/.test(src)
   && /delta 0 的 adjust（「已阻擋：不重複扣」）不算異動/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
