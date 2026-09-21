/* 2026-08-01 使用者指示（附截圖圈起首頁那張「今日營收 $0」卡）：
   「我希望這個按鈕有互動功能 可以看今天的營收名單」
   桌機右欄本來就有收款名單卡，手機版沒有那一欄，數字點不開就只是一個數字。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('卡片變成可點');
ok('★ 今日營收卡掛上 onclick', /class="card mc-card mc-kpi-mini mc-kpi-rev mc-kpi-tap"[\s\S]{0,80}onclick="openTodayRevList\(\)"/.test(src));
ok('★ 鍵盤也能開（Enter／空白鍵）',
   /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);openTodayRevList\(\);\}"/.test(src));
ok('★ 標題後面有小箭頭當「點得開」的提示', /今日營收<span class="mc-kpi-tapmark">›<\/span>/.test(src));
ok('★ 有可點的樣式與按壓回饋', /\.mc-kpi-tap\{cursor:pointer;/.test(src) && /\.mc-kpi-tap:active\{transform:scale\(\.975\);\}/.test(src));

console.log('\n資料同源（三個地方不能各算各的）');
ok('★ 彈窗吃的是首頁算好的那一份', /window\._gdRev=\{date, rows:_revRows, total:_revTotal, inv:_revInv, noInv:_revNoInv\};/.test(src));
ok('★ _revRows 同時餵給桌機右欄的收款名單卡（同一個變數）',
   /const revListCard=`<div class="card mc-card mc-revlist-card">/.test(src)
   && /\$\{_revRows\.length\?`<div class="mc-revlist">/.test(src));
ok('★ 金額口徑與 KPI 同一組變數（_revTotal／_revInv／_revNoInv）',
   /const _revTotal=_revTotal0\+_dayPurSum;/.test(src)
   && /const _revNoInv=Math\.max\(0,_revTotal-_revInv\);/.test(src));
ok('　　為什麼不另外算一份，寫在程式裡', /免得三個地方各自算出不同的數字/.test(src));

console.log('\n彈窗內容');
ok('★ 有這支函式', /function openTodayRevList\(\)\{/.test(src));
/* 2026-08-03：姓名右邊多了業績歸屬 tag（revattribtest.js）；同日再指示發票標籤移除、
   付款方式可修正（revpaytest.js）。 */
/* 2026-08-07：歸屬 tag 移到姓名上方（使用者指示），姓名那一行只剩姓名 */
ok('★ 每一列：歸屬 tag（上）／姓名／品項／付款方式／金額（發票標籤已移除）',
/* 2026-08-24 使用者定案（版型改版）：「最左邊獨立一欄直式卡片 新約 續約 分期 抽獎；
   第二欄調成兩列，第一列 會員姓名靠左、教練標籤靠右；第二列 購買品項靠左、金額靠右；
   金額又有現金跟匯款，如果同時出現則要再分成兩列」——
   歸屬標籤從「姓名上方自成一列」改成「與姓名同一列、靠右」。 */
/* 2026-09-15：教練標籤搬到最左欄（約別章下方），姓名那一行只剩姓名。 */
/* 2026-09-15 三修：退回鈕移到姓名那一行（使用者：「退回的按鈕可以改在發票左邊
   這樣就不會多一列了」）。彈窗版沒有發票標記，所以那一行是「姓名＋退回」。 */
   /<div class="rv-r1"><span class="mc-rev-nm">\$\{esc\(r\.nm\)\}<\/span>\$\{revUndoChip\(r\)\}<\/div>/.test(src)
   && /<div class="rv-r2"><span class="mc-rev-it">\$\{esc\(r\.it\)\}<\/span>/.test(src)
   && !/mc-rev-inv">發票/.test(src));
/* 2026-09-15 使用者：「今天兩筆 魚先森 點選進去的時候應該要直接跳選到
   會員資料的[其他]這一個頁面」——票券列仍跳票券頁，商品／場租／票券重啟跳〔其他〕。
   判斷用 r.tk（票券列一定有、純收款列只有 r.pur），不用 category。 */
/* 2026-09-21 使用者：「點取向左展出一個小視窗 把功能都收在這個小視窗裡面」——
   整列不再直接跳會員資料，改開 revRowPanel；「會員資料」變成視窗裡的第一顆鈕，
   底下仍是同一支 revRowGo（分頁邏輯沒動，下面兩條照樣釘著）。 */
ok('★★ 整列點下去開側滑小視窗（兩處清單都是）',
   (src.match(/onclick="revRowPanel\('\$\{revRowKey\(r\)\}'\)"/g)||[]).length===2
   && !/onclick="closeModal\(\);revRowGo\(/.test(src));
ok('★★★ 視窗的「會員資料」那顆仍走 revRowGo，帶著票券分頁',
   /if\(what==='mem'\)\{ closeModal\(\); revRowGo\(r\.mid, r\.tk\?\(r\.cls\|\|'pt'\):'other'\); return; \}/.test(src));
ok('★★★ 用票號／收款號當鍵值查列，不是傳索引（兩處排序若不同，索引會指到別人的收款）',
   /function revRowKey\(r\)\{/.test(src)
   && /if\(r\.tk\) return 'tk:'\+r\.tk;/.test(src)
   && /\.find\(r=>revRowKey\(r\)===key\)/.test(src));
/* 2026-09-15 二修（使用者：「這一筆點選可以直接進去團體課的頁面嗎」）——
   票券列不只跳票券頁，還要切到**對應的分頁**（團課／自主訓練／按摩／折抵券／教練課）。 */
ok('★★★ 商品／場租／重啟跳〔其他〕，票券列跳票券頁並切到對應分頁',
   /if\(kind==='other'\)\{ ppShowRecord\('other'\); return; \}/.test(src)
   && /ppShowRecord\('tickets'\);/.test(src)
   && /if\(kind && typeof TK_POCKETS==='object' && TK_POCKETS\[kind\]\) ppTkTab\(kind\);/.test(src));
ok('★★★ 分頁鍵用 tkClass5（票券夾分頁 TK5 由同一份 TK_POCKETS 產生，不會切到不存在的頁籤）',
   /cls:tkClass5\(t,typeMap\),/.test(src)
   && /const TK5=Object\.keys\(TK_POCKETS\)\.map/.test(src)
   && /const _tkTabs=TK5;/.test(src));
/* 2026-09-21：分頁種類的計算搬進 rvpAct（視窗的「會員資料」那顆），
   兩處清單只負責開視窗，所以這裡改成釘那一支。 */
ok('　　分頁種類的算法只有一份（視窗裡的會員資料鈕）',
   (src.match(/r\.tk\?\(r\.cls\|\|'pt'\):'other'/g)||[]).length===1);
ok('★ 有合計，以及有發票／無發票的拆分', /<div class="nl-sum"><span>合計<\/span><b>\$\{money\(d\.total\)\}<\/b><\/div>/.test(src)
   && /有發票 \$\{money\(d\.inv\)\}　·　無發票 \$\{money\(d\.noInv\)\}/.test(src));
ok('★ 沒有收款時給空狀態，不是空白視窗（截圖那天就是 $0）',
   /<div class="em-t">這一天還沒有收款<\/div>/.test(src));
ok('　　空狀態有講清楚哪些收款會列進來',
   /售出票券、場地租借、票券重啟與商品收款都會列在這裡。/.test(src));
ok('　　姓名與品項有跳脫，不會被資料裡的角括號弄壞版面',
   /const esc=t=>String\(t==null\?'':t\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/<\/g,'&lt;'\)\.replace\(\/>\/g,'&gt;'\);/.test(src));
ok('　　標題跟著檢視的日期走（首頁可以翻到別天）', /const ds=String\(d\.date\|\|''\)\.slice\(5\)\.replace\('-','\/'\);/.test(src));

console.log('\n實跑：彈窗組裝');
{
  const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  let shown=null;
  /* 2026-08-03：列上多了 revAttribChip（業績歸屬 tag），沙箱給替身
     2026-08-08：又多了 revUndoChip（30 分鐘完整退回），一併給替身 */
  /* 2026-08-13：粗體金額只在付款標籤已帶金額時隱藏 —— 沙箱用真的 revAmtDup */
  const _revAmtDup=new Function('return '+g('function revAmtDup(r){','}'))();
  /* 2026-08-24：列的最左邊多了一欄直式卡（revKindCell：新約／續約／分期／抽獎），
     沙箱一併給替身。 */
  /* 2026-09-21：列的可點條件改吃 revRowKey（整列開側滑視窗）——
     ⚠ 沙箱要餵**真的那一支**，不要用替身：它決定哪些列點得下去，
       用替身等於把要驗的東西換掉。（在 index.html 幫某支函式加新依賴時，
       記得回頭搜 tests/ 找出所有抽取點，不然會像這次一樣炸在半路。） */
  const _revRowKey=new Function('return '+g('function revRowKey(r){','\n}'))();
  const fn=new Function('showModal','window','revAttribChip','revPayChip','saleKindChip','revUndoChip','revAmtDup','revKindCell','revRowKey',
    g('function openTodayRevList(){','\n}\n')+'\nreturn openTodayRevList;')(h=>{shown=h;}, globalThis, ()=>'', r=>r.pay?`<span class="mc-rev-pay">${r.pay}</span>`:'', ()=>'', ()=>'', _revAmtDup, r=>r.kind?`<span class="mc-rev-kv">${r.kind}</span>`:'', _revRowKey);

  globalThis._gdRev={date:'2026-08-01',total:12000,inv:9000,noInv:3000,rows:[
    {nm:'王小明',mid:'m1',tk:'TK-a',it:'私人教練課 1V1',amt:9000,inv:true,pay:'現金'},
    {nm:'散客',mid:null,pur:'PUR-b',it:'場地租借',amt:3000,inv:false,pay:'匯款'},
  ]};
  fn();
  ok('★ 兩筆都畫出來', /王小明/.test(shown) && /場地租借/.test(shown));
  ok('★ 標題帶日期與筆數', /08\/01 營收（2 筆）/.test(shown));
  ok('★ 列上沒有發票標籤、有付款方式（0803 兩修）',
     !/mc-rev-inv/.test(shown) && /現金/.test(shown) && /匯款/.test(shown));
  /* 2026-09-21：可點條件從「有綁會員」改成「有鍵值」——
     沒綁會員的收款列（場租、商品）一樣有付款方式與退回要處理，現在也進得去。 */
  ok('★★ 兩列都點得開，各自帶自己的鍵值',
     /revRowPanel\('tk:TK-a'\)/.test(shown) && /revRowPanel\('pur:PUR-b'\)/.test(shown)
     && (shown.match(/mc-rev-go/g)||[]).length===2);
  {
    /* 真的沒有鍵值的列（既不是票券也不是收款）仍然不可點 —— 不能因為改版就變成
       每一列都掛一個點了沒反應的 onclick。 */
    const keep=globalThis._gdRev;
    globalThis._gdRev={date:'2026-08-01',total:0,inv:0,noInv:0,
      rows:[{nm:'無來源',mid:'m9',it:'—',amt:0}]};
    fn();
    ok('★★ 沒有鍵值的列不可點', !/mc-rev-go/.test(shown) && !/revRowPanel/.test(shown));
    globalThis._gdRev=keep; fn();
  }
  ok('★ 合計與拆分正確', /\$12,000/.test(shown) && /有發票 \$9,000　·　無發票 \$3,000/.test(shown));

  globalThis._gdRev={date:'2026-08-01',total:0,inv:0,noInv:0,rows:[]};
  fn();
  ok('★ 沒有收款 → 空狀態，標題不掛筆數', /這一天還沒有收款/.test(shown) && !/（0 筆）/.test(shown));

  globalThis._gdRev=undefined;
  fn();
  ok('　　完全沒有資料也不會爆', /這一天還沒有收款/.test(shown));

  globalThis._gdRev={date:'2026-08-01',total:100,inv:0,noInv:100,rows:[{nm:'<img src=x>',mid:null,it:'商品',amt:100,inv:false}]};
  fn();
  ok('　　姓名裡的標籤被跳脫', /&lt;img src=x&gt;/.test(shown) && !/<img src=x>/.test(shown));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
