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

/* ══ 待補發票的提醒改放會員資料列（2026-09-17 下午，推翻同日上午的做法）══════════
   使用者：「直接移除待補發票資料按鈕，在會員資料列顯示提醒就好」
   ⚠ 同一天上午做的是「首頁卡＋名單視窗＋逐筆不再提醒」，下午整組換掉：
     首頁兩個入口（那張卡、待辦列那一行）都收起來，提醒改成
     ①會員清單的列尾標記 ②會員資料頁的發票欄轉提醒色。
   ⚠ 「不再提醒」跟著退場（使用者：「不需要了，直接拿掉」）——
     它本來就是為了關掉首頁那張天天出現的卡；改成「開到那位才提醒」之後，
     提醒不會一直杵在眼前，收起來這件事就失去意義。
   ⚠ members.invoice_skip_date 欄位**留著不刪**：刪欄位是不可逆的破壞性操作，
     而它閒置著不影響任何判定。但判定裡那段過濾一定要拿掉 ——
     留著就是「沒有任何地方設定得了、卻仍在生效」的死邏輯。 */
console.log('\n待補發票：首頁入口移除、改在會員資料列提醒');
ok('★★★ 首頁那張卡已移除（連同它的 openTodoList 入口）',
   !/<span class="mc-a2-t">待補發票資料<\/span>/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));
ok('★★★ 待辦列那一行也移除（同一份名單，留一個等於還是天天出現在首頁）',
   !/_todoItems\.push\(_todoRow\(OPS_TODO_IC\.money,'待補發票資料'/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));
ok('★★★ 「不再提醒」整組退場（按鈕與 invPrefSkip 都不留死碼）',
   !/invPrefSkip/.test(src.replace(/\/\*[\s\S]*?\*\//g,''))
   && !/kind==='invpref'/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));
ok('★★★ 判定裡的 skip 過濾也拿掉（沒地方設定卻還在生效＝死邏輯）',
   !/invoice_skip_date\|\|''\)\.slice\(0,10\)/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));
ok('★★ 但名單本身保留（清單標記共用同一套判定，日後要調回入口只是一行）',
   /invpref:\{title:'待補發票資料'/.test(src));

console.log('\n提醒的兩個新位置');
ok('★★★ 會員資料頁：兩格都空才轉提醒色（缺其中一格仍收得到發票，標警示等於喊狼來了）',
   /const _invMiss = isM && !\(\(r\.email\|\|''\)\.trim\(\)\|\|\(r\.invoice_carrier\|\|''\)\.trim\(\)\);/.test(src)
   && /<div class="pp-meta-i\$\{_invMiss\?' pp-warn':''\}/.test(src));
ok('★★ 提醒用金色不是紅色（收費時順手問的待辦，不是該擋下的錯誤）',
   /\.pp-meta-i\.pp-warn \.pp-meta-l,\.pp-meta-i\.pp-warn \.pp-meta-v\{color:var\(--gold-d,#b48a56\);\}/.test(src));
ok('★★ 提醒列下面寫出後果（「發票開出去收不到」），不是只有變色',
   /pp-warn-note">發票開出去收不到，收費時順便問一下</.test(src));
ok('★★★ 會員清單列尾標記：判定與首頁那份名單同一條（近 90 天有來＋兩格都空）',
   /const _invMiss=m=>!!m && !\(\(m\.email\|\|''\)\.trim\(\)\|\|\(m\.invoice_carrier\|\|''\)\.trim\(\)\)\s*\n\s*&& String\(lastClassMap\[m\.id\]\|\|''\)>=_invCut;/.test(src));
ok('★★ 用現成的 lastClassMap，不為了標記多抓一次 bookings（會員清單本來就重）',
   /const _invCut=ymd\(new Date\(TODAY\.getTime\(\)-90\*86400000\)\);/.test(src)
   && !/_invMiss[\s\S]{0,200}?dbGetAll\('bookings'\)/.test(src));
ok('★★ 沿用清單列既有的 .tk-chip 語彙（同一頁的「無有效票券」就是這個），只換配色',
   /<span class="tk-chip" style="background:#f7efe0;color:#8a5e28;[^"]*" title="Email 與載具都沒有，發票開出去收不到">待補發票<\/span>/.test(src));
{
  /* 實跑：標記的判定只在「近期來過 ＋ 兩格都空」時成立 */
  const cut='2026-06-19';
  const miss=(m,last)=>!!m && !((m.email||'').trim()||(m.invoice_carrier||'').trim())
    && String(last||'')>=cut;
  const eq=(n,a,e)=>ok(n+'　→ '+JSON.stringify(a), JSON.stringify(a)===JSON.stringify(e));
  eq('★★★ 近期來過且兩格都空 → 標', miss({id:'A'},'2026-09-16'), true);
  eq('★★★ 有 Email → 不標（收得到就不是待補）', miss({id:'A',email:'a@b.c'},'2026-09-16'), false);
  eq('★★★ 有載具 → 不標', miss({id:'A',invoice_carrier:'/ABC1234'},'2026-09-16'), false);
  eq('★★ 90 天沒來 → 不標（近期不會進門，標了也問不到）', miss({id:'A'},'2026-05-01'), false);
  eq('★★ 從來沒上過課 → 不標', miss({id:'A'},''), false);
  eq('★★ 空字串與空白也算沒填', miss({id:'A',email:'  ',invoice_carrier:' '},'2026-09-16'), true);
}
{
  const p=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260917_members_invoice_skip.sql';
  ok('★ migration 留檔', fs.existsSync(p));
  const m=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
  ok('★★ 欄位是 date（比較對象是 bookings.date，混時間戳會有邊界問題）',
     /add column if not exists invoice_skip_date date;/.test(m));
  ok('★★★ 原地寫明「不要加進 fn_members_guard 白名單」的理由',
     /不要\*\*把這一欄加進 fn_members_guard 的白名單/.test(m)
     && /這個旗標是\*\*櫃檯的判斷\*\*/.test(m));
}
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
