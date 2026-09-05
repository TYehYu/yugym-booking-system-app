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
const ok=(n,c,x)=>{ if(c){pass++;/* 2026-09-05：圓角 50% → 999px（22 條，全部是正方形，畫出來一模一樣）——
   同一件事只留一種寫法。 */
console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
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
/* 2026-09-03：重繪改走 dashRepaint（重畫目前這一頁）——
   原本寫死 navTo('g_dashboard')，在 UI 實驗室裡點一下就被彈回營運畫面。 */
ok('★★ admCalToday 把月份設回今天那個月，並保住選月旗標（不然重繪會被 date 蓋掉）',
   /function admCalToday\(\)\{\s*\n\s*window\._admCalYm=ymd\(TODAY\)\.slice\(0,7\);\s*\n\s*window\._admCalKeep=true;\s*\n\s*dashRepaint\(\);/.test(src));
/* 2026-09-03：不可點的樣子從 opacity:.55 改成「透明底＋虛線框＋淡字」，
   與日期列的「今天」同一套（UI 實驗室試過後上線）。opacity 會把框線一起調糊，
   看起來像壞掉而不是「你已經在這裡」。 */
ok('★★ span 要自己置中（同日「今天」那顆踩過的坑）',
   /\.mcal-btn-now\{[\s\S]{0,140}?display:inline-flex;align-items:center;justify-content:center;/.test(src)
   && /\.mcal-btn-now\.is-now\{background:transparent;color:var\(--t3\);border:1px dashed var\(--bd\);\s*\n\s*cursor:default;pointer-events:none;\}/.test(src));
/* 2026-09-02 使用者：「回到今天跟回到當月的按鈕　可以做成圓形嗎」 */
ok('★★ 圓形（34px），與日期列的「今天」同一個形狀',
   /\.mcal-btn-now\{width:34px;height:34px;border-radius:50%;/.test(src)
   && /\.twk-bar>\.twk-today-slot \.tl-daynav-today\{[\s\S]{0,120}?border-radius:50%;/.test(src));

console.log('\n⑥ 選取的日期是圓框（2026-09-03 使用者附截圖：「選到的日期現在是用方框 改成圓框」）');
/* ⚠ 三個綠月曆共用的那組規則是**底線款**：border:0;border-radius:0;width:auto;height:auto;
   padding:0 2px 2px。Ink 後來把 border 改成 2px 實圈，卻沒重設圓角與尺寸
   → 2px 邊框套在 border-radius:0 上，畫出來就是方框。 */
ok('★★★ Ink 的選取圈補上圓角與尺寸（不是只改 border）',
   /body\.ink \.cal-side \.mc-cell\.mc-sel \.mc-d\{[\s\S]{0,220}?border-radius:var\(--radius-full\);width:22px;height:22px;padding:0;/.test(src));
ok('★★★ 尺寸與「今天」那顆一致（22×22 圓，兩顆才在同一列上對得齊）',
   /\.cal-side \.mc-cell\.mc-today \.mc-d,[\s\S]{0,200}?border-radius:var\(--radius-full\);width:22px;height:22px;/.test(src));
ok('★★ padding 要歸零（底線款留了 0 2px 2px，不清掉會把 22px 的圈撐開）',
   /padding 也要歸零，否則 22px 的框會被內距撐開/.test(src));
ok('★★ 方框的成因寫在原地',
   /這裡只改了 border，圓角與尺寸沒跟著改 → 2px 邊框套在 border-radius:0 上，\s*\n?\s*畫出來就是一個方框/.test(src));


console.log('\n⑨ 管理員手機首頁：圓角收斂（2026-09-05）');
{
  const css=src.replace(/\/\*[\s\S]*?\*\//g,'').match(/<style>[\s\S]*?<\/style>/g).join('');
  /* 2026-09-05：桌機家族的圓角改吃設計 token（--radius-xs…full，見 mctokentest）。
     這裡把 token 展開回字面值再統計 —— 這一組斷言守的是「有幾種圓角級距」，
     跟寫成字面還是 token 無關；不展開的話收斂成果會看起來像憑空消失。 */
  const RTOK={'--radius-xs':'6px','--radius-sm':'8px','--radius-md':'10px','--radius-lg':'12px',
              '--radius-xl':'14px','--radius-2xl':'16px','--radius-full':'999px'};
  const kinds=new Set();
  (css.match(/[^{}]+\{[^{}]*\}/g)||[]).forEach(r=>{
    const i=r.indexOf('{'); if(!/\.(mc-|mck)/.test(r.slice(0,i))) return;
    (r.slice(i).match(/border-radius:\s*([0-9]+px|999px|50%|var\(--radius-[a-z0-9]+\))/g)||[])
      .forEach(m=>{ const v=m.split(':')[1].trim();
        const t=v.match(/^var\((--radius-[a-z0-9]+)\)$/);
        kinds.add(t ? (RTOK[t[1]]||v) : v); });
  });
  /* ⚠ 為什麼這一頁挑圓角不挑字級：圓角改了**不會影響版面**（不改尺寸、不會溢出、
     不會把字擠掉），是最安全的一項。字級那 31 種大多是同一元件在不同情境的變體
     （.mc-brand-mark 4 種、.mc-kpi-n 5 種：KPI 少的時候數字大）—— 跟課卡同一種
     誤判，不要照數字砍。 */
  ok('★★★ 圓角種類從 18 收到 11 以內　現在 '+kinds.size+' 種', kinds.size<=11, [...kinds].sort());
  ok('★★★ 同一件事只留一種寫法：不再有 50%（22 條全是正方形，改了畫出來一樣）',
     !kinds.has('50%') && kinds.has('999px'));
  ok('★★★ 容器只剩 8／10／12／14／16 五級',
     ['8px','10px','12px','14px','16px'].every(k=>kinds.has(k))
     && !['11px','13px','18px','20px','24px'].some(k=>kinds.has(k)));
  ok('★★ 刻意保留的沒被動到（細線 1px、捲軸 3px、進度條 5px、Ink 自己那套 4／6px）',
     ['1px','3px','4px','5px','6px'].every(k=>kinds.has(k)));
  ok('★★ 本來就是膠囊卻寫成固定數字的，改成 999px（語意才對）',
     /\.mck-badge\{[^}]*border-radius:var\(--radius-full\);/.test(src)
     && /\.mc-rev-pay\{[^}]*border-radius:var\(--radius-full\);/.test(src));
  ok('★★ 為什麼挑圓角不挑字級，寫在原地',
     /圓角改了\*\*不會影響版面\*\*/.test(src));
}


console.log('\n⑩ 手機下限 11px（2026-09-05：可讀性 3/6）');
{
  const css2=src.replace(/\/\*[\s\S]*?\*\//g,'').match(/<style>[\s\S]*?<\/style>/g).join('');
  const small=[];
  (css2.match(/[^{}]+\{[^{}]*\}/g)||[]).forEach(r=>{
    const i=r.indexOf('{'); const sel=r.slice(0,i), body=r.slice(i);
    if(!/\.(mc-|mck)/.test(sel)) return;
    const m=body.match(/font-size:\s*([0-9.]+)px/);
    if(m && parseFloat(m[1])<11) small.push(sel.trim().replace(/\s+/g,' ').slice(0,40)+' '+m[1]);
  });
  /* ⚠ 剩下的七條全在圓點家族（.mck-dot／.mck-d2／.mc-dot／dots6）——
     那裡的字級是跟著圓點尺寸等比的，放大會撐破。 */
  ok('★★★ 低於 11px 的只剩圓點家族（原本 25 條，現在 '+small.length+' 條）',
     small.length<=7 && small.every(x=>/mck-dot|mck-d2|mc-dot\b|mck-dots6/.test(x)), small);
  ok('★★★ 為什麼圓點的字不能一起放大，寫在原地',
     /圓點內的字級是\*\*跟著圓點尺寸等比\*\*的，放大會撐破/.test(src));
  /* A/B 離線量測（2026-09-05，390px）：改 18 條，新溢出 0、新截斷 0、
     小月曆週標題七格仍同列、頁高不變，只有 .mc-acct 高了 1px。 */
  ok('★★ A/B 量測結果記在這支測試裡',
     /改 18 條，新溢出 0、新截斷 0/.test(require('fs').readFileSync(__filename,'utf8')));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
