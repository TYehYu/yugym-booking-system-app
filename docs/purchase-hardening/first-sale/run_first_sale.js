#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createHarness,atomicWrite,checkServiceKey,is2xx,inList}=require('../../testdb/renewal/harness');
const {askHidden}=require('../../testdb/hold-settle/hs_common');
const {makeAcceptanceApi,parseEnv}=require('../../booking-health/performance/run_acceptance');
const {derived,cleanupApi,readRetry}=require('../acceptance/run_acceptance');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rows(api,q){const r=await api.rest('GET',q);if(!is2xx(r)||!Array.isArray(r.json)||r.json.length>=1000)throw Error('Cannot verify bounded read: '+q.split('?')[0]);return r.json}
async function unusedPhone(api,used=new Set(),generate=()=> '090000'+String(crypto.randomInt(0,10000)).padStart(4,'0')){
 for(let i=0;i<10;i++){const phone=generate();if(used.has(phone))continue;const found=await rows(api,'members?phone=eq.'+encodeURIComponent(phone)+'&select=id&limit=3');if(!found.length){used.add(phone);return phone}}
 throw Error('Cannot reserve unused test phones; no fixture member created');
}
async function discover(api,H,before){
 const mids=H.createdIds('members');if(!mids.length)return;for(const table of ['member_tickets','contracts','ticket_grant_requests','purchases','bookings'])for(const r of await rows(api,table+'?member_id='+inList(mids)+'&select=id&limit=1000'))derived(H,before,table,r.id);
 for(const [table,col,ids]of [['ticket_logs','ticket_id',H.createdIds('member_tickets')],['installment_receipts','ticket_id',H.createdIds('member_tickets')],['invoices','purchase_id',H.createdIds('purchases')],['notifications','recipient_id',[...mids,...H.createdIds('employees')]]])if(ids.length)for(const r of await rows(api,table+'?'+col+'='+inList(ids)+'&select=id&limit=1000'))derived(H,before,table,r.id);
}
async function clean(base,H,before){let problem=null;try{await discover(base,H,before)}catch(e){problem=e.message}
 const api=cleanupApi(base,H);const specs=['installment_receipts','invoices','purchases','ticket_logs','notifications','ticket_grant_requests','contracts','bookings','member_tickets','members','course_plans','employees','ticket_types'].map(table=>({table,col:'id',ids:()=>H.createdIds(table)}));
 specs.splice(8,0,{table:'booking_op_rev',col:'booking_id',ids:()=>H.createdIds('bookings'),optional:true});
 const rep=await H.cleanup(api,specs);if(problem)rep.failures.push(problem);
 for(const table of Object.keys(H.MF.tables)){const ids=H.createdIds(table);if(!ids.length)continue;try{const q='change_log?tbl=eq.'+table+'&row_id='+inList(ids),d=await base.rest('DELETE',q),v=await base.rest('GET',q+'&select=seq');if(!is2xx(d)||!is2xx(v)||!Array.isArray(v.json)||v.json.length)rep.failures.push('change_log '+table)}catch(e){rep.failures.push('change_log '+table+' '+e.message)}}return rep;
}
async function main(args=process.argv.slice(2)){
 const opt=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1]},env=parseEnv(opt('--env')),work=path.resolve(opt('--work','/private/tmp/yugym-first-sale-20261119'));
 fs.mkdirSync(work,{recursive:true});const H=createHarness({work,log:console.log});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>H.requestStop(sig));
 const key=await askHidden('測試庫 service_role 金鑰（隱藏輸入，不儲存）> '),bad=checkServiceKey(key,'kucvxpjatptfckhlxptj');if(bad)throw Error(bad);
 const api=readRetry(makeAcceptanceApi(key,env.ANON_KEY,{stopSignal:H.stopSignal}),console.log),safe=readRetry(makeAcceptanceApi(key,env.ANON_KEY,{noStop:true}),console.log);
 const old=H.loadUnfinished();if(old){if(old.corrupt)throw Error('Manifest corrupt: no new writes');await H.recover(safe,old);const before=JSON.parse(fs.readFileSync(path.join(work,'baseline.json'))),rep=await clean(safe,H,before),diff=H.diffSnap(before,await H.snapshot(safe));try{fs.unlinkSync(path.join(work,'sessions.json'))}catch(e){if(e.code!=='ENOENT')rep.failures.push(e.message)}const good=!rep.failures.length&&!H.unresolved().length&&!diff.tablesChanged.length&&!diff.authUsersChanged&&H.canClaimComplete();if(good){H.MF.finished=true;H.save();H.archiveManifest('recovered')}H.saveReport(path.join(work,'recovery_report.json'),{good,rep,diff});console.log(good?'恢復完成；請用新的 work 路徑重建':'恢復未完成，請交主代理');process.exitCode=good?0:1;return}
 for(const f of ['profiles.json','report.json','ui_done.json'])if(fs.existsSync(path.join(work,f)))throw Error('Use a fresh work directory');
 const check=await api.rest('POST','rpc/zz_ica_fingerprint',{});if(check.status!==200||check.json?.cluster!=='7662742571317219726')throw Error('TEST preflight failed before creation');const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'../acceptance/expected.json')));for(const[n,h]of Object.entries(expected))if(check.json.functions?.[n]!==h)throw Error('Fingerprint mismatch: '+n);
 const stage=JSON.parse(fs.readFileSync(path.join(__dirname,'stage12_dependency.json')))[0];if(check.json.functions?.[stage.signature]!==stage.md5)throw Error('Stage12 fingerprint mismatch before creation');
 const before=await H.snapshot(safe);atomicWrite(path.join(work,'baseline.json'),JSON.stringify(before),0o600);
 const run=crypto.randomBytes(3).toString('hex'),id=n=>'CC-FS-'+n+'-'+run;H.newManifest(run);const profile={run,desk:id('DESK'),coach:id('COACH'),member:id('REMOTE'),paper:id('PAPER'),plans:{}};const sessions={ref:'kucvxpjatptfckhlxptj'};let ui=null,error=null;const checks=[];
 const ok=(name,v)=>{checks.push({name,ok:!!v});if(!v)throw Error(name)};
 try{
  const usedPhones=new Set(),remotePhone=await unusedPhone(safe,usedPhones),paperPhone=await unusedPhone(safe,usedPhones);
  for(const role of ['desk','member']){const mail='cc-fs-'+role+'-'+run+'@cc-test.yugym.local',pw=crypto.randomBytes(24).toString('base64url')+'Aa1!';const u=await H.trackedCreateUser(api,role,mail,pw);await H.trackedInsert(api,role==='member'?'members':'employees',{id:profile[role],auth_id:u.id,name:'CC首次'+(role==='member'?'電子會員':'櫃檯')+' '+run,status:'active',...(role==='member'?{phone:remotePhone,email:'remote-'+run+'@example.invalid',birth_date:'1990-01-01',line_notify:false}:{role:'front_desk',need_punch:false})});const r=await api.signIn(mail,pw);if(!is2xx(r)||!r.json?.access_token)throw Error('Login failed '+role);sessions[role]=r.json}
  await H.trackedInsert(api,'employees',{id:profile.coach,name:'CC首次教練 '+run,role:'coach',status:'active',can_teach:true,need_punch:false});
  await H.trackedInsert(api,'members',{id:profile.paper,name:'CC首次紙本會員 '+run,phone:paperPhone,email:'paper-'+run+'@example.invalid',status:'active',birth_date:'1990-01-01',line_notify:false});
  const types=await rows(api,'ticket_types?name=eq.'+encodeURIComponent('教練課')+'&category=eq.'+encodeURIComponent('私人教練')+'&select=id&limit=3');if(types.length!==1)throw Error('Expected exactly one existing private type');profile.tt=types[0].id;
  for(const name of ['REMOTE','PAPER']){const plan=id('PLAN'+name);profile.plans[name]=plan;await H.trackedInsert(api,'course_plans',{id:plan,name:'CC首次'+(name==='REMOTE'?'電子':'紙本')+'12堂 '+run,ticket_type_id:profile.tt,format:'1v1',unit_price:1000,sessions_base:12,sessions_bonus:0,valid_days:365,active:true,plan_type:'general',installment:true,member_applyable:false,archived:false})}
  atomicWrite(path.join(work,'profiles.json'),JSON.stringify(profile,null,2),0o600);atomicWrite(path.join(work,'sessions.json'),JSON.stringify(sessions),0o600);
  console.log('首次購買夾具已就緒；不要按 Enter，回覆完成讓主代理操作。');const end=Date.now()+90*60000;
  while(!H.stopping&&Date.now()<end){if(fs.existsSync(path.join(work,'ui_done.json'))){ui=JSON.parse(fs.readFileSync(path.join(work,'ui_done.json')));break}await sleep(500)}
  await discover(safe,H,before);
  for(const [name,mid]of [['REMOTE',profile.member],['PAPER',profile.paper]]){
   const ts=await rows(safe,'member_tickets?member_id=eq.'+mid+'&select=id,sessions_total,sessions_remaining,unlocked_sessions,amount_paid,installment');ok(name+' exactly one ticket',ts.length===1);const t=ts[0];ok(name+' exact totals',t.sessions_total===12&&t.sessions_remaining===12&&t.unlocked_sessions===4&&Number(t.amount_paid)===4000);
   const ps=await rows(safe,'purchases?ticket_id=eq.'+t.id+'&select=id,deal_amount'),ls=await rows(safe,'ticket_logs?ticket_id=eq.'+t.id+'&select=action,delta'),cs=await rows(safe,'contracts?ticket_id=eq.'+t.id+'&select=id,sign_type,signed_at,signature'),rs=await rows(safe,'ticket_grant_requests?ticket_id=eq.'+t.id+'&select=status');
   ok(name+' one payment and grant only',ps.length===1&&Number(ps[0].deal_amount)===4000&&ls.length===1&&ls[0].action==='grant'&&ls[0].delta===12);ok(name+' issued request and signed linked contract',rs.length===1&&rs[0].status==='issued'&&cs.length===1&&!!cs[0].signed_at&&cs[0].sign_type===(name==='REMOTE'?'remote':'paper'));ok(name+' correct signature evidence',name==='REMOTE'?String(cs[0].signature||'').startsWith('data:image/png;base64,'):!cs[0].signature);
   const invs=await rows(safe,'invoices?purchase_id=eq.'+ps[0].id+'&select=id,status,invoice_number,merchant_order_no');ok(name+' invoice selection',name==='REMOTE'?invs.length===0:invs.length===1&&invs[0].status==='issued'&&/^[A-Z]{2}\d{8}$/.test(invs[0].invoice_number||''));
  }
 }catch(e){error=e.message;console.log('停止：'+error)}finally{
  let cleanup,diff;try{cleanup=await clean(safe,H,before)}catch(e){cleanup={failures:[e.message]}}try{fs.unlinkSync(path.join(work,'sessions.json'))}catch(e){if(e.code!=='ENOENT')cleanup.failures.push(e.message)}try{diff=H.diffSnap(before,await H.snapshot(safe))}catch(e){cleanup.failures.push('snapshot '+e.message)}
  const cleanOk=!cleanup.failures.length&&!H.unresolved().length&&diff&&!diff.tablesChanged.length&&!diff.authUsersChanged;if(cleanOk){H.MF.finished=true;const e=H.trySave();if(e)H.persistFail(e)}const uiOk=ui?.complete&&ui?.logoutConfirmed&&ui?.desktop&&ui?.mobile&&ui?.electronic&&ui?.paper&&ui?.provider;
  const report={status:!H.canClaimComplete()?'PERSIST_FAILED':!cleanOk?'CLEANUP_INCOMPLETE':error?'FAILED':!uiOk?'UI_UNVERIFIED':'FIRST_SALE_COMPLETE',error,checks,ui,cleanup,diff,pending:H.unresolved()};const saved=H.saveReport(path.join(work,'report.json'),report);console.log('整體判定：'+(saved.ok?report.status:'REPORT_NOT_SAVED'));process.exitCode=saved.ok&&report.status==='FIRST_SALE_COMPLETE'?0:1;
 }
}
module.exports={discover,clean,unusedPhone};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
