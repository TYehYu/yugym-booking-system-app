const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const a=src.indexOf('window._rcTk={',src.indexOf('const RECUR_HOLD_MAX=2;')),b=src.indexOf('/* opts.countLabel',a);
function extract(n){let i=src.indexOf('function '+n+'(');return src.slice(i,src.indexOf('\n}',i)+2);}
let passed=0;function ok(c,m){if(!c)throw Error(m);passed++;}
function setup(){
 const els={},w={member_id:'M',type_id:'PT',date:'2026-11-20',time:'19:00',rc:{on:true,dows:[5,2],times:{},count:2}};
 let tickets=()=>[],contracts=[],requests=[],bookings=[],calls=0,fresh=[];
 const ctx={window:{},_bkWizard:w,RECUR_MAX:12,RECUR_HOLD_MAX:2,console:{error(){}},document:{getElementById:id=>els[id]||null},
 tkUnlockedLeft:t=>t.left,listUsableTickets:async(...args)=>{calls++;return tickets(...args);},
 dbGet:async(t,id)=>contracts.find(x=>x.id===id),dbGetAll:async (t,opts)=>{if(opts&&opts.fresh)fresh.push(t);return t==='bookings'?bookings:t==='contracts'?contracts:requests;},
 recurSetMax:(p,n)=>{ctx.cap=n;},recurWhenSync:()=>{},showToast:m=>{ctx.toast=m;}};
 vm.createContext(ctx);vm.runInContext(src.split('\n').filter(line=>/^function (escH|parseYmd|ymd|addDays)\(/.test(line)).join('\n'),ctx);vm.runInContext(extract('buildRecurringDates')+'\n'+extract('buildRecurringSlots')+'\n'+extract('recurHoldCheck')+'\n'+src.slice(a,b),ctx);
 return {ctx,w,els,setTickets:f=>{tickets=f;},setData:(c,r,b)=>{contracts=c;requests=r;bookings=b||[];},calls:()=>calls,fresh};
}
(async()=>{
 let e=setup(),q=()=>e.ctx.recurTkInputs();
 let p=await e.ctx.recurTkPlan(q());ok(p.cap===2,'Friday plus Tuesday fits seven days');
 e.w.member_id='';e.w.type_id='';e.w.rc.dows=[5];e.w.rc.count=12;
 const priorCalls=e.calls();await e.ctx.recurTkInfoRefresh(true);
 ok(e.ctx.window._rcTk.cap===1&&e.calls()===priorCalls,'anonymous single weekday only permits one lesson before course selection');
 ok(!(await e.ctx.recurTkInfoGate(true)),'anonymous twelve-lesson submit is rejected');
 e.w.rc.dows=[5,2];e.w.rc.count=2;
 ok(await e.ctx.recurTkInfoGate(true)&&e.ctx.window._rcTk.cap===2,'anonymous Friday and Tuesday can be booked together');
 e.w.member_id='M';e.w.type_id='PT';
 e.w.rc.dows=[1];p=await e.ctx.recurTkPlan(q());ok(p.cap===1,'Monday-only permits one lesson');
 e.w.rc.dows=[5,2];e.setTickets(()=>[{id:'T',left:3}]);p=await e.ctx.recurTkPlan(q());ok(p.cap===3&&p.n===1,'one ticket three sessions, not twelve');
 e.setTickets(()=>[{id:'T',left:1},{id:'U',left:2}]);p=await e.ctx.recurTkPlan(q());ok(p.cap===3&&p.n===2,'multiple tickets allocated once each');
 e.setTickets((m,t,d)=>d>'2026-11-24'?[]:[{id:'T',left:8}]);p=await e.ctx.recurTkPlan(q());ok(p.cap===2,'future expiry limits count');
 e.setTickets(()=>[{id:'T',left:4},{id:'T',left:4}]);p=await e.ctx.recurTkPlan(q());ok(p.cap===4&&p.n===1,'shared duplicate ticket counted once');
 e.setTickets(()=>{throw Error('offline');});await e.ctx.recurTkInfoRefresh(true);ok(e.ctx.window._rcTk.state==='err','read error stays error');ok(!(await e.ctx.recurTkInfoGate(true)),'read error rejects final');
 e.setTickets(()=>[{id:'T',left:4}]);await e.ctx.recurTkInfoRefresh(true);const n=e.calls();e.setTickets(()=>[{id:'T',left:1}]);ok(!(await e.ctx.recurTkInfoGate(true)),'final refresh rejects stale quantity');ok(e.calls()>n,'final forces fresh reads');
 e.w.hold_contract_id='C';e.setData([{id:'C',member_id:'M',sessions:4}],[{contract_id:'C',member_id:'M',status:'pending',payload:{plan:{ticket_type_id:'PT',valid_days:10}}}]);p=await e.ctx.recurTkPlan(q());ok(p.contract.id==='C'&&p.cap===3,'contract limits dates to ten-day window');
 e.els['bk-hold-contract']={value:'C'};
 await e.ctx.recurContractChoices();
 ok(e.els['bk-hold-contract'].innerHTML.includes('<option value="C">未付款合約 C</option>'),'loads eligible contract without an esc global');
 ok(e.els['bk-hold-contract'].value==='C','keeps the selected contract');
 delete e.els['bk-hold-contract'];
 e.w.member_id='OTHER';let rejected=false;try{await e.ctx.recurTkPlan(q());}catch(_){rejected=true;}ok(rejected,'contract cannot leak across member');
 e.w.member_id='M';e.w.type_id='OTHER';rejected=false;try{await e.ctx.recurTkPlan(q());}catch(_){rejected=true;}ok(rejected,'contract cannot leak across course');
 e.w.type_id='PT';e.w.hold_contract_id='C';e.els['bk-hold-contract']={value:''};ok(e.ctx.recurTkInputs().cid==='','clearing contract does not reuse wizard value');
 e.els['bk-mem-pre']={value:''};ok(e.ctx.recurTkInputs().mid==='','clearing member does not reuse wizard value');delete e.els['bk-mem-pre'];
 e.w.hold_contract_id='';e.setData([],[],[]);e.setTickets(()=>[{id:'T',left:8,valid_days:5}]);p=await e.ctx.recurTkPlan(q());ok(p.cap===2,'unopened five-day window limits third lesson');
 e.setData([],[],[{ticket_id:'T',date:'2026-11-01',status:'booked'}]);p=await e.ctx.recurTkPlan(q());ok(p.cap===0&&p.n===1,'existing holding outside provisional window cannot become no-ticket hold');
 e=setup();e.setTickets(()=>new Promise(resolve=>setTimeout(()=>resolve([{id:'T',left:4}]),10)));const gate=e.ctx.recurTkInfoGate(true);e.w.member_id='NEW';ok(!(await gate),'member change while refreshing rejects final');
 ok(src.includes('id="bk-hold-contract" disabled onchange="recurSetContract(this.value)"'),'actual contract selector wired');
 ok(src.includes('contract_id:o.contract_id||null'),'contract id passed into booking');
 ok(src.includes('if(!(await recurTkInfoGate(true)))return;'),'hold final guarded');
 ok(e.fresh.includes('member_tickets')&&e.fresh.includes('bookings'),'final bypasses database cache');
 ok(!e.fresh.includes('contracts')&&!e.fresh.includes('ticket_grant_requests'),'no-contract path does not require restricted contract tables');
 e=setup();e.setTickets(()=>new Promise(resolve=>setTimeout(()=>resolve([{id:'T',left:4}]),10)));const late=e.ctx.recurTkInfoGate(true);e.w.rc.times={2:'20:00'};ok(!(await late),'time change while refreshing rejects final');
 console.log(passed+' passed');
})().catch(e=>{console.error(e);process.exit(1);});
