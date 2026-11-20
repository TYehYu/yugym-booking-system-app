#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createHarness,checkServiceKey,verifyBlockedBy,rawHttp,inList}=require('../testdb/renewal/harness.js');
const {askHidden,makeApi,today,addDays}=require('../testdb/hold-settle/hs_common.js');
const {REF,BASE,readEnv,atomic,harden,fingerprintErrors,invariant}=require('./acceptance_common.cjs');
const args=process.argv.slice(2),opt=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
const work=path.resolve(opt('--work','/private/tmp/yugym-transfer-acceptance-20261120'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const spec=H=>[
 {table:'ticket_logs',col:'ticket_id',ids:()=>H.createdIds('member_tickets')},
 {table:'ticket_deduct_ops',col:'booking_id',ids:()=>H.createdIds('bookings'),optional:true},
 {table:'bookings',col:'id',ids:()=>H.createdIds('bookings')},
 {table:'booking_op_rev',col:'booking_id',ids:()=>H.createdIds('bookings'),optional:true},
 {table:'member_tickets',col:'id',ids:()=>H.createdIds('member_tickets')},
 {table:'members',col:'id',ids:()=>H.createdIds('members')},
 {table:'ticket_types',col:'id',ids:()=>H.createdIds('ticket_types')},
 {table:'employees',col:'id',ids:()=>H.createdIds('employees')},
 {table:'change_log',col:'row_id',ids:()=>H.createdIds('employees'),optional:true}
];
async function main(){
 const env=readEnv(opt('--env')),pins=JSON.parse(fs.readFileSync(path.join(__dirname,'ACCEPTANCE_PINS.json'),'utf8'));
 fs.mkdirSync(work,{recursive:true});const H=harden(createHarness({work,log:console.log}),work);
 process.on('SIGINT',()=>H.requestStop('SIGINT'));process.on('SIGTERM',()=>H.requestStop('SIGTERM'));
 const previous=H.loadUnfinished();
 const key=await askHidden('測試庫 service_role 金鑰（隱藏輸入）> ');const bad=checkServiceKey(key,REF);if(bad)throw Error(bad);
 const api=makeApi(key,env.ANON_KEY,{stopSignal:H.stopSignal}),clean=makeApi(key,env.ANON_KEY,{noStop:true});
 const sessions=path.join(work,'sessions.json'),wipe=()=>{fs.rmSync(sessions,{force:true});};
 if(previous){
  wipe();if(previous.corrupt)throw Error('追蹤檔損壞，停止，請勿手動刪除');
  const rr=await H.recover(clean,previous),cr=await H.cleanup(clean,spec(H));
  if(rr.persistError||cr.failures.length||H.unresolved().length||!H.canClaimComplete())throw Error('恢復未完成，保留追蹤檔');
  H.MF.finished=true;H.save();H.archiveManifest('recovered');console.log('恢復清除完成，請重新執行同一命令');return;
 }
 const runId=crypto.randomBytes(4).toString('hex'),id=s=>'CC-TLS-'+s+'-'+runId;
 H.newManifest(runId);let before,after,diff,pass=0,fail=0,cleanOK=false;const results=[],proofs={},fixtures={};
 const check=(name,ok,detail)=>{results.push({name,ok:!!ok,detail:ok?undefined:detail});if(ok){pass++;console.log('✓ '+name);}else{fail++;console.log('✗ '+name);}};
 const read=async f=>{const [br,lr,tr]=await Promise.all([api.rest('GET','bookings?select=*&id='+inList(f.bookings)),api.rest('GET','ticket_logs?select=*&ticket_id=eq.'+f.ticket),api.rest('GET','member_tickets?select=*&id=eq.'+f.ticket)]);if([br,lr,tr].some(r=>r.status!==200||!Array.isArray(r.json)))throw Error('資料核對讀取失敗');return {b:br.json,l:lr.json,t:tr.json[0]};};
 const finishCheck=async(name,f,remaining)=>{const z=await read(f);check(name+' 帳本與綁票一致',invariant(z.b,z.l,z.t).length===0,invariant(z.b,z.l,z.t));check(name+' 餘額正確',z.t.sessions_remaining===remaining);return z;};
 const authPatch=async(jwt,bid,body)=>{const r=await fetch(BASE+'/rest/v1/bookings?id=eq.'+encodeURIComponent(bid),{method:'PATCH',headers:{apikey:env.ANON_KEY,Authorization:'Bearer '+jwt,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const text=await r.text();let json;try{json=JSON.parse(text);}catch(_){}return {status:r.status,text,json};};
 try{
  const fp=await api.probe('zz_tls_fingerprint',{});const fb=fp.status===200?fingerprintErrors(fp.json,pins):['HTTP '+fp.status];
  check('前置：指紋、權限與提交保護符合',fb.length===0,fb);if(fb.length)throw Error('前置檢查失敗，尚未建立資料');
  const anonymous=await api.probe('zz_tls_call',{p_role:'plain',p_kind:'move_hold',p_from:'CC-TLS-X',p_to:'CC-TLS-Y',p_ticket:'CC-TLS-T',p_case:'CC-TLS-PROBE'});
  check('觀測函式拒絕匿名',anonymous.status===401||anonymous.status===403);if(!(anonymous.status===401||anonymous.status===403))throw Error('匿名權限不符');
  before=await H.snapshot(clean);atomic(path.join(work,'before.json'),JSON.stringify(before));
  const users={},tokens={};
  for(const role of ['desk','coach','member']){
   H.guard();const email='cc-tls-'+role+'-'+runId+'@cc-test.yugym.local',password=crypto.randomBytes(18).toString('base64url')+'aA1!';
   users[role]=await H.trackedCreateUser(api,role,email,password);
   if(role!=='member')await H.trackedInsert(api,'employees',{id:'CC-EMP-TLS-'+role+'-'+runId,auth_id:users[role].id,name:'測試'+role,role:role==='desk'?'front_desk':'coach',status:'active'});
   const r=await api.signIn(email,password);if(r.status!==200||!r.json?.access_token)throw Error('測試登入失敗');tokens[role]=r.json;
  }
  const tt=id('TT');await H.trackedInsert(api,'ticket_types',{id:tt,name:'測試私教',category:'私人教練'});
  const create=async k=>{
   H.guard();const member=id(k+'M'),ticket=id(k+'T'),from=id(k+'F'),to=id(k+'D'),other=id(k+'E');
   await H.trackedInsert(api,'members',{id:member,name:'測試'+k,status:'active'});
   await H.trackedInsert(api,'member_tickets',{id:ticket,member_id:member,ticket_type_id:tt,plan_name:'測試四堂票',status:'usable',payment_status:'paid',sessions_total:4,sessions_remaining:3,unlocked_sessions:4,activated_at:new Date().toISOString(),start_date:addDays(today(),-30),expire_date:addDays(today(),365),valid_days:365});
   const base={member_id:member,coach_id:'CC-EMP-TLS-coach-'+runId,ticket_type_id:tt,category:'私人教練',duration:60,status:'booked',start_time:'13:00'};
   const legacy=k==='LEGACY';
   await H.trackedInsert(api,'bookings',{...base,id:from,date:addDays(today(),14),ticket_id:legacy?null:ticket,pending_contract:legacy});
   await H.trackedInsert(api,'bookings',{...base,id:to,date:addDays(today(),1),ticket_id:legacy?ticket:null,pending_contract:!legacy});
   await H.trackedInsert(api,'bookings',{...base,id:other,date:addDays(today(),2),ticket_id:null,pending_contract:true});
   await H.trackedInsert(api,'ticket_logs',{id:id(k+'L'),ticket_id:ticket,booking_id:from,action:'deduct',delta:-1,note:'Synthetic original debit'});
   return fixtures[k]={member,ticket,from,to,other,bookings:[from,to,other]};
  };
  for(const k of ['R1','R2','R3','R4','OLD','LEGACY','DD','DC','MD','MC'])await create(k);
  for(const [k,hkind,wkind] of [['R1','move_hold','cancel_source'],['R2','move_hold','cancel_target'],['R3','move_hold','move_hold'],['R4','cancel_source','move_hold']]){
   H.guard();const f=fixtures[k],tag=id(k),call=(role,kind)=>api.rpcRaw('zz_tls_call',{p_role:role,p_kind:kind,p_from:f.from,p_to:role==='waiter'&&k==='R3'?f.other:f.to,p_ticket:f.ticket,p_case:tag},tokens.desk.access_token);
   const holder=call('holder',hkind);await delay(200);const waiter=call('waiter',wkind);const [h,w]=await Promise.all([holder,waiter]);
   const proof=verifyBlockedBy(h.json,w.json,'tls:waiter:'+tag);proofs[k]={holder:rawHttp(h),waiter:rawHttp(w),proof};
   check(k+' 真實並行 HTTP 200',h.status===200&&w.status===200);check(k+' 等待持鎖者同一 txid',proof.verified,proof);
   check(k+' 持鎖者操作成功',h.json?.result?.ok===true,h.json?.result);
   check(k+' 等候者結果正確',k==='R1'||k==='R2'?w.json?.result?.ok===true:w.json?.result?.ok===false,w.json?.result);
   await finishCheck(k,f,k==='R2'||k==='R4'?4:3);
  }
  const old=fixtures.OLD,beforeOld=await read(old);
  const rejected=await authPatch(tokens.desk.access_token,old.to,{ticket_id:old.ticket,pending_contract:false});
  check('舊頁面直寫由提交守門拒絕',rejected.status>=400&&rejected.status<500&&/TICKET.TRANSFER_LEDGER_MISMATCH/.test(rejected.text),rawHttp(rejected));
  const afterOld=await read(old);check('舊頁面失敗沒有留下半套',JSON.stringify(beforeOld)===JSON.stringify(afterOld));
  const legacy=fixtures.LEGACY,legacyBefore=await read(legacy);
  const refusal=await api.rpcRaw('fn_desk_cancel_booking',{p_booking_id:legacy.from,p_mode:'auto'},tokens.desk.access_token);
  check('歷史錯帳回明確拒絕，不誤報網路錯誤',refusal.status===200&&refusal.json?.ok===false&&refusal.json?.error_code==='TICKET.LEDGER_OWNERSHIP',rawHttp(refusal));
  check('歷史錯帳拒絕不會退堂或取消',JSON.stringify(legacyBefore)===JSON.stringify(await read(legacy)));
  const memberTry=await api.rpcRaw('fn_move_booking_ticket',{p_from_booking:fixtures.DD.from,p_to_booking:fixtures.DD.to,p_mode:'hold'},tokens.member.access_token);
  check('會員不能使用員工調課功能',memberTry.status===200&&memberTry.json?.error_code==='AUTH.FORBIDDEN',rawHttp(memberTry));
  if(fail)throw Error('真實 HTTP 驗收未全過，不放行畫面驗收');
  atomic(sessions,JSON.stringify(tokens));atomic(path.join(work,'browser_fixture_map.json'),JSON.stringify({runId,fixtures,ui:{DD:'桌機櫃檯',DC:'桌機教練',MD:'手機櫃檯',MC:'手機教練'}}));
  console.log('\n夾具就緒：真並行已通過，等待 Codex 做桌機／手機實際點擊。完成後在本終端機按 Enter 清除。');
  await Promise.race([new Promise(res=>{process.stdin.once('data',res);process.stdin.resume();}),new Promise((_,rej)=>H.stopSignal.addEventListener('abort',()=>rej(Error('STOPPED')),{once:true}))]);process.stdin.pause();
  for(const k of ['DD','DC','MD','MC']){const z=await finishCheck(k,fixtures[k],3);check(k+' 畫面確實完成調課',z.b.find(x=>x.id===fixtures[k].from)?.ticket_id===null&&z.b.find(x=>x.id===fixtures[k].to)?.ticket_id===fixtures[k].ticket);}
 }catch(e){fail++;console.error('流程停止：'+String(e.message||e));}
 finally{
  wipe();let cleanup={failures:['未清除']};try{cleanup=await H.cleanup(clean,spec(H));}catch(e){cleanup={failures:[String(e.message||e)]};}
  try{if(before){after=await H.snapshot(clean);diff=H.diffSnap(before,after);}}catch(e){cleanup.failures.push('核對失敗：'+String(e.message||e));}
  cleanOK=!!(before&&diff&&diff.tablesChanged.length===0&&!diff.authUsersChanged&&cleanup.failures.length===0&&H.unresolved().length===0&&H.canClaimComplete());
  check('資料與登入帳號清除後回到基準',cleanOK,{cleanup,pending:H.unresolved(),diff});
  if(cleanOK){H.MF.finished=true;H.MF.finishedAt=new Date().toISOString();const e=H.trySave();if(e){H.persistFail(e);cleanOK=false;}}
  let overall=fail?'FAILED':cleanOK?'TLS_ACCEPT_COMPLETE':'CLEANUP_INCOMPLETE';const report={overall,runId,pass,fail,results,proofs,cleanup,diff,pending:H.unresolved()};
  const saved=H.saveReport(path.join(work,'acceptance_report.json'),report);if(!saved.ok)overall='REPORT_NOT_SAVED';
  console.log('整體判定：'+overall+'；'+pass+' 通過／'+fail+' 失敗；報告'+(saved.ok?'已保存':'未保存'));process.exitCode=overall==='TLS_ACCEPT_COMPLETE'?0:1;
 }
}
if(require.main===module)main().catch(e=>{console.error(String(e.message||e));process.exitCode=2;});
module.exports={spec};
