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

  /* 2026-09-15 二改（使用者：「票券右下角內容調整一下　發票號碼·付款方式·金額
     如果是分三期的方案　就分成三列置底　每增加一期往下增加」「意思是新的一期要擺下面」）——
     從「一列多格」改成「一期一列」，列內順序＝發票 → 付款方式 → 金額。
     ⚠ fixture 一定要帶 pm：付款方式改讀那一期自己的 v.pm，沒帶就不會畫，
       第一版的 fixture 沒有這一欄，等於整條新功能沒被驗到。 */
  const one=mk({A1:{m:'transfer',sp:null,vn:0,va:0,cu:0,lp:0,invs:[{no:'FX28688355',amt:7500,pm:'transfer'}]}})({id:'A1',amount_paid:7500});
  /* ⚠⚠ 2026-09-23 使用者改了列內順序：「右下角的排序調整　付款　金額　發票」
     （0915 定的「發票在最前」已被推翻）。
     ⚠ 當天稍早要過「並新增期數」，看過實機之後又拿掉 ——
       三列由上往下本來就是第 1、2、3 期，多一欄只是把整組推寬。
       期數沒有消失：每一列的發票／沒開發票 title 仍寫著「第 N 期」。 */
  /* ⚠ 金額與折抵券包在同一個 .tk-amtcell 格子裡（0923）——
       多期是四欄 grid，折抵不包起來會自己佔一欄、把發票擠到下一列。 */
  ok('★ 單筆：一列＝付款方式 → 金額 → 發票，而且**不標期數**',
     /<span class="tk-payrow"><span class="tk-pay tk-pay-tr">匯款<\/span><span class="tk-amtcell"><b class="tk-amt">\$7,500<\/b><\/span><span class="rev-invno" title="發票號碼">FX28688355<\/span><\/span>/.test(one)
     && !/tk-seq/.test(one), one);

  const ins=mk({A2:{m:'transfer',sp:null,vn:0,va:0,cu:0,lp:18000,invs:[
    {no:'FX28688300',amt:6000,pm:'cash'},{no:'FX28688310',amt:6000,pm:'transfer'},{no:null,amt:6000,pm:''}]}})({id:'A2',amount_paid:12000});
  ok('★★ 分期：一期一列往下堆（收第三期就長出第三列）',
     (ins.match(/<span class="tk-payrow">/g)||[]).length===3, ins);
  ok('★★ 每一期標自己的付款方式（第一期現金、第二期匯款，不是整張票的最新值）',
     /<span class="tk-pay">現金<\/span><span class="tk-amtcell"><b class="tk-amt">\$6,000<\/b><\/span><span class="rev-invno" title="第 1 期發票">FX28688300<\/span>/.test(ins)
     && /<span class="tk-pay tk-pay-tr">匯款<\/span><span class="tk-amtcell"><b class="tk-amt">\$6,000<\/b><\/span><span class="rev-invno" title="第 2 期發票">FX28688310<\/span>/.test(ins), ins);
  ok('★★★ 期數那一欄已經收掉，但每一列仍講得出自己是第幾期（在 title 裡）',
     !/tk-seq/.test(ins)
     && (ins.match(/title="第 \d 期(發票)?/g)||[]).length===3, ins);
  ok('★ 還沒開立的那一期畫「沒開發票」灰標，該期金額照畫',
     /<b class="tk-amt">\$6,000<\/b><\/span><span class="rev-noinv" title="第 3 期沒有開立電子發票">沒開發票<\/span>/.test(ins), ins);
  ok('　　整組靠右下、直向堆疊（直向 flex 要用 align-items，text-align 在這裡沒作用）',
     /\.tkc-money \.tk-paylist\{display:flex;flex-direction:column;align-items:flex-end;gap:4px;\}/.test(src));
  /* 2026-09-23：多期改用四欄 grid，讓期數／金額／發票跨列切齊。
     量過（390px）：單純直向 flex 時期數左緣是 142／144／205，改 grid 之後全部 142。 */
  ok('★★★ 多期用三欄 grid 讓欄位跨列切齊（單純的直向 flex 做不到）',
     /\.tkc-money \.tk-paylist-multi\{display:inline-grid;grid-template-columns:auto auto auto;/.test(src)
     && /\.tk-paylist-multi \.tk-payrow\{display:contents;\}/.test(src));
  ok('★★★ 只有多期才套 grid（單期一列沒有對齊問題）',
     /tk-paylist\$\{_multi\?' tk-paylist-multi':''\}/.test(src)
     && !/tk-paylist-multi/.test(one));
  ok('★★★ 沒有付款方式的那一期也要佔一格（少一格整列會位移）',
     /:\(_multi\?'<span class="tk-pay-na"><\/span>':''\);/.test(src)
     && /<span class="tk-pay-na"><\/span><span class="tk-amtcell"><b class="tk-amt">\$6,000<\/b>/.test(ins));
  ok('　 量到的數字寫在 CSS 原地', /量到 142／144／205/.test(src));
  /* ══ 底列的版型：七輪回報收斂成定版（2026-09-23）══
       ①「功能按鈕沒有在左下角嗎」②「左邊功能按鈕置底」
       ③「左邊圓形卡跟功能按鈕中間的空白　有必要嗎」
       ④「按鈕變直式了變得奇怪　維持原本的橫式排列可以把按鈕縮小或縮寫?」
       ⑤「左下功能按鈕沒有置底　而且為什麼這兩組大小不同?」
       ⑥「手機版的金額沒辦法在右下角了嗎」
       ⑦「還是功能按鈕統一改到效期跟圓形卡中間? 你覺得呢」
     ①〜⑥ 全是同一個死結的不同切面：底列只有一行，
     「按鈕在左下」與「金額在右下」在手機上放不進同一行 ——
     兩欄要 468px（含折抵券），卡內寬只有 316–386px。
     ⑦ 把按鈕整組搬去效期那一列，死結就不存在了：底列只剩金額。
     ⚠ 這一輪拆掉的東西：nowrap／align-items 覆寫／order 翻轉／@media 斷點，
       以及中途試過的 wrap-reverse。下面幾條就是防它們回來的。 */
  ok('★★★ 底列＝按鈕在左下、金額在右下（2026-09-23 使用者：「先維持現況」）',
     /\.tkc-foot\{align-items:center !important;\}/.test(src)
     && /\.tkc-foot>span:last-child\{order:-1;margin-left:0 !important;\}/.test(src)
     && /\.tkc-foot>span:first-child\{margin-left:auto;\}/.test(src));
  ok('★★★ 分期多列時按鈕置底（使用者：「把左下角的按鈕置底」）',
     /\.tkc-foot:has\(\.tk-paylist-multi\)\{align-items:flex-end !important;\}/.test(src));
  /* ⚠⚠ 不准再出現寫死的折行斷點：兩版都錯過（440 → 405）——
       斷點是拿「某一張卡」量出來的，可是金額欄的寬度會變。
     ⚠ 中途還試過 wrap-reverse（讓按鈕折行後落在下面）與
       「按鈕搬去效期列 ＋ 圓點｜金額兩欄」，兩套都被收回，理由留在 CSS 原地。 */
  ok('★★★ 沒有寫死斷點、也沒有殘留收回去的那兩套',
     !/@media \(max-width:405px\)/.test(src) && !/wrap-reverse/.test(src)
     && !/tkc-body/.test(src) && !/container-type:inline-size;\}\n\.tkc-body/.test(src));
  ok('★★ 收回去的理由留在原地（下一個人不要又走一次）',
     /使用者看過實機後決定「先維持現況」/.test(src)
     && /一加折抵券標籤就從 226px 撐到 326px/.test(src));
  ok('★★ 單期不受影響（0915 定過「四組資訊全部都要留、密度縮一號排得回來」）',
     /只有多期才套（\.tk-paylist-multi）：單期只有一列，沒有對齊的問題，/.test(src));

  /* ══ 折抵券：接在**實際使用的那一期**的金額後面 ══
     使用者兩則（2026-09-23）：
       「折抵券300可以直接接在金額後面-300」
       「折抵券也不是固定接第一期　是看他第幾期有使用就接在哪一期的金額後面」
     ⚠ 第一版寫死 `i===0`（理由是「折抵都在第 1 期收款時扣」），被使用者推翻。 */
  const dc2=mk({A5:{m:'transfer',sp:null,vn:0,va:0,cu:0,lp:18000,invs:[
    {no:'FX1',amt:6000,pm:'cash',vn:0,va:0,cu:0,lp:0},
    {no:'FX2',amt:5700,pm:'transfer',vn:1,va:300,cu:0,lp:6000},
    {no:null,amt:6000,pm:'',vn:0,va:0,cu:0,lp:0}]}})({id:'A5',amount_paid:17700});
  /* ⚠ 折抵券在金額**左邊**（2026-09-23 使用者：「折抵券的位子改在金額左邊」）——
       放右邊會把有折抵那一列的金額推離發票，三期的金額右緣對不齊。
     ⚠ 標籤只寫三個字（同日：「折抵券改成[折抵券]滑鼠提示金額」），數字進 title。 */
  ok('★★★ 折抵券接在**有用到的那一期**（第 2 期），不是固定第 1 期',
     /<span class="tk-pay tk-pay-tr">匯款<\/span><span class="tk-amtcell"><span class="tk-disc"[^>]*>折抵券<\/span><b class="tk-amt">\$5,700<\/b><\/span><span class="rev-invno" title="第 2 期發票">/.test(dc2)
     && (dc2.match(/tk-disc/g)||[]).length===1, dc2);
  ok('★★ 張數、折抵金額與該期原價都寫進 title',
     /<span class="tk-disc" title="折抵券 1 張　·　折抵 \$300　·　原價 \$6,000">/.test(dc2), dc2);
  const dc3=mk({A6:{m:'cash',sp:null,vn:0,va:0,cu:0,lp:0,invs:[
    {no:'FX1',amt:6000,pm:'cash',vn:0,va:0,cu:0,lp:0},
    {no:'FX2',amt:5700,pm:'cash',vn:0,va:0,cu:300,lp:0}]}})({id:'A6',amount_paid:11700});
  ok('★★ 儲值金同理（逐期，不是整張票一個值）',
     /<span class="tk-disc" title="儲值金折抵 \$300">儲值金<\/span><b class="tk-amt">\$5,700<\/b><\/span><span class="rev-invno" title="第 2 期發票">/.test(dc3)
     && (dc3.match(/tk-disc/g)||[]).length===1, dc3);
  ok('★★★ 折抵包在 .tk-amtcell 裡（不包會自己佔一欄、把發票擠到下一列）',
     /<span class="tk-amtcell">\$\{_amt\}<\/span>\$\{_iv\}/.test(src)
     && /\.tk-amtcell\{display:inline-flex;/.test(src)
     && /const _amt=`\$\{_dcThis\}<b class="tk-amt">\$\$\{\(Number\(v\.amt\)\|\|0\)\.toLocaleString\(\)\}<\/b>`;/.test(src));
  ok('★★★ 三期的金額右緣要切齊：折抵在左邊（量過 783／783／783，之前是 783／883／883）',
     /折抵券放在金額\*\*左邊\*\*/.test(src));

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
     fnSrc.includes('tk-paylist') && /\}\s*$/.test(fnSrc), fnSrc.length);
}

console.log('\n④ 對照表逐期累積發票號碼');
/* 分期＝同一張票有多筆收款，每一期各自一張發票。付款方式沿用「取最新」，
   但發票號碼不能覆寫，否則只剩最後一期看得到。 */
/* 2026-09-15 二改：invs 每一筆多存 pm（那一期自己的付款方式）——
   分期可能第一期現金、第二期匯款，只記整張票最新的那個會讓前面幾期標錯。 */
ok('★ 發票號碼、金額與該期付款方式逐期 push 進 invs（不覆寫）',
   /const _prev=window\._tkPayMap\[p\.ticket_id\];/.test(src)
   && /const _invs=\(_prev&&Array\.isArray\(_prev\.invs\)\)\?_prev\.invs\.slice\(\):\[\];/.test(src)
   && /_invs\.push\(\{no:p\.invoice_number\|\|null, amt:Number\(p\.deal_amount\)\|\|0, pm:p\.payment_method\|\|'',\n\s*vn:_vm\?Number\(_vm\[1\]\):0, va:_vm\?Number\(String\(_vm\[2\]\)\.replace\(\/,\/g,''\)\):0,\n\s*cu:Number\(p\.credit_used\)\|\|0, lp:Number\(p\.list_price\)\|\|0\}\);/.test(src)
   && /invs:_invs\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
