/* 電子發票（綠界 B2C）—— 2026-09-02
   使用者定案：「串金流不是必要的」「不想用 POS（會變兩套帳）」→ 只串發票。
   「你先把程式預備好　等拿到金鑰就可以上線」→ 預設關著，ECPAY_ENV=prod 才自動開。

   ⚠ 這支測試最重要的一條是最後一段：**金鑰不能出現在 index.html**。
     index.html 是 GitHub Pages 上的公開檔，任何人都能看原始碼。
     金鑰只能放 Supabase secrets，前端一律走 Edge Function。

   ⚠ 第二重要的是 Print／Donation／CarrierType／統編 四者互斥 —— 湊錯一格綠界一律退件，
     而且錯誤訊息只說「參數錯誤」，當場沒有人猜得到是哪一格。
     組合表在 docs/edge/README-ecpay.md，這裡把四條路各釘一次。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const invPayload=new Function(grabFn('invPayload')+'\nreturn invPayload;')();
const invCheckFields=new Function(grabFn('invCheckFields')+'\nreturn invCheckFields;')();

const PUR={id:'PUR-abc', plan_name:'私人教練 12 堂', deal_amount:36000, member_id:'M1'};
const MEM={name:'王小明', phone:'0912-345-678'};

console.log('① 四種開法的互斥組合（湊錯一格綠界一律退件）');
{
  const d=invPayload(PUR, MEM, {mode:'carrier', carrierNum:''});
  eq('★★ 預設＝存綠界載具（CarrierType=1、不列印、不捐贈、無統編）',
     [d.CarrierType,d.CarrierNum,d.Print,d.Donation,d.CustomerIdentifier], ['1','','0','0','']);
  /* 2026-09-02 實測：綠界載具只要有手機就能開，沒有 email 也過 ——
     這條很關鍵，489 位會員只有 14 位留了 email。 */
  eq('★★ 手機帶進去（載具沒有 email 也能開，靠這個通知中獎）', d.CustomerPhone, '0912345678');
  eq('　　金額與品項', [d.SalesAmount,d.Items.length,d.Items[0].ItemAmount], [36000,1,36000]);
  eq('　　RelateNumber＝purchase id（查詢 GetIssue 只認這個，不認發票號碼）', d.RelateNumber, 'PUR-abc');
}
{
  const d=invPayload(PUR, MEM, {mode:'carrier', carrierNum:'/ABC1234'});
  eq('★★ 手機條碼 → CarrierType=3＋條碼，不列印不捐贈',
     [d.CarrierType,d.CarrierNum,d.Print,d.Donation], ['3','/ABC1234','0','0']);
}
{
  const d=invPayload(PUR, MEM, {mode:'ubn', ubn:'53538851', title:'雨果健身有限公司', email:'a@b.c'});
  eq('★★ 統編 → 帶統編＋抬頭蓋掉姓名，不捐贈',
     [d.CustomerIdentifier,d.CustomerName,d.Donation], ['53538851','雨果健身有限公司','0']);
  ok('★★ 統編也走載具、不列印紙本（紙本要自己印自己寄）', d.CarrierType==='1' && d.Print==='0');
  eq('　　email 帶進去（證明聯寄這裡）', d.CustomerEmail, 'a@b.c');
}
{
  const d=invPayload(PUR, MEM, {mode:'donate', loveCode:'168001'});
  eq('★★ 捐贈 → Donation=1＋愛心碼，不列印、不存載具、不帶統編',
     [d.Donation,d.LoveCode,d.Print,d.CarrierType,d.CustomerIdentifier], ['1','168001','0','','']);
}
{
  const d=invPayload(PUR, MEM, {mode:'print', name:'王小明', addr:'台北市…'});
  eq('★★ 紙本 → Print=1＋地址，不存載具不捐贈',
     [d.Print,d.CustomerAddr,d.CarrierType,d.Donation], ['1','台北市…','','0']);
}
eq('　　沒選任何一格（f=null）也走綠界載具，不會組出空參數',
   [invPayload(PUR,MEM,null).CarrierType, invPayload(PUR,MEM,null).Print], ['1','0']);

console.log('\n② 開立前先擋掉一定會被退的（綠界只回「參數錯誤」，當場猜不到）');
eq('★★ 統編要 8 碼', invCheckFields({mode:'ubn',ubn:'123',title:'x'}), '統一編號要 8 碼數字');
eq('★★ 打統編一定要抬頭', invCheckFields({mode:'ubn',ubn:'53538851',title:' '}), '打統編要填公司抬頭');
eq('★★ 愛心碼 3–7 碼', invCheckFields({mode:'donate',loveCode:'12'}), '愛心碼要 3–7 碼數字');
eq('★★ 手機條碼是 / 加 7 碼', invCheckFields({mode:'carrier',carrierNum:'ABC1234'}),
   '手機條碼格式是 / 加 7 碼（例如 /ABC1234）');
eq('　　手機條碼留空是合法的（＝存綠界載具）', invCheckFields({mode:'carrier',carrierNum:''}), '');
eq('★ 紙本沒地址寄不出去', invCheckFields({mode:'print',addr:''}), '紙本發票要填地址');
eq('　　沒開發票（null）不擋', invCheckFields(null), '');
eq('　　正確的四組都放行',
   [{mode:'carrier',carrierNum:'/ABC1234'},{mode:'ubn',ubn:'53538851',title:'雨果'},
    {mode:'donate',loveCode:'168001'},{mode:'print',addr:'台北市'}].map(invCheckFields),
   ['','','','']);

console.log('\n③ 什麼時候才開');
{
  const F=grabFn('invSync');
  ok('★★ 只有「已付款」才畫發票欄（沒收到錢不能開發票）',
     /const paid=\(\(document\.getElementById\('gt-pay'\)\|\|\{\}\)\.value\|\|''\)==='paid';/.test(F)
     && /w\.style\.display=\(paid&&cfg\.on\)\?'':'none';/.test(F));
  const G=grabFn('invIssueForPurchase');
  ok('★★ $0 不開發票（未付款發放、抽獎票、全額折抵）',
     /if\(amt<=0\) return null;/.test(G));
  ok('★★ 服務沒開就整條跳過（金鑰還沒下來的今天就是這條）',
     /const cfg=await invCfg\(\);\s*\n\s*if\(!cfg\.on\) return null;/.test(G));
}
{
  const F=grabFn('invCfg');
  ok('★★ ECPAY_ENV=prod 才自動開；還在測試環境要手動掛 einvoice_test 才看得到',
     /const test=\(d\.env!=='prod'\);/.test(F)
     && /const opened=!test \|\| \(typeof localStorage!=='undefined' && localStorage\.getItem\('einvoice_test'\)==='1'\);/.test(F));
  ok('★★ 測試模式一定要在畫面上講明（不然櫃檯會以為真的開了發票）',
     /測試模式・不會送財政部/.test(src) && /\.inv-test\{/.test(src));
  ok('　　ping 失敗＝不開，不會半路擋住銷售', /catch\(_\)\{ return \{on:false, why:'發票服務連不上'\}; \}/.test(F));
}

console.log('\n④ 開不成不能擋住銷售（票券已經發出去了）');
{
  const G=grabFn('invIssueForPurchase');
  ok('★★ 失敗照樣寫進 invoices（status=failed）留著重試',
     /row\.status = r&&r\.ok \? 'issued' : 'failed';/.test(G)
     && /await dbPut\('invoices', row\);/.test(G));
  ok('★★ 成功才把發票號碼寫回 purchases', /invoice_type:'ecpay', invoice_number:rd\.InvoiceNo/.test(G));
  ok('★ 失敗只用 toast 告知，不 throw', /showToast\('⚠ 發票開立失敗：'/.test(G) && !/throw /.test(G));
  ok('★★ 呼叫端也包 try（發票爆掉不能讓票券發放整條中斷）',
     /try\{ await invIssueForPurchase\(_purRow, await dbGet\('members',P\.member_id\)\.catch\(\(\)=>null\), P\.inv,[\s\S]{0,120}?\}catch\(e\)\{ console\.error\('invoice fail', e\); \}/.test(src));
}

console.log('\n⑤ 作廢票券連動');
{
  const F=grabFn('_voidTicketDo');
  ok('★★ 轉儲值金不動發票（營收保留、稅照繳，發票也該留著）',
     /if\(mode!=='credit'\)\{/.test(F));
  ok('★★ 退款要作廢發票（不作廢的話稅就白繳了）',
     /await invVoidForPurchase\(pc\.id, \('作廢・'\+MODE_LB\[mode\]/.test(F));
  ok('★★ 扣手續費：原發票作廢後，手續費那一段另開一張（金額變了不能只改）',
     /if\(mode==='refund_fee' && _keep>0\)\{[\s\S]{0,240}?relSuffix:'-F', category:'fee'/.test(F));
  ok('★ 作廢後清 invoices 快取', /dbCacheClear\(\['member_tickets','ticket_logs','purchases','invoices'\]\)/.test(F));
  const V=grabFn('invVoidForPurchase');
  ok('★★ 只作廢真的開出去的那張（issued＋有號碼），同一筆多張取最新',
     /x\.status==='issued'&&x\.invoice_number/.test(V)
     && /sort\(\(a,b\)=>String\(b\.created_at\|\|''\)\.localeCompare\(String\(a\.created_at\|\|''\)\)\)\[0\]/.test(V));
}

console.log('\n⑥ ★★★ 金鑰不能出現在前端（index.html 是公開檔，任何人都看得到原始碼）');
{
  ok('★★★ 沒有商店代號', !/3513145/.test(src));
  /* 註解裡寫「前端看不到 HashKey」是可以的；不能有的是**賦值** */
  ok('★★★ 沒有任何地方把 HashKey／HashIV 指派成值',
     !/(ECPAY_HASHKEY|ECPAY_HASHIV|HashKey|HashIV)\s*[:=]/.test(src));
  ok('★★★ 沒有 AES 加密（加密只能在 Edge Function 裡做，做在前端等於把金鑰給出去）',
     !/AES-CBC|crypto\.subtle\.encrypt/.test(src));
  ok('★★★ 沒有直接打綠界的網址（一定要繞 Edge Function）',
     !/einvoice\.ecpay\.com\.tw|ecpay\.com\.tw/.test(src));
  ok('★★ 一切都走 Edge Function ecpay-invoice',
     /sb\.functions\.invoke\('ecpay-invoice'/.test(src));
  ok('　　只有這兩個地方在呼叫（ping 與 invCall），沒有第三條路',
     (src.match(/sb\.functions\.invoke\('ecpay-invoice'/g)||[]).length===2);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
