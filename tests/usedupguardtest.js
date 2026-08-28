/* 「還有餘額卻掛 used_up」的護欄（2026-08-28 李約儒 #1 案例）

   使用者：「李約儒這一筆9/4約在票券#4的第1堂 櫃檯要怎麼改到票券#1的第12堂」
   —— 答案本來是課卡的「更換票券」，但 #1 在清單裡根本不出現。

   成因鏈：
     ① 8/21 教練請假、會員到場簽到 → DB 的 fn_checkin_booking 退回 1 堂，
        而且有把 status 從 used_up 翻回 usable（那支寫對了）
     ② 前端緊接著呼叫 markTicketUsedIfDone，它只數「簽到完的堂數 >= 總堂數」
        （12 堂全簽到過）就又壓回 used_up —— **沒有看餘額**
     ③ listUsableTickets 只收 usable → 這張餘額 1 堂的票整張消失

   「餘額 >0 卻掛 used_up」0810 就踩過一次（票券校正那邊已經有同名判斷），
   這一支把同一條護欄釘在 markTicketUsedIfDone 上：狀態由餘額說了算。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const F=src.slice(src.indexOf('async function markTicketUsedIfDone(ticket_id){'),
                  src.indexOf('// 扣一堂'));

console.log('① 護欄本身');
ok('★★ 還有餘額就直接 return，不標 used_up',
   /if\(\(Number\(t\.sessions_remaining\)\|\|0\)>0\) return;   \/\/ 還有堂數可用 → 不是用畢/.test(F));
ok('★★ 成因寫在原地（下次不要又把餘額判斷拿掉）',
   /前端緊接著呼叫這一支，它只數「簽到完的堂數 >= 總堂數」/.test(src)
   && /「餘額 >0 卻掛 used_up」這條 0810 就踩過一次/.test(src));
ok('★★ 原本的條件沒有被放寬（仍要「簽到完的堂數 >= 總堂數」）',
   /if\(doneCnt>=\(t\.sessions_total\|\|0\)\)\{/.test(F));
ok('★★ 只在 usable 時才動（退費／過期／作廢的狀態一律不碰）',
   /if\(!t \|\| t\.status!=='usable'\) return;/.test(F));

console.log('\n② 實跑四種情形');
{
  const run=async(t, bks)=>{
    let saved=null;
    const f=new Function('dbGet','dbGetAll','dbPut','Number',
      F+'\nreturn markTicketUsedIfDone;')(
        async()=>t, async()=>bks, async(_,x)=>{saved=x;}, Number);
    await f('TK1');
    return saved?saved.status:null;
  };
  const done=n=>Array.from({length:n},(_,i)=>({ticket_id:'TK1',status:'checked_in',id:'B'+i}));
  return (async()=>{
    eq('★★ 12 堂全簽到、餘額 0 → 標 used_up（原本的行為）',
       await run({id:'TK1',status:'usable',sessions_total:12,sessions_remaining:0}, done(12)), 'used_up');
    eq('★★ 12 堂全簽到、但餘額 1（教練請假退回）→ 不標，維持 usable',
       await run({id:'TK1',status:'usable',sessions_total:12,sessions_remaining:1}, done(12)), null);
    eq('★ 還沒上完（10/12）→ 本來就不標',
       await run({id:'TK1',status:'usable',sessions_total:12,sessions_remaining:0}, done(10)), null);
    eq('★ 已經是 used_up 的不重複寫',
       await run({id:'TK1',status:'used_up',sessions_total:12,sessions_remaining:0}, done(12)), null);

    console.log('\n③ 為什麼這件事會讓「更換票券」看不到那張票');
    ok('★★ 挑票一律要 usable —— 狀態壓錯就整張消失（listUsableTickets → tkFitsBooking）',
       /if\(t\.status!=='usable' \|\| !\(t\.sessions_remaining>0\)\) return false;/.test(src)
       && /return all\.filter\(t=>tkFitsBooking\(t,member_id,type_id,bookDate,bookTime,cnt\)\)/.test(src));
    ok('★ 票券校正那邊早就有同一條判斷（兩處要說同一件事）',
       /if\(rem>0 && t\.status==='used_up'\) t\.status='usable';/.test(src)
       && /if\(rem===0 && t\.status==='usable'\) t\.status='used_up';/.test(src));

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
