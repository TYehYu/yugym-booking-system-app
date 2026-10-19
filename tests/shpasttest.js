/* 班表：過去的日期淡化（2026-10-19 使用者：「過去的日期可以暗化　除了請假的格子」）

   班表往回看主要是在查「誰請了假」，已經過去的班本身不需要再被看見。
   所以淡化的是班，不是假。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
