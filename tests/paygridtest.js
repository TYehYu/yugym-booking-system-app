/* 今日收款提醒的展開視窗（2026-07-30 使用者指示，二修）——
   依上課時間分組：時間標在左邊一欄，同一時間的人四個一列、超過就換到第二列。
   櫃檯是「照時間準備、掃一眼挑一個點進去」，格狀按鈕比一列一人的清單好抓。
   其他待辦名單（降級／未打卡）維持清單。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

// 真的把 openTodoList 抽出來跑
const i=src.indexOf('function openTodoList(kind){');
const j=src.indexOf('\n}', src.indexOf('modal-foot', i))+2;
const ITEMS=[
  {id:'M1',name:'陳蘭馨',sub:'教練課・續課',tkid:'T1',rs:'',time:'10:00'},
  {id:'M2',name:'王小明',sub:'團體課・續課',tkid:'T2',rs:'renewed',time:'19:00'},
  {id:'',  name:'新客人',sub:'新客戶簽約・私人教練',tkid:'',rs:'',time:'20:30',pay:true},
  {id:'M4',name:'李中間',sub:'教練課・分期繳費',tkid:'T4',rs:'considering',time:'21:00'},
];
const run=(kind,list)=>{
  let html='';
  const fn=new Function('window','document','showModal','openMemberDetail','setRenewStatus',
    src.slice(i,j)+'\nreturn openTodoList;')(
    {_todoLists:{[kind]:list}}, {querySelector:()=>null}, h=>{html=h;}, ()=>{}, ()=>{});
  fn(kind);
  return html;
};
const grid=run('sign',{title:'今日收款提醒',grid:true,empty:'今日無人待收款',note:'n',items:ITEMS});
const plain=run('nopunch',{title:'今日未打卡名單',empty:'今日打卡皆正常',note:'',items:[{id:'M1',name:'甲',sub:'x'}]});

console.log('名稱');
ok('★ 首頁待辦列叫「今日收款提醒」', /'今日收款提醒',_l,_signByTime\.length,'ok'/.test(src));
ok('★ 視窗標題也是「今日收款提醒」', /sign:\{title:'今日收款提醒'/.test(src));
ok('　　畫面上不再出現「付款名單」／「待簽約名單」（註解裡的沿革不算）',
   !/'今日付款名單'/.test(src) && !/title:'今日待簽約名單'/.test(src)
   && !/OPS_TODO_IC\.money,'今日待簽約名單'/.test(src));

console.log('\n版面：時間在左、同一時間四個一列');
ok('★ 收款提醒走格狀容器', /class="tdl-grid"/.test(grid) && !/class="tdl-list"/.test(grid));
ok('★ CSS 一列四格（超過自動換到第二列）',
   /\.tdl-tg-cells\{[\s\S]{0,140}grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(src));
ok('★ 時間標在左邊獨立一欄、右對齊、等寬數字',
   /\.tdl-tg-t\{flex:0 0 52px;[\s\S]{0,160}font-family:var\(--num\),inherit;[\s\S]{0,60}text-align:right;/.test(src));
eq('★ 四個人 → 四個按鈕格', (grid.match(/<div class="tdl-cell[ "]/g)||[]).length, 4);
ok('　　中等寬度退成三格、手機退成兩格',
   /@media \(max-width:820px\)\{ \.tdl-tg-cells\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);\} \}/.test(src)
   && /@media \(max-width:560px\)\{ \.tdl-tg-cells\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}/.test(src));
ok('　　一列四個要放得下 → 視窗加寬（modal-wide）',
   /if\(useGrid\)\{ const m=document\.querySelector\('#modal-bg \.modal'\); if\(m\) m\.classList\.add\('modal-wide'\); \}/.test(src));
ok('　　名字過長會截斷，不撐破格子', /\.tdl-cell-nm\{[\s\S]{0,140}text-overflow:ellipsis;/.test(src)
   && /\.tdl-cell-sub\{[\s\S]{0,140}text-overflow:ellipsis;/.test(src));
ok('　　整疊可捲動', /\.tdl-grid\{[\s\S]{0,160}overflow-y:auto;/.test(src));
ok('★ 其他名單不受影響，維持清單', /class="tdl-list"/.test(plain) && !/class="tdl-grid"/.test(plain));

console.log('\n按鈕內容');
ok('★ 時間已在左欄 → 格子裡不再重複標同一個時間',
   /<span class="tdl-cell-nm">陳蘭馨<\/span><\/span>/.test(grid));
ok('★ 課別與原因在下一行', /<span class="tdl-cell-sub">教練課・續課<\/span>/.test(grid));
ok('★ 待付費那格用紅框＋紅左帶（2026-07-30：底色改白，不再整格反紅）',
   /class="tdl-cell tdl-cc-[a-z]+ tdl-cell-pay tdl-static"/.test(grid)
   && /\.tdl-cell\.tdl-cell-pay\{--cc:var\(--danger,#b5372e\);border-color:var\(--danger,#b5372e\);\}/.test(src));
ok('　　沒綁會員的那格不可點（沒有 role=button）',
   /<div class="tdl-cell tdl-cc-[a-z]+ tdl-cell-pay tdl-static">/.test(grid));
ok('★ 已續約標綠勾', /tdl-rs-ok/.test(grid));
ok('　　考慮中標金色', /tdl-rs-gold/.test(grid));
ok('★ 考慮中／不續約兩顆鈕放在格子裡', /class="tdl-cell-acts"/.test(grid)
   && /setRenewStatus\('T1','considering'\)/.test(grid) && /setRenewStatus\('T1','declined'\)/.test(grid));
ok('　　已續約者不再出現手動鈕（談完了不用再催）',
   !(grid.split('王小明')[1]||'').split('tdl-cell')[0].includes('tdl-cell-acts'));
ok('　　點那兩顆鈕不會連帶開會員資料', /class="tdl-cell-acts" onclick="event\.stopPropagation\(\);"/.test(grid));
ok('　　沒有殘留的舊 tdl-acts 外殼', !/class="tdl-acts"/.test(grid));

console.log('\nHTML 合法性與鍵盤操作');
ok('★ 外層不是 <button>（button 內嵌 button 是無效 HTML，瀏覽器會把內層拆出去）',
   !/<button class="tdl-cell/.test(grid) && /button 內嵌 button 是無效 HTML/.test(src));
ok('★ 改用 div + role=button + tabindex，鍵盤照樣能開',
   /role="button" tabindex="0" onclick="openMemberDetail/.test(grid)
   && /event\.key==='Enter'\|\|event\.key===' '/.test(grid));
ok('　　有可見的焦點框', /\.tdl-cell:focus-visible\{outline:2px solid var\(--green\)/.test(src));
{
  // 格子裡唯一的 <button> 應該只有那兩顆手動標記鈕（4 人中 2 人有 → 4 顆）
  const btns=(grid.match(/<button /g)||[]).length;
  eq('　　整份 HTML 裡的 <button> 只有手動標記鈕（陳蘭馨 2 顆＋李中間 2 顆＋關閉 1 顆）', btns, 5);
}


console.log('\n首頁摘要：一個名字一列、依時間排序');
ok('★ 改成逐列，不再擠成一行「甲、乙、丙」',
   /<span class="mc-td-lines">/.test(src) && /<span class="mc-td-line"><b>\$\{x\.time\|\|'—'\}<\/b>\$\{x\.name\}/.test(src)
   && !/_signNames\.slice\(0,5\)\.join\('、'\)/.test(src));
ok('★ 依上課時間排序（沒有時間的排最後）',
   /String\(a\.time\|\|'99:99'\)\.localeCompare\(String\(b\.time\|\|'99:99'\)\) \|\| String\(a\.name\)\.localeCompare\(String\(b\.name\)\)/.test(src));
ok('　　時間欄位對齊、用等寬數字', /\.mc-td-line b\{font-family:var\(--num\),inherit;[\s\S]{0,120}min-width:34px;/.test(src));
ok('　　待收款的另外標「待收」（2026-07-30 改實心紅底白字，對比不足）',
   /x\.pay\?'<i class="mc-td-pay">待收<\/i>':''/.test(src)
   && /\.mc-td-line \.mc-td-pay\{[\s\S]{0,160}background:var\(--danger,#b5372e\);color:#fff;/.test(src));
ok('　　最多列 6 位，其餘明講還有幾位（不做無聲截斷）',
   /_signByTime\.slice\(0,6\)/.test(src) && /還有 \$\{_signByTime\.length-6\} 位…/.test(src));
ok('　　深色儀表板版面的字色另外定義', /\.mc-dash \.mc-todo-card \.mc-td-line\{/.test(src));
ok('　　名字太長會截斷，不撐破卡片', /\.mc-td-line\{[\s\S]{0,160}text-overflow:ellipsis;/.test(src));
{
  // 排序實跑
  const L=[{name:'丙',time:'21:00'},{name:'甲',time:'10:00'},{name:'乙',time:'19:00'},{name:'丁',time:''}];
  const sorted=L.slice().sort((a,b)=>
    String(a.time||'99:99').localeCompare(String(b.time||'99:99'))||String(a.name).localeCompare(String(b.name)));
  eq('★ 10:00 → 19:00 → 21:00 → 無時間', sorted.map(x=>x.name), ['甲','乙','丙','丁']);
}


console.log('\n依時間分組');
{
  const T=(n,t,extra)=>Object.assign({id:n,name:n,sub:'x',tkid:'',rs:'',time:t},extra||{});
  const g=run('sign',{title:'今日收款提醒',grid:true,empty:'x',note:'n',items:[
    T('戊','10:00'),T('甲','10:00'),T('乙','10:00'),T('丙','10:00'),T('丁','10:00'),
    T('蘭馨','10:00、11:00'), T('晚客','20:30',{pay:true}), T('沒時間',''),
  ]});
  const groups=[...g.matchAll(/<span class="tdl-tg-t">([^<]*)<\/span>/g)].map(m=>m[1]);
  eq('★ 分組後依時間排序，沒有時間的排最後', groups, ['10:00','20:30','未定']);
  const per=[...g.matchAll(/<div class="tdl-tg-cells">([\s\S]*?)<\/div>\s*<\/div>/g)]
    .map(m=>(m[1].match(/<div class="tdl-cell[ "]/g)||[]).length);
  eq('★ 同一時間 6 個人放在同一組（四個一列 → 自動換第二列）', per, [6,1,1]);
  ok('★ 同一人今天有兩堂 → 以第一堂分組，第二堂在格子裡補標',
     /蘭馨<\/span><span class="tdl-tm">11:00<\/span>/.test(g));
  ok('　　組內依姓名排序（待處理仍在前）', g.indexOf('>乙<')<g.indexOf('>戊<'));
  ok('　　沒有時間的那組標「未定」', /<span class="tdl-tg-t">未定<\/span>/.test(g));
  ok('　　待收款那格照樣反紅', /tdl-cell-pay/.test(g));
}


console.log('\n卡片改白底＋依課別上色（2026-07-30 使用者指示）');
ok('★ 卡片底色改白（原本米色底不好讀）',
   /\.tdl-cell\{[\s\S]{0,260}background:#fff;/.test(src));
ok('★ 左緣依課別上色：教練課綠／團體課橘／體驗紫',
   /\.tdl-cc-pt\{--cc:var\(--course-pt-accent,#1f6f54\);\}/.test(src)
   && /\.tdl-cc-group\{--cc:var\(--course-group-accent,#9a5a1e\);\}/.test(src)
   && /\.tdl-cc-trial\{--cc:var\(--course-trial-accent,#6e3a86\);\}/.test(src));
ok('★ 名單建立時就帶課別（團課 group／教練課 pt／體驗 trial）',
   /e\.cc = isGrp\?'group':'pt';/.test(src)
   && /cc:\(b\.category==='小班肌力'\?'group':\(b\.category==='體驗'\?'trial':'pt'\)\)/.test(src));
ok('　　hover 改用陰影（白底不再換底色）', /\.tdl-cell:hover\{box-shadow:0 4px 14px rgba\(20,18,14,\.10\);\}/.test(src));

console.log('\n本月待升級／待降級／待續約也改課卡模式');
ok('★ 三份名單改用同一套 .tdl-grid / .tdl-cell 版型',
   /const cell=m=>\{[\s\S]{0,400}<div class="tdl-cell tdl-cc-\$\{_cc\(m\)\}" role="button" tabindex="0"/.test(src));
ok('★ 待續約依課別上色（教練課／團體課）',
   /const _cc=m=>\{ const c=String\(m\.__course\|\|''\); return c\.indexOf\('團'\)>=0\?'group':'pt'; \};/.test(src));
ok('　　標題帶人數、視窗加寬', /\$\{list\.length\} 位/.test(src)
   && /\{ const mm=document\.querySelector\('#modal-bg \.modal'\); if\(mm\) mm\.classList\.add\('modal-wide'\); \}/.test(src));
ok('　　鍵盤也能開（Enter／Space）', /if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);closeModal\(\);openPersonProfile\('member'/.test(src));
ok('　　待續約顯示課別與最後一堂日期', /最後一堂 \$\{m\.__last\.slice\(5\)\.replace\('-','\/'\)\}/.test(src));

console.log('\n權限開關排成一列');
// 2026-07-30 四修：改靠左，讓表頭「權限開關」對得上第一顆開關「管理員」
ok('★ 員工列的開關改 flex 一列（原本 3 欄 × 2 列的九宮格）',
   /\.st-l-sw \.st-sw\{display:flex;flex-wrap:nowrap;gap:4px;width:auto;margin:0;justify-content:flex-start;\}/.test(src));
ok('　　一列版把小圓點移到文字左邊，卡片不會被撐高',
   /\.st-l-sw \.st-swb\{flex-direction:row;padding:5px 8px;/.test(src));
ok('　　手機仍可換行', /\.st-l-sw \.st-sw\{justify-content:flex-start;flex-wrap:wrap;\}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
