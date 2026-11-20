/* Executes shared UI functions. Mock transport, not authenticated browser QA. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');assert(i>=0,n);return src.slice(i,src.indexOf('\n}',i)+2);};
const message=new Function(grab('bookingAccountErrMsg')+';return bookingAccountErrMsg;')();
function get(n,e){const scope=new Proxy(e,{has:()=>true,get:(t,k)=>k===Symbol.unscopables?undefined:k in t?t[k]:globalThis[k]});return new Function('scope','with(scope){return ('+grab(n)+');}')(scope);}
let passed=0;const check=(n,c)=>{assert(c,n);passed++;};
(async()=>{
for(const width of [390,1280])for(const desk of [true,false]){
for(const state of ['unbound','other-ticket','cancelled','missing','read-error','owned','group-seat','normal']){
 const calls=[],toasts=[],audit=[];const ticket={id:'T',sessions_remaining:state==='owned'?0:3};
 const before=ticket.sessions_remaining;
 const b={id:'B',ticket_id:state==='unbound'||state==='group-seat'?null:state==='other-ticket'?'OTHER':'T',status:state==='cancelled'?'cancelled':'booked',category:state==='group-seat'?'小班肌力':'私人教練'};
 const e={window:{innerWidth:width},CLOUD:true,isDeskLike:()=>desk,bookingAccountErrMsg:message,
 tkNetDeductOn:async()=>state==='normal'?0:1,dbGet:async()=>{if(state==='read-error')throw Error('offline');return state==='missing'?null:b;},
 showToast:m=>toasts.push(m),logTicket:async(...a)=>audit.push(a),dbCacheClear(){},tkQuotaMsg:()=>'',dbFriendlyError:x=>x,
 console:{error(){},warn(){}},sb:{rpc:async(n,a)=>{calls.push({n,a});return {data:{ok:true,remaining:2}};}}};
 const result=await get('deductTicket',e)(ticket,'B','EMP');
 const key=width+' '+(desk?'desk':'coach')+' '+state;
 if(['unbound','other-ticket','cancelled','missing','read-error'].includes(state)){
  check(key+' refused',result===false);check(key+' no financial or audit write',calls.length===0&&audit.length===0&&ticket.sessions_remaining===before);check(key+' clear message',toasts.length===1);
 }else if(state==='normal'){
  check(key+' shared RPC route',result===true&&calls.length===1&&calls[0].n===(desk?'fn_desk_deduct_ticket':'fn_deduct_ticket'));
 }else{
  check(key+' idempotent success',result===true&&calls.length===0&&ticket.sessions_remaining===before);
  check(key+' audit only',audit.length===1&&audit[0][1]==='adjust'&&audit[0][2]===0);
 }
}
}
check('ownership error is actionable',/不要刪除重約/.test(message('TICKET.LEDGER_OWNERSHIP')));
check('commit guard error is actionable',/不要刪除重約/.test(message('TICKET.TRANSFER_LEDGER_MISMATCH')));
check('unchanged basic ledger errors remain recognized',/核對/.test(message('TICKET.LEDGER_NEGATIVE')));
const move=get('moveErrMsg',{});
check('move final verification error is clear',/整批已回復/.test(move('MOVE.LEDGER_MISMATCH')));
check('move ownership error is clear',/不要刪除重約/.test(move('TICKET.LEDGER_OWNERSHIP')));
const friendly=get('dbFriendlyError',{DB_LABEL:{},tbl:x=>x,bookingAccountErrMsg:message,console:{error(){}}});
for(const code of ['TICKET.LEDGER_OWNERSHIP','TICKET.TRANSFER_LEDGER_MISMATCH']){
 const e=friendly({message:code,code:'P0001'},'bookings','儲存');
 check(code+' transport error is readable',/不要刪除重約/.test(e.message));
 check(code+' original error preserved',e.rawMessage===code&&e.code===code);
}
for(const width of [390,1280])for(const state of ['ownership','transport','success']){
 const calls=[],toasts=[],button={disabled:false,textContent:'確定調課'};
 const e={window:{innerWidth:width,_mvBid:'TO',_mvPick:'FROM',_mvMode:'hold'},CLOUD:true,CUR_PAGE:'calendar',
 document:{getElementById:()=>button},bookingAccountErrMsg:message,dbCacheClear(){},showToast:m=>toasts.push(m),closeModal(){},navTo(){},
 sb:{rpc:async(n,a)=>{calls.push({n,a});return state==='success'?{data:{ok:true}}:{error:{message:state==='ownership'?'TICKET.TRANSFER_LEDGER_MISMATCH':'offline'}};}}};
 await get('_doBkMoveTicket',e)();
 check(width+' '+state+' only one RPC',calls.length===1&&calls[0].n==='fn_move_booking_ticket');
 if(state==='ownership')check(width+' ownership is not mislabeled as connection failure',toasts.length===1&&/不要刪除重約/.test(toasts[0]));
 if(state==='transport')check(width+' transport still requires refresh',toasts.length===1&&/不確定/.test(toasts[0]));
 if(state!=='success')check(width+' '+state+' button restored',button.disabled===false&&button.textContent==='確定調課');
}
console.log(passed+' passed / 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
