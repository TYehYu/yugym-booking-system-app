/* 員工管理移除「今日出勤」與「出勤紀錄」（2026-07-30 使用者指示）
   逐日打卡是流水紀錄，放在員工各自的資料裡（員工名片 →「最近打卡」）就好。
   「打卡異常與補卡」留著 —— 那是要處理的待辦，不是紀錄。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('移除');
ok('★ 員工列表頁不再插入「今日出勤」區塊', !/<div id="staff-today"><\/div>/.test(src)
   && !/const host=document\.getElementById\('staff-today'\);/.test(src));
{
  // 只看 STAFF_TABS 這一份（ATT_TABS_FULL 是舊的獨立出勤管理頁，未掛在導覽上，不動）
  const i=src.indexOf('const STAFF_TABS=['); const st=src.slice(i, src.indexOf('];',i));
  ok('★ 員工管理的分頁清單沒有「出勤紀錄」', !/records/.test(st));
  ok('　　也沒有「今日出勤」分頁', !/今日出勤/.test(st));
  ok('　　只剩員工＋打卡異常與補卡＋制度類分頁',
     /\{key:'list',label:'員工'\},\s*\n\s*\{key:'punchfix',label:'打卡異常與補卡'\},/.test(st));
}
ok('★ 導覽（管理員 → 人事）沒有「出勤紀錄」入口',
   !/\{grp:'人事', label:'出勤紀錄', page:'staff', tab:'records'\}/.test(src));
ok('★ 分頁標題表也移除 records', !/records:   \['PUNCH','出勤紀錄'/.test(src));
ok('　　員工管理的說明改講「逐日打卡在員工資料裡」',
   /list:      \['STAFF','員工管理','列表顯示本月教練課／團體課／續約數／工作時數；逐日打卡在員工資料裡。'\]/.test(src));

console.log('\n保留');
ok('★ 「打卡異常與補卡」還在（那是待辦不是紀錄）',
   /\{key:'punchfix',label:'打卡異常與補卡'\}/.test(src)
   && /\{grp:'人事', label:'打卡異常與補卡', page:'staff', tab:'punchfix'\}/.test(src));
ok('★ renderAttToday 保留（出勤管理頁的今日分頁還在用）',
   /function renderAttToday\(needPunch,all,coaches,shifts\)\{/.test(src)
   && /if\(_attTab==='today'\) renderAttToday\(needPunch,all,coaches,shifts\);/.test(src));
ok('★ renderAttRecords 保留（出勤管理頁還在用）',
   /function renderAttRecords\(needPunch,all\)\{/.test(src)
   && /if\(_attTab==='records'\) renderAttRecords\(needPunch,all\);/.test(src));
ok('　　出勤管理頁本身沒被動到', /\{key:'attendance',label:'出勤管理'\}/.test(src));

console.log('\n不留白畫面');
ok('★ 記住的舊分頁 records 會落回員工列表（不會空白）',
   /else if\(_staffTab==='records'\)\{ _staffTab='list'; CUR_TAB='list'; await renderStaffList\(\); \}/.test(src));
ok('　　punchfix 仍走原本的渲染', /else if\(_staffTab==='punchfix'\) await renderStaffAttendance\(_staffTab\);/.test(src));

console.log('\n員工名片的打卡紀錄（現在是唯一入口）');
ok('★ 從近 30 筆放寬到近 90 筆（約三個月）',
   /const att=all\.slice\(0,90\);/.test(src) && !/\.sort\(\(a,b\)=>\(b\.date\|\|''\)\.localeCompare\(a\.date\|\|''\)\)\.slice\(0,30\);/.test(src));
ok('★ 最上面給本月出勤天數與工時小計',
   /本月出勤 <b class="num" style="font-size:16px;color:var\(--text\);">\$\{mRecs\.length\}<\/b> 天/.test(src)
   && /本月工時 <b class="num" style="font-size:16px;color:var\(--green\);">\$\{mHours\.toFixed\(1\)\}<\/b> 小時/.test(src));
ok('★ 有忘記打下班就標出來（金色次要提示）',
   /const miss=mRecs\.filter\(a=>a\.clock_in&&!a\.clock_out\)\.length;/.test(src)
   && /\$\{miss\} 天忘記打下班/.test(src));
ok('　　筆數標示跟著實際筆數走，不會寫死',
   /　近 \$\{att\.length\} 筆</.test(src));
ok('　　小計只算本月（不受近 90 筆的截斷影響，用完整資料算）',
   /const mRecs=all\.filter\(a=>String\(a\.date\|\|''\)\.slice\(0,7\)===month\);/.test(src));
ok('　　原因寫在程式裡', /逐日打卡是流水紀錄，放在員工各自的資料裡/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
