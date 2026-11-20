const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=src.indexOf('async function _doConvertPending('),code=src.slice(start,src.indexOf('\n}',start)+2);
let pass=0;function ok(c,m){if(!c)throw Error(m);pass++;}
function setup(o={}){
 const calls=[],messages=[],modals=[];let reads=0;
 const b={id:'B',member_id:'M',pending_contract:true,contract_id:'C',ticket_type_id:'PT',status:'booked',date:'2026-12-01',start_time:'13:00',category:'私人教練',...o.booking};
 const contract=o.contract===undefined?{id:'C',member_id:'M',ticket_id:'T'}:o.contract;
 const env={window:{_cpBid:'B'},console,cxBusy:()=>()=>{},dbGet:async(t)=>{reads++;if(o.readFailure&&t==='contracts')throw Error('offline');return t==='bookings'?b:contract;},
  dbGetAll:async(t)=>t==='member_tickets'?(o.fallback||[]):[],bkHoldExpired:()=>false,bkTypeIdOf:()=> 'PT',
  listUsableTickets:async()=>o.tickets||[{id:'OTHER',sessions_remaining:8},{id:'T',sessions_remaining:6}],
  tkUsableBy:()=>true,bkTicketTypeOk:()=>true,showToast:m=>messages.push(m),showModal:m=>modals.push(m),holdSettleStart:async(...args)=>calls.push(args)};
 vm.createContext(env);vm.runInContext(code,env);return {env,calls,messages,modals,reads:()=>reads};
}
(async()=>{
 let e=setup();await e.env._doConvertPending('M');ok(e.calls.length===1&&e.calls[0][1]==='T','linked contract selects its issued ticket, not earliest other ticket');ok(e.calls[0][2]==='B','keeps original booking anchor');ok(!e.modals.length,'does not offer unrelated ticket picker');
 e=setup({contract:{member_id:'M',ticket_id:null}});await e.env._doConvertPending('M');ok(!e.calls.length&&e.messages.some(x=>x.includes('尚未發放')),'unissued contract cannot borrow another ticket');
 e=setup({contract:{member_id:'OTHER',ticket_id:'T'}});await e.env._doConvertPending('M');ok(!e.calls.length,'other member contract is blocked');
 e=setup({contract:null});await e.env._doConvertPending('M');ok(!e.calls.length,'missing contract is blocked');
 e=setup({tickets:[{id:'OTHER',sessions_remaining:8}]});await e.env._doConvertPending('M');ok(!e.calls.length,'no usable issued ticket does not borrow unrelated ticket');
 e=setup({readFailure:true});await e.env._doConvertPending('M');ok(!e.calls.length&&e.messages.some(x=>x.includes('offline')),'read failure cannot convert');
 e=setup({tickets:[],fallback:[{id:'T',status:'usable',sessions_total:12,unlocked_sessions:6,installment:{count:2}}]});await e.env._doConvertPending('M');ok(e.calls.length===1&&e.calls[0][1]==='T','fully booked paid portion can still reserve unpaid contract portion');
 e=setup({booking:{contract_id:null},tickets:[{id:'T'}]});await e.env._doConvertPending('M');ok(e.calls.length===1&&e.calls[0][1]==='T','ordinary uncontracted hold remains supported');
 e=setup({booking:{status:'cancelled'}});await e.env._doConvertPending('M');ok(!e.calls.length,'cancelled booking is not resurrected');
 ok(!/deductTicket\(|dbPut\('bookings'/.test(code),'front end does not deduct or cancel separately');
 console.log(pass+' passed');
})().catch(e=>{console.error(e);process.exit(1)});
