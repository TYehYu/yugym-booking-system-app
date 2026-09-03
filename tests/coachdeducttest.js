/* 教練排課扣不到票（2026-09-03 使用者回報 → 定案「教練應該要能自己安排課程」）

   Zoe 用手機幫曾香瑾排 9/11 14:00，一直跳「扣課失敗，這一堂沒有建立（票券未被扣）」。
   查下來與時段、場地、票券餘額都無關 —— 是**權限不對稱**：
     ・bookings 有 bk_coach_write（教練寫得了自己的課）
     ・member_tickets／ticket_logs 只給 is_staff_desk()（管理員／櫃檯／店長教練）
   所以預約建得起來、接著的扣課被 RLS 擋掉，0902 加的「全有或全無」就把預約回滾。
   （Sandy 是唯一 is_manager=true 的教練，也就是全店只有她扣得動。）

   ⚠ 修法刻意**不放寬 RLS**：那會讓教練能直接改任何人的票券餘額。
     改走 SECURITY DEFINER 的 fn_deduct_ticket，授權判斷在伺服器端。
   ⚠ 「全有或全無」那條防線不能拿掉 —— 沒有它就會退回 0901 的老問題：
     預約建了、票沒扣，帳面上多出一堂沒人發現。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const F=src.slice(src.indexOf('async function deductTicket('), src.indexOf('// 退一堂'));

console.log('① 教練走 RPC，櫃檯以上維持原路');
ok('★★★ 只有非櫃檯層級才走 RPC（櫃檯／管理員那條已上線很久，不在這次一起換）',
   /if\(!isDeskLike\(\)\)\{\s*\n\s*const \{data,error\}=await sb\.rpc\('fn_deduct_ticket',\{/.test(F)
   && /await dbPut\('member_tickets',ticket\);\s*\n\s*await logTicket\(ticket\.id,'deduct',-1,booking_id,operator,_note\);/.test(F));
ok('★★ 兩條路寫的是同一句備註（不要各寫一份，日後改文案會漏）',
   (F.match(/const _note='預約扣課'\+\(newExpire\?`（首堂開通，效期至 \$\{newExpire\}）`:''\);/g)||[]).length===1
   && (F.match(/p_note:_note/g)||[]).length===1
   && (F.match(/operator,_note\)/g)||[]).length===1);
ok('★★ 效期由前端算好再帶進去（規則在 activateTicketIfNeeded／termExpire，不搬進 SQL）',
   /p_start_date:ticket\.start_date\|\|null, p_expire_date:ticket\.expire_date\|\|null,\s*\n\s*p_activated_at:ticket\.activated_at\|\|null/.test(F)
   && /const newExpire=await activateTicketIfNeeded\(ticket,booking_id\);/.test(F));

console.log('\n② 失敗時不能留下假象');
ok('★★★ 沒扣成要把記憶體裡先減掉的餘額還原',
   /ticket\.sessions_remaining\+=1;\s*\/\/ 沒扣成就把記憶體裡的餘額還原/.test(F));
ok('★★★ 回 false —— 呼叫端靠它決定要不要回滾預約（0902 的「全有或全無」）',
   /return false;\s*\n\s*\}\s*\n\s*return true;/.test(F)
   && /if\(!_ded\)\{/.test(src)
   && /扣課失敗，這一堂沒有建立（票券未被扣）/.test(src));
ok('★★ 錯誤碼翻成看得懂的話（RPC 只回代碼，櫃檯看不懂 NOT_YOUR_BOOKING）',
   /NOT_YOUR_BOOKING:'只能扣自己課堂的票（請櫃檯協助）'/.test(F)
   && /NO_REMAINING:'票券已無剩餘堂數'/.test(F));
ok('★ 寫完清快取（不清的話畫面上的餘額還是舊的）',
   /dbCacheClear\(\['member_tickets','ticket_logs'\]\);/.test(F));

console.log('\n③ 成因與取捨寫在原地');
ok('★★★ 記下「沒有放寬 RLS」以及為什麼',
   /沒有放寬 RLS —— 那會讓教練能直接改任何人的餘額/.test(F));
ok('★★ 記下這次的實際案例（下次再遇到同樣訊息才查得回來）',
   /Zoe 用手機幫曾香瑾排 9\/11 14:00/.test(F)
   && /預約建得起來（bookings 有 bk_coach_write），/.test(F));
ok('★★ 記下伺服器端的授權界線（代課教練也算自己的課）',
   /非櫃檯層級只扣得動「自己那一堂」的票\s*\n\s*（代課教練也算自己的課）/.test(F));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
