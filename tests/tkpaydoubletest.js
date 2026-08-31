/* 待付款補收款：同一筆錢不能算兩次（2026-08-31 陳瀚竣案例）

   使用者：「櫃檯說他點了紙本合約結果出現一個按鈕　點了那個按鈕才變成10400」

   帳本上的真相（TK-mtgozj1l5dj4，自訂方案 4 堂 $5,200）：
     03:42:05  grant  4    發放（自訂方案）           ← 付款狀態選了「未付款」
     03:43:55  adjust 0    共享設定：（無）→ 陳玟淂
     03:48:44  adjust 0    **補收款 $5,200（匯款）**  ← 課卡上的〔收款〕鈕
     03:49:52  adjust 0    售票整筆退回（30 分鐘內，輸入錯誤）
   → amount_paid 5,200 → 10,400。那顆「按鈕」就是〔收款〕。

   兩個地方一起錯：
   ① _grantIssue 不管付款狀態一律把全額寫進 amount_paid 與 purchases，
      但補收款那一支的檔頭本來就假設「建約那天那一筆的 deal_amount 是 0」。
   ② tkPayGo 是 `既有 + 本次`，不是 `= 本次`。

   ⚠ 這一支同時釘住：舊資料（0831 之前發放的待付款票）按〔收款〕也不能重複記營收。
     蔡佳音 TK-msmvv10rgdpo：8/10 建約當天已記 $10,400，按下去不該再記一次。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 待付款發放時不記錢');
{
  ok('★★★ amount_paid：未付款 → 0',
     /amount_paid:\(P\.payment_status==='unpaid'\) \? 0\s*\n\s*: Math\.max\(0,\(isInstall\?/.test(src));
  ok('★★★ 收款紀錄：未付款 → deal_amount 0（原價仍寫在 list_price，資料不會不見）',
     /const _dealRec=\(P\.payment_status==='unpaid'\) \? 0\s*\n\s*: Math\.max\(0,\(isInstall\?/.test(src));
  ok('★★ 「錢什麼時候到、帳就記在哪一天」是 0828 定案，這裡只是把它做到',
     /錢什麼時候到、帳就記在哪一天（0828 定案），所以未付款一律先記 0/.test(src));
  ok('★★★ 陳瀚竣那條時間軸寫在原地',
     /03:42 發放（未付款）→ amount_paid 5,200、purchases 也記 5,200/.test(src)
     && /03:48 按〔收款〕\$5,200 → amount_paid 變 10,400，又多一筆收款紀錄/.test(src));
}

console.log('\n② 補收款改成「填上去」');
{
  ok('★★★ amount_paid 是設定不是累加',
     /t\.amount_paid=v\.amt;/.test(src)
     && !/t\.amount_paid=\(Number\(t\.amount_paid\)\|\|0\)\+v\.amt;/.test(src));
  ok('★★ 語意寫清楚（這一欄是「總共收了多少」，不是流水帳）',
     /這一欄的語意是「這張票總共收了多少」，不是流水帳/.test(src));
  ok('★★★ 收款紀錄只補「還沒記到的那一段」',
     /const _newAmt=Math\.max\(0, v\.amt-_already\);/.test(src)
     && /\.filter\(p=>p&&p\.ticket_id===t\.id\)\.reduce\(\(n,p\)=>n\+\(Number\(p\.deal_amount\)\|\|0\),0\)/.test(src));
  ok('★★★ 已經記過就不重複記，而且要講出來（不能靜靜跳過）',
     /if\(_newAmt<=0\)\{\s*\n\s*showToast\(`這筆的 \$\$\{_already\.toLocaleString\(\)\} 在建約當天就記過營收了，不重複計算`/.test(src));
  ok('★★ 蔡佳音那張舊資料寫在原地（不是抽象的「舊資料」三個字）',
     /蔡佳音 TK-msmvv10rgdpo 就是這種：8\/10 已記 \$10,400，按〔收款〕不該再記一次/.test(src));
}

console.log('\n③ 實跑：算式對不對');
{
  /* 兩條算式照抄出來跑（來源由上面的字面斷言釘住） */
  const issue=(paymentStatus, paid)=> (paymentStatus==='unpaid') ? 0 : paid;
  const pay=(alreadyRecorded, amt)=>({ amount_paid:amt, newPurchase:Math.max(0, amt-alreadyRecorded) });

  eq('★★★ 0831 之後：未付款發放 → 票面 0、收款紀錄 0',
     [issue('unpaid',5200), issue('unpaid',5200)], [0,0]);
  eq('★★ 已付款發放照舊記全額', issue('paid',5200), 5200);

  eq('★★★ 陳瀚竣的情境重跑：發放 0 → 收款 5,200 → 票面 5,200、只記一筆 5,200',
     pay(0, 5200), {amount_paid:5200, newPurchase:5200});
  eq('★★★ 蔡佳音的舊資料：建約已記 10,400 → 按收款 → 票面 10,400、不再多記',
     pay(10400, 10400), {amount_paid:10400, newPurchase:0});
  eq('★★ 舊資料只記了一半（例：談好 10,400、當初只記 4,000）→ 補差額 6,400',
     pay(4000, 10400), {amount_paid:10400, newPurchase:6400});
  eq('★★ 實收比已記的還少（談好後折價）→ 票面照實收，不倒扣營收',
     pay(10400, 8000), {amount_paid:8000, newPurchase:0});

  /* 修好之前的行為，留一條反例釘樁 */
  const oldPay=(existing, amt)=>existing+amt;
  eq('★★★ 舊算法：5,200 + 5,200 = 10,400（＝這次的災情）', oldPay(5200,5200), 10400);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
