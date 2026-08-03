/* 2026-08-03 使用者回報（林秋香案例）：「週四 19:00 跑步機移到 18:00，這時段也有
   跑步機可以預約，卻跳出訊息要我改團課教室」

   兩件事疊在一起：①18:00–19:00 多功能區在 18:30 滿（兩堂回推＋一堂明確佔位）
   ②venue_pref 只存在記憶體、不入庫 —— 既有預約改期時是空的，重新配置走
   多功能→教室→跑步機 的預設順位，多功能一滿就推教室，完全不知道這筆本來要跑步機。
   修正：已在跑步機上的預約（venue_unit=treadmill_*）改期時自動視為指定跑步機；
   用區域變數不寫回 bk（表沒有 venue_pref 欄，寫回會讓 dbPut 整筆 PGRST204）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

ok('★ 改期沿用跑步機（區域變數 _vpref，不寫回 bk）',
   /const _vpref = bk\.venue_pref \|\| \(\(bk\.id && String\(bk\.venue_unit\|\|''\)\.startsWith\('treadmill'\)\)\?'treadmill':null\);/.test(src)
   && /const alloc = allocateVenue\(bk\.category, sameDay, ns, ne, bk\.id, _vpref\);/.test(src));
ok('★ 為什麼不能寫回 bk，寫在程式裡', /寫回會讓後續 dbPut 整筆失敗（PGRST204）/.test(src));
ok('　　新預約行為不變（venue_pref 有值時優先用它）', /bk\.venue_pref \|\|/.test(src));
ok('　　自主訓練的順位定案沒動（多功能→教室→跑步機）',
   /if\(category==='自主訓練'\) return \['multi','group','treadmill'\];/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
