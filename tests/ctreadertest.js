/* 2026-08-03 使用者：「會員手機端的合約，因為頁面的關係沒辦法一次閱讀，
   可以在手機端有個調整嗎」

   已簽合約的檢視原本是彈窗裡一個 32vh 的小框自己捲 —— 手機上等於在兩層捲軸裡
   讀合約，讀到一半經常抓錯捲軸。改成手機端直接開滿版閱讀器（大字、一路捲到底），
   桌機維持彈窗、另給「放大閱讀」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 滿版閱讀器共用殼');
ok('★ 有 openContractReaderWith（自訂標題與內容）',
   /function openContractReaderWith\(title, bodyHtml, footLabel, extraBtnHtml\)\{/.test(src));   // 2026-08-04 底部可多放列印鈕
ok('★ 簽約前的範本閱讀改走同一個殼（行為不變）',
   /function openContractReader\(\)\{\n\s*openContractReaderWith\(`會員服務合約　\$\{CONTRACT_VERSION\}`, CONTRACT_TEXT, '我讀完了'\);\n\}/.test(src));
ok('　　滿版樣式本來就有（inset:0、大字 15px、touch 捲動；0803 加防外溢）',
   /\.cr-panel\{position:absolute;inset:0;display:flex;flex-direction:column;/.test(src)
   && /\.cr-body\{flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;word-break:break-word;-webkit-overflow-scrolling:touch;padding:20px 18px;font-size:15px;/.test(src));

console.log('\n② 已簽合約：手機桌機都直接滿版（2026-08-04 使用者指示：不要被限制在視窗裡）');
ok('★ 一律直接開放大閱讀器（桌機彈窗與「放大閱讀」鈕退場）',
   /openContractReaderWith\(c\.plan_name\|\|'合約',\n\s*`\$\{meta\}\$\{fill\}\$\{body\}/.test(src)
   && !/openContractView_reader/.test(src));
ok('★ 內容含購買內容表、全文與簽名影像',
   /const fill=c\.fill_snapshot\?`<div class="ct-fill-view">\$\{c\.fill_snapshot\}<\/div>`:'';/.test(src)
   && /const sig=c\.signature\?/.test(src));
ok('★ 全文有跳脫（合約字裡有 < 不會壞版）',
   /const body=String\(c\.body_snapshot\|\|''\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/<\/g,'&lt;'\);/.test(src));
ok('★ 桌機閱讀器放大到 960px（分期五欄表放得下）',
   /width:min\(960px,calc\(100vw - 32px\)\)/.test(src));

console.log('\n③ 閱讀器內的排版');
ok('★ 購買內容表回一般排版（cr-body 是 pre-wrap，表格會被撐爆）',
   /#contract-reader \.ct-fill-view\{white-space:normal;margin-bottom:14px;\}/.test(src));
ok('★ 簽名影像限寬（不會滿版糊掉）',
   /#contract-reader \.ct-sig-img\{max-width:min\(320px,80%\);/.test(src));
ok('　　列印／PDF 仍限後台（閱讀器底部、會員端唯讀）',
   /isDeskLike\(\)\?`<button class="btn btn-green" style="flex:1;padding:14px;font-size:15px;" onclick="ctViewPrint\('\$\{c\.id\}'\)">下載 PDF \/ 列印<\/button>`:null/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
