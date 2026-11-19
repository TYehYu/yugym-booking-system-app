/* Execute published functions at desktop/mobile dimensions; simulated transport.
   This checks shared call routing, NOT a real authenticated browser session. */
const fs=require('fs'),assert=require('assert');const src=fs.readFileSync(require('path').join(__dirname,'../../index.html'),'utf8');
const grab=n=>{const i=src.indexOf('async function '+n+'(');assert(i>=0);return src.slice(i,src.indexOf('\n}\n',i)+3);};
let passed=0;const check=(n,c)=>{assert(c,n);passed++;console.log('✓ '+n);};
function run(name,e){const scope=new Proxy(e,{has:()=>true,get:(t,k)=>k===Symbol.unscopables?undefined:k in t?t[k]:globalThis[k]});return new Function('scope','with(scope){return ('+grab(name)+');}')(scope);}
(async()=>{for(const width of [390,1280])for(const desk of [true,false]){
 const calls=[],b={id:'B',ticket_id:'T',category:'私人教練',status:'booked'};
 const e={window:{innerWidth:width,FEATURE_FLAGS:{cancelBookingRpc:true}},FEATURE_FLAGS:{cancelBookingRpc:true},CLOUD:true,SESSION:{id:'C',role:desk?'front_desk':'coach'},CUR_PAGE:'calendar',
 isDeskLike:()=>desk,tkNetDeductOn:async()=>0,dbCacheClear(){},dbGet:async()=>({...b}),showToast(){},tkQuotaMsg:()=>'',closeModal(){},navTo(){},
 revokeRewardOnCancel:async()=>({}),revokeMakeupOnCancel:async()=>0,rewardToastText:()=>'',console:{error(){},warn(){}},
 sb:{rpc:async(n,a)=>{calls.push({n,a});return {data:n==='fn_cancel_booking'?{ok:true,cancellation_result:'refunded'}:{ok:true,outcome:'refunded',refunded:1,remaining:2}};}}};
 await run('deductTicket',e)({id:'T',sessions_remaining:3},'B','C');
 check(width+' '+(desk?'desk':'coach')+' deduction route',calls.length===1&&calls[0].n===(desk?'fn_desk_deduct_ticket':'fn_deduct_ticket'));
 calls.length=0;await run('cancelBooking',e)('B','auto');
 check(width+' '+(desk?'desk':'coach')+' cancellation route',calls.length===1&&calls[0].n===(desk?'fn_desk_cancel_booking':'fn_cancel_booking'));
}
const args=[];const e={window:{},benefitTypeOfTypeId:()=> 'pt_pass',spaceForBooking:()=>({space:'general',resource:'general_area'}),dbCacheClear(){},sb:{rpc:async(n,a)=>{args.push(a);return {error:{message:'PGRST202: signature mismatch'}};}}};
const result=await run('createBookingViaRpc',e)({member_id:'M',coach_id:'C',category:'私人教練',type_id:'PT'}, {id:'T',ticket_type_id:'PT'},'2026-11-20','09:00','operation');
check('creation sends idempotency parameter not present in current production signature',Object.keys(args[0]).length===12&&Object.hasOwn(args[0],'p_idempotency_key'));
check('signature refusal is surfaced, no booking success claimed',result.ok===false&&result.reason.includes('PGRST202'));
console.log(passed+' passed');})().catch(e=>{console.error(e);process.exitCode=1;});
