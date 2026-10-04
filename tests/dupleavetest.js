/* 整天請假的人，不要再畫那天的「教練請假」補登列（2026-10-04 使用者看 10/04 班表：
   「美蓉今天請病假　這邊有重複資訊」）。

   正式庫黃美蓉 2026-10-04 的兩列（本測試的 fixture 就是它）：
     shift-mu6cyssap5kk  09:00–15:00  6.0h  病假 6 小時        ← 今天不上班
     shift-mut3pae4jxcu  10:00–11:00  0.0h  教練請假（補登）   ← 那一堂沒上，是結果

   畫面上她那一格出現〔早〕〔病6〕〔10:00/11:00〕〔假〕，下面的請假列又出現〔病MA〕〔假MA〕。
   shDropDupLeave 只在顯示層擋掉後者；DB 那一列照留（人事查教練請假只有它）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

const {shDropDupLeave}=new Function(
  g('function shIsClassLeave(','}')+'\n'+g('function shIsRosterLeave(','}')+'\n'
  +g('function shDropDupLeave(list){','\n}')+'\nreturn {shDropDupLeave};')();

const MR='c-mqueqc9uxp3k';
const SICK={id:'shift-mu6cyssap5kk', emp_id:MR, date:'2026-10-04', start_time:'09:00',
            end_time:'15:00', hours:6, leave_type:'病假', leave_hours:6};
const CLS ={id:'shift-mut3pae4jxcu', emp_id:MR, date:'2026-10-04', start_time:'10:00',
            end_time:'11:00', hours:0, leave_type:'教練請假', leave_hours:0};
/* 9/07：正常值班＋晚上那一堂請假 —— 這一種要照畫，它是請假列存在的理由 */
const DUTY0907={id:'a', emp_id:MR, date:'2026-09-07', start_time:'12:00', end_time:'18:00',
                hours:6, leave_type:null};
const CLS0907 ={id:'b', emp_id:MR, date:'2026-09-07', start_time:'21:00', end_time:'22:00',
                hours:0, leave_type:'教練請假', leave_hours:0};
const ids=a=>a.map(s=>s.id);

console.log('① 10/04 美蓉：病假那天的補登列不畫');
ok('★★★ 兩列只剩病假那一列', ids(shDropDupLeave([SICK,CLS])).join()==='shift-mu6cyssap5kk', ids(shDropDupLeave([SICK,CLS])));
ok('★★ 順序顛倒也一樣', ids(shDropDupLeave([CLS,SICK])).join()==='shift-mu6cyssap5kk', ids(shDropDupLeave([CLS,SICK])));

console.log('\n② 不能擋過頭');
ok('★★★ 9/07 正常值班＋課請假：兩列照留',
   ids(shDropDupLeave([DUTY0907,CLS0907])).join()==='a,b', ids(shDropDupLeave([DUTY0907,CLS0907])));
ok('★★★ 只有課請假一列（那天沒排班）照留',
   ids(shDropDupLeave([CLS0907])).join()==='b');
ok('★★ 別人同一天請假不會擋到他的課請假',
   ids(shDropDupLeave([{id:'x',emp_id:'c-other',date:'2026-10-04',leave_type:'特休'},CLS])).join()==='x,shift-mut3pae4jxcu');
ok('★★ 同一人不同一天不互相擋',
   ids(shDropDupLeave([SICK,CLS0907])).join()==='shift-mu6cyssap5kk,b');
ok('★★ 真請假那一列永遠不會被擋（兩筆都是真請假）',
   ids(shDropDupLeave([SICK,{id:'y',emp_id:MR,date:'2026-10-04',leave_type:'事假'}])).join()==='shift-mu6cyssap5kk,y');

console.log('\n③ 不會壞在空值上');
ok('★★ 空陣列／非陣列', shDropDupLeave([]).length===0 && shDropDupLeave(null).length===0 && shDropDupLeave(undefined).length===0);
ok('★★ 只有一筆就原樣回傳', ids(shDropDupLeave([CLS])).join()==='shift-mut3pae4jxcu');

console.log('\n④ 三個畫面都套上了');
ok('★★★ 可編輯班表的格子', (src.match(/const list=shDropDupLeave\(monthShifts\.filter\(s=>s\.emp_id===e\.id&&s\.date===dateStr\)\);/g)||[]).length===2);
ok('★★★ 請假那一列', /const _lv=shDropDupLeave\(monthShifts\.filter\(s=>s&&s\.leave_type&&!shIsSub\(s\)\)\);/.test(src));
ok('★★ 只動顯示：coachLeaveToRoster 照寫那一列', /async function coachLeaveToRoster\(/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
