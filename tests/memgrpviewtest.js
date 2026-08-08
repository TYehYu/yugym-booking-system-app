/* 2026-08-08 使用者指示：「會員端看團體課，要看得到是哪個教練上課跟上課人數，
   但是不能看上課會員名單」

   盤下來三件事：
   ① 教練名字：會員根本看不到 —— employees 的 RLS 只給櫃檯／本人／教練，
      所以會員端 dbGetAll('coaches') 一律是空陣列，每一堂課都顯示成「教練」。
      修法不是放寬 RLS（那是整列開放，薪資／電話／身分證都會過去），
      而是一支只回「id + 名字」的 fn_coach_directory（security definer）。
   ② 上課人數：快速預約的開課表本來就有 N/M，但「我的預約」與預約明細沒有。
   ③ 會員名單：預約明細的團課名單在會員視角照樣渲染。members 的 RLS 讓別人的姓名
      變成空白，所以不會漏姓名 —— 但一整排空白列本身就在說「這堂有幾個人、
      誰坐第幾個位子、誰請假了」。整塊換成一行人數。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 教練名字：只拿名字，不放寬 employees 的 RLS');
{
  const mig=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260808_fn_coach_directory.sql';
  ok('★ migration 有進版控', fs.existsSync(mig));
  const sql=fs.readFileSync(mig,'utf8');
  ok('★★ 只回 id／本名／教練名三欄（薪資、電話、身分證都不會過來）',
     /returns table\(id text, name text, name_en text\)/.test(sql)
     && /select e\.id, e\.name, e\.name_en/.test(sql));
  ok('★★ 只有登入的會員或員工叫得動（匿名拿不到名冊）',
     /and \(current_member_id\(\) is not null or is_any_staff\(\)\)/.test(sql)
     && /revoke all on function public\.fn_coach_directory\(\) from public;/.test(sql)
     && /grant execute on function public\.fn_coach_directory\(\) to authenticated;/.test(sql));
  ok('★ 沒有動 employees 的 RLS（那是整列開放）',
     /不放寬 employees 的 RLS —— 那是整列開放，薪資、電話、身分證字號都會跟著過去。/.test(sql)
     && !/create policy/i.test(sql));
  const body=/as \$\$([\s\S]*?)\$\$;/.exec(sql)[1];   // 函式本體（不含上方註解）
  ok('★ 停開課的教練也留在名冊（舊課回頭看仍要知道是誰上的）',
     /can_teach 講的是「還能不能被排課」，不是「名字能不能顯示」/.test(sql)
     && !/can_teach/.test(body));
}
{
  const F=grabFn('coachDirectory');
  ok('★★ 前端走 RPC、名字用同一支 coachDisp（與後台顯示一致）',
     /const \{data,error\}=await sb\.rpc\('fn_coach_directory'\);/.test(F)
     && /data\.forEach\(c=>\{ if\(c&&c\.id\) map\[c\.id\]=coachDisp\(c\); \}\);/.test(F));
  ok('★ 一個工作階段抓一次（教練名字不會在使用中改）',
     /if\(_coachDirCache\) return _coachDirCache;/.test(F) && /_coachDirCache=map;/.test(F));
  ok('　　抓不到不會爆，只是退回「教練」', /catch\(_\)\{\}/.test(F));
}
ok('★★ 我的預約：coaches 空的時候才補名冊（櫃檯／教練端不多打一次 RPC）',
   /if\(!Object\.keys\(coachMap\)\.length\) Object\.assign\(coachMap, await coachDirectory\(\)\);/.test(src));
ok('★★ 預約明細三個分支都改吃算好的名字（不再各自 coach?coach.name）',
   /const _coachNm = \(coach&&coach\.name\) \|\| _cdir\[b\.coach_id\] \|\| '—';/.test(src)
   && (src.match(/\$\{_coachNm\}/g)||[]).length>=3);
ok('★ 有代課就顯示代課那位（會員關心的是「今天誰帶」）',
   /const _teachNm = _subNm \|\| _coachNm;/.test(src)
   && /const _subNm   = \(subCoach&&subCoach\.name\) \|\| \(b\.substitute_coach_id\?\(_cdir\[b\.substitute_coach_id\]\|\|'代課教練'\):''\);/.test(src));
ok('　　只有會員視角才打這支 RPC', /const _cdir = isMemberView \? await coachDirectory\(\) : \{\};/.test(src));

console.log('\n② 上課人數：三個會員端畫面都看得到');
{
  const F=grabFn('msbRenderGrpList');
  ok('★ 開課表：名額 N/M（本來就有）', /· 名額 \$\{n\}\/\$\{mx\}/.test(F));
  ok('★ 開課表也顯示代課', /const _who=\(cm\[c\.substitute_coach_id\|\|c\.coach_id\]\|\|'教練'\)\+\(c\.substitute_coach_id\?'（代課）':''\);/.test(F));
}
ok('★★ 我的預約・當日清單：教練 · N/M 人 · 時長 · 狀態',
   /const _grpHeads=bkIsGroup\(b\)\?`\$\{mids\(b\)\.length\}\/\$\{Math\.max\(1,Number\(b\.max_heads\)\|\|5\)\} 人`:'';/.test(src)
   && /<div class="mc-ev-cat">\$\{who\}\$\{_grpHeads\?` · \$\{_grpHeads\}`:''\} · \$\{dur\}分鐘/.test(src));
ok('★★ 我的預約・課卡彈窗：時間 · 教練 · N/M 人',
   /const whoHeads=isGrp\?`\$\{mids\(b\)\.length\}\/\$\{Math\.max\(1,Number\(b\.max_heads\)\|\|5\)\} 人`:'';/.test(src)
   && /\$\{whoHeads\?`　·　\$\{whoHeads\}`:''\}/.test(src));
ok('★ 報名確認視窗也列出教練與人數（報名前就看得到這堂多滿）',
   /<div><span style="opacity:\.7;">上課人數<\/span>　\$\{\(Array\.isArray\(c\.member_ids\)\?c\.member_ids\.length:0\)\}\/\$\{Math\.max\(1,Number\(c\.max_heads\)\|\|5\)\} 人<\/div>/.test(src));
ok('　　人數上限一律看課卡的 max_heads（櫃檯改過人數就跟著改）',
   (src.match(/Math\.max\(1,Number\(b\.max_heads\)\|\|5\)/g)||[]).length>=2);

console.log('\n③ 會員名單不公開');
ok('★★ 團課明細在會員視角走自己的分支（名單整塊不畫）',
   /\}else if\(isGroupD && isMemberView\)\{/.test(src));
ok('★★ 只給人數，並明說名單不公開',
   /<span style="color:var\(--t2\);">上課人數<\/span>/.test(src)
   && /<span style="color:var\(--t3\);font-size:11\.5px;">同學名單不公開<\/span>/.test(src));
ok('★ 額滿標出來（想報名的人才知道為什麼按不了）',
   /\$\{_gfullM\?'<span class="tag tag-warn" style="font-size:10\.5px;">已額滿<\/span>':''\}/.test(src));
ok('★ 自己報了兩個名額仍看得出來（親友同行）',
   /const _mySeats=gIdsD\.filter\(x=>String\(x\)===String\(SESSION\.id\)\)\.length;/.test(src)
   && /您報名 \$\{_mySeats\} 個名額/.test(src));
ok('★★ 為什麼不是「反正別人的姓名讀不到就算了」，寫在原地',
   /一整排空白列本身就是在告訴他「這堂有誰、坐第幾個位子」，/.test(src)
   && /而且逐名額的簽到／請假狀態也跟著露出去。整塊換成一行人數最乾淨。/.test(src));
ok('★ 櫃檯／教練的名單沒被動到（管理名單、逐名額簽到請假照舊）',
   /const _seatKeys=seatKeysDisplay\(b\);/.test(src)
   && /onclick="openGroupMembers\('\$\{b\.id\}'\)">管理名單<\/button>/.test(src)
   && /onclick="toggleGroupAttend\('\$\{b\.id\}','\$\{sk\}'\)"/.test(src));
ok('　　順帶跳過那一整套票券夾運算（會員頁用不到）',
   /順帶：底下那一整套票券夾運算（每位學員各建一份 wallet）是給櫃檯看的，/.test(src));
ok('　　使用者的原話寫在程式裡',
   /會員端看團體課，要看得到是哪個教練上課\s*\n\s*跟上課人數，但是不能看上課會員名單/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
