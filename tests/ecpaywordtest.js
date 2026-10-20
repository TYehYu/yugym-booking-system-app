/* 發票字軌自動同步（edge function）

   ⚠ 這支測的是**倉庫裡的副本** supabase/functions/ecpay-invoice/index.ts。
     Edge Function 的版本會漂（yugym-edge-deploy-drift）—— 副本綠不代表線上是這一版，
     改完一定要 deploy，deploy 前也要先抓線上的比對。

   2026-10-20 使用者早上收到「字軌建立失敗」的 LINE，但查綠界：
   TrackID 471787（HU 91151200–91151999，115 年 11-12 月）其實 UseStatus=2 已啟用。
   建立成功、啟用那一步綠界回「資料檢查有誤」，程式只信 API 的回覆就發了假警報。 */
const fs=require('fs');
const P=process.env.HOME+'/Projects/yugym-booking-system-app/supabase/functions/ecpay-invoice/index.ts';
const src=fs.readFileSync(P,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 寫完要回查，不要只信 API 的回覆');
ok('★★★ 有回查那一支', /async function wordActive\(roc: string, trackId: string\): Promise<boolean>/.test(src));
/* 假警報：說失敗其實成功 —— 半夜吵醒人在國外的老闆，而且什麼事都沒有 */
ok('★★★ 說失敗 → 回查已啟用就當成功',
   /if \(!ok && await wordActive\(roc, trackId\)\) \{/.test(src)
   && /回查確認已啟用/.test(src));
/* 更糟的方向：說成功其實沒生效 —— 會一路安靜到該期第一天開不出發票 */
ok('★★★ 說成功 → 回查沒啟用就當失敗',
   /if \(ok && step === 'done' && !\(await wordActive\(roc, trackId\)\)\) \{/.test(src)
   && /綠界回成功，但回查仍未啟用/.test(src));
ok('★★ 理由寫在原地（兩個方向都要防）',
   /說失敗其實成功（假警報）、說成功其實沒生效（更糟）/.test(src));

console.log('\n② 建立了卻沒啟用的，不可以靜靜跳過');
/* wordCovered 會把「綠界已經有這一段」整段濾掉 —— 建立成功、啟用失敗的那段
   隔天不會再被碰到：不重試、不通知，等到該期第一天才發現。 */
ok('★★★ 會列出「已建立但 UseStatus≠2」的',
   /const stale = mine\s*\n\s*\.filter\(m => Number\(m\.UseStatus\) !== 2\)/.test(src));
ok('★★★ 只看現在以後的期別（過去那幾期停用是正常的）',
   /function termFloor\(roc: string\): number/.test(src)
   && /\.filter\(m => Number\(m\.InvoiceTerm\) >= floor\)/.test(src));
ok('★★★ 跳過清單（115/5/FS）也要排除，那是刻意停用的',
   /\.filter\(m => !WORD_SKIP\.includes\(`\$\{roc\}\/\$\{Number\(m\.InvoiceTerm\)\}\/\$\{m\.InvoiceHeader\}`\)\)/.test(src));
/* ⚠ 不自動幫它啟用：可能是人刻意停的。列出來讓人決定。 */
ok('★★★ 不自動啟用，只通報（理由寫在原地）',
   /不自動幫它啟用：有可能是人在綠界後台刻意停用的/.test(src));
ok('★★★ LINE 通知會把 stale 講出來',
   /if \(bad\.length \|\| stale\.length\) \{/.test(src)
   && /已建立、但沒有啟用：/.test(src));

console.log('\n③ 「下一期準備好了沒」要看啟用狀態');
/* 舊版只看「那一期有沒有字軌」，建了沒啟用也算 ready —— 正是這次要補的洞 */
ok('★★★ ready 要 UseStatus=2 才算',
   /Number\(m\.InvoiceTerm\) === nx\.term && Number\(m\.UseStatus\) === 2/.test(src));

console.log('\n④ 既有的防線沒有被動到');
ok('★★★ 寫入仍保留 dryRun 那一步', /b\.dryRun \|\| \(b\.data && b\.data\.dryRun\)/.test(src));
ok('★★★ 重號防線還在（同字軌＋同期別＋區間重疊才算已建）',
   /function wordCovered/.test(src) && /Number\(m\.InvoiceStart\) <= ge && gs <= Number\(m\.InvoiceEnd\)/.test(src));
ok('★★★ 115/5/FS 仍在跳過清單（舊系統用掉過，建進去會重號）',
   /const WORD_SKIP = \['115\/5\/FS'\];/.test(src));
ok('★★ prod 沒設金鑰就擋下來（不會拿測試帳號開正式發票）',
   /ENV === 'prod' \? '' : d/.test(src));
ok('★★ 通知只發給在職管理員（櫃檯刻意不收）',
   /\.eq\('role', 'admin'\)\.eq\('status', 'active'\)/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
