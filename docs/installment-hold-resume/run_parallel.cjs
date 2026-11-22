#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {askHidden}=require('../testdb/hold-settle/hs_common.js');
const {checkServiceKey}=require('../testdb/renewal/harness.js');
const REF='kucvxpjatptfckhlxptj',URL='https://'+REF+'.supabase.co';
async function main(){
 if(!process.stdin.isTTY)throw Error('請在真正的終端機執行');
 const key=await askHidden('測試庫 service_role 金鑰（隱藏輸入）> '),bad=checkServiceKey(key,REF);if(bad)throw Error(bad);
 async function call(p_case,p_role,p_plan=null){
  const r=await fetch(URL+'/rest/v1/rpc/zz_ir_call',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_case,p_role,p_plan}),signal:AbortSignal.timeout(45000)});
  const raw=await r.text();let json;try{json=JSON.parse(raw);}catch{json={invalid_json:true};}return {status:r.status,json};
 }
 const results=[];
 for(const scenario of ['SAME','LAST']){
  const ph=await call(scenario,'preview_holder'),pw=await call(scenario,'preview_waiter');
  if(ph.status!==200||pw.status!==200||ph.json.ok!==true||pw.json.ok!==true)throw Error('預覽前置檢查失敗；請回報 Codex 核對測試環境');
  const hp=call(scenario,'holder',ph.json.plan);await new Promise(r=>setTimeout(r,300));const wp=call(scenario,'waiter',pw.json.plan);
  const [holder,waiter]=await Promise.all([hp,wp]),h=holder.json,w=waiter.json;
  const ok=holder.status===200&&waiter.status===200&&h.pid!==w.pid&&h.waiter_pid===w.pid&&h.same_holder_lock_seen===true&&['advisory','transactionid'].includes(h.lock_type)&&Date.parse(w.completed_at)>=Date.parse(h.completed_at)&&h.result?.ok===true&&(scenario==='SAME'?w.result?.already===true:w.result?.error_code==='PLAN_CHANGED')&&w.remaining===(scenario==='SAME'?8:4)&&w.new_debits===1&&w.other_pending===true;
  results.push({scenario,ok,preview_holder:ph,preview_waiter:pw,holder,waiter});console.log(scenario+'：'+(ok?'通過':'未通過'));
 }
 const overall=results.every(x=>x.ok)?'IR_PARALLEL_COMPLETE':'FAILED',target=path.resolve(process.argv[2]||'/private/tmp/yugym-installment-resume-parallel-report.json'),tmp=target+'.tmp';
 const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify({overall,results},null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,target);
 console.log('整體判定：'+overall+'；報告：'+target);process.exitCode=overall==='IR_PARALLEL_COMPLETE'?0:1;
}
main().catch(e=>{console.error('驗收停止：'+e.message);process.exitCode=1;});
