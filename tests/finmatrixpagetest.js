/* 2026-08-06 使用者指示（附截圖）：「月報表改到上方導覽列，然後月報表可以全頁面顯示」

   日 × 教練矩陣本來是「經營報表」底下的第三個分頁，橫向欄位隨教練人數增加，
   卻被 content 的 1480px 上限夾住、又只有 70vh 高 —— 一眼看不到幾個教練。
   改成導覽列「管理員 → 財務 → 月報表」的獨立頁（PAGES.fin_matrix），
   容器帶 .fm-page → CSS 解除寬度上限、表格高度吃到視窗底。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 導覽列入口（2026-08-06 二修：改成頂欄自己的群組，放在「班表」左邊）');
ok('★ 頂欄多一個「月報表」群組，只掛一個頁面',
   /\{key:'g_report', icon:'📊', label:'月報表', fd:true, sub:\[\n\s*\{label:'月報表', page:'fin_matrix', fd:true\},\n\s*\]\},/.test(src));
ok('★ 排在「班表」左邊',
   src.indexOf("{key:'g_report'") < src.indexOf("{key:'g_supervisor'"));
ok('★ 已從「管理員 → 財務」底下移走（不會兩個地方都出現）',
   !/\{grp:'財務', label:'月報表', page:'fin_matrix'\}/.test(src));
/* 2026-08-06 三修（使用者指示）：「月報表可以開放權限給櫃檯帳號了，反正只能查看都不能更改」 */
ok('★ 櫃檯也看得到（群組與子項目都掛 fd:true）',
   /\{key:'g_report', icon:'📊', label:'月報表', fd:true, sub:\[\n\s*\{label:'月報表', page:'fin_matrix', fd:true\},\n\s*\]\},/.test(src));
{
  /* 實跑 visibleGroups 的過濾：櫃檯只留 fd 的群組與 fd 的子項目 */
  const NAV=[{key:'g_dashboard',fd:true,sub:[{label:'首頁',page:'dashboard',fd:true}]},
    {key:'g_admin',sub:[{label:'員工管理',page:'staff'}]},
    {key:'g_report',fd:true,sub:[{label:'月報表',page:'fin_matrix',fd:true}]},
    {key:'g_supervisor',sup:true,fd:true,sub:[{label:'排班表',page:'coach_shifts',fd:true}]}];
  const i=src.indexOf('function visibleGroups()');
  const j=src.indexOf('\n}',i)+2;
  const run=role=>new Function('SESSION','ADMIN_NAV2', src.slice(i,j)+'\nreturn visibleGroups();')(
    {role, is_manager:false}, NAV).map(g=>g.key);
  ok('★ 櫃檯的頂欄有月報表', run('front_desk').includes('g_report'), run('front_desk'));
  ok('　　櫃檯仍然看不到管理員', !run('front_desk').includes('g_admin'), run('front_desk'));
  ok('　　管理員照舊兩個都看得到',
     run('admin').includes('g_report') && run('admin').includes('g_admin'), run('admin'));
}
ok('★ 這一頁只有讀取（沒有任何寫入動作，開放查看即可）',
   /這一頁本來就只有讀取（表格＋上\/下個月），沒有任何寫入動作/.test(src));
ok('★ 上/下個月要留在原頁（寫死跳 finance 會把櫃檯丟到沒有權限的頁面）',
   /if\(CUR_PAGE==='fin_matrix'\)\{ navTo\('fin_matrix','g_report'\); return; \}/.test(src));
ok('　　單一子項目 → 不會多長一層左側次選單（點頂欄直接進頁）',
   /const realSubs=visibleSubs\.filter\(s=>s\.page \|\| s\.soon\);\n\s*if\(realSubs\.length<=1\) return '';/.test(src));
ok('　　手機「更多」也有這個群組的標籤',
   /g_admin:'管理員',g_report:'月報表',g_supervisor:'班表'/.test(src));
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
/* 2026-08-06 三修（使用者指示）：移除上方的標題「月報表」與副標 —— 導覽列已經
   標明在哪一頁，標題只是再占掉一段表格高度。 */
ok('★ 頁面沒有標題與副標',
   /C\.innerHTML=`<div class="fm-page">/.test(src)
   && !/head\('REPORT','月報表'/.test(src));
ok('　　表格高度跟著放大（少掉標題那一段）',
   /\.fm-full \.fm-wrap\{max-height:calc\(100vh - 186px\);\}/.test(src));
ok('　　沿用同一個 #fin-body（finMatrix 找得到容器）',
   /const body=document\.getElementById\('fin-body'\); if\(!body\) return;\n\s*const ym=\(window\._finMonth/.test(src));
ok('★ 全頁模式時卡片帶 fm-full（分頁裡的舊用法不受影響）',
   /body\.innerHTML=`<div class="card\$\{window\._fmFull\?' fm-full':''\}"/.test(src));

console.log('\n③ 全頁面樣式');
ok('★ 解除 content 的 1480px 上限（同行事曆的做法）',
   /\.content:has\(\.fm-page\)\{max-width:none;padding:16px 24px;\}/.test(src)
   && /\.content\{flex:1;padding:28px 40px;min-width:0;max-width:1480px;/.test(src));
ok('★ 表格高度吃到視窗底（不再固定 70vh）',
   /\.fm-full \.fm-wrap\{max-height:calc\(100vh - 186px\);\}/.test(src)
   && /\.fm-wrap\{overflow:auto;max-height:70vh;/.test(src));   // 分頁裡的舊版維持 70vh
ok('　　窄畫面另給一組',
   /@media \(max-width:900px\)\{ \.content:has\(\.fm-page\)\{padding:10px 12px;\} \.fm-full \.fm-wrap\{max-height:calc\(100vh - 166px\);\} \}/.test(src));

console.log('\n④ 左側兩欄凍結（2026-08-06 使用者指示：「左邊總堂數這一欄也要凍結」）');
/* 原本只有日期欄 sticky，總堂數會捲到日期欄底下，數字被切一半（使用者附圖）。 */
ok('★ 總堂數欄黏在日期欄右邊（位移用量出來的 --fm-l1，不寫死）',
   /\.fm-tb \.fm-t\{position:sticky;left:var\(--fm-l1,74px\);z-index:2;background:var\(--card2\);\n\s*border-right:2px solid var\(--bd\);\}/.test(src));
ok('★ 日期欄的實際寬度由 fmStickyFit 量（字體/縮放會變）',
   /const d0=tb\.querySelector\('thead \.fm-d'\);/.test(src)
   && /if\(w1>0\) tb\.style\.setProperty\('--fm-l1',w1\+'px'\);/.test(src));
ok('★ 表頭那兩格（總堂數／全店）也掛 fm-t，跟著凍結',
   /<th class="fm-h fm-t">總堂數<\/th>/.test(src)
   && /<th class="fm-sh fm-t">全店<\/th>/.test(src));
ok('　　疊層：表頭 > 月合計 > 一般列（橫捲時不會被別欄蓋住）',
   /\.fm-tb thead \.fm-t\{z-index:4;\}/.test(src)
   && /\.fm-tb \.fm-sum \.fm-t\{z-index:3;\}/.test(src));
ok('　　hover／今天／月合計的底色也跟著（凍結欄不會變成透明破格）',
   /\.fm-tb tbody tr:hover \.fm-t\{background:var\(--sage-bg\);\}/.test(src)
   && /\.fm-tb tbody tr\.fm-sum:hover \.fm-t\{background:#f7f3ea;\}/.test(src)
   && /\.fm-tb \.fm-today \.fm-t\{background:#f2f7f4;\}/.test(src));
ok('　　凍結表頭／月合計仍在（fmStickyFit 照跑）',
   /fmStickyFit\(\);\n\}/.test(src)
   && /\.fm-tb \.fm-sum td,\.fm-tb \.fm-sum th\{position:sticky;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
