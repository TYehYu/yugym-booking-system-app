/* 2026-08-03 教練回報：「手機端的行事曆，滑在課卡上面的時候會滑不動，
   我記得已經關掉互動功能了吧？」

   對，拖曳在手機早就關了（initCalDrag 對 isMobileLayout 直接 return），
   但 CSS 的 .cal-ev:not(.readonly){touch-action:none;} 還全域生效 ——
   教練自己的課卡是 editable（非 readonly），手指按在卡上瀏覽器不啟動原生捲動，
   課卡越多越滑不動。改成只有拖曳真的有啟動的行事曆（initCalDrag 掛 .cal-drag-on）
   才關掉卡片上的原生捲動；已在瀏覽器驗過 computed style：
   無 class 時三種卡皆 auto，掛 class 後僅可拖卡為 none。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① touch-action 綁在拖曳啟動上，不再全域');
ok('★ 舊的全域規則已移除（正是手機滑不動的原因）',
   !/\n\.cal-ev:not\(\.readonly\)\{touch-action:none;\}/.test(src));
ok('★ 新規則限定 .cal-drag-on 底下，且排除唯讀與看得到不能拖的卡',
   /\.cal-drag-on \.cal-ev:not\(\.readonly\):not\(\.cal-ev-view\)\{touch-action:none;\}/.test(src));
ok('★ initCalDrag 啟動時才掛 class（手機在這之前就 return 了）',
   /if\(isMobileLayout\(\)\)return; \/\/ 真手機（窄螢幕）改點選；平板\/iPad\/桌機可拖曳\n\s*const wrap=document\.querySelector\('\.cal-body'\);\n\s*if\(!wrap\)return;\n\s*wrap\.classList\.add\('cal-drag-on'\);/.test(src));

console.log('\n② 為什麼與範圍');
ok('★ 回報的情境寫在 CSS 旁（手機沒有拖曳卻被擋捲動）',
   /手機根本沒有拖曳\n\s*（initCalDrag 對 isMobileLayout 直接 return），這條卻還全域擋掉捲動。/.test(src));
ok('　　平板/iPad 的觸控拖曳仍保有 touch-action:none（掛了 class 才生效，拖曳不會被原生捲動搶走）',
   /wrap\.classList\.add\('cal-drag-on'\); \/\/ 觸控拖曳需要卡片關掉原生捲動/.test(src));
ok('　　其他既有的 touch-action 規則不受影響（簽名板、打卡 FAB、今日課卡）',
   /\.ct-sign\{[^}]*touch-action:none;/.test(src)
   && /\.punch-fab\{[^}]*touch-action:none;/.test(src)
   && /\.tlx-ev\{[^}]*touch-action:pan-y;/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
