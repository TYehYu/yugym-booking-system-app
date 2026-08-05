/* 2026-08-04 使用者指示：「財務的退款紀錄改成課程修改紀錄，畫面改成月曆的模式，
   點每一天跳出視窗顯示當天的修改內容」

   內容＝ticket_logs 的 refund（退課/取消退票）與 adjust（餘額校正、業績歸屬調整…）；
   日常扣課（deduct）不列。月曆逐日徽章（紅＝退款、金＝調整），點日期開當天明細。
   已在瀏覽器實測：徽章數、今天金框、當日視窗列數與標籤。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 2026-08-05 整合：分頁列只留 本月/今天/人員，課程修改紀錄改由「本月」頁快捷鈕進入 */
ok('★ 課程修改紀錄仍可進入（快捷鈕＋路由分支）',
   /onclick="setFinTab\('refunds'\)">課程修改紀錄<\/button>/.test(src)
   && /else if\(_finTab==='refunds'\) await finRefunds\(\);/.test(src)
   && !/label:'退款紀錄'/.test(src));
ok('★ 內容範圍：refund＋adjust（日常 deduct 不列）',
   /filter\(l=>l\.action==='refund'\|\|l\.action==='adjust'\)/.test(src));
ok('★ 台北日界線歸日（UTC 時戳 +8 小時再切日期）',
   /new Date\(d\.getTime\(\)\+8\*3600000\)\.toISOString\(\)\.slice\(0,10\)/.test(src));
ok('★ 月曆格：有紀錄的日期掛徽章、可點',
   /class="frc-cell\$\{list\.length\?' frc-has':''\}/.test(src)
   && /onclick="openFinRefDay\('\$\{ds\}'\)"/.test(src));
ok('★ 徽章色階：退款紅、調整金', /\.frc-n-r\{right:5px;background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.frc-n-a\{right:27px;background:var\(--gold-d,#b48a56\);\}/.test(src));
ok('★ 當日視窗：時間/類型標籤/會員/方案/堂數/原因/經手人',
   /function openFinRefDay\(ds\)\{/.test(src)
   && /\$\{l\.action==='refund'\?'退回':'調整'\}/.test(src)
   && /經手：\$\{esc\(D\.staffMap\[l\.operator\]\|\|l\.operator\|\|'—'\)\}/.test(src));
ok('★ 月份可前後切換', /function finRefMonthMove\(d\)\{/.test(src));
ok('　　內容定義寫在程式裡', /一般的預約扣課（deduct）是日常營運不列/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
