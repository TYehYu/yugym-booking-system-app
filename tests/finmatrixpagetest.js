/* 2026-08-06 使用者指示（附截圖）：「月報表改到上方導覽列，然後月報表可以全頁面顯示」

   日 × 教練矩陣本來是「經營報表」底下的第三個分頁，橫向欄位隨教練人數增加，
   卻被 content 的 1480px 上限夾住、又只有 70vh 高 —— 一眼看不到幾個教練。
   改成導覽列「管理員 → 財務 → 月報表」的獨立頁（PAGES.fin_matrix），
   容器帶 .fm-page → CSS 解除寬度上限、表格高度吃到視窗底。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 導覽列入口');
ok('★ 管理員 → 財務底下多一個「月報表」',
   /\{grp:'財務', label:'月報表', page:'fin_matrix'\},/.test(src));
ok('★ 只有管理員看得到（g_admin 群組沒有 fd:true，櫃檯看不到）',
   /\{key:'g_admin', icon:'🛠️', label:'管理員', sub:\[/.test(src));
ok('★ 經營報表的分頁列不再有「月報表」',
   !/\{key:'matrix',\s*label:'月報表'\}/.test(src)
   && /\{key:'today',\s*label:'今天'\},/.test(src)
   && /\{key:'people',\s*label:'人員'\},/.test(src));
ok('　　舊路由保留（_finTab==="matrix" 仍走得通，既有呼叫點不會壞）',
   /else if\(_finTab==='matrix'\)\{ await finMatrix\(\); \}/.test(src));

console.log('\n② 獨立頁');
ok('★ PAGES.fin_matrix 存在，內容仍是同一支 finMatrix（不另複製一份）',
   /PAGES\.fin_matrix=async function\(\)\{/.test(src)
   && /try\{ await finMatrix\(\); \} finally \{ window\._fmFull=false; \}/.test(src));
ok('★ 容器帶 .fm-page（CSS 靠它解除寬度上限）',
   /<div class="fm-page"><div id="fin-body"><\/div><\/div>/.test(src));
ok('　　沿用同一個 #fin-body（finMatrix 找得到容器）',
   /const body=document\.getElementById\('fin-body'\); if\(!body\) return;\n\s*const ym=\(window\._finMonth/.test(src));
ok('★ 全頁模式時卡片帶 fm-full（分頁裡的舊用法不受影響）',
   /body\.innerHTML=`<div class="card\$\{window\._fmFull\?' fm-full':''\}"/.test(src));

console.log('\n③ 全頁面樣式');
ok('★ 解除 content 的 1480px 上限（同行事曆的做法）',
   /\.content:has\(\.fm-page\)\{max-width:none;padding:16px 24px;\}/.test(src)
   && /\.content\{flex:1;padding:28px 40px;min-width:0;max-width:1480px;/.test(src));
ok('★ 表格高度吃到視窗底（不再固定 70vh）',
   /\.fm-full \.fm-wrap\{max-height:calc\(100vh - 250px\);\}/.test(src)
   && /\.fm-wrap\{overflow:auto;max-height:70vh;/.test(src));   // 分頁裡的舊版維持 70vh
ok('　　窄畫面另給一組（手機不要被 250px 的扣抵吃光）',
   /@media \(max-width:900px\)\{ \.content:has\(\.fm-page\)\{padding:10px 12px;\} \.fm-full \.fm-wrap\{max-height:calc\(100vh - 230px\);\} \}/.test(src));
ok('　　凍結表頭／月合計仍在（fmStickyFit 照跑）',
   /fmStickyFit\(\);\n\}/.test(src)
   && /\.fm-tb \.fm-sum td,\.fm-tb \.fm-sum th\{position:sticky;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
