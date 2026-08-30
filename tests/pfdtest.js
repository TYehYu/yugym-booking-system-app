/* 當月表現與薪資彈窗（openPerfDetail）版面（2026-07-31 使用者指示）

   最上方顯示實領薪資 → 四格（教練課／團體課含人次／續約／值班工時）
   → 分隔線 → 薪資計算公式（保障底薪、教練課費，取數字高者）。

   原本一進來先看到五格統計，最想知道的「這個月領多少」要捲到最下面才看得到。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const i=src.indexOf('async function openPerfDetail(empId, month){');
const blk=src.slice(i, src.indexOf('\n}\nasync function computeMonthlyPayroll', i));

console.log('由上而下的順序');
{
  const at=t=>blk.indexOf(t);
  ok('★ 實領薪資在最上面', at('pfd-hero')>0 && at('pfd-hero')<at('pfd-stats'));
  ok('★ 四格接在下面', at('pfd-stats')<at('pfd-sep'));
  ok('★ 分隔線在四格與公式之間', at('pfd-sep')>at('pfd-stats') && at('pfd-sep')<at('pfd-list'));
  ok('★ 計算公式在最後', at('pfd-list')>at('pfd-sep'));
}

console.log('\n最上方的實領薪資');
ok('★ 用 sal.netPay（與公式最後一行同一個數字）',
   /<div class="pfd-hero"><span class="pfd-hero-l">實領薪資<\/span><span class="pfd-hero-v">\$\{money\(sal\.netPay\)\}<\/span><\/div>/.test(blk));
ok('　　大字、品牌綠、靠右', /\.pfd-hero-v\{font-size:30px;font-weight:800;font-family:var\(--num\);color:var\(--green\);/.test(src)
   && /\.pfd-hero\{display:flex;flex-direction:column;align-items:flex-end;/.test(src));
ok('　　公式最後一行仍保留實領薪資（那是算式的結論，不是重複裝飾）',
   /rows\+=row\('實領薪資','', money\(sal\.netPay\), \{sum:true\}\);/.test(blk));

console.log('\n四格');
{
  /* 2026-08-02：續約那格改成可點的 <button>（看名單），所以同時收 span 與 button */
  const cells=[...blk.matchAll(/<(?:span|button[^>]*)><b>\$\{[^}]+\}<\/b>([^<]*)<i>([^<]+)<\/i><\/(?:span|button)>/g)].map(m=>m[2]);
  eq('★ 剛好四格：教練課／團體課（含人次）／續約／值班工時',
     cells, ['教練課','團體課・${groupHeads} 人次','續約 ›','值班工時']);
  ok('★ 團課人次併進團體課那格，不再獨立一格', !/<i>團課人數<\/i>/.test(blk));
  ok('★ 團體課那格顯示的是堂數', /<span><b>\$\{grpList\.length\}<\/b>堂<i>團體課・/.test(blk));
  ok('★ 值班那格顯示的是工時', /<span><b>\$\{dutyHours\.toFixed\(1\)\}<\/b>hr<i>值班工時<\/i><\/span>/.test(blk));
  ok('★ 版面固定一列四格（不是原本會亂折行的 flex-wrap）',
     /\.pfd-stats\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:8px;/.test(src)
     && !/\.pfd-stats\{display:flex;flex-wrap:wrap;/.test(src));
  ok('　　太窄（<360px）才退成兩排',
     /@media \(max-width:360px\)\{ \.pfd-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\} \}/.test(src));
}

console.log('\n計算公式');
ok('★ 「底薪」改叫「保障底薪」（不然看不出下面那條在比什麼）',
   /rows\+=row\('保障底薪', sal\.schedHours>0\?/.test(blk) && !/rows\+=row\('底薪',/.test(blk));
ok('★ 教練課費接在保障底薪後面',
   blk.indexOf("row('保障底薪'")<blk.indexOf("row('教練課費'"));
ok('★ 教練課收入寫明「取數字高者」',
   /rows\+=row\('教練課收入', `取數字高者 → \$\{sal\.ptIsFloor\?'保障底薪':'教練課費'\}`, money\(sal\.ptIncome\), \{sum:true\}\);/.test(blk));
/* 2026-08-02：店長那一項改制（逐位教練達標），名稱也從「津貼」改成「獎金」 */
ok('　　其餘項目照舊（達標獎金／團體課費／值班費／續約獎金／店長獎金／主管津貼）',
   ["達標獎金","團體課費","值班費","續約獎金","店長獎金","主管津貼"].every(k=>blk.indexOf("row('"+k+"'")>0));
ok('　　應發合計 → 勞健保扣款 → 實領薪資 的收尾不變',
   blk.indexOf("row('應發合計'")<blk.indexOf("row('勞保（員工負擔）'")
   && blk.indexOf("row('勞保（員工負擔）'")<blk.indexOf("row('實領薪資'"));
ok('　　原因寫在程式裡', /最想知道的「這個月領多少」\s*\n\s*要捲到最下面才看得到/.test(src));

console.log('\n數字口徑沒被動到');
ok('★ 教練課堂數仍走 isPtPayClass（體驗不算）', /const ptDone=done\.filter\(isPtPayClass\)\.length;/.test(blk));
ok('★ 團課人次仍走 grpAttendHeads（請假不算）', /grpList\.reduce\(\(s,b\)=>s\+grpAttendHeads\(b\),0\)/.test(blk));
/* 2026-08-30：改叫 dutyClassOverlapRows（要在薪資單列出是哪一堂），
   時數由明細加總，算法與正職不扣的規則都沒變。 */
ok('★ 值班工時仍是「打卡封頂 − 上課重疊」，且正職不扣重疊',
   /const dutyOvRows=emp\.need_duty\?dutyClassOverlapRows\(shifts,bookings,empId,ym,emp\):\[\];/.test(blk)
   && /const dutyOv=dutyOvRows\.reduce\(\(n,r\)=>n\+r\.hr,0\);/.test(blk)
   && /const dutyHours=Math\.max\(dutyCap-dutyOv,0\);/.test(blk));

console.log('\n續約可以看名單（2026-08-02 使用者指示）');
/* 原本只給一個張數，對不上就沒得查 —— 逐筆清單跟薪資單走同一支 renewListOf，
   不另外算一份。 */
ok('★ 拿的是逐筆清單，不是只有張數',
   /const _renewRows=\(renewListOf\(ym, tickets, purAll, bookings, ttAll\)\|\|\{\}\)\[empId\]\|\|\[\];/.test(src)
   && /const renewCount=_renewRows\.length;/.test(src));
ok('★ 有續約才變成可點（0 張不給點）',
   /\$\{renewCount\n?\s*\? `<button class="pfd-tap" onclick="pfdToggleRenew\(\)"/.test(src)
   && /: `<span><b>0<\/b>張<i>續約<\/i><\/span>`\}/.test(src));
ok('★ 就地展開，不疊第二層彈窗', /function pfdToggleRenew\(\)\{/.test(src)
   && /el\.classList\.toggle\('open'\);/.test(src)
   && /<div class="pfd-nl" id="pfd-renew">/.test(src));
ok('　　為什麼不另開視窗，寫在程式裡',
   /這個視窗本身就是彈窗，再疊一層就得做返回，\n\s*而且看名單的當下多半還想對照上面的薪資列。/.test(src));
/* 2026-08-12 SANDY 案例：店長名單在區域 _esc 宣告「之前」就用到它 → TDZ 錯誤，
   整支 openPerfDetail 改用全域 escH，區域版移除 —— 跳脫行為不變，只是換名字。 */
ok('★ 名單列出會員、方案、日期、金額，並給合計',
   /<span class="nl-nm">\$\{escH\(_memNm\[r\.member_id\]\|\|'—'\)\}<\/span>/.test(src)
   && /<span class="nl-amt">/.test(src)
   && /<div class="nl-sum"><span>合計<\/span>/.test(src));
ok('　　會員名字有跳脫（2026-08-12 改用全域 escH，區域 _esc 因 TDZ 移除）',
   /function escH\(t\)\{ return String\(t==null\?'':t\)\.replace\(\/&\/g,'&amp;'\)/.test(src)
   && !/const _esc=t=>String\(t\|\|''\)\.replace/.test(src));
ok('　　預設收著，點了才開', /\.pfd-nl\{display:none;/.test(src) && /\.pfd-nl\.open\{display:flex;\}/.test(src));
/* 0823 使用者指示：「四個 kpi 跟下面的資料都要用白底框」——米底改白底，
   四格才分得出是四項；下面的薪資計算也一項一框。 */
ok('　　可點那格平常跟其他三格一樣（滑過去才浮出來）',
   /\.pfd-stats span,\.pfd-stats \.pfd-tap\{min-width:0;background:#fff/.test(src)
   && /\.pfd-stats \.pfd-tap:hover\{border-color:var\(--green\)/.test(src));
ok('★★ 四格與薪資計算列都用白底框（與營運速覽／員工表現／損益表同一套語彙）',
   /\.pfd-list\{display:flex;flex-direction:column;gap:6px;\}/.test(src)
   && /\.pfd-row\{[^}]*background:#fff;border:1px solid var\(--bd\);border-radius:10px;padding:9px 11px;\}/.test(src));
ok('　　合計那一列仍看得出是結論（白框＋綠邊，不再靠 border-top 分段）',
   /\.pfd-row\.pfd-sum\{border-color:var\(--green\);background:color-mix\(in srgb,var\(--green\) 4%,#fff\);/.test(src));
ok('★★ 這張卡只有管理員打得開（下半部是完整薪資結構）',
   /if\(!\(SESSION && SESSION\.role==='admin'\)\)\{ showToast\('薪資明細僅管理員可查看'\); return; \}/.test(src)
   && /const _perfTap=!!\(SESSION && SESSION\.role==='admin'\);/.test(src));
ok('　　沒權限就連「可點」都不畫（權限層級＝這個身分根本沒有這個功能）',
   /<div class="perf-m-row\$\{_perfTap\?' perf-clickable':''\}"\$\{_perfTap\?` onclick="openPerfDetail/.test(src)
   && /<tr class="\$\{_perfTap\?'perf-clickable':''\}"\$\{_perfTap\?` onclick="openPerfDetail/.test(src));
ok('　　上半部的「表現」不是機密，那張表照樣人人看得到',
   /上半部的「表現」（堂數／續約／工時）不是機密，員工表現那張表照樣人人看得到/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
