/* 快速預約視窗：日期列不准被壓扁、視窗不准上下跑（2026-08-31 四修）

   使用者：「日期列可以固定一欄嗎　我按住拖拉的時候可以往下拉動　這樣不對
             然後可以把快速預約的視窗固定置中靠上　這樣不管下面時段多寡
             也不會上上下下的跑　因為現在應該是畫面置中」

   ── 根因（前三修都沒治好的原因）──
   手機的 .modal 是 display:flex;flex-direction:column。
   flex 子項本來有「不得被壓得比內容小」的保護（automatic minimum size，min-height:auto），
   **但那條保護只在該項的 overflow 是 visible 時成立**。
   .qs-days 為了橫捲寫了 overflow-x:auto —— CSS 規定另一軸的 visible 會跟著算成 auto，
   於是保護失效：視窗一撐到 max-height（下面時段一多就會），
   整列被壓成十幾 px，卡片被裁掉一大截，還多出一條可以上下拉的捲軸。

   前三修都在調**卡片自己**的高度（行高、內距、寫死 68px），
   問題卻出在**外面的人把這一列壓扁** —— 所以怎麼調都沒用。
   實測（Chrome 390×560、42 個時段）：舊寫法整列 84px → 16px，卡片只看得到 11px。

   ⚠ 這支測的是「規則有沒有寫在 CSS 裡」。實際幾何已用無頭瀏覽器量過
     （canDragY 從 68 變 0、卡片 68px 完整），數字記在上面那段。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const QSDAYS=(src.match(/\.qs-days\{[^}]*\}/)||[''])[0];

/* ══ 2026-09-14 改版（使用者附截圖：「一列七天日期沒有成功嗎　我這張圖看到四個而已」）══
   日期列從「橫捲＋每顆 min-width:70px」改成七格 grid ——
   程式本來就算好 7 天，看不到是因為 375px 一次只排得下 4 顆。
   ⚠ 橫捲拿掉之後，上面那個根因（overflow 取消 min-height:auto 保護）已經不存在，
     但 flex:0 0 auto 與 overflow-y:hidden **照樣要留著**當雙保險 —— 那是四修的成果。
   ⚠ 列高改 auto（七等分後每顆自己長高），所以 84=68+5+11 那條算式跟著退場。 */
console.log('① 日期列：七格攤開、不准被壓、不准上下捲');
{
  ok('★★★ 七格 grid（一次看得完一週，不必左右滑）',
     /display:grid;grid-template-columns:repeat\(7,1fr\);/.test(QSDAYS), QSDAYS);
  ok('★★★ 橫捲已拿掉（那是「只看得到四天」的原因）', !/overflow-x:auto;/.test(QSDAYS));
  ok('★★★ flex:0 0 auto 留著（四修的成果，不因改版拆掉）',
     /flex:0 0 auto;/.test(QSDAYS), QSDAYS);
  ok('★★★ overflow-y:hidden 留著 —— 就算高度真的算錯，也不給使用者上下拉',
     /overflow-y:hidden;/.test(QSDAYS));
  ok('★★★ 根因與「為什麼不拆保險」寫在 CSS 原地',
     /那條保護只在 overflow 是 visible 時成立/.test(src)
     && /flex:0 0 auto 與\s*\n\s*overflow-y:hidden \*\*照樣留著\*\*當雙保險/.test(src));
  ok('★★ 卡片本身維持固定 68px（三修的成果沒有被推翻）',
     /\.qs-day\{[^}]*height:68px;/.test(src));
  ok('★★★ min-width:70px 已拿掉（七等分之後它會撐破容器）',
     /\.qs-day\{[^}]*min-width:0;/.test(src) && !/\.qs-day\{[^}]*min-width:70px;/.test(src));
}

console.log('\n② 字級改吃容器寬度，不用斷點');
{
  ok('★★★ 容器宣告 container-type', /container-type:inline-size;/.test(QSDAYS));
  ok('★★★ 日期與週標都用 clamp(...cqw...) 連續縮放',
     /\.qs-day b\{[^}]*font-size:clamp\(12px,4\.2cqw,19px\);/.test(src)
     && /\.qs-day i\{[^}]*font-size:clamp\(9px,2\.6cqw,11\.5px\);/.test(src));
  ok('★★ 兩行都不准折行（寧可字小一階，也不要七格高低不齊）',
     /\.qs-day i\{[^}]*white-space:nowrap;/.test(src) && /\.qs-day b\{[^}]*white-space:nowrap;/.test(src));
}

console.log('\n②-2 視窗全螢幕（使用者：「可以讓這個窗變全螢幕」）');
{
  ok('★★★ 只吃帶 .qs-mtop 標記的那一支，不動全域 .modal',
     /\.modal-bg:not\(\.modal-side\):has\(\.qs-mtop\) \.modal\{\s*\n\s*max-width:100vw;width:100vw;max-height:100dvh;height:100dvh;border-radius:0;/.test(src));
  ok('★★ 只在手機全螢幕，桌機維持置中視窗',
     /@media\(max-width:600px\),\(orientation:portrait\) and \(max-width:1024px\)\{\s*\n\s*\.modal-bg:not\(\.modal-side\):has\(\.qs-mtop\) \.modal\{/.test(src));
  ok('★★ 有留安全區內距（瀏海與底部手勢列）', /env\(safe-area-inset-top,0px\)/.test(src) && /env\(safe-area-inset-bottom,0px\)/.test(src));
}

console.log('\n③ 視窗靠上對齊：只給帶標記的那一支');
{
  ok('★★★ 靠上的規則存在，且只吃 .qs-mtop',
     /\.modal-bg:not\(\.modal-side\):has\(\.qs-mtop\)\{align-items:flex-start;\}/.test(src));
/* 2026-09-02：標題列多掛一個 qs-mtitle（右邊放「取消預約」），qs-mtop 照舊。 */
  ok('★★★ 標記掛在會員端快速預約／改期那個視窗的標題上',
     /<div class="modal-title qs-mtop qs-mtitle"><span>\$\{_rs\?'更改自主訓練時間':'預約自主訓練'\}<\/span>/.test(src));
  ok('★★★ 沒有把全站彈窗改成靠上（0729 定案：預約明細等維持垂直置中）',
     /\.modal-bg\{position:fixed;inset:0;[^}]*align-items:center;/.test(src)
     && !/\.modal-bg\{[^}]*align-items:flex-start/.test(src));
  ok('★★ 0729 那條決定沒有被刪掉，而且說明了為什麼這次不算推翻它',
     /2026-07-29 使用者回報「預約明細沒有置中」）：改回垂直置中/.test(src)
     && /這\*\*不是\*\*推翻上面 0729 的決定/.test(src));
  ok('★ 側滑視窗不受影響（它自己是 align-items:stretch）',
     /\.modal-bg\.modal-side\{justify-content:flex-end;align-items:stretch;padding:0;\}/.test(src));
}

console.log('\n④ 這支測試自己要抓得到（不是只會說 OK）');
{
  /* 反例：把 flex:0 0 auto 拿掉，第一條就該紅 */
  const broken=QSDAYS.replace('flex:0 0 auto;','');
  ok('★★ 反例：少了 flex:0 0 auto 就檢查得出來', !/flex:0 0 auto;/.test(broken));
  /* 反例：桌機端那支快速排課視窗（51xx 行）也用同一組 .qs-days，
     所以這條 CSS 修的是兩個視窗；但 .qs-mtop 只掛一個，別掛錯。 */
  ok('★★ 只有一個模板掛這個標記（沒有偷偷擴散到別的視窗）',
     (src.match(/class="[^"]*\bqs-mtop\b[^"]*"/g)||[]).length===1,
     (src.match(/class="[^"]*qs-mtop[^"]*"/g)||[]));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
