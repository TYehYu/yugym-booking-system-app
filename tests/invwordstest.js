/* 字軌自動同步（2026-10-10 使用者：「每兩個月我要上傳號碼　這個有辦法自動化嗎」）

   使用者兩個都要：手動一鍵同步 ＋ 排程自動跑。10/10 先查過財政部配號查得到
   （FS 87754800-87755199、FX 28688350-28688749，都是 9-10 月），
   表示取號時有把字軌授權給綠界，自動化才成立。

   這支測試守三件事：
   ① 寫入一定是兩段式（先 dryRun 列出來，按了確認才寫）—— 字軌是稅務的東西。
   ② 前端不能決定要建哪個字軌（FX 白名單在 edge function 裡）。
   ③ 按鈕要有防重複與還原，不然會卡在「建立中…」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 寫入是兩段式：先列出來給人看過');
ok('★★★ 第一步一定帶 dryRun:true', /invCall\('syncWords',\{dryRun:true\}\)/.test(src));
ok('★★★ 真的寫那一步在另一支函式（不是同一顆按鈕直接寫）',
   /function _doInvWordsSync\(\)\{/.test(src) && /invCall\('syncWords',\{dryRun:false\}\)/.test(src));
ok('★★ 中間有確認視窗，列出每一段號碼', /把這些字軌建進綠界/.test(src)
   && /p\.InvoiceStart/.test(src) && /p\.InvoiceEnd/.test(src));
ok('★★ 確認視窗寫明「建好直接啟用」這個後果', /直接設成啟用/.test(src));

console.log('\n② 要建哪個字軌不由前端決定');
/* 註解裡會寫到 FX，所以先把註解剝掉再斷言（見 yugym-assert-hits-comment 的教訓） */
const code=src.replace(/\/\*[\s\S]*?\*\//g,'');
ok('★★★ 前端沒有把字軌名稱送進 syncWords', !/syncWords',\{[^}]*Header/.test(code));
ok('★★ 畫面上有講「只處理 FX、不動 FS」', /只處理 <b>FX<\/b>/.test(src));

console.log('\n③ 按鈕不會按兩次、也不會卡住');
ok('★★★ 兩支都包 onceAct', /onceAct\('invwsync', _invWordsSync\)/.test(src)
   && /onceAct\('invwsgo', _doInvWordsSync\)/.test(src));
ok('★★★ 失敗時還原按鈕（try/finally）',
   /try\{[\s\S]{0,1200}?invCall\('syncWords',\{dryRun:false\}\)[\s\S]{0,1200}?\}finally\{[\s\S]{0,300}?invws-go/.test(src));
ok('★★ 寫完回頭重查一次，畫面要反映新狀態',
   (src.match(/await _invWordsCheck\(\);/g)||[]).length>=2);

console.log('\n④ 人不在的時候要知道結果（2026-10-10 使用者：「我人在國外會知道嗎」）');
ok('★★ 畫面有寫「會 LINE 通知管理員」', /都會 LINE 通知管理員/.test(src));
/* 真正發訊息的程式在 edge function（ecpay-invoice v14），不在 index.html；
   這支只能守「畫面有沒有講清楚」，實際發送靠 cron body 的 notify:true。 */

console.log('\n⑤ 期別文字只有一份');
ok('★★ invTermLabel 抽成共用，查詢與同步都用它', /function invTermLabel\(n\)\{/.test(src)
   && /const term=invTermLabel;/.test(src) && /invTermLabel\(p\.InvoiceTerm\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
