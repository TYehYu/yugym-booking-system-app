/* 2026-08-08 使用者指示：「固定支出的部分設計成讓我可以調整數字、新增或減少項目，
   然後每個月會抓前一個月設定的數字」

   原本要一筆一筆開視窗編輯，加一項要按「＋新增」再填日期／項目／備註／金額，
   沿用上個月則是另一顆按鈕、複製完還要逐筆點進去改金額。
   房租、水電、網路這種每個月都有、只是金額動一點的東西，那樣操作太重。

   改成一張直接改的表：一列一項、改數字、＋新增、✕刪除，一次存好。
   開一個還沒設定過的月份時，自動帶入上個月的項目與金額當**草稿**（畫面會標明），
   確認後按儲存才真的寫進去 —— 沒有人按過就不會憑空生出一筆支出。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 上個月是哪個月');
{
  const F=new Function(grabFn('prevYm')+'\nreturn prevYm;')();
  eq('★ 一般情況', F('2026-08'), '2026-07');
  eq('★★ 跨年：1 月的上月是去年 12 月', F('2026-01'), '2025-12');
  eq('　　補零', F('2026-11'), '2026-10');
}

console.log('\n② 沒設定過就帶上個月的當草稿');
{
  const F=grabFn('openFixedExpenses');
  ok('★★ 本月有資料就用本月的', /mine=all\.filter\(e=>e&&e\.ym===month&&e\.is_fixed===true\)/.test(F));
  ok('★★ 本月沒有 → 抓上個月的項目與金額',
     /if\(!mine\.length\)\{\n\s*const pm=prevYm\(month\);/.test(F)
     && /const prev=all\.filter\(e=>e&&e\.ym===pm&&e\.is_fixed===true\);/.test(F));
  ok('★★ 帶進來的是草稿：id 留空，按儲存才會真的建立',
     /mine=prev\.map\(e=>\(\{id:'', category:e\.category\|\|'', amount:Number\(e\.amount\)\|\|0, note:e\.note\|\|''\}\)\);/.test(F)
     && /\/\/ 只是草稿：id 留空，按下儲存才會真的建立/.test(F));
  ok('★ 畫面上標明「本月還沒設定過，已帶入 X 月」',
     /本月還沒設定過，已帶入 <b>\$\{d\.from\.replace\('-','\/'\)\}<\/b> 的項目與金額。/.test(src));
  ok('★ 空的月份至少給一列可以打字', /rows:mine\.length\?mine:\[\{id:'',category:'',amount:0,note:''\}\]/.test(F));
  ok('★ 只有櫃檯／管理員能設定',
     /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可設定'\); return; \}/.test(F));
  ok('　　為什麼不全自動寫入，寫在原地',
     /確認金額後按儲存才真的寫進去 —— 沒有人按過就不會憑空生出一筆支出。/.test(src));
}

console.log('\n③ 改數字／加項目／減項目');
{
  ok('★★ 一列一項，直接在格子裡改（項目名稱＋金額＋刪除）',
     /<input class="fx-in" value="\$\{escH\(r\.category\)\}" placeholder="例：房租" oninput="fxSet\(\$\{i\},'category',this\.value\)">/.test(src)
     && /<input class="fx-in num" type="number" min="0" step="1" value="\$\{Number\(r\.amount\)\|\|0\}" oninput="fxSet\(\$\{i\},'amount',this\.value\)">/.test(src)
     && /<button class="fx-del" title="刪除這一項" onclick="fxDel\(\$\{i\}\)">✕<\/button>/.test(src));
  ok('★ ＋新增一項', /onclick="fxAdd\(\)">＋ 新增一項<\/button>/.test(src));
  ok('★ 最上面一列是欄名', /<div class="fx-head"><span>項目<\/span><span>每月金額<\/span><span><\/span><\/div>/.test(src));
  const SET=grabFn('fxSet');
  ok('★★ 打字時只更新合計，不重畫整張表（不然游標會跳掉）',
     /const el=document\.querySelector\('\.fx-sum b'\); if\(el\) el\.textContent=/.test(SET)
     && /只更新合計，不重畫整張表 —— 重畫會讓正在打字的欄位失焦/.test(SET));
  const DEL=grabFn('fxDel');
  ok('★ 刪到一列不剩時自動補一列空的（不會變成沒得打字）',
     /if\(!d\.rows\.length\) d\.rows\.push\(\{id:'',category:'',amount:0,note:''\}\);/.test(DEL));
  ok('★ 合計即時看得到', /<div class="fx-sum"><span>本月固定支出合計<\/span><b>\$\$\{Math\.round\(total\)\.toLocaleString\(\)\}<\/b><\/div>/.test(src));
}

console.log('\n④ 儲存：新增／修改／刪除一次到位');
{
  const F=grabFn('_fxSave');
  ok('★★ 沒填名稱或金額 0 的當作沒這一項',
     /\.filter\(r=>r\.category && r\.amount>0\);   \/\/ 沒填名稱或金額 0 的當作沒這一項/.test(F));
  ok('★★ 被刪掉的真的刪掉（比對原本有哪些 id）',
     /const keep=new Set\(rows\.filter\(r=>r\.id\)\.map\(r=>r\.id\)\);/.test(F)
     && /for\(const id of \(d\.orig\|\|\[\]\)\) if\(!keep\.has\(id\)\) await dbDel\('expenses',id\);/.test(F));
  ok('★★ 原本就有的用原 id 更新、草稿的才給新 id',
     /id:r\.id\|\|uid\('EXP'\)/.test(F));
  ok('★ 一律寫成本月的固定支出', /ym:d\.month, date:d\.month\+'-01',[\s\S]{0,120}is_fixed:true,/.test(F));
  ok('★ 寫完清快取並重畫', /dbCacheClear\('expenses'\);/.test(F) && /navTo\(CUR_PAGE\);/.test(F));
  ok('　　防連點', /async function fxSave\(\)\{ return onceAct\('fxsave', _fxSave\); \}/.test(src));
}

console.log('\n⑤ 從哪裡進得去');
ok('★★ 損益表的「固定支出」那一列點得動',
   /<button class="pnl-link" onclick="openFixedExpenses\('\$\{ym\}'\)">固定支出<span style="color:var\(--t3\);font-weight:400;"> 　點我設定<\/span><\/button>/.test(src));
ok('★ 支出頁也有一顆設定鈕（講明可加減項目、下月自動帶入）',
   /onclick="openFixedExpenses\('\$\{month\}'\)">⚙ 固定支出設定（可加減項目・下月自動帶入）<\/button>/.test(src));
ok('★ 原本的一鍵沿用沒被拿掉（習慣那條路的人照舊）',
   /async function finExpenseCopyPrev\(\)\{/.test(src));
ok('　　使用者的原話寫在程式裡',
   /「固定支出的部分設計成讓我可以調整數字、新增或減少項目，\s*\n\s*然後每個月會抓前一個月設定的數字」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
