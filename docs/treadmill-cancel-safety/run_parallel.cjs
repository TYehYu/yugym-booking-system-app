#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {askHidden}=require('../testdb/hold-settle/hs_common.js');
const {checkServiceKey}=require('../testdb/renewal/harness.js');
const REF='kucvxpjatptfckhlxptj',URL='https://'+REF+'.supabase.co';
async function main(){
 if(!process.stdin.isTTY)throw Error('請用真正的終端機隱藏輸入金鑰');
 const key=await askHidden('測試庫 service_role 金鑰（隱藏輸入）> ');const bad=checkServiceKey(key,REF);if(bad)throw Error(bad);
 const proof=[],checks=[];
 async function rpc(p_case,p_role){
  const response=await fetch(URL+'/rest/v1/rpc/zz_tc_parallel',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_case,p_role}),signal:AbortSignal.timeout(45000)});
  const raw=await response.text();let json;try{json=JSON.parse(raw);}catch{json={invalid_json:true};}
  return {status:response.status,json};
 }
 for(const scenario of ['cancel','insert']){
  const h=rpc(scenario,'holder');await new Promise(r=>setTimeout(r,300));const w=rpc(scenario,'waiter');
  const [holder,waiter]=await Promise.all([h,w]);const a=holder.json,b=waiter.json;
  proof.push({scenario,holder,waiter});
  const ok=holder.status===200&&waiter.status===200&&a.pid!==b.pid&&a.waiter_pid===b.pid&&a.same_txid_wait_seen===true&&Date.parse(b.completed_at)>=Date.parse(a.completed_at)&&a.result?.ok===true&&b.balance===2&&b.refunds===1&&b.active_old_rows===0&&(scenario==='cancel'?b.result?.already===true:b.result?.error_code==='BOOKING.MAIN_CANCELLED');
  checks.push({scenario,ok});console.log(scenario+'：'+(ok?'通過':'未通過'));
 }
 const overall=checks.every(x=>x.ok)?'TC_PARALLEL_COMPLETE':'FAILED';
 const target=path.resolve(process.argv[2]||'/private/tmp/yugym-treadmill-parallel-report.json');
 // Report contains only fixture ids, status and lock evidence. Never write the key.
 const temp=target+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify({overall,checks,proof},null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,target);
 console.log('整體判定：'+overall+'；報告：'+target);process.exitCode=overall==='TC_PARALLEL_COMPLETE'?0:1;
}
main().catch(e=>{console.error('驗收停止：'+e.message);process.exitCode=1;});
