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
ok('★★★ 不再回空字串，改回一個空的佔位格',
   /return r\.kind\s*\n\s*\? `<span class="mc-rev-kv">\$\{saleKindChip\(r\.tk,r\.kind\)\}<\/span>`\s*\n\s*: `<span class="mc-rev-kv mc-rev-kv-none" aria-hidden="true"><\/span>`;/.test(src));
ok('★★ 空格子對螢幕報讀器隱藏（它沒有內容，唸出來只是雜訊）',
   /mc-rev-kv-none" aria-hidden="true"/.test(src));
ok('★★★ 欄寬固定，有沒有約別都一樣寬（姓名才在同一條垂直線上）',
   /body\.ink \.mc-revlist-card \.mc-rev-kv\{flex:0 0 32px;/.test(src));
ok('★★ 使用者原話留著（下次有人想「省掉空格子」時看得到理由）',
   /羅苡榕這種沒有分類的　也要保留左邊的空間/.test(src));

console.log('\n② 約別＝一個字的正圓框章（2026-09-03 二修＋三修）');
/* 二修：「分期[分] 續約[續] 新約[新] 用正圓形鈕 不要底色」
   三修：「[新][續][分] 跟首頁課卡出席章的大小一樣」 */
ok('★★★ 只顯示一個字（全名留在 title 與 SALE_KIND_LB）',
   /const SALE_KIND_AB=\{new:'新', renewal:'續', installment:'分'\};/.test(src)
   && /\$\{SALE_KIND_AB\[k\]\}<\/\$\{can\?'button':'span'\}>/.test(src)
   && /const SALE_KIND_LB=\{new:'新約', renewal:'續約', installment:'分期'\};/.test(src));
ok('★★★ 抽獎也是一個字', />獎<\/button>`/.test(src) && />獎<\/span>`;/.test(src));
ok('★★ 全名放進 title（滑過去讀得到，報讀器也唸得出來）',
   /const tt=can\?`\$\{SALE_KIND_LB\[k\]\}　點一下更改約別（影響續約獎金）`:SALE_KIND_LB\[k\];/.test(src)
   && /title="抽獎　\$\{_off\?'過了當天只有管理員能改':'點一下改抽獎項目'\}"/.test(src));
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
ok('★★★ 約別已從「badge 退成純文字」那條規則裡移除',
   /body\.ink \.mc-revlist-card \.mc-rev-pay,\s*\n\s*body\.ink \.mc-revlist-card \.rev-att\{\s*\n\s*background:transparent !important;/.test(src)
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

console.log('\n④ 抽獎那一顆仍然可以點');
/* 抽獎列的約別格是一顆 <button>（點了改獎品），改造型不能把它變成純文字。 */
ok('★★ 抽獎仍是按鈕，且過了當天非管理員只是淡化、不是消失',
   /<button class="rev-kind rev-kind-lottery\$\{_off\?' rev-kind-off':''\}"/.test(src)
   && /button\.rev-kind\.rev-kind-off\{opacity:\.5;\}/.test(src));
ok('★ hover 效果還在（它是可點的，要看得出來）',
   /button\.rev-kind:hover\{filter:brightness\(\.96\);box-shadow:0 1px 4px rgba\(60,50,38,\.18\);\}/.test(src));
ok('★★ 改首頁出席章尺寸時要記得同步這裡（沒有共用變數）',
   /改首頁那顆章的尺寸時，這裡要跟著改（兩處，沒有共用變數）/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
