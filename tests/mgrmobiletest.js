/* 兩位主管的手機端檢查（2026-09-08 使用者：「順便幫我檢查　兩位主管的手機端頁面有沒有錯誤」）
   黃沛瀞：合作・主管・可開課・不打卡・不值班
   余東翰：正職・主管・**不**開課・要打卡・要值班 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const HV2=g('async function coachHomeV2(){','\n}');
const NTF=g('PAGES.coach_notifications=async function(){','\n};');

console.log('① 不打卡的人（黃沛瀞）不要一直被推到打卡');
ok('★★★ 教練手機首頁的「今日值班」那兩格，不打卡也不值班的人不再是打卡入口',
   /const _noDuty=\(_meNow\.need_punch===false\)&&\(_meNow\.need_duty===false\);/.test(HV2)
   && /\$\{_noDuty\s*\n\s*\? `<div class="admh-kpi admh-rev admh-rev-lb"><span>今日值班<\/span><\/div>/.test(HV2));
ok('★★ 那一格寫「不需值班」，不是天天顯示「未排班」（那會被讀成漏排）',
   /<span class="chv2-band chv2-band-off">不需值班<\/span>/.test(HV2));
ok('★★★ 通知頁的「今日尚未上班打卡」也要看 need_punch',
   /if\(_me\.need_punch!==false && hasClassToday && \(!todayRec\|\|!todayRec\.clock_in\)\)\{/.test(NTF));
ok('★★ 通知頁自己撈得到那一列（原本整頁沒有 coaches）',
   /dbGetAll\('coaches'\)\.catch\(\(\)=>\[\]\)\]\);/.test(NTF)
   && /const _me=\(_cos\|\|\[\]\)\.find\(c=>c&&c\.id===SESSION\.id\)\|\|\{\};/.test(NTF));
ok('★★ 全檔其他打卡入口本來就看 need_punch（這一條是為了證明上面兩處是漏掉的，不是新規則）',
   /if\(!me\|\|!me\.need_punch\)\{ el\.innerHTML=''; return; \}/.test(src)
   && /if\(!me \|\| me\.need_punch===false\)\{ fab\.style\.display='none'; return; \}/.test(src)
   && /const punchCard = \(me&&me\.need_punch===false\)/.test(src));

console.log('\n② 不開課的人（余東翰）看不到行事曆 —— 兩份導覽要同一條線');
ok('★★★ 側邊導覽也擋（原本只有底部導覽擋，從側邊還是進得去）',
   /function mobileCoachNavItems\(\)\{/.test(src)
   && /return canTeach \? MOBILE_COACH_NAV : MOBILE_COACH_NAV\.filter\(n=>n\.key!=='coach_calendar'&&n\.key!=='coach_plans'\);/.test(src));
ok('★★★ 兩支 buildNav 都換過去（這一段在檔案裡有兩份）',
   (src.match(/isMobile\?mobileCoachNavItems\(\)/g)||[]).length===2
   && !/isMobile\?MOBILE_COACH_NAV/.test(src));
ok('★★ 底部導覽那一支跟著同一條線（2026-09-09 一起加了訓練方案）',
   /return canTeach \? COACH_BOTTOM_NAV : COACH_BOTTOM_NAV\.filter\(n=>n\.key!=='coach_calendar'&&n\.key!=='coach_plans'\);/.test(src));
ok('★★ 兩支判斷式一模一樣（不同寫法遲早會分岔）',
   (src.match(/const canTeach = !SESSION \|\| SESSION\.can_teach!==false;/g)||[]).length===2);

console.log('\n③ 主管在教練端該看得到的錢');
ok('★★★ 主管津貼看得到（教練端薪資頁）', /if\(sal\.supPay>0\) h\+=row\('主管津貼'/.test(src));
ok('★★★ 主管獎金看得到，而且帶名單', /if\(sal\.isLeader\)\{ h\+=row\('主管獎金'/.test(src));
ok('★★★ 團隊獎金池平分要帶 leaderMgrs —— 少帶就會把整池算給一個人',
   /const leaderMgrs = me\.is_manager \? leaderMgrsOf\(coaches, month\) : null;/.test(src));
ok('★★ 身份那一行寫「主管」（0908 正名，且不會印兩次）',
   /const mgrLine=me\.is_manager\?'主管':'';/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
