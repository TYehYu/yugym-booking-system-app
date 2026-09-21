/* 營收明細的約別欄（2026-09-03 使用者附截圖）
   「營收明細左邊的分期 新約 續約用圓形鈕
     羅苡榕這種沒有分類的 也要保留左邊的空間 讓客戶姓名對齊」

   兩件事要一起做才有用：
   ① 約別改回膠囊（Ink 改版時把它跟其他 badge 一起退成純文字了）
   ② 沒有約別的列也要輸出那一格 —— 不然那一列的姓名會往左跑，整份名單看下來不齊
   ⚠ 顏色是語意，不能跟著造型一起換：新約金／續約綠／分期紫／抽獎金（0808 定的）。
   ⚠ 這一組只作用在 Ink（員工桌機實際在用的主題）；淺色版維持 0813 的直排設計。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;/* 2026-09-05：圓角 50% → 999px（22 條，全部是正方形，畫出來一模一樣）——
   同一件事只留一種寫法。 */
console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 沒有約別的列也要佔住左欄');
/* 2026-09-15：教練名搬進這一格（疊在約別章下方），所以回傳改成組合 _chip＋_att。
   佔位格的規則沒變：兩者都空才畫空格子。 */
ok('★★★ 不再回空字串，改回一個空的佔位格',
   /if\(!_chip && !_att\) return `<span class="mc-rev-kv mc-rev-kv-none" aria-hidden="true"><\/span>`;/.test(src)
   /* 2026-09-21：沒有教練名時多帶一個 solo 標記（圓章放大用），欄本身不變 */
   && /return `<span class="mc-rev-kv\$\{_att\?'':' mc-rev-kv-solo'\}">\$\{_chip\}\$\{_att\}<\/span>`;/.test(src));
ok('★★★ 教練名在約別章**下方**（同一格、直向堆疊）',
   /const _att=revAttribChip\(r\);/.test(src)
   && /\.mc-rev-kv\{flex:none;align-self:stretch;display:flex;flex-direction:column;/.test(src));
ok('★★ 空格子對螢幕報讀器隱藏（它沒有內容，唸出來只是雜訊）',
   /mc-rev-kv-none" aria-hidden="true"/.test(src));
/* ⚠ 2026-09-15 由 32px 加寬到 46px：教練名搬進來疊在圓章下方，32px 塞不下
   （RANDY／SANDY／MANGO 5 碼、11px≈33px）。欄寬「固定」這件事沒變。 */
ok('★★★ 欄寬固定，有沒有約別都一樣寬（姓名才在同一條垂直線上）',
   /body\.ink \.mc-revlist-card \.mc-rev-kv\{flex:0 0 46px;align-self:stretch;/.test(src));
ok('★★ 使用者原話留著（下次有人想「省掉空格子」時看得到理由）',
   /羅苡榕這種沒有分類的　也要保留左邊的空間/.test(src));

console.log('\n② 約別＝一個字的正圓框章（2026-09-03 二修＋三修）');
/* 二修：「分期[分] 續約[續] 新約[新] 用正圓形鈕 不要底色」
   三修：「[新][續][分] 跟首頁課卡出席章的大小一樣」 */
ok('★★★ 只顯示一個字（全名留在 title 與 SALE_KIND_LB）',
   /const SALE_KIND_AB=\{new:'新', renewal:'續', installment:'分', gift:'贈'\};/.test(src)
   && />\$\{SALE_KIND_AB\[k\]\}<\/span>`;/.test(src)
   && /const SALE_KIND_LB=\{new:'新約', renewal:'續約', installment:'分期', gift:'贈送'\};/.test(src));
/* 2026-09-05 使用者指示：「設定 0 的方案 約別要多一個贈送」。兩張表都要同步加，
   少一邊 saleKindChip 會畫出空白（SALE_KIND_AB[k] 是 undefined）或退回「新」。 */
ok('★★ 贈送章有自己的顏色，而且刻意最淡（不跟新約／續約搶注意力）',
   /\.rev-kind-gift\{background:#f2efe9;/.test(src)
   && /贈送既不是警示也不是成交/.test(src));
ok('★★★ 抽獎也是一個字', />獎<\/span><\/span>`;/.test(src));
/* 2026-09-21：章改成唯讀之後，title 不再寫「點一下更改」——只留全名。 */
ok('★★ 全名放進 title（滑過去讀得到，報讀器也唸得出來）',
   /title="\$\{SALE_KIND_LB\[k\]\}"/.test(src)
   && /title="抽獎"/.test(src));
/* ⚠ 「正圓」＝寬高相等，所以是固定尺寸＋padding:0。靠 padding 撐出來的是膠囊不是圓
   （左右內距永遠比上下大）—— 二修第一版就是這樣寫的。 */
ok('★★★ 正圓：寬高相等、padding 歸零',
   /width:22px;height:22px;padding:0;flex:none;/.test(src)
   && /border-radius:var\(--radius-full\);border-width:1\.5px;border-style:solid;/.test(src));
ok('★★★ 尺寸與首頁課卡出席章一致（22×22／12px）',
   /\.tcard-3c \.tcard-chk\{position:static;margin:0;width:22px;height:22px;font-size:12px;\}/.test(src)
   && /font-size:12px;font-weight:700;letter-spacing:0;line-height:1;/.test(src)
   && /尺寸對齊首頁課卡的出席章（\.tcard-3c \.tcard-chk 是 22×22／12px）/.test(src));
ok('★★★ 沒有底色', /background:transparent;\}/.test(src));
/* 底色拿掉後顏色只剩框線與文字 —— 原本那組極淡描邊（#e8d9b8…）是為「有底色的膠囊」
   配的，放在米底上幾乎看不見。改吃 currentColor，四種語意色自動生效。
   實測對比：新約 5.56、續約 5.97、分期 7.91、抽獎 5.56（UI 元件門檻是 3:1）。 */
ok('★★★ 框線吃 currentColor（沿用原本的淡描邊會看不見）',
   /border-color:currentColor;/.test(src)
   && /那組（#e8d9b8／#cfe3d8／#ddd0e6）是為「有底色的膠囊」配的極淡描邊/.test(src));
ok('★★ 橫排（不是 0813 那版的直書）',
   /body\.ink \.mc-revlist-card \.mc-rev-kv \.rev-kind\{[\s\S]{0,120}?writing-mode:horizontal-tb;/.test(src));
/* ⚠ 這一條是關鍵：Ink 有一條把 badge 全部退成純文字的規則（背景／框線／圓角／內距
   都 !important 清掉）。約別必須從那條的選擇器清單裡拿掉，否則怎麼寫都蓋不回來。 */
/* ⚠ 2026-09-15：〔退回〕也加進這條清單了（使用者：「這個退回的標籤很突兀」），
   所以選擇器不再是連續兩行。這裡改成「約別不在清單裡」的**語意**判斷，
   不再逐字釘整條選擇器 —— 否則日後每加一個 badge 都會無謂地紅一次。 */
ok('★★★ 約別已從「badge 退成純文字」那條規則裡移除',
   /body\.ink \.mc-revlist-card \.mc-rev-pay,[\s\S]{0,200}?background:transparent !important;/.test(src)
   && !/body\.ink \.mc-revlist-card \.rev-kind,/.test(src)
   && !/body\.ink \.mc-revlist-card \.rev-att,\s*\n\s*body\.ink \.mc-revlist-card \.rev-kind\{/.test(src));
ok('★★ 其他 badge（付款方式、教練歸屬）維持純文字，沒被一起改回去',
   /body\.ink \.mc-revlist-card \.mc-rev-pay\{font-size:11\.5px;\}/.test(src)
   && /body\.ink \.mc-revlist-card \.rev-att\{font-size:11px;\}/.test(src));

console.log('\n③ 顏色是語意，不能跟著造型換');
ok('★★★ 四種約別的顏色沒動（新約金／續約綠／分期紫／抽獎金）',
   /\.rev-kind-new\{background:#f7efe0;color:#8a5e28;border-color:#e8d9b8;\}/.test(src)
   && /\.rev-kind-renewal\{background:#eef5f1;color:#1f6f54;border-color:#cfe3d8;\}/.test(src)
   && /\.rev-kind-installment\{background:#efe7f3;color:#6e3a86;border-color:#ddd0e6;\}/.test(src)
   && /\.rev-kind-lottery\{background:#f3e6cc;color:#8a5e28;border-color:#e5d3ae;\}/.test(src));
ok('★★ 顏色的理由還寫在原地（0808：新約＝新客人值得注意、續約＝好消息也是常態）',
   /新約＝金（這筆是新客人，值得注意）、續約＝綠（既有客人回頭，是好消息也是常態）/.test(src));

console.log('\n④ 抽獎那一顆（2026-09-21 起改成唯讀）');
/* 使用者：「原本卡片上的互動按鈕 可以移除了 統一從點開卡片小視窗修改資料」——
   抽獎列改成**整列**點下去就開改獎項視窗，格子裡不再放一顆各自 stopPropagation 的鈕。
   ⚠ 「過了當天只有管理員能改」的限制沒有變鬆，只是移到 lottoFixAsk 裡面把關。 */
ok('★★ 抽獎章是純顯示，且過了當天非管理員仍然淡化、不是消失',
   /<span class="rev-kind rev-kind-lottery\$\{_off\?' rev-kind-off':''\}"/.test(src)
   && /\.rev-kind\.rev-kind-off\{opacity:\.5;\}/.test(src)
   && !/button\.rev-kind\.rev-kind-off/.test(src));
/* 2026-09-21：章不再可點，0915 那組 hover／:active 放大樣式跟著整組移除 ——
   留著就會變成「看起來可以點、其實點不動」的殘影。 */
ok('★★★ 可點的殘影都清乾淨（游標、hover 放大、:active 壓縮）',
   !/button\.rev-kind\{cursor:pointer/.test(src)
   && !/\.rev-att-tap\{/.test(src)
   && !/\.mc-rev-pay-btn\{/.test(src));
ok('★★ 改首頁出席章尺寸時要記得同步這裡（沒有共用變數）',
   /改首頁那顆章的尺寸時，這裡要跟著改（兩處，沒有共用變數）/.test(src));

console.log('\n⑤ 團／商圓章（2026-09-21 使用者：「才不會讓左邊那麼空白」）');
{
  /* 使用者：「圓章要新增幾個 才不會讓左邊那麼空白〔團〕表示團課〔商〕表示其他商品」——
     原本只有教練課類的票有約別章，團課方案與商品那幾列左邊整格是空的。 */
  /* 這支測試本來只比對字串、沒有抽函式的工具，這裡自備一個 */
  const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;
    for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;
      else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
  const K=new Function('saleKindChip','revAttribChip',
    grabFn('revKindCell')+'\nreturn revKindCell;')(
    (tk,k)=>`<KIND:${k}>`, ()=>'');
  /* 對照組：有教練名的那一種（revAttribChip 回傳非空） */
  const K2=new Function('saleKindChip','revAttribChip',
    grabFn('revKindCell')+'\nreturn revKindCell;')(
    (tk,k)=>`<KIND:${k}>`, ()=>'<span class="rev-att">RANDY</span>');
  ok('★★ 團課票 → 團', />團</.test(K({tk:'T1',cls:'group'})) && /rev-kind-group/.test(K({tk:'T1',cls:'group'})));
  ok('★★ 商品收款 → 商', />商</.test(K({pur:'P1',src:'merchandise'})) && /rev-kind-goods/.test(K({pur:'P1',src:'merchandise'})));
  /* ⚠ 不能蓋掉真正的約別：有約別的列還是要畫新／續／分 */
  ok('★★★ 有約別時仍畫約別，不會被團／商蓋掉',
     /<KIND:renewal>/.test(K({tk:'T1',cls:'group',kind:'renewal'})));
  ok('★ 教練課票不會被誤標成團', !/rev-kind-group/.test(K({tk:'T1',cls:'pt'})));
  /* 使用者只指名團課與商品兩種；其餘維持空格子（那一格是為了讓姓名對齊才存在的） */
  ok('★ 場租／重啟仍是空格子（只指名了團與商）',
     /mc-rev-kv-none/.test(K({pur:'P1',src:'facility_rental'}))
     && /mc-rev-kv-none/.test(K({pur:'P2',src:'reactivate'})));
  /* 2026-09-21 使用者：「團課張改成橘色 跟課卡一樣」——
     團＝行事曆／課卡上團課的那個橘（--course-group-accent #9a5a1e），三處同一個色。
     ⚠ Ink 模式只吃 color（框線 currentColor、背景透明），所以那一層自動跟著變。 */
  /* 2026-09-21 使用者：「圓形章 沒有業績歸屬人的時候可以放大一點」——
     左欄固定 46px 寬、分兩層（章在上、教練名在下）；沒有教練名時上下都空著，
     22px 的章看起來很小。加一個標記讓 CSS 把它放大，欄寬與對齊線都不動。 */
  ok('★★ 沒有教練名的列給 solo 標記（有的話不給）',
     /mc-rev-kv-solo/.test(K({pur:'P1',src:'merchandise'}))
     && !/mc-rev-kv-solo/.test(K2({tk:'T1',cls:'group'})));
  ok('★★ solo 時圓章放大，字級跟著放大（不要大圈圈配小字）',
     /body\.ink \.mc-revlist-card \.mc-rev-kv-solo \.rev-kind\{\s*\n\s*width:30px;height:30px;font-size:15px;/.test(src));
  ok('★ 欄寬沒有被動到（姓名的垂直對齊線要維持）',
     /body\.ink \.mc-revlist-card \.mc-rev-kv\{flex:0 0 46px;/.test(src));
  ok('★★ 團章用課卡同一個橘，商章用中性灰米',
     /\.rev-kind-group\{background:#fbeee0;color:#9a5a1e;/.test(src)
     && /\.rev-kind-goods\{background:#f0eee9;/.test(src));
  ok('★★ 那個橘就是課卡的團課色（BK_ACCENT.group）',
     /group:'var\(--course-group-accent,#9a5a1e\)'/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
