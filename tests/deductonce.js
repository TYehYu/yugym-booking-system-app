/* 同一張票 × 同一筆預約不重複扣課（2026-08-27 施佳靜案例）

   施佳靜的 12 堂 1V2：11 筆預約在 5 秒內產生 18 筆扣課紀錄 —— 同一支流程跑了兩次，
   7 筆預約各被扣兩次，餘額被壓到 0（實際只用 11 堂），票券卡掛上 ⚠ 對帳。
   建立預約那條路 0728 就有 _bkSubmitting 防連點（魚媽案例），但「待簽約轉正／
   批次綁票」那幾條沒有 —— 所以改在真正扣課的 deductTicket 擋最後一關。

   ⚠ 有兩種合法的重複扣課必須放行（團課一人多名額、自主訓練 120 分扣 2 點），
     它們由呼叫端帶 {multi:true} 自己說明白。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

function mk(existingLogs){
  const logs=(existingLogs||[]).slice(), puts=[];
  const fn=new Function('logTicket','activateTicketIfNeeded','dbPut','showToast','dbGetAll',
    grabFn('tkNetDeductOn')+'\n'+grabFn('deductTicket')+'\nreturn deductTicket;')(
    async(tid,action,delta,bid,op,note)=>{ logs.push({ticket_id:tid,action,delta,booking_id:bid,note}); },
    async()=>null,
    async(_,o)=>{ puts.push(o); },
    ()=>{},
    async()=>logs);
  return {fn,logs,puts};
}
const L=(tid,bid,action)=>({ticket_id:tid,booking_id:bid,action});

(async()=>{
console.log('① 第一次扣得到，第二次擋下來');
{
  const {fn,logs}=mk();
  const tk={id:'T1',plan_name:'主顧客1V2',sessions_remaining:12,sessions_total:12};
  eq('★ 第一次：扣得到', await fn(tk,'B1','u1'), true);
  eq('　 餘額 12 → 11', tk.sessions_remaining, 11);
  eq('★★ 第二次（同票同預約）：回 true 但不再扣', await fn(tk,'B1','u1'), true);
  eq('★★ 餘額停在 11 —— 這正是施佳靜那 7 堂被多扣的地方', tk.sessions_remaining, 11);
  eq('★★ 只有一筆 deduct，第二次留下 adjust／0 的痕跡',
     [logs.filter(l=>l.action==='deduct').length, logs.filter(l=>l.action==='adjust'&&l.delta===0).length], [1,1]);
  ok('★ 痕跡寫得出原因（之後查得到這裡擋過）',
     /已經扣過 1 堂，不重複扣/.test(logs.filter(l=>l.action==='adjust').pop().note));
}

console.log('\n② 別的預約、別的票 不受影響');
{
  const {fn}=mk([L('T1','B1','deduct')]);
  const tk={id:'T1',sessions_remaining:5,sessions_total:10};
  eq('★ 同一張票、不同預約 → 照扣', await fn(tk,'B2','u1'), true);
  eq('　 餘額有減', tk.sessions_remaining, 4);
  const {fn:fn2}=mk([L('T1','B1','deduct')]);
  const tk2={id:'T2',sessions_remaining:5,sessions_total:10};
  eq('★ 不同票、同一筆預約 → 照扣（換票／補票是合法的）', await fn2(tk2,'B1','u1'), true);
}

console.log('\n③ 退過又要重扣：淨值歸零就放行');
{
  const {fn}=mk([L('T1','B1','deduct'), L('T1','B1','refund')]);
  const tk={id:'T1',sessions_remaining:5,sessions_total:10};
  eq('★★ 扣過又退過（教練請假／取消後重約）→ 淨值 0，可以再扣', await fn(tk,'B1','u1'), true);
  eq('　 餘額有減', tk.sessions_remaining, 4);
}

console.log('\n④ 合法的重複扣課：呼叫端帶 {multi:true} 就放行');
{
  const {fn}=mk([L('T1','B1','deduct')]);
  const tk={id:'T1',sessions_remaining:5,sessions_total:10};
  eq('★★ 團課一人多名額 / 自主訓練 120 分扣 2 點 → 照扣',
     await fn(tk,'B1','u1',{multi:true}), true);
  eq('　 餘額有減', tk.sessions_remaining, 4);
  ok('★★ 兩條合法路徑都真的有帶 multi',
     /if\(tk && await deductTicket\(tk,bk\.id,SESSION\.id,\{multi:true\}\)\)\{ charged\+\+;/.test(src)
     && /if\(!tk \|\| !\(await deductTicket\(tk,b\.id,SESSION\.id,\{multi:true\}\)\)\) break;/.test(src));
  ok('★★ 而且原因寫在原地（團課多名額、120 分扣 2 點）',
     /團課一人可佔多個名額（許佳慈 4 個名額＝扣 4 堂）/.test(src)
     && /自主訓練 120 分鐘扣 2 點，同一筆預約本來就要扣多次/.test(src));
}

console.log('\n⑤ 原本的餘額護欄沒被弄壞');
{
  const {fn,logs}=mk();
  const tk={id:'T1',plan_name:'教練課',sessions_remaining:0,sessions_total:4};
  eq('★ 餘額 0 → 擋下、回 false（R3 的護欄）', await fn(tk,'B9','u1'), false);
  ok('　 留下「已阻擋：餘額為 0」的痕跡',
     /已阻擋：餘額為 0/.test(logs.filter(l=>l.action==='adjust').pop().note));
}

console.log('\n⑥ 案例與理由寫在原地');
{
  ok('★★ 施佳靜案例、以及「為什麼不逐條補鎖」寫著',
     /11 筆預約在 5 秒內產生了 18 筆扣課/.test(src)
     && /與其逐條補鎖，不如在真正扣課的這一支擋最後一關/.test(src));
  ok('★ 0728 魚媽那道防連點仍在（兩道防線並存）',
     /if\(window\._bkSubmitting\)\{ showToast\('建立中，請稍候…'\); return; \}/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
