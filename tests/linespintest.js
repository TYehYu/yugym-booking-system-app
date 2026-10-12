/* 會員卡在登入頁轉圈圈（2026-10-12 使用者回報：「有會員反應無法登入 卡在登入頁面轉圈圈」）

   查下來不是資料庫也不是 edge function（都量過：fn_table_sigs 263ms、
   會員身分讀 bookings 69ms、line-member-auth 0.2 秒回應）。
   成因是**一個空 catch**：

     liff.login() 會離開頁面再導回來，回來之後由開機流程自動續跑 lineExchange。
     lineExchange 一進去就把按鈕設成「處理中，請稍候…」，
     中途丟出例外時被 `catch(_){ }` 整個吃掉 → 按鈕永遠轉圈圈、
     沒有錯誤訊息、也按不下去，看起來就是當機。
     而這條路是自動跑的，客人根本沒按過任何東西。

   同一個教訓已經記在「空 catch 會偽裝成沒資料」：讀失敗要留痕跡，不能靜靜吞掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 導回後自動續跑那一段 */
const RESUME=src.slice(src.indexOf('// LINE 登入導向返回後自動續跑'),
                       src.indexOf('// LIFF 預熱（2026-07-27 提速）'));

console.log('① 導回後自動續跑：不能再吞例外');
ok('★★★ 空 catch 已經消失', !/\}catch\(_\)\{ \}/.test(RESUME));
ok('★★★ 失敗時把按鈕放回去（這就是轉圈圈的解法）',
   /setLineBtnBusy\(false\)/.test(RESUME));
ok('★★★ 失敗時把原因寫在畫面上，而且告訴客人下一步',
   /LINE 登入沒有完成/.test(RESUME) && /請再按一次「使用 LINE 登入」/.test(RESUME));
ok('★★ 留一筆 console（查的時候要找得到）', /console\.error\('LINE 登入續跑失敗'/.test(RESUME));
ok('★★ 錯誤訊息有跳脫（訊息可能帶 < >）', /\.replace\(\/<\/g,'&lt;'\)/.test(RESUME));

console.log('\n② lineExchange 自己也保證轉圈圈一定會停');
ok('★★★ 包一層：本體搬到 _lineExchange，外層負責收尾',
   /async function lineExchange\(\)\{\s*\n\s*try\{ return await _lineExchange\(\); \}/.test(src)
   && /async function _lineExchange\(\)\{/.test(src));
ok('★★★ 兩個呼叫端都不必各自接（成因就是其中一個沒接好）',
   /catch\(e\)\{\s*\n\s*console\.error\('LINE 登入失敗', e\);\s*\n\s*try\{ setLineBtnBusy\(false\); \}catch\(_\)\{\}/.test(src));

console.log('\n③ 原本就對的別改壞');
ok('★★ 成功時不用手動關閉忙碌狀態（直接進 App，整頁換掉）',
   /enterApp\(\); return;\s*\n\s*\}\s*\n\s*showLineRegisterPage/.test(src));
ok('★★ 按下按鈕那條路的 try/catch 還在', /\}catch\(e\)\{ showErr\('LINE 登入失敗：'\+\(e\.message\|\|e\)\); setLineBtnBusy\(false\); \}/.test(src));
ok('★★ 忙碌狀態的實作沒動（按鈕文案與還原機制）',
   /if\(btn\.dataset\.orig\) btn\.innerHTML=btn\.dataset\.orig;/.test(src)
   && /處理中，請稍候…/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
