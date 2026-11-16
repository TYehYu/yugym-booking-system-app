/* P0-C／P0-E 前端整合（2026-11）：調課改走 fn_move_booking_ticket、簽到／撤銷／取消與效期的前端配合、錯誤訊息。
   資料庫行為由 docs/testdb 的 SQL 測試在測試庫驗證；這支只守前端：
   ① 調課只有 RPC 一條路，沒有可繞過的舊寫入 ② 錯誤碼（MOVE.*／TKWIN.*／HOLD.*／CONTRACT.*／AUTH.*）都有人話
   ③ 簽到／撤銷／補簽／名冊／團課簽到後會清票券快取 ④ 取消不清除或重算「簽到啟用」的效期 ⑤ 規則複本防漂移雜湊。 */
const fs=require('fs'), crypto=require('crypto');
const ROOT=process.env.HOME+'/Projects/yugym-booking-system-app';
const src=fs.readFileSync(ROOT+'/index.html','utf8');
const rd=p=>fs.readFileSync(ROOT+'/'+p,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const md5=s=>crypto.createHash('md5').update(s,'utf8').digest('hex');
function grabFn(name){
  let i=src.indexOf('async function '+name+'('); if(i<0) i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到 '+name);
  let d=0,k; for(k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{') d++; else if(src[k]==='}'){ d--; if(d===0) break; } }
  return src.slice(i,k+1);
}

console.log('① 調課只有 RPC 一條路');
const DO=grabFn('_doBkMoveTicket');
ok('★★★ 只有一次 sb.rpc、呼叫 fn_move_booking_ticket', (DO.match(/sb\.rpc\(/g)||[]).length===1 && /sb\.rpc\('fn_move_booking_ticket'/.test(DO));
ok('★★★ 沒有 dbPut／dbDel／logTicket／sb.from／直接改 ticket_id、status、pending_contract', !/dbPut\(|dbDel\(|logTicket\(|sb\.from\(|\.ticket_id\s*=[^=]|\.status\s*=[^=]|pending_contract\s*=[^=]/.test(DO));
ok('★★ 全檔沒有第二個會直寫調課的入口（舊流程的特徵：to.ticket_id=from.ticket_id）', !/to\.ticket_id\s*=\s*from\.ticket_id/.test(src));
ok('★★ 未連雲端就停止，不退回本機寫入', /if\(!\(CLOUD && typeof sb!=='undefined' && sb\)\)\{ showToast\('目前未連線雲端，無法調課'\); return; \}/.test(DO));
ok('★★ 成功後清 bookings、member_tickets、ticket_logs 快取（RPC 繞過 dbPut）', /dbCacheClear\(\['bookings','member_tickets','ticket_logs'\]\)/.test(DO));
ok('★★ 既有 UI 沒變：入口、候選、模式選擇、防連點都還在', /function openBkMoveTicket\(|async function openBkMoveTicket\(/.test(src) && /async function bkMoveCandidates\(/.test(src) && /function mvMode\(/.test(src) && /onceAct\('bkmove:'/.test(src));

console.log('\n② 錯誤訊息');
const MF=new Function(grabFn('moveErrMsg')+';return moveErrMsg;')();
const patch=rd('docs/migrations/20261116_p0e_move_ticket_tkwin_patch.sql');
const body=patch.slice(patch.indexOf('$fn$')+4, patch.indexOf('$fn$',patch.indexOf('$fn$')+4));
const codes=[...new Set([...body.matchAll(/'((?:MOVE|AUTH)\.[A-Z_]+)'/g)].map(m=>m[1]))].filter(c=>c!=='MOVE.%');
ok('★★★ RPC 會回的每一個錯誤碼都有專屬中文訊息（不落到「調課失敗：代碼」）', codes.length>=25 && codes.every(c=>!MF(c).startsWith('調課失敗：')), codes.filter(c=>MF(c).startsWith('調課失敗：')));
ok('★★ MOVE.BUSY 提示稍後再試、MOVE.INTERNAL_ERROR 說明資料沒有被更動', /稍後/.test(MF('MOVE.BUSY')) && /沒有被更動/.test(MF('MOVE.INTERNAL_ERROR')));
ok('★★★ LEDGER 類錯誤明講「請洽管理員（請勿重試）」', ['MOVE.LEDGER_MISSING','MOVE.LEDGER_UNSUPPORTED','MOVE.TO_LEDGER_DIRTY'].every(c=>/請勿重試/.test(MF(c))));
ok('★★★ TKWIN.OUT_OF_WINDOW 帶最晚日期與「首次簽到後才起算」', /2026\/11\/26/.test(MF('TKWIN.OUT_OF_WINDOW:2026-11-20:2026-11-26')) && /首次簽到/.test(MF('TKWIN.OUT_OF_WINDOW:2026-11-20:2026-11-26')));
ok('★★★ HOLD.MONTH_LIMIT 帶日期，並提示可改選「取消那一堂」——只提示，不自動切換', /2026\/11\/30/.test(MF('HOLD.MONTH_LIMIT:2026-11-30')) && /取消那一堂/.test(MF('HOLD.MONTH_LIMIT:2026-11-30')) && !/mvMode\('cancel'\)/.test(DO));
ok('★★ CONTRACT.* 與未知代碼都有安全的訊息', /合約/.test(MF('CONTRACT.NOT_PENDING')) && /調課失敗：/.test(MF('SOMETHING.ELSE')));
{ // dbFriendlyError：預約／帳本寫入撞到 TKWIN（直寫路徑）也要是人話
  const f=new Function('const DB_LABEL={};const tbl=x=>x;const authExpired=()=>{};const console={error(){}};'+src.slice(src.indexOf('function dbFriendlyError('), src.indexOf('async function dbGet(store,id)'))+';return dbFriendlyError;')();
  const e=f({message:'TKWIN.OUT_OF_WINDOW:2026-11-20:2026-11-26'},'bookings','儲存');
  ok('★★★ dbFriendlyError：TKWIN 轉成人話（含最晚日期）、保留原始訊息與代碼', /2026\/11\/26/.test(e.message) && !/TKWIN/.test(e.message) && /TKWIN\.OUT_OF_WINDOW/.test(e.rawMessage) && e.code==='TKWIN.OUT_OF_WINDOW', e.message);
  const e2=f({message:'HOLD.MONTH_LIMIT:2026-11-30'},'bookings','儲存');
  ok('★★ 原有 HOLD.MONTH_LIMIT 翻譯不受影響（此檔沒有該翻譯時不適用）', !/HOLD\.MONTH_LIMIT/.test(src.slice(src.indexOf('function dbFriendlyError('), src.indexOf('async function dbGet(store,id)'))) || (/2026\/11\/30/.test(e2.message) && e2.code==='HOLD.MONTH_LIMIT'));
}
ok('★★ 建立預約的 RPC 路徑也認得 TKWIN', /TKWIN\.OUT_OF_WINDOW'\)===0\)\{/.test(grabFn('rpcBookingErrMsg')));

console.log('\n③ 簽到／撤銷／補簽後清票券快取（效期由資料庫觸發器啟用或重算）');
const CLR="dbCacheClear(['member_tickets','ticket_logs']);";
ok('★★★ 撤銷簽到（兩個入口）', (grabFn('_undoCheckin').includes(CLR)) && grabFn('undoCheckinDirect').includes(CLR));
ok('★★★ 備援直寫簽到', /await dbPut\('bookings',b\);\s*\n\s*dbCacheClear\(\['member_tickets','ticket_logs'\]\);[^\n]*\n\s*if\(_clvTk\)/.test(src));
ok('★★ 補簽', grabFn('submitMakeup').includes(CLR));
ok('★★ 名冊逐人切換', grabFn('bkRosterToggle').includes(CLR));
ok('★★ 團課座位簽到切換', grabFn('_toggleGroupAttend').includes(CLR));
ok('★★ RPC 簽到成功後本來就清 member_tickets（維持）', /rpc\('fn_checkin_booking'[\s\S]{0,300}?dbCacheClear\(\['bookings','member_tickets','ticket_logs','notifications'\]\)/.test(src));

console.log('\n④ 取消不清除或重算「簽到啟用」的效期；預約不啟用');
ok('★★★ 單人取消退堂：效期自癒只處理舊制票（activation_mode==checkin 的票直接略過）；退款本身走原子 RPC', /if\(t\.activation_mode==='checkin'\) return;/.test(grabFn('refundTicketDateRevertOnly')) && /rpc\('fn_refund_ticket'/.test(grabFn('refundTicket')) && /refundTicketDateRevertOnly\(ticket_id, booking_id\)/.test(grabFn('refundTicket')));
ok('★★★ 團課取消：首堂取消的重算也只處理舊制票', /tk\.activation_mode!=='checkin'/.test(src));
ok('★★★ 預約扣堂不再啟用效期（deductTicket 不呼叫 activateTicketIfNeeded）', !/await activateTicketIfNeeded\(/.test(grabFn('deductTicket')) && (src.match(/activateTicketIfNeeded\(/g)||[]).length===1);

console.log('\n⑤ 規則複本防漂移（RPC 的票種與時段規則逐條對應這些前端函式；改動任何一支都必須回頭核對 RPC 4a／4b）');
const pins={ bkTicketTypeOk:'75a7e48d18102ab23f57d684320267de', bkIsMergedPT:'c167c837459874da9b475131300ff4e2', bkIsPtVoucherType:'161f024686df8ec4e4bf7728f81d2b4c',
  tkTypeOkFor:'584b64262be78a3f95fdbc6eddaecab0', ticketCategoryOf:'bb5df5ad62fe43c5f2887eb9735e171f', categoryOfTypeId:'cd6b840a05facf1120163d0012c4a651',
  tkTimeOk:'08024b300057fda7be05eb967e002435', tkOkForSlot:'033b04473647686554618c6ec1a8224d', bkTypeIdOf:'e4ac63231970bb28856de15b7942b716' };
const bad=Object.keys(pins).filter(n=>md5(grabFn(n))!==pins[n]);
ok('★★★ 九支規則函式的雜湊與 RPC 檔頭記錄（master bd9a714）一致', bad.length===0, bad);
ok('★★ 限時段結束時間常數仍是 18:00（1080 分）', /const TK_TIME_END_MIN\s*=\s*1080/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
