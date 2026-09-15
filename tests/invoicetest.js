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
     /* ⚠ 2026-09-15：付款判準要跟 submitGrant 同一套 ——
        付款狀態欄位在銷售／免簽約那條路刻意不畫（團課、運動按摩、單堂教練課），
        原本只讀 gt-pay 的寫法在那些路徑讀到空字串 → 發票區整塊不出現
        （使用者實測單堂教練課 $1,700 沒有發票選項）。 */
     /const _payVal=_payEl \? \(_payEl\.value\|\|''\)\s*\n?\s*: \(window\._grantSalesActive \? 'paid' : 'unpaid'\);/.test(F)
     && /gtNeedsContract\(\)\) \? false/.test(F)
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
     /f=\{mode:'carrier', carrierNum:g\('inv-car'\), email:g\('inv-email'\), src:'carrier'\};/.test(R)
     && /return f;/.test(R)
     && !/return \{mode:'none'\};/.test(R));
  /* 2026-09-15 使用者定案：「我們也不用捐贈的選項」「也沒有紙本可以開」
     「勾開發票 則要選載具還是信箱」「統編設計在信箱這邊」——
     畫面只剩兩格，但送給綠界的參數組合沒變：
       寄信箱＋有統編 → ubn（CustomerIdentifier＋CarrierType=1）
       寄信箱＋沒統編 → carrier 但條碼留空（＝綠界載具＋Email）
     所以 invPayload 一行都不用改。 */
  ok('★★★ 寄信箱有填統編 → 走 ubn',
     /f = _u \? \{mode:'ubn',     ubn:_u, title:g\('inv-title'\), email:g\('inv-email'\), src:'mail'\}/.test(R));
  ok('★★★ 寄信箱沒填統編 → 走綠界載具（條碼留空）＋Email',
     /: \{mode:'carrier', carrierNum:'',                email:g\('inv-email'\), src:'mail'\};/.test(R));
  ok('★★ 帶 src 記住櫃檯點的是哪一格（光看 mode 分不出來）',
     /src:'mail'/.test(R) && /src:'carrier'/.test(R));
  ok('★★ 捐贈／紙本的讀取分支保留（UI 不產生，但重開舊發票用得到）',
     /f=\{mode:'donate'/.test(R) && /f=\{mode:'print'/.test(R));
  const S=grabFn('invSetOn');
  /* ⚠ 2026-09-15 改成**暗化**不是隱藏（使用者：「勾不開發票下方暗化處理」）——
     也符合系統既有的「不能用就寫原因，別藏按鈕」：櫃檯看得到自己關掉了什麼。
     ⚠ pointer-events 擋滑鼠、input 的 disabled 擋鍵盤 Tab，只做一半仍然打得進去。 */
  ok('★★★ 勾「不開發票」→ 下方暗化（不是隱藏）',
     /body\.classList\.toggle\('inv-dim', off\);/.test(grabFn('invDimSync'))
     && /\.inv-dim\{opacity:\.38;filter:grayscale\(\.5\);pointer-events:none;\}/.test(src));
  ok('★★★ 暗化同時要 disabled（只靠 CSS 的話鍵盤還進得去）',
     /body\.querySelectorAll\('input,button'\)\.forEach\(el=>\{ el\.disabled=off; \}\);/.test(grabFn('invDimSync')));
  ok('★★★ invPick 重畫後要重套暗化（新畫的 input 不會帶 disabled）',
     /invDimSync\(\);   \/\* 重畫後要重套暗化/.test(src));
  ok('★★ 開關本身是勾選框，預設不勾＝開立',
     /<input type="checkbox" id="inv-nope" onchange="invSetOn\(this\.checked\?0:1\)">/.test(src)
     && /const cb=document\.getElementById\('inv-nope'\); if\(cb\) cb\.checked=!on;/.test(S));
  ok('★★★ 只剩兩格：存載具／寄信箱（捐贈與紙本從畫面移除）',
     /const INV_MODES=\[\['carrier','存載具'\],\['mail','寄信箱'\]\];/.test(src));
  ok('★★ 預設是「開立」（收錢本來就該開發票，預設不開會變成常態性漏開）',
     /if\(!w\.dataset\.on\) invSetOn\(1\);/.test(src));
}

console.log('\n④-2 每一個收款入口都要能開發票（2026-09-15）');
/* 使用者：「開發票這個功能只要有收款都要出現喔　現在的情況是有些散客會來買蛋白粉
   或體驗課程　這種時候就要看要不要開發票　要開就要手動輸入當時客人的載具或信箱」
   ⚠ 這推翻了 0802「銷售的地方先移除發票區，目前還沒串聯」那個決定（見 noinvoicetest）。
   一個入口要湊齊三件事才算接好：插 invFieldsHTML、開窗呼叫 invSync、存檔呼叫 invIssueForPurchase。 */
{
  const cnt=re=>(src.match(re)||[]).length;
  ok('★★★ 五個地方插了發票區（發放票券／場租／自主訓練票券／商品／分期）',
     cnt(/\$\{invFieldsHTML\(\)\}/g)===5);
  ok('★★★ invSync 可傳入 paid／memberId／members（不傳就沿用 gt- 那套）',
     /async function invSync\(opt\)\{/.test(src)
     && /if\(O\.paid!=null\)\{/.test(src)
     && /const _mid = \(O\.memberId!=null\) \? String\(O\.memberId\|\|''\)/.test(src));
  /* ⚠ 2026-09-15 二修：msInvSync 多收一個 paid 參數（合計 0 要把發票區收起來），
     onchange 仍是無參數呼叫 —— 那時自己算合計。 */
  ok('★★★ 商品銷售：開窗與換會員都重新預填（散客則不預填）',
     /function msInvSync\(paid\)\{/.test(src)
     && /<select id="ms-member" onchange="msInvSync\(\)">/.test(src));
  ok('★★★ 商品銷售：整筆開一張，不是一列一張',
     /await invIssueForPurchase\(first, _mem, _inv, items, \{amt:total, category:'merch'\}\)/.test(src));
  ok('★★ 自主訓練票券：開窗同步＋存檔開立', /function fvInvSync\(\)\{/.test(src)
     && /await invIssueForPurchase\(_tRow, _fm, _inv,/.test(src));
  /* ⚠ 2026-09-15 二修：場租改走 frInvSync（金額 0 要收合），它內部才呼叫 invSync。 */
  ok('★★★ 場租是散客：invSync 不傳 memberId、開立時 mem 傳 null',
     /try\{ invSync\(\{paid:fee>0\}\); \}catch\(_\)\{\}/.test(src)
     && !/invSync\(\{paid:[^}]*memberId[^}]*\}\);[\s\S]{0,40}場租/.test(src)
     && /await invIssueForPurchase\(_fRow, null, _inv,/.test(src));
  ok('★★ 分期：每一期各開各的', /await invIssueForPurchase\(_pRow, _pm, _inv,/.test(src)
     && /function inxInvSync\(\)\{/.test(src));
  /* ⚠ 表單一定要在 closeModal 之前讀完 —— 關掉之後 DOM 就沒了，
     0915 四個入口都踩同一條規則，所以各自在動資料前先 invReadFields()。 */
  ok('★★★ 四個入口都在動資料前先讀表單並驗證',
     cnt(/const _inv=invReadFields\(\);/g)>=4
     && cnt(/const _e=invCheckFields\(_inv\); if\(_e\)\{ showToast\('發票欄位：'\+_e\); return; \}/g)>=4);
  ok('★★ 散客沒有會員資料可帶 → 不預填，不是錯誤',
     /散客（memberId 空或找不到人）→ 四個值都是空字串 → 不預填，櫃檯手動輸入。/.test(src));
}

console.log('\n④-3 流程自我檢查抓到的三個洞（2026-09-15）');
{
  /* ⚠⚠ 死結：invSync 結尾原本切到 'ubn'，但 0915 改版後 INV_MODES 只剩 carrier／mail。
     有統編的會員 → dataset.mode='ubn' → invPick 落到 else 畫「手機條碼」欄、兩顆按鈕都不亮
     → invReadFields 以 k='ubn' 讀不存在的 #inv-ubn（空）→ 驗證擋「統一編號要 8 碼數字」，
     而畫面上根本沒有統編欄可填 —— **整筆送不出去**。統編現在住在「寄信箱」那格。 */
  /* ⚠ 2026-09-15 二修（使用者：「統編應該要每次手動輸入」「不用存在會員資料裡面」）——
     統編不再存會員資料，所以也不能再用它決定預設哪一格。改成看載具：
     有載具→「存載具」，否則→「寄信箱」。
     ⚠ 'ubn' 這個模式仍然不可以出現在這裡（它不在 INV_MODES 裡，會造成死結）。 */
  ok('★★★ 預設格用載具判斷，不再用統編（統編已不存會員資料）',
     /if\(!w\.dataset\.mode\) invPick\(window\._invMemCarrier\?'carrier':'mail'\);/.test(src)
     && !/invPick\(window\._invMemUbn\?'ubn':'carrier'\)/.test(src)
     && !/invPick\(window\._invMemUbn\?'mail':'carrier'\)/.test(src));
  ok('★★★ 統編與抬頭不從會員資料帶入（每次手動輸入）',
     /window\._invMemUbn    ='';/.test(src)
     && /window\._invMemTitle  ='';/.test(src)
     && /row\('inv-ubn','統一編號','公司行號才填，每次都要重打'\)/.test(src)
     && /row\('inv-title','公司抬頭','打統編可一併填'\)/.test(src));
  ok('★★★ 四個入口都不再把統編／抬頭寫回會員',
     !/_u\.invoice_ubn    =/.test(src) && !/_u\.invoice_title  =/.test(src));
  ok('★★ 切過去的那格真的存在於 INV_MODES',
     /const INV_MODES=\[\['carrier','存載具'\],\['mail','寄信箱'\]\];/.test(src));

  /* ⚠ 孤兒發票：場租原本是兩個各自獨立的 try —— 收款紀錄寫失敗被 catch 吞掉之後，
     開發票那段照樣跑，會留下「有發票、沒有收款紀錄」的帳。 */
  /* ⚠ 2026-09-15 二修：守門條件從 `if(_fOk)` 變成 `if(_fOk && _inv)`
     （多擋一層「櫃檯沒看到發票區」，見 ④-4）—— 規則沒放寬，反而更嚴。 */
  ok('★★★ 場租：收款紀錄寫成功才開發票（否則會有孤兒發票）',
     /let _fOk=false;/.test(src)
     && /try\{ await dbPutPurchaseSafe\(_fRow\); _fOk=true; \}/.test(src)
     && /if\(_fOk && _inv\)\{\s*\n\s*try\{ await invIssueForPurchase\(_fRow, null, _inv,/.test(src));

  /* ⚠ 白填：invIssueForPurchase 有 `amt<=0 return null`，金額 0 時發票區留在畫面上
     等於讓櫃檯白問一次載具／信箱，填了也不會開。三個入口都要跟著金額收合。 */
  ok('★★★ 金額 0 就把發票區收起來 —— 商品',
     /if\(document\.getElementById\('inv-wrap'\)\) msInvSync\(sum>0\);/.test(src));
  ok('★★★ 金額 0 就把發票區收起來 —— 場租（含切換票券折抵）',
     /function frInvSync\(\)\{/.test(src)
     && /try\{ invSync\(\{paid:fee>0\}\); \}catch\(_\)\{\}/.test(src)
     && /id="fr-fee" value="200" min="0" oninput="frInvSync\(\)"/.test(src)
     && /else if\(fee\)\{ fee\.value=200; \}\s*\n\s*frInvSync\(\);/.test(src));
  ok('★★★ 金額 0 就把發票區收起來 —— 分期（含「下一期／剩餘全繳」快捷）',
     /function inxInvSync\(\)\{/.test(src)
     && /try\{ invSync\(\{paid:amt>0, memberId:window\._inxMemberId\|\|''/.test(src)
     && /id="inx-amt" min="0" value="\$\{amt\}" oninput="inxInvSync\(\)"/.test(src)
     && /if\(a\) a\.value=n; if\(b\) b\.value=amt; inxInvSync\(\); \}/.test(src));
  ok('★★ 未付款發放不會誤開（_dealRec 為 0 → invIssueForPurchase 的 amt<=0 擋掉）',
     /const _dealRec=\(P\.payment_status==='unpaid'\) \? 0/.test(src)
     && /if\(amt<=0\) return null;/.test(src));
}

console.log('\n④-4 ⚠ 事故：系統自己開了一張沒人選過的發票（2026-09-15）');
/* 使用者實測：「我剛剛測試了一筆 魚先森 最後沒有跳出來讓我選是否要開發票」
   「自己就開了」「而且也沒有輸入載具跟email」
   → FX28688352（$10,400）真的開出去了。魚先森的載具／email／統編全是空的，
     等於開給空氣，而櫃檯完全沒被問過。

   兩層根因：
   ① 時序：grantGoStep(2) 呼叫 refreshGrantInfo()（async，設定 _grantPlanCache）
      **沒有 await** 就跑 invSync()。invSync 的 gtNeedsContract() 沒傳 plan，
      往下問 gtIsSingle() 讀那個還沒設好的快取 → 多堂教練課被判要簽約
      → paid=false → **發票區整塊不顯示**。
   ② 致命：發票區沒顯示 → invReadFields() 回 null → 而 invIssueForPurchase
      只擋 f.mode==='none'、**對 null 是放行的** → invPayload 落到最後的 else
      （d.CarrierType='1' 綠界載具）→ 自己開了一張真發票。

   ⚠ null 的「照常開」語意只留給退款手續費那條內部補開（invVoidForPurchase 之後），
     櫃檯流程一律要有明確的 f。 */
{
  ok('★★★ 時序：invSync 要等 refreshGrantInfo 完成（否則 _grantPlanCache 還是空的）',
     /await refreshGrantInfo\(\); \}catch\(_\)\{\}/.test(src)
     && /try\{ await invSync\(\); \}catch\(_\)\{\}/.test(src)
     && !/if\(n===2\)\{ refreshGrantInfo\(\); try\{ gtSaleKindSync/.test(src));
  const cnt=re=>(src.match(re)||[]).length;
  ok('★★★ 五個入口都擋掉「_inv 為 null 就開立」',
     /if\(P\.inv\)\{/.test(src)          /* 發放票券 */
     && /if\(_fOk && _inv\)\{/.test(src) /* 場租 */
     && cnt(/⚠ 2026-09-15：_inv 為 null＝櫃檯沒看到發票區，一律不開（見場租那段的說明）。/g)===3);
  ok('★★ 擋下來時要留痕跡（不是靜靜跳過，否則沒人知道那筆為何沒發票）',
     cnt(/console\.warn\('發票區未顯示/g)>=4);
  ok('★★★ null 仍保留給退款手續費那條內部補開（不能一律擋死）',
     /await invIssueForPurchase\(pc, await dbGet\('members',tk\.member_id\)\.catch\(\(\)=>null\), null,/.test(src));
  /* invPayload 的最後那個 else 就是「沒有 f 就用綠界載具」，它本身沒錯，
     錯在讓櫃檯流程走到它。這條釘著它還在，免得日後有人把它砍掉而讓補開那條壞掉。 */
  ok('　　invPayload 的預設分支仍在（補開那條要靠它）',
     /\}else\{\s*\n\s*d\.CarrierType='1';   \/\* 預設：存綠界載具/.test(src));
}

console.log('\n④-5 建約那條路：發票要在「待審核發放」問（2026-09-15）');
/* 使用者實測第二次：「這邊按下去 就發放票券了嗎　剛剛是這樣　發票在哪一步呢」
   —— 截圖是 openGrantApprove（① 收款資訊 ② 發放／〔確認收款・發放票券〕）。

   **錢是在那個畫面收的**：建約那條路一律先記 unpaid，按下那顆按鈕才翻成 paid
   （見 grFillApply 的 payment_status:'paid'）。但發票區先前只加在「直接發放」
   （submitGrant）那條，建約這條從頭到尾沒有 → payload.inv 一路是 null
   → 0915 魚先森 $10,400 那張就是被 invPayload 的預設分支自己開出去的。

   ⚠ 只補 `if(P.inv)` 防線是不夠的：那只會把「亂開」變成「永遠漏開」。
     真正要做的是**把發票區加進收錢的那個畫面**。 */
{
  ok('★★★ 待審核發放畫面有發票區（且只在真的發得出去時才畫）',
     /\$\{_canIssue\?invFieldsHTML\(\):''\}/.test(src));
  ok('★★★ 開窗時帶入該會員（建約這條的會員是固定的）',
     /window\._grInvMemberId=r\.member_id\|\|'';/.test(src)
     && /window\._grInvMembers=\[await dbGet\('members', r\.member_id\)/.test(src));
  ok('★★★ 送出時讀表單並覆寫 payload.inv（建約當時存的那份一定是 null）',
     /const _grInv=invReadFields\(\);/.test(src)
     && /_p\.inv=_grInv;/.test(src));
  ok('★★ 讀之前先驗，擋下來要把 busy 收掉（否則畫面卡在「發放中…」）',
     /\{ const _e=invCheckFields\(_grInv\); if\(_e\)\{ done\(\); showToast\('發票欄位：'\+_e\); return; \} \}/.test(src));
  /* ⚠ 應收 0（全額折抵）開不出發票，發票區要跟著收合 —— 與商品／場租／分期同一條規則。
     這裡用 grDueAmount（折抵券之後、分期取第 1 期），不是總金額。 */
  ok('★★★ 應收 0 就把發票區收起來（用 grDueAmount，不是總金額）',
     /function grInvSync\(due\)\{/.test(src)
     && /try\{ grInvSync\(p0 \? grDueAmount\(p0\) : 0\); \}catch\(_\)\{\}/.test(src));
  ok('★★ 不能發放時沒有發票區，同步函式要能安全跳過',
     /if\(!document\.getElementById\('inv-wrap'\)\) return;   \/\* 不能發放時沒畫這一區 \*\//.test(src));
}

console.log('\n④-6 ⚠ 發票區不能依賴外部工具函式（2026-09-15）');
/* 使用者實測：「操作沒有完成：Can't find variable: esc 跳出錯誤」
   → invPick 的 row() 寫了 esc(val||'')，但**全域根本沒有 esc**：
     全檔十幾個 esc 都是各自函式內部的區域 const（23072、30009、41457…），
     而 invPick 在第一個 <script> 區塊裡，一個都看不到。
     結果只要發票區一開啟就丟 ReferenceError —— 六個入口全壞。
   ⚠ 這一區的函式會被本測試抽出來單獨跑（new Function 沙箱），
     多一個外部依賴就多一個破口。invSummaryHTML 當初就是為此自帶跳脫，invPick 漏了。 */
{
  const strip=s=>String(s||'').replace(/\/\*[\s\S]*?\*\//g,'');   /* 註解裡提到沒關係 */
  const INV_FNS=['invFieldsHTML','invPick','invReadFields','invCheckFields',
                 'invSummaryHTML','invSetOn','invDimSync'];
  const bad=INV_FNS.filter(n=>/[^a-zA-Z_.]esc\(/.test(strip(grabFn(n))));
  eq('★★★ 七支發票函式都不呼叫外部 esc()', bad, []);
  ok('★★★ invPick 自己帶跳脫（預填值可能含引號，不跳脫會把 value 屬性截斷）',
     /const q=v=>String\(v==null\?'':v\)\.replace\(\/&\/g,'&amp;'\)/.test(grabFn('invPick'))
     && /value="\$\{q\(val\)\}"/.test(grabFn('invPick')));
  ok('★★ placeholder 也要跳脫（同一個 row 樣板出來的）',
     /placeholder="\$\{q\(ph\)\}"/.test(grabFn('invPick')));
  /* 實跑一次：確認跳脫函式本身正確（引號、角括號、& 都要處理）。 */
  {
    const q=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    eq('　　實跑：雙引號會被跳脫（否則 value 屬性會被截斷）', q('a"b'), 'a&quot;b');
    eq('　　實跑：角括號與 & 都處理', q('<a&b>'), '&lt;a&amp;b&gt;');
    eq('　　實跑：null／undefined 回空字串', [q(null), q(undefined)], ['','']);
  }
}

console.log('\n④-7 送出鈕的即時把關（2026-09-15）');
/* 使用者：「這邊可以設個防呆嗎　信箱必填　統編跟抬頭選填」
           「信箱 載具或不開發票 其他有一個才可以點選確認收款・發放票券」
   規則本來就在 invCheckFields，這一段把「按下去才跳錯」改成「沒填齊就按不下去」。 */
{
  const G=grabFn('invGateSync');
  ok('★★★ 有這支 gate，且沒註冊按鈕就什麼都不做（不影響既有畫面）',
     /function invGateSync\(\)\{/.test(src)
     && /const id=window\._invGateBtn; if\(!id\) return;/.test(G));
  ok('★★★ 判斷直接吃 invCheckFields（規則只有一份，不另寫一套）',
     /const err=invCheckFields\(invReadFields\(\)\);/.test(G));
  ok('★★★ 擋下來要寫原因進 title（按鈕變灰卻不說為什麼，櫃檯會以為壞了）',
     /btn\.title=err;/.test(G));
  ok('★★ 只收自己擋的那次（dataset.invgate），不搶別人對按鈕的控制權',
     /btn\.dataset\.invgate='1';/.test(G)
     && /else if\(btn\.dataset\.invgate==='1'\)\{ delete btn\.dataset\.invgate;/.test(G));
  ok('★★ 發票區沒畫或沒顯示就不介入（未付款／金額 0／合約沒簽回）',
     /if\(!w \|\| w\.style\.display==='none'\)\{/.test(G));
  /* ⚠ 五個入口都要註冊自己的送出鈕 id，漏一個那個畫面就完全沒有把關。
     0915 就差點漏掉待審核發放（使用者截圖那個畫面）。 */
  const REG=['fr-go','fv-go','ms-go','inx-go','gr-go'];
  const miss=REG.filter(id=>!new RegExp(`window\\._invGateBtn='${id}';`).test(src));
  eq('★★★ 五個收款畫面都註冊了送出鈕', miss, []);
  const noId=REG.filter(id=>!new RegExp(`id="${id}"`).test(src));
  eq('★★★ 註冊的 id 在畫面上都真的存在', noId, []);
  ok('★★★ 欄位一打字就重驗（oninput）', /autocomplete="off" oninput="invGateSync\(\)"/.test(src));
  ok('★★ 切換分頁／勾不開發票也要重算', /invDimSync\(\)\{[\s\S]{0,400}?invGateSync\(\);/.test(src));
  ok('★★ 開窗當下就把關（不必等打第一個字）',
     /if\(!w\.dataset\.mode\) invPick\(window\._invMemCarrier\?'carrier':'mail'\);[\s\S]{0,160}?invGateSync\(\);/.test(src));
  /* ⚠ 待審核發放那支：grFillPreview 結尾剛把 gr-go 打開，gate 必須接在它之後 */
  ok('★★★ gr-go 的把關要排在「金額算得出來就打開」之後',
     /if\(go\)\{ go\.disabled=false; go\.style\.opacity=''; go\.style\.cursor=''; \}[\s\S]{0,200}?invGateSync\(\);/.test(src));
  /* 實跑規則：信箱必填、統編抬頭選填、載具必填、不開發票放行 */
  eq('　　寄信箱：沒填 Email → 擋',
     invCheckFields({mode:'carrier',carrierNum:'',email:'',src:'mail'}), '請填 Email，發票會寄到這裡');
  eq('　　寄信箱：只填 Email 就放行（統編抬頭選填）',
     invCheckFields({mode:'carrier',carrierNum:'',email:'a@b.co',src:'mail'}), '');
  eq('　　寄信箱：Email＋統編也放行（抬頭仍可不填）',
     invCheckFields({mode:'ubn',ubn:'53538851',title:'',email:'a@b.co',src:'mail'}), '');
  eq('　　存載具：沒填條碼 → 擋',
     invCheckFields({mode:'carrier',carrierNum:'',email:'',src:'carrier'}), '請填手機條碼，或改選「寄信箱」');
  eq('　　不開發票：全部放行', invCheckFields({mode:'none'}), '');
}

console.log('\n④-8 其他消費（商品等）的整筆作廢（2026-09-15）');
/* 使用者：「這邊沒有退款的機制嗎」「因為售出的商品 都有機會會被退款 所以要保有這個機制」
   ⚠ 30 分鐘內本來就能走今日營收那一列的〔退回〕（openSaleUndo 的 else 分支吃純 purchases），
     超過 30 分鐘原本**沒有任何路** —— 這一段補上。
   ⚠ 沿用票券作廢同一套慣例，不自創：【已作廢 原$N：原因】＋ deal_amount 歸 0 ＋ 發票連帶作廢。 */
{
  const A=grabFn('othVoidAsk'), V=grabFn('_othVoid');
  ok('★★★ 只有櫃檯以上能作廢', /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可作廢'\); return; \}/.test(A));
  ok('★★★ 0 元的不讓作廢（已經作廢過的就是 0）',
     /if\(amt<=0\)\{ showToast\('這筆金額是 0，不需要作廢'\); return; \}/.test(A));
  ok('★★ 有發票的要在確認視窗寫明發票也會作廢',
     /\$\{invNo\?'，發票一併作廢':''\}/.test(A)
     && /發票 <b>\$\{escH\(invNo\)\}<\/b> 會送到綠界作廢/.test(A));
  ok('★★★ 防連點（動錢的操作按兩次就是兩筆帳）',
     /async function othVoidGo\(purId\)\{ return onceAct\('othvoid:'\+purId, \(\)=>_othVoid\(purId\)\); \}/.test(src));
  /* ⚠ 順序：先作廢發票再歸零金額 —— 反過來的話，萬一發票作廢失敗
     就變成「錢退了、發票還在」，那是稅務問題。 */
  ok('★★★ 先作廢發票，再把金額歸 0',
     V.indexOf('invVoidForPurchase') < V.indexOf('p.deal_amount=0'));
  ok('★★★ 發票作廢失敗不擋收款作廢（錢的紀錄一定要改對）',
     /catch\(e\)\{ console\.error\('other void invoice fail', e\); \}/.test(V));
  ok('★★★ 備註沿用票券那一套格式，不自創',
     /p\.note=\(\(p\.note\|\|''\)\+`【已作廢 原\$\$\{amt\.toLocaleString\(\)\}\$\{why\?`：\$\{why\}`:''\}】`\)\.trim\(\);/.test(V));
  ok('★★ 不刪紀錄（帳要看得到曾經賣過、何時作廢、為什麼）',
     !/dbDel\('purchases'/.test(V) && /await dbPut\('purchases',p\);/.test(V));
  ok('★★ 作廢後清快取並重繪', /dbCacheClear\(\['purchases','invoices'\]\);/.test(V)
     && /try\{ ppRenderBody\(\); \}catch\(_\)\{\}/.test(V));
  ok('★★ 已作廢的列淡化並顯示原因（不是隱藏）',
     /const _oVoided=p=>\/【已作廢\/\.test\(String\(p\.note\|\|''\)\);/.test(src)
     && /_oVoided\(p\)\?' style="opacity:\.5;"':''/.test(src));
  ok('★★ 作廢鈕只給櫃檯、且已作廢或 0 元的不再出現',
     /const _oVoidBtn=p=>\(!isDeskLike\(\)\|\|_oVoided\(p\)\|\|!\(Number\(p\.deal_amount\)>0\)\)\?''/.test(src));
  /* 30 分鐘那條路本來就支援純 purchases，這裡釘住它別被改掉 */
  ok('★★★ 30 分鐘內的〔退回〕仍吃純 purchases（沒有票券也能退）',
     /pur=await dbGet\('purchases',id\);/.test(grabFn('openSaleUndo')));
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
