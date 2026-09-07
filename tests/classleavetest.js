/* 課程請假的補登列 ≠ 今天不上班（2026-09-07 使用者回報：
   「員工mango今天值班12:00~18:00　晚上有一堂用了請假　結果今天班表就被算成請假　這樣不對」）。

   0831 的 coachLeaveToRoster 會為請假的那一堂補一列 0 小時的班表紀錄（leave_type='教練請假'），
   讓人事查得到。當時只顧到薪資中立（不落假別桶、時數 0），沒顧到顯示：
   每一個問「今天有沒有 leave_type」的地方都把整天當成請假。

   正式庫黃美蓉 2026-09-07 的兩列（本測試的 fixture 就是它）：
     shift-ms3365h5u1bo  12:00–18:00  6.0h  leave_type null      ← 真的在值班
     shift-mtl8kxdosj5b  21:00–22:00  0.0h  leave_type 教練請假  ← 那一堂課請假的補登 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

const {shIsClassLeave, shIsRosterLeave}=new Function(
  g('function shIsClassLeave(','}')+'\n'+g('function shIsRosterLeave(','}')
  +'\nreturn {shIsClassLeave, shIsRosterLeave};')();

/* 正式庫 2026-09-07 黃美蓉的兩列 */
const DUTY  ={id:'shift-ms3365h5u1bo', emp_id:'c-mqueqc9uxp3k', date:'2026-09-07',
              start_time:'12:00', end_time:'18:00', hours:6, leave_type:null, leave_hours:0};
const CLSLV ={id:'shift-mtl8kxdosj5b', emp_id:'c-mqueqc9uxp3k', date:'2026-09-07',
              start_time:'21:00', end_time:'22:00', hours:0, leave_type:'教練請假', leave_hours:0,
              note:'系統自動補登：21:00 私人教練教練請假'};
const ANNUAL={emp_id:'c-x', date:'2026-09-07', start_time:'09:00', end_time:'18:00',
              hours:8, leave_type:'特休', leave_hours:8};

console.log('① 兩種請假分得開');
ok('★★ 課程請假的補登＝classLeave', shIsClassLeave(CLSLV)===true && shIsRosterLeave(CLSLV)===false);
ok('★★ 特休＝真正的排班請假', shIsRosterLeave(ANNUAL)===true && shIsClassLeave(ANNUAL)===false);
ok('★  正常班兩邊都不是', shIsClassLeave(DUTY)===false && shIsRosterLeave(DUTY)===false);
ok('　  null 不會炸', shIsClassLeave(null)===false && shIsRosterLeave(null)===false);
['病假','事假','其他'].forEach(t=>
  ok('　  '+t+' 也算排班請假', shIsRosterLeave({leave_type:t})===true));

console.log('\n② 黃美蓉 9/07 那一天（兩列同時存在）');
const day=[DUTY, CLSLV];
ok('★★ 首頁值班籤不會變成「請假」', !day.find(shIsRosterLeave));
ok('★★ 排班表整格不會被標成請假日', !day.some(shIsRosterLeave));
ok('★★ 人力狀態卡不會多算一個請假', day.filter(shIsRosterLeave).length===0);
/* 值班籤要挑得出「中班」：只看沒有 leave_type 的列，21:00 那列不能造出一個晚班 */
const bandRows=day.filter(x=>!x.leave_type&&x.start_time);
ok('★★ 值班時段仍然只認 12:00 那一列（不會冒出晚班）',
   bandRows.length===1 && bandRows[0].start_time==='12:00');
/* 補登列本身沒有不見 —— 人事還是查得到 */
ok('★  補登紀錄本身還在（人事查得到，這是 0831 做它的目的）',
   day.some(shIsClassLeave));

console.log('\n③ 真的請整天假還是要標出來');
const offDay=[ANNUAL];
ok('★★ 特休那天照樣顯示請假', !!offDay.find(shIsRosterLeave));

console.log('\n④ 四個顯示出口都改用新判斷了');
ok('★★ 教練手機首頁的值班籤', /const onLeave=myShifts\.find\(shIsRosterLeave\);/.test(src));
ok('★★ 排班表整格底色（兩份都要）',
   (src.match(/const hasLeave=list\.some\(shIsRosterLeave\);/g)||[]).length===2);
ok('★★ 管理員首頁「教練任務」正常班優先',
   /dayShifts\.find\(s=>s\.emp_id===c\.id&&!shIsClassLeave\(s\)\)/.test(src)
   && /const onLeave=myShift&&shIsRosterLeave\(myShift\);/.test(src));
ok('★★ 人力狀態卡的請假人數', /const onLeave = dayShifts\.filter\(shIsRosterLeave\);/.test(src));
ok('★  舊的「有 leave_type 就算請假」寫法沒有殘留在這四處',
   !/const onLeave=myShifts\.find\(x=>x\.leave_type\)/.test(src)
   && !/const hasLeave=list\.some\(s=>s\.leave_type\)/.test(src)
   && !/const onLeave = dayShifts\.filter\(s=>s\.leave_type\)/.test(src));

console.log('\n⑤ 薪資與值班時數維持原樣（0831 就中立了，不要動它）');
ok('★★ 假別分桶仍然只認四種人工假別（教練請假不落桶）',
   /if\(s\.leave_type==='特休'\)/.test(src) && !/leave_type==='教練請假'\)\s*特休/.test(src));
ok('★★ 值班時數仍排除所有 leave_type 的列（21:00 那列不該算成值班）',
   /shifts\|\|\[\]\)\.filter\(s=>s\.emp_id===empId&&\(s\.date\|\|''\)\.slice\(0,7\)===month&&!s\.leave_type\)/.test(src));
ok('★★ 排班缺口仍把請假列當成沒人（不能因為補登列就以為 21:00 有人顧店）',
   /dayShifts\.filter\(s=>s\.start_time&&s\.end_time&&!s\.leave_type\)/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
