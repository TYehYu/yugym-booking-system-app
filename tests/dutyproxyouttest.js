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
  ok('★★★ 三個條件缺一不可',
     /const _canProxy=!!\(isToday && !done && att && att\.id\s*\n\s*&& SESSION && SESSION\.role==='admin'\);/.test(src));
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
  ok('★★★ 已經打過下班就不覆蓋（避免蓋掉本人自己打的那一筆）',
     /if\(rec\.clock_out\)\{ showToast\(`已經下班打卡了（\$\{rec\.clock_out\}）`\); return; \}/.test(F));
  ok('★★★ 下班早於上班要擋 —— calcWorkHours 會當成跨午夜，算出 20 幾小時',
     /if\(timeToMin\(t\)<timeToMin\(rec\.clock_in\)\)\{/.test(F)
     && /calcWorkHours 會當成跨午夜，算出 20 幾小時的工時。/.test(src));
  ok('★★★ 一定留痕：誰代打的、幾點按的',
     /rec\.note=\(rec\.note\?rec\.note\+'｜':''\)\+`管理員代打下班（\$\{_who\}・\$\{nowHM\(\)\}）`;/.test(F));
  ok('★★ 工時用既有的 calcWorkHours 重算（不要自己再算一套）',
     /rec\.work_hours=calcWorkHours\(rec\);/.test(F));
  ok('★★ 防連點（這會寫工時）',
     /async function dutyPunchOutGo\(attId\)\{ return onceAct\('dutyout:'\+attId, \(\)=>_dutyPunchOutGo\(attId\)\); \}/.test(src));
  ok('★ 做完更新頂欄打卡狀態與底下那一頁',
     /await refreshHeaderPunch\(\);/.test(F) && /navTo\(CUR_PAGE, CUR_GROUP\);/.test(F));
}

console.log('\n③ 時間可改（管理員多半是事後才代打）');
{
  ok('★★ 預設現在，但用 hmPicker 讓人改',
     /\$\{hmPicker\('dpo-t',_now\)\}/.test(src)
     && /const t=readHM\('dpo-t'\);/.test(src));
  ok('★★ 沒選時間就擋', /if\(!t\)\{ showToast\('請選擇下班時間'\); return; \}/.test(src));
  ok('★ 視窗上先講清楚會重算工時、而且會留下代打紀錄',
     /工時會依這個時間重算。這筆會記下是<b>你代打的<\/b>/.test(src));
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
