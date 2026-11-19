// Real UI handlers at desktop/mobile dimensions. Fake transport only; no DB credentials.
const fs=require('fs'),assert=require('assert'),path=require('path');const s=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const grab=(name,async=true)=>{const i=s.indexOf((async?'async ':'')+'function '+name+'(');assert(i>=0,name);return s.slice(i,s.indexOf('\n}\n',i)+3);};
const msg=new Function('return ('+grab('bookingAccountErrMsg',false)+');')();let pass=0;
const ok=(name,c)=>{assert(c,name);pass++;console.log('✓ '+name);};
function make(width,reply){const log={calls:[],toasts:[],nav:[],closes:0};const e={window:{innerWidth:width,_mlgCtx:{C:{bid:'B',rev:7,seats:['S'],state:'ready'}}},document:{getElementById:()=>null},sb:{rpc:async(n,a)=>{log.calls.push({n,a});if(reply instanceof Error)throw reply;return reply;}},dbCacheClear(){},showToast:t=>log.toasts.push(t),closeModal:()=>log.closes++,navTo:p=>log.nav.push(p),bookingAccountErrMsg:msg,GRP_JOIN_ERR:{},cancelTooLateModal:()=>log.toasts.push('late')};
const scope=new Proxy(e,{has:()=>true,get:(t,k)=>k===Symbol.unscopables?undefined:k in t?t[k]:globalThis[k]});return {log,run:new Function('scope','with(scope){return ('+grab('doMemLeaveGroup')+');}')(scope)};}
(async()=>{for(const width of [390,1280]){
 for(const code of ['TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE','TICKET.UNKNOWN','SEAT.MULTIPLE','REFUND.NO_DEDUCT','REFUND.BALANCE_FULL']){
  const m=make(width,{data:{ok:false,error_code:code}});await m.run('B','C');ok(width+' '+code+' stays on page with clear reason',m.log.calls.length===1&&m.log.closes===0&&m.log.nav.length===0&&m.log.toasts[0]===msg(code)&&!m.log.toasts[0].includes(code));
 }
 let m=make(width,{data:{ok:true,refunded:1,outcome:'refunded',refund_ticket:'T'}});await m.run('B','C');ok(width+' exact confirmed revision sent',m.log.calls[0].n==='fn_member_leave_group_v2'&&m.log.calls[0].a.p_expect_rev===7&&m.log.calls[0].a.p_seat_key==='S');ok(width+' real refund success shown',m.log.closes===1&&m.log.nav.length===1&&m.log.toasts[0]==='已取消報名，退回 1 堂');
 m=make(width,{data:{ok:true,refunded:0,outcome:'no_deduction'}});await m.run('B','C');ok(width+' contradictory response stays unconfirmed',m.log.closes===0&&m.log.nav.length===0&&m.log.toasts[0].includes('尚未確認'));
 m=make(width,{data:{ok:true,refund_ticket:'T'}});await m.run('B','C');ok(width+' incomplete response never claims refund',m.log.closes===0&&m.log.nav.length===0&&m.log.toasts[0].includes('尚未確認'));
 for(const reply of [new Error('network'),{error:{message:'lost response'}}]){m=make(width,reply);await m.run('B','C');ok(width+' lost response not retried or declared cancelled',m.log.calls.length===1&&m.log.closes===0&&m.log.nav.length===0&&m.log.toasts[0].includes('尚未確認'));}
 const noctx=make(width,{data:{ok:true,refunded:1,outcome:'refunded'}});await noctx.run('B','missing');ok(width+' missing confirmation makes no request',noctx.log.calls.length===0);
 const twice=make(width,new Error('network'));await twice.run('B','C');await twice.run('B','C');ok(width+' unknown result cannot resend',twice.log.calls.length===1);
}
ok('helper and member handler declared in same inline script',(()=>{const blocks=[...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);return blocks.some(b=>b.includes('function bookingAccountErrMsg(')&&b.includes('async function doMemLeaveGroup('));})());
console.log(pass+' passed');})().catch(e=>{console.error(e);process.exitCode=1;});
