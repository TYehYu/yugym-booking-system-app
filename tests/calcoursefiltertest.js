/* 行事曆的課種篩選改成單選（2026-08-22 使用者指示：
   「這邊的邏輯統一改成跟教練篩選一樣 課程點選哪一種 就只顯示哪一種」）
   —— 0728 那版是「多選開關」：預設全開、點一下關掉那一種。兩種心智模型混在同一排
   篩選列上（上面教練是單選、下面課種是開關）本來就容易誤按。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('狀態：只存「目前只看哪一種」');
ok('★ 單選狀態 window._calCourse（點同一顆＝取消，回到全部）',
   /function calSetCourse\(cls\)\{\s*\n\s*window\._calCourse = \(!cls \|\| cls==='all' \|\| window\._calCourse===cls\) \? 'all' : cls;/.test(src));
ok('★★ 舊的多選狀態 _calCourseOff 整組退場（語意相反，留著會兩邊各判一次）',
   !/window\._calCourseOff\s*=/.test(src)
   && !/window\._calCourseOff\[/.test(src)
   && /舊的 window\._calCourseOff（一組被關掉的課種）不再使用/.test(src));
ok('　　「全部」鈕也走同一支', /function calCourseAll\(\)\{ window\._calCourse='all'; navTo\(CUR_PAGE\); \}/.test(src));

console.log('\n過濾：選了就只留那一種');
ok('★ 只留選中的課種，all 不過濾',
   /if\(window\._calCourse && window\._calCourse!=='all'\s*\n\s*&& evColorClass\(b,typeMap,b\.ticket_id\?ticketMap\[b\.ticket_id\]:null\)!==window\._calCourse\) return false;/.test(src));

console.log('\n外觀：與教練那排同一套');
ok('★ 全部沒選時不灰任何一顆（只有選了才把其他的壓灰）',
   /style="\$\{\(sel!=='all'&&!on\)\?'opacity:\.42;filter:grayscale\(\.45\);':''\}"/.test(src));
ok('　　選中的那顆掛 on（與教練 chips 同一個 class）',
   /const on = sel===f\.cls;/.test(src)
   && /class="cal-chip cal-chip-course \$\{f\.cls\} \$\{on\?'on':''\}"/.test(src));
ok('　　提示文字跟著換（只看 X／再點一次看全部）',
   /title="\$\{on\?'再點一次看全部':'只看'\+f\.label\}"/.test(src));
ok('　　「全部」在沒選任何一種時亮起',
   /<button class="cal-chip \$\{sel==='all'\?'on':''\}" onclick="calSetCourse\('all'\)">全部<\/button>/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
