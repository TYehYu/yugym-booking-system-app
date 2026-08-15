/* 2026-08-15 使用者回報：「停課的課程沒有跟著顯示停課」——
   團課課表（IG 限動圖）原本直接濾掉 cancelled，會員看不出哪一班停課。
   改成：停課照排格子、整格轉灰、掛深紅「停課」章；同時段已另開新班或重複取消不重畫。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

ok('★★ 取消的團課也組進 byDay（closed:true）',
   /bookings\.filter\(b=>bkIsGroup\(b\)&&b\.status==='cancelled'&&b\.date>=from&&b\.date<=to\)/.test(src)
   && /heads:0, max:1, closed:true\}\);/.test(src));
ok('★★ 同時段已另開新班就只畫新班（不重複）',
   /if\(list\.some\(a=>a\.date===b\.date&&String\(a\.start_time\|\|''\)\.slice\(0,5\)===t5\)\) return;/.test(src));
ok('★ 同時段多筆取消只畫一次', /if\(_gsSeen\.has\(key\)\) return; _gsSeen\.add\(key\);/.test(src));
ok('★★ 章配色（2026-08-15 使用者指定）：停課紅底白字、滿班金底、即將滿班綠底、整格轉灰',
   /const tag = it\.closed \? \{t:'停課',chip:true,bg:'#b5372e',fg:'#ffffff'\}/.test(src)
   && /it\.heads>=it\.max \? \{t:'滿班',chip:true,bg:'#b48a56',fg:'#3d2b12'\}/.test(src)
   && /it\.heads>0 \? \{t:'即將滿班',chip:true,bg:'#2e7d5b',fg:'#ffffff'\}/.test(src)
   && /x\.fillStyle=it\.closed\?'#8f8b84':'#1c1a17';/.test(src)
   && /x\.fillStyle=tag\.bg\|\|'#f08a3c';/.test(src) && /x\.fillStyle=tag\.fg\|\|'#4a1607';/.test(src));

ok('★ 無人報名的章改「招生中」（2026-08-15 使用者指示，原「歡迎報名」）',
   /: \{t:'招生中',chip:true\};/.test(src) && !/\{t:'歡迎報名'/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
