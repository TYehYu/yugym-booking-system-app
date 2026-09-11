/* 教練請假已退堂的那一格不佔「開通區」（2026-09-11 使用者）
   「吳宜玲有遇到一次教練請假　所以不該是今天收款名單」
   同一件事有四份算法：行事曆 computeLastBkMarks（0830 已修）、首頁今日收款提醒、預約明細、
   LINE 推播 line-push-daily。後三份是抄出來的、沒排除，就把收款提前一堂。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const ts=fs.readFileSync(root+'docs/edge/line-push-daily.ts','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const m=src.match(/function bkLeaveRefunded\(b\)\{[\s\S]*?\n\}/);
const bkLeaveRefunded=new Function(m[0]+'\nreturn bkLeaveRefunded;')();

console.log('① 吳宜玲 TK-mssb19xpu6rk（主顧客友善 1V1，分 3 期、開通 4 堂）的真實預約');
const bks=[
  {id:'BK-19fff865a0f1a5e',date:'2026-08-21',start_time:'10:00',status:'checked_in',coach_leave:true},   // 教練請假、到場簽到當下退堂
  {id:'BK-19fff865f811715',date:'2026-08-28',start_time:'10:00',status:'checked_in'},
  {id:'BK-19fff8662312fbe',date:'2026-09-04',start_time:'10:00',status:'checked_in'},
  {id:'BK-19fff8664f9a213',date:'2026-09-11',start_time:'10:00',status:'checked_in'},
  {id:'BK-mt9g2gkrsrlr',  date:'2026-09-18',start_time:'10:00',status:'booked'},
];
const unlocked=4;
const seqOld=bks, seqNew=bks.filter(b=>!bkLeaveRefunded(b));
eq('　　（修之前）8/21 被數成第 1 格 → 開通區最後一堂落在 9/11', seqOld[unlocked-1].date, '2026-09-11');
eq('★★★ 排除教練請假已退堂 → 開通區最後一堂是 9/18', seqNew[unlocked-1].date, '2026-09-18');
eq('★★ 教練請假但還沒結課的（coach_leave 中、booked）照樣佔格（堂數還掛著）',
   bkLeaveRefunded({coach_leave:true,status:'booked'}), false);

console.log('\n② 四份算法都排除（同一條 bkLeaveRefunded）');
ok('★★★ 首頁今日收款提醒',
   /\(bookings\|\|\[\]\)\.forEach\(b=>\{ if\(b\.ticket_id && b\.status!=='cancelled' && !bkLeaveRefunded\(b\)\)\{ \(_bkByTk\[b\.ticket_id\]/.test(src));
ok('★★★ 預約明細的分期繳費／續約提醒',
   /const tkBks=allBk\.filter\(x=>x\.ticket_id===tk\.id && x\.status!=='cancelled' && !bkLeaveRefunded\(x\)\)/.test(src));
ok('★★ 行事曆 computeLastBkMarks（0830 就排除了，確認沒被改掉）',
   /if\(b&&b\.ticket_id&&b\.status!=='cancelled'&&!bkLeaveRefunded\(b\)\)\{ \(_bkByTk\[b\.ticket_id\]/.test(src));
ok('★★★ LINE 推播：多撈 coach_leave，序列排除已退堂那格',
   /select\('id,ticket_id,date,start_time,status,coach_leave'\)/.test(ts)
   && /const leaveRefunded = \(x: any\) => x\.coach_leave === true && \(x\.status === 'checked_in' \|\| x\.status === 'completed'\)/.test(ts)
   && /for \(const x of \(tbks \|\| \[\]\)\) \{ if \(leaveRefunded\(x\)\) continue;/.test(ts));
ok('★★ 全檔沒有第五份沒排除的「開通區最後一堂」', (src.match(/\[unlocked-1\]/g)||[]).length===4);

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
