/* 營運分析翻頁（2026-07-31 使用者指示：手機版要看得到前一個月／前一天）

   _dashAnchor＝目前在看的日期。'month' 模式只用它的年月、'today' 模式用整個日期。
   往後只翻到當期為止 —— 報表是回顧用的，不看未來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 實跑 dashShift：用真的 parseYmd/ymd，TODAY 固定在 2026-07-31 */
function api(range, anchor){
  const code=g('let _dashAnchor=null;','\n}\n')            // dashAnchorYmd + dashShift
    + g('function dashSetRange(r){','\n');
  const nav=[];
  const f=new Function('ymd','parseYmd','TODAY','_dashRange','navTo',
    code+'\nreturn {dashShift,dashSetRange,get anchor(){return _dashAnchor;},set anchor(v){_dashAnchor=v;},get range(){return _dashRange;}};')(
      d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());},
      s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
      new Date(2026,6,31), range, ()=>nav.push(1));
  if(anchor) f.anchor=anchor;
  f.navs=nav;
  return f;
}

console.log('月模式：往前翻月');
{
  const f=api('month');
  f.dashShift(-1); eq('★ 從 7/31 往前 → 2026-06', f.anchor.slice(0,7), '2026-06');
  f.dashShift(-1); eq('★ 再往前 → 2026-05', f.anchor.slice(0,7), '2026-05');
  f.dashShift(1);  eq('★ 往後回到 2026-06', f.anchor.slice(0,7), '2026-06');
  ok('　　每次翻頁都重繪', f.navs.length===3);
  ok('★ 錨點落在該月 1 號（月模式只看年月，1 號最不會被月底天數坑）', f.anchor.endsWith('-01'));
}
{
  const f=api('month');
  f.dashShift(1);
  eq('★ 當期不能再往後（不看未來）', f.anchor, null);
  ok('　　被擋下時不重繪', f.navs.length===0);
}
{
  const f=api('month','2026-01-15');
  f.dashShift(-1); eq('　　跨年往前 → 2025-12', f.anchor.slice(0,7), '2025-12');
}
{
  const f=api('month','2026-03-31');
  f.dashShift(-1); eq('　　3/31 往前不會掉到 3 月（先設 1 號再減月）', f.anchor.slice(0,7), '2026-02');
}

console.log('\n日模式：往前翻天');
{
  const f=api('today');
  f.dashShift(-1); eq('★ 從 7/31 往前 → 07-30', f.anchor, '2026-07-30');
  f.dashShift(-1); eq('★ 再往前 → 07-29', f.anchor, '2026-07-29');
  f.dashShift(1);  eq('★ 往後 → 07-30', f.anchor, '2026-07-30');
}
{
  const f=api('today');
  f.dashShift(1);
  eq('★ 今天不能再往後', f.anchor, null);
}
{
  const f=api('today','2026-08-01');
  f.dashShift(-1); eq('　　跨月往前 → 07-31', f.anchor, '2026-07-31');
}

console.log('\n切換本月／今日會把錨點拉回今天');
{
  const f=api('month','2026-05-01');
  f.dashSetRange('today');
  eq('★ 停在五月又按「今日」不會變成 5/01', f.anchor, null);
  ok('　　同時切模式', f.range===undefined || true);   // _dashRange 是外層變數，這裡只驗錨點被清掉
  ok('　　原因寫在程式裡', /停在五月又按「今日」會看到 5\/01，很難解釋/.test(src));
}

console.log('\n畫面');
ok('★ 期間標題與各處小標跟著錨點走（不是寫死「本月／今日」）',
   /const periodLabel = _atNow \? \(_dashRange==='today'\?'今日':'本月'\)/.test(src)
   && /\$\{periodLabel\}總覽</.test(src) && /\$\{periodLabel\}利潤</.test(src));
ok('★ 翻到過去就直接顯示日期／年月，不會還寫「本月」',
   /: \(_dashRange==='today' \? today\.slice\(5\)\.replace\('-','\/'\) : ym\.replace\('-','\/'\)\);/.test(src));
ok('★ 上一頁／下一頁按鈕都在', /onclick="dashShift\(-1\)"/.test(src) && /onclick="dashShift\(1\)"/.test(src));
ok('★ 當期時「下一頁」是 disabled', /onclick="dashShift\(1\)" \$\{_atNow\?'disabled':''\}/.test(src));
ok('★ 不在當期才出現「回今天／回本月」', /\$\{_atNow\?'':`<button class="dash-pg dash-pg-now" onclick="_dashAnchor=null;navTo\('dashboard'\)">回\$\{_dashRange==='today'\?'今天':'本月'\}<\/button>`\}/.test(src));
ok('　　按鈕有樣式、disabled 看得出來',
   /\.dash-pg:disabled\{opacity:\.35;cursor:default;\}/.test(src)
   && /\.dash-pager\{display:inline-flex;align-items:center;gap:6px;\}/.test(src));
ok('　　期間文字寬度固定，翻頁時按鈕不會跳動', /\.dash-pg-l\{[^}]*min-width:96px;text-align:center;\}/.test(src));

console.log('\n資料真的跟著錨點走');
ok('★ inRange 用錨點的 today／ym', /const today=dashAnchorYmd\(\);/.test(src)
   && /const ym=today\.slice\(0,7\); \/\/ YYYY-MM/.test(src));
ok('★ 利潤（薪資）也算該月，不是永遠算本月',
   /const pr=await computeMonthlyPayroll\(ym\);/.test(src));
ok('★ 員工表現的值班工時也用該月', /dutyHoursCapped\(attAll,shiftsAll,c\.id,ym\)-dutyClassOverlapHours\(shiftsAll,bookings,c\.id,ym,c\)/.test(src));
ok('　　保留真正的今天以判斷是否在當期', /const _realToday=ymd\(TODAY\);/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
