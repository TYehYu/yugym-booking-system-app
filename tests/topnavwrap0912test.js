/* 桌機頂列的標籤不准折行（2026-09-12 使用者附截圖：「mac上面標題列被段落了」）
   症狀：「首頁總覽」被折成「首頁總／覽」，預約管理／會員管理／月報表／訓練方案／班表全部兩行。
   成因：頂列是 flex、中央膠囊 flex:0 1 auto＋min-width:0，項目一多就被壓縮，
         而 .mc-nav-item／.mc-ni-label 從頭到尾沒有 white-space 規則。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 永不折行');
ok('★★★ 導覽項目 white-space:nowrap', /body\.mc-mode \.mc-nav-item\{white-space:nowrap;\}/.test(src));
ok('★★ 成因與使用者原話寫在原地', /mac上面標題列被段落了/.test(src) && /flex:0 1 auto＋min-width:0/.test(src));

console.log('\n② 真的塞不下時可以橫向滑，不破版');
ok('★★★ 膠囊可橫滑', /body\.mc-mode \.mc-nav\{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;\}/.test(src));
ok('★★ 捲軸不露出來（頂列只有 60px 高，露捲軸會很醜）', /body\.mc-mode \.mc-nav::-webkit-scrollbar\{display:none;\}/.test(src));

console.log('\n③ 兩階縮字（1440／1280）');
ok('★★★ 1440 縮一階', /@media\(max-width:1440px\)\{\s*\n\s*body\.mc-mode \.mc-nav-item,body\.ink\.mc-mode \.mc-nav-item\{padding-left:11px;padding-right:11px;font-size:13px;\}/.test(src));
ok('★★★ 1280 再縮一階，圖示跟著小', /@media\(max-width:1280px\)\{[\s\S]{0,240}font-size:12\.5px;gap:6px;\}[\s\S]{0,160}\.mc-ni-ic svg\{width:15px;height:15px;\}/.test(src));
ok('★★★ Ink 主題也吃得到（它的選擇器權重比較高，只寫 body.mc-mode 會被蓋掉）',
   (src.match(/body\.ink\.mc-mode \.mc-nav-item\{padding-left:/g)||[]).length===2);
ok('★★ 只縮左右內距，上下不動（Ink 的目前頁是底線，改上下底線會跳）',
   !/body\.ink\.mc-mode \.mc-nav-item\{padding:\d/.test(src.split('@media(max-width:1440px)')[1]||'')
   && /只縮左右內距/.test(src) || /左右內距才縮，上下不動/.test(src));

console.log('\n④ 沒有動到既有的兩條主題規則（adminnavtest／inkthemetest 釘著）');
ok('★★ 綠底版 active 膠囊還在', /body\.mc-mode \.mc-nav-item\.active\{background:#F4F1E8;color:var\(--green\);/.test(src));
ok('★★ Ink 版 active 底線還在', /body\.ink\.mc-mode \.mc-nav-item\.active\{background:transparent;color:#fff;/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
