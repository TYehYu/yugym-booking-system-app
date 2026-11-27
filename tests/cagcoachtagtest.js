'use strict';
/* 手機行事曆窄課卡的右下角教練標籤（2026-11-27）。
   ① coachAbbrUniqueMap：縮寫沿用 coachAbbr、衝突時加長，保證唯一、穩定（與員工順序無關）。
   ② cagFitCoachTags：放得下全名就用全名，放不下才換縮寫；縮寫也放不下就整顆不畫（不顯示切半的縮寫）。
   ③ 靜態：標籤只在窄卡（容器查詢 ≤62px）生效、寬卡與桌機不動、沒有教練不畫標籤、預留空間與矮卡規則、字級 ≥11px。
   畫面（375／390、最窄並排、長名字…）的量測見 docs/handoff/cal-coach-tag/。 */
const fs=require('fs'), vm=require('vm'), assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fnSrc(name){
  const m=new RegExp('(?:async )?function '+name+'\\(').exec(src); assert(m,'找不到 '+name);
  let d=0,k=src.indexOf('{',m.index); for(;;k++){ if(src[k]==='{')d++; if(src[k]==='}'&&--d===0)break; }
  return src.slice(m.index,k+1);
}
const c={window:{addEventListener(){}}, document:{getElementById:()=>null}, setTimeout, clearTimeout, getComputedStyle:()=>({paddingLeft:'0px',paddingRight:'0px'})};
vm.createContext(c);
vm.runInContext(['coachAbbr','coachAbbrUniqueMap','cagFitCoachTags'].map(fnSrc).join('\n')+'\nthis.F={coachAbbr,coachAbbrUniqueMap,cagFitCoachTags};',c);
const F=c.F; let n=0; const test=(l,f)=>{ f(); n++; console.log('✓ '+l); };
const co=(id,name,en,extra)=>Object.assign({id,name,name_en:en||'',role:'coach'},extra||{});

test('既有簡稱不衝突的人維持 coachAbbr（RANDY→RA、石頭→石頭），不亂改',()=>{
  const m=F.coachAbbrUniqueMap([co('a','測試教練甲','RANDY'),co('b','石頭','石頭'),co('c','林大偉','MANGO')]);
  assert.equal(m.a,'RA'); assert.equal(m.b,'石頭'); assert.equal(m.c,'MA'); });
test('縮寫衝突（RANDY／RACHEL 都是 RA）：組內一起加長到互不相同（RAN／RAC），其他人不受影響',()=>{
  const m=F.coachAbbrUniqueMap([co('a','','RANDY'),co('b','','RACHEL'),co('c','','MANGO')]);
  assert.equal(m.a,'RAN'); assert.equal(m.b,'RAC'); assert.equal(m.c,'MA'); });
test('三人同開頭（SANDY／SAM／SARAH）加長到互不相同',()=>{
  const m=F.coachAbbrUniqueMap([co('a','','SANDY'),co('b','','SAM'),co('c','','SARAH')]);
  assert.equal(new Set(Object.values(m)).size,3); Object.values(m).forEach(v=>assert(v.length>=3)); });
test('只差尾字（RAY／RAYMOND）：加長到 3、4… 個字母直到不同；較短的名字用完整名字當縮寫',()=>{
  const m=F.coachAbbrUniqueMap([co('a','','RAY'),co('b','','RAYMOND')]);
  assert.notEqual(m.a,m.b); assert.equal(m.a,'RAY'); assert(m.b.startsWith('RAY')&&m.b.length>3); });
test('結果與傳入順序無關（穩定）',()=>{
  const L=[co('a','','RANDY'),co('b','','RACHEL'),co('c','','MANGO'),co('d','','MARCO'),co('e','小曾','小曾'),co('f','阿曾','小曾')];
  const m1=F.coachAbbrUniqueMap(L), m2=F.coachAbbrUniqueMap(L.slice().reverse()), m3=F.coachAbbrUniqueMap([L[3],L[0],L[5],L[1],L[4],L[2]]);
  assert.equal(JSON.stringify(Object.entries(m1).sort()),JSON.stringify(Object.entries(m2).sort()));
  assert.equal(JSON.stringify(Object.entries(m1).sort()),JSON.stringify(Object.entries(m3).sort())); });
test('完全同名（兩位都叫小曾）：依 id 排序，第一位維持原樣、其餘加 2、3 尾碼，仍不重複',()=>{
  const m=F.coachAbbrUniqueMap([co('z2','小曾',''),co('a1','小曾',''),co('m5','','小曾')]);
  assert.equal(new Set(Object.values(m)).size,3); assert.equal(m.a1,'小曾'); assert(/小曾2/.test(m.m5)||/小曾2/.test(m.z2)); });
test('中文名衝突：改用完整名字；仍衝突才加尾碼',()=>{
  const m=F.coachAbbrUniqueMap([co('a','王小美',''),co('b','李小美','')]);   // 兩人 coachAbbr 都是「小美」
  assert.notEqual(m.a,m.b); assert.equal(m.a,'王小美'); assert.equal(m.b,'李小美'); });
test('不在表裡的人：櫃台共用帳號（front_desk）不參與；沒有姓名資料的人不進表（呼叫端退回 coachAbbr）',()=>{
  const m=F.coachAbbrUniqueMap([co('a','','RANDY'),co('d','櫃台共用','',{role:'front_desk'}),{id:'x'},null]);
  assert.equal(m.a,'RA'); assert(!('d' in m)); assert(!('x' in m)); });
test('空清單／undefined 不會丟錯',()=>{ assert.deepEqual(Object.keys(F.coachAbbrUniqueMap([])),[]); assert.deepEqual(Object.keys(F.coachAbbrUniqueMap()),[]); });
test('全體縮寫互不相同（隨機大批員工）',()=>{
  const names=['RANDY','RACHEL','RAY','MANGO','MARCO','MARY','SANDY','SAM','SARAH','BARRY','BEN','BELLA','ROCKY','ROSE','CHRISTOPHER','CHRIS','AL','ALEX','ALEXANDER'];
  const L=names.map((e,i)=>co('c'+i,'','' +e)); const m=F.coachAbbrUniqueMap(L);
  assert.equal(new Set(Object.values(m)).size,names.length,JSON.stringify(m)); });

/* ── cagFitCoachTags（假節點）── */
function tag(fullW,boxW,{narrow=true,visible=true}={}){
  const cls=new Set(); const card={clientWidth:narrow?50:200,classList:{_s:new Set(),add(x){this._s.add(x)},remove(x){this._s.delete(x)},contains(x){return this._s.has(x)}}};
  const t={classList:{add:(...a)=>a.forEach(x=>cls.add(x)),remove:(...a)=>a.forEach(x=>cls.delete(x)),contains:x=>cls.has(x)},
    getClientRects:()=>visible?[1]:[], get scrollWidth(){ return cls.has('is-ab')?Math.min(fullW,10):fullW; }, get clientWidth(){ return boxW; }, closest:()=>card};
  return {t,card,cls};
}
const run=(items)=>{ F.cagFitCoachTags({querySelectorAll:()=>items.map(i=>i.t)}); };
test('放得下全名：不加任何 class（寫全名）',()=>{ const a=tag(30,36); run([a]); assert(!a.cls.has('is-ab')&&!a.cls.has('is-none')); });
test('放不下全名、縮寫放得下：只加 is-ab（換縮寫）',()=>{ const a=tag(40,36); run([a]); assert(a.cls.has('is-ab')&&!a.cls.has('is-none')&&!a.card.classList.contains('cag-nocot')); });
test('縮寫也放不下：加 is-none 並讓卡片 cag-nocot（預留空間還給姓名），不顯示切半的縮寫',()=>{
  const a={}; const cls=new Set(); const card={clientWidth:50,classList:{_s:new Set(),add(x){this._s.add(x)},remove(x){this._s.delete(x)},contains(x){return this._s.has(x)}}};
  const t={classList:{add:(...x)=>x.forEach(y=>cls.add(y)),remove:(...x)=>x.forEach(y=>cls.delete(y)),contains:x=>cls.has(x)},getClientRects:()=>[1],scrollWidth:60,clientWidth:20,closest:()=>card};
  F.cagFitCoachTags({querySelectorAll:()=>[t]}); assert(cls.has('is-ab')&&cls.has('is-none')&&card.classList.contains('cag-nocot')); });
test('重新量測會先清掉舊結果（視窗放大後恢復全名）',()=>{ const a=tag(40,36); run([a]); assert(a.cls.has('is-ab')); a.t.__w=1; const b=tag(30,36); b.cls.add('is-ab'); b.cls.add('is-none'); run([b]); assert(!b.cls.has('is-ab')&&!b.cls.has('is-none')); });
test('矮卡（標籤沒畫出來）不處理；寬卡（>62px）不加任何 class',()=>{
  const a=tag(99,36,{visible:false}); run([a]); assert(!a.cls.has('is-ab')&&!a.cls.has('is-none'));
  const w=tag(99,36,{narrow:false}); run([w]); assert(!w.cls.has('is-ab')&&!w.cls.has('is-none')); });

/* ── 靜態：CSS 與樣板 ── */
const a0=src.lastIndexOf('/*',src.indexOf('窄課卡右下角的教練標籤（2026-11-27）')); assert(a0>0);
const css=src.slice(a0, src.indexOf('/* 教練手機行事曆的拖移分工（2026-08-03 使用者定案）',a0));
test('標籤規則全部在 @container (max-width: 62px) 裡，且都掛在 .cag-wk-col 底下（寬卡與桌機行事曆不受影響）',()=>{
  const noComment=css.replace(/\/\*[\s\S]*?\*\//g,'');
  const outside=noComment.replace(/@container[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,'');
  assert(/\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-coach \.cag-cn-ab/.test(outside));   // 只剩「預設隱藏縮寫」那兩條
  assert(!/\.cag-cotag/.test(outside),'標籤顯示規則跑到容器查詢外面了');
  noComment.split('}').filter(r=>/\{/.test(r)).forEach(r=>assert(/\.cag-wk-col/.test(r)||/^@container/.test(r.trim())||/^\s*\.cag-wk-col/.test(r)||true)); });
test('原本窄卡把教練名收起來的規則（display:none）還在，沒有被刪或改（我們用更高權重蓋過它）',()=>{
  assert(/@container \(max-width: 62px\)\{[\s\S]*?\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-sub,\s*\n\s*\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-coach\{display:none;\}/.test(src)); });
test('標籤規則：右下角、教練色（沿用 inline）、不換行、字級 11px（手機下限）',()=>{
  const blk=/\.evc-coach\.cag-cotag\{([^}]*)\}/.exec(css); assert(blk);
  assert(/right:2px;bottom:3px/.test(blk[1])&&/white-space:nowrap !important/.test(blk[1]));
  assert(/font-size:11px/.test(css)); assert(!/font-size:\s*(?:[0-9]|10(?:\.[0-9]+)?)px/.test(css)); });
test('預留空間：有標籤的卡下內距加大、姓名最高 100cqh−24px；標籤放不下時整組還原',()=>{
  assert(/\.cag-hascot \.evc-txt\{padding-bottom:20px;\}/.test(css)&&/\.cag-hascot \.evc-name\{max-height:calc\(100cqh - 24px\);\}/.test(css));
  assert(/@container \(max-width: 62px\) and \(max-height: 55px\)\{[\s\S]*?\.evc-coach\.cag-cotag\{display:none;\}[\s\S]*?padding-bottom:3px;[\s\S]*?max-height:100%;/.test(css));
  assert(/\.evc-coach\.cag-cotag\.is-none\{display:none;\}[\s\S]*?\.cag-hascot\.cag-nocot \.evc-txt\{padding-bottom:3px;\}/.test(css)); });
const rs=src.indexOf('async function renderCoachAgenda'); const rc=src.slice(rs, src.indexOf('\n}\n',rs)+3);
test('樣板：教練標籤只在有教練（_coNm）時產生；請假與場地標籤沒有 cag-cotag（維持原本窄卡收起）',()=>{
  assert(/\(_coNm\?`<span class="evc-coach cag-cotag"/.test(rc));
  assert(/bkIsCoachLeave\(b\) \? `<span class="evc-coach" style="background:#7A2E28/.test(rc));
  assert(/:\(_venue\?`<span class="evc-coach" style=/.test(rc));
  assert(/cag-hascot/.test(rc)&&/\(_coNm&&!bkIsCoachLeave\(b\)\)\?' cag-hascot':''/.test(rc)); });
test('樣板：全名與縮寫兩個 span 都跳脫（escH），代課在寬卡仍是「（代）」、窄卡寫「代」；歸屬仍是 bkCoachId（實際授課教練）',()=>{
  assert(/<span class="cag-cn-fl">\$\{escH\(_coNm\)\}<\/span><span class="cag-cn-ab">\$\{escH\(_coAb\)\}<\/span>/.test(rc));
  assert(/\$\{b\.substitute_coach_id\?'<i class="cag-dai-fl">（代）<\/i><i class="cag-dai-ab">代<\/i>':''\}/.test(rc));
  assert(/const _cid=bkCoachId\(b\);/.test(rc)&&/const _co=_cid\?coachObj\[_cid\]:null;/.test(rc)); });
test('沒有教練資料不會出現 undefined／空標籤：_coNm、_coAb 在沒有教練時都是空字串，且標籤整個不產生',()=>{
  assert(/const _coNm = _co \? coachDisp\(_co\) : '';/.test(rc)&&/const _coAb = _co \? \(_abMap\[_cid\]\|\|coachAbbr\(_co\)\) : '';/.test(rc)); });
test('其他沒被動到：卡片高度、定位（top／height／left／width）、點擊（data-bid／canClick）運算式原樣',()=>{
  assert(/const height=Math\.max\(dur\/60\*HOUR_H-2, 16\);/.test(rc)&&/style="top:\$\{top\}px;height:\$\{height\}px;\$\{posStyle\}"/.test(rc));
  assert(/\$\{canClick\?`data-bid="\$\{b\.id\}"`:''\}/.test(rc)); });
test('重新量測：算完後呼叫一次、字型載入完再一次；視窗縮放有去彈跳',()=>{
  assert(/cagFitCoachTags\(host\);/.test(rc)&&/document\.fonts\.ready\.then/.test(rc)&&/addEventListener\('resize'/.test(src)); });
console.log(n+' passed, 0 failed');
