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
ok('★ 放在 KPI 左邊（插在 .mc-kpistrip 的最前面）',
   /let kpiStrip=`<div class="mc-kpistrip"><!--ALERTS-->/.test(src)
   && /kpiStrip=kpiStrip\.replace\('<!--ALERTS-->', alertCards\);/.test(src));
ok('　　數字要等名單算完才知道，所以先留插點、算完再塞回來',
   /這裡先留插點，算完再塞回來/.test(src));
ok('★ 外型與右邊三顆快捷鈕同一套直式卡片（同高 96、同圓角）',
   /\.mc-kpistrip \.mc-alert2 \.mc-a2\{flex:0 1 auto;width:clamp\(84px,6\.2vw,108px\);min-width:66px;min-height:96px;/.test(src)
   && /\.mc-kpistrip \.mc-quick3 \.mc-q3\{flex:0 1 auto;width:clamp\(76px,6\.4vw,96px\);min-width:62px;min-height:96px;/.test(src));
ok('★ 底色維持品牌紅（--danger #7F0303 那支深紅）',
   /background:linear-gradient\(160deg,#7F0303 0%,#5E0303 100%\);/.test(src));
ok('★★ ⚠ 選擇器要壓過 .card/.mc-card（使用者回報「紅色不見了」：兩個 class 同分，誰後面誰贏）',
   /\.mc-kpistrip \.mc-alert2 \.mc-a2\{/.test(src)
   && !/^\.mc-alert2 \.mc-a2\{/m.test(src)
   && /就不必跟載入順序賭/.test(src));
ok('★ 數字用品牌金放大',
   /\.mc-kpistrip \.mc-alert2 \.mc-a2-n\{font-family:var\(--font-en\),var\(--num\);font-size:clamp\(24px,2\.2vw,32px\);/.test(src)
   && /font-weight:800;line-height:1;color:#D9A441;\}/.test(src));
ok('★★ KPI 不能被壓到疊在一起（使用者回報「用 mac 看 kpi 被壓縮了」）——'
   +'數字群守住內容寬度，要讓位的是兩側的固定寬卡片',
   /\.mc-kpistrip \.kpi-it\{min-width:max-content;\}/.test(src)
   && /min-width:0 會讓格子縮到比文字還窄，nowrap 的數字就溢出來、三組疊在一起看不清楚/.test(src));
ok('　　1400 以下先收兩側卡片、1150 再收一次',
   /@media\(max-width:1400px\)\{[\s\S]{0,300}?\.mc-kpistrip \.mc-alert2 \.mc-a2\{width:92px;padding:12px 5px;\}/.test(src)
   && /@media\(max-width:1150px\)\{[\s\S]{0,700}?\.mc-kpistrip \.mc-alert2 \.mc-a2\{width:82px;min-height:80px;/.test(src));
ok('★ 兩張卡在最左邊（0822 三修：整條改成靠左排、KPI 數字群用 margin-left:auto 推到最右）',
   /\.mc-kpistrip \.mc-alert2\{display:flex;gap:10px;flex:0 1 auto;min-width:0;\}/.test(src)
   && /\.mc-kpinums\{[\s\S]{0,120}?margin-left:auto;/.test(src));

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
