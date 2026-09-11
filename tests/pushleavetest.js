/* 2026-09-11 使用者：「請假的會員　還會收到line的開課通知　應該不要通知」
   上課提醒是 Edge Function line-push-daily 發的（docs/edge/line-push-daily.ts＝線上那一份）。
   v25：團課逐名額請假（attendance[名額鍵]==='leave'）的人不提醒；同一人多名額要全部請假才跳過。
   名額鍵必須跟前端 seatKeys 同一套 —— 這支就是在守這件事。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const ts=fs.readFileSync(root+'docs/edge/line-push-daily.ts','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };

/* 前端的名額鍵（真正的 seatKeys／attObj） */
const FE=new Function(fn('mids')+fn('seatKeys')+fn('attObj')+'return {seatKeys,attObj};')();
/* 前端口徑的「每個名額都請假」 */
const feLeaveOnly=b=>{ const at=FE.attObj(b), ks=FE.seatKeys(b), by={};
  ks.forEach(k=>{ const m=k.split('#')[0]; (by[m]=by[m]||[]).push(at[k]==='leave'); });
  return Object.keys(by).filter(m=>by[m].every(Boolean)).sort(); };
/* 推播端的同一支（把 TS 型別拿掉就能在 node 裡跑） */
const _i=ts.indexOf('const leaveOnlyMembers = '), _j=ts.indexOf('\n}\n',_i)+2;
const edgeJs=ts.slice(_i,_j).replace(/: Record<string, (string|number)>/g,'').replace(/\(b: any\): Set<string>/,'(b)').replace(/new Set<string>\(\)/,'new Set()');
const EDGE=new Function(edgeJs+'\nreturn leaveOnlyMembers;')();
const edgeLeaveOnly=b=>[...EDGE(b)].sort();

console.log('① 推播端與前端的名額鍵同一套（正式庫真實案例）');
const cases=[
  ['09/12 11:00 兩位各一個名額請假', {member_ids:['A','B','C','D'],attendance:{A:'leave',D:'leave'}}, ['A','D']],
  ['★ 09/11 20:00 同一人三個名額只請第 2 個 → 照樣提醒', {member_ids:['X','X','X','Y','Z'],attendance:{'X#2':'leave'}}, []],
  ['同一人兩個名額都請假 → 跳過', {member_ids:['X','Y','X'],attendance:{X:'leave','X#2':'leave'}}, ['X']],
  ['已簽到不算請假', {member_ids:['A','B'],attendance:{A:'checked_in',B:'leave'}}, ['B']],
  ['attendance 是字串（舊資料）也讀得懂', {member_ids:['A','B'],attendance:'{"A":"leave"}'}, ['A']],
  ['沒有 attendance → 沒人跳過', {member_ids:['A','B']}, []],
  ['一對一課（沒有 member_ids）→ 沒人跳過', {member_id:'A'}, []],
];
for(const [n,b,want] of cases){
  eq('★★ '+n+'（推播端）', edgeLeaveOnly(b), want);
  eq('　　'+n+'（前端口徑一致）', feLeaveOnly(b), want);
}

console.log('\n② 接線');
ok('★★★ bookings 多撈 attendance（不撈就判斷不了）',
   /select\('id,date,start_time,category,coach_id,substitute_coach_id,member_id,member_ids,ticket_id,trial_name,sibling_of,venue_unit,note,attendance'\)/.test(ts));
ok('★★★ 推播迴圈第一關就擋請假的人（排在去重與 LINE 綁定檢查之前）',
   /for \(const mid of \(tplOff\('LT-CLASS'\) \? \[\] : ids\)\) \{\s*\n\s*if \(onLeave\.has\(mid\)\) \{ skipLeave\+\+; continue \}/.test(ts));
ok('★★ 回報與試算模式都看得到（skip_leave／on_leave）',
   /skip_leave: skipLeave/.test(ts) && /on_leave: onLeave\.has\(x\)/.test(ts));
ok('★★ 收款提醒不受影響（那是發給教練的，跟會員請不請假無關）',
   /if \(coachAlert && !tplOff\('LT-PAY'\)\) \{/.test(ts));
ok('★ 版控＝線上：v24 那行與 debug 的 head 都補回來了',
   /\/\/ v24（2026-08-23）：抬頭也搬進範本表/.test(ts) && /detect_errors: detectErrors, head: HEAD, templates:/.test(ts));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
