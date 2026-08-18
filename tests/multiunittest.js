/* 同行多台開放到多功能訓練架（2026-08-18 使用者定案）：
   「一個時段同一個名字要能夠預約多個場地——1v2 的客人，場地允許就可以約兩個多功能訓練架」
   跑步機的同行第二台機制通用化：精靈選台數、明細台數開關、課卡標籤。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i)+b.length);};

/* ── venueAllowsMultiUnit ── */
const VENUE_MULTI_UNIT=['treadmill','multi'];
const venueAllowsMultiUnit=new Function('VENUE_MULTI_UNIT',
  g('function venueAllowsMultiUnit(vid){','}')+'\nreturn venueAllowsMultiUnit;')(VENUE_MULTI_UNIT);
console.log('放行檢查');
ok('　跑步機可多台', venueAllowsMultiUnit('treadmill'));
ok('　多功能訓練架可多台', src.includes("const VENUE_MULTI_UNIT=['treadmill','multi']"));
ok('　教室不可', !venueAllowsMultiUnit('group'));
ok('　訓練架多台只給自主訓練', src.includes("if(vid==='multi' && b.category!=='自主訓練') return '';"));

/* ── bkVenueChoice：多功能 2 台 → 指定 multi ── */
console.log('精靈場地選擇');
{
  const mk=(val,tmN)=>new Function('document','window',
    g('function bkVenueChoice(){','\n}')+'\nreturn bkVenueChoice();')(
    {getElementById:()=>({value:val})},{_bkTmN:tmN});
  eq('　多功能＋1 台＝維持自動配置', mk('0',1), {pref:null,units:0});
  eq('　多功能＋2 台＝指定 multi×2', mk('0',2), {pref:'multi',units:2});
  eq('　多功能＋3 台＝指定 multi×3', mk('0',3), {pref:'multi',units:3});
  eq('　跑步機＋2 台照舊', mk('t',2), {pref:'treadmill',units:2});
  eq('　團課教室照舊', mk('g',1), {pref:'group',units:0});
}

/* ── bkAddTreadmillUnits：multi 也能補開同行卡 ── */
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
  fn({id:'BK-M',member_id:'m1',category:'自主訓練',venue_unit:'multi_2',date:'2026-08-21',start_time:'10:00',duration:60},2).then(made=>{
    eq('　多功能開到 2 台', made, 2);
    eq('　同行卡指回主卡', puts[0]&&puts[0].sibling_of, 'BK-M');
    ok('　同行卡不綁票不扣點', puts[0]&&puts[0].ticket_id===null);
    ok('　備註寫場地名', puts[0]&&/同行使用（多功能訓練架）/.test(puts[0].note));
    ok('　台數編號跟著場地（multi_1）', puts[0]&&puts[0].venue_unit==='multi_1');

    /* ── venueUnitsLabel：訓練架多台要標 ── */
    console.log('課卡標籤');
    const bkIsGroup=b=>!!(b&&b.category==='小班肌力');
    const lbl=new Function('bkIsGroup',
      g('function selfVenueLabel(b){','\n}')+'\n'+g('function venueUnitsLabel(b){','\n}')+'\nreturn venueUnitsLabel;')(bkIsGroup);
    eq('　訓練架×2 → 訓練架・兩台', lbl({category:'自主訓練',venue_unit:'multi_1',_units:2}), '訓練架・兩台');
    eq('　訓練架×1 → 不標（照舊）', lbl({category:'自主訓練',venue_unit:'multi_1'}), '');
    eq('　跑步機×2 照舊', lbl({category:'自主訓練',venue_unit:'treadmill_1',_units:2}), '跑步機・兩台');
    console.log(`\n${pass} 過 / ${fail} 敗`);
    process.exit(fail?1:0);
  });
}
