'use strict';
/* 特休三個視窗改版（2026-11-27，統一介面第一批）：只改呈現。
   ① 年度結算名單：桌機表格＋手機一人一卡；② 個別員工結算；③ 特休明細與編輯。
   真的執行三個視窗函式（假員工、假資料），檢查結構、必要資訊、操作入口與 id 都還在，
   並釘住「計算與寫入」的關鍵運算式沒被動到。基底對照見 docs/handoff/leave-ui-1/leave_logic_equiv.js。 */
const fs=require('fs'), vm=require('vm'), assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fnSrc(name){
  const m=new RegExp('(?:async )?function '+name+'\\(').exec(src); assert(m,'找不到 '+name);
  let d=0,k=src.indexOf('{',m.index);
  for(;;k++){ if(src[k]==='{')d++; if(src[k]==='}'&&--d===0)break; }
  return src.slice(m.index,k+1);
}
const NAMES=['escH','annualLeaveAccount','openLeaveSettlement','openLeaveSettleOne','settlePreview','confirmLeaveSettle','openLeaveEdit','saveLeave','leaveCashoutHourly'];
const modals=[], nodes={}; let checked=null, EMPTY=false;
const emps={
  a:{id:'a',name:'王小明',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:12,al_earned_hours:56,base_salary:30000},
  b:{id:'b',name:'歐陽鈺翎・Christopher Alexander Montgomery',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:0,al_earned_hours:0,base_salary:30000},
  c:{id:'c',name:'林依晨',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:7.5,al_earned_hours:42.25,base_salary:30000},
  d:{id:'d',name:'黃已結算',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:10,al_earned_hours:40,base_salary:30000},
  r:{id:'r',name:'離職員工',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:0,al_earned_hours:56,base_salary:30000,_resigned:true},
};
const c={ window:{_leaveYear:2026,SALARY_TPL:{}}, TODAY:new Date(2026,10,27), SESSION:{name:'櫃台'}, console, setTimeout:()=>0,
  uid:p=>p+'-1', LEAVE_HOURS_PER_DAY:8, FT_MONTHLY_HOURS:130, normEmp:x=>x||'full_time',
  EMP_RULES:{full_time:{label:'正職教練',leaveApplicable:true}}, effRates:()=>({duty_hourly:300}), calcSeniority:()=>({years:4,days:1637}),
  statutoryAnnualLeave:()=>14,
  earnedLeaveForYear:e=>e._resigned?{hours:41.5,prorated:true,ratio:.5,inService:181,daysInYear:365,fullHours:84,resignDate:'2026-06-30'}:{hours:Number(e.al_earned_hours)||0,prorated:false},
  _hrStaffList:async()=>EMPTY?[]:Object.values(emps),
  dbGetAll:async t=>t==='leave_settlements'?[{emp_id:'d',year:'2026',carry_forward_hours:25.5,cashout_hours:10}]:[],
  dbGet:async(t,id)=>JSON.parse(JSON.stringify(emps[id]||null)),
  dbPut:async()=>{}, showModal:h=>modals.push(h), closeModal(){}, showToast(){}, navTo(){},
  document:{getElementById:id=>(nodes[id]=nodes[id]||{style:{},innerHTML:''}), querySelector:s=>(/:checked/.test(s)&&checked)?{value:checked}:null} };
vm.createContext(c);
vm.runInContext(NAMES.map(fnSrc).join('\n')+'\nthis.F={'+NAMES.join(',')+'};',c);
let n=0; const test=(l,f)=>{ return Promise.resolve(f()).then(()=>{n++;console.log('✓ '+l);}); };
const body=h=>h.replace(/<[^>]*>/g,' ');
(async()=>{
  await c.F.openLeaveSettlement(); const L=modals.pop();
  await test('名單：規格視窗（寬版）、標題／年度、內容可捲動區、底部按鈕列用 ui-modal-foot',()=>{
    assert(L.includes('class="ui-modal ui-modal--wide"')&&L.includes('ui-modal-title')&&L.includes('2026 年度')&&L.includes('ui-modal-body')&&L.includes('class="ui-modal-foot"'));
    assert(!/class="modal-foot"/.test(L)); });
  await test('名單：桌機是表格（欄位：姓名、去年結轉剩餘、本年新增剩餘、剩餘合計、狀態／操作），數字欄靠右',()=>{
    assert(L.includes('ui-table ui-table--compact ui-desk-only'));
    ['姓名','去年結轉剩餘','本年新增剩餘','剩餘合計','狀態／操作'].forEach(t=>assert(L.includes(t),t));
    assert((L.match(/class="ui-num"/g)||[]).length>=15); });
  await test('名單：手機是一人一卡（ui-lvcard），每人 5 張卡；姓名在自己一行不拆行，全名放 title',()=>{
    assert.equal((L.match(/class="ui-card ui-lvcard"/g)||[]).length,5);
    assert(L.includes('class="ui-lvlist ui-mob-only"'));
    assert(L.includes('title="歐陽鈺翎・Christopher Alexander Montgomery"'));
    assert(/\.ui-lvcard__name\{[^}]*white-space:nowrap/.test(src)); });
  await test('名單：每張卡列出去年結轉、本年新增、剩餘合計與結算狀態',()=>{
    const card=L.slice(L.indexOf('class="ui-card ui-lvcard"'));
    ['去年結轉剩餘','本年新增剩餘','剩餘合計','待結算'].forEach(t=>assert(card.includes(t),t)); assert(L.includes('已結算')); });
  await test('名單：小數時數、零餘額、已結算（結轉／折薪）都顯示',()=>{
    assert(L.includes('42.25')&&L.includes('7.5')&&/結轉 25\.5h · 折薪 10h/.test(L));
    assert(/<b>0<\/b>/.test(L)||body(L).includes(' 0 ')); });
  await test('名單：尚未結算的有「結算」鈕，onclick 沿用 openLeaveSettleOne(id, 年度)；已結算的沒有',()=>{
    assert(/onclick="openLeaveSettleOne\('a',2026\)"/.test(L)); assert(!/openLeaveSettleOne\('d',2026\)/.test(L)); });
  await test('名單：確認前的說明（去年結轉一律折薪歸零、本年新增可折薪或結轉、折薪為估算）都還在',()=>{
    const t=body(L).replace(/\s+/g,''); ['去年結轉剩餘一律折薪歸零','本年新增剩餘可選折薪或結轉至2027年','折薪金額為系統估算'].forEach(x=>assert(t.includes(x),x)); });
  EMPTY=true; await c.F.openLeaveSettlement(); const E0=modals.pop(); EMPTY=false;
  await test('名單無資料：顯示空狀態文字、仍有說明與關閉鈕',()=>{ assert(E0.includes('ui-empty')&&E0.includes('本年度無適用特休的員工')&&E0.includes('closeModal()')); assert(!E0.includes('ui-table')); });

  await c.F.openLeaveSettleOne('a',2026); const S=modals.pop();
  await test('個別結算：規格視窗；摘要卡、折薪提示、處理方式、結算結果框、底部按鈕都在內容區之外／之內的正確位置',()=>{
    assert(S.includes('class="ui-modal"')&&S.includes('年度結算 · 王小明')&&S.includes('ui-modal-sub')&&S.includes('ui-modal-body')&&S.includes('class="ui-modal-foot"'));
    assert(S.indexOf('ui-modal-foot')>S.indexOf('settle-preview')); assert(!/class="modal-foot"/.test(S)); });
  await test('個別結算：必要資訊與操作入口保留（id、radio name／value、onchange、確認鈕 disabled 起始狀態）',()=>{
    ['去年結轉剩餘','本年新增剩餘','折薪估算時薪','→ 折薪歸零','折薪估算：','如何處理？','結轉至 2027 年','折薪'].forEach(t=>assert(S.includes(t),t));
    assert(/name="earnedDisp" value="carry" onchange="settlePreview\(\)"/.test(S)&&/name="earnedDisp" value="cash" onchange="settlePreview\(\)"/.test(S));
    assert(S.includes('id="settle-preview"')&&S.includes('id="settle-confirm" onclick="confirmLeaveSettle()"')&&/id="settle-confirm"[^>]*disabled/.test(S));
    assert(S.includes("onclick=\"openLeaveSettlement()\">‹ 返回")); });
  await c.F.openLeaveSettleOne('r',2026); const R=modals.pop();
  await test('離職者：離職提示（折算算式）與「離職一律折薪」保留，沒有結轉選項，確認鈕可按',()=>{
    assert(R.includes('離職')&&R.includes('41.5h')&&R.includes('離職一律折薪')&&!R.includes('name="earnedDisp"')&&!/id="settle-confirm"[^>]*disabled/.test(R)); });
  await c.F.openLeaveSettleOne('b',2026); const Z=modals.pop();
  await test('零餘額：顯示「本年新增已用罄，無剩餘需處理」，確認鈕可按',()=>{ assert(Z.includes('本年新增已用罄，無剩餘需處理')&&!/id="settle-confirm"[^>]*disabled/.test(Z)); });
  await test('結算結果預覽：結轉與折薪合計用同一套數值列（ui-kv）',async()=>{
    await c.F.openLeaveSettleOne('a',2026); modals.pop(); checked='cash'; c.F.settlePreview(); const h=nodes['settle-preview'].innerHTML;
    assert(h.includes('結算結果')&&h.includes('ui-kv')&&h.includes('折薪合計（估算）')&&h.includes('$15,708')); checked=null; });

  await c.F.openLeaveEdit('c'); const D=modals.pop();
  await test('特休明細與編輯：規格視窗；帳戶摘要用數值列；兩個欄位與儲存／取消保留',()=>{
    assert(D.includes('class="ui-modal"')&&D.includes('特休 · 林依晨')&&D.includes('ui-modal-body ui-lvbody')&&D.includes('class="ui-modal-foot"')&&!/class="modal-foot"/.test(D));
    ['去年結轉','本年度新增','可用合計（應給）','已使用（取自排班表）','剩餘','FIFO','依勞基法應給'].forEach(t=>assert(D.includes(t),t));
    assert(D.includes('id="lv-carry"')&&D.includes('id="lv-earned"')&&D.includes('value="7.5"')&&D.includes('value="42.25"'));
    assert(D.includes("onclick=\"saveLeave('c')\">儲存")&&D.includes('>取消<')); });

  await test('三個視窗的版面不再寫死色碼或內嵌圓角（顏色一律走 --ui-* 變數）',()=>{
    for(const nm of ['openLeaveSettlement','openLeaveSettleOne','openLeaveEdit']){
      const f=fnSrc(nm); assert(!/#[0-9a-fA-F]{6}\b/.test(f.replace(/\$\{[^}]*\}/g,'')),nm+' 仍有寫死色碼'); assert(!/border-radius:\s*\d/.test(f),nm+' 仍有內嵌圓角'); } });
  await test('新增的 CSS 都在 UI-SPEC 區塊內、都以 ui- 開頭',()=>{
    const a=src.indexOf('/*UI-SPEC:BEGIN*/'), b=src.indexOf('/*UI-SPEC:END*/'); const css=src.slice(a,b);
    ['.ui-kv','.ui-num','.ui-opt','.ui-lvcard','.ui-lvlist','.ui-name','.ui-table--compact','.ui-desk-only','.ui-mob-only','.ui-lvbody'].forEach(k=>assert(css.includes(k),k)); });
  await test('計算與寫入運算式沒被動到（釘住關鍵行）',()=>{
    const so=fnSrc('openLeaveSettleOne'), sp=fnSrc('settlePreview'), cf=fnSrc('confirmLeaveSettle'), sv=fnSrc('saveLeave');
    assert(so.includes('const carryCash=Math.round(carryRemain*hourly);')&&so.includes('window._settleCtx={ id, year, carryRemain, earnedRemain, hourly, isResigned };'));
    assert(so.includes('const cAcc=Object.assign({}, c, { al_earned_hours: earnedInfo.hours });')&&so.includes('const a=annualLeaveAccount(cAcc, shifts, year);'));
    assert(sp.includes('const earnedCash  = disp===\'cash\'  ? Math.round(earnedRemain*hourly) : 0;')&&sp.includes('window._settleCtx.cashoutHours=carryRemain+(disp===\'cash\'?earnedRemain:0);'));
    assert(cf.includes("await dbPut('leave_settlements', rec);")&&cf.includes('c.al_carry_hours = earnedCarry;')&&cf.includes('c.al_earned_hours = 0;')&&cf.includes('c.al_settled_year = ctx.year;')&&cf.includes("await dbPut('coaches', c);"));
    assert(cf.includes('cashout_amount: totalCash,')&&cf.includes('carry_forward_hours: earnedCarry,'));
    assert(sv.includes("c.al_carry_hours=carry!==''?Number(carry):0;")&&sv.includes("c.al_earned_hours=earned!==''?Number(earned):0;")); });
  /* ── 邊界：長英文姓名與含引號／&／< > 的姓名（2026-11-27 GPT 驗收補充）── */
  const NASTY='A"B&C<img src=x onerror=alert(1)>D\'E>F', LONG='Christopher_Alexander_Montgomery_Wolfeschlegelsteinhausenbergerdorff';
  emps.n=Object.assign({},emps.a,{id:'n',name:NASTY+'_'+LONG});
  emps.m=Object.assign({},emps.a,{id:'m',name:NASTY,employment_type:'contractor'}); c.EMP_RULES.contractor={label:'合作教練',leaveApplicable:false};
  await c.F.openLeaveSettleOne('n',2026); const N1=modals.pop();
  await c.F.openLeaveEdit('n'); const N2=modals.pop();
  await c.F.openLeaveEdit('m'); const N3=modals.pop();
  await c.F.openLeaveSettlement(); const N4=modals.pop();
  await test('姓名含引號／&／< >：個別結算、明細編輯、「不適用特休」三處標題一律跳脫，只顯示成文字、不產生標籤',()=>{
    for(const [nm,h] of [['個別結算',N1],['明細編輯',N2],['不適用特休',N3]]){
      assert(!/<img/i.test(h),nm+' 產生了 <img>'); assert(h.includes('A&quot;B&amp;C&lt;img src=x onerror=alert(1)>D\'E>F'),nm+' 沒有以 escH 跳脫');
      assert(/class="ui-modal-title ui-lvtitle">[^<]*&lt;img/.test(h),nm+' 標題未使用 ui-lvtitle／escH'); } });
  await test('名單：同樣的姓名在表格與卡片（含 title 屬性）也不產生標籤',()=>{ assert(!/<img/i.test(N4)); assert(N4.includes('title="A&quot;B&amp;C&lt;img')); });
  await test('長英文姓名：標題與內容區有局部換行規則（overflow-wrap:anywhere），不靠隱藏溢出，也沒有改全站 .ui-modal-title',()=>{
    assert(/\.ui-lvtitle\{[^}]*overflow-wrap:anywhere[^}]*word-break:break-word/.test(src));
    assert(/\.ui-lvbody \.ui-note,\.ui-lvbody \.ui-card,\.ui-lvbody \.ui-kv>span\{[^}]*overflow-wrap:anywhere/.test(src));
    assert(!/\.ui-lvtitle\{[^}]*overflow:\s*hidden/.test(src));
    assert(/\.ui-modal-title\{font-size:var\(--ui-fs-6\);font-weight:800;color:var\(--ui-text\);margin:0 0 var\(--ui-sp-3\)\}/.test(src)); });
  await test('數值表頭靠右只限本批的 compact 表格（.ui-table th 全站規則沒改）',()=>{
    assert(/\.ui-table--compact th\.ui-num,\.ui-table--compact th\.ui-actions\{text-align:right\}/.test(src));
    assert(/\.ui-table th\{text-align:left;font-size:var\(--ui-fs-2\);font-weight:700;color:var\(--ui-text-2\);padding:var\(--ui-sp-3\) 14px;border-bottom:1px solid var\(--ui-line\)\}/.test(src));
    assert(N4.includes('ui-table--compact')&&/<th class="ui-num">去年結轉剩餘/.test(N4)); });
  console.log(n+' passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
