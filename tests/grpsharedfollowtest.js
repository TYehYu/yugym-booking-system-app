/* 連續預約要算共享票（2026-08-31 使用者回報）

   「剛剛林繼霖要連續預約團課　明明他有三張票券　但卻不能連續預約」

   正式庫的形狀：
     TK-mtgsd5j9pbzm「團課 4週優惠」持有人是**林政緯**，shared_with=[林繼霖]。
     8/31 那一格是林政緯自己用，9/07・9/14・9/21 三格要給林繼霖。
   grpFollowAsk 算「這位還剩幾堂」時用的是 `t.member_id===mid`＝票掛在他名下 →
   林繼霖算出來 0 堂 → 預設連約 0 堂 → 那扇窗等於不給約。
   帳本上看得出櫃檯後來是一堂一堂手動加的（07:46:41／07:46:56／07:47:07，各差十幾秒；
   早上那批真正的連續預約是 05:17:52／05:17:53，相差 1 秒）。

   ⚠ 錢一直是對的：真正扣課那條路（listUsableTickets → tkFitsBooking）本來就走
     tkUsableBy（持有人＋共享者）。錯的只有「能約幾堂」這個預估。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 判準統一走 tkUsableBy');
{
  ok('★★★ 連續預約的剩餘堂數改吃 tkUsableBy（持有人＋共享者）',
     /const left=allTk\.filter\(t=>tkUsableBy\(t,mid\) && ticketMatchesCategory\(t,'小班肌力'\)/.test(src));
  ok('★★★ 舊的「票掛在他名下」寫法已經清掉',
     !/allTk\.filter\(t=>t\.member_id===mid && ticketMatchesCategory/.test(src));
  ok('★★ 林繼霖那個案例寫在原地',
     /林繼霖有票卻不能連續預約/.test(src)
     && /共享給他的那張團課票（shared_with），算出來是 0 堂/.test(src));
  ok('★★ 講明「錢一直是對的，錯的只有預估」（下次不要往扣課那條路找）',
     /真正扣課那條路（listUsableTickets → tkFitsBooking）本來就走 tkUsableBy，/.test(src));
  ok('★★★ tkUsableBy 就是全系統唯一那支（持有人 or 共享者）',
     /function tkUsableBy\(t,member_id\)\{\s*\n\s*if\(!t\|\|!member_id\) return false;\s*\n\s*return String\(t\.member_id\)===String\(member_id\) \|\| tkSharedIds\(t\)\.indexOf\(String\(member_id\)\)>=0;/.test(src));
}

console.log('\n② 實跑：林繼霖那張共享票');
{
  const i=src.indexOf('function tkSharedIds(t){');
  const j=src.indexOf('// 找會員某類型最早到期的可用票券');
  const api=new Function(src.slice(i,j)+'\nreturn {tkUsableBy,tkSharedIds};')();
  const LIN='m19fd086479dc4b8';      // 林繼霖
  const WEI='MEM-1325851728CD';      // 林政緯（持有人）
  const tk={id:'TK-mtgsd5j9pbzm', member_id:WEI, shared_with:[LIN],
            status:'usable', sessions_remaining:3};

  /* grpFollowAsk 的算式（來源由上面的字面斷言釘住） */
  const leftOf=(tks,mid)=>tks.filter(t=>api.tkUsableBy(t,mid)&&t.status==='usable'&&t.sessions_remaining>0)
    .reduce((n,t)=>n+t.sessions_remaining,0);
  const oldLeftOf=(tks,mid)=>tks.filter(t=>t.member_id===mid&&t.status==='usable'&&t.sessions_remaining>0)
    .reduce((n,t)=>n+t.sessions_remaining,0);

  eq('★★★ 修好後：林繼霖看得到共享票的 3 堂', leftOf([tk],LIN), 3);
  eq('★★★ 修好前：算成 0 堂（＝這次的災情，留一條反例釘樁）', oldLeftOf([tk],LIN), 0);
  eq('★★ 持有人自己當然也算得到', leftOf([tk],WEI), 3);
  eq('★★ 沒被共享到的人一堂都不給', leftOf([tk],'MEM-路人'), 0);
  eq('★★ 用完的票不算（餘額 0）', leftOf([Object.assign({},tk,{sessions_remaining:0})],LIN), 0);
  eq('★★ 作廢的票不算', leftOf([Object.assign({},tk,{status:'refunded'})],LIN), 0);
  eq('　 shared_with 是 JSON 字串（舊資料）也認得',
     leftOf([Object.assign({},tk,{shared_with:JSON.stringify([LIN])})],LIN), 3);
  eq('　 自己的票＋共享票要加總',
     leftOf([tk,{id:'T2',member_id:LIN,status:'usable',sessions_remaining:2}],LIN), 5);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
