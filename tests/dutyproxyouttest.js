/* 管理員代打下班卡（2026-08-29 使用者指示，附今日值班圓環的截圖）

   「員工曾邦紅說他手機端打不開頁面…他無法打卡」→「管理員可以幫忙打下班卡」
   →「幫我設計管理員代打卡下班功能 在這」

   在此之前唯一的路是員工自己「申請補打卡」再由管理員審核 —— 兩個人兩道手續，
   而人當下已經走了，工時就這樣漏掉（0716 就漏過一筆）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 入口：只給管理員、只在今天、只對還沒下班的人');
{
/* 2026-09-04：拿掉 !done —— 使用者問「晚打卡管理員有修正的功能嗎」，
     而原本人一旦下班，這顆圓環就完全點不動，上班時間打錯沒有任何入口。
     其餘限制不動：仍然只有管理員、只有今天。 */
  ok('★★★ 條件缺一不可（0904 起已下班也點得開）',
     /const _canProxy=!!\(isToday && att && att\.id\s*\n\s*&& SESSION && SESSION\.role==='admin'\);/.test(src)
     && /只放寬到「已下班也點得開」，其餘限制不動/.test(src));
  ok('★★ 用 role==='+"'admin'"+' 而不是 isDeskLike —— 這是改別人的工時，櫃檯不該做',
     /只有管理員（不是 isDeskLike —— 這是改別人的工時，櫃檯不該做）/.test(src)
     && !/isDeskLike\(\)[^\n]*dutyPunchOutAsk/.test(src));
  ok('★★ 圓環本身才掛 onclick（沒資格的那幾顆一個字都沒變）',
     /_canProxy\?` role="button" tabindex="0" onclick="dutyPunchOutAsk\('\$\{att\.id\}'\)"`:''\}/.test(src)
     && /\$\{_canProxy\?' dr-proxy':''\}/.test(src));
  ok('★ 平常長得跟其他顆一樣，滑過才浮出「代打下班」',
     /\.duty-ring\.dr-proxy \.dr-time::after\{content:'　代打下班';/.test(src)
     && /不要讓它變成一排按鈕/.test(src));
}

console.log('\n② 執行：三道防線＋留痕');
{
  const F=grabFn('_dutyPunchOutGo');
  ok('★★★ 再驗一次身分（畫面可以被改，權限不能只靠畫面）',
     /if\(!\(SESSION && SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以代打卡'\); return; \}/.test(F));
/* 0904：已下班改成「可以修正」，所以不再擋。改用「兩個時間都沒動就不寫入」
     來避免留下無意義的修改紀錄 —— 本人自己打的那一筆只要沒被改就不會動到。 */
  ok('★★★ 已下班改成可修正，但沒動就不寫入',
     /if\(!_chg\.length\)\{ closeModal\(\); showToast\('時間沒有變動'\); return; \}/.test(F)
     && !/if\(rec\.clock_out\)\{ showToast\(`已經下班打卡了/.test(F));
  ok('★★★ 下班早於上班要擋 —— calcWorkHours 會當成跨午夜，算出 20 幾小時',
     /if\(t && timeToMin\(t\)<timeToMin\(tin\)\)\{/.test(F)
     && /calcWorkHours 會當成跨午夜，算出 20 幾小時的工時。/.test(src));
/* 0904：上班也能改，所以留痕要寫清楚**改了哪幾項**；只寫「代打下班」的話，
     日後工時對不上會找不到是上班被改過。另外一併寫 fixed_by／fixed_at。 */
  ok('★★★ 一定留痕：誰改的、幾點按的、改了哪幾項',
     /rec\.note=\(rec\.note\?rec\.note\+'｜':''\)\+`管理員修改（\$\{_who\}・\$\{nowHM\(\)\}）：\$\{_chg\.join\('、'\)\}`;/.test(F)
     && /rec\.fixed_by=\(SESSION&&SESSION\.id\)\|\|null;/.test(F));
  ok('★★ 工時用既有的 calcWorkHours 重算（不要自己再算一套），沒下班就是 null',
     /rec\.work_hours=rec\.clock_out\?calcWorkHours\(rec\):null;/.test(F));
  ok('★★ 防連點（這會寫工時）',
     /async function dutyPunchOutGo\(attId\)\{ return onceAct\('dutyout:'\+attId, \(\)=>_dutyPunchOutGo\(attId\)\); \}/.test(src));
  ok('★ 做完更新頂欄打卡狀態與底下那一頁',
     /await refreshHeaderPunch\(\);/.test(F) && /navTo\(CUR_PAGE, CUR_GROUP\);/.test(F));
}

console.log('\n③ 時間可改（管理員多半是事後才代打）');
{
/* ⚠ 2026-09-04 二修（使用者：「我剛剛修改上班打卡時間 結果連下班時間也一起儲存了」）——
     一修把下班預設成 nowHM() 而且必填，管理員只想改上班時按下儲存＝順手幫對方
     打了下班卡（實際發生：余東翰被記成 15:53 下班、工時 7 小時）。
     值班中一律預設留空；留空＝只改上班。 */
  ok('★★★ 值班中下班欄預設留空（不能預設現在，會誤打下班卡）',
     /const _outDef=_done\?rec\.clock_out:'';/.test(src)
     && /\$\{hmPicker\('dpo-t',_outDef\)\}/.test(src));
  ok('★★★ 留空＝只改上班，工時維持 null',
     /if\(t\) rec\.clock_out=t;\s+\/\/ 留空就維持原狀（值班中仍是 null）/.test(src)
     && /rec\.work_hours=rec\.clock_out\?calcWorkHours\(rec\):null;/.test(src));
  /* 「把欄位清空」跟「打錯沒填」長得一模一樣，所以不從欄位做；
     改成彈窗底下一顆明確的「取消下班」（見 ④）。 */
  ok('★★★ 已下班時不從欄位清空，導向那顆「取消下班」',
     /if\(!t && rec\.clock_out\)\{[\s\S]{0,120}?要清掉下班請按下面的「取消下班」/.test(src));
  ok('★★ 欄位標示「（選填）」並說明留空的意思',
     /<label>下班時間\$\{_done\?'':'（選填）'\}<\/label>/.test(src)
     && /<b>下班留空<\/b>＝只改上班時間，這個人維持值班中/.test(src));
  ok('★★ 這次翻車的原因寫在原地',
     /按下儲存等於\*\*順手幫對方打了下班卡\*\*（實際發生：余東翰被記成 15:53 下班）/.test(src));
  ok('★★★ 上班時間也是可改的欄位（0904）',
     /\$\{hmPicker\('dpo-in',rec\.clock_in\)\}/.test(src)
     && /const tin=readHM\('dpo-in'\);/.test(src)
     && /if\(!tin\)\{ showToast\('請選擇上班時間'\); return; \}/.test(src));
  ok('★★ 上班沒選就擋（下班不再必填）',
     /if\(!tin\)\{ showToast\('請選擇上班時間'\); return; \}/.test(src)
     && !/if\(!t\)\{ showToast\('請選擇下班時間'\); return; \}/.test(src));
  ok('★ 視窗上先講清楚會重算工時、而且會留下修改紀錄',
     /工時會依這兩個時間重算。/.test(src) && /這筆會記下是<b>你改的<\/b>/.test(src));
  ok('　 沒上班打卡的人不給代打（那是補卡的事）',
     /這位今天還沒上班打卡，請改用「申請補打卡」/.test(src));
}

console.log('\n④ 工時算式沒被動到（實跑既有的 calcWorkHours）');
{
  const f=new Function('return '+grabFn('calcWorkHours'))();
  eq('★ 09:00–17:30 → 8.5', f({clock_in:'09:00',clock_out:'17:30'}), 8.5);
  eq('★ 以 0.5 小時為單位四捨五入（09:00–17:20 → 8.5）', f({clock_in:'09:00',clock_out:'17:20'}), 8.5);
  eq('★ 沒下班就回 null', f({clock_in:'09:00'}), null);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
