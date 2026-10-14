/* 提早打卡要從班表的開始時間起算（2026-10-08 使用者：「首頁這些值班的數字
   如果該員工是提早打卡　也要從該值班時段開始紀錄」）。

   截圖實況：MANGO 15:22、ERIC 15:23、BARRY 15:55 打卡，班別都是晚班（班表 16:00 起），
   圓環與下面那行卻從打卡時間開始算。

   ⚠ 只往後夾、不往前補：晚打卡照實際時間算，否則變成「晚到也給滿」。
   ⚠ 沒排班就沒有可夾的基準，維持打卡時間。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 把起算時間那一段真的抽出來跑 */
const i=src.indexOf('  const _rawIn=timeToMin(att.clock_in);');
const j=src.indexOf('const outMin=', i);
const calc=new Function('att','shift',
  "const timeToMin=t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);};"
  +src.slice(i,j)+'\nreturn {inMin, inLabel, early:_early};');

const SH={start_time:'16:00', end_time:'22:00'};
console.log('① 提早打卡 → 從班表起算');
ok('★★★ BARRY 15:55 打卡、班表 16:00 → 從 16:00 算',
   calc({clock_in:'15:55'},SH).inMin===960 && calc({clock_in:'15:55'},SH).inLabel==='16:00');
ok('★★★ MANGO 15:22 → 一樣夾到 16:00', calc({clock_in:'15:22'},SH).inLabel==='16:00');

console.log('\n② 不可以往前補');
ok('★★★ 晚打卡 16:10 照實際算（不補成 16:00）',
   calc({clock_in:'16:10'},SH).inMin===970 && calc({clock_in:'16:10'},SH).inLabel==='16:10');
ok('★★ 剛好準時 16:00 不算提早', calc({clock_in:'16:00'},SH).early===false);

console.log('\n③ 沒有班表就沒有基準');
ok('★★★ 沒排班 → 維持打卡時間', calc({clock_in:'15:55'},null).inLabel==='15:55');
ok('★★ 排班缺開始時間 → 維持打卡時間', calc({clock_in:'15:55'},{end_time:'22:00'}).inLabel==='15:55');

console.log('\n④ 顯示與留痕');
/* 2026-10-14 改成兩行（使用者確認「只是提早到　不是在工作」）：
   上行＝班表時段（計薪依據，仍是起算時間的來源）、下行＝實際到場（純資訊）。
   原本那一行寫「起算時間 – 值班中」，在四欄格狀版會被截成「16:00 – 值...」。 */
/* ⚠ 2026-10-14 二修（使用者：「mac 看不到完整的訊息」）——
   nowrap＋ellipsis 在四欄 grid 裡還是會被截（一格只有 85~100px）。
   改成「只在我允許的地方換行」：<wbr> 放在破折號後與到／走之間。 */
ok('★★★ 上行寫完整班表時段，而且允許在破折號後換行',
   /<div class="dr-time">\$\{shift\.start_time\}–<wbr>\$\{shift\.end_time\}<\/div>/.test(src));
ok('★★★ 不可以用 nowrap＋ellipsis（那會把字切掉，等於白寫）',
   /\.dr-time\{font-size:11px;color:var\(--t2\);font-weight:600;font-family:var\(--num\);\s*\n\s*max-width:100%;line-height:1\.45;\}/.test(src)
   && /不可以用 nowrap＋ellipsis/.test(src));
ok('★★★ 下行才是實際到場，而且用「到／走」不是「上班／下班」',
   /<div class="dr-at\$\{_late\?' dr-at-late':''\}"><i>到<\/i> \$\{att\.clock_in\}/.test(src)
   && /<i>走<\/i> \$\{att\.clock_out\}/.test(src));
ok('★★★ 計薪起算仍是 inLabel（圓環與中央時數照班表算，沒被這次顯示改動影響）',
   /const inMin=_early\?_shIn:_rawIn;/.test(src) && /const inLabel=_early\?shift\.start_time:att\.clock_in;/.test(src));
ok('★★ 沒排班就沒有班表可寫 → 退回原本寫法，不留一行空的',
   /<div class="dr-time">\$\{att\.clock_in\} –<wbr> \$\{att\.clock_out\|\|'值班中'\}<\/div>/.test(src));
ok('★★ 提早到不標記、晚於班表才上色（提早是常態）',
   /const _late=\(_shIn!=null && _rawIn>_shIn\);/.test(src)
   && /\.dr-at\.dr-at-late\{color:var\(--gold-d,#8a5e28\);font-weight:700;\}/.test(src));
ok('★★★ tooltip 仍查得到真正幾點到的（工時有爭議時要查）',
   /提早打卡 \$\{att\.clock_in\}，自班表 \$\{shift\.start_time\} 起算/.test(src));
/* 薪資那條本來就是 min(打卡時數, 排班時數)，不要為了這件事動它 */
ok('★★★ 沒有動到 dutyHoursCapped（薪資單／員工卡／首頁同一支）',
   /total \+= \(punched!=null\) \? Math\.min\(punched, sched\) : 0;/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
