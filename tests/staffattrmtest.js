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
  /* 2026-08-01 使用者指示：「打卡異常與補卡」分頁移除，改掛在員工列表每一列 */
  ok('　　只剩員工＋制度類分頁',
     /\{key:'list',label:'員工'\},\s*\n\s*\{key:'payroll',label:'薪資彙總'\},/.test(st)
     && !/\{key:'punchfix',label:'打卡異常與補卡'\}/.test(st));
}
ok('★ 導覽（管理員 → 人事）沒有「出勤紀錄」入口',
   !/\{grp:'人事', label:'出勤紀錄', page:'staff', tab:'records'\}/.test(src));
ok('★ 分頁標題表也移除 records', !/records:   \['PUNCH','出勤紀錄'/.test(src));
ok('　　員工管理的說明改講「打卡異常在該員工那一列」',
   /list:      \['STAFF','員工管理','列表顯示本月教練課／團體課／續約數／工作時數；打卡異常在該員工那一列的驚嘆號。'\]/.test(src));

console.log('\n保留');
/* 2026-08-01：不是不見了，是搬到員工列表每一列 —— 誰有問題誰那一列掛紅色驚嘆號 */
ok('★ 打卡異常與補卡改掛在員工列表每一列（那是待辦不是紀錄，只是換了位置）',
   !/\{key:'punchfix',label:'打卡異常與補卡'\}/.test(src)
   && /async function openPunchFixModal\(empId\)\{/.test(src)
   && /openPunchFixModal\('\$\{c\.id\}'\)">!<\/button>/.test(src));
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
ok('　　舊的 punchfix 深連結落回員工列表並打開彈窗（不是白畫面）',
   /else if\(_staffTab==='punchfix'\)\{ _staffTab='list'; CUR_TAB='list'; await renderStaffList\(\);/.test(src));

console.log('\n員工名片的打卡紀錄（現在是唯一入口）');
/* 2026-08-02 使用者指示：「把最近打卡這功能整理在本月值班裡面，就可以移除這個按鈕」
   —— 那張近 90 筆的長表格改成值班月曆的一部分：排班與打卡排在同一格。
   細節在 empcaltest.js，這裡只確認「唯一入口」這件事沒有退化成兩個。 */
ok('★ 打卡仍然只有一個入口，而且就在員工資料裡',
   /async function ppOpenEmpPunch\(id\)\{ return ppCalOpen\('duty', id,/.test(src)
   && src.split('async function ppOpenEmpPunch(').length===2);
ok('★ 本月出勤天數與工時的小計還在（換到月曆的標題列）',
   /打卡 <b class="ppc-g">\$\{at\.length\}<\/b> 天 \/ <b class="ppc-g">\$\{wh\.toFixed\(1\)\}<\/b> 小時/.test(src));
ok('★ 有忘記打下班就標出來（金色次要提示）',
   /const miss=at\.filter\(a=>a\.clock_in&&!a\.clock_out\)\.length;/.test(src)
   && /<b class="ppc-w">\$\{miss\}<\/b> 天忘記打下班/.test(src));
ok('　　舊的長表格沒有留下第二份', !/近 \$\{att\.length\} 筆</.test(src));
ok('　　原因寫在程式裡', /逐日打卡是流水紀錄，放在員工各自的資料裡/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
