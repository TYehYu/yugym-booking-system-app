/* 分期繳費也能用折抵券＋折抵券不能折過頭（2026-10-12 使用者兩則）
     「這個分期視窗 如果有折抵券可以使用嗎」→「要補上」
     「如果今天會員有多張折抵券 可是自訂方案如果只開一堂課 是不是會把該堂課都折抵掉呢」

   ① 在此之前只有第 1 期（建票當下）問得到券，第 2、3 期用不到。
   ② 張數原本只夾「持有量」與「每次上限（教練課 3 張／分期 1 張）」，**沒有夾金額**：
      一堂 $600 的自訂方案填 3 張 → 實收 $0、第 3 張白燒。
      （儲值金那邊本來就有夾 paidAmount，折抵券漏了。） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');


// 收款、開通與折抵券已移至同一個資料庫交易；42 項 SQL 行為案例另驗。
const collectSql=fs.readFileSync(require('path').join(__dirname,'../docs/purchase-hardening/candidate.sql'),'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 分期視窗有折抵券欄位');
ok('★★★ 視窗畫得出來（會員有券才顯示）',
   /<div id="inx-voucher-wrap" class="gt-voucher-hi"/.test(src)
   && /async function inxVoucherInit\(t\)\{/.test(src));
ok('★★★ 判準與銷售那條路同一支（看票種類別 VOUCHER_TT，不是方案名稱）',
   /vt=tt\?VOUCHER_TT\[tt\.category\]:null;[\s\S]{0,400}?if\(!vt\) return;/.test(src));
ok('★★★ 張數上限＝這一期開通的堂數 ÷ 4（2026-10-12 定版，見 vouchercaptest）',
   /const byS=voucherCapOf\(window\._inxVoucherTt, n\);/.test(src)
   && /每 4 堂 1 張/.test(src));
ok('★★ 預設 0 張（第 2、3 期不一定要在這期用掉）',
   /<input type="number" id="inx-voucher" min="0" value="0"[^>]*oninput="inxVoucherSync\(\)">/.test(src));
ok('★★ 最快到期的先用（與銷售那條路一致）',
   /tks\.sort\(\(a,b\)=>String\(a\.expire_date\|\|'9999-12-31'\)/.test(src));

console.log('\n② 勾了就同步實收金額，不要讓櫃檯自己減');
ok('★★★ 只加減「差額」（dataset 記住已折幾張，連點不會重複扣）',
   /const was=Number\(amt\.dataset\.vch\)\|\|0;/.test(src)
   && /if\(want!==was\)\{ amt\.value=Math\.max\(0,\(Number\(amt\.value\)\|\|0\)\+300\*\(was-want\)\); amt\.dataset\.vch=String\(want\); \}/.test(src));
ok('★★★ 快速鍵（下一期／剩餘全繳）填原價時要把張數與記號一起歸零',
   /if\(b\)\{ b\.value=amt; b\.dataset\.vch='0'; \}/.test(src)
   && /const v=document\.getElementById\('inx-voucher'\); if\(v\) v\.value=0;/.test(src));

console.log('\n③ 真的扣下去，而且留得下痕跡');
ok('★★★ 逐張重讀再扣（開窗到確認之間可能被別筆用掉）',
   collectSql.includes('order by id for update') && collectSql.includes("VOUCHER.BALANCE_CHANGED"));
ok('★★★ 扣餘額、歸零轉 used_up、帳本逐張記 deduct',
   collectSql.includes('sessions_remaining=sessions_remaining-take') && collectSql.includes("then 'used_up'") && collectSql.includes("v.id,'deduct',1"));
ok('★★★ 購買紀錄的 note 格式要與銷售那條路一字不差（票券卡靠它解析折抵券標籤）',
   collectSql.includes("'（折抵券×'||vouchers||' −$'") && src.includes('折抵券×(\\d+)\\s*−\\$([\\d,]+)'));
ok('★★ list_price 帶原價，卡片才寫得出「原價多少」',
   collectSql.includes('amount+vouchers*300,amount'));
ok('★★ 扣券失敗不吞掉（票已經開通了，要講清楚）',
   collectSql.includes("raise exception 'VOUCHER.BALANCE_CHANGED'") && src.includes("'VOUCHER.BALANCE_CHANGED':'折抵券餘額已變更，本次未收款"));
console.log('\n④ 不能折過頭（使用者問的那件事）');
ok('★★★ 銷售那條路夾「這一筆吸收得了幾張」',
   /const _vByAmt = Math\.max\(0, Math\.floor\(_vBase\/300\)\);/.test(src)
   && /const voucherN = Math\.min\(_vWant, _vByAmt\);/.test(src));
ok('★★★ 分期看第 1 期的金額，不是總額',
   /const _vBase = isInstall \? \(Number\(amts\[0\]\)\|\|0\) : dealAmount;/.test(src));
ok('★★★ 另一條收款路徑也夾堂數與金額（不然繞過去還是會折過頭）',
   /const _vBase2 = isInstall \? \(Number\(amts\[0\]\)\|\|0\) : amount;/.test(src)
   && /const _vN  = Math\.min\(_vN0, _vCap2, Math\.max\(0, Math\.floor\(_vBase2\/300\)\)\);/.test(src));
ok('★★★ 分期視窗：堂數不到 4 堂或錢不夠就填不進去（超填會被夾回去並說明）',
   /if\(want>cap\)\{ want=cap;/.test(src)
   && /這一期最多折 \$\{cap\} 張（每 4 堂 1 張）/.test(src)
   && /這一期的堂數不到 4 堂，折抵券留著下次用/.test(src));
/* 2026-10-12 二修：籤上只留「最多 N 張」，原因進 title（見 vouchercaptest）。 */
ok('★★ 被夾掉要說一聲（不然櫃檯以為折了 3 張）',
   /這一筆只吸收得了 \$\{voucherN\} 張折抵券/.test(src));

/* 算一次給人看：使用者舉的例子 —— 一堂 $1,000 的自訂方案、會員有 3 張券 */
const cap=(amt,held,max)=>Math.min(Math.min(held,max), Math.max(0,Math.floor(amt/300)));
console.log('\n⑤ 算式本身');
eq('★★★ $1,000 一堂、持有 3 張、上限 3 → 只折 3 張 $900，實收 $100', cap(1000,3,3), 3);
eq('★★★ $600 一堂、持有 3 張 → 只折 2 張（原本會折 3 張、實收 0、燒掉一張）', cap(600,3,3), 2);
eq('★★★ $250 一堂 → 一張都不折', cap(250,3,3), 0);
eq('★★ 分期第 1 期 $6,400、上限 1 張 → 1 張', cap(6400,3,1), 1);
/* 堂數那一層在 vouchercaptest 裡逐格驗（12→3、8→2、4→1、1→0） */

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
