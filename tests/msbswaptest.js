/* 2026-08-03 使用者回報（陳蘭馨）：「自主訓練點數今天已經先預約好了，但手機端在操作
   快速預約的時候沒有看到其他時間 —— 雖然點數已經預約滿了，但應該要有能夠調整時間
   的彈性，我記得有這個功能才對。」

   那個功能（換時段：點數用完仍可挑新時段、把既有預約換過來）確實在，但分頁的
   顯示條件多卡了一條「沒有友善點才顯示」。陳蘭馨手上剛好有一張當天到期的友善點，
   於是：自主訓練點數全部排掉 → groups.self 空 → 預設分頁變成「友善」→
   換時段分頁因為友善點存在而整個不見。她看到的就是只剩今天（友善點當天到期）
   的時段，像是「沒有其他時間」。友善點是另一個口袋，不該擋到換時段。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 換時段分頁的顯示條件');
ok('★ 只要「self 點數用完＋有未來預約」就顯示，不再看友善點',
   /else if\(\(s\.futureSelf\|\|\[\]\)\.length\) btns\.push\(`<button class="\$\{s\.type==='self'\?'on':''\}" onclick="msbSetType\('self'\)">自主訓練（換時段）<\/button>`\);/.test(src)
   && !/!s\.groups\.friendly\.length && \(s\.futureSelf\|\|\[\]\)\.length/.test(src));
ok('　　陳蘭馨的案例寫在程式裡（友善點是另一個口袋，不該擋到這裡）',
   /她手上剛好有一張當天到期的友善點，換時段分頁就整個不見/.test(src));
ok('　　有 self 點數時仍顯示點數分頁（不會兩個都出現）',
   /if\(s\.groups\.self\.length\) btns\.push\(`<button class="\$\{s\.type==='self'\?'on':''\}" onclick="msbSetType\('self'\)">自主訓練（\$\{sum\(s\.groups\.self\)\} 點）<\/button>`\);/.test(src));

console.log('\n② 換時段模式本身（原有行為不退化）');
ok('★ 判定：目前分頁沒有可用點數、但有未來自主預約',
   /function _msbSwapMode\(\)\{/.test(src)
   && /return !msbGroupTks\(\)\.some\(t=>\(Number\(t\.sessions_remaining\)\|\|0\)>0\) && \(s\.futureSelf\|\|\[\]\)\.length>0;/.test(src));
ok('★ 換時段不看票券效期（點數已扣，日期不受效期框限）',
   /if\(_msbSwapMode\(\)\) return true;   \/\/ 換時段：同改期語意，不看票券效期/.test(src));
ok('★ 提示文字講清楚玩法（點新時段 → 選要換哪一筆）',
   /點數已用於現有預約——點選新時段，選擇要把哪一筆換過來/.test(src));
ok('★ 換過去走改期 RPC（不扣不退，DB 驗 24 小時與衝突）',
   /sb\.rpc\('fn_member_self_reschedule',\{p_booking_id:bid,p_date:s\.date,p_start_time:t,p_venue_unit:vbk\.venue_unit\|\|null\}\)/.test(src));
ok('★ 完全沒有點數也沒有預約時，才顯示「尚未有點數」的空狀態',
   /if\(!s\.hasPoints && !s\.hasGrp && !\(s\.futureSelf\|\|\[\]\)\.length && !s\.resched\)\{/.test(src));
ok('　　空狀態若有未來預約，列出改期／取消入口',
   /<button class="btn btn-ghost btn-sm" onclick="msbStart\('\$\{b\.id\}'\)">改期<\/button>/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
