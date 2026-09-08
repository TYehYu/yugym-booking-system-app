/* 補收款寫不進營收（2026-09-08 使用者：「團課今日營收有問題」）——
   陳若馨／馮映庭兩筆團課體驗，票券標成已付款、帳本寫了「補收款 $600（匯款）」，
   但 purchases 只有建立當下那一筆 deal_amount=0，補收款那一筆**完全沒有**，
   於是今日營收兩筆都顯示 $0，當天少記 $1,200。

   根因：那支把 pay_split 寫成 split_cash（purchases 沒有這一欄），PostgREST 整筆退件；
   dbPutPurchaseSafe 的退件重試只拔 invoice_type／coach_id／pay_split，
   拔完 split_cash 還在 → 第二次照樣失敗 → 收款紀錄整筆消失。
   而失敗的吐司 3 行後又被「已收款・記在今天的營收」蓋掉，櫃檯看到的是成功。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 欄位名');
ok('★★★ 不存在的 split_cash 已經沒有人在寫了', !/split_cash:/.test(src));
ok('★★★ 改用真的那一欄 pay_split，形狀與賣票那條路一致（{cash,transfer}）',
   /pay_split:\(v\.method==='split'\?\{cash:_cash, transfer:_newAmt-_cash\}:null\)/.test(src));
ok('★★ 現金要夾在「這次要補的金額」內（_newAmt 可能小於 v.amt，只補差額）',
   /const _cash=\(v\.method==='split'\)\?Math\.max\(0,Math\.min\(Number\(v\.split\)\|\|0,_newAmt\)\):0;/.test(src));

console.log('\n② 寫不進去就不能說「記在今天的營收」');
ok('★★★ 失敗會立旗標', /catch\(e\)\{ console\.error\('tkPay purchase fail',e\); _purFail=true;/.test(src));
ok('★★★ 收尾的吐司分兩種說法，失敗那句要講「營收那一筆沒寫進去」',
   /showToast\(_purFail/.test(src) && /營收那一筆沒寫進去 —— 請到財務補開一筆/.test(src));
ok('★★ 失敗那句停久一點（9 秒），不要一閃就過', /_purFail\?9000:/.test(src));

console.log('\n③ 下一次再打錯欄位名，也不能整筆不見');
const F=g('async function dbPutPurchaseSafe(','\n}');
const U=g('function dbUnknownColumnOf(','\n}');
const unknownOf=new Function(U+'\nreturn dbUnknownColumnOf;')();
ok('★★★ 認得 PostgREST 的講法',
   unknownOf({message:"Could not find the 'split_cash' column of 'purchases' in the schema cache"})==='split_cash');
ok('★★★ 也認得 Postgres 原生的講法',
   unknownOf({message:'column "split_cash" of relation "purchases" does not exist'})==='split_cash');
ok('★  認不出來就回 null（不要亂拔欄位）',
   unknownOf({message:'duplicate key value violates unique constraint'})===null && unknownOf(null)===null);
ok('★★★ 只拔它指名的那一欄', /const col=dbUnknownColumnOf\(last\);\s*\n\s*if\(!col \|\| !\(col in o2\)\) break;/.test(F));
ok('★★ 有次數上限，不會無限迴圈', /for\(let i=0;i<4;i\+\+\)/.test(F));
ok('★★ 真的救不回來仍然往上拋（呼叫端要出聲，不能默默吞掉）', /\n    throw e;\n  \}\n\}/.test(F));
ok('★  原本的選配欄位退場路徑留著（正式庫還沒套 migration 的情況）',
   /const opt=\['invoice_type','coach_id','pay_split'\]\.filter\(k=>k in o2\);/.test(F));

console.log('\n④ 這件事為什麼嚴重，寫在原地');
ok('★★ 根因與後果寫下來了（少一筆營收，而票券已經標成已付款）',
   /收款紀錄漏一筆＝當天營收少一筆/.test(src)
   && /於是今日營收憑空少 \$1,200（陳若馨／馮映庭）/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
