/* 員工端權限（2026-08-21 使用者指示兩則）
   ①「員工手機端 下方導覽列權限 有[開課]才可以看到行事曆 不然一律只能看到首頁
      有[管理員]才能看到報表」
   ②「所有教練都可以看到簡易課卡 但是只有管理員能夠全課卡互動
      非管理員的教練只能互動自己的課卡」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 手機導覽列：開課才看得到行事曆');
ok('★ 導覽列改成動態產生',
   /function coachBottomNavItems\(\)\{/.test(src)
   && /navItems=coachBottomNavItems\(\)/.test(src));
ok('★ 沒有開課權限就濾掉行事曆',
   /return canTeach \? COACH_BOTTOM_NAV : COACH_BOTTOM_NAV\.filter\(n=>n\.key!=='coach_calendar'\);/.test(src));
ok('★ 「開課」＝employees.can_teach（isTeachable 讀的就是它）',
   /function isTeachable\(c\)\{ return isCoachable\(c\) && c\.can_teach!==false; \}/.test(src)
   && /const canTeach = !SESSION \|\| SESSION\.can_teach!==false;/.test(src));
ok('★ 登入時把 can_teach 放進 SESSION（導覽列每次換頁都重畫，不能每次問 DB）',
   (src.match(/can_teach:\(c\.can_teach!==false\)/g)||[]).length===4);
ok('　　「報表」本來就只有管理員有（ADMIN_BOTTOM_NAV），不必另外擋',
   /const ADMIN_BOTTOM_NAV=\[[\s\S]{0,260}?\{key:'dashboard',  label:'報表'/.test(src)
   && !/COACH_BOTTOM_NAV=\[[\s\S]{0,200}?報表/.test(src));
{
  const COACH=[{key:'coach_today',label:'首頁'},{key:'coach_calendar',label:'行事曆'}];
  const items=S=>{ const canTeach=!S||S.can_teach!==false;
    return (canTeach?COACH:COACH.filter(n=>n.key!=='coach_calendar')).map(n=>n.label); };
  eq('★ 可開課 → 首頁＋行事曆', items({can_teach:true}), ['首頁','行事曆']);
  eq('★ 不可開課 → 只有首頁', items({can_teach:false}), ['首頁']);
  eq('　　舊 session 沒有這個欄位 → 當作可開課（預設開，不要無故鎖住既有教練）',
     items({}), ['首頁','行事曆']);
}

console.log('\n② 課卡互動：只有自己的課能動');
ok('★ 兩個入口都設（admh 卡走 expandBkCard、agenda 走 openCourseCard）',
   (src.match(/if\(SESSION && SESSION\.role==='coach' && !SESSION\.is_manager\)\{\s*\n\s*try\{ window\._coachReadonly = !bkIsCoach\(b, SESSION\.id\); \}/g)||[]).length===2);
ok('★ 店長不受限（0803 定案：升店長後要能調整全部課卡）',
   /店長（is_manager）不受限 —— 0803 已定案「升店長後要能調整全部課卡」，那條沒有被推翻/.test(src));
ok('★ 所有教練都看得到別人的課卡（不再匿名遮蔽）',
   /\+\(await renderCalendar\(\{onSlot:'quickBookAt',editable:true,stepping:_stepping\}\)\);/.test(src)
   && /window\._coachScope='all';/.test(src)
   && /原本一般教練是 me＋maskOthers（別人的課匿名成「已預約」、點不開）/.test(src));
{
  const bkIsCoach=(b,id)=>!!b&&(b.coach_id===id||b.substitute_coach_id===id);
  const readonly=(S,b)=>{ if(S&&S.role==='coach'&&!S.is_manager) return !bkIsCoach(b,S.id); return null; };
  const mine={coach_id:'c-1'}, other={coach_id:'c-2'}, sub={coach_id:'c-9',substitute_coach_id:'c-1'};
  eq('★ 一般教練・自己的課 → 可互動', readonly({role:'coach',id:'c-1'},mine), false);
  eq('★ 一般教練・別人的課 → 純檢視', readonly({role:'coach',id:'c-1'},other), true);
  eq('★ 代課的課算自己的', readonly({role:'coach',id:'c-1'},sub), false);
  eq('　　店長 → 不套這條（維持全課卡可動）', readonly({role:'coach',id:'c-1',is_manager:true},other), null);
  eq('　　管理員 → 不套這條', readonly({role:'admin',id:'a-1'},other), null);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
