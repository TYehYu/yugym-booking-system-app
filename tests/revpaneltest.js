/* 2026-09-21 使用者指示：「營收明細這邊改成 點取向左展出一個小視窗 把功能都收在
   這個小視窗裡面顯示會員名字 購買方案 發票號碼 金額
   按鈕[會員資料][約別][業績歸屬][付款方式][退回]」

   ⚠ 這支把 revRowPanel 真的組出來檢查，不是比對字串：
     五顆鈕裡有兩顆會動到錢（約別影響續約獎金、退回會整筆撤銷收款），
     「該不該給按」寫錯不會讓任何語法檢查變紅。
   ⚠ 重點在「不能用的要暗化＋寫原因，不可以隱藏」（yugym-disabled-with-reason）——
     櫃檯看不到按鈕會以為功能壞了，看到灰的才知道是條件不符。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 沙箱：餵真的 revRowKey／revRowFind，其餘給最小替身。
   desk 決定「有沒有櫃檯權限」，用來驗兩種身分看到的按鈕狀態。 */
function build(row, desk){
  let shown='', placed='none';
  const win={_gdRev:{rows:[row]}, _revCoachTag:{c1:'小曾'}};
  /* rvpPlace 給替身：真正的定位要量 DOM，這裡只確認「有被呼叫、而且帶著錨點」。
     ⚠ 沒餵的話整支會 ReferenceError —— 在 index.html 幫函式加新依賴時，
       記得回頭搜 tests/ 把每個抽取點都補上。 */
  const fn=new Function('showModal','window','escH','isDeskLike','SALE_KIND_LB','saleUndoOk',
    'revRowKey','revRowFind','rvpPlace','closeModal',
    g('function revRowPanel(key, ev){','\n}\n')+'\nreturn revRowPanel;')(
    h=>{shown=h;}, win,
    t=>String(t==null?'':t), ()=>desk,
    {new:'新約',renewal:'續約',installment:'分期'},
    at=>at==='today',
    new Function('return '+g('function revRowKey(r){','\n}'))(),
    r=>row,
    a=>{placed=a?'anchored':'centered';}, ()=>{});
  fn('k');
  return {html:shown, win, placed};
}
/* 從產出的 HTML 抓某顆鈕：回傳 {on, sub}
   ⚠ 中間那段要寫成「不可以跨過下一個 <button」——用單純的惰性比對 [\s\S]*? 的話，
     它會從**第一顆**按鈕開始一路延伸到目標標題，於是每一顆讀到的都是第一顆的 class。
     （寫這支時就踩到：第一顆「會員資料」可按，後面四顆全被誤判成可按。） */
function btn(html, title){
  const re=new RegExp('<button class="rvp-btn([^"]*)"((?:(?!<button)[\\s\\S])*?)'
    +'<span class="rvp-btn-t">'+title+'</span>\\s*<span class="rvp-btn-s">([^<]*)</span>');
  const m=re.exec(html);
  if(!m) return null;
  return {on:!/\boff\b/.test(m[1]), sub:m[3], attrs:m[2]};
}

const FULL={nm:'林純宇', mid:'m1', tk:'TK-a', cls:'group', it:'團課 4週優惠',
  amt:1600, invNo:'FX28688375', kind:'renewal', att:'c1', attKind:'tk', attRef:'TK-a',
  pay:'匯款', payRef:'PUR-1', at:'today'};

console.log('① 視窗要顯示的四項資訊');
{
  const {html}=build(FULL, true);
  ok('★★★ 會員名字', /<span class="rvp-nm">林純宇<\/span>/.test(html));
  ok('★★★ 購買方案', /購買方案<\/span><span class="rvp-v">團課 4週優惠</.test(html));
  ok('★★★ 發票號碼', /發票號碼<\/span>\s*<span class="rvp-v">FX28688375</.test(html));
  ok('★★★ 金額', /金額<\/span><span class="rvp-v rvp-amt">\$1,600</.test(html));
  ok('★ 約別也標在名字旁（一眼看得到這筆算不算續約）',
     /<span class="rvp-kind">續約<\/span>/.test(html));
}

console.log('\n② 五顆按鈕（條件齊備時全部可按）');
{
  const {html}=build(FULL, true);
  for(const [t,expect] of [['會員資料','開啟票券夾'],['約別','續約'],
      ['業績歸屬','小曾'],['付款方式','匯款'],['退回','整筆退回（輸入錯誤時用）']]){
    const b=btn(html,t);
    ok('★★ '+t+' 可按，副標寫現況：'+expect, !!b && b.on && b.sub.indexOf(expect)>=0,
       b?{on:b.on,sub:b.sub}:'找不到這顆鈕');
  }
  ok('★ 退回用品牌紅（破壞性操作）', /class="rvp-btn[^"]*rvp-undo"/.test(html));
}

console.log('\n③ 不能用的要暗化＋寫原因，不可以隱藏');
{
  // 沒綁會員、不是票券、沒有收款紀錄、過了當天
  const BARE={nm:'散客', mid:null, pur:'PUR-9', it:'場地租借', amt:200, at:'2026-08-01'};
  const {html}=build(BARE, true);
  for(const [t,why] of [['會員資料','這一筆沒有綁定會員'],['約別','只有教練課類的票券有約別'],
      ['業績歸屬','這一筆不計入教練業績'],['付款方式','找不到對應的收款紀錄'],
      ['退回','只能在收款當天退回']]){
    const b=btn(html,t);
    ok('★★★ '+t+' 暗化且寫出原因', !!b && !b.on && b.sub===why, b?{on:b.on,sub:b.sub}:'不見了');
  }
  /* ⚠ 要釘 class="rvp-btn 後面接空白或引號 —— 只寫 class="rvp-btn 會把每顆鈕裡的
     rvp-btn-b／-t／-s／-go 四個 span 一起數進去（實際數到 25）。 */
  ok('★★★ 五顆都還在畫面上（不能用 ≠ 隱藏）',
     (html.match(/class="rvp-btn[ "]/g)||[]).length===5,
     (html.match(/class="rvp-btn[ "]/g)||[]).length);
  ok('★★ 不能按的真的按不下去（disabled，不是只有看起來灰）',
     (html.match(/disabled/g)||[]).length===5 && !/rvpAct/.test(html));
  ok('★ 沒開發票的列寫「沒開發票」而不是空白',
     /發票號碼<\/span>\s*<span class="rvp-v rvp-dim">沒開發票</.test(html));
}

console.log('\n④ 權限：非櫃檯只看得到「會員資料」');
{
  const {html}=build(FULL, false);
  ok('★★ 會員資料仍可按', (btn(html,'會員資料')||{}).on===true);
  for(const t of ['約別','業績歸屬','付款方式','退回']){
    const b=btn(html,t);
    ok('★★★ '+t+' 對非櫃檯暗化並說明權限', !!b && !b.on && b.sub==='需要櫃檯以上權限',
       b?{on:b.on,sub:b.sub}:'不見了');
  }
}

console.log('\n⑤ 小浮層與派工');
{
  const {html,win,placed}=build(FULL, true);
  /* 2026-09-21 二修（使用者：「視窗太大了吧 幫我改成小視窗 從卡片往左放大縮放」）——
     不再用 .modal-side（560px 滿高抽屜），改成貼著卡片的小浮層。 */
  ok('★★★ 不是滿高的側滑抽屜', win._modalSideUntilClose===false);
  ok('★★★ 開完會去定位（從卡片長出來）', placed!=='none');
  ok('★★ 關閉鈕在標題列右上角，不佔一整列',
     /<button class="rvp-x" onclick="closeModal\(\)"/.test(html) && !/modal-foot/.test(html));
  ok('★★ 每顆鈕都帶著同一個鍵值去派工', (html.match(/rvpAct\('[a-z]+','k'\)/g)||[]).length===5);
  const act=g('function rvpAct(what, key){','\n}');
  ok('★★★ 派工前先關掉側滑 —— 接著開的選擇視窗要是置中彈窗，不是滿高的滑出視窗',
     /window\._modalSideUntilClose=false;/.test(act)
     && act.indexOf('_modalSideUntilClose=false')<act.indexOf("what==='mem'"));
  ok('★★★ 五種派工都接到既有的那一支（沒有另寫一份邏輯）',
     /revRowGo\(r\.mid,/.test(act) && /openSaleKindPick\(r\.tk\)/.test(act)
     && /openRevAttribPick\(r\.attKind, r\.attRef\)/.test(act)
     && /openRevPayPick\(r\.payRef\)/.test(act)
     && /openSaleUndo\(r\.tk\?\('tk:'\+r\.tk\):\('pur:'\+r\.pur\)\)/.test(act));
}

console.log('\n⑥ 鍵值（兩處清單共用同一份資料，不能用索引）');
{
  const k=new Function('return '+g('function revRowKey(r){','\n}'))();
  ok('★★ 票券列用票號', k({tk:'TK-1'})==='tk:TK-1');
  ok('★★ 收款列用收款號', k({pur:'PUR-1'})==='pur:PUR-1');
  ok('★★ 抽獎列用抽獎號', k({lot:'LOT-1'})==='lot:LOT-1');
  ok('★ 都沒有就退回付款參照', k({payRef:'P-1'})==='pay:P-1');
  ok('★★★ 什麼都沒有 → 空字串（列不可點，不掛一個按了沒反應的 onclick）',
     k({nm:'x'})==='' && k(null)==='');
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
