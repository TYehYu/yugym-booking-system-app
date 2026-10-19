/* 班表：過去的日期淡化（2026-10-19 使用者：「過去的日期可以暗化　除了請假的格子」）

   班表往回看主要是在查「誰請了假」，已經過去的班本身不需要再被看見。
   所以淡化的是班，不是假。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');let d=0;
 for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 怎麼判斷「過去」');
/* ⚠ 只比「日號」會整個錯月：看 11 月的時候每一天都還沒到，看 9 月的時候每一天都過去了。 */
ok('★★★ 用整串日期比大小，不是比日號',
   /const _todayS=ymd\(TODAY\);\s*\n\s*const _isPast=ds=>ds<_todayS;/.test(src));
ok('★★★ 理由寫在原地（看 11 月跟看 9 月都要對）',
   /看 11 月的時候每一天都還沒到，\s*\n\s*看 9 月的時候每一天都過去了，只比日號會整個錯月/.test(src));

console.log('\n② 哪些格子會淡化');
ok('★★★ 員工列：過去**而且不是請假**才淡化',
   /const _past=_isPast\(dateStr\)&&!hasLeave;/.test(src));
ok('★★★ 員工列真的把 sh-past 掛上去',
   /\$\{hasLeave\?' has-leave':''\}\$\{isWk\?' sh-cell-wk':''\}\$\{_past\?' sh-past':''\}/.test(src));
ok('★★ 支援班列也淡化（那一列沒有請假）',
   /\$\{isWk\?' sh-cell-wk':''\}\$\{_isPast\(dateStr\)\?' sh-past':''\}\$\{_canEditShifts/.test(src));
/* ⚠ 最下面那一列整列都是請假 —— 絕對不可以淡化，那正是回頭要看的東西。 */
ok('★★★ 請假列完全不碰（整列都是要看的東西）', (()=>{
  const i=src.indexOf('const inner=list.length?`<span class="sh-lvwrap">');
  const seg=src.slice(i, i+2200);
  return seg.indexOf('sh-past')<0;
})());
ok('★★ 表頭的日號也淡一點（整欄才讀得出來）',
   /\$\{_isPast\(ds\)\?' sh-past-h':''\}/.test(src));

console.log('\n③ 淡化的做法');
/* 用 opacity 不要另外調一組灰：班別章的紅／金／綠是顏色語意，調色會把語意弄丟。 */
ok('★★★ 用 opacity，不是改成另一組灰', /\.sh-table \.sh-cell\.sh-past\{opacity:\.42;\}/.test(src));
ok('★★★ 滑過去會恢復（還是要看得清楚、按得到）',
   /\.sh-table \.sh-cell\.sh-past:hover\{opacity:1;\}/.test(src));
ok('★★ 理由寫在原地（不改顏色語意）',
   /用 opacity 而不是另外調一組灰，班別章的紅／金／綠仍然是同一組色/.test(src));

console.log('\n④ 今天那一欄放大（2026-10-19 使用者：「有辦法把今天這一欄稍稍放大　方便閱讀嗎」）');
/* ⚠ table-layout:fixed —— 只給「今天」那一格寬度，其餘 30 欄自己平分剩下的，
   整張表仍然是 width:100%，不會變成要左右捲。所以不必動別欄。 */
ok('★★★ 只給今天那一格寬度', /\.sh-table \.sh-dayhead\.sh-today-h\{width:76px;font-size:13\.5px;\}/.test(src));
ok('★★★ 班別章跟著放大一號',
   /\.sh-table \.sh-cell\.sh-today-c \.sh-code\{min-width:30px;height:28px;font-size:17px;\}/.test(src));
ok('★★ 表格仍是 fixed＋100%（沒有改成要左右捲）',
   /\.sh-table\{border-collapse:separate;border-spacing:0;font-size:12px;width:100%;table-layout:fixed;\}/.test(src));
/* 請假小標已經是最小的字，再放大會把整列撐高 —— 不碰 */
ok('★★ 請假小標沒有被一起放大', !/sh-today-c \.sh-leave\{/.test(src));
ok('★★ 理由寫在原地（為什麼只放大一欄）',
   /只放大「今天」一欄：兩欄以上就不是重點，是整排字級不一致/.test(src));

console.log('\n⑤ 誤觸「本月未排班」要收得回來（2026-10-19 使用者回報）');
/* 使用者：「我剛剛誤觸下方本月未排班名字，結果就跑上去班表，沒有回頭的按鈕」。
   加回來只是把那一列畫出來（_shiftShowExtra），收回去只是不畫 —— 兩邊都不碰資料。 */
ok('★★★ 有收回的那一支', /function shiftHideIdle\(id\)\{\s*\n\s*window\._shiftShowExtra=\(window\._shiftShowExtra\|\|\[\]\)\.filter\(x=>x!==id\);/.test(src));
ok('★★★ 收回鈕只給「加回來而且還沒排班」的那幾位',
   /_canEditShifts && \(window\._shiftShowExtra\|\|\[\]\)\.includes\(e\.id\) && !_hasRealDuty\(e\.id\)/.test(src)
   && /\$\{_canUndo\s*\n?\s*\? `<button class="shn-undo"/.test(src));
/* ⚠ 已經排了班的人若給這顆鈕，收回去會讓他排好的班整列消失 —— 那才是真的嚇人。 */
ok('★★★ 理由寫在原地（已排班的人不給）',
   /收回去會讓他已經排好的班整列消失，那才是真的嚇人/.test(src));
ok('★★ 兩支都只動顯示清單，不碰資料',
   /這兩支都只動 window\._shiftShowExtra，\*\*不碰任何資料\*\*/.test(src));
ok('★★ 按鈕不會連帶觸發整格的點擊', /shn-undo" onclick="event\.stopPropagation\(\);shiftHideIdle/.test(src));
ok('★★ 用中性灰，不搶品牌色（它是撤銷不是功能）',
   /\.sh-table \.shn-undo\{[^}]*color:var\(--t3\);/.test(src));
/* ⚠ 姓名格只有 124px，第二列已經有班別小章＋僱用別＋〔週期〕——
   再塞一顆字鈕一定折行（mock 上量到的）。所以擺右上角。 */
ok('★★★ 收回鈕擺右上角，不排進第二列',
   /\.sh-table \.shn-undo\{position:absolute;top:2px;right:3px;/.test(src));
ok('★★ 理由寫在原地（量過會折行）',
   /再塞一顆字鈕一定折行（量過，不是估的）/.test(src));
/* ⚠ 第一列右邊是時數（靠右對齊）—— 不讓位的話 ✕ 會壓在上面（mock 上看到的）。 */
ok('★★★ 有 ✕ 的那幾列，第一列右邊會讓位',
   /\.sh-table \.sh-name\.shn-hasundo \.shn-row1\{padding-right:17px;\}/.test(src)
   && /class="sh-name\$\{_canUndo\?' shn-hasundo':''\}"/.test(src));
ok('★★ 判斷只算一次（class 與按鈕共用同一個 _canUndo）',
   /const _canUndo=_canEditShifts && \(window\._shiftShowExtra\|\|\[\]\)\.includes\(e\.id\) && !_hasRealDuty\(e\.id\);/.test(src));

console.log('\n⑥ 多字代號排成一行（2026-10-19 使用者看過三個版本後：「選Ｃ」）');
/* 正式庫的班別代號：早 09–15、中 12–18、晚 16–22、假晚 15–21、全 09–17、ALL 09–21。
   「假晚」「ALL」塞進一個字的章會被擠成兩行，那一整列跟著被撐高。
   ⚠ 不改成一個字「假」：請假列的「假 RA」已經用掉那個字了，
     同一張表同一個字兩個意思，比折行更糟。 */
const lenCls=new Function(grabFn('shiftCodeLenCls')+'\nreturn shiftCodeLenCls;')();
[['早',''],['晚',''],['全',''],['假晚',' sh-code-lg'],['ALL',' sh-code-xl'],['',''],[null,'']]
  .forEach(([a,e])=>ok('★★★ '+(a===null?'null':'「'+a+'」')+' → '+(e||'（不加）'), lenCls(a)===e, lenCls(a)));
ok('★★★ 兩階尺寸都有（兩字、三字以上）',
   /\.sh-code\.sh-code-lg\{min-width:38px;font-size:12\.5px;/.test(src)
   && /\.sh-code\.sh-code-xl\{min-width:38px;font-size:11px;/.test(src));
/* 章一矮就跟別人不等高，整列看起來參差 —— 只縮字不縮章高。 */
ok('★★★ 只縮字不縮章高', !/\.sh-code\.sh-code-(lg|xl)\{[^}]*height:/.test(src));
ok('★★ 三個渲染點都吃到（主表、唯讀彈窗、支援班列）',
   (src.match(/shiftCodeLenCls\(/g)||[]).length>=4);
/* 支援班列原本直接印 raw code，順手改成跟別處一樣走 shiftCodeDisp */
ok('★★ 支援班列也走 shiftCodeDisp（A→早、C→晚，不要只有它印原始代號）',
   /<b class="sh-code\$\{shiftCodeCls\(shiftCodeDisp\(code\),isWk\)\}\$\{shiftCodeLenCls\(shiftCodeDisp\(code\)\)\}">\$\{escH\(shiftCodeDisp\(code\)\)\}<\/b>/.test(src));
ok('★★ 理由寫在原地（為什麼不簡化成一個「假」字）',
   /「假」已經被請假列用掉了（最下面那列的「假 RA」）/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
