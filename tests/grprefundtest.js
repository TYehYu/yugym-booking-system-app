/* 2026-08-03 使用者回報：「今天游晴雅 20:00 的團課明細，顯示了兩堂都用 #10 的
   補課券，不對吧」

   對，不對。時間線：7/30 請假（兩個名額）→ 發兩張補課券 → 8/1 補扣到 8/6 的課
   （兩個名額各扣一張）→ 8/3 取消 8/6 時，退票邏輯抓「最近一筆扣課」，兩筆退回
   都退到第一張 → 第一張多退成剩 2、第二張帳懸空 → 今晚兩個名額就都扣到第一張。
   總帳沒少（兩張券發、兩個名額用），只是歸屬串錯票。

   修法：退票改抓「這筆預約裡還有淨扣課（扣−退>0）的那張」（grpNetDeductTicket），
   名單儲存移除與單一名額取消兩條路都換；游晴雅的兩筆紀錄已在正式庫校正歸位。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 游晴雅的情境（grpNetDeductTicket 實跑）');
(async()=>{
  const TKS=[{id:'V1',member_id:'M'},{id:'V2',member_id:'M'},{id:'X',member_id:'OTHER'}];
  const mk=logs=>new Function('dbGetAll','return async '+grabFn('grpNetDeductTicket'))(
    async t=>t==='ticket_logs'?logs:TKS);
  /* 兩個名額扣在兩張券上（V1 較早、V2 較晚） */
  const base=[{booking_id:'B',ticket_id:'V1',action:'deduct',created_at:'01'},
              {booking_id:'B',ticket_id:'V2',action:'deduct',created_at:'02'}];
  eq('★ 第一次取消 → 退最近扣的 V2', await mk(base)('B','M'), 'V2');
  eq('★ 第二次取消（V2 已退）→ 退 V1，不再退到 V2',
     await mk(base.concat([{booking_id:'B',ticket_id:'V2',action:'refund',created_at:'03'}]))('B','M'), 'V1');
  eq('★ 兩張都退完 → 沒得退（回 null，走「找不到可退」提示）',
     await mk(base.concat([{booking_id:'B',ticket_id:'V2',action:'refund'},{booking_id:'B',ticket_id:'V1',action:'refund'}]))('B','M'), null);
  eq('　　別人的票不會被抓來退（member 過濾）',
     await mk([{booking_id:'B',ticket_id:'X',action:'deduct',created_at:'01'}])('B','M'), null);
  eq('　　別筆預約的扣課不算', await mk([{booking_id:'B2',ticket_id:'V1',action:'deduct'}])('B','M'), null);

  console.log('\n①b 紀錄順序不能影響結果（2026-08-29）');
  /* dbGetAll('ticket_logs') 的順序不保證按時間。原本 last[tid] 是直接覆蓋
     ＝「最後被掃到的那一筆」，不是最新的一筆；順序一亂就退到別位使用人的票上。
     同一堂課同一個帳號有媽媽與姊姊兩張都有淨扣時，這件事天天發生。 */
  eq('★★★ 反序（V2 的紀錄排在前面）→ 還是退最近扣的 V2',
     await mk(base.slice().reverse())('B','M'), 'V2');
  eq('★★ 三張票、順序打散 → 一律退 created_at 最大的那張',
     await mk([{booking_id:'B',ticket_id:'V2',action:'deduct',created_at:'02'},
               {booking_id:'B',ticket_id:'X2',action:'deduct',created_at:'09'},
               {booking_id:'B',ticket_id:'V1',action:'deduct',created_at:'05'}]
              .filter(l=>l.ticket_id!=='X2'))('B','M'), 'V1');
  /* delta 0 ＝「補連結」：只記歸屬、堂數當初就扣過了，不能算成一筆可退的扣課 */
  eq('★★★ 補連結（delta 0）不算 → 不會憑空退掉一堂',
     await mk([{booking_id:'B',ticket_id:'V1',action:'deduct',delta:0,created_at:'09'}])('B','M'), null);
  eq('　 補連結與真扣課並存時，只退真的那張',
     await mk([{booking_id:'B',ticket_id:'V1',action:'deduct',delta:0,created_at:'09'},
               {booking_id:'B',ticket_id:'V2',action:'deduct',delta:-1,created_at:'01'}])('B','M'), 'V2');

  console.log('\n② 兩條取消路都換了');
  ok('★ 名單儲存的移除退票走淨額', /const tkid=await grpNetDeductTicket\(b\.id, mid\);\n\s*if\(tkid\) await refundTicket\(tkid,b\.id,SESSION\.id\);/.test(src));
  ok('★ 單一名額取消也走淨額', /tkId=await grpNetDeductTicket\(bid, mid\);/.test(src));
  ok('★ 舊寫法（最近一筆扣課）已移除', !/l\.action==='deduct'&&mine\.has\(l\.ticket_id\)/.test(src));
  ok('　　案例與病根寫在程式裡', /取消兩個名額時原本都退到「最近一筆扣課」那張：\n\s*第一張多退一堂、第二張的帳懸空/.test(src));

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
