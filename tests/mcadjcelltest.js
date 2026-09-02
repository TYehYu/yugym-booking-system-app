/* 月曆的「上／下月補日格」要跟一般格同構（2026-09-02 使用者回報，附截圖）

   「首頁左邊欄第一個月曆　每週日期列高度要固定　像這個月　是不是因為上個月或
     下個月的日期沒有按鈕互動功能　所以就靠上了」

   不是互動的關係，是**子元素數量**：.mc-cell 是 flex-column ＋ justify-content:center，
   多一個子元素整欄就往上位移，補日的數字看起來比本月的高一截。

   ⚠ 兩個月曆各錯一邊：
     ・首頁月曆：0823「移除每日課堂數」之後一般格只剩「日期」一行，
       補日格卻還留著隱形的課數圈 → 補日往上頂（使用者看到的那張）。
     ・教練月曆：一般格是三行（日期／班別／課數），補日格只給兩行 → 反過來往下掉。
   ⚠ 所以佔位列改成由呼叫端指定，不要在 mcAdjCell 裡面猜。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const i=src.indexOf('function mcAdjCell(');
const mcAdjCell=new Function(src.slice(i, src.indexOf('\n}',i)+2)+'\nreturn mcAdjCell;')();
const rows=h=>(h.match(/<span/g)||[]).length;

console.log('① 佔位列由呼叫端決定');
eq('★★★ 沒帶 kind＝只有日期一行（首頁月曆）', rows(mcAdjCell(30)), 1);
eq('★★ dot＝日期＋課數圈', rows(mcAdjCell(30,'dot')), 2);
eq('★★ coach＝日期＋班別＋課數圈', rows(mcAdjCell(30,'coach')), 3);
ok('★ 補日一律掛 .mc-adj（淡化、點不到）', /class="mc-cell mc-adj/.test(mcAdjCell(30)));
ok('★ 需要可點時才加 .mc-adj-click 與 onclick（預約行事曆用）',
   /mc-adj-click/.test(mcAdjCell(30,'',"go('x')")) && /onclick="go\('x'\)"/.test(mcAdjCell(30,'',"go('x')"))
   && !/onclick/.test(mcAdjCell(30)));

console.log('\n② 兩個呼叫端各自對齊自己的一般格');
{
  /* 首頁月曆：0823 起一般格只有 <span class="mc-d">，所以補日也只能有一行 */
  const home=src.slice(src.indexOf("const _adj=mcAdjCells(_ayy,_amm);"), src.indexOf("const _curWk=_curIdx>=0"));
  ok('★★★ 首頁：一般格只有日期，補日也只給日期',
     /_adj\.lead\.forEach\(d=>_cellArr\.push\(mcAdjCell\(d\)\)\);/.test(home)
     && /_adj\.tail\.forEach\(d=>_cellArr\.push\(mcAdjCell\(d\)\)\);/.test(home)
     && /<div class="mc-cell\$\{ds===ymd\(TODAY\)\?' mc-today':''\}[\s\S]{0,200}?<span class="mc-d">\$\{d2\}<\/span><\/div>/.test(home));
  /* 教練月曆：一般格是三行 */
  const coach=src.slice(src.indexOf("_cwAdj.lead.forEach"), src.indexOf("const _cwCur=_cwIdx>=0"));
  ok('★★★ 教練：一般格三行，補日也給三行',
     /_cwAdj\.lead\.forEach\(d=>_cwArr\.push\(mcAdjCell\(d,'coach'\)\)\);/.test(coach)
     && /_cwAdj\.tail\.forEach\(d=>_cwArr\.push\(mcAdjCell\(d,'coach'\)\)\);/.test(coach)
     && /<span class="mc-d">\$\{d\}<\/span>[\s\S]{0,200}?class="cattn-shift[\s\S]{0,200}?class="mc-dot/.test(coach));
}

console.log('\n③ 每一列的高度本來就是固定的（格子是正方形）');
ok('★★ .mc-cell 用 aspect-ratio:1＋min-height，寬度決定高度，七格等寬所以每列等高',
   /\.mc-cell\{position:relative;aspect-ratio:1;min-height:44px;/.test(src));
ok('★★ 垂直置中（子元素一多就會整欄上移，這正是這支測試在守的）',
   /\.mc-cell\{[^}]*flex-direction:column;align-items:center;justify-content:center;/.test(src));

console.log('\n④ 為什麼寫在原地');
ok('★★ 成因與「不是互動的關係」留在程式裡',
   /不是互動的關係，是子元素數量/.test(src)
   && /新增月曆時對照一般格有幾行，這裡就給幾行/.test(src));

console.log('\n⑤ 回到當月（2026-09-02 使用者指示：「首頁的月曆新增回到當月的按鈕」）');
ok('★★ 不在當月＝可點的鈕；已經在當月＝不可點的「當月」（那一格永遠佔著）',
   /\$\{_aYm===ymd\(TODAY\)\.slice\(0,7\)\s*\n\s*\? `<span class="mcal-btn mcal-btn-now is-now" title="正在看當月">當月<\/span>`\s*\n\s*: `<button class="mcal-btn mcal-btn-now" onclick="admCalToday\(\)"/.test(src));
ok('★★ admCalToday 把月份設回今天那個月，並保住選月旗標（不然重繪會被 date 蓋掉）',
   /function admCalToday\(\)\{\s*\n\s*window\._admCalYm=ymd\(TODAY\)\.slice\(0,7\);\s*\n\s*window\._admCalKeep=true;\s*\n\s*navTo\('g_dashboard'\);/.test(src));
ok('★★ span 要自己置中（同日「今天」那顆踩過的坑）',
   /\.mcal-btn-now\{[\s\S]{0,140}?display:inline-flex;align-items:center;justify-content:center;/.test(src)
   && /\.mcal-btn-now\.is-now\{opacity:\.55;cursor:default;pointer-events:none;\}/.test(src));
/* 2026-09-02 使用者：「回到今天跟回到當月的按鈕　可以做成圓形嗎」 */
ok('★★ 圓形（34px），與日期列的「今天」同一個形狀',
   /\.mcal-btn-now\{width:34px;height:34px;border-radius:50%;/.test(src)
   && /\.twk-bar>\.twk-today-slot \.tl-daynav-today\{[\s\S]{0,120}?border-radius:50%;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
