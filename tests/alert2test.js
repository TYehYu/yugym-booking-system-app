/* 首頁 KPI 左邊的兩張紅色提醒卡（2026-08-22 使用者指示，附截圖）：
   「今日收款提醒跟本月即將降級名單分成兩張，都改成跟新增會員／銷售／查看合約一樣的
     直式卡片但卡片一樣維持原本的品牌紅，放到 kpi 的左邊；卡片上第一列標題、
     第二列只放數字用品牌金放大顯示；名單點進去後用視窗條列顯示」 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('兩張卡');
ok('★ 分成兩張，各自一個標題一個數字',
   /<button class="card mc-card mc-a2" onclick="openTodoList\('sign'\)">\s*\n\s*<span class="mc-a2-t">今日收款提醒<\/span><b class="mc-a2-n">\$\{_signByTime\.length\}<\/b><\/button>/.test(src)
   && /<button class="card mc-card mc-a2" onclick="openTodoList\('demote'\)">\s*\n\s*<span class="mc-a2-t">即將降級名單<\/span><b class="mc-a2-n">\$\{_demoteNames\.length\}<\/b><\/button>/.test(src));
/* 2026-09-02 使用者指示：「中間欄上面 今日收款提醒跟降級名單 改到左邊欄
   新增會員跟銷售下面」—— 從 KPI 條搬到左欄，接在三顆快捷鈕後面。 */
ok('★★ 放在左欄、三顆快捷鈕下面',
   /let alertBox=`<div class="mc-alertleft"><!--ALERTS--><\/div>`;/.test(src)
   && /alertBox=alertBox\.replace\('<!--ALERTS-->', alertCards\);/.test(src)
   && /<div class="mc-quick-left">\$\{quickCard\}<\/div>\s*\n\s*\$\{alertBox\}/.test(src));
ok('★★ KPI 條裡不再有它們', !/mc-kpistrip"><!--ALERTS-->/.test(src));
ok('　　數字要等名單算完才知道，所以先留插點、算完再塞回來',
   /這裡先留插點，算完再塞回來/.test(src));
ok('★ 外型仍是那套直式卡片（底色、圓角、內距）',
   /\.mc-alertleft \.mc-alert2 \.mc-a2\{flex:0 1 auto;width:clamp\(84px,6\.2vw,108px\);min-width:66px;min-height:96px;/.test(src));
/* 左欄只有 300px：clamp 的 108px 會在右邊留一塊空，改成兩張各佔一半。 */
ok('★★ 左欄版兩張各佔一半、卡高收到 84',
   /\.mc-alertleft \.mc-alert2 \.mc-a2\{flex:1 1 0;width:auto;min-height:84px;padding:12px 6px;\}/.test(src));
ok('★ 底色維持品牌紅（--danger #7F0303 那支深紅）',
   /background:linear-gradient\(160deg,#7F0303 0%,#5E0303 100%\);/.test(src));
ok('★★ ⚠ 選擇器要壓過 .card/.mc-card（使用者回報「紅色不見了」：兩個 class 同分，誰後面誰贏）',
   /\.mc-alertleft \.mc-alert2 \.mc-a2\{/.test(src)
   && !/^\.mc-alert2 \.mc-a2\{/m.test(src)
   && /就不必跟載入順序賭/.test(src));
ok('★ 數字用品牌金放大',
   /\.mc-alertleft \.mc-alert2 \.mc-a2-n\{font-family:var\(--font-en\),var\(--num\);font-size:clamp\(24px,2\.2vw,32px\);/.test(src)
   && /font-weight:800;line-height:1;color:#D9A441;\}/.test(src));
/* 「KPI 被壓縮」那個問題（2026-08-22）在 0902 之後不會再發生 ——
   三個 KPI、兩張紅卡、三顆快捷鈕不再擠同一條，各自在自己的欄位裡，欄寬是固定的。
   那一整套收斂規則（.mc-kpistrip 與兩個斷點）連同 KPI 條一起移除。 */
ok('★★ KPI 條那一整套已無人使用，連樣式一起移除（不留死 CSS）',
   !/\.mc-kpistrip\{/.test(src) && !/\.mc-kpinums\{/.test(src) && !/^\.kpi-it\{/m.test(src)
   && /全檔已經沒有任何 HTML 掛得上那些 class/.test(src));
/* 窄視窗的收斂規則還掛在 .mc-kpistrip 上 —— 紅卡搬走後那幾條對它們不再生效，
   但左欄是固定 300px，本來就不需要跟著視窗縮。留著是給 KPI 數字與（未來若有的）
   其他成員用的，不是遺漏。 */
ok('　　左欄版不吃視窗寬度的收斂（欄寬固定 300px）',
   !/@media[\s\S]{0,900}?\.mc-alertleft/.test(src));
ok('★ KPI 改成右欄三列（名稱靠左、數字靠右）',
   /\.mc-kpirows \.kr\{display:flex;align-items:center;justify-content:space-between;/.test(src));

console.log('\n點進去＝既有的視窗條列');
ok('★★ 沿用 openTodoList（那支本來就是視窗條列，名單資料同一份）',
   /openTodoList\('sign'\)/.test(src) && /openTodoList\('demote'\)/.test(src)
   && /function openTodoList\(kind\)\{\s*\n\s*const L=\(window\._todoLists\|\|\{\}\)\[kind\];/.test(src)
   && /那支本來就是「視窗條列」/.test(src));
ok('★ 原本左欄那張合併紅卡退場（同一件事不要講兩次）',
   !/const payRemindCard=/.test(src)
   && !/<div class="mc-payremind">/.test(src)
   && /再留一份等於同一件事講兩次/.test(src));
ok('　　名單本身仍在待辦列（_rowSign／_rowDemote 照樣 push）',
   /_todoItems\.push\(_rowSign\);/.test(src) && /_todoItems\.push\(_rowDemote\);/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
