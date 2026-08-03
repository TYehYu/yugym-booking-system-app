/* 2026-08-03 使用者回報三連：「電子合約會員簽名的時候會一直拖拉到畫面」
   「會員從票券查看合約的時候也會超出畫面，幫我調整合約介面」

   兩個病根：
   ① 簽署原本是彈窗（38vh 小框＋簽名板）——手機上整個彈窗比螢幕高；簽名靠
      canvas 的 touch-action:none 擋捲動，但 LINE 內建瀏覽器（LIFF）支援不齊，
      pointer 事件的 preventDefault 又擋不住原生捲動 → 筆劃把畫面拖著跑。
   ② 閱讀器 .cr-body 是 pre-wrap，合約字裡的長串（網址）撐出橫向、也沒關
      overscroll → 超出畫面。

   修法：簽署改滿版（全文自捲＋簽名區固定底部）；兩塊簽名板都補 touchmove
   preventDefault（passive:false，保證有效）；.cr-body 補 overflow-x:hidden＋
   word-break＋overscroll-behavior:contain。已在 390px 瀏覽器實測：
   無橫向外溢、簽名區完整可見、全文可捲。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 簽署改滿版');
ok('★ memSignContract 用滿版殼（cr-panel），不再是彈窗',
   /async function memSignContract\(id\)\{[\s\S]{0,1200}host\.id='contract-reader'/.test(src)
   && !/showModal\(`<div class="modal-title">合約簽署<\/div>/.test(src));
ok('★ 簽名區固定底部（cr-signfoot，不會被捲走）',
   /<div class="cr-signfoot">\n\s*<div class="ct-sign-wrap"><canvas class="ct-sign" id="ct-sign"><\/canvas><\/div>/.test(src)
   && /\.cr-signfoot\{flex-shrink:0;padding:10px 14px calc\(12px \+ env\(safe-area-inset-bottom,0px\)\);/.test(src));
ok('★ 全文有跳脫', /\$\{\(c\.body_snapshot\|\|''\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/<\/g,'&lt;'\)\}/.test(src));
ok('★ 簽署成功把滿版殼收掉', /closeContractReader\(\); closeModal\(\); showToast\('合約已完成簽署，謝謝！'\);/.test(src));
ok('　　稍後再簽／✕ 都走 closeContractReader',
   (src.match(/onclick="closeContractReader\(\)">稍後再簽<\/button>/)||[]).length===1);

console.log('\n② 簽名不再拖動畫面');
ok('★ 會員合約簽名板：touchmove preventDefault（passive:false）',
   /cv\.addEventListener\('touchmove',e=>e\.preventDefault\(\),\{passive:false\}\);/.test(src));
ok('★ 自助申辦簽名板（ap-sig）同步補上',
   /canvas\.addEventListener\('touchmove',e=>e\.preventDefault\(\),\{passive:false\}\);\s*\/\/ 同 signPadInit/.test(src));
ok('　　為什麼 touch-action 不夠，寫在程式裡',
   /LINE 內建瀏覽器（LIFF）對 touch-action:none\n\s*的支援不齊全/.test(src));

console.log('\n③ 閱讀器不再超出畫面');
ok('★ .cr-body 關橫向外溢＋長串斷詞＋捲動不外洩',
   /\.cr-body\{flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;word-break:break-word;/.test(src));
ok('　　購買內容表維持自己內捲（不受影響）', /\.ct-fill-view\{overflow-x:auto;/.test(src));
ok('　　病根說明寫在 CSS 旁', /合約字裡的長串\n\s*（網址、序號）在 pre-wrap 下會撐出橫向捲動/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
