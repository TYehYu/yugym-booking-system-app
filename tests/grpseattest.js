/* 2026-08-03 使用者回報：「團體課的簽到有個狀況 —— 我簽到第一個客人以後，
   下面的客人的圓形卡也一併呈現實心了，應該要分開紀錄才對」

   團課是多人共用同一筆預約：第一個人簽到時整筆 status 變 checked_in，
   而圓形卡的「實心」與票券夾的「已上」原本都只看 status —— 於是全員跟著實心。
   改成看「這位會員自己名額的點名狀態」（attendance map，逐名額）；
   整堂都沒逐名額點過名的舊匯入資料，才退回看整筆狀態。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 沙箱：帶入 seatKeys/seatMid/attObj 的等價替身（與正式版同語意） */
const CNT=new Function('bkIsGroup','seatKeys','seatMid','attObj', grabFn('grpSeatAttCount')+'\nreturn grpSeatAttCount;')(
  b=>!!(b&&Array.isArray(b.member_ids)&&b.member_ids.length),
  b=>{ const c={}; return (b.member_ids||[]).map(id=>{ c[id]=(c[id]||0)+1; return c[id]>1?`${id}#${c[id]}`:String(id); }); },
  k=>{ const s=String(k), i=s.indexOf('#'); return i<0?s:s.slice(0,i); },
  b=>b.attendance||{});

console.log('① 使用者的情境：簽到第一個客人，其他人不能跟著實心');
{
  /* 三個客人的團課，只點了 A 的名 —— 整筆 status 已被第一次簽到改成 checked_in */
  const B={id:'g1', member_ids:['A','B','C'], status:'checked_in',
    attendance:{A:'checked_in'}};
  eq('★ A 簽到了 → 1', CNT(B,'A'), 1);
  eq('★ B 還沒點名 → 0（不能因為整筆 status 是 checked_in 就實心）', CNT(B,'B'), 0);
  eq('★ C 同理 → 0', CNT(B,'C'), 0);
}

console.log('\n② 逐名額與請假');
{
  const B2={id:'g2', member_ids:['A','A','B'], status:'checked_in',
    attendance:{'A':'checked_in','A#2':'leave','B':'no_show'}};
  eq('★ A 佔兩個名額、只簽到一個 → 1（另一個請假不算已上）', CNT(B2,'A'), 1);
  eq('★ B 未到 → 0', CNT(B2,'B'), 0);
  const B3={id:'g3', member_ids:['A','A'], status:'checked_in',
    attendance:{'A':'checked_in','A#2':'checked_in'}};
  eq('　　兩個名額都簽到 → 2', CNT(B3,'A'), 2);
}

console.log('\n③ 舊匯入資料的退路（整堂沒逐名額點過名）');
{
  const OLD={id:'g4', member_ids:['A','B'], status:'checked_in', attendance:{}};
  eq('★ 沒有任何點名紀錄、整筆已簽到 → 當全員已上（歷史紀錄不會整批變空心）', [CNT(OLD,'A'),CNT(OLD,'B')], [1,1]);
  const OLD2={id:'g5', member_ids:['A','B'], status:'booked'};
  eq('★ 沒點名、還沒簽到 → 0', CNT(OLD2,'A'), 0);
  eq('　　非團課回 0（呼叫端自己看 status）', CNT({id:'x',member_id:'A',status:'checked_in'},'A'), 0);
  eq('　　不在名單裡的人 → 0', CNT({id:'g6',member_ids:['A'],status:'checked_in',attendance:{}},'Z'), 0);
}

console.log('\n④ 接進兩個吃這個數字的地方');
ok('★ 票券夾的「已上」（buildWallet isAtt）：團課改看名額點名',
   /if\(typeof grpSeatAttCount==='function' && bkIsGroup\(b\)\) return grpSeatAttCount\(b, memberId\)>0;/.test(src));
ok('★ 圓形卡的實心分類（ticketTokens）：逐名額消耗，簽到＋請假照扣的名額算實心',
   /_grpLeft\[b\.id\]=grpSeatAttCount\(b, memberId\|\|t\.member_id\)\+_lv;/.test(src)   /* 2026-08-04 徐翎娟案例：請假名額收進實心 */
   && /if\(_grpLeft\[b\.id\]>0\)\{ _grpLeft\[b\.id\]--; return true; \}/.test(src));
ok('　　沒被算成實心的名額仍列在已預約（不會消失）',
   /else if\(b\.status!=='cancelled'\) _bookedL\.push\(b\);/.test(src));
ok('　　使用者的回報寫在程式裡',
   /簽到第一個客人以後，下面的客人的圓形卡也一併呈現實心了/.test(src));
ok('　　舊資料退路的理由寫在程式裡',
   /整堂都沒逐名額點過名（舊匯入資料）才退回看整筆狀態。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
