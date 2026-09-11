/* 沒扣過的那一堂，取消時不可以退（2026-08-26 使用者回報）
   「剛剛把林韋綺10/4這堂超約的取消　可是這堂課本來就是多約的　取消的時候卻出現退回票券
     這會讓我誤以為退回後他會多一張票券」

   實際比誤會更嚴重：那一堂是超約（從來沒扣過那張票），取消卻寫了一筆 refund +1，
   票券餘額憑空從 5 變成 6 —— 與 0810 那批溢退同源。

   成因：判斷「要不要問退不退」只看 `!b.ticket_id`。超約的課 ticket_id 有值
   （排課當下綁上去了），帳本卻沒有 deduct，於是走進「退回票券／扣課不退」那張表。

   三處一起補：畫面（不問退不退）、前端寫入（沒扣過就不退）、
   DB 的 benefit_refund（RPC 那條路的同一個洞）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const CFM=src.slice(src.indexOf('async function confirmCancelBooking(id){'),
                    src.indexOf('/* 2026-07-29 使用者定案（取消政策三修）'));
const CB=src.slice(src.indexOf('async function cancelBooking(id, refundMode, opts){'),
                   src.indexOf('let refundedCount=0, refundMissed=false;')+2000);

console.log('畫面：不再問「退回票券／扣課不退」');
ok('★★ 綁了票但帳本沒扣過 → 也算 noTicket（原本只看 !b.ticket_id）',
   /const _neverDeducted = !!b\.ticket_id && !bkIsGroup\(b\) && !_netUnknown && _selfNetDeduct<=0;/.test(CFM)
   && /const noTicket = \(\(!b\.ticket_id && _grpNetDeduct<=0\) \|\| _neverDeducted\) && !_netUnknown;/.test(CFM));
/* 2026-09-11 江旻季 9/10：畫面這一層也改問資料庫（bkNetDeductDB），不再 filter 整表快取 */
ok('★★ 淨扣課用帳本算（deduct − refund，只看這一筆預約在這張票上的）——直接問資料庫',
   /const _n=await bkNetDeductDB\(b\.id, b\.ticket_id\);/.test(CFM));
ok('★★ 文案講清楚「不會退回任何堂數」，不要讓人以為會多一張票',
   /* 2026-09-11 收斂成短句；「不會退回任何堂數」保留粗體（那是要讓人看到的後果） */
   /這一堂<b>沒有扣過票<\/b>，<b>不會退回任何堂數<\/b>/.test(CFM));
ok('★ 已經退回過的（教練請假）另外講一句，不要跟「從沒扣過」混為一談',
   /堂數<b>已經退回過了<\/b>（例如教練請假），不會再退一次/.test(CFM));
ok('　　團課不走這條（團課的票在 ticket_logs、不在 ticket_id）',
   /if\(b\.ticket_id && !bkIsGroup\(b\)\)\{/.test(CFM));

console.log('\n寫入：再擋一次');
/* 2026-09-07：帳本改成直接問資料庫（bkNetDeductDB），不再 filter 整表快取 ——
   王秋香 9/12 那一堂就是因為快取少一列而靜靜沒退。
   而且「查得到、真的沒扣過」那條路從 console.warn 升級成警示帳＋吐司。 */
ok('★★ 真的要退之前先問帳本，沒淨扣就不退',
   /const _net=await bkNetDeductDB\(b\.id, b\.ticket_id\);/.test(CB)
   && /\}else if\(_net>0\)\{\s*\n\s*refundedCount=\(await refundTicket\(b\.ticket_id,b\.id,SESSION\.id\)\)\?1:0;/.test(CB)
   && /console\.warn\('取消未退課：這一堂在該票券上沒有淨扣課紀錄'/.test(CB));
ok('★★ 問不到（null）不等於沒扣過 —— 保守起見照退，不要吃掉客人一堂',
   /if\(_net===null\)\{/.test(CB) && /保守起見照退/.test(CB));
ok('★★ 沒退成不再是靜悄悄的：留警示帳＋當面說一聲',
   /取消未退課：帳本上查不到這一堂的淨扣課/.test(CB)
   && /已取消但沒有退回堂數/.test(CB));
ok('　　為什麼要擋兩層（refundMode=force 可能從別的呼叫端進來）',
   /畫面那一層已經不會問退不退了，但 refundMode='force'\s*\n\s*也可能從別的呼叫端進來/.test(CB));

console.log('\n判準與別處一致');
ok('★★ 完全沒有帳本紀錄的（舊匯入）也算沒扣過 —— 匯入時餘額已經反映過那些課',
   /完全沒有帳本紀錄的（舊匯入）\s*\n\s*也算沒扣過 —— 匯入時的餘額已經反映過那些課，再退一次就是溢退/.test(CFM));
ok('　　使用者原話與實際後果寫在原地',
   /這會讓我誤以為退回後他會多一張票券/.test(CFM)
   && /真的退了，票券餘額憑空多一堂（與 0810 那批溢退同源）/.test(CFM));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
