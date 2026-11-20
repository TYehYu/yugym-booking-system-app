'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fn=name=>{const a=src.search(new RegExp('(?:async )?function '+name+'\\('));assert(a>=0,name);return src.slice(a,src.indexOf('\n}',a)+2)};
const tk=()=>({id:'T',member_id:'M',sessions_total:12,unlocked_sessions:4,amount_paid:4000,installment:{count:3,current:1,segments:[4,4,4],amounts:[4000,4000,4000]}});
let passed=0;const ok=(label,condition)=>{assert(condition,label);passed++;};
const terms=t=>({ticket_id:'T',member_id:'M',total:12,unlocked_before:4,amount_paid_before:4000,sessions:4,amount:4000,method:'cash',vouchers:0,period_from:2,period_to:2,segments:[4,4,4],amounts:[4000,4000,4000],install_count:3});
function context(ct={id:'C',ticket_id:'T',member_id:'M',sign_type:'remote',signed_at:'2026-11-19',installment_signs:[]}){
 const elements={'inx-n':{value:'4'},'inx-amt':{value:'4000'},'inx-method':{value:'cash'},'inx-paper-ack':{checked:false}};
 const c={window:{_inxState:{ticket:tk(),contract:ct,receipt:null}},document:{getElementById:id=>elements[id]||null},isDeskLike:()=>true,
 dbGet:async(table)=>table==='member_tickets'?tk():table==='contracts'?ct:{id:'M'},dbGetAll:async()=>[ct],
 instSignFind:(c,n)=>(c.installment_signs||[]).slice().reverse().find(s=>s.n===n),
 dbCacheClear(){},closeModal(){},openMemberDetail(){},invReadFields:()=>({mode:'none'}),invCheckFields:()=>null,
 calls:[],toasts:[],showToast(msg){c.toasts.push(msg)},uid:()=> 'receipt_TEST123',console:{error(){}},
 invIssueForPurchase:async()=>({invoice_number:'TEST'}),bindHeldBookings:async()=>0,
 sb:{rpc:async(name,args)=>{c.calls.push({name,args});return {data:{ok:true,request_id:'request1',signed:false}}}}};
 vm.createContext(c);for(const n of ['instTermsKey','instCollectTerms','instReadTerms','instTermsSummary','instCollectError','instCtOfTicket','_confirmInstallNext'])vm.runInContext(fn(n),c);
 return {c,e:elements};
}
(async()=>{
 let {c,e}=context();const plan=c.instReadTerms(tk());ok('canonical default period',plan.period_from===2&&plan.period_to===2);
 const all=c.instCollectTerms(tk(),8,8000,'transfer',0);ok('remaining payment covers both periods',all.period_from===2&&all.period_to===3);
 const partial=c.instCollectTerms(tk(),2,2000,'cash',0);ok('partial payment says actual sessions',partial.sessions===2&&partial.period_from===2&&partial.period_to===2);
 for(const [n,amount]of [[0,1],[9,1],[1,-1],[1,1.5]]){let thrown=false;try{c.instCollectTerms(tk(),n,amount,'cash',0)}catch(_){thrown=true}ok('invalid input '+n+','+amount,thrown)}
 e['inx-amt'].value='';let thrown=false;try{c.instReadTerms(tk())}catch(_){thrown=true}ok('blank amount is not zero',thrown);e['inx-amt'].value='4000';
 c.dbGetAll=async()=>{throw Error('offline')};await c._confirmInstallNext('T');ok('read failure no collection',c.calls.length===0);
 ({c,e}=context());c.dbGetAll=async()=>[];await c._confirmInstallNext('T');ok('missing contract no collection',c.calls.length===0);
 ({c,e}=context());c.dbGetAll=async()=>[{},{}];await c._confirmInstallNext('T');ok('multiple contracts no collection',c.calls.length===0);
 ({c,e}=context());await c._confirmInstallNext('T');ok('unsigned sends request only',c.calls.length===1&&c.calls[0].name==='fn_installment_request_v2');ok('request exact payment terms',c.calls[0].args.p_terms.amount===4000&&c.calls[0].args.p_terms.sessions===4);
 const signed={id:'C',ticket_id:'T',member_id:'M',sign_type:'remote',signed_at:'2026-11-19',installment_signs:[{n:2,signature:'png',signed_at:'now',terms:terms()}]};
 ({c,e}=context(signed));e['inx-amt'].value='3900';await c._confirmInstallNext('T');ok('changed amount re-requests signature',c.calls[0].name==='fn_installment_request_v2');
 ({c,e}=context(signed));e['inx-n'].value='8';e['inx-amt'].value='8000';await c._confirmInstallNext('T');ok('all remaining needs matching signature',c.calls[0].name==='fn_installment_request_v2'&&c.calls[0].args.p_terms.period_to===3);
 ({c,e}=context({...signed,sign_type:'paper'}));await c._confirmInstallNext('T');ok('paper no acknowledgement no collection',c.calls.length===0);
 e['inx-paper-ack'].checked=true;c.sb.rpc=async(name,args)=>{c.calls.push({name,args});return {data:{ok:true,purchase:{id:'P'}}}};await c._confirmInstallNext('T');ok('paper acknowledgement submitted',c.calls[0].args.p_paper_ack===true);
 ({c,e}=context(signed));let first=true;c.sb.rpc=async(name,args)=>{c.calls.push({name,args});if(first){first=false;throw Error('network lost')}return {data:{ok:true,already:true}}};
 await c._confirmInstallNext('T');ok('lost response preserves receipt',!!c.window._inxState.receipt);ok('unknown result is explicit',c.toasts.some(s=>s.includes('結果不明')));
 c.dbGet=async(table)=>table==='member_tickets'?{...tk(),unlocked_sessions:8,amount_paid:8000}:signed;
 await c._confirmInstallNext('T');ok('retry original receipt despite latest changed ticket',c.calls.length===2&&c.calls[0].args.p_receipt_id===c.calls[1].args.p_receipt_id&&c.calls[1].args.p_terms.unlocked_before===4);
 e['inx-amt'].value='3900';await c._confirmInstallNext('T');ok('uncertain payment may not change terms',c.calls.length===2);
 ({c,e}=context(signed));c.sb.rpc=async(name,args)=>{c.calls.push({name,args});return {data:{ok:false,error_code:'INSTALLMENT.PLAN_CHANGED'}}};await c._confirmInstallNext('T');ok('definite refusal clears attempted receipt',c.window._inxState.receipt===null);ok('failure has plain-language prompt',c.toasts.some(s=>s.includes('資料已變更')));
 ({c,e}=context(signed));c.isDeskLike=()=>false;await c._confirmInstallNext('T');ok('member cannot collect from frontend',c.calls.length===0);
 ({c,e}=context(signed));c.invReadFields=()=>null;await c._confirmInstallNext('T');ok('hidden invoice cannot silently omit',c.calls.length===0);

 ({c,e}=context({...signed,sign_type:'paper'}));e['inx-sign-status']={textContent:'',style:{}};e['inx-go']={disabled:false,textContent:''};vm.runInContext(fn('instCollectSync'),c);
 c.instCollectSync();ok('paper button initially disabled',e['inx-go'].disabled);
 e['inx-paper-ack'].checked=true;c.invCheckFields=()=> 'missing email';c.instCollectSync();ok('paper acknowledgement cannot override invalid invoice',e['inx-go'].disabled);
 c.invCheckFields=()=>null;c.instCollectSync();ok('valid paper and invoice enable submit',!e['inx-go'].disabled);
 for(const changed of ['amount','period']){
  let issued=0,writes=0,ended=0;const x={isDeskLike:()=>true,cxBusy:()=>()=>ended++,dbGet:async(table)=>table==='ticket_grant_requests'?{id:'R',status:'pending',contract_id:'C',payload:{paidAmount:100,installCount:2}}:{id:'C',signed_at:'yes',amount:100,fill_snapshot:'old'},grFillApply:()=>({paidAmount:changed==='amount'?200:100,installCount:changed==='period'?3:2}),grCtAmount:p=>p.paidAmount,ctSnapInstall:()=>2,showToast(){},_grantIssue:async()=>issued++,dbPut:async()=>writes++,console:{error(){}}};vm.createContext(x);vm.runInContext(fn('_grantReqApprove'),x);await x._grantReqApprove('R');ok('changed first-contract '+changed+' cannot issue',issued===0&&writes===0&&ended===1);
 }
 {let writes=0;const x={dbGet:async(table)=>table==='course_plans'?{sessions_base:12,sessions_bonus:0,ticket_type_id:'TT'}:{category:'私人教練'},dbPut:async()=>writes++};vm.createContext(x);vm.runInContext(fn('_issueTicketsFromApp'),x);let rejected=false;try{await x._issueTicketsFromApp({plan_id:'P'},'none',null)}catch(e){rejected=e.message.includes('標準銷售')}ok('legacy application cannot bypass contract',rejected&&writes===0);}

 ({c,e}=context(signed));const q=c.instCollectTerms(tk(),8,8000,'transfer',0);const draft={...signed,installment_signs:[{n:2,terms:q,signature:'png',signed_at:'now'}]};let html='';
 c.dbGet=async(table)=>table==='member_tickets'?tk():table==='contracts'?draft:{name:'test'};c.dbGetAll=async()=>[draft];c.showModal=h=>html=h;c.invFieldsHTML=()=>'';c.inxInvSync=()=>{};c.inxVoucherInit=async()=>{};c.instCollectSync=()=>{};vm.runInContext(fn('openInstallNext'),c);await c.openInstallNext('T');
 ok('reopened form retains signed custom sessions',e['inx-n'].value===8);ok('reopened form retains signed custom amount',e['inx-amt'].value===8000);ok('reopened form retains signed payment method',html.includes('value="transfer" selected'));ok('next-period shortcut still means one period',html.includes('下一期（4 堂・$4,000）'));
 console.log(passed+' assertions passed; actual functions, no network');
})().catch(e=>{console.error(e);process.exitCode=1});
