/* 右欄「今日營收」面板 ＋ 選取日期看不出來（2026-08-27 使用者兩則回報）

   ①「右側改成這樣，原本今日營收下方的現金、匯款就不用再顯示了」
      右欄補上「今日營收＋最後更新」標題、現金／匯款分欄（金額＋佔比）、
      「營收明細」小標；KPI 那條 kpay chip 撤掉（同一件事不講兩次）。

   ②「我按了其他天，上方日期顯示仍停留在 8/27…這樣我會搞錯，
      選擇其他天時一樣要出現『回到今天』的按鈕」
      ⚠ 前半是 Ink 層自己造成的：body.ink .twk-day{border:...} 權重壓過
        .twk-day.on{border-color:金}，「選取」這個狀態整個沒了畫面。
      ⚠ 後半是既有邏輯：「回到今天」原本只在「今天不在本週」時才給。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 摘要要不要畫，看的是「三種付款加總」');
{
  const seg=src.slice(src.indexOf('const _revPaySum='), src.indexOf('const revHead='));
  const mk=(c,b,o)=>new Function('_revCash','_revBank','_revOther','_fm',
    seg+'\nreturn {_revPaySum,_revSplitCol};')(c,b,o,n=>String(n));
  let f=mk(11050,3800,0);
  eq('★★ 加總含現金＋匯款＋其他', f._revPaySum, 14850);
  eq('　 全部是 0 → 加總 0（摘要整塊不畫）', mk(0,0,0)._revPaySum, 0);
  ok('★★ 佔比已經拿掉（使用者：首頁不需要呈現付款方式比例）',
     !/_revPct/.test(src) && !/%<\/span>/.test(f._revSplitCol('x','現金收入',100)));
  eq('　 金額 0 的那一欄不畫', f._revSplitCol('x','其他',0), '');
  ok('★ 一欄只剩「標籤＋金額」兩件事',
     /<span class="mc-rs-l">現金收入<\/span>/.test(f._revSplitCol('mc-rs-cash','現金收入',100))
     && /<b class="mc-rs-v">\$100<\/b>/.test(f._revSplitCol('mc-rs-cash','現金收入',100)));
}

console.log('\n② 面板結構');
{
  ok('★★ 標題列：今日營收 ＋ 最後更新 HH:MM',
     /<span class="mc-revhd-t">今日營收<\/span>/.test(src)
     && /<span class="mc-revhd-u">最後更新 \$\{_revUpd\}<\/span>/.test(src));
  ok('★★ 現金／匯款分欄（只有標籤與金額，沒有佔比）',
     /\$\{_revSplitCol\('mc-rs-cash','現金收入',_revCash\)\}/.test(src)
     && /\$\{_revSplitCol\('mc-rs-bank','匯款收入',_revBank\)\}/.test(src)
     && /<b class="mc-rs-v">\$\$\{_fm\(val\)\}<\/b>/.test(src));
  ok('　 金額是 0 的那一欄不畫（版面不被稀釋，沿用既有慣例）',
     /const _revSplitCol=\(cls,label,val\)=>!val\?'':/.test(src));
  /* 0827 二修：虛線退場，改「營收明細　N 筆」（見 ⑥） */
  ok('★ 「營收明細」小標＋筆數，沒有虛線',
     /<div class="mc-revsec"><span>營收明細<\/span><b>\$\{_revRows\.length\} 筆<\/b><\/div>/.test(src));
  ok('★★ 沒有另外算一份數字（沿用 _revCash／_revBank／_revOther）',
     /數字全部沿用既有的 _revCash／_revBank／_revOther／_revTotal，這裡只是換個呈現/.test(src));
  ok('★ 現金綠／匯款藍沿用既有語意色，不另訂',
     /body\.ink \.mc-rs-cash \.mc-rs-l\{color:#1f6f54;\}/.test(src)
     && /\.kpay-cash\{background:#eef5f1;color:#1f6f54;\}/.test(src));
}

console.log('\n③ KPI 下方那條現金／匯款撤掉');
{
  /* 桌機那條（kpiStrip）拆掉；手機的 _revCard 保留 —— 手機沒有右欄營收面板，
     拆掉就真的看不到現金該收多少。 */
  const STRIP=src.slice(src.indexOf('let kpiStrip=`'), src.indexOf('/* ── 今日值班卡'));
  ok('★★ 桌機 kpiStrip 上的 kpay 膠囊已經不輸出', !/kpay-cash/.test(STRIP));
  ok('★★ 手機的 _revCard 仍然有（那邊沒有右欄面板，不能一起拆）',
     /這是 _revCard（手機版 KPI 與舊版 kpiCards 在用）/.test(src)
     && /<span class="kpay kpay-cash">現金 \$\$\{_fm\(_revCash\)\}<\/span>/.test(src));
  ok('★★ 使用者原話與「怎麼還原」寫在原地',
     /原本今日營收下方的現金、匯款\s*\n\s*就不用再顯示了/.test(src)
     && /要還原就把 `''` 換回原本那個三段陣列（_revCash／_revBank／_revOther 都還在算）/.test(src));
  ok('　 三個數字仍然有在算（右欄面板要用）',
     /const _revPaySum=\(_revCash\|\|0\)\+\(_revBank\|\|0\)\+\(_revOther\|\|0\);/.test(src));
  ok('　 kpay 樣式沒被刪（別處還在用，例如今日營收視窗）', /\.kpay-bank\{background:#eef1f7;/.test(src));
}

console.log('\n④ 選了別天要看得出來（Ink 層蓋掉的狀態要接回來）');
{
  ok('★★ 選取＝橄欖細框；今天＝橄欖實心；兩者可同時成立',
     /body\.ink \.twk-day\.on\{border-color:var\(--olive,#556B45\);border-width:2px;\}/.test(src)
     && /body\.ink \.twk-day\.on:not\(\.today\)\{/.test(src)
     && /body\.ink \.twk-barin \.twk-day\.today\{background:var\(--olive,#556B45\)/.test(src));
  ok('★★ 失敗原因寫在原地（權重壓過 .twk-day.on，選取狀態整個沒畫面）',
     /壓過原本的 `\.twk-day\.on\{border-color:金;border-width:2px\}`/.test(src)
     && /看起來就像永遠停在今天/.test(src));
  ok('★★ 左欄月曆的選取改成橄欖 2px 實圈（原本是為深綠底配的米白細圈，白底幾乎看不見）',
     /body\.ink \.cal-side \.mc-cell\.mc-sel \.mc-d\{\s*\n\s*border:2px solid var\(--olive,#556B45\);/.test(src));
  ok('　 今天又被選取時圈改米白（不然橄欖圈壓在橄欖底上看不見）',
     /body\.ink \.cal-side \.mc-cell\.mc-today\.mc-sel \.mc-d\{\s*\n\s*border-color:var\(--cream,#F2EFE4\);color:#F2EFE4;\}/.test(src));
}

console.log('\n⑤ 「回到今天」：只要看的不是今天就要出現');
{
  const seg=src.slice(src.indexOf('const _todaySide=(()=>{'), src.indexOf('const _wkDays='));
  const run=(viewDate, todayStr)=>{
    const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
    const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return new Function('_tdD','today','ymd','isTodayView', seg+'\nreturn _todaySide;')(
      parse(viewDate), todayStr, ymd, viewDate===todayStr);
  };
  eq('★★ 看的就是今天 → 不出現（本來就在今天，不需要回頭路）', run('2026-08-27','2026-08-27'), '');
  eq('★★ 同一週內點別天 → 出現在右側　←　使用者回報的就是這一種',
     run('2026-08-25','2026-08-27'), 'r');
  eq('★ 今天在檢視週的更前面 → 貼左側', run('2026-09-10','2026-08-27'), 'l');
  eq('★ 今天在檢視週的更後面 → 貼右側', run('2026-07-10','2026-08-27'), 'r');
  ok('★★ 使用者原話與原本的漏洞寫在原地',
     /選擇其他天時一樣要出現『回到今天』的按鈕/.test(src)
     && /原本只有「今天根本不在這一週」才給，於是在同一週內點別天時完全沒有回頭路/.test(src));
  ok('　 兩個插槽本來就固定佔位，多一顆不會讓版面跳動',
     /兩個插槽本來就固定佔位（\.twk-today-slot 58px），多顯示一顆不會讓版面跳動/.test(src)
     && /\.twk-today-slot\{flex:0 0 58px;/.test(src));
  ok('　 按鈕仍走原本的 dashPickDate(today)（功能沒動）',
     (src.match(/onclick="dashPickDate\('\$\{today\}'\)">回到<br>今天/g)||[]).length===2);
}


console.log('\n⑥ 面板重做：做減法（2026-08-27 使用者：「主要問題是資訊層級與卡片結構太厚重」）');
{
  /* 結尾停在下一個 ══ 區塊，不要一路吃到 </style>（後面還接了別的樣式區塊） */
  const B=(()=>{const m='/* ══ Ink · 今日營收面板重做';const a=src.indexOf(m);
    const nxt=src.indexOf('\n/* ══', a+40), cap=src.indexOf('</style>');
    return src.slice(a, (nxt>=0&&nxt<cap)?nxt:cap);})();
  ok('★★ 百分比整個退場（首頁不需要呈現付款方式比例）',
     !/_revPct/.test(src) && !/class="mc-rs-p"/.test(src) && !/\.mc-rs-p\{/.test(src));
  ok('★★ 明細標題改「營收明細　N 筆」，沒有虛線',
     /<div class="mc-revsec"><span>營收明細<\/span><b>\$\{_revRows\.length\} 筆<\/b><\/div>/.test(src)
     && !/border-top:1px dashed/.test(B));
  ok('　 筆數用全部筆數，不是截斷後的（要跟「還有 N 筆」對得起來）',
     /筆數用 _revRows\.length（全部），不是 _revShown\.length（截斷後）/.test(src));

  ok('★★ 摘要：極淡暖米色、沒有外框，兩欄之間只有一條細線',
     /body\.ink \.mc-revsplit\{background:#FAF6EE;border:none;border-radius:8px;/.test(src)
     && /body\.ink \.mc-rs-col \+ \.mc-rs-col\{border-left:1px solid rgba\(45,36,28,\.10\);\}/.test(src));

  ok('★★ 明細變成「一個白色 list」：逐筆不再是卡片，只用 1px 淡線分隔',
     /body\.ink \.mc-revlist-card \.mc-revlist\{gap:0;background:var\(--card\);\s*\n\s*border:1px solid var\(--bd\);border-radius:10px;padding:0 12px;\}/.test(src)
     && /body\.ink \.mc-revlist-card \.mc-rev-row\{background:transparent;border:none;border-radius:0;/.test(src)
     && /border-bottom:1px solid rgba\(45,36,28,\.07\);\}/.test(src));
  ok('　 最後一筆不畫線（list 底部才不會出現雙線）',
     /body\.ink \.mc-revlist-card \.mc-rev-row:last-child\{border-bottom:none;\}/.test(src));
  ok('　 hover 不再整列變底色＋陰影（那是卡片的語彙），改成姓名轉橄欖',
     /\.mc-rev-row\.mc-rev-go:hover\{background:transparent;/.test(B)
     && /\.mc-rev-row\.mc-rev-go:hover \.mc-rev-nm\{color:var\(--olive,#556B45\);\}/.test(B));

  ok('★★ 三種 badge 全部退成純文字（底色／框線／圓角／內距都拿掉）',
     /body\.ink \.mc-revlist-card \.mc-rev-pay,\s*\n\s*body\.ink \.mc-revlist-card \.rev-att,\s*\n\s*body\.ink \.mc-revlist-card \.rev-kind\{\s*\n\s*background:transparent !important;border:none !important;border-radius:0 !important;\s*\n\s*padding:0 !important;/.test(src));
  ok('★★ 但顏色留著 —— 那是語意（現金綠／匯款金／分期紫／抽獎金／教練色）',
     /顏色留著（那是語意：現金綠／匯款金／分期紫／抽獎金／教練色）/.test(src)
     && /\.rev-kind-installment\{background:#efe7f3;color:#6e3a86;/.test(src));
  ok('★ 種類那格從直排文字改回橫排（原本 writing-mode:vertical-rl 佔掉一整欄）',
     /writing-mode:horizontal-tb;text-orientation:mixed;/.test(B)
     && /\.mc-rev-kv \.rev-kind\{writing-mode:vertical-rl;text-orientation:upright;/.test(src));

  ok('★★ 金額與姓名的層級：姓名 600、金額 600 等寬，方案退成 t3',
     /body\.ink \.mc-revlist-card \.mc-rev-nm\{font-size:14px;font-weight:600;color:var\(--text\);\}/.test(src)
     && /body\.ink \.mc-revlist-card \.mc-rev-it\{font-size:11\.5px;color:var\(--t3\);font-weight:400;\}/.test(src)
     && /body\.ink \.mc-revlist-card \.mc-rev-amt\{[^}]*font-variant-numeric:tabular-nums;\}/.test(src));
  ok('★★ 只動外觀：沒有一條規則碰 display／position／flex 方向',
     !/(^|[;{\s])(display|position|flex-direction|top|left|right|bottom|width|height)\s*:/
       .test(B.replace(/\/\*[\s\S]*?\*\//g,'')));
  ok('　 使用者原話（做減法）寫在原地',
     /不是加元素，而是做減法。減少框線、減少底色、減少 badge、降低卡片高度/.test(src)
     && /「今天收了多少」\s*\n\s*這件很簡單的事被包了四層才講完/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
