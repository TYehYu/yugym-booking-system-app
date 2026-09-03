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
/* ══ 2026-09-03 改版：暗化的定義換了 ══════════════════════════════════════
   使用者：「過期(當天不算)或沒有待簽約的課卡就暗化」
         ＋「移除課卡紅色框的提示　看到暗化的課卡就知道這張要注意了」
   暗化從「Focus Mode（過去的自動淡化）」變成**「這張要注意」的唯一通道**：
     ・過期 —— 當天不算（今天的課改用外框表達出席狀態，見 tests/evcardv2test.js）
     ・待簽約（pending_contract，錢還沒收）—— 原本是紅框，紅框整組退場
   ⚠ 這推翻了 0801 的「未完成的過去課卡不淡化」（當時是要讓沒處理的舊卡跳出來）。
     現在過期一律暗化，包含還沒簽到的。要恢復就把 _settled 那組判斷接回來。
   ⚠ _isPastCard（含「今天但已結束」）連同 _settled 一起移除了 —— 使用者明說當天不算，
     留著會是算了卻沒人讀的變數。 */
ok('★★★ 改成「過期（當天不算）或待簽約 → 暗化」',
   /const _pastCls = bkDarkNoTicket\(b\) \? 'cal-ev-dark'\s*\n\s*: \(_cardDate < _todayYmd \|\| _isUnpaid\) \? 'cal-ev-past' : '';/.test(src));
ok('★★★ 舊的結案／未結案兩段判斷已移除',
   !/_settled \? 'cal-ev-past' : 'cal-ev-todo'/.test(src)
   && !/const _settled = /.test(src)
   && !/let _isPastCard = false;/.test(src));
ok('　　團課的「完成」＝每個名額都處理完（grpAllDone），不是整堂 status',
   /const _isCheckedIn = bkIsGroup\(b\) \? grpAllDone\(b\)/.test(src));
ok('★★ 推翻 0801 這件事寫在原地（下一個人才知道不是漏掉）',
   /這一條推翻了 0801 的「未完成的過去課卡不淡化」/.test(src));
ok('　　未來的課不暗化（條件不成立就給空字串）',
   /\|\| _isUnpaid\) \? 'cal-ev-past' : '';/.test(src));

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
