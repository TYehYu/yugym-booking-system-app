/* 2026-08-08 使用者回報：「林紫錡又出現錯誤圓形卡，是操作問題還是程式問題」

   是程式問題，而且是 8/07 那次修正只修了一半。

   實況：她 9/05 那堂佔**兩個名額** ——
     名額 1 用「團課 4 週優惠」→ 已請假（紅色實心，正確）
     名額 2 用「補課券」→ 還沒上（應該是空心已預約）
   但補課券那張畫成「✓ 一格 ＋ 9/5 需補票紅虛線」。

   原因：8/07 我把**圓點**的判定改成逐名額（_isDoneOcc 讀 _seat），
   卻沒改**票券夾**算已用堂數的 isAtt —— 它還是「整堂」口徑：
     只要這位會員在這堂課有任一個名額簽到或請假就算 true。
   於是補課券那一格（名額 2，還沒上）被算成已用 → 已用 1／總 1 →
   多出一個沒有日期的 ✓，真正的 9/5 就溢位成「需補票」紅圈。

   修法：把「這個名額自己用掉了沒」抽成 grpSeatMark()，兩邊都問它。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const ME='MEM-48A6B8283390';
const env={
  seatMid:k=>{const s=String(k),i=s.indexOf('#');return i<0?s:s.slice(0,i);},
  attObj:b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};},
};
const mark=new Function(...Object.keys(env), grabFn('grpSeatMark')+'\nreturn grpSeatMark;')(...Object.values(env));

console.log('① grpSeatMark：只看這一格自己的出缺席');
{
  /* 林紫錡 9/05：名額 1 請假、名額 2（補課券）還沒上 */
  const b={id:'B905',date:'2026-09-05',status:'booked',
    member_ids:[ME,ME,'MEM-BD0C54D71180'],
    attendance:{[ME]:'leave'}};
  eq('★★ 名額 1（請假）→ leave', mark(Object.assign({},b,{_seat:ME}), ME), 'leave');
  eq('★★ 名額 2（還沒上）→ 空字串，不是「用掉了」', mark(Object.assign({},b,{_seat:ME+'#2'}), ME), '');
  eq('　　簽到的名額 → att',
     mark(Object.assign({},b,{_seat:ME+'#2',attendance:{[ME]:'leave',[ME+'#2']:'checked_in'}}), ME), 'att');
}
{
  const b={id:'BOLD',date:'2026-06-01',status:'checked_in',member_ids:[ME],attendance:{}};
  eq('★ 整堂都沒標出缺席（舊匯入）→ 回 null，交給呼叫端用整堂判', mark(Object.assign({},b,{_seat:ME}), ME), null);
  eq('　　戳記沒有名額鍵 → 也回 null', mark(b, ME), null);
  eq('　　名額鍵不是這位會員的 → 回 null',
     mark({_seat:'MEM-OTHER',attendance:{'MEM-OTHER':'leave'}}, ME), null);
}

console.log('\n② 兩邊都問同一支（不再各寫一份）');
ok('★★ 票券夾算已用堂數的 isAtt 先問名額',
   /const mk=\(typeof grpSeatMark==='function'\)\?grpSeatMark\(b, memberId\):null;\n\s*if\(mk!==null\) return mk!=='';/.test(src));
ok('★ 沒有名額資訊時才退回整堂口徑（簽到數＋請假數 > 0）',
   /return \(grpSeatAttCount\(b, memberId\) \+ \(\(typeof grpSeatLeaveCount==='function'\)\?grpSeatLeaveCount\(b, memberId\):0\)\) > 0;/.test(src));
ok('★★ 圓點的判定也改用同一支（原本自己寫了一份）',
   /const _mk=\(typeof grpSeatMark==='function'\)\?grpSeatMark\(b, memberId\|\|t\.member_id\):null;\n\s*if\(_mk!==null\) return _mk;/.test(src));
ok('　　舊的重複實作已移除', !/const _marked=Object\.keys\(_at\)\.some\(k=>_at\[k\]!=null\);/.test(src));

console.log('\n③ 既有規則沒被破壞');
ok('　　取消未退仍算已用（票被吃掉）', /if\(_eaten\(b\)\) return true;                     \/\/ 取消未退＝票已吃掉，算已用/.test(src));
ok('　　請假仍算一堂已用（2026-08-06 定案）', /請假也算（2026-08-06 使用者定案：「團課的請假，對會員來說算一堂簽到」）/.test(src));
ok('　　戳記帶名額鍵是 grpTicketAlloc 蓋的', /if\(logged\) put\(logged, Object\.assign\(\{\}, b, \{_seat:k\}\)\);/.test(src));
ok('　　為什麼會錯，寫在程式裡',
   /於是「同一堂裡我另一個名額請假」會被算成「這一格也用掉了」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
