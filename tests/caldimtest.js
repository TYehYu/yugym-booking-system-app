/* 行事曆：未簽到完成的過去課卡不淡化（2026-08-01 使用者指示）
   「未簽到完成的課卡不要淡化，方便一眼看到哪一堂課還沒完成」
   原本 Focus Mode 把所有過去的課一律淡化（cal-ev-past, opacity .5），
   已完成和沒完成的長得一樣，要逐張點開才知道哪堂漏簽。
   改成只淡化「已結案」的，沒結案的維持原色（cal-ev-todo）→ 在一片灰卡裡自己跳出來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('程式碼');
ok('★ 過去課卡不再一律套 cal-ev-past',
   !/const _pastCls = _isPastCard \? 'cal-ev-past' : '';/.test(src));
ok('★ 改成結案→cal-ev-past、未結案→cal-ev-todo',
   /: !_isPastCard \? '' : \(_settled \? 'cal-ev-past' : 'cal-ev-todo'\);/.test(src));   /* 2026-08-17 前面多了 bkShowsCancelled 分支（保留顯示的取消卡一律淡化） */
ok('★ 結案的定義與簽到章同源（_isCheckedIn / _isMakeup / grpAllOnLeave）',
   /const _settled = b\.status==='cancelled' \|\| b\.status==='no_show' \|\| hideMember\s*\n\s*\|\| _isCheckedIn \|\| _isMakeup \|\| grpAllOnLeave\(b\);/.test(src));
ok('　　團課的「完成」＝每個名額都處理完（grpAllDone），不是整堂 status',
   /const _isCheckedIn = bkIsGroup\(b\) \? grpAllDone\(b\)/.test(src));
ok('　　遮蔽卡（教練看別人的課）維持淡化，不製造假警訊', /\|\| hideMember/.test(src));
ok('　　未來的課不受影響（沒有 past class 就給空字串）', /!_isPastCard \? '' :/.test(src));

console.log('\nCSS');
ok('★ cal-ev-todo 取消淡化', /\.cal-ev\.cal-ev-todo,/.test(src));
ok('★ 整欄灰化（.col-past）也要讓開，否則週檢視還是會被壓暗',
   /\.cal-daycol\.col-past \.cal-ev\.cal-ev-todo\{opacity:1;filter:none;\}/.test(src));
/* 2026-08-21 使用者定案：改用「暗化」而不是透明化（見 cardstyletest 的四修） */
ok('　　cal-ev-past 仍然會被壓暗（只是改用 brightness；0822 起與 cal-ev-dark 共用同一條）',
   /\.cal-ev\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-dark\{opacity:1;filter:brightness\(0\.9\)/.test(src));
{
  // 特異度：.cal-daycol.col-past .cal-ev.cal-ev-todo (4 類) 必須贏過 .cal-daycol.col-past .cal-ev (3 類)
  const spec=sel=>(sel.match(/\./g)||[]).length;
  eq('★ 特異度贏過 .col-past 的壓灰規則',
     spec('.cal-daycol.col-past .cal-ev.cal-ev-todo') > spec('.cal-daycol.col-past .cal-ev'), true);
}

console.log('\n實跑判定');
{
  // 把 index.html 的 grpAllDone / grpAllOnLeave 真的抽出來用，避免測試自己另寫一套
  const grab=n=>{ const i=src.indexOf('function '+n+'(');
    let d=0,j=src.indexOf('{',i);
    for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} } };
  eval([grab('mids'),grab('seatKeys'),grab('seatMid'),grab('attObj'),
        grab('grpAllDone'),grab('grpAllOnLeave')].join('\n'));
  globalThis.bkIsGroup=b=>b.category==='小班肌力';

  // 與 index.html 同一段判定邏輯
  const settled=(b,hideMember)=>{
    const isCheckedIn = bkIsGroup(b) ? grpAllDone(b) : (b.status==='checked_in'||b.status==='completed');
    const isMakeup = !!b.makeup_granted;
    return b.status==='cancelled' || b.status==='no_show' || !!hideMember
        || isCheckedIn || isMakeup || grpAllOnLeave(b);
  };
  const cls=(b,isPast,hide)=> !isPast ? '' : (settled(b,hide) ? 'cal-ev-past' : 'cal-ev-todo');

  const PT=st=>({category:'私人教練',status:st});
  eq('★ 過去・已簽到的教練課 → 淡化',        cls(PT('checked_in'),true), 'cal-ev-past');
  eq('★ 過去・沒簽到的教練課 → 不淡化',      cls(PT('booked'),true),     'cal-ev-todo');
  eq('　　過去・已取消 → 淡化（已成定局）',   cls(PT('cancelled'),true),  'cal-ev-past');
  eq('　　過去・未到(no_show) → 淡化',        cls(PT('no_show'),true),    'cal-ev-past');
  eq('　　過去・補課券已發 → 淡化',
     cls({category:'私人教練',status:'booked',makeup_granted:true},true), 'cal-ev-past');
  eq('　　未來的課一律不套（不管簽沒簽）',    cls(PT('booked'),false),    '');
  eq('　　遮蔽卡就算沒簽到也淡化',            cls(PT('booked'),true,true),'cal-ev-past');

  // 團課：整堂 status 是 checked_in，但還有名額空白 → 沒完成，要跳出來
  const G=(ids,att)=>({category:'小班肌力',status:'checked_in',member_ids:ids,attendance:att});
  eq('★ 團課・全部名額簽到 → 淡化',
     cls(G(['A','B'],{A:'checked_in',B:'checked_in'}),true), 'cal-ev-past');
  eq('★ 團課・有一個名額空白 → 不淡化（整堂 status 仍是 checked_in）',
     cls(G(['A','B'],{A:'checked_in'}),true), 'cal-ev-todo');
  eq('★ 團課・同一人多名額，第 2 個沒簽 → 不淡化',
     cls(G(['A','A','A'],{A:'checked_in','A#3':'checked_in'}),true), 'cal-ev-todo');
  eq('　　團課・簽到＋請假混合且都處理完 → 淡化',
     cls(G(['A','B'],{A:'checked_in',B:'leave'}),true), 'cal-ev-past');
  eq('　　團課・全員請假（蓋紅色假章）→ 淡化',
     cls(G(['A','B'],{A:'leave',B:'leave'}),true), 'cal-ev-past');
  eq('　　團課・沒有任何人簽到（只有 booked）→ 不淡化',
     cls(G(['A','B'],{A:'booked',B:'booked'}),true), 'cal-ev-todo');
  eq('　　團課・名單空著的舊資料 → 不淡化（本來就該被看到）',
     cls(G([],{}),true), 'cal-ev-todo');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
