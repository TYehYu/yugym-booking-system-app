/* 場地分配 allocateVenue —— 從 index.html 抽真實原始碼驗證（2026-07-26）。
   重點：匯入課沒有 venue_unit，挑位必須把「舊資料估算占用」算進去，否則超賣。 */
const fs=require('fs');
const path=require('path');
const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=h.indexOf('function '+n+'(');let d=0;for(let k=h.indexOf('{',i);;k++){if(h[k]==='{')d++;else if(h[k]==='}'){d--;if(!d)return h.slice(i,k+1);}}};
const VENUES=[{id:'multi',capacity:3},{id:'treadmill',capacity:2},{id:'group',capacity:1}];
const lib=new Function('getVenues','timeToMin',
  [grab('venueCap'),grab('venuePriorityFor'),grab('occupiedUnits'),grab('overlaps'),grab('allocateVenue')].join('\n')+';return {allocateVenue};')(
  ()=>VENUES, t=>{const[a,b]=t.split(':').map(Number);return a*60+b;});
const mk=(id,cat,st)=>({id,category:cat,start_time:st,duration:60,venue_unit:null,status:'booked'});
let pass=0,fail=0; const ok=(n,c)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ ')+n);};
/* v3（逐時點占用）：9:30 與 10:30 的 PT 是先後用同一位，不是同時兩位。
   10:00-11:00 每個時點：多功能＝PT1＋自主2＝3 滿；教室每個時點都空 → 分教室。 */
const A=[mk('a','私人教練','09:30'),mk('b','自主訓練','10:00'),mk('c','自主訓練','10:00'),mk('d','私人教練','10:30')];
const rA=lib.allocateVenue('自主訓練',A,600,660,null);
ok('★ 7/27 10:00 真實情境：多功能滿、教室空 → 分教室（標「教室」）', rA.unit&&rA.unit.startsWith('group')&&rA.overflow);
ok('指定多功能 → 額滿（確認視窗變暗）', !!lib.allocateVenue('自主訓練',A,600,660,null,'multi').error);
ok('指定教室 → 可約', (lib.allocateVenue('自主訓練',A,600,660,null,'group').unit||'').startsWith('group'));
ok('指定跑步機 → 可約', (lib.allocateVenue('自主訓練',A,600,660,null,'treadmill').unit||'').startsWith('treadmill'));
const rA2=lib.allocateVenue('自主訓練',A,570,630,null);   // 9:30 起的自主
ok('★ 9:30 也分教室（PT9:30＋10:00 尖峰多功能滿）', (rA2.unit||'').startsWith('group'));
const B=[mk('a','私人教練','10:00'),mk('b','私人教練','10:00'),mk('c','私人教練','10:00')];
ok('多功能滿、教室空 → 分教室（優先序 多功能→教室→跑步機）', lib.allocateVenue('自主訓練',B,600,660,null).unit==='group_1');
ok('空場 → 多功能', lib.allocateVenue('自主訓練',[],600,660,null).unit==='multi_1');
const D=[...A,mk('e','自主訓練','10:00'),mk('f','自主訓練','10:00'),mk('g','自主訓練','10:00')];
ok('尖峰六位全滿 → 額滿', !!lib.allocateVenue('自主訓練',D,600,660,null).error);
const E=[mk('a','私人教練','10:00'),{...mk('e2','私人教練','10:00'),venue_unit:'multi_2'}];
ok('真實 venue_unit 與估算並用不重複', lib.allocateVenue('私人教練',E,600,660,null).unit==='multi_3');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
