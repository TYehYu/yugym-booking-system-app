/* 2026-08-03 使用者指示：「會員資料的票券，金額旁邊新增現金或匯款」

   票券本身不存付款方式 —— 開會員資料時把該會員收款紀錄建成 ticket_id → 付款方式
   的對照（分期多筆取最新），tkMoneyHtml 在金額後面掛標籤。
   舊系統匯入（payment_method='imported'）不標；金額本來就只給櫃檯／管理員看。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 實跑 tkMoneyHtml');
{
  const mk=(desk,payMap)=>new Function('isDeskLike','window','return '+grabFn('tkMoneyHtml'))(()=>desk,{_tkPayMap:payMap||{}});
  /* 2026-08-13 拆帳改版：_tkPayMap 每筆改存 {m,sp}（付款方式＋pay_split），fixture 跟著改 */
  const f=mk(true,{T1:{m:'cash',sp:null},T2:{m:'transfer',sp:null},T3:{m:'imported',sp:null},T4:{m:'split',sp:{cash:2000,transfer:1000}}});
  ok('★ 現金：金額後掛綠標', /\$3,000<\/b><span class="tk-pay">現金<\/span>/.test(f({id:'T1',amount_paid:3000})));
  ok('★ 匯款：金色（同今日營收色階）', /<span class="tk-pay tk-pay-tr">匯款<\/span>/.test(f({id:'T2',amount_paid:5000})));
  /* 2026-08-13 使用者回報「看不出來多少現金多少匯款」：拆帳畫兩顆標籤各帶金額 */
  ok('★ 拆帳：兩顆標籤各帶金額（現金綠＋匯款金）',
     /<span class="tk-pay">現金 \$2,000<\/span><span class="tk-pay tk-pay-tr">匯款 \$1,000<\/span>/.test(f({id:'T4',amount_paid:3000})));
  ok('★ 舊系統匯入不標', !/tk-pay/.test(f({id:'T3',amount_paid:8000})));
  ok('★ 沒對照到的票不標（不掛空標籤）', !/tk-pay/.test(f({id:'T9',amount_paid:1000})));
  ok('★ 會員端／教練端整段不顯示（金額本來就只給櫃檯）', mk(false,{T1:{m:'cash',sp:null}})({id:'T1',amount_paid:3000})==='');
  ok('　　$0 的票照舊顯示原因標籤，不掛付款方式', /tk-amt-zero/.test(f({id:'T9',amount_paid:0,note:''})));
}

console.log('\n② 對照表的建法');
/* 2026-08-13 拆帳改版：對照表每筆改存 {m:付款方式, sp:pay_split}，拆帳標籤才能帶金額。
   2026-09-06 又多了折抵（vn/va/cu/lp）。原本這一條是整段一字不差比對，
   欄位一加就整條紅 —— 改成逐項釘「不能掉的那幾件事」，加欄位不會誤報。 */
ok('★ 開會員資料時就地建表（分期多筆取最新：依 created_at 排序後覆寫）',
   /window\._tkPayMap=\{\};/.test(src)
   && /c\.myPc\.slice\(\)\.sort\(\(a,b\)=>String\(a\.created_at\|\|''\)\.localeCompare\(String\(b\.created_at\|\|''\)\)\)/.test(src)
   && /\.forEach\(p=>\{ if\(!p\.ticket_id\|\|!p\.payment_method\) return;/.test(src)
   && /window\._tkPayMap\[p\.ticket_id\]=\{m:p\.payment_method, sp:p\.pay_split\|\|null,/.test(src));
ok('　　為什麼掛 window，寫在程式裡', /掛在 window 給 tkMoneyHtml 用（它是無資料存取的純顯示 helper）。/.test(src));

console.log('\n③ 票券卡顯示發票號碼');
/* 2026-09-15 使用者：「這邊有顯示發票號碼 教練課跟團體課是不是也可以顯示呢」
   「有辦法加上去嗎?如果分期就做成三格」 —— 沿用〔其他消費〕的 .rev-invno／.rev-noinv 標籤。 */
{
  const mk=(payMap)=>new Function('isDeskLike','window','return '+grabFn('tkMoneyHtml'))(()=>true,{_tkPayMap:payMap});

  const one=mk({A1:{m:'transfer',sp:null,vn:0,va:0,cu:0,lp:0,invs:[{no:'FX28688355',amt:7500}]}})({id:'A1',amount_paid:7500});
  ok('★ 單筆：金額後掛發票號碼，不加期數前綴',
     /<span class="rev-invno" title="第 1 期發票　\$7,500">FX28688355<\/span>/.test(one) && !/1\. FX28688355/.test(one), one);

  const ins=mk({A2:{m:'transfer',sp:null,vn:0,va:0,cu:0,lp:18000,invs:[
    {no:'FX28688300',amt:6000},{no:'FX28688310',amt:6000},{no:null,amt:6000}]}})({id:'A2',amount_paid:12000});
  ok('★ 分期三格：一期一格，各自帶號碼與期數前綴',
     /1\. FX28688300/.test(ins) && /2\. FX28688310/.test(ins), ins);
  ok('★ 分期中未開立的那一期畫「沒開發票」灰標（不是留白）',
     /<span class="rev-noinv" title="這一期沒有開立電子發票">3\. 沒開發票<\/span>/.test(ins), ins);

  /* ⚠ 下面兩條是保護①區的防線：那些 fixture 全都沒有 invs 欄位，
     這裡只要多畫一個字，就會打到「沒對照到的票不標」那幾條。 */
  ok('★★ 對照表沒有 invs 欄位時一個字都不輸出（舊資料與舊 fixture 不受影響）',
     !/rev-inv/.test(mk({A3:{m:'cash',sp:null,vn:0,va:0,cu:0,lp:0}})({id:'A3',amount_paid:3000})));
  ok('　　invs 是空陣列時也不輸出',
     !/rev-inv/.test(mk({A4:{m:'cash',sp:null,invs:[]}})({id:'A4',amount_paid:3000})));

  /* 釘住「grabFn 真的抽到完整函式」：tkMoneyHtml 的註解裡只要混進一個閉大括號字元，
     配對計數就會提前歸零、只抽到半截函式 —— 上面那些斷言會集體 SyntaxError。
     syntaxtest 對這種情況是綠的（壞的是測試重組出來的片段，不是檔案本身），
     所以這條單獨守著。2026-09-15 真的踩過一次。 */
  const fnSrc=grabFn('tkMoneyHtml');
  ok('　　grabFn 抽到完整函式（tkMoneyHtml 的註解裡沒有混進大括號字元）',
     fnSrc.includes('_invTag') && /\}\s*$/.test(fnSrc), fnSrc.length);
}

console.log('\n④ 對照表逐期累積發票號碼');
/* 分期＝同一張票有多筆收款，每一期各自一張發票。付款方式沿用「取最新」，
   但發票號碼不能覆寫，否則只剩最後一期看得到。 */
ok('★ 付款方式取最新，發票號碼則逐期 push 進 invs（不覆寫）',
   /const _prev=window\._tkPayMap\[p\.ticket_id\];/.test(src)
   && /const _invs=\(_prev&&Array\.isArray\(_prev\.invs\)\)\?_prev\.invs\.slice\(\):\[\];/.test(src)
   && /_invs\.push\(\{no:p\.invoice_number\|\|null, amt:Number\(p\.deal_amount\)\|\|0\}\);/.test(src)
   && /invs:_invs\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
