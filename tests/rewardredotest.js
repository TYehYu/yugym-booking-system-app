/* 取消簽到之後再簽到，自主訓練點數不會補發（2026-08-26 使用者回報：
   「黃麗琴 今天15:00友善教練課 簽到為什麼沒有自主訓練 跟自訂方案有關係嗎」
    「可是第一堂8/12簽到有給點數」）

   跟自訂方案無關 —— 8/12 與 8/26 是同一張票、同一個票種，只有一件事不同：
   8/26 那一堂被「簽到 → 取消簽到 → 再簽到」過。

   真因：發點的判斷在 DB 的 handle_checkin_reward，它第一行就是
     if b.reward_status <> 'pending' then return
   而前端取消簽到時只清了 reward_issued（前端自己的旗標），reward_status 留在 'issued'，
   於是第二次簽到在第一行就被擋掉。同一件事有兩個旗標，只重設一個等於沒重設。

   辨識方法：booking 的 reward_issued_at **早於** checked_in_at（正式庫當時 3 筆）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=(sig)=>{ const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
  return src.slice(i,k+1); };

const UNDO=grab('async function revokeCheckinReward(');
const CANC=grab('async function revokeRewardOnCancel(b){');

console.log('取消簽到：兩個旗標都要重設');
ok('★★ reward_status 要改回 pending（DB 的發點函式只看它）',
   /b\.reward_issued=false;\s*\n\s*b\.reward_status='pending';\s*\n\s*await dbPut\('bookings',b\);/.test(UNDO));
ok('★★ 只清 reward_issued 是不夠的 —— 原因寫在原地',
   /handle_checkin_reward，它第一行就是/.test(UNDO)
   && /同一件事有兩個旗標，只重設一個就等於沒重設/.test(UNDO));
ok('　　辨識症狀也寫下來（reward_issued_at 早於 checked_in_at）',
   /reward_issued_at 早於 checked_in_at/.test(UNDO));

console.log('\n整堂取消：狀態是 revoked，不是 pending');
ok('★★ 取消預約收回贈點時記 revoked',
   /b\.reward_issued=false;\s*\n\s*b\.reward_status='revoked';/.test(CANC));
ok('　　為什麼不是 pending（掛在已取消的課上會讓對帳誤判）',
   /pending 的語意是「還等著發」，掛在已取消的課上會讓對帳誤判/.test(CANC));

console.log('\n兩條路各自只動自己那一種');
ok('★ 取消簽到：沒用過的整張刪、用過的保留不收',
   /if\(used<=0\)\{/.test(UNDO) && /取消簽到，收回未使用的自主訓練券/.test(UNDO)
   && /此堂發放的自主訓練券已使用，未自動收回/.test(UNDO));
ok('★ 整堂取消：連同已排的自主訓練課一起收（贈點的前提消失了）',
   /隨 \$\{b\.date\}/.test(CANC) && /贈點回收/.test(CANC));
ok('★ 兩條都只收 source_booking_id 對得上的（不誤收別堂發的）',
   /t\.source==='checkin_grant' && t\.source_booking_id===b\.id/.test(UNDO)
   && /t\.source==='checkin_grant' && t\.source_booking_id===b\.id/.test(CANC));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
