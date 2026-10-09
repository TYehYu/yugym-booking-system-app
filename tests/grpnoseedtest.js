/* 當天一個人都還沒有的團課，會員不能自己報名（2026-10-09 使用者，逐步收斂）：
     「像這種當天的團體課　會員那邊還能夠預約嗎　應該要阻擋」
     →「完全沒有人報名的要阻擋」
     →「因為教練可能會有其他安排　不能臨時安插上課」
     →「但可以保留櫃檯端臨時加會員的權限　因為可以跟教練溝通過後　臨時加開」
     →「這一句只限當天的課程　如果會員要加隔天沒人報名的課程是可以的」

   ⚠ 真正的防線在資料庫（fn_member_join_group 的 BOOKING.NO_SEED，見
     docs/migrations/20261009_member_join_group_needs_seed.sql）；前端只是先說清楚。
   ⚠ 櫃檯／教練改名單不經過那支 RPC，臨時加開完全不受影響。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const fn=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  return src.slice(i, src.indexOf('\n}', i)+2); };

const {grpNoSeedToday}=new Function(
  "const TODAY=new Date('2026-10-09T00:00:00');"
 +"const ymd=d=>{const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());};"
 +"const mids=b=>Array.isArray(b&&b.member_ids)?b.member_ids:[];"
 +fn('grpLeaveSeats')+fn('grpLiveHeads')+fn('grpNoSeedToday')
 +'\nreturn {grpNoSeedToday};')();

const TODAY='2026-10-09', TOMO='2026-10-10';
console.log('① 只擋當天、而且真的沒人的那幾堂');
ok('★★★ 今天、0 人 → 擋', grpNoSeedToday({date:TODAY,member_ids:[]})===true);
ok('★★★ 今天、已經有 1 人 → 放行', grpNoSeedToday({date:TODAY,member_ids:['m1']})===false);
ok('★★★ 明天、0 人 → 放行（教練還有時間安排）', grpNoSeedToday({date:TOMO,member_ids:[]})===false);
/* 名單上只剩請假的人＝沒有人（與 grpLiveHeads 同一套） */
ok('★★★ 今天、名單 1 人但請假 → 等於沒人，擋',
   grpNoSeedToday({date:TODAY,member_ids:['m1'],attendance:{m1:'leave'}})===true);
ok('★★ 今天、2 人其中 1 人請假 → 還有人，放行',
   grpNoSeedToday({date:TODAY,member_ids:['m1','m2'],attendance:{m1:'leave'}})===false);
ok('★★ 空值不會炸', grpNoSeedToday(null)===false && grpNoSeedToday({date:TODAY})===true);

console.log('\n② 畫面：不藏起來，暗化＋寫原因（0823 定的語彙）');
ok('★★★ 報名卡暗化並寫「今天還沒有人報名，請洽櫃檯」',
   /const noSeed=!past && !far && grpNoSeedToday\(b\);/.test(src)
   && /noSeed\?'・今天還沒有人報名，請洽櫃檯'/.test(src)
   && /\$\{\(past\|\|far\|\|noSeed\)\?' mh2-past':''\}/.test(src));
ok('★★★ 課卡圓鈕變成不可按的「請洽櫃檯」，並寫出理由',
   /const noSeed=!past && !tooFar && grpNoSeedToday\(b\);/.test(src)
   && /orb\('off','—','請洽櫃檯',null,'這堂今天還沒有人報名，教練可能另有安排 —— 想上請洽櫃檯'\)/.test(src));
ok('★★ 錯誤訊息有對應（資料庫擋下來時看得懂）',
   /'BOOKING\.NO_SEED':'這堂今天還沒有人報名，無法自行加入 —— 想上請洽櫃檯'/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
