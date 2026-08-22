/* 上一週／下一週一律落在「那一週的週一」（2026-08-22 使用者指示：
   「全頁面的下一週跟上一週的按鈕 每次按完頁面內容都要從該週的第一天也就是週一開始」） */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 實跑：把 heroWeekStep 與它依賴的兩支抓出來單獨執行 */
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const env={ymd,parseYmd,TODAY:new Date(2026,7,22)};
const fn=new Function(...Object.keys(env),
  grabFn('heroWeekMonday')+'\n'+grabFn('heroWeekStep')+'\nreturn {heroWeekStep,heroWeekMonday};')(...Object.values(env));
const wd=s=>'日一二三四五六'[parseYmd(s).getDay()];

console.log('實跑 heroWeekStep（管理員手機首頁／教練手機首頁／手機行事曆共用同一支）');
ok('★ 週六按下一週 → 下週一（8/22 → 8/24），不是下週六',
   fn.heroWeekStep('2026-08-22',1)==='2026-08-24');
ok('★ 週日按下一週 → 下週一（8/23 → 8/24）', fn.heroWeekStep('2026-08-23',1)==='2026-08-24');
ok('★ 週六按上一週 → 上一週的週一（8/22 → 8/10 那週）',
   fn.heroWeekStep('2026-08-22',-1)==='2026-08-10');
ok('★ 已經在週一時照常一次跳一週（8/24 → 8/31 ／ 8/17）',
   fn.heroWeekStep('2026-08-24',1)==='2026-08-31' && fn.heroWeekStep('2026-08-24',-1)==='2026-08-17');
{
  let d='2026-08-22'; const seq=[]; for(let i=0;i<4;i++){ d=fn.heroWeekStep(d,1); seq.push(d); }
  ok('★★ 連按多次仍然每次都是週一（不會因為第一次校正而卡住或跳兩週）',
     seq.join(',')==='2026-08-24,2026-08-31,2026-09-07,2026-09-14'
     && seq.every(x=>wd(x)==='一'));
}

console.log('\n涵蓋範圍');
ok('★ 三處共用這一支（admWeekShift／coachWeekShift／cagWeekShift）',
   /function admWeekShift\(dir\)\{[\s\S]{0,160}?heroWeekStep\(cur,dir\)/.test(src)
   && /function coachWeekShift\(dir\)\{[\s\S]{0,160}?heroWeekStep\(cur,dir\)/.test(src)
   && /function cagWeekShift\(dir\)\{ cagSelectDate\(heroWeekStep\(window\._cagSelDate\|\|ymd\(TODAY\),dir\)\); \}/.test(src));
ok('★ 桌機日期直欄的 ‹ ›（dashDayShift ±7）也要落在週一；一天一天翻（±1）不受影響',
   /if\(Math\.abs\(dir\)>=7 && typeof heroWeekMonday==='function'\)\{/.test(src)
   && /一天一天翻（手機的 ±1）維持原樣/.test(src));
ok('　　行事曆那兩支本來就以週為單位（calStepWeek 走 calWeekStart、wtlStepWeek 走 _wtlMonday）',
   /calWeekStart = addDays\(calWeekStart, dir\*7\);/.test(src)
   && /const m=parseYmd\(window\._wtlMonday\); m\.setDate\(m\.getDate\(\)\+delta\*7\);/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
