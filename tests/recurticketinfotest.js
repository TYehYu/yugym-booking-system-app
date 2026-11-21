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
 const balance=setup();balance.setTickets(()=>[{id:'T18',left:18}]);balance.w.rc.on=false;
 let balancePlan=await balance.ctx.recurTkPlan(balance.ctx.recurTkInputs());
 ok(balancePlan.available===18&&balancePlan.cap===1,'single booking keeps eighteen-ticket balance separate from one-slot cap');
 balance.els['bk-tkinfo']={};Object.assign(balance.ctx.window._rcTk,balancePlan,{state:'ok'});balance.ctx.recurTkInfoRender();
 ok(balance.els['bk-tkinfo'].textContent==='票券可用 18 堂','renders ticket balance rather than single-slot cap');
 balance.w.rc.on=true;balancePlan=await balance.ctx.recurTkPlan(balance.ctx.recurTkInputs());
 ok(balancePlan.available===18&&balancePlan.cap===18,'recurring cap follows eighteen available sessions');


 const ui=setup(),attrs={'data-max':'18'},countEl={value:'18',getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=String(v)};
 ui.els['bk-count']=countEl;ui.els['bk-recurring']={checked:true};
 ui.ctx.document.querySelectorAll=sel=>sel==='.bk-dow:checked'?[{value:'5'}]:[];
 vm.runInContext(extract('readRecur')+'\n'+extract('bkReadRecurBk')+'\n'+extract('recurClampCount')+'\n'+extract('bkRecurRecap'),ui.ctx);
 vm.runInContext(extract('recurWhenHint'),ui.ctx);ui.ctx.recurStartOf=()=>ui.w.date;
 ok(ui.ctx.readRecur('bk').count===18,'DOM reads eighteen without clipping');
 const lastDate=ui.ctx.buildRecurringDates(ui.w.date,[5],18,null).at(-1);const lastParts=lastDate.split('-').map(Number);ok(ui.ctx.recurWhenHint('bk').includes('<b>'+lastParts[1]+'/'+lastParts[2]+'</b>'),'date preview reaches eighteenth lesson');
 ok(ui.ctx.bkReadRecurBk(18).count===18,'submit reads eighteen without clipping');
 countEl.value='19';ui.ctx.recurClampCount('bk');ok(Number(countEl.value)===18,'input clamps nineteen to eighteen');
 ui.w.rc.count=18;ok(ui.ctx.bkRecurRecap(18).includes('18 堂'),'confirmation shows eighteen');
 const exp=setup();exp.setTickets((mid,type,date)=>date<'2026-12-01'?[{id:'E',left:18}]:[]);
 const ep=await exp.ctx.recurTkPlan(exp.ctx.recurTkInputs());ok(ep.available===18&&ep.cap<18&&ep.cap>0,'expiry reduces schedule cap without changing balance');
 const dup=setup();dup.setTickets(()=>[{id:'D',left:18},{id:'D',left:18}]);const dp=await dup.ctx.recurTkPlan(dup.ctx.recurTkInputs());ok(dp.available===18&&dp.cap===18,'same ticket cannot double balance or allocation');
 const fresh=setup();fresh.w.rc.count=18;fresh.setTickets(()=>[{id:'F',left:18}]);await fresh.ctx.recurTkInfoRefresh(true);
 fresh.setTickets(()=>[{id:'F',left:3}]);ok(!(await fresh.ctx.recurTkInfoGate(true))&&fresh.ctx.window._rcTk.cap===3,'submit rereads balance and rejects stale eighteen after balance falls to three');
 const multi=setup();multi.setTickets(()=>[{id:'A',left:10},{id:'B',left:8}]);const mp=await multi.ctx.recurTkPlan(multi.ctx.recurTkInputs());ok(mp.available===18&&mp.cap===18,'multiple usable tickets combine to eighteen');
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
 e.els['bk-hold-contract']={value:'C',dataset:{memberCourse:JSON.stringify(['M','PT'])}};
 e.els['bk-hold-contract-field']={hidden:true};
 await e.ctx.recurContractChoices();
 ok(e.els['bk-hold-contract'].innerHTML.includes('<option value="C">未付款方案 · 10 天</option>'),'loads eligible contract without an esc global or displaying its internal id');
 ok(e.els['bk-hold-contract'].value==='C'&&!e.els['bk-hold-contract-field'].hidden,'keeps the selected contract');
 e.els['bk-hold-contract'].value='';
 e.setData([],[]);
 await e.ctx.recurContractChoices();
 ok(e.els['bk-hold-contract-field'].hidden&&e.els['bk-hold-contract'].disabled,'hides contract selector when no eligible request exists');
 const box=extract('recurBoxHtml');
 ok(box.indexOf('bk-hold-contract-field')<box.indexOf('id="${prefix}-recurring"'),'contract selector precedes recurring switch');
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
