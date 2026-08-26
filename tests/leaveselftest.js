/* 教練請假轉自主訓練不算總堂數（2026-08-26 使用者回報）
   「這個員工這個月有請假　他的請假課堂會列在這些資料裡面嗎?」（黃美蓉 MANGO 94/123）

   查出來：8/20–8/24 特休，那幾天的課分兩種下場 ——
   ・整堂取消（8 堂團課＋6 堂自主訓練）→ bkCounts 就擋掉了，分子分母都沒有 ✓
   ・轉成自主訓練、會員自己來練（23 堂）→ 課卡的 coach_id 還掛著她、狀態走到
     已簽到／已完成 → 被算進「總堂數」。其中 6 堂會員根本沒到（未到場結課）。
   使用者定案：「1」＝從總堂數扣掉。

   ⚠ 只影響總堂數。教練課／團課／體驗欄與計薪本來就只認自己的課種，不吃自主訓練。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① bkIsLeaveSelfTrain：判準是 coach_leave 旗標，不是課種');
/* bkIsSelf 是既有的口袋判斷（「是不是自主訓練」全庫只准寫一次，見 tests/pockettest.js
   的棘輪）—— 沙箱一起帶進來，順便驗這一支真的走它，而不是自己再寫一次 category 比較。 */
const isLST=new Function('bkPocketNow', grabFn('bkIsSelf')+'\n'
  +grabFn('bkIsLeaveSelfTrain')+'\nreturn bkIsLeaveSelfTrain;')(
  /* bkPocketNow 會把整套票券口袋機器拉進來，這裡用不到 —— bkIsSelf 第一行就認
     category==='自主訓練'（口袋那一路本身由 tests/pockettest.js 顧）。 */
  ()=>({}));
ok('★★ 教練請假轉的自主訓練 → 是', isLST({coach_leave:true,category:'自主訓練'})===true);
ok('★★ 一般的自主訓練陪同 → 不是（那是真的有帶課，要算）',
   isLST({coach_leave:false,category:'自主訓練'})===false && isLST({category:'自主訓練'})===false);
ok('★★ 教練請假的教練課／團課 → 不是（那兩種請假時是整堂取消，另有 bkCounts 擋）',
   isLST({coach_leave:true,category:'私人教練'})===false
   && isLST({coach_leave:true,category:'小班肌力'})===false);
ok('　 空值不能爆', isLST(null)===false && isLST(undefined)===false && isLST({})===false);
ok('　 coach_leave 只認真正的 true（不吃 truthy 字串）',
   isLST({coach_leave:'true',category:'自主訓練'})===false);
ok('★ 課種判斷走既有的 bkIsSelf，沒有再寫一次 category 比較（棘輪：全庫只准一處）',
   /function bkIsLeaveSelfTrain\(b\)\{ return !!b && b\.coach_leave===true && bkIsSelf\(b\); \}/.test(src));

console.log('\n② 接進員工列表的統計（總堂數那一欄）');
{
  /* 黃美蓉 2026-08 的真實形狀（縮小版）：
     實際帶課 = 教練課 63 已上 / 26 未上、團課 5 已上 / 2 未上、代課團課 1、體驗 2 已上 / 1 未上
     請假轉自主 = 17 已簽到 + 6 已完成（會員沒到）→ 這 23 堂要扣掉
     取消的（含請假取消的）由 bkCounts 擋掉 */
  const mk=(n,over)=>Array.from({length:n},(_,i)=>Object.assign(
    {id:'x'+Math.random(),coach_id:'ME',status:'checked_in',category:'私人教練',date:'2026-08-05'},over));
  const ALL=[].concat(
    mk(63,{}),                                            // 教練課已上
    mk(26,{status:'booked',date:'2026-08-28'}),           // 教練課未上
    mk(5,{category:'小班肌力'}),                           // 團課已上
    mk(2,{category:'小班肌力',status:'booked'}),           // 團課未上
    mk(1,{category:'小班肌力',coach_id:'OTHER',substitute_coach_id:'ME'}),   // 她代別人
    mk(1,{category:'小班肌力',substitute_coach_id:'OTHER'}),                 // 她主責、別人代 → 不是她的
    mk(2,{category:'體驗'}), mk(1,{category:'體驗',status:'booked'}),
    mk(17,{category:'自主訓練',coach_leave:true}),                            // 請假轉自主（已簽到）
    mk(6,{category:'自主訓練',coach_leave:true,status:'completed'}),          // 請假轉自主（會員沒到）
    mk(6,{category:'自主訓練',coach_leave:true,status:'cancelled'}),          // 請假直接取消
    mk(8,{category:'小班肌力',status:'cancelled'}),
    mk(3,{category:'自主訓練'})                                               // 一般自主訓練陪同 → 要算
  );
  const bkCoachId=b=>(b&&(b.substitute_coach_id||b.coach_id))||null;
  const bkCounts=b=>!!b && b.status!=='cancelled';
  const bkIsGroup=b=>!!b && b.category==='小班肌力';
  const isPtPayClass=b=>!!b && b.category==='私人教練';
  const _mBk=ALL.filter(bkCounts);
  /* 線上那一行（含 2026-08-26 的排除）—— 直接從原始碼取，改壞了這裡就會失敗 */
  const line=src.slice(src.indexOf('const mine=_mBk.filter('),
                       src.indexOf('\n',src.indexOf('const mine=_mBk.filter(')));
  ok('★★ 統計那一行真的把它排掉了',
     /const mine=_mBk\.filter\(b=>\(bkCoachId\(b\)\)===c\.id && !bkIsLeaveSelfTrain\(b\)\);/.test(line), line);
  const mine=new Function('_mBk','c','bkCoachId','bkIsLeaveSelfTrain',line+'\nreturn mine;')(
    _mBk,{id:'ME'},bkCoachId,isLST);
  const done=mine.filter(b=>b.status==='checked_in'||b.status==='completed');

  /* 2026-08-26 二修（使用者：「這邊體驗也會算進總堂數嗎?」「應該不要算進去
     不然教練會誤會他有達標獎金」「體驗就單獨紀錄」）——
     總堂數再扣掉體驗。mine/done 保持完整（各分欄還要用），
     只有 all/allAll 這一組吃 inTotal 過濾。 */
  const isTrial=b=>!!b && b.category==='體驗';
  const inTotal=b=>!isTrial(b);
  const tAll=mine.filter(inTotal), tDone=done.filter(inTotal);
  eq('★★ 總堂數：94/123 → 74/103（扣掉 23 堂請假轉自主，留下 3 堂一般陪同）',
     [done.length, mine.length], [74,103]);
  eq('★★ 再扣掉體驗 → 72/100（體驗 2 已上 / 3 排定）',
     [tDone.length, tAll.length], [72,100]);
  ok('★★ 線上真的這樣接（all/allAll 吃 _tDone/_tAll，不是 done/mine）',
     /const inTotal=b=>!isTrial\(b\);/.test(src)
     && /const _tAll=mine\.filter\(inTotal\), _tDone=done\.filter\(inTotal\);/.test(src)
     && /_stat\[c\.id\]=\{ all:_tDone\.length, allAll:_tAll\.length,/.test(src));
  ok('★★ 體驗欄仍然讀完整的 mine/done（使用者要「單獨紀錄」，不是拿掉）',
     /trial:done\.filter\(isTrial\)\.length, trialAll:mine\.filter\(isTrial\)\.length,/.test(src));
  ok('★★ 為什麼會誤導寫在原地（達標獎金只認 ptDone）',
     /達標獎金看的是 calcPtBonus\(tpl, ptDone\)，\s*\n\s*ptDone 只認私人教練；體驗不計薪、也不進獎金門檻/.test(src)
     && /門檻剛好在 100 的人會誤判自己已經到了/.test(src));
  ok('★ 團課刻意留在總堂數裡，理由寫出來（免得下一個人順手一起拿掉）',
     /團課仍然算進總堂數 —— 它是實打實的帶課工作量（另以人次計酬）；\s*\n\s*要不要一併拿掉是另一個決定，別順手改/.test(src));
  eq('★ 教練課那一欄完全沒動（63/89）',
     [done.filter(isPtPayClass).length, mine.filter(isPtPayClass).length], [63,89]);
  eq('★ 團課那一欄完全沒動（6/8，含她代別人的那 1 堂）',
     [done.filter(bkIsGroup).length, mine.filter(bkIsGroup).length], [6,8]);
  eq('★ 體驗那一欄完全沒動（2/3）',
     [done.filter(b=>b.category==='體驗').length, mine.filter(b=>b.category==='體驗').length], [2,3]);
  ok('★★ 一般的自主訓練陪同還留著（3 堂）',
     done.filter(b=>b.category==='自主訓練').length===3);
  ok('★ 她主責但別人代的那一堂仍然不算她的（bkCoachId 認代課教練）',
     !mine.some(b=>b.substitute_coach_id==='OTHER'));
}

console.log('\n③ 為什麼寫在原地');
ok('★★ 使用者原話與案例數字寫在原地',
   /這個員工這個月有請假　他的請假課堂\s*\n\s*會列在這些資料裡面嗎\?/.test(src)
   && /黃美蓉 8\/20–8\/24 特休 → 94 堂裡有 23 堂是這種（其中 6 堂會員根本沒到場）/.test(src));
ok('★★ 「判準是旗標不是課種」寫出來（一般陪同要算，這是最容易改錯的一刀）',
   /判準是 coach_leave 旗標，不是課種 —— 一般的「自主訓練陪同」仍然要算/.test(src));
ok('★ 「只影響總堂數、不影響計薪」寫出來',
   /只影響總堂數：教練課／團課／體驗那幾欄本來就只認自己的課種，計薪也不吃自主訓練/.test(src));
ok('★★ 欄位標題把算法講出來（手機沒有 hover，但桌機這一欄本來就有表頭）',
   /title="[^"]*教練請假轉成自主訓練的那幾堂不計 —— 人在放假，不算實際帶課。">總堂數/.test(src));

console.log('\n④ 計薪那一路一堂都不能被碰到');
ok('★★ 薪資的教練課堂數只認 isPtPayClass（私人教練）',
   /ptDoneById\[emp\.id\]=bookings\.filter\(b=>bkCoachId\(b\)===emp\.id&&\(b\.status==='completed'\|\|b\.status==='checked_in'\)&&bkCounts\(b\)&&\(b\.date\|\|''\)\.slice\(0,7\)===month&&isPtPayClass\(b\)\)\.length;/.test(src));
ok('★ 值班重疊只算 私人教練／體驗／團課，自主訓練不在內',
   /&& \(b\.category==='私人教練'\|\|b\.category==='體驗'\|\|bkIsGroup\(b\)\)/.test(src));
ok('　 computeMonthlyPayroll 沒有被加上這個排除（計薪本來就不吃自主訓練，加了只是雜訊）',
   !/myDone=bookings\.filter\([^\n]*bkIsLeaveSelfTrain/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
