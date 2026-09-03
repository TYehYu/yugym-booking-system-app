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
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 沒有約別的列也要佔住左欄');
ok('★★★ 不再回空字串，改回一個空的佔位格',
   /return r\.kind\s*\n\s*\? `<span class="mc-rev-kv">\$\{saleKindChip\(r\.tk,r\.kind\)\}<\/span>`\s*\n\s*: `<span class="mc-rev-kv mc-rev-kv-none" aria-hidden="true"><\/span>`;/.test(src));
ok('★★ 空格子對螢幕報讀器隱藏（它沒有內容，唸出來只是雜訊）',
   /mc-rev-kv-none" aria-hidden="true"/.test(src));
ok('★★★ 欄寬固定，有沒有約別都一樣寬（姓名才在同一條垂直線上）',
   /body\.ink \.mc-revlist-card \.mc-rev-kv\{flex:0 0 46px;/.test(src));
ok('★★ 為什麼是 46px，算式寫在原地',
   /46px 是「分期」在 11px 字級下的膠囊寬度（22 字寬＋18 內距＋2 框線）再留一點餘裕/.test(src));
ok('★★ 使用者原話留著（下次有人想「省掉空格子」時看得到理由）',
   /羅苡榕這種沒有分類的　也要保留左邊的空間/.test(src));

console.log('\n② 約別改回圓形鈕');
ok('★★★ 膠囊造型：圓角、內距、框線、橫排',
   /body\.ink \.mc-revlist-card \.mc-rev-kv \.rev-kind\{[\s\S]{0,260}?border-radius:999px;padding:4px 9px;border-width:1px;border-style:solid;\}/.test(src)
   && /body\.ink \.mc-revlist-card \.mc-rev-kv \.rev-kind\{[\s\S]{0,120}?writing-mode:horizontal-tb;/.test(src));
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
ok('★ 膠囊的 hover 效果還在（它是可點的，要看得出來）',
   /button\.rev-kind:hover\{filter:brightness\(\.96\);box-shadow:0 1px 4px rgba\(60,50,38,\.18\);\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
