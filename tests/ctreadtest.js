/* 2026-08-08 使用者指示：
     ①「合約的內容，主要購買的產品這邊都用白底顯示，方便閱讀，條款就一般顯示」
     ②「合約幫我檢查，各平台閱讀是否直覺」

   盤點合約會出現的四個地方，發現的不只是底色：
     A 櫃檯簽約步驟（賣票流程第 4 步）—— 只有條款純文字，**購買內容表根本沒放**，
       客人要簽名了卻看不到自己買幾堂、多少錢、分幾期（那張表只在上一步輸入時出現過）。
     B 會員手機簽署 —— 只有一行「方案・N 堂・$X」，分期表／每堂費用／有效期限／
       付款方式全看不到，等於在看不到標的的情況下簽字。
     C 合約檢視（簽完之後，後台與會員共用）—— 已經有白底的購買內容表，正確。
     D 系統版合約全文（註冊時閱讀）—— 只有條款，本來就沒有購買內容。

   修法：A、B 都補上與 C 同一份購買內容表（.ct-fill-view，白底），條款維持一般顯示。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 購買內容一律白底、條款維持一般顯示');
ok('★ .ct-fill-view 是白底獨立卡片', /\.ct-fill-view\{overflow-x:auto;[^}]*background:#fff;border:1px solid var\(--bd\);/.test(src));
ok('★ 條款區維持原本的底色（沒有被一起改白）',
   /\.ct-body\{white-space:pre-wrap;[^}]*background:var\(--card2\);/.test(src));
ok('　　滿版閱讀器裡的購買內容表回到一般排版（cr-body 是 pre-wrap）',
   /#contract-reader \.ct-fill-view\{white-space:normal;margin-bottom:14px;\}/.test(src));

console.log('\n② A 櫃檯簽約步驟：條款上方補上購買內容表');
ok('★★ 步驟 4 有白底的購買內容容器，且在條款之前',
   /<div class="ct-fill-view" id="ct-fill-preview" style="display:none;"><\/div>\n\s*<div class="ct-body" id="ct-body">/.test(src));
ok('★ 用與檢視／列印同一支 contractFillBlockHTML（不另做一份版型）',
   /fbox\.innerHTML=contractFillBlockHTML\(window\._ctFill\); fbox\.style\.display='';/.test(src));
ok('★ 產不出來就整塊藏起來（不留一個空白框）',
   /catch\(_\)\{ fbox\.style\.display='none'; \}/.test(src));
ok('　　為什麼要補，寫在原地', /客人要簽名了，畫面上卻看不到自己買了幾堂、多少錢、/.test(src));

console.log('\n③ B 會員手機簽署：同一份購買內容表');
{
  const i=src.indexOf('async function memSignContract(id)');
  const box=src.slice(i, i+2600);
  ok('★★ 有 fill_snapshot 就顯示白底購買內容表',
     /\$\{c\.fill_snapshot\n\s*\? `<div class="ct-fill-view">\$\{c\.fill_snapshot\}<\/div>`/.test(box));
  ok('★ 舊合約沒有快照時退回原本那一行摘要（不會變空白）',
     /: `<div style="white-space:normal;font-size:12\.5px;color:var\(--t2\);margin-bottom:10px;">\$\{c\.plan_name\|\|''\}/.test(box));
  ok('★ 條款仍接在後面（同一個捲動區）',
     /\}\$\{\(c\.body_snapshot\|\|''\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/<\/g,'&lt;'\)\}<\/div>/.test(box));
  ok('　　簽名區仍固定在底部、不會被捲走', /<div class="cr-signfoot">/.test(box));
}

console.log('\n④ 快照在簽名之前就存好了（B 才拿得到）');
ok('★ 建立合約當下就寫 fill_snapshot（含待簽名的遠端合約）',
   /fill_snapshot:\(window\._ctFill\?contractFillBlockHTML\(window\._ctFill\):null\),/.test(src));
ok('　　遠端簽約時 signed_at 先留空，快照照樣存', /signed_at:_remote\?null:new Date\(\)\.toISOString\(\)/.test(src));

console.log('\n⑤ C／D 沒被動到');
ok('　　合約檢視仍用 .ct-fill-view 包快照', /const fill=c\.fill_snapshot\?`<div class="ct-fill-view">\$\{c\.fill_snapshot\}<\/div>`:'';/.test(src));
ok('　　列印版仍直接輸出快照', /\$\{c\.fill_snapshot\|\|''\}/.test(src));
ok('　　紙本預覽本來就是白底', /id="ct-paper-preview"[^>]*background:#fff;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
