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

console.log('① 日期列：不准被壓、不准上下捲');
{
  ok('★★★ flex:0 0 auto —— 這是關鍵那一條（min-height:auto 的保護已被 overflow 取消）',
     /flex:0 0 auto;/.test(QSDAYS), QSDAYS);
  ok('★★★ 高度寫死 84px（68 卡片 ＋ 5 上內距 ＋ 11 下內距），box-sizing 一起寫',
     /height:84px;/.test(QSDAYS) && /box-sizing:border-box;/.test(QSDAYS)
     && /padding:5px 2px 11px;/.test(QSDAYS));
  ok('★★★ overflow-y:hidden —— 就算高度真的算錯，也不給使用者上下拉',
     /overflow-y:hidden;/.test(QSDAYS));
  ok('★★ 橫捲留著（日期列本來就要左右滑）',
     /overflow-x:auto;/.test(QSDAYS));
  ok('★★ 內容垂直置中，卡片不會貼著上緣',
     /align-items:center;/.test(QSDAYS));
  ok('★★★ 根因寫在 CSS 原地（下一個人才不會又去調卡片高度）',
     /那條保護只在 overflow 是 visible 時成立/.test(src)
     && /前三修都在調卡片自己的高度/.test(src));
  ok('★★ 卡片本身維持固定 68px（三修的成果沒有被推翻）',
     /\.qs-day\{[^}]*height:68px;/.test(src));
}

console.log('\n② 算式核對：84 = 68 + 5 + 11');
{
  const g=re=>Number((QSDAYS.match(re)||[])[1]);
  const h=g(/height:(\d+)px/), pt=g(/padding:(\d+)px/), pb=g(/padding:\d+px \d+px (\d+)px/);
  const card=Number((/\.qs-day\{[^}]*height:(\d+)px;/.exec(src)||[])[1]);
  ok('★★★ 高度剛好裝得下卡片＋上下內距（多一點會空、少一點就會裁）',
     h===card+pt+pb, {列高:h, 卡片:card, 上:pt, 下:pb});
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
