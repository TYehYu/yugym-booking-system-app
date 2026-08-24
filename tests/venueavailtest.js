/* 「這個時段哪些場地還有位」——建立預約改版的第一塊（2026-08-24 使用者定案）

   新流程：視窗一 日期 → 時間 → 場地（不能用的淡化並寫原因）、視窗二 課程 → 教練 → 連續預約。
   場地改成**硬指定**（選了就是那裡，滿了擋下），所以「還有沒有位」必須在選之前就看得到。

   這一支把 venueLoadAt / venueAvailAt / venueAllowsCategory 抽出來**真的執行**，
   驗的是「算出來對不對」，不是「有沒有寫」。

   最重要的一條：venueAvailAt 與 allocateVenue **必須同一份口徑**。
   分家的話會出現「畫面說有位、送出說已滿」—— 那正是 venueLoadAt 被抽成頂層函式的理由。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const VEN=[{id:'multi',name:'多功能訓練架',capacity:3},{id:'treadmill',name:'跑步機',capacity:2},{id:'group',name:'團課教室',capacity:1}];
const lib=new Function('getVenues','venueCap','venuePriorityFor','timeToMin','bkIsGroup','bkIsSelf',
  [g('function venueLoadAt(','\n}'), g('function venueAvailAt(','\n}'),
   g('function venueAllowsCategory(','\n}'), g('function venueCatWhy(','\n}'),
   g('function allocateVenue(','\n}')].join('\n')
  +'\nreturn {venueLoadAt,venueAvailAt,venueAllowsCategory,venueCatWhy,allocateVenue};')(
    ()=>VEN,
    v=>(VEN.find(x=>x.id===v)||{}).capacity||0,
    c=>c==='小班肌力'?['group']:(c==='自主訓練'?['multi','group','treadmill']:['multi','group']),
    t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0);},
    b=>!!b&&b.category==='小班肌力',
    b=>!!b&&b.category==='自主訓練');

const B=(unit,st,extra)=>Object.assign({id:unit+'@'+st,venue_unit:unit,start_time:st,duration:60,category:'私人教練'},extra||{});
const at=(rows,vid)=>lib.venueAvailAt(rows,600,660,null).find(v=>v.id===vid);

console.log('① 空的時候三個場地都可以選');
{
  const a=lib.venueAvailAt([],600,660,null);
  ok('★ 三個場地都回來了', a.length===3, a.map(v=>v.id));
  ok('★ 都可用、都寫得出剩幾位',
     a.every(v=>v.ok && !v.why) && at([], 'multi').left===3 && at([], 'group').left===1);
}

console.log('\n② 佔滿就不能選，而且說得出為什麼');
{
  const day=[B('multi_1','10:00'),B('multi_2','10:00'),B('multi_3','10:00')];
  const m=at(day,'multi');
  ok('★★ 多功能三台都被佔 → 不可用', m.ok===false && m.left===0);
  ok('★★ 原因寫得出來（要能直接顯示給使用者）', m.why==='這個時段已滿（3/3）', m.why);
  ok('　　同時段的團課教室還空著，不受影響', at(day,'group').ok===true);
}

console.log('\n③ 與 allocateVenue 同一份口徑（分家就會「畫面說有位、送出說已滿」）');
{
  /* 逐一比對：venueAvailAt 說可用 ⇔ allocateVenue 指定該場地時配得出來 */
  const cases=[
    ['空', []],
    ['多功能滿', [B('multi_1','10:00'),B('multi_2','10:00'),B('multi_3','10:00')]],
    ['團課教室滿', [B('group_1','10:00',{category:'小班肌力'})]],
    ['跨時段部分重疊', [B('multi_1','09:30'),B('multi_2','10:30'),B('multi_3','10:00')]],
    ['舊資料沒標場地', [{id:'old1',venue_unit:null,start_time:'10:00',duration:60,category:'私人教練'},
                        {id:'old2',venue_unit:null,start_time:'10:00',duration:60,category:'私人教練'}]],
  ];
  let allMatch=true, bad=[];
  cases.forEach(([nm,day])=>{
    lib.venueAvailAt(day,600,660,null).forEach(v=>{
      /* 用「自主訓練」問，因為它的優先序涵蓋三個場地，forceVid 才試得到每一個 */
      const r=lib.allocateVenue('自主訓練',day,600,660,null,v.id);
      const allocOk=!r.error;
      if(allocOk!==v.ok){ allMatch=false; bad.push(`${nm}/${v.id}: avail=${v.ok} alloc=${allocOk}`); }
    });
  });
  ok('★★ 五種情境 × 三個場地，兩支的判定完全一致', allMatch, bad);
}

console.log('\n④ 時窗內每個時點都要有位（只看起點會誤判）');
{
  /* 10:00 空著，但 10:30 三台全滿 → 一堂 10:00–11:00 的課其實排不進去 */
  const day=[B('multi_1','10:30'),B('multi_2','10:30'),B('multi_3','10:30')];
  ok('★★ 10:00 起算的 60 分鐘課：多功能不可用（10:30 那個時點滿了）',
     at(day,'multi').ok===false, at(day,'multi'));
  ok('　　只排 10:00–10:30 的話就可以', lib.venueAvailAt(day,600,630,null).find(v=>v.id==='multi').ok===true);
}

console.log('\n⑤ 改期時要排除自己（否則自己佔的位會把自己擋掉）');
{
  const mine=B('group_1','10:00',{id:'MINE',category:'小班肌力'});
  ok('★★ 不排除自己 → 團課教室看起來滿了', lib.venueAvailAt([mine],600,660,null).find(v=>v.id==='group').ok===false);
  ok('★★ 排除自己 → 還是可用', lib.venueAvailAt([mine],600,660,'MINE').find(v=>v.id==='group').ok===true);
}

console.log('\n⑥ 課別限制：反查 venuePriorityFor，不另寫一份對照表');
{
  ok('★ 跑步機只能排自主訓練',
     lib.venueAllowsCategory('treadmill','自主訓練')===true
     && lib.venueAllowsCategory('treadmill','私人教練')===false
     && lib.venueAllowsCategory('treadmill','小班肌力')===false);
  ok('★ 團課教室三種課都排得上（團課只能在這裡，教練課與自主訓練也可溢出過來）',
     lib.venueAllowsCategory('group','小班肌力')===true
     && lib.venueAllowsCategory('group','私人教練')===true
     && lib.venueAllowsCategory('group','自主訓練')===true);
  ok('★ 多功能不能排團課', lib.venueAllowsCategory('multi','小班肌力')===false);
  ok('★★ 不能選時說得出原因，而且講出「那可以排哪裡」',
     lib.venueCatWhy('treadmill','私人教練')==='跑步機不能上這種課（只能排：多功能訓練架、團課教室）',
     lib.venueCatWhy('treadmill','私人教練'));
  ok('　　可以排的時候不要吐原因（避免呼叫端誤判成不能選）',
     lib.venueCatWhy('multi','私人教練')==='');
}

console.log('\n⑦ 爛輸入不能炸');
{
  let okAll=true;
  [[null,600,660],[[],NaN,NaN],[[{}],600,660],[[{start_time:null}],600,660]].forEach(([d,a,b])=>{
    try{ lib.venueAvailAt(d,a,b,null); }catch(e){ okAll=false; }
  });
  ok('★ null／NaN／殘缺列都不丟例外', okAll);
  ok('　　沒指定場地時 venueAllowsCategory 一律放行（呼叫端還沒選）',
     lib.venueAllowsCategory('','私人教練')===true && lib.venueAllowsCategory(null,'私人教練')===true);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
