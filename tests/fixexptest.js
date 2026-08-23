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

console.log('\n② 沒設定過就帶上個月的當草稿（只有固定支出會帶）');
{
  /* 2026-08-08 追加：「其他支出也要可以新增，但就不用延續到下個月」
     → 同一支 openExpenseEditor(ym, isFixed) 兩用，固定／其他各一個薄包裝。 */
  const F=grabFn('openExpenseEditor');
  ok('★★ 一支兩用，固定／其他各一個入口',
     /async function openFixedExpenses\(ym\)\{ return openExpenseEditor\(ym, true\); \}/.test(src)
     && /async function openOtherExpenses\(ym\)\{ return openExpenseEditor\(ym, false\); \}/.test(src));
  ok('★★ 依 isFixed 撈對應的那一種', /mine=all\.filter\(e=>e&&e\.ym===month&&\(e\.is_fixed===true\)===fx\)/.test(F));
  ok('★★ 只有固定支出會沿用上個月',
     /if\(fx && !mine\.length\)\{\n\s*const pm=prevYm\(month\);/.test(F)
     && /const prev=all\.filter\(e=>e&&e\.ym===pm&&e\.is_fixed===true\);/.test(F));
  ok('★★ 其他支出不帶入（一次性的，帶過來就是重複入帳）',
     /只有固定支出會沿用上個月；其他支出是一次性的，帶過來只會變成重複入帳/.test(F));
  ok('★★ 帶進來的是草稿：id 留空，按儲存才會真的建立',
     /mine=prev\.map\(e=>\(\{id:'', category:e\.category\|\|'', amount:Number\(e\.amount\)\|\|0,/.test(F)
     && /\/\/ 只是草稿：id 留空，按下儲存才會真的建立/.test(F));
  ok('★ 畫面上標明「本月還沒設定過，已帶入 X 月」',
     /本月還沒設定過，已帶入 <b>\$\{d\.from\.replace\('-','\/'\)\}<\/b> 的項目與金額。/.test(src));
  ok('★ 空的月份至少給一列可以打字', /rows:mine\.length\?mine:\[\{\.\.\.blank\}\]/.test(F));
  ok('★ 只有櫃檯／管理員能設定',
     /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可設定'\); return; \}/.test(F));
  ok('　　為什麼不全自動寫入，寫在原地',
     /確認金額後按儲存才真的寫進去 —— 沒有人按過就不會憑空生出一筆支出。/.test(src));
}

console.log('\n②-2 其他支出：多一個日期欄、不延續');
{
  const F=grabFn('openExpenseEditor');
  ok('★★ 其他支出要記是哪一天花的（清單本來就照日期排）',
     /note:e\.note\|\|'', date:String\(e\.date\|\|''\)\.slice\(0,10\)\|\|defDate/.test(F));
  ok('★ 預設日期：這個月就用今天，不然用月初',
     /const defDate=\(String\(_today\)\.slice\(0,7\)===month\)\?_today:\(month\+'-01'\);   \/\/ 這個月就用今天，不然用月初/.test(F));
  /* 2026-08-23：日期欄從原生 <input type=date> 換成自家 adp-field（short＝只寫 月/日）——
     原生欄位的文字格式改不了，iOS 一律吐「2026年8月8日」，把整欄撐爆。 */
  ok('★★ 畫面上多一欄日期（固定支出沒有），且只顯示 月/日',
     /\$\{fx\?'':`<span class="fx-in fx-dwrap">\$\{ashDateField\('fxd'\+i, r\.date\|\|'', d\.month\+'-01', `fxSet\(\$\{i\},'date',this\.value\)`, \{short:true\}\)\}<\/span>`\}/.test(src)
     && /\$\{fx\?'':'<span>日期<\/span>'\}/.test(src)
     && /if\(short\) return `\$\{d\.getMonth\(\)\+1\}\/\$\{d\.getDate\(\)\}`;/.test(src));
  ok('★ 標題與說明跟著換，並講明「不會帶到下個月」',
     /\$\{fx\?'固定支出設定':'其他支出'\}/.test(src)
     && /耗材、設備、修繕這種一次性的開銷。<b>不會<\/b>帶到下個月 —— 每個月各自登記各自的。/.test(src));
  /* ✕ 那一欄 0823 拿掉（改成向左滑出現「刪除」），所以各少一欄 */
  ok('★ 版面：其他支出三欄、固定支出兩欄',
     /\.fx-3 \.fx-head,\.fx-3 \.fx-row\{grid-template-columns:120px 1fr 120px;\}/.test(src)
     && /\.fx-head,\.fx-row\{display:grid;grid-template-columns:1fr 130px;/.test(src)
     && /<div class="fx-list\$\{fx\?'':' fx-3'\}">/.test(src));
}

console.log('\n③ 改數字／加項目／減項目');
{
  /* 2026-08-23 使用者指示：「單筆刪除做成向左滑出現 [刪除] 紅底，點選刪除才移除，
     這樣可以不用顯示那個 ✕」—— 常駐的破壞性按鈕退場，改成滑出來的紅底鈕。 */
  ok('★★ 一列一項，直接在格子裡改（項目名稱＋金額）',
     /<input class="fx-in" value="\$\{escH\(r\.category\)\}" placeholder="\$\{fx\?'例：房租':'例：清潔用品'\}" oninput="fxSet\(\$\{i\},'category',this\.value\)">/.test(src)
     && /<input class="fx-in num" type="number" min="0" step="1" value="\$\{Number\(r\.amount\)\|\|0\}" oninput="fxSet\(\$\{i\},'amount',this\.value\)">/.test(src)
     && !/<button class="fx-del"/.test(src));
  ok('★★ 刪除改成向左滑出現的紅底鈕，點它才真的移除',
     /<button type="button" class="fx-swdel" onclick="fxDel\(\$\{i\}\)">刪除<\/button>/.test(src)
     && /\.fx-swdel\{position:absolute;top:0;right:0;bottom:0;width:76px;z-index:0;/.test(src)
     && /\.fx-swipe\.open \.fx-row\{transform:translateX\(-76px\);\}/.test(src));
  ok('★★ 刪除鈕要排在 .fx-row 之前，不然會蓋在輸入框上面',
     /<div class="fx-swipe" data-i="\$\{i\}">\s*\n\s*<button type="button" class="fx-swdel"/.test(src));
  ok('★★ .fx-row 底色必須不透明，不然滑動時會透出下面的紅色',
     /\.fx-swipe \.fx-row\{border-bottom:none;background:var\(--card\);/.test(src));
  ok('★★ 只認橫向手勢（清單本身可捲，不判軸就捲不動了），而且一次只開一列',
     /axis = Math\.abs\(dx\)>Math\.abs\(dy\) \? 'x' : 'y';/.test(src)
     && /if\(axis!=='x'\) return;/.test(src)
     && /const closeAll=\(except\)=>/.test(src));
  ok('　　桌機沒有觸控 → 滑鼠移到列上就把刪除鈕推出來（不然刪不掉）',
     /桌機沒有觸控：滑不動就刪不掉/.test(src));
  ok('★ ＋新增一項', /onclick="fxAdd\(\)">＋ 新增一項<\/button>/.test(src));
  ok('★ 最上面一列是欄名（✕ 那一格已隨滑動刪除拿掉）',
     /<div class="fx-head">\$\{fx\?'':'<span>日期<\/span>'\}<span>項目<\/span><span>金額<\/span><\/div>/.test(src));
  const SET=grabFn('fxSet');
  ok('★★ 打字時只更新合計，不重畫整張表（不然游標會跳掉）',
     /const el=document\.querySelector\('\.fx-sum b'\); if\(el\) el\.textContent=/.test(SET)
     && /只更新合計，不重畫整張表 —— 重畫會讓正在打字的欄位失焦/.test(SET));
  const DEL=grabFn('fxDel');
  ok('★ 刪到一列不剩時自動補一列空的（不會變成沒得打字）',
     /if\(!d\.rows\.length\) d\.rows\.push\(\{\.\.\.d\.blank\}\);/.test(DEL));
  ok('★ 合計即時看得到', /<div class="fx-sum"><span>本月\$\{fx\?'固定':'其他'\}支出合計<\/span><b>\$\$\{Math\.round\(total\)\.toLocaleString\(\)\}<\/b><\/div>/.test(src));
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
  ok('★★ 固定支出記月初、其他支出記實際那一天',
     /const _date=d\.fx \? \(d\.month\+'-01'\) : \(String\(r\.date\|\|''\)\.slice\(0,10\)\|\|\(d\.month\+'-01'\)\);/.test(F)
     && /is_fixed:!!d\.fx,/.test(F));
  ok('　　為什麼固定支出不記日期，寫在原地',
     /固定支出一律記月初（它講的是「這個月」不是「哪一天」）；/.test(F));
  ok('★ 寫完清快取並重畫', /dbCacheClear\('expenses'\);/.test(F) && /navTo\(CUR_PAGE\);/.test(F));
  ok('　　防連點', /async function fxSave\(\)\{ return onceAct\('fxsave', _fxSave\); \}/.test(src));
}

console.log('\n⑤ 從哪裡進得去');
ok('★★ 損益表的「固定支出」那一列點得動',
   /<button class="pnl-link" onclick="openFixedExpenses\('\$\{ym\}'\)">固定支出<span style="color:var\(--t3\);font-weight:400;"> 　點我設定<\/span><\/button>/.test(src));
ok('★ 支出頁也有一顆設定鈕（講明可加減項目、下月自動帶入）',
   /onclick="openFixedExpenses\('\$\{month\}'\)">⚙ 固定支出設定（可加減項目・下月自動帶入）<\/button>/.test(src));
ok('★★ 其他支出也有入口，並講明不延續',
   /<tr class="pnl-h pnl-out"><td><button class="pnl-link" onclick="openOtherExpenses\('\$\{ym\}'\)">其他支出<span style="color:var\(--t3\);font-weight:400;"> 　點我登記<\/span><\/button><\/td>/.test(src)
   && /onclick="openOtherExpenses\('\$\{month\}'\)">⚙ 其他支出（一次登記多筆・不延續到下個月）<\/button>/.test(src));
ok('★ 原本的一鍵沿用沒被拿掉（習慣那條路的人照舊）',
   /async function finExpenseCopyPrev\(\)\{/.test(src));
ok('　　使用者的原話寫在程式裡',
   /「固定支出的部分設計成讓我可以調整數字、新增或減少項目，\s*\n\s*然後每個月會抓前一個月設定的數字」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
