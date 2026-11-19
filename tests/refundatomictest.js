/* 原子退票（2026-11 決策：非原子的 refundTicket 改走資料庫 RPC fn_refund_ticket）
   沙箱實跑前端 refundTicket（假的 sb.rpc），確認：只走 RPC、不再直寫票券餘額、各種回應都有正確處置與訊息。
   資料庫端行為（鎖、帳本判斷、冪等、回滾）由 docs/testdb/p0e/p0e_12_quota_refund_tests.sql 驗證（尚未執行）；
   併發由 docs/testdb/concurrency/run_concurrency.sh 驗證（尚未執行）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i)+b.length);};
const RT=g('async function refundTicket(ticket_id,booking_id,operator){','\n}\n');
const MSG=g('const REFUND_MSG={',' };\n');
function mk(resp){
  const calls=[], toasts=[], dates=[]; let cleared=null;
  const sbf={rpc:async(n,a)=>{ calls.push({n,a}); if(resp instanceof Error) throw resp; return resp; }};
  const f=new Function('sb','CLOUD','dbCacheClear','showToast','refundTicketDateRevertOnly','console',
    g('function bookingAccountErrMsg(','\n}\n')+'\n'+MSG+'\n'+RT+'\nreturn refundTicket;')(sbf,true,t=>{cleared=t;},m=>toasts.push(m),async(...a)=>{dates.push(a);},{error(){}});
  return {f,calls,toasts,dates,cleared:()=>cleared};
}
(async()=>{
console.log('正常取消退款');
{ const m=mk({data:{ok:true,refunded:true,remaining_after:4},error:null});
  eq('★ 回傳 true（這次真的退了）', await m.f('T1','B1','EMP'), true);
  eq('★★ 只呼叫 fn_refund_ticket，帶票券與預約 id', m.calls, [{n:'fn_refund_ticket',a:{p_ticket_id:'T1',p_booking_id:'B1'}}]);
  eq('　 RPC 繞過 dbPut → 票券與帳本快取要丟掉', m.cleared(), ['member_tickets','ticket_logs']);
  eq('　 舊制票的效期後處理只呼叫一次（窄更新，不碰餘額）', m.dates, [['T1','B1']]);
  eq('　 沒有任何警示', m.toasts, []); }
console.log('\n重複取消／已退款（冪等）');
{ const m=mk({data:{ok:true,refunded:false,reason:'ALREADY_REFUNDED'},error:null});
  eq('★★★ 已完全退款：回 false、不再退、不提示、不動效期', [await m.f('T1','B1','EMP'),m.toasts.length,m.dates.length], [false,0,0]); }
console.log('\n拒絕自動退款（保留人工查核）');
for(const [code,kw] of [['REFUND.NO_DEDUCT','沒有扣課紀錄'],['REFUND.ONLY_ADJUST','只有調整紀錄'],['REFUND.ONLY_REFUND','只有退款紀錄'],['REFUND.OVER_REFUNDED','退得比扣得多'],['REFUND.BALANCE_FULL','堂數已是滿的'],['REFUND.FORBIDDEN','自己課堂'],['REFUND.BUSY','稍後重試'],['REFUND.INTERNAL_ERROR','資料沒有被更動']]){
  const m=mk({data:{ok:false,error_code:code},error:null});
  const r=await m.f('T1','B1','EMP');
  ok(`★ ${code}：回 false、提示「${kw}」、不動效期`, r===false && m.toasts.length===1 && m.toasts[0].includes(kw) && m.dates.length===0, m.toasts);
}
console.log('\n失敗路徑（不留半套、不假裝成功）');
{ const m=mk({data:null,error:{message:'boom'}});
  eq('★ RPC 回 error：false、提示補退、不動效期', [await m.f('T1','B1','E'),m.toasts.length,m.dates.length], [false,1,0]); }
{ const m=mk(new Error('net'));
  eq('★ RPC 丟例外：false、提示連線失敗', [await m.f('T1','B1','E'),/連線失敗/.test(m.toasts[0]||'')], [false,true]); }
{ const m=mk({data:{ok:true,refunded:true},error:null});
  eq('★ 缺預約 id：不打 RPC、回 false', [await m.f('T1',null,'E'),m.calls.length], [false,0]); }
console.log('\n程式碼層級：沒有直寫路徑');
{ const code=(RT+MSG).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  ok('★★★ refundTicket 不再讀票券、不再改 sessions_remaining、不再 dbPut／logTicket', !/dbGet|dbPut|logTicket|sessions_remaining/.test(code), code.match(/dbGet|dbPut|logTicket|sessions_remaining/));
  const RD=g('async function refundTicketDateRevertOnly(ticket_id, booking_id){','\n}\n');
  ok('★★★ 效期後處理有 P0-E 保護（activation_mode==="checkin" 的票不動）', /if\(t\.activation_mode==='checkin'\) return;/.test(RD));
  ok('★★★ 效期後處理改窄更新 tkPatchDates，不再整列 dbPut（不會把舊餘額寫回去）', /tkPatchDates\(t\)/.test(RD) && !/dbPut\('member_tickets'/.test(RD));
  const PD=g('async function tkPatchDates(t){','\n}\n');
  ok('★★ tkPatchDates 只寫效期四欄，沒有 sessions_remaining／status', /update\(\{activated_at:[^}]*start_date:[^}]*expire_date:[^}]*note:[^}]*\}\)/.test(PD) && !/sessions_remaining|status/.test(PD.replace(/\/\*[\s\S]*?\*\//g,'')));
  ok('★ 沒有其他地方還在用 refundTicket 的舊簽名行為（呼叫端全部保持 await refundTicket(票,預約,操作人)）', (src.match(/await refundTicket\(/g)||[]).length>=8); }
console.log('\n資料庫端檔案（只建檔、尚未執行）');
{ const r=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20261118_fn_refund_ticket.sql','utf8');
  ok('★ RPC：先鎖預約再鎖票券（鎖定順序一致）', r.indexOf("from bookings where id = p_booking_id for update")>0 && r.indexOf("from member_tickets where id = p_ticket_id for update")>r.indexOf("from bookings where id = p_booking_id for update"));
  ok('★ RPC 重用 P0-E fn_tk_refund_once（不寫第二套退款核心）', /public\.fn_tk_refund_once\(p_ticket_id, p_booking_id/.test(r));
  ok('★ 七種拒絕／冪等結果都有', ['NO_DEDUCT','ONLY_ADJUST','ONLY_REFUND','OVER_REFUNDED','ALREADY_REFUNDED','BALANCE_FULL','FORBIDDEN'].every(k=>r.includes(k)));
  ok('★ 只授權 authenticated', /revoke all on function public\.fn_refund_ticket\(text, text, text\) from public, anon, authenticated, service_role;/.test(r) && /grant execute on function public\.fn_refund_ticket\(text, text, text\) to authenticated;/.test(r) && !/grant execute[^;]*(anon|service_role)/.test(r));
  ok('★ 例外一律整筆回滾（exception 區塊、不吞半套）', /exception\s+when lock_not_available[\s\S]*when others then/.test(r));
  const b=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20261118_benefit_refund_lock.sql','utf8');
  ok('★ benefit_refund 補鎖：先鎖票券列再算淨額（修雙退風險）', b.indexOf('for update')>0 && b.indexOf('for update')<b.indexOf('select coalesce(sum('));
  ok('　 benefit_refund 其餘邏輯不變（仍是淨額＞0 才退、備註取消返還原票）', /if v_net <= 0 then/.test(b)&&/取消返還原票/.test(b)); }
console.log(`\n✓ ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
})();
