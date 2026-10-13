/* 指定場地也要守課別規則（2026-10-13 櫃檯回報：
     「同一個時段如果約了三台訓練架跟團課教室，團課教室這堂用更改場地的方式還可以選訓練架」）

   成因：allocateVenue 的 forceVid 直接蓋掉 venuePriorityFor ——
     const pri = forceVid ? [forceVid] : venuePriorityFor(category);
   等於「只要那個場地有空位就放行」，完全繞過 VENUE_BY_CAT
   （團課與運動按摩只能用團課教室）。
   容量滿的時候剛好會被容量那一關擋下來，所以一直沒被發現；
   只要訓練架有一台空著，團課就排得進去 —— 而團課根本不該出現在訓練架。

   ⚠ 擋在 allocateVenue 而不是只改畫面：更換場地、拖曳、改期、會員自助改場地
     都吃這一支，只擋畫面等於沒擋（同 0823 營業時間那次的教訓）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

function grab(sig){
  const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
  throw new Error('括號沒收完 '+sig);
}
/* 場地設定照正式庫：訓練架 3、跑步機 2、團課教室 1 */
const VEN=[{id:'multi',name:'史密斯訓練架',capacity:3,active:true},
           {id:'treadmill',name:'跑步機',capacity:2,active:true},
           {id:'group',name:'團課教室',capacity:1,active:true}];
const BY_CAT={'小班肌力':['group'],'運動按摩':['group'],'自主訓練':['multi','group','treadmill']};
const env={
  getVenues:()=>VEN,
  venueCap:id=>(VEN.find(v=>v.id===id)||{}).capacity||0,
  timeToMin:t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);},
  venuePriorityFor:c=>BY_CAT[c]||['multi','group'],
  venuePrepAt:()=>null,
  bkPocketNow:()=>({prepMin:15}),
};
const {allocateVenue}=new Function(...Object.keys(env),
  [grab('function venueLoadAt('),grab('function allocateVenue(')].join('\n')+'; return {allocateVenue};'
)(...Object.values(env));

/* 使用者回報的那個時段（正式庫 2026-10-13 20:00 原樣）：
   訓練架三台都滿、跑步機兩台都滿、團課在團課教室。 */
const FULL=[
 {id:'A',category:'私人教練',start_time:'20:00',duration:60,venue_unit:'multi_1'},
 {id:'B',category:'私人教練',start_time:'20:00',duration:60,venue_unit:'multi_2'},
 {id:'C',category:'私人教練',start_time:'20:00',duration:60,venue_unit:'multi_3'},
 {id:'D',category:'自主訓練',start_time:'20:00',duration:60,venue_unit:'treadmill_1'},
 {id:'E',category:'自主訓練',start_time:'20:00',duration:60,venue_unit:'treadmill_2'},
 {id:'G',category:'小班肌力',start_time:'20:00',duration:60,venue_unit:'group_1'},
];
/* 同一個時段，但訓練架空著一台 —— 這才是真正會出事的情況 */
const ONE_FREE=FULL.filter(x=>x.id!=='C');
const NS=20*60, NE=NS+60;

console.log('① 團課不能跑到訓練架 —— 即使有空位');
{
  const r=allocateVenue('小班肌力', ONE_FREE, NS, NE, 'G', 'multi');
  ok('★★★ 訓練架空著一台也要擋（這就是改版前漏掉的那一刀）', !!r.error && !!r.catBlock, r);
  ok('★★★ 錯誤訊息講得出是「課別」不是「額滿」', /這個課別不能排在史密斯訓練架/.test(r.error||''), r.error);
  eq('★★★ 跑步機同理', !!allocateVenue('小班肌力', ONE_FREE, NS, NE, 'G', 'treadmill').catBlock, true);
  ok('★★ 全滿時也是同一個理由（不要變成「額滿」混淆視聽）',
     /這個課別不能排在/.test((allocateVenue('小班肌力', FULL, NS, NE, 'G', 'multi')||{}).error||''));
}

console.log('\n② 運動按摩同一條規則（也只能團課教室）');
eq('★★★ 運動按摩指定訓練架 → 擋', !!allocateVenue('運動按摩', ONE_FREE, NS, NE, null, 'multi').catBlock, true);

console.log('\n③ 本來就該放行的別擋壞');
{
  ok('★★★ 團課回到團課教室：可以（那是它唯一的場地）',
     !allocateVenue('小班肌力', ONE_FREE.filter(x=>x.id!=='G'), NS, NE, 'G', 'group').error);
  const pt=allocateVenue('私人教練', ONE_FREE, NS, NE, null, 'multi');
  ok('★★★ 教練課指定訓練架、而且有空位：可以', !pt.error && pt.unit==='multi_3', pt);
  ok('★★★ 教練課指定訓練架但全滿：擋，而且理由是「額滿」不是「課別」',
     (()=>{ const r=allocateVenue('私人教練', FULL, NS, NE, null, 'multi');
            return !!r.hardFull && !r.catBlock; })());
  const self=allocateVenue('自主訓練', ONE_FREE, NS, NE, null, 'treadmill');
  ok('★★ 自主訓練可以用跑步機（在它的白名單裡），全滿時照常回額滿',
     !!self.hardFull && !self.catBlock, self);
  ok('★★ 沒有指定場地時完全照舊（走課別的優先序）',
     allocateVenue('私人教練', ONE_FREE, NS, NE, null, null).unit==='multi_3');
}

console.log('\n④ 擋在共用的那一支，不是只擋畫面');
ok('★★★ 白名單檢查寫在 allocateVenue（更換場地／拖曳／改期／會員自助都吃它）',
   /const allowVids=venuePriorityFor\(category\);/.test(src)
   && /if\(forceVid && !allowVids\.includes\(forceVid\)\)\{/.test(src)
   && /const pri=forceVid\?\[forceVid\]:allowVids;/.test(src));
ok('★★ 成因寫在原地（下次有人想把 forceVid 改回直接蓋掉時看得到）',
   /forceVid 原本直接蓋掉 venuePriorityFor/.test(src));

console.log('\n⑤ 畫面：不能用的要寫原因，不是藏起來');
ok('★★★ 更換場地視窗先過一次課別白名單',
   /const _allow=venuePriorityFor\(b\.category\);/.test(src)
   && /if\(!_allow\.includes\(v\.id\)\) return \{vid:v\.id,name:v\.name,ok:false,cur:false,why:'這個課別不能用'\};/.test(src));
ok('★★ 兩種不能選的理由各自寫出來', /\$\{o\.name\}（\$\{o\.why\|\|'該時段已滿'\}）/.test(src));
ok('★★★ 只有一個場地可用的課別，「調整課程」那一列直接寫原因、不開空視窗',
   /A\.venue==='any' && \(venuePriorityFor\(b\.category\)\|\|\[\]\)\.length<=1/.test(src)
   && /這個課別只能用/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
