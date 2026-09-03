/* 「一張預約可以佔幾個場地單位」——只有跑步機可以。

   2026-08-18 曾把它開放給多功能訓練架（1v2 兩人各佔一架、只扣 1 點）；
   2026-09-02 使用者**推翻**：「多功能訓練架跟跑步機不一樣，1 點只能約一個場地」。
   訓練架的 3 個單位是「同時容納 3 個人」，不是同一張預約可以佔 3 個
   —— 這其實是 0801 原本的規則，中間繞了一圈又回來。

   ⚠ 0818–0902 之間沒有任何一筆預約真的佔了兩架（sibling_of＋multi% 實查 0 筆），
     所以是純粹把功能收掉，沒有資料要清。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i)+b.length);};

/* ── venueAllowsMultiUnit ── */
const VENUE_MULTI_UNIT=['treadmill'];
const venueAllowsMultiUnit=new Function('VENUE_MULTI_UNIT',
  g('function venueAllowsMultiUnit(vid){','}')+'\nreturn venueAllowsMultiUnit;')(VENUE_MULTI_UNIT);
console.log('放行檢查');
ok('　跑步機可多台', venueAllowsMultiUnit('treadmill'));
ok('★★ 多功能訓練架**不可**多台（0902 收回 0818）',
   src.includes("const VENUE_MULTI_UNIT=['treadmill'];") && !venueAllowsMultiUnit('multi'));
ok('　教室不可', !venueAllowsMultiUnit('group'));
ok('★ 0818 那條「訓練架多台只給自主訓練」的閘門已移除（常數收掉後它是死碼）',
   !src.includes("if(vid==='multi' && b.category!=='自主訓練') return '';"));
ok('　　為什麼收回，寫在原地',
   /多功能訓練架跟跑步機不一樣，1 點只能約一個場地/.test(src));

/* ── bkVenueChoice：訓練架永遠不帶台數 ── */
console.log('精靈場地選擇');
{
  const mk=(val,tmN)=>new Function('document','window',
    g('function bkVenueChoice(){','\n}')+'\nreturn bkVenueChoice();')(
    {getElementById:()=>({value:val})},{_bkTmN:tmN});
  eq('★★ 訓練架＋1 台＝自動配置', mk('0',1), {pref:null,units:0});
  eq('★★ 訓練架就算 _bkTmN 殘留 2 也不帶台數（按鈕藏起來了，狀態可能還在）',
     mk('0',2), {pref:null,units:0});
  eq('★★ 訓練架殘留 3 也一樣', mk('0',3), {pref:null,units:0});
  eq('　跑步機＋2 台照舊', mk('t',2), {pref:'treadmill',units:2});
  eq('　團課教室照舊', mk('g',1), {pref:'group',units:0});
}

/* ── 台數那排按鈕：初次渲染就不能出現在訓練架上 ── */
console.log('台數欄的顯示時機');
{
  const F=g('function bkTreadmillRow(t){','\n}');
  /* 0902 使用者回報：「多功能訓練架有一台兩台三台可以選」——
     bkTmSwap 只在 onchange 跑，預設場地是訓練架，一打開就會看到那排按鈕。
     所以初始 display 一定要在 HTML 裡就算好，不能靠 onchange 補。 */
  ok('★★★ 初始 display 由所選場地決定（不是寫死 flex）',
     /id="bk-tm-units" style="display:\$\{_sel==='t'\?'flex':'none'\}/.test(F));
  ok('★★ 只有自主訓練才有這一欄', /if\(!t \|\| t\.category!=='自主訓練'\) return '';/.test(F));
  ok('★★ 按鈕最多畫到「可多台場地」的最大容量（現在只有跑步機＝2 台）',
     /const maxCap=Math\.max\(\.\.\.\(window\.VENUES\|\|\[\{capacity:2\}\]\)\.filter\(v=>venueAllowsMultiUnit\(v\.id\)\)/.test(F));
  const swap=g('function bkTmSwap(){','\n}');
  ok('★ 換場地時跟著開關，並把台數歸 1',
     /row\.style\.display=\(vid&&venueAllowsMultiUnit\(vid\)\)\?'flex':'none';/.test(swap)
     && /window\._bkTmN=1;/.test(swap));
}

/* ── bkAddTreadmillUnits：訓練架不再補開同行卡 ── */
console.log('同行卡建立');
{
  const puts=[];
  const fn=new Function('venueAllowsMultiUnit','window','dbGetAll','dbPut','uid','SESSION','venueName','timeToMin',
    g('async function bkAddTreadmillUnits(bk, want){','\n}\n')+'\nreturn bkAddTreadmillUnits;')(
    venueAllowsMultiUnit,
    {VENUES:[{id:'multi',capacity:3},{id:'treadmill',capacity:2}]},
    async()=>[], async(t,o)=>{puts.push(o);}, p=>p+'-x', {id:'op'},
    v=>({multi:'多功能訓練架',treadmill:'跑步機'})[v]||v,
    s=>{const[a,b]=String(s).split(':').map(Number);return a*60+(b||0);});
  const base={id:'BK-M',member_id:'m1',category:'自主訓練',date:'2026-08-21',start_time:'10:00',duration:60};
  fn(Object.assign({},base,{venue_unit:'multi_2'}),2).then(async made=>{
    eq('★★ 訓練架要 2 台也只給 1 台（最後一道防線）', made, 1);
    eq('　　而且一張同行卡都沒建', puts.length, 0);

    const made2=await fn(Object.assign({},base,{id:'BK-T',venue_unit:'treadmill_2'}),2);
    eq('　跑步機照舊開到 2 台', made2, 2);
    eq('　同行卡指回主卡', puts[0]&&puts[0].sibling_of, 'BK-T');
    ok('　同行卡不綁票不扣點', puts[0]&&puts[0].ticket_id===null);
    ok('　備註寫場地名', puts[0]&&/同行使用（跑步機）/.test(puts[0].note));
    ok('　台數編號跟著場地（treadmill_1）', puts[0]&&puts[0].venue_unit==='treadmill_1');

    /* ── venueUnitsLabel ── */
    console.log('課卡標籤');
    const bkIsGroup=b=>!!(b&&b.category==='小班肌力');
    const lbl=new Function('bkIsGroup',
      g('function selfVenueLabel(b){','\n}')+'\n'+g('function venueUnitsLabel(b){','\n}')+'\nreturn venueUnitsLabel;')(bkIsGroup);
    /* 2026-09-03 使用者：「訓練架·兩台 這個功能還在嗎? 應該只有跑步機才有選擇台數的功能」——
       0902 收回功能時留的那行防呆**不可能被觸發**（四道關卡都關著、正式庫 0 筆），
       留著唯一的效果是讓人以為功能還在。整行移除。 */
    eq('★★ 訓練架不再標台數（那行防呆已移除）',
       lbl({category:'自主訓練',venue_unit:'multi_1',_units:2}), '');
    /* 只看程式，不看註解 —— 註解裡刻意留著「〔已移除〕訓練架・兩台」當紀錄 */
    ok('★★ 台數只剩跑步機這一條路', (()=>{
      const noC=src.replace(/\/\*[\s\S]*?\*\//g,'');
      return !/訓練架・/.test(noC) && !/venueShort/.test(noC);
    })());
    eq('　訓練架×1 → 不標（預設場地，照舊）', lbl({category:'自主訓練',venue_unit:'multi_1'}), '');
    eq('　跑步機×2 照舊', lbl({category:'自主訓練',venue_unit:'treadmill_1',_units:2}), '跑步機・兩台');

    /* ── mergeSiblingUnits：同場地併卡、跨場地拆卡（2026-08-18 蘇美帆 10:00 案例） ── */
    console.log('同行卡合併規則');
    const merge=new Function(g('function mergeSiblingUnits(list){','\n}\n')+'\nreturn mergeSiblingUnits;')();
    const same=merge([
      {id:'A',venue_unit:'treadmill_1',sibling_of:null},
      {id:'B',venue_unit:'treadmill_2',sibling_of:'A'}]);
    eq('　兩台跑步機＝一張卡（_units 2）', same.map(x=>x.id+':'+(x._units||1)), ['A:2']);
    const mixed=merge([
      {id:'A',venue_unit:'multi_3',sibling_of:null},
      {id:'B',venue_unit:'treadmill_1',sibling_of:'A'}]);
    eq('　訓練架＋跑步機＝兩張卡', mixed.map(x=>x.id).sort(), ['A','B']);
    const orphan=merge([{id:'B',venue_unit:'treadmill_1',sibling_of:'GONE'}]);
    eq('　主卡不在清單（被濾掉）→ 同行卡自己成卡，不再無聲消失', orphan.map(x=>x.id), ['B']);
    console.log(`\n${pass} 過 / ${fail} 敗`);
    process.exit(fail?1:0);
  });
}
