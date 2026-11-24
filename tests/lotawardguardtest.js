'use strict';
/* 抽獎登記：防連按＋寫入前重驗資格（2026-11-24 吳淑琴／吳昆弦多登記一次）。真的執行 lottoAwardDo。 */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fn(name){const i=src.indexOf('function '+name+'(');assert(i>=0,name);const st=src.slice(i-6,i)==='async '?i-6:i;let d=0,k=src.indexOf('{',i);for(;;k++){if(src[k]=='{')d++;if(src[k]=='}'&&--d==0)break;}return src.slice(st,k+1);}
const grp=['lottoEarnedByMember','lottoUsedByMember','lottoStats','lottoVipSet','lottoIsVip','_lotPuDate','lottoAward','lottoAwardDo','_lottoAwardDo','onceAct'].map(fn).join('\n');
const prizes=src.slice(src.indexOf('const LOTTO_PRIZES='),src.indexOf('];',src.indexOf('const LOTTO_PRIZES='))+2);
let writes=[],toasts=[],db={bookings:[],purchases:[],members:[{id:'M1',level:'regular'}]};
const c={ymd:()=> '2026-11-24',TODAY:'x',SESSION:{id:'S'},_actBusy:{},effTier:m=>m.level,uid:p=>p+'-'+Math.random().toString(36).slice(2,8),
 dbGetAll:async t=>JSON.parse(JSON.stringify(db[t]||[])),dbGet:async()=>null,dbPut:async(t,r)=>{writes.push([t,r]);if(t==='purchases')db.purchases.push(r);},
 logTicket:async()=>{},showToast:m=>toasts.push(m),openLottoModal:()=>{},showModal:()=>{},window:{},setTimeout,console};
vm.createContext(c);vm.runInContext("const LOTTO_FROM='2026-07';\n"+prizes+'\n'+grp+'\nthis.F={lottoAwardDo};',c);
const bk=(n,date)=>Array.from({length:n},()=>({member_id:'M1',date,category:'私人教練',status:'checked_in'}));
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
(async()=>{
 db.bookings=bk(4,'2026-11-10');
 await c.F.lottoAwardDo('M1','protein');
 test('有待抽次數→登記一筆',()=>assert.equal(writes.filter(w=>w[0]==='purchases').length,1));
 writes=[];toasts=[];await new Promise(r=>setTimeout(r,450));
 await c.F.lottoAwardDo('M1','protein');
 test('已抽滿再按（相隔數秒）→擋下、零寫入、有提示',()=>{assert.equal(writes.length,0);assert(toasts.some(t=>t.includes('沒有待抽')));});
 // 票券類獎品：已抽滿也不能多發票
 writes=[];await new Promise(r=>setTimeout(r,450));
 await c.F.lottoAwardDo('M1','pt300');
 test('票券獎品也擋：不多發 member_tickets',()=>assert.equal(writes.length,0));
 // 同時連按（同一位）只跑一次
 db.purchases=[];db.bookings=bk(4,'2026-11-10');writes=[];await new Promise(r=>setTimeout(r,450));
 await Promise.all([c.F.lottoAwardDo('M1','protein'),c.F.lottoAwardDo('M1','protein'),c.F.lottoAwardDo('M1','protein')]);
 test('三連按同一位→只登記一筆',()=>assert.equal(writes.filter(w=>w[0]==='purchases').length,1));
 // 沒有資格的人
 db.bookings=bk(3,'2026-11-10');db.purchases=[];writes=[];await new Promise(r=>setTimeout(r,450));
 await c.F.lottoAwardDo('M1','protein');
 test('3 堂（未滿 4）不能登記',()=>assert.equal(writes.length,0));
 console.log(n+' passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
