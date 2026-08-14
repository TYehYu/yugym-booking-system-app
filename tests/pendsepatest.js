/* 2026-08-14 使用者定案：「每次預約都要分開——除非連續預約跟分期保留才顯示在一起，
   下一張新的續約不應該牽扯舊票」＋「待簽約取消就應該只取消，不應該還有退回票券」。
   三處：①明細不拿排滿的舊票畫待簽約課 ②票券夾紅虛線不畫待簽約課
   ③取消的 refundLegacyBooking 備援退場（溢退根因：陳秀蘭 +3/+6、羅秋菊 +12）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('① 預約明細：待簽約課只有「還有沒用完的票」才畫票券卡（林韋綺 第 9/8 堂案例）');
ok('★★ 備援挑到的票要有剩餘、或分期還有未開通額度，否則不畫',
   /if\(_tkCard && b\.pending_contract && !b\.ticket_id\)\{/.test(src)
   && /if\(!\(\(Number\(_tkCard\.sessions_remaining\)\|\|0\)>0 \|\| _iH\)\)\{ _tkCard=null; _wSlotD=null; \}/.test(src));
ok('★ 保留卡說明分兩種：真分期講分期、其餘講待簽約（不再對非分期票錯掛分期說明）',
   /本堂為<b>分期繳費保留<\/b>/.test(src) && /本堂為<b>待簽約保留<\/b>/.test(src)
   && /\$\{_isHoldCard\?\(isInstall2&&unlocked2<total/.test(src));

console.log('\n② 票券夾：紅虛線「需補票」不含待簽約課（它們等的是下一張票，不是欠票）');
ok('★★ leftover 過濾 pending_contract',
   /const leftover=live\.filter\(b=>!byBooking\[b\.id\] && b\.status==='booked'\n\s*&& !b\.pending_contract/.test(src));
ok('　　理由寫在程式裡', /下一張新的續約不應該牽扯舊票/.test(src));

console.log('\n③ 取消流程：refundLegacyBooking 備援退場（沒扣過課的取消＝只取消）');
ok('★★ confirmCancelBooking 不再呼叫 refundLegacyBooking',
   (()=>{ const i=src.indexOf('async function confirmCancelBooking');
     const F=src.slice(i, src.indexOf('\n}\n', i));
     return i>=0 && !/refundLegacyBooking\(/.test(F); })());
ok('★ 退場理由寫在原地（含 7/26 基線口徑）',
   /「沒綁票就回頭找一張票退」的備援（refundLegacyBooking）2026-08-14 退場/.test(src)
   && /7\/26 基線改成「預約中不預扣」後/.test(src));
ok('★ 有綁票的取消照常退（refundTicket 路徑沒動）',
   /refundedCount=\(await refundTicket\(b\.ticket_id,b\.id,SESSION\.id\)\)\?1:0;/.test(src));
ok('★ 團課有 deduct 帳本的照常退',
   /if\(await refundTicket\(log\.ticket_id,b\.id,SESSION\.id\)\) refundedCount\+\+;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
