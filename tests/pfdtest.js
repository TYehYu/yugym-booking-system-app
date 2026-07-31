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
  const cells=[...blk.matchAll(/<span><b>\$\{[^}]+\}<\/b>([^<]*)<i>([^<]+)<\/i><\/span>/g)].map(m=>m[2]);
  eq('★ 剛好四格：教練課／團體課（含人次）／續約／值班工時',
     cells, ['教練課','團體課・${groupHeads} 人次','續約','值班工時']);
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
ok('　　其餘項目照舊（達標獎金／團體課費／值班費／續約獎金／店長津貼／主管津貼）',
   ["達標獎金","團體課費","值班費","續約獎金","店長津貼","主管津貼"].every(k=>blk.indexOf("row('"+k+"'")>0));
ok('　　應發合計 → 勞健保扣款 → 實領薪資 的收尾不變',
   blk.indexOf("row('應發合計'")<blk.indexOf("row('勞保（員工負擔）'")
   && blk.indexOf("row('勞保（員工負擔）'")<blk.indexOf("row('實領薪資'"));
ok('　　原因寫在程式裡', /最想知道的「這個月領多少」\s*\n\s*要捲到最下面才看得到/.test(src));

console.log('\n數字口徑沒被動到');
ok('★ 教練課堂數仍走 isPtPayClass（體驗不算）', /const ptDone=done\.filter\(isPtPayClass\)\.length;/.test(blk));
ok('★ 團課人次仍走 grpAttendHeads（請假不算）', /grpList\.reduce\(\(s,b\)=>s\+grpAttendHeads\(b\),0\)/.test(blk));
ok('★ 值班工時仍是「打卡封頂 − 上課重疊」，且正職不扣重疊',
   /const dutyOv=emp\.need_duty\?dutyClassOverlapHours\(shifts,bookings,empId,ym,emp\):0;/.test(blk)
   && /const dutyHours=Math\.max\(dutyCap-dutyOv,0\);/.test(blk));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
