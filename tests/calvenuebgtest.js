/* 桌機預約行事曆的格子底色改標場地狀態（2026-08-23 使用者指示：
   「桌機預約行事曆 背景改成統一基本改米色 場地額滿用淡化紅 還有教室可約用淡化金」）

   守三件事：
   ① 一定要用**全部**預約算場地，不能用畫面上看得到的那些（visible）——
      場地容量是全店共用的，被教練篩選濾掉的課照樣佔著位子。
   ② 舊的「友善課可約時段」淡藍（.fw-win）整組退場 —— 平日 18:00 前一律上色，
      半張表都是藍的，看不出哪裡真的排得下。規則本身沒變，仍由 validateBooking 把關。
   ③ 顏色要夠淡：課卡是白底＋課程色條，底色一深就會跟課卡搶視線。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('格子底色＝場地狀態');
ok('★★ 額滿→淡化紅、只剩教室→淡化金；其餘不上色（露出 .cal-body 的米底）',
   /if\(a && a\.error\) return ' cal-half-full';/.test(src)
   && /if\(a && a\.toVid==='group'\) return ' cal-half-grp';/.test(src)
   && /\.cal-half\.cal-half-full\{background:rgba\(181,55,46,\.17\);\}/.test(src)
   && /\.cal-half\.cal-half-grp\{background:rgba\(180,138,86,\.22\);\}/.test(src));
ok('★★ mc-mode（桌機管理員側欄版面）的 .cal-body 也要是米底 —— 那條 (0,2,1) 權重比 .cal-body 高，'
   +'留著 80% 白就會把米底整片蓋掉（0823 使用者回報「怎麼還有白色底的時段背景」）',
   /body\.mc-mode \.cal-body\{background:var\(--bg\);\}/.test(src));
ok('★★ 用全部預約算，不是用 visible —— 被教練篩選濾掉的課照樣佔場地',
   /const _vAll=\(bookings\|\|\[\]\)\.filter\(x=>x && x\.date===ds && x\.status!=='cancelled'\);/.test(src)
   && /場地容量是全店共用的，\s*\n\s*被教練篩選濾掉的課照樣佔著位子/.test(src));
ok('★ 判定走既有的 allocateVenue（與手機一日／七日同一支，不另寫一套）',
   /const a=allocateVenue\('私人教練', _vAll, mm, mm\+60, null\);/.test(src));
ok('　　只算需要場地的課別 —— 團課與場租不佔多功能／教室／跑步機那三池',
   /只算需要場地的課別（CAP_CATS）；團課與場租不佔多功能／教室／跑步機那三池/.test(src));
ok('　　allocateVenue 不在時整格不上色（不要整頁爆掉）',
   /if\(typeof allocateVenue!=='function'\) return '';/.test(src)
   && /\}catch\(_\)\{\}\s*\n\s*return '';/.test(src));

console.log('\n舊的友善課淡藍退場');
ok('★★ .fw-win 的樣式與產生端都拿掉了',
   !/\.cal-half\.fw-win\{/.test(src)
   && !/const fw=\(_fwDay&&\(min\+60\)<=1080\)\?' fw-win':'';/.test(src)
   && /const fw=_vState\(min\);/.test(src));
ok('　　沒有呼叫端的 _fwDay 一併清掉，並註明規則沒有跟著消失',
   !/const _fwDay=/.test(src)
   && /友善課的時段規則本身沒變，仍由 validateBooking 把關/.test(src));

console.log('\n不要蓋掉別的狀態');
ok('★ 打烊後不論場地狀態都是灰的',
   /\.cal-half\.cal-half-closed\.cal-half-full,\s*\n\.cal-half\.cal-half-closed\.cal-half-grp\{background:rgba\(0,0,0,0\.045\);\}/.test(src));
ok('★ 過去的日期整欄不上色（.cal-daycol.col-past 權重比新規則高）',
   /\.cal-daycol\.col-past \.cal-half\{background:transparent;\}/.test(src));

/* 窄卡「姓名直書」那組於 2026-08-23 當天還原（同日兩次都改壞：先字序顛倒、再整個不見）。
   守住「不要再原地補宣告」這件事：直書要與 -webkit-box 折行、container-query 字級、
   flex 置中三者相處，得先離線重現整條規則鏈量過再上。 */
ok('★★ 窄卡直書那組已整組移除（不留半套在正式環境）',
   !/writing-mode:vertical-rl/.test(src.slice(src.indexOf('.cal-ev.cal-ev-std'), src.indexOf('Calm Play · Hover')))
   && /窄卡「姓名直書」整組還原（2026-08-23，同日兩次都改壞）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
