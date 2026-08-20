/* 本月其他支出（2026-07-31 使用者指示）

   「桌機版管理員 財務要有一個本月其他支出的表格可以填寫，這邊就要紀錄房租、水電等額外開銷」

   放在「本月營收」分頁裡（那裡本來就有月份翻頁），與營收並列才看得出當月進出。
   後續使用者定案（同日）：這些支出要算進營運分析的「本月利潤」
   → 利潤 ＝ 銷課金額 − 教練薪資 − 本月其他支出；
   歸月規則＝房租算當月的（7 月繳＝用 7 月的場地，預付概念），日期在哪個月就記在那個月。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const fm=g('async function finMonth(){','\n}\n');

console.log('資料來源');
/* 2026-08-13 課種分類：finMonth 多載 ticket_types（tkRevClass 歸課種要用），同一輪 Promise.all */
ok('★ 與營收同一次載入（不多打一輪來回；0813 起含 ticket_types）',
   /const \[purchases,tickets,expAll,_types\]=await Promise\.all\(\[dbGetAll\('purchases'\)\.catch\(\(\)=>\[\]\),dbGetAll\('member_tickets'\)\.catch\(\(\)=>\[\]\),dbGetAll\('expenses'\)\.catch\(\(\)=>\[\]\),dbGetAll\('ticket_types'\)\.catch\(\(\)=>\[\]\)\]\);/.test(fm));
ok('★ 只取這一頁在看的月份（ym 欄位）', /\(expAll\|\|\[\]\)\.filter\(e=>e\.ym===month\)/.test(fm));
ok('★ 依日期排序，同日看建立時間', /String\(a\.date\|\|''\)\.localeCompare\(String\(b\.date\|\|''\)\)\|\|String\(a\.created_at\|\|''\)\.localeCompare\(String\(b\.created_at\|\|''\)\)/.test(fm));
ok('　　讀不到（沒權限／表不存在）不會整頁壞掉', /dbGetAll\('expenses'\)\.catch\(\(\)=>\[\]\)/.test(fm));

console.log('\n本月營收那頁只留一格可點的統計');
ok('★ 統計格點了跳到「其他支出」分頁',
   /\{label:'其他支出', value:finMoney\(expTotal\), unit:'', tone:'danger', onclick:"setFinTab\('expenses'\)"\}/.test(fm));
ok('　　danger 這個色調有定義（紅字，但不是警告）', /\.lp-stat\.danger \.lp-stat-v\{color:var\(--danger\);\}/.test(src));
/* 2026-08-13 課種分類：本月營收頁多一張課種分類卡（clsCard），填寫表格仍不在這頁 */
ok('★ 填寫表格已搬走，這頁不再重複一份', /body\.innerHTML = dateBar \+ stats \+ clsCard \+ methodCard;/.test(fm));

console.log('\n其他支出分頁：固定支出與其他支出分開列');
{
  const fe=g('async function finExpenses(){','\n}\n');
  /* 2026-08-05 整合：分頁列收斂成 本月/今天/人員，支出改由「本月」頁的待處理快捷鈕進入，
     路由分支仍在（舊連結與快捷鈕都指得到）。 */
  ok('★ 支出頁仍可進入（快捷鈕＋路由分支）',
     /onclick="setFinTab\('expenses'\)">支出明細<\/button>/.test(src)
     && /else if\(_finTab==='expenses'\) await finExpenses\(\);/.test(src));
  ok('★ 依 is_fixed 分成兩區', /const fixed=mine\.filter\(e=>e\.is_fixed\), other=mine\.filter\(e=>!e\.is_fixed\);/.test(fe));
  ok('★ 固定支出排前面、其他支出在後', fe.indexOf("section('固定支出'")<fe.indexOf("section('其他支出'"));
  ok('★ 三個統計：固定／其他／合計',
     /\{label:'固定支出', value:finMoney\(sum\(fixed\)\), unit:''\}/.test(fe)
     && /\{label:'其他支出', value:finMoney\(sum\(other\)\), unit:''\}/.test(fe)
     && /\{label:'本月合計', value:finMoney\(sum\(mine\)\), unit:'', tone:'danger'\}/.test(fe));
  ok('★ 兩區各自有小計', (fe.match(/<td colspan="3" style="font-weight:700;">小計<\/td>/g)||[]).length===1
     && /\$\{finMoney\(sum\(arr\)\)\}/.test(fe));
  ok('★ 每區各有自己的「＋ 新增」，且帶入該區的類型',
     /onclick="finExpenseAdd\('',\$\{fixedNew\?1:0\}\)"/.test(fe)
     && /section\('固定支出','房租・水電・網路・清潔等每月都有的開銷', fixed, true\)/.test(fe)
     && /section\('其他支出','耗材・設備・稅務規費等一次性開銷', other, false\)/.test(fe));
  ok('★ 表格欄位：日期／項目／備註／金額', /<th>日期<\/th><th>項目<\/th><th>備註<\/th><th style="text-align:right;">金額<\/th>/.test(fe));
  ok('★ 每列可編輯、可刪除', /onclick="finExpenseEdit\('\$\{e\.id\}'\)"/.test(fe) && /onclick="finExpenseDel\('\$\{e\.id\}'\)"/.test(fe));
  ok('★ 沿用同一組月份翻頁（與本月營收同一個 _finMonth）',
     /const month=\(window\._finMonth\|\|ymd\(TODAY\)\.slice\(0,7\)\);/.test(fe)
     && /onclick="finMonthMove\(-1\)"/.test(fe));
  ok('　　空區塊給空狀態', /本月還沒有\$\{title\}/.test(fe));
  ok('　　項目與備註都做過跳脫', (fe.match(/\.replace\(\/<\/g,'&lt;'\)/g)||[]).length>=2);
  ok('　　頁尾寫明兩區都會被利潤扣掉、以及歸月規則',
     /兩區都會被營運分析的「本月利潤」扣掉/.test(fe) && /歸月看日期：房租算當月的/.test(fe));
  ok('　　讀不到不會整頁壞掉', /dbGetAll\('expenses'\)\.catch\(\(\)=>\[\]\)/.test(fe));
}

console.log('\n新增／編輯');
{
  const add=g('async function finExpenseAdd(id, fixedNew){','\n}\n');
  ok('★ 編輯與新增共用同一個視窗', /async function finExpenseEdit\(id\)\{ return finExpenseAdd\(id\); \}/.test(src));
  ok('★ 常用項目給選單', /const EXPENSE_CATS=\['房租','水電','網路','清潔','耗材','設備','稅務規費','其他'\];/.test(src));
  ok('★ 舊資料的自訂項目不會消失（不在清單裡就補一個選項）',
     /\(cat&&EXPENSE_CATS\.indexOf\(cat\)<0\?`<option value="\$\{cat\}" selected>\$\{cat\}<\/option>`:''\)/.test(add));
  ok('★ 新增時日期預設該月 1 號', /:month\+'-01'/.test(add));
  ok('★ 視窗有「類型」欄位（固定／其他）',
     /<option value="1" \$\{isFixed\?'selected':''\}>固定支出（每月都有）<\/option>/.test(add)
     && /<option value="0" \$\{isFixed\?'':'selected'\}>其他支出（一次性）<\/option>/.test(add));
  ok('★ 從哪一區按新增就預設哪一種', /const isFixed = e \? !!e\.is_fixed : !!fixedNew;/.test(add));
  ok('★ 選了房租／水電這類項目會自動跳固定（可再改回來）',
     /const EXPENSE_FIXED_CATS=\['房租','水電','網路','清潔'\];/.test(src)
     && /f\.value = EXPENSE_FIXED_CATS\.indexOf\(c\)>=0 \? '1' : '0';/.test(src)
     && /onchange="finExpenseCatSync\(\)"/.test(add));
  ok('　　找不到那筆就講清楚，不會開出空視窗', /if\(!e\)\{ showToast\('找不到這筆支出'\); return; \}/.test(add));
  ok('　　備註裡的引號不會把 value 屬性截斷', /String\(e\.note\)\.replace\(\/"\/g,'&quot;'\)/.test(add));
}
{
  const sv=g('async function finExpenseSave(id){','\n}\n');
  ok('★ 項目沒選、金額不是正數都擋下來',
     /if\(!category\)\{ showToast\('請選擇項目'\); return; \}/.test(sv)
     && /if\(!\(amount>0\)\)\{ showToast\('金額要大於 0'\); return; \}/.test(sv));
  /* 2026-07-31 使用者定案：房租是算當月的（7 月繳＝用 7 月的場地，預付概念）
     → 發生日期在哪個月就記在那個月，沒有另外的歸屬規則。 */
  ok('★ ym 由日期決定（日期空白才退回這一頁的月份）',
     /const obj=\{ id:id\|\|uid\('EXP'\), ym:\(String\(date\|\|''\)\.slice\(0,7\)\|\|month\), date, category, amount, note:note\|\|null, is_fixed \};/.test(sv));
  ok('★ 類型有存進去', /const is_fixed=\(\(document\.getElementById\('ex-fixed'\)\|\|\{\}\)\.value\|\|'0'\)==='1';/.test(sv));
  ok('　　存完停在「其他支出」分頁', /_finTab='expenses'; navTo\('finance','g_admin'\);/.test(sv));
  ok('　　原因寫在程式裡', /房租是算當月的，7 月繳就是用 7 月的場地，/.test(src));
  ok('★ 編輯時不覆蓋原始建立者', /if\(!id\)\{ obj\.created_by=\(SESSION&&SESSION\.id\)\|\|null; \}/.test(sv));
  ok('　　存檔失敗會講原因，不會默默關掉', /showToast\('儲存失敗：'\+\(\(err&&err\.message\)\|\|err\)\)/.test(sv));
  ok('　　存完重繪同一頁', /navTo\('finance','g_admin'\)/.test(sv));
}
{
  const del=g('async function finExpenseDel(id){','\n}\n');
  ok('★ 刪除前先確認，且講出是哪一筆', /confirm\(`刪除「\$\{\(e&&e\.category\)\|\|'這筆'\}/.test(del));
  ok('　　刪除失敗會講原因', /showToast\('刪除失敗：'\+\(\(err&&err\.message\)\|\|err\)\)/.test(del));
}

console.log('\n算進本月利潤（2026-07-31 使用者定案）');
{
  const dash=g('PAGES.dashboard=async function(){','\n};\n');
  /* 2026-08-12 使用者回報「手機報表 -1,680、桌機損益表 -33,890 對不起來」：
     利潤改吃與損益表同一套組成 —— 銷課(monthSalesValue) − 營業稅 − 人事(薪資＋公司勞健保) − 其他支出 */
  ok('★ 利潤扣掉其他支出（0812 起與損益表同式：再扣營業稅與公司勞健保）',
     /profit=\(_ovRev!=null\)\?\(_ovRev-_ovTax-salaryTotal-_ovCoIns-otherExp\):null;/.test(dash));   // 2026-08-20：_ovRev 移到共用計算，失敗時利潤顯示不出來而不是 NaN
  ok('★ 只取該月的支出', /\.filter\(e=>e&&e\.ym===ym\)\.reduce\(\(a,e\)=>a\+\(Number\(e\.amount\)\|\|0\),0\)/.test(dash));
  ok('★ 只在本月模式扣（支出以月記帳，切到「今日」沒有分攤方式）',
     /if\(_dashRange==='month'\)\{\s*\n\s*try\{ otherExp=/.test(dash));
  ok('　　讀不到支出不會讓整頁壞掉', /dbGetAll\('expenses'\)\.catch\(\(\)=>\[\]\)/.test(dash));
  /* 2026-08-12 對齊損益表：其他支出併進「稅＋支出」一格（營業稅＋其他支出） */
  ok('★ 拆解那行把其他支出也列出來（併在「稅＋支出」格）',
     /<b class="ovh-exp"><i>稅＋支出<\/i>\$\{fmtNT\(_ovTax\+otherExp\)\}<\/b>/.test(dash));
  /* 2026-07-31 使用者指示：三個組成各自上色。
     2026-08-12：銷課改用 _ovRev（monthSalesValue）、「薪資」改名「人事」（薪資＋公司勞健保） */
  ok('★ 銷課金色、人事綠色、稅＋支出紅色',
     /<b class="ovh-in"><i>銷課<\/i>\$\{fmtNT\(_ovRev!=null\?_ovRev:coachedFee\)\}<\/b>/.test(dash)
     && /<b class="ovh-pay"><i>人事<\/i>\$\{fmtNT\(\(salaryTotal\|\|0\)\+_ovCoIns\)\}<\/b>/.test(dash)
     && /\.ovh-in\{color:var\(--gold-d,#b48a56\);\}/.test(src)
     && /\.ovh-pay\{color:var\(--green,#1f6f54\);\}/.test(src)
     && /\.ovh-exp\{color:var\(--danger,#b5372e\);\}/.test(src));
  ok('★ 三項都是「標題在上、數字在下」，高度才一致',
     /\.ov-hero-s b\{display:flex;flex-direction:column;align-items:flex-end;gap:1px;/.test(src)
     && /\.ov-hero-s b i\{font-style:normal;font-size:10\.5px;/.test(src));
  ok('　　減號自己一格，不跟著換行', /\.ovh-op\{color:var\(--t3\);padding-bottom:1px;\}/.test(src));
  /* 2026-08-12 對齊損益表：說明改成一行小字（與經營報表同一套算法），
     沒登錄支出顯示「；其他支出尚未登錄」、登錄了顯示「、房租水電等支出」 */
  ok('★ 沒登錄支出時講清楚（不是默默當成 0）',
     /\$\{otherExp>0\?'、房租水電等支出':'；其他支出尚未登錄'\}/.test(dash));
  ok('　　登錄了就標明已含在算式裡',
     /與經營報表損益表同一套算法（含營業稅、公司負擔勞健保/.test(dash));
  ok('　　舊的「不含房租水電」字樣已移除', !/不含房租水電・不計自主訓練/.test(src));
}

console.log('\n權限與口徑');
ok('★ 只有管理員：經營報表掛在 g_admin（沒有 fd:true）',
   /\{grp:'財務', label:'經營報表', page:'finance'\}/.test(src));
ok('★ 利潤公式的註解已同步', /利潤 ＝ 銷課金額 − 教練應發薪資 − 本月其他支出（房租水電等，記在財務頁）。/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
