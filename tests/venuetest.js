/* 場地分配 allocateVenue —— 從 index.html 抽真實原始碼驗證（2026-07-26）。
   重點：匯入課沒有 venue_unit，挑位必須把「舊資料估算占用」算進去，否則超賣。 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
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
/* 2026-07-26 會員端超賣真因：RLS 只讓會員讀自己的預約 → dbGetAll 是空行事曆。
   validateBooking 會員角色必須改走匿名佔用 RPC（fn_booking_occupancy）。 */
const vb=h.slice(h.indexOf('async function validateBooking'),h.indexOf('return null; // 通過'));
ok("★ 會員角色走 fetchDayOccupancy（RLS 看不到別人的預約）", vb.includes("SESSION.role==='member'")&&vb.includes('fetchDayOccupancy'));
ok('fetchDayOccupancy 呼叫 fn_booking_occupancy RPC', h.includes("sb.rpc('fn_booking_occupancy'"));
ok('寫入 bookings 會清佔用快取', /if\(list\.some\(s=>tbl\(s\)==='bookings'\)\)\{ try\{ occCacheClear\(\); \}/.test(h));
/* 2026-07-26 資安總檢：會員對資料表無寫入權——所有會員寫入動作必須走 security definer RPC，
   不得殘留 dbPut('bookings')＋deductTicket 的直接寫入版本。 */
ok('★ 會員預約走 fn_member_self_book RPC', (h.match(/memberSelfBookRpc\(/g)||[]).length>=5 && h.includes("sb.rpc('fn_member_self_book'"));
ok('★ 會員取消走 fn_cancel_booking RPC', /doMemCancelSelf[\s\S]{0,800}?fn_cancel_booking/.test(h));
ok('會員端不再殘留直接扣票寫入', !h.includes('deductTicket(tk,bk.id,SESSION.id);\n  closeModal();'));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
