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
/* 2026-09-14 使用者定案：「還是可以請客人填寫 email　發票除了用雲端條碼之外的都統一存放去 email」
   「然後中獎通知　去超商列印」——
   email 是**通知管道**不是開立條件：四種開法都吃，櫃檯當場填的優先、沒填就回退到會員資料。 */
{
  const d=invPayload(PUR, MEM, {mode:'carrier', carrierNum:'', email:'guest@mail.com'});
  eq('★★★ 沒有手機條碼的客人 → 綠界載具＋email（開立與中獎都靠這封信）',
     [d.CarrierType,d.CustomerEmail,d.Print,d.Donation], ['1','guest@mail.com','0','0']);
}
{
  const MEM2={name:'王小明', phone:'0912-345-678', email:'old@mail.com'};
  eq('★★★ 櫃檯沒填就回退到會員資料裡的 email', invPayload(PUR,MEM2,{mode:'carrier',carrierNum:''}).CustomerEmail, 'old@mail.com');
  eq('★★ 櫃檯填了就以櫃檯為準（客人當場改用別的信箱）',
     invPayload(PUR,MEM2,{mode:'carrier',carrierNum:'',email:'new@mail.com'}).CustomerEmail, 'new@mail.com');
  eq('★★ 手機條碼那條也照樣帶（多一個通知管道不會壞事）',
     invPayload(PUR,MEM2,{mode:'carrier',carrierNum:'/ABC1234'}).CustomerEmail, 'old@mail.com');
  /* ⚠ 這條是 0914 真的改掉的 bug：ubn 分支原本有一行 d.CustomerEmail=f.email||''，
     櫃檯沒填時會把會員既有的 email 蓋成空字串 —— 打統編的客人反而收不到證明聯。 */
  eq('★★★ 統編沒填 email 也要回退到會員資料（不能被蓋成空字串）',
     invPayload(PUR,MEM2,{mode:'ubn',ubn:'53538851',title:'雨果'}).CustomerEmail, 'old@mail.com');
}
eq('　　兩格都空一樣開得成（綠界載具只要有手機就夠，只是客人收不到通知）',
   [invPayload(PUR,MEM,{mode:'carrier',carrierNum:''}).CarrierType,
    invPayload(PUR,MEM,{mode:'carrier',carrierNum:''}).CustomerEmail], ['1','']);
{
  const d=invPayload(PUR, MEM, {mode:'carrier', carrierNum:'/ABC1234'});
  eq('★★ 手機條碼 → CarrierType=3＋條碼，不列印不捐贈',
     [d.CarrierType,d.CarrierNum,d.Print,d.Donation], ['3','/ABC1234','0','0']);
}
{
  const d=invPayload(PUR, MEM, {mode:'ubn', ubn:'53538851', title:'雨果健身有限公司', email:'a@b.c'});
  eq('★★ 統編 → 帶統編＋抬頭蓋掉姓名，不捐贈',
     [d.CustomerIdentifier,d.CustomerName,d.Donation], ['53538851','雨果健身有限公司','0']);
  /* ⚠ 2026-09-15：抬頭沒填就送空字串，**不可**沿用會員個人姓名 ——
     綠界文件說「統一編號有值時，應帶入對應的營業人名稱」，
     拿個人姓名頂替會開出「統編是公司、名稱是個人」的發票，比留空更糟。 */
  eq('★★★ 抬頭沒填 → CustomerName 留空，不拿個人姓名頂替',
     invPayload(PUR, MEM, {mode:'ubn', ubn:'53538851'}).CustomerName, '');
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
/* ⚠ 2026-09-15 規則改了（使用者：「為什麼我用蝦皮購物的時候　只要輸入統編
   並沒有輸入公司抬頭」）——
   查綠界 B2C Issue 官方文件：CustomerName **只在 Print=1（列印紙本）時必填**，
   CustomerIdentifier 本身是選填。我們的統編模式走 Print=0＋綠界載具，
   綠界根本不要求抬頭 —— 原本強制填是我們比綠界還嚴，白擋櫃檯。
   蝦皮只問統編是完全合規的做法。 */
eq('★★★ 打統編**不**強制抬頭（綠界只有列印紙本才要求）',
   invCheckFields({mode:'ubn',ubn:'53538851',title:' '}), '');
eq('　　統編格式錯還是要擋', invCheckFields({mode:'ubn',ubn:'123',title:''}), '統一編號要 8 碼數字');
eq('★★ 愛心碼 3–7 碼', invCheckFields({mode:'donate',loveCode:'12'}), '愛心碼要 3–7 碼數字');
eq('★★ 手機條碼是 / 加 7 碼', invCheckFields({mode:'carrier',carrierNum:'ABC1234'}),
   '手機條碼格式是 / 加 7 碼（例如 /ABC1234）');
/* ⚠ 2026-09-14 規則改了：原本「手機條碼留空是合法的」——因為綠界載具只要有手機就開得成。
   但那樣開出來的發票**沒有任何通知管道**，客人根本不知道自己有發票（0914 誤開的
   FX28688351 就是這個缺口）。使用者定案：「點開發票要有 email 或載具或統編」。 */
eq('★★★ 兩格都空要擋（開發票一定要有通知管道）',
   invCheckFields({mode:'carrier',carrierNum:''}), '開發票要填 Email 或手機條碼（擇一）');
eq('★★ 有手機條碼就放行', invCheckFields({mode:'carrier',carrierNum:'/ABC1234'}), '');
eq('★★ 只有 Email 也放行', invCheckFields({mode:'carrier',carrierNum:'',email:'a@b.co'}), '');
eq('★ 紙本沒地址寄不出去', invCheckFields({mode:'print',addr:''}), '紙本發票要填地址');
eq('　　沒開發票（null）不擋', invCheckFields(null), '');
/* 2026-09-14：email 有填才驗 —— 沒填不是錯誤（載具只要有手機就夠），
   填了格式錯卻一定被綠界退件，當場擋下來比較好。 */
eq('★★ email 格式錯要擋', invCheckFields({mode:'carrier',carrierNum:'',email:'abc'}), 'Email 格式不對');
eq('　　email 沒填不是「格式錯」（有條碼就放行）', invCheckFields({mode:'carrier',carrierNum:'/ABC1234',email:''}), '');
/* 2026-09-14 使用者定案：「櫃檯收款的時候要有開發票或不開發票的選項」 */
eq('★★★ 選了不開發票就整條跳過驗證', invCheckFields({mode:'none'}), '');
eq('　　正常 email 放行', invCheckFields({mode:'carrier',carrierNum:'',email:'a@b.co'}), '');
eq('　　統編那格的 email 也驗', invCheckFields({mode:'ubn',ubn:'53538851',title:'雨果',email:'x@y'}), 'Email 格式不對');
eq('　　正確的四組都放行',
   [{mode:'carrier',carrierNum:'/ABC1234'},{mode:'ubn',ubn:'53538851',title:'雨果'},
    {mode:'donate',loveCode:'168001'},{mode:'print',addr:'台北市'}].map(invCheckFields),
   ['','','','']);

console.log('\n③ 什麼時候才開');
{
  const F=grabFn('invSync');
  /* ⚠ 2026-09-14 二修：顯示條件從 `paid && cfg.on` 改成只看 `paid`。
     原因：發票服務關著（stage）時整塊不出現，櫃檯連 Email／載具都沒地方填 ——
     而使用者要櫃檯「明天早上開始請客人填寫資料」。
     **收資料**與**開立**就此分家：欄位只看已付款，開立仍由 cfg.on 擋著。
     ⚠ 「沒收到錢不能開發票」這條一個字沒放寬，由下面三道一起守。 */
  ok('★★ 只有「已付款」才畫發票欄（沒收到錢不能填也不能開）',
     /const paid=\(\(document\.getElementById\('gt-pay'\)\|\|\{\}\)\.value\|\|''\)==='paid';/.test(F)
     && /w\.style\.display=paid\?'':'none';/.test(F)
     && /if\(!paid\) return;/.test(F));
  ok('★★★ 發票服務沒開時鎖成「不開立」，但欄位照顯示（資料還是要收）',
     /if\(!cfg\.on\)\{/.test(F)
     && /w\.dataset\.on='0';/.test(F)
     && /if\(_body\) _body\.style\.display='';/.test(F));
  ok('★★★ 開立那道防線沒鬆：invIssueForPurchase 仍看 cfg.on',
     /const cfg=await invCfg\(\);\s*\n\s*if\(!cfg\.on\) return null;/.test(grabFn('invIssueForPurchase')));
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
  /* 2026-09-02：invoices.print_flag 是 text 欄位，寫 boolean 會被 PostgREST 退件，
     而且退件時票券早就發出去了 —— 這種型別不合只會在正式開立那天才炸。 */
  ok('★★ print_flag 存綠界原值 \'0\'/\'1\'（欄位是 text，不是 boolean）',
     /print_flag:d\.Print,/.test(G) && !/print_flag:d\.Print==='1'/.test(G));
  ok('★★ 成功才把發票號碼寫回 purchases', /invoice_type:'ecpay', invoice_number:rd\.InvoiceNo/.test(G));
  ok('★ 失敗只用 toast 告知，不 throw', /showToast\('⚠ 發票開立失敗：'/.test(G) && !/throw /.test(G));
  ok('★★ 呼叫端也包 try（發票爆掉不能讓票券發放整條中斷）',
     /try\{ await invIssueForPurchase\(_purRow, await dbGet\('members',P\.member_id\)\.catch\(\(\)=>null\), P\.inv,[\s\S]{0,120}?\}catch\(e\)\{ console\.error\('invoice fail', e\); \}/.test(src));
  /* 2026-09-14 使用者定案：「櫃檯收款的時候要有開發票或不開發票的選項」。
     ⚠⚠ 表示「不開」一定要用 {mode:'none'}，**不能用 f==null** ——
       null 的既有語意是「走預設載具照常開」，退款手續費那條路（39399）就是傳 null。
       混用的話手續費發票會整批開不出來，而且不會有任何錯誤訊息。 */
  ok('★★★ 選了不開發票就整條跳過（判斷 f.mode===\'none\'，不是 f==null）',
     /if\(f && f\.mode==='none'\) return null;/.test(G));
  ok('★★★ 不能改成用 null 判斷（那會把手續費補開也一起關掉）',
     !/if\(!f\) return null;/.test(G));
}
{
  const R=grabFn('invReadFields');
  /* ⚠ 2026-09-14 二修：不能只回一個 {mode:'none'} 就走人 ——
     發票暫停時櫃檯照樣在收 Email／載具，收款流程要拿這些值寫回會員資料。
     只回 mode 等於把櫃檯剛問到的資料丟掉。 */
  ok('★★★ 櫃檯按「不開發票」→ mode 設成 \'none\'', /if\(w\.dataset\.on==='0'\) f\.mode='none';/.test(R));
  ok('★★★ 但欄位值要一起帶回去（不開立也要能寫回會員資料）',
     /f=\{mode:'carrier', carrierNum:g\('inv-car'\), email:g\('inv-email'\)\};/.test(R)
     && /return f;/.test(R)
     && !/return \{mode:'none'\};/.test(R));
  const S=grabFn('invSetOn');
  ok('★★ 開關把四格整區藏起來（選不開就不該還看得到載具欄）',
     /body\.style\.display=on\?'':'none'/.test(S));
  ok('★★ 預設是「開立」（收錢本來就該開發票，預設不開會變成常態性漏開）',
     /if\(!w\.dataset\.on\) invSetOn\(1\);/.test(src));
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

console.log('\n⑦ ★★★ 只能有一套發票系統');
{
  /* 0811 做過一套 ezPay（商店 344990117、INVOICE_LIVE 閘門），0902 改走綠界後整套拆掉。
     拆的理由不是「用不到」，是**兩套的 invCall 同名** —— 同一個 scope 兩個 function 宣告，
     後面那個會把前面的蓋掉，於是總有一邊在呼叫另一邊的函式（而且測試全綠、只有上線那天才炸）。 */
  /* 只看**程式**，墓碑註解裡寫得出這些字是刻意的（要留下拆掉的理由） */
  ok('★★★ ezPay 那套沒有復活',
     !/const INVOICE_LIVE\s*=|function invEnabled\(|localStorage\.getItem\('YUGYM_INV_TEST'|functions\/v1\/ezpay-invoice/.test(src));
  ok('★★★ invCall 全檔只宣告一次（同名函式會互相蓋掉）',
     (src.match(/^(async )?function invCall\(/gm)||[]).length===1);
  const dup=(src.match(/^(?:async )?function (inv[A-Za-z0-9_$]*)\(/gm)||[])
    .map(x=>x.replace(/^(?:async )?function /,'').replace('(',''))
    .filter((v,i,a)=>a.indexOf(v)!==i);
  ok('★★★ inv* 底下沒有任何同名函式', dup.length===0, dup);
  ok('★ 30 分鐘退回改接綠界（退回＝這筆不存在，發票留著就是白繳稅）',
     /for\(const pid of \(_undoPurIds\|\|\[\]\)\) await invVoidForPurchase\(pid, '銷售退回'\);/.test(src));
  ok('★ 營收列的發票欄改成唯讀號碼（開立已經跟著收款做完了）',
     /function revInvChip\(r\)\{[\s\S]{0,200}?rev-invno/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
