/* 場地容量少算一台（2026-10-29 使用者回報：「為什麼今天超過四組預約」）

   ══ 事故經過（正式庫實查）══
   10/29 20:30 的史密斯訓練架（3 台）上有 4 筆課：
     #1 蔡佳勳 20:00–21:00（08-08 建）
     #2 黃喬莉 20:00–21:00（10-23 建 ← 最後一筆，本來該被擋）
     #3 吳宥伯 20:00–21:00（09-18 建）
     #3 楊采妮 20:30–21:30（08-27 建）
   venueLoadAt 原本**以台號去重**，兩筆 #3 只算一位 → 20:30 看起來是 2/3「還有一台」，
   於是 10/23 放行黃喬莉。實際是 3 台全滿，楊采妮的 20:30 沒有位子。

   ⚠ 這個 bug 會滾雪球：某個時段只要出現過一次「兩筆同台」，那個時段的容量就
     永遠少算一台，之後會繼續放行更多。10 月三次重疊（10/05、10/28、10/29）都是這樣來的。
   ⚠ 0730 的註解已經寫過同一個坑，但當時只修了 allocateVenue 挑號那一段。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{const i=src.indexOf('function '+n+'(');let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const VEN=[{id:'multi',name:'史密斯訓練架',capacity:3,active:true},
           {id:'treadmill',name:'跑步機',capacity:2,active:true},
           {id:'group',name:'團課教室',capacity:1,active:true}];
const env={
  getVenues:()=>VEN,
  venueCap:id=>(VEN.find(v=>v.id===id)||{}).capacity||0,
  timeToMin:t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);},
  venuePriorityFor:c=>(c==='小班肌力'||c==='運動按摩')?['group']
    :(c==='自主訓練'?['multi','group','treadmill']:['multi','group']),
};
const loadAt=new Function(...Object.keys(env), grab('venueLoadAt')+'\nreturn venueLoadAt;')(...Object.values(env));
const avail=new Function(...Object.keys(env),'venueLoadAt',
  grab('venueAvailAt')+'\nreturn venueAvailAt;')(...Object.values(env), loadAt);

/* 10/29 20:00–21:30 的真實資料 */
const DAY=[
  {id:'a',start_time:'20:00',duration:60,venue_unit:'multi_1',category:'私人教練'},   // 蔡佳勳
  {id:'b',start_time:'20:00',duration:60,venue_unit:'multi_3',category:'私人教練'},   // 吳宥伯
  {id:'c',start_time:'20:30',duration:60,venue_unit:'multi_3',category:'私人教練'},   // 楊采妮
];

console.log('① 一筆預約算一位（預設）');
eq('★★★ 20:30 兩筆同在 #3 → 算 3 位，不是 2', loadAt(DAY,20*60+30).multi, 3);
eq('★★  20:00 只有 #1 與 #3 → 2 位', loadAt(DAY,20*60).multi, 2);
eq('　　21:00 剩楊采妮 #3 → 1 位', loadAt(DAY,21*60).multi, 1);
ok('★★★ 預設**不**去重（去重正是少算一台的原因）',
   /if\(dedupe\)\{ if\(seen\[x\.venue_unit\]\) return; seen\[x\.venue_unit\]=1; \}/.test(src)
   && !/if\(x\.venue_unit && !seen\[x\.venue_unit\]\)\{ seen\[x\.venue_unit\]=1;/.test(src));

console.log('\n② 去重版仍留著，但只給 allocateVenue 算 inf 用');
/* 20:30 在場的台號是 #1 與 #3（#3 上兩筆，去重算一個）→ 2 個台號。
   不去重是 3（見上面），差的那一個就是被吃掉的容量。 */
eq('★★  dedupe=true 數的是「台號」：#1＋#3 ＝ 2（不去重是 3）', loadAt(DAY,20*60+30,true).multi, 2);
ok('★★★ allocateVenue 的 inf 那一行明確傳 true',
   /const d=\(venueLoadAt\(others, inst, true\)\[vid\]\|\|0\)-Object\.keys\(lab\)\.length;/.test(src));
ok('★★  容量判斷那兩處維持不去重（沒有偷偷帶 true）',
   /const loadAt=\(inst\)=>venueLoadAt\(others, inst\);/.test(src)
   && /const u=venueLoadAt\(others, inst\)\[v\.id\]\|\|0;/.test(src));

console.log('\n③ 黃喬莉那一筆本來就該被擋');
{
  /* 10/23 當下：DAY 三筆已存在。黃喬莉要約 20:00–21:00。 */
  const a=avail(DAY, 20*60, 21*60, null);
  const m=a.find(x=>x.id==='multi');
  eq('★★★ 史密斯在 20:00–21:00 的峰值＝3（20:30 那一刻）', m.used, 3);
  ok('★★★ 所以它是滿的，不該放行', m.ok===false, m);
  ok('　　理由寫得出來', /已滿/.test(m.why||''));
}
console.log('\n④ 沒有這個 bug 時的正常情況不受影響');
{
  const d2=[{id:'x',start_time:'20:00',duration:60,venue_unit:'multi_1',category:'私人教練'},
            {id:'y',start_time:'20:30',duration:60,venue_unit:'multi_2',category:'私人教練'}];
  const m=avail(d2, 20*60, 21*60, null).find(x=>x.id==='multi');
  eq('★★ 兩筆不同台 → 峰值 2，還有 1 台', [m.used,m.left,m.ok], [2,1,true]);
}
console.log('\n⑤ 未到課要釋出場地的規則沒被改掉');
eq('★★ no_show 的那筆不佔位',
   loadAt([{id:'n',start_time:'20:00',duration:60,venue_unit:'multi_1',category:'私人教練',no_show:true}],
          20*60).multi, 0);

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
