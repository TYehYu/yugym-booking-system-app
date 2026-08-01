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
ok('★ 每一列：姓名／品項／發票章／金額', /<span class="mc-rev-nm">\$\{esc\(r\.nm\)\}<\/span><span class="mc-rev-it">\$\{esc\(r\.it\)\}<\/span>/.test(src)
   && /\$\{r\.inv\?'<span class="mc-rev-inv">發票<\/span>':''\}/.test(src));
ok('★ 有綁會員的列點下去跳到他的票券頁', /onclick="closeModal\(\);revRowGo\('\$\{r\.mid\}'\)"/.test(src));
ok('　　revRowGo 就是開會員資料並切到票券分頁', /async function revRowGo\(mid\)\{[\s\S]{0,160}ppShowRecord\('tickets'\)/.test(src));
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
  const fn=new Function('showModal','window',
    g('function openTodayRevList(){','\n}\n')+'\nreturn openTodayRevList;')(h=>{shown=h;}, globalThis);

  globalThis._gdRev={date:'2026-08-01',total:12000,inv:9000,noInv:3000,rows:[
    {nm:'王小明',mid:'m1',it:'私人教練課 1V1',amt:9000,inv:true},
    {nm:'散客',mid:null,it:'場地租借',amt:3000,inv:false},
  ]};
  fn();
  ok('★ 兩筆都畫出來', /王小明/.test(shown) && /場地租借/.test(shown));
  ok('★ 標題帶日期與筆數', /08\/01 營收（2 筆）/.test(shown));
  ok('★ 有發票的那筆掛發票章、沒有的不掛',
     (shown.match(/mc-rev-inv/g)||[]).length===1);
  ok('★ 有會員的可點、散客不可點',
     /revRowGo\('m1'\)/.test(shown) && (shown.match(/mc-rev-go/g)||[]).length===1);
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
