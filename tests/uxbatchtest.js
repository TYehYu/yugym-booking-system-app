/* 2026-07-30 使用者指示三件：
   ① 會員的搜尋框與下拉合併成一個欄位（銷售等六處都有這個設計）
   ② 課程銷售的商品卡改成像行事曆課卡的直式卡，主資訊放大
   ③ 首頁右邊「今日未打卡名單」併進左邊「今日值班」：顯示完整名單，未打卡＝空心
      （收款提醒與降級名單維持獨立，那兩份之後可能很長） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* ── ① 會員選擇器合併 ─────────────────────────────── */
console.log('會員搜尋框＋下拉合併成一個');
ok('★ 六處「輸入框＋下拉」都會被升級（統一掃 .mem-pick-row）',
   /function mpkScan\(\)\{ try\{ document\.querySelectorAll\('\.mem-pick-row'\)\.forEach\(mpkUpgrade\); \}catch\(_\)\{\} \}/.test(src));
{
  const n=(src.match(/<div class="mem-pick-row">/g)||[]).length
        + (src.match(/<div class="mem-pick-row"><input id="fam-name"/g)||[]).length;
  ok('　　畫面上確實有六處以上（含家庭成員那個不含 select，會自動略過）', n>=6, n);
}
ok('★ 保留原本的 <select> 當資料來源，只是隱藏 → 既有 .value 與 onchange 不用改',
   /保留原本的 <select>（隱藏但仍在 DOM）/.test(src)
   && /\.mem-pick-row\.mpk-on select\{position:absolute;width:1px;height:1px;opacity:0;/.test(src));
ok('★ 只升級「輸入框＋下拉」的組合，缺一就跳過',
   /if\(!sel\|\|!inp\) return;\s*\/\/ 只升級「輸入框＋下拉」這種組合/.test(src));
ok('★ 打字沿用各處原本的篩選函式（inline oninput 先跑，這裡只重畫清單）',
   /inp\.addEventListener\('input',\(\)=>\{ mpkOpen\(row\); \}\);/.test(src)
   && /原本的 oninput 已先跑完篩選（inline handler 先註冊先執行）/.test(src));
ok('★ 點選項目會設回 select 並發 change（沿用既有 onchange）',
   /sel\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\);/.test(src));
ok('　　用 mousedown 不用 click，才不會先被 blur 關掉',
   /menu\.addEventListener\('mousedown'/.test(src) && /早於 blur，才不會先被關掉/.test(src));
ok('　　鍵盤可用：上下選、Enter 確定、Esc 關閉',
   /e\.key==='ArrowDown'\|\|e\.key==='ArrowUp'/.test(src) && /if\(e\.key==='Enter'\)\{/.test(src)
   && /if\(e\.key==='Escape'\)\{ mpkClose\(row\); return; \}/.test(src));
ok('　　沒選人時欄位留空，讓 placeholder 露出來',
   /if\(!sel \|\| !sel\.value\) return '';/.test(src));
ok('　　清單空的時候講「查無符合的會員」', /查無符合的會員/.test(src));
ok('★ 視窗與換頁後都會自動升級', /if\(typeof mpkScan==='function'\) mpkScan\(\);/.test(src)
   && (src.match(/if\(typeof mpkScan==='function'\) mpkScan\(\);/g)||[]).length===2);
ok('　　重複掃描不會重覆升級', /if\(!row \|\| row\.classList\.contains\('mpk-on'\)\) return;/.test(src));

/* ── ② 銷售直式卡 ─────────────────────────────────── */
console.log('\n課程銷售卡改直式大卡');
ok('★ 上緣課程色帶（跟行事曆課卡同語彙）',
   /<span class="sl-card-band"><\/span>/.test(src)
   && /\.sl-card-band\{display:block;height:8px;flex:0 0 8px;background:var\(--pc,#1f6f54\);\}/.test(src));
ok('★ 名稱放大成主資訊（19px 粗體）', /\.sl-card-name\{font-size:19px;font-weight:800;/.test(src));
ok('★ 直式：色帶在上、內容在下', /\.sl-card\{[\s\S]{0,120}flex-direction:column;/.test(src));
ok('　　說明縮小放在名稱下面', /\.sl-card-sub\{font-size:12px;color:var\(--t2\);/.test(src));
ok('★ 課程銷售與其他收費都換成新的卡片容器',
   (src.match(/<div class="sl-cards">/g)||[]).length===2 && !/openSalesModal[\s\S]{0,1200}<div class="bk-cards">/.test(src));
ok('　　視窗加寬，直式卡才排得開', /直式卡要寬一點才排得開/.test(src));
ok('　　手機退成兩欄', /@media\(max-width:560px\)\{ \.sl-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}/.test(src));
ok('　　hover 有回饋、鍵盤有焦點框', /\.sl-card:hover\{border-color:var\(--pc/.test(src)
   && /\.sl-card:focus-visible\{outline:2px solid var\(--pc/.test(src));
ok('　　沒有動到別處在用的 gt-card2（票券發放still用它）', /<div class="gt-c2-name">\$\{p\.name\}<\/div>/.test(src));

/* ── ③ 未打卡併進今日值班 ─────────────────────────── */
console.log('\n今日未打卡併進今日值班');
ok('★ 今日值班改列完整名單：有打卡的 ＋ 今天有排班但還沒打卡的',
   /\.filter\(x=>\(x\.att&&x\.att\.clock_in\) \|\| x\.sh\)/.test(src)
   && /顯示完整名單 —— 有打卡的 ＋ 今天有排班但還沒打卡的（空心圈）/.test(src));
ok('★ 未打卡畫成空心未注水的圈', /if\(!att \|\| !att\.clock_in\)\{/.test(src)
   && /class="duty-ring dr-cup dr-empty/.test(src)
   && /\.dr-empty \.dr-cup-rim\{stroke:rgba\(0,61,50,\.22\);\}/.test(src));
ok('★ 已過上班時間仍未打卡 → 紅色虛線圈＋驚嘆號',
   /const late=!!\(isToday && shift && shift\.start_time && nowMinV>=timeToMin\(shift\.start_time\)\);/.test(src)
   && /\.dr-late \.dr-cup-rim\{stroke:var\(--danger,#b5372e\);stroke-dasharray:4 3;\}/.test(src));
ok('　　排序：已打卡的照上班時間，未打卡的排後面照班表',
   /const pa=\(a\.att&&a\.att\.clock_in\)\?0:1, pb=\(b\.att&&b\.att\.clock_in\)\?0:1;/.test(src));
ok('　　離職／停用的員工不列', /\.filter\(c=>c\.status!=='inactive'&&c\.status!=='resigned'\)\s*\n\s*\.map\(c=>\(\{c, att:attMap/.test(src));
ok('　　請假的班不算（沿用 leave_type 過濾）',
   /dayShifts\.find\(s=>s\.emp_id===id&&s\.start_time&&s\.end_time&&!s\.leave_type\)/.test(src));
ok('★ 首頁不再單獨列「今日未打卡名單」那一行',
   !/_todoRow\(OPS_TODO_IC\.check,'今日未打卡名單'/.test(src));
ok('★ 收款提醒與降級名單維持獨立（使用者：那兩份之後可能很長）',
   /_todoRow\(OPS_TODO_IC\.money,'今日收款提醒'/.test(src)
   && /_todoRow\(OPS_TODO_IC\.ticket,'本月即將降級名單'/.test(src));
ok('　　_noPunchList 仍保留給狀態卡的「未打卡 N 位」用', /const _noPunchList=\[\];/.test(src)
   && /nopunch:\{title:'今日未打卡名單'/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
