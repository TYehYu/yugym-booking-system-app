/* 2026-08-01 使用者回報：「教練手機端行事曆沒有出現『代課』的這堂課。
   A 教練請 B 教練代課，這堂課應該要顯示在 B 教練這邊。」

   查證：手機端行事曆那一支本來就用 bkIsCoach（含代課），真正漏掉的是教練端另外 15 處
   仍寫 b.coach_id===SESSION.id —— 今日課表、本月堂數、出勤月曆、教練首頁、薪資估算…
   7/31 已經把「實際上課的教練」抽成 bkCoachId、「跟這位教練有沒有關係」抽成 bkIsCoach，
   但這些呼叫點當時沒有一起換。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('教練端不再只看主責教練');
{
  // 只算真正的程式碼，註解裡提到那個舊寫法不算（那是在解釋修了什麼）
  const code=src.replace(/\/\*[\s\S]*?\*\//g,'');
  const left=(code.match(/b\.coach_id===SESSION\.id/g)||[]).length;
  eq('★ 全站已無 b.coach_id===SESSION.id（會漏掉代課的課）', left, 0);
  const now=(src.match(/bkCoachId\(b\)===SESSION\.id/g)||[]).length;
  ok('★ 全部改成 bkCoachId(b)===SESSION.id（＝這堂實際由誰上）', now>=15, `共 ${now} 處`);
}
ok('★ 手機端行事曆本來就含代課（bkIsCoach）', /const isMineBk=\(b\)=> \(bkIsCoach\(b,myId\)\);/.test(src));
ok('★ 教練端行事曆頁的月曆也含代課', /return bkIsCoach\(b,myId\); \/\/ 月曆\/週量只看我的課/.test(src));
ok('　　查證結論寫在程式裡', /真正漏掉的是教練端另外 15 處/.test(src));

console.log('\n兩支判斷的語意沒有被混用');
ok('★ bkCoachId＝實際上課的教練（代課優先）',
   /function bkCoachId\(b\)\{ return \(b && \(b\.substitute_coach_id \|\| b\.coach_id\)\) \|\| null; \}/.test(src));
ok('★ bkIsCoach＝跟這位教練有沒有關係（主責或代課都算）',
   /return String\(b\.coach_id\|\|''\)===String\(cid\) \|\| String\(b\.substitute_coach_id\|\|''\)===String\(cid\);/.test(src));

console.log('\n實跑：A 請 B 代課之後，誰看得到這堂課');
{
  const bkCoachId=b=>(b&&(b.substitute_coach_id||b.coach_id))||null;
  const bkIsCoach=(b,c)=>!!b&&!!c&&(String(b.coach_id||'')===String(c)||String(b.substitute_coach_id||'')===String(c));
  const B={coach_id:'A', substitute_coach_id:'B'};
  const N={coach_id:'A', substitute_coach_id:null};

  eq('★ 我的課表（實際要上的課）：B 看得到', bkCoachId(B)==='B', true);
  eq('★ 我的課表：A 看不到（他已經交出去了）', bkCoachId(B)==='A', false);
  eq('　　沒有代課時：A 看得到', bkCoachId(N)==='A', true);
  eq('★ 本月堂數／薪資口徑一致（同一支 bkCoachId）', bkCoachId(B), 'B');
  eq('★ 權限問法（能不能點開這堂）：A、B 都算相關',
     [bkIsCoach(B,'A'), bkIsCoach(B,'B'), bkIsCoach(B,'C')], [true,true,false]);
  eq('　　行事曆的「我的」圖層用權限問法 → A 仍看得到自己交出去的課',
     bkIsCoach(B,'A'), true);
}

/* 2026-08-01 續報：「首頁的代課課卡 沒有紀錄在代課教練那邊」——
   上一輪只換掉 b.coach_id===SESSION.id（教練自己看的畫面），
   管理端「逐位教練」的迴圈用的是 b.coach_id===c.id，同樣只認主責。 */
console.log('\n管理端的逐位教練統計也要算代課');
{
  const code=src.replace(/\/\*[\s\S]*?\*\//g,'');
  const left=(code.match(/b\.coach_id===(c|emp)\.id/g)||[]).length;
  eq('★ 全站已無 b.coach_id===c.id／emp.id', left, 0);
}
ok('★ 首頁教練任務區改用 bkCoachId', /const myBk=dayBkAll\.filter\(b=>bkCoachId\(b\)===c\.id && !isCancelled\(b\)\)/.test(src));
ok('★ 教練總薪資彙總改用 bkCoachId', /const myDone=done\.filter\(b=>bkCoachId\(b\)===c\.id\);/.test(src));
ok('★ 教練 KPI 報表改用 bkCoachId', /const mine=monthBk\.filter\(b=>bkCoachId\(b\)===c\.id\);/.test(src));
ok('★ 店長津貼的堂數基準也一致', /return \(bookings\|\|\[\]\)\.filter\(b=>bkCoachId\(b\)===coachId/.test(src));
ok('★ 代課接手的人要能編輯那堂課（editable 與 isMine 口徑一致）',
   /\(!opts\.me \|\| bkCoachId\(b\)===opts\.me\);/.test(src)
   && /const isMine = opts\.me && acting===opts\.me;/.test(src));
ok('　　卡片上的「（代）」標記仍看主責是誰（那是標籤不是歸屬）',
   /\$\{b\.substitute_coach_id===c\.id\?'（代）':''\}/.test(src));
ok('　　使用者的原話寫在程式裡', /首頁的代課課卡，沒有紀錄在代課教練那邊/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
