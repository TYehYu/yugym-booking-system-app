/* 2026-08-11 電子發票（ezPay）第一階段：Edge Function ezpay-invoice v2＋前端開立/作廢/退回連動。
   上線閘門：INVOICE_LIVE=false（07-08 期字軌由舊系統（連宇）使用中，2026-09-01 切換）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 上線閘門（8 月不得開出真發票）');
ok('★★ INVOICE_LIVE=false，且測試開關只會打測試站（invEnv 跟著 LIVE 走）',
   /const INVOICE_LIVE=false;/.test(src)
   && /function invEnv\(\)\{ return INVOICE_LIVE\?'prod':'test'; \}/.test(src));
ok('★ 入口只給櫃檯／管理員（isDeskLike）＋ flag 或 localStorage 測試開關',
   /function invEnabled\(\)\{ return isDeskLike\(\) && \(INVOICE_LIVE \|\| localStorage\.getItem\('YUGYM_INV_TEST'\)==='1'\); \}/.test(src));
ok('　　為什麼鎖到 9/1，寫在原地', /07-08 期字軌由舊系統（連宇）使用中/.test(src));

console.log('\n② 開立流程');
{
  const F=grabFn('_invIssueDo');
  ok('★★ 四種開立方式各自驗證（手機條碼／捐贈碼／統編＋抬頭／紙本）',
     /\/\^\\\/\[0-9A-Z\+\.\\-\]\{7\}\$\//.test(F) && /捐贈碼須為 3～7 碼數字/.test(F) && /統編須為 8 碼數字/.test(F));
  ok('★ 重開一張時自訂編號加序號（ezPay 同編號會回原發票）',
     /\+\(c\.seq\?\('R'\+c\.seq\):''\)/.test(F));
  ok('★ 開立成功回填 purchases 與票券的發票欄位＋清快取',
     /fresh\.invoice_number=out\.invoice_number; fresh\.invoice_status='issued';/.test(F)
     && /dbCacheClear\(\['invoices','purchases','member_tickets'\]\)/.test(F));
}

console.log('\n③ 作廢與退回連動');
{
  const F=grabFn('_invVoidDo');
  ok('★ 作廢後欄位復原（可重開）', /fresh\.invoice_status='none'; fresh\.invoice_number=null;/.test(F));
  const U=grabFn('_doSaleUndo');
  ok('★★ 30 分鐘整筆退回：已開的發票自動作廢（tk 分支記下被刪的購買紀錄 id）',
     /_undoPurIds\.push\(pp\.id\)/.test(U)
     && /invCall\(\{action:'invalid', invoice_number:v\.invoice_number, reason:'銷售退回'\}\)/.test(U));
  ok('★ 作廢失敗要出聲（不能靜默留一張活發票）',
     /發票 '\+v\.invoice_number\+' 作廢失敗，請至發票紀錄手動作廢/.test(U));
}

console.log('\n④ 入口');
ok('★ 營收列有 🧾 鈕（invEnabled 才畫，事件不冒泡到會員列）',
   /revInvChip\(r\)/.test(src) && /event\.stopPropagation\(\);openInvoiceDialog/.test(src));
ok('★ Edge Function 呼叫帶使用者 JWT（後端驗櫃檯身分）',
   /functions\/v1\/ezpay-invoice/.test(src) && /'Authorization':'Bearer '\+jwt/.test(grabFn('invCall')));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
