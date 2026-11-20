#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createHarness,atomicWrite,checkServiceKey,verifyBlockedBy,rawHttp,is2xx,inList}=require('../../testdb/renewal/harness');
const {askHidden,today}=require('../../testdb/hold-settle/hs_common');
const {makeAcceptanceApi,parseEnv}=require('../../booking-health/performance/run_acceptance');
const {specs,terms,makeTicket,problems}=require('./fixtures');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function derived(H,before,table,id){if(H.createdIds(table).includes(id))return;if(!before.tables[table]||id in before.tables[table].rows)throw Error('No absence proof '+table);(H.MF.tables[table]??=[]).push({id,state:'created',checkedAbsent:true,source:'derived-from-owned-ticket-or-profile'});const e=H.trySave();if(e){H.persistFail(e);throw e;}}
async function rows(api,q){const r=await api.rest('GET',q);if(!is2xx(r)||!Array.isArray(r.json))throw Error('Read failed '+q.split('?')[0]+' HTTP '+r.status);if(r.json.length>=1000)throw Error('Discovery exceeded bounded fixture limit');return r.json;}
async function discover(api,H,before){
 const tids=H.createdIds('member_tickets'),mids=H.createdIds('members');
 for(const table of ['installment_receipts','purchases','ticket_logs','contracts'])if(tids.length)for(const r of await rows(api,table+'?ticket_id='+inList(tids)+'&select=id&limit=1000'))derived(H,before,table,r.id);
 if(mids.length)for(const r of await rows(api,'bookings?member_id='+inList(mids)+'&select=id&limit=1000'))derived(H,before,'bookings',r.id);
 const recips=[...mids,...H.createdIds('employees')];if(recips.length)for(const r of await rows(api,'notifications?recipient_id='+inList(recips)+'&select=id&limit=1000'))derived(H,before,'notifications',r.id);
 const pids=H.createdIds('purchases');if(pids.length)for(const r of await rows(api,'invoices?purchase_id='+inList(pids)+'&select=id&limit=1000'))derived(H,before,'invoices',r.id);
}
function cleanupApi(base,H){return {...base,
 adminDeleteUser:async id=>{const r=await base.adminDeleteUser(id);if(r.status===404&&(await base.adminGetUser(id)).status===404)return {status:204,json:null};return r;},
 rest:async(method,q,body,headers)=>{
  if(method==='DELETE'&&q.startsWith('installment_receipts?')){
   const ids=[...new Set(H.createdIds('installment_receipts').filter(Boolean))];
   if(q!=='installment_receipts?id='+inList(ids))throw Error('Receipt cleanup exact-id mismatch');
   return base.rest('POST','rpc/zz_ica_clean_receipts',{p_tickets:H.createdIds('member_tickets'),p_receipts:ids});
  }return base.rest(method,q,body,headers);
 }};}
async function cleanup(base,H,before){const errors=[];try{await discover(base,H,before);}catch(e){errors.push(e.message);}
 const api=cleanupApi(base,H),ids=t=>()=>H.createdIds(t);
 const spec=[...['installment_receipts','invoices','purchases','ticket_logs','notifications','contracts'].map(table=>({table,col:'id',ids:ids(table)})),
 {table:'bookings',col:'id',ids:ids('bookings')},{table:'booking_op_rev',col:'booking_id',ids:ids('bookings'),optional:true},
 ...['member_tickets','members','ticket_types','employees'].map(table=>({table,col:'id',ids:ids(table)}))];
 const rep=await H.cleanup(api,spec);rep.failures.push(...errors);
 for(const table of Object.keys(H.MF.tables)){const own=H.createdIds(table);if(!own.length)continue;try{const q='change_log?tbl=eq.'+table+'&row_id='+inList(own);const d=await base.rest('DELETE',q),v=await base.rest('GET',q+'&select=seq');if(!is2xx(d)||!is2xx(v)||!Array.isArray(v.json)||v.json.length)rep.failures.push('change_log '+table);}catch(e){rep.failures.push('change_log '+table+' '+e.message);}}
 return rep;
}
function classify({failures,clean,ui,persist}){return !persist?'REPORT_OR_MANIFEST_FAILED':!clean?'CLEANUP_INCOMPLETE':failures?'FAILED':!ui?'UI_UNVERIFIED':'ICA_ACCEPT_COMPLETE';}
function readRetry(base,log=()=>{}){
 const twice=async(fn,label)=>{try{return await fn();}catch(e){log('讀取中斷，重試一次：'+label);return await fn();}};
 return {...base,rest:(method,q,...rest)=>method==='GET'?twice(()=>base.rest(method,q,...rest),q.split('?')[0]):base.rest(method,q,...rest),
 adminListUsers:(...args)=>twice(()=>base.adminListUsers(...args),'Auth list')};
}
function archiveRecovered(work){
 const dest=path.join(work,'previous-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dest,{mode:0o700});
 const names=new Set(['baseline.json','manifest.json','profiles.json','concurrency_report.json','acceptance_report.json','recovery_report.json','ui_done.json']);
 for(const name of fs.readdirSync(work))if(names.has(name)||/^manifest\.recovered-[0-9]+\.json$/.test(name))fs.renameSync(path.join(work,name),path.join(dest,name));
 return dest;
}
async function main(args=process.argv.slice(2),suppliedKey=null){
 const opt=(k,d)=>{let i=args.indexOf(k);return i<0?d:args[i+1]},env=parseEnv(opt('--env')),work=path.resolve(opt('--work','/private/tmp/yugym-installment-accept-20261119'));
 const minutes=Number(opt('--minutes','75'));if(!(minutes>=1&&minutes<=90))throw Error('minutes must be 1–90');fs.mkdirSync(work,{recursive:true});
 const H=createHarness({work,log:console.log});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>H.requestStop(sig));
 const key=suppliedKey||await askHidden('測試庫 service_role 金鑰（隱藏輸入，不儲存）> ');const bad=checkServiceKey(key,'kucvxpjatptfckhlxptj');if(bad)throw Error(bad);
 const api=readRetry(makeAcceptanceApi(key,env.ANON_KEY,{stopSignal:H.stopSignal}),console.log),cleanApi=readRetry(makeAcceptanceApi(key,env.ANON_KEY,{noStop:true}),console.log);
 const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'expected.json'),'utf8'));
 const old=H.loadUnfinished();
 if(old){if(old.corrupt)throw Error('Manifest corrupt; no new writes');await H.recover(cleanApi,old);const b=JSON.parse(fs.readFileSync(path.join(work,'baseline.json')));const rep=await cleanup(cleanApi,H,b),diff=H.diffSnap(b,await H.snapshot(cleanApi));try{fs.unlinkSync(path.join(work,'sessions.json'));}catch(e){if(e.code!=='ENOENT')rep.failures.push(e.message);}const good=!rep.failures.length&&!H.unresolved().length&&!diff.tablesChanged.length&&!diff.authUsersChanged&&H.canClaimComplete();if(good){H.MF.finished=true;H.save();H.archiveManifest('recovered');}const saved=H.saveReport(path.join(work,'recovery_report.json'),{good,rep,diff,pending:H.unresolved()});if(good&&saved.ok){const archived=archiveRecovered(work);console.log('恢復核對完成，原報告已保留；使用同一次金鑰重新建立驗收登入。');return main(args,key);}console.log('恢復未完成，未建立新資料，請交主代理核對');process.exitCode=1;return;}
 for(const f of ['ui_done.json','profiles.json','acceptance_report.json'])if(fs.existsSync(path.join(work,f)))throw Error('Finished work folder cannot be reused; choose a fresh --work directory');
 const fp=await api.rest('POST','rpc/zz_ica_fingerprint',{}),badfp=fp.status===200?problems(fp.json,expected):['Cannot read preflight HTTP '+fp.status];if(badfp.length)throw Error('Preflight stopped before creation: '+badfp.join('; '));
 const before=await H.snapshot(cleanApi);if(!before.tables.installment_receipts||before.tables.installment_receipts.count!==0||!before.tables.invoices||before.tables.invoices.count!==0)throw Error('Test receipt/invoice baseline must be empty');
 atomicWrite(path.join(work,'baseline.json'),JSON.stringify(before),0o600);
 const run=crypto.randomBytes(3).toString('hex');H.newManifest(run);const id=x=>'CC-ICA-'+x+'-'+run;
 const profile={run,desk:'CC-EMP-ICA-D-'+run,coach:'CC-EMP-ICA-C-'+run,member:id('M'),ccMember:id('CM'),tt:id('TT'),tickets:{},contracts:{}};
 const evidence={run,cases:{},checks:[]},sessions={ref:'kucvxpjatptfckhlxptj'};let failures=0,ui=null,error=null;
 const ok=(name,b,detail)=>{evidence.checks.push({name,ok:!!b,detail});if(!b)failures++;console.log((b?'✓ ':'✗ ')+name);};
 try{
  for(const role of ['desk','coach','member']){
   const email='cc-ica-'+role+'-'+run+'@cc-test.yugym.local',password=crypto.randomBytes(24).toString('base64url')+'Aa1!';const u=await H.trackedCreateUser(api,role,email,password);
   await H.trackedInsert(api,role==='member'?'members':'employees',{id:profile[role],auth_id:u.id,name:'ICA驗收'+({desk:'櫃檯',coach:'教練',member:'會員'}[role])+' '+run,status:'active',...(role==='member'?{email:'ica-'+run+'@example.invalid'}:{role:role==='coach'?'coach':'front_desk',need_punch:false})});
   const login=await api.signIn(email,password);if(!is2xx(login)||!login.json?.access_token)throw Error('Login failed '+role+' HTTP '+login.status);sessions[role]=login.json;
  }
  await H.trackedInsert(api,'members',{id:profile.ccMember,name:'ICA並行會員 '+run,status:'active'});
  await H.trackedInsert(api,'ticket_types',{id:profile.tt,name:'ICA驗收私教 '+run,category:'私人教練'});
  const all={};
  for(const spec of specs){const tid=id(spec.key),mid=profile[spec.group==='cc'?'ccMember':'member'];const t=makeTicket(tid,mid,profile.tt,'ICA '+spec.name+' '+run,today());all[spec.key]=t;profile.tickets[spec.key]=tid;profile.contracts[spec.key]=id('CT'+spec.key);
   await H.trackedInsert(api,'member_tickets',t);
   await H.trackedInsert(api,'ticket_logs',{id:id('GR'+spec.key),ticket_id:tid,action:'grant',delta:12,operator:profile.desk,note:'驗收前置：既有票券，非正式銷售'});
   await H.trackedInsert(api,'purchases',{id:id('FIRST'+spec.key),member_id:mid,ticket_id:tid,plan_name:t.plan_name,deal_amount:4000,payment_method:'cash',installment_count:3,source:'backoffice',operator:profile.desk,note:'驗收前置：第1期已付'});
   await H.trackedInsert(api,'contracts',{id:profile.contracts[spec.key],member_id:mid,member_name:'ICA測試會員',plan_name:t.plan_name,sessions:12,amount:12000,ticket_id:tid,sign_type:spec.sign,signed_at:new Date().toISOString(),body_snapshot:'測試專用：僅驗證後續分期收費，不是正式合約。',fill_snapshot:'<div>測試方案：12 堂、分 3 期，每期 4 堂／$4,000。</div>'});
  }
  if(!(await rows(api,'ticket_types?id=eq.tt-discount-pt300&select=id')).length)await H.trackedInsert(api,'ticket_types',{id:'tt-discount-pt300',name:'ICA測試折抵券',category:'私人教練'});
  await H.trackedInsert(api,'member_tickets',{id:id('VOUCHER'),member_id:profile.ccMember,ticket_type_id:'tt-discount-pt300',plan_name:'ICA並行折抵券',sessions_total:1,sessions_remaining:1,status:'usable',payment_status:'paid',start_date:today(),expire_date:'2027-12-31',activated_at:new Date().toISOString()});
  await H.trackedInsert(api,'ticket_logs',{id:id('GRVOUCHER'),ticket_id:id('VOUCHER'),action:'grant',delta:1,operator:profile.desk,note:'驗收前置：折抵券'});
  const jwt=sessions.desk.access_token;
  const pair=async(key,a,b,sameReceipt=false,vouchers=0)=>{
   H.guard();const tag='ICA-'+key+'-'+run,ra='ICA-'+key+'A-'+run,rb=sameReceipt?ra:'ICA-'+key+'B-'+run,ta=terms(all[a],4,vouchers?3700:4000,'cash',vouchers),tb=terms(all[b],4,vouchers?3700:4000,'cash',vouchers);
   const call=(role,t,receipt,term)=>api.rpcRaw('zz_ica_collect',{p_role:role,p_case:tag,p_ticket:t.id,p_receipt:receipt,p_terms:term,p_invoice:{mode:'none'}},jwt);
   const pa=call('holder',all[a],ra,ta);await sleep(150);const pb=call('waiter',all[b],rb,tb);const [ar,br]=await Promise.all([pa,pb]);
   const rel=verifyBlockedBy(ar.json,br.json,'ica:'+tag+':waiter');evidence.cases[key]={holder:rawHttp(ar),waiter:rawHttp(br),proof:rel};
   ok(key+' both HTTP 200',ar.status===200&&br.status===200);ok(key+' exact lock overlap',rel.verified,rel);
   ok(key+' holder collected',ar.json?.result?.ok===true);
   ok(key+' waiter result',sameReceipt?br.json?.result?.already===true:br.json?.result?.error_code===(vouchers?'VOUCHER.BALANCE_CHANGED':'INSTALLMENT.PLAN_CHANGED'),br.json?.result);
   const pr=await rows(api,'purchases?source=eq.installment&ticket_id='+inList([all[a].id,all[b].id])+'&select=id,deal_amount');ok(key+' exactly one new purchase',pr.length===1);
   if(failures)throw Error('Concurrency checks failed; no UI acceptance allowed');
  };
  await pair('CC1','CC1','CC1',true);await pair('CC2','CC2','CC2',false);await pair('CC3','CC3A','CC3B',false,1);
  const voucher=await rows(api,'member_tickets?id=eq.'+id('VOUCHER')+'&select=sessions_remaining');ok('shared voucher deducted exactly once',voucher[0]?.sessions_remaining===0);
  for(const role of ['coach','member']){const r=await api.rpcRaw('fn_installment_collect_v2',{p_ticket_id:all.REMOTE.id,p_receipt_id:'ICA-NOTDESK-'+run,p_terms:terms(all.REMOTE),p_paper_ack:false,p_invoice:{mode:'none'}},sessions[role].access_token);ok(role+' cannot collect',r.status===200&&r.json?.error_code==='AUTH.NOT_DESK');}
  const anon=await api.probe('fn_installment_collect_v2',{p_ticket_id:all.REMOTE.id,p_receipt_id:'ICA-ANON-'+run,p_terms:terms(all.REMOTE),p_paper_ack:false,p_invoice:{mode:'none'}});ok('anonymous cannot collect',[401,403].includes(anon.status));
  const oldWrite=await api.rest('PATCH','member_tickets?id=eq.'+all.REMOTE.id,{unlocked_sessions:8});ok('old direct unlock rejected',oldWrite.status===400&&String(oldWrite.json?.message||'').includes('INSTALLMENT.COLLECTION_REQUIRED'));
  await discover(cleanApi,H,before);atomicWrite(path.join(work,'concurrency_report.json'),JSON.stringify(evidence,null,2),0o600);
  atomicWrite(path.join(work,'profiles.json'),JSON.stringify(profile,null,2),0o600);atomicWrite(path.join(work,'sessions.json'),JSON.stringify(sessions),0o600);
  console.log('夾具與並行驗證已就緒；先不要按 Enter。回覆「完成」，主代理會操作瀏覽器。');
  let entered=false;const on=x=>{if(String(x).includes('\n'))entered=true;};process.stdin.on('data',on);process.stdin.resume();const end=Date.now()+minutes*60000;
  try{while(!H.stopping&&!entered&&Date.now()<end){const f=path.join(work,'ui_done.json');if(fs.existsSync(f)){ui=JSON.parse(fs.readFileSync(f));break;}await sleep(500);}}finally{process.stdin.off('data',on);process.stdin.pause();}
 }catch(e){error=String(e.message||e);failures++;console.log('停止：'+error);}
 finally{
  let rep,diff;try{rep=await cleanup(cleanApi,H,before);}catch(e){rep={failures:[e.message]};}
  try{fs.unlinkSync(path.join(work,'sessions.json'));}catch(e){if(e.code!=='ENOENT')rep.failures.push('session deletion '+e.message);}
  try{diff=H.diffSnap(before,await H.snapshot(cleanApi));}catch(e){rep.failures.push('snapshot '+e.message);}
  const clean=!rep.failures.length&&!H.unresolved().length&&diff&&!diff.tablesChanged.length&&!diff.authUsersChanged;
  if(clean){H.MF.finished=true;const e=H.trySave();if(e)H.persistFail(e);}
  const uiOk=!!(ui?.complete&&ui?.logoutConfirmed&&ui?.desktop&&ui?.mobile&&ui?.signature&&ui?.paper&&ui?.invoiceChecks);
  const report={status:classify({failures,clean,ui:uiOk,persist:H.canClaimComplete()}),error,evidence,ui,cleanup:rep,diff,pending:H.unresolved()};
  const saved=H.saveReport(path.join(work,'acceptance_report.json'),report);console.log('整體判定：'+(saved.ok?report.status:'REPORT_NOT_SAVED'));process.exitCode=saved.ok&&report.status==='ICA_ACCEPT_COMPLETE'?0:1;
 }
}
module.exports={derived,cleanupApi,problems,classify,readRetry,archiveRecovered};if(require.main===module)main().catch(e=>{console.error('停止：'+e.message);process.exitCode=1});
