/* 本月其他支出（2026-07-31 使用者指示）

   「桌機版管理員 財務要有一個本月其他支出的表格可以填寫，這邊就要紀錄房租、水電等額外開銷」

   放在「本月營收」分頁裡（那裡本來就有月份翻頁），與營收並列才看得出當月進出。
   營運分析的「利潤」刻意只算課堂這門生意（銷課金額 − 教練薪資），不含這些固定成本 ——
   兩邊口徑各自清楚，不互相污染。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const fm=g('async function finMonth(){','\n}\n');

console.log('資料來源');
ok('★ 與營收同一次載入（不多打一輪來回）',
   /const \[purchases,tickets,expAll\]=await Promise\.all\(\[dbGetAll\('purchases'\)\.catch\(\(\)=>\[\]\),dbGetAll\('member_tickets'\)\.catch\(\(\)=>\[\]\),dbGetAll\('expenses'\)\.catch\(\(\)=>\[\]\)\]\);/.test(fm));
ok('★ 只取這一頁在看的月份（ym 欄位）', /\(expAll\|\|\[\]\)\.filter\(e=>e\.ym===month\)/.test(fm));
ok('★ 依日期排序，同日看建立時間', /String\(a\.date\|\|''\)\.localeCompare\(String\(b\.date\|\|''\)\)\|\|String\(a\.created_at\|\|''\)\.localeCompare\(String\(b\.created_at\|\|''\)\)/.test(fm));
ok('　　讀不到（沒權限／表不存在）不會整頁壞掉', /dbGetAll\('expenses'\)\.catch\(\(\)=>\[\]\)/.test(fm));

console.log('\n畫面');
ok('★ 統計列多一格「其他支出」', /\{label:'其他支出', value:finMoney\(expTotal\), unit:'', tone:'danger'\}/.test(fm));
ok('　　danger 這個色調有定義（紅字，但不是警告）', /\.lp-stat\.danger \.lp-stat-v\{color:var\(--danger\);\}/.test(src));
ok('★ 表格欄位：日期／項目／備註／金額', /<th>日期<\/th><th>項目<\/th><th>備註<\/th><th style="text-align:right;">金額<\/th>/.test(fm));
ok('★ 有合計列', /<td colspan="3" style="font-weight:700;">合計<\/td>/.test(fm) && /finMoney\(expTotal\)/.test(fm));
ok('★ 每列可編輯、可刪除', /onclick="finExpenseEdit\('\$\{e\.id\}'\)"/.test(fm) && /onclick="finExpenseDel\('\$\{e\.id\}'\)"/.test(fm));
ok('★ 有「＋ 新增支出」', /onclick="finExpenseAdd\(\)"/.test(fm));
ok('　　沒資料時給空狀態，不是空白表格', /本月還沒有記錄其他支出/.test(fm));
ok('　　接在付款方式比例後面', /body\.innerHTML = dateBar \+ stats \+ methodCard \+ expCard;/.test(fm));
ok('　　項目與備註都做過跳脫', (fm.match(/\.replace\(\/<\/g,'&lt;'\)/g)||[]).length>=2);
ok('　　說明寫清楚不含教練薪資', /房租・水電・耗材等固定開銷（不含教練薪資）/.test(fm));

console.log('\n新增／編輯');
{
  const add=g('async function finExpenseAdd(id){','\n}\n');
  ok('★ 編輯與新增共用同一個視窗', /async function finExpenseEdit\(id\)\{ return finExpenseAdd\(id\); \}/.test(src));
  ok('★ 常用項目給選單', /const EXPENSE_CATS=\['房租','水電','網路','清潔','耗材','設備','稅務規費','其他'\];/.test(src));
  ok('★ 舊資料的自訂項目不會消失（不在清單裡就補一個選項）',
     /\(cat&&EXPENSE_CATS\.indexOf\(cat\)<0\?`<option value="\$\{cat\}" selected>\$\{cat\}<\/option>`:''\)/.test(add));
  ok('★ 新增時日期預設該月 1 號', /:month\+'-01'/.test(add));
  ok('　　找不到那筆就講清楚，不會開出空視窗', /if\(!e\)\{ showToast\('找不到這筆支出'\); return; \}/.test(add));
  ok('　　備註裡的引號不會把 value 屬性截斷', /String\(e\.note\)\.replace\(\/"\/g,'&quot;'\)/.test(add));
}
{
  const sv=g('async function finExpenseSave(id){','\n}\n');
  ok('★ 項目沒選、金額不是正數都擋下來',
     /if\(!category\)\{ showToast\('請選擇項目'\); return; \}/.test(sv)
     && /if\(!\(amount>0\)\)\{ showToast\('金額要大於 0'\); return; \}/.test(sv));
  ok('★ ym 用「這一頁在看的月份」，不用日期回推',
     /const obj=\{ id:id\|\|uid\('EXP'\), ym:month, date, category, amount, note:note\|\|null \};/.test(sv));
  ok('　　原因寫在程式裡（7 月底繳 8 月房租的情況）',
     /7 月底繳 8 月房租時，日期是 7\/31 但要記在 7 月的支出裡/.test(src));
  ok('★ 編輯時不覆蓋原始建立者', /if\(!id\)\{ obj\.created_by=\(SESSION&&SESSION\.id\)\|\|null; \}/.test(sv));
  ok('　　存檔失敗會講原因，不會默默關掉', /showToast\('儲存失敗：'\+\(\(err&&err\.message\)\|\|err\)\)/.test(sv));
  ok('　　存完重繪同一頁', /navTo\('finance','g_admin'\)/.test(sv));
}
{
  const del=g('async function finExpenseDel(id){','\n}\n');
  ok('★ 刪除前先確認，且講出是哪一筆', /confirm\(`刪除「\$\{\(e&&e\.category\)\|\|'這筆'\}/.test(del));
  ok('　　刪除失敗會講原因', /showToast\('刪除失敗：'\+\(\(err&&err\.message\)\|\|err\)\)/.test(del));
}

console.log('\n權限與口徑');
ok('★ 只有管理員：財務總覽掛在 g_admin（沒有 fd:true）',
   /\{grp:'財務', label:'財務總覽', page:'finance'\}/.test(src));
ok('★ 註解講清楚與營運分析「利潤」的分工',
   /營運分析的「利潤」只算課堂這門生意（銷課金額 − 教練薪資），刻意不含房租水電/.test(src));
ok('★ 營運分析那句「不含房租水電」還在（兩邊口徑沒被混掉）',
   /不含房租水電・不計自主訓練/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
