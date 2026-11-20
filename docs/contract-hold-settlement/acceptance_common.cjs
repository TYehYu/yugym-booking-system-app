'use strict';
const base=require('../testdb/hold-settle/run_hold_settle_concurrency.js');
const {verifyBlockedBy}=require('../testdb/renewal/harness.js');
const PINS={...base.PINS,settle_md5:'990f6dd850e5beb6a1e2360a2075174d'};
function checkFingerprint(fp){return Object.keys(PINS).filter(k=>!fp||fp[k]!==PINS[k]).map(k=>k+' 不符').concat(['quota_trigger','desk_deduct','desk_cancel','refund_fn'].filter(k=>!fp||fp[k]!==true).map(k=>k+' 缺少'));}
async function concurrentChecks({api,jwt,seeded,check,write}){
 const proofs={};const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const call=(role,kind,args)=>api.rpcRaw('zz_hs_call',{p_role:role,p_kind:kind,p_args:args,p_expect_waiters:role==='holder'?1:0,p_poll_ms:2500,p_extra_hold_ms:0},jwt);
 const preview=async s=>{const r=await call('plain','settle',{ticket:s.main,dry:true});check('並行預覽 HTTP 200',r.status===200);return r.json&&r.json.result&&r.json.result.plan;};
 for(const key of ['C0','C3']){
  const s=seeded[key],plan=await preview(s);check(key+' 預覽為 6 轉正、6 保留、2 取消',!!plan&&plan.bind.length===6&&plan.hold.length===6&&plan.cancel.length===2);
  if(!plan)throw Error('並行預覽失敗');
  const ph=key==='C0'?call('holder','settle',{ticket:s.main,dry:false,expect:plan}):call('holder','lockcontract',{contract:s.contract});
  await delay(200);const pw=call('waiter','settle',{ticket:s.main,dry:false,expect:plan});
  const [h,w]=await Promise.all([ph,pw]);
  const proof=key==='C0'?base.verifyAdvisory(h.json,w.json,'cc:hs:waiter:settle:'+s.main):verifyBlockedBy(h.json,w.json,'cc:hs:waiter:settle:'+s.main);
  proofs[key]={holder:h,waiter:w,proof};check(key+' 兩個請求 HTTP 200',h.status===200&&w.status===200);
  check(key+' 真重疊且等待的是持鎖者的鎖',proof.verified);
  check(key+' 回傳結果正確',key==='C0'?h.json?.result?.ok===true&&w.json?.result?.already===true:w.json?.result?.error_code==='PLAN_CHANGED');
  const [br,lr,tr]=await Promise.all([api.rest('GET','bookings?select=id,status,ticket_id,pending_contract,contract_id&id=in.('+s.bookings.join(',')+')'),api.rest('GET','ticket_logs?select=ticket_id,booking_id,action,delta&ticket_id=eq.'+s.main),api.rest('GET','member_tickets?select=id,sessions_total,sessions_remaining&id=eq.'+s.main)]);
  check(key+' 核對讀取全部成功',[br,lr,tr].every(x=>x.status===200&&Array.isArray(x.json)));
  const bad=base.invariants(br.json||[],lr.json||[],tr.json||[]);check(key+' 無重扣、漏扣或不明綁票',bad.length===0);
  const rows=br.json||[],logs=lr.json||[];check(key+' 全部預約及票券可核對',rows.length===14&&tr.json?.length===1&&rows.every(b=>b.contract_id===s.contract));
  check(key+' 最終堂數正確',key==='C0'?tr.json?.[0]?.sessions_remaining===6&&rows.filter(b=>b.ticket_id).length===6&&rows.filter(b=>b.status==='cancelled').length===2&&rows.filter(b=>b.status==='booked'&&!b.ticket_id).length===6&&logs.filter(l=>l.action==='deduct').length===6:tr.json?.[0]?.sessions_remaining===12&&rows.length===14&&rows.every(b=>b.status==='booked'&&!b.ticket_id)&&logs.length===0);
 }
 write(proofs);return proofs;
}
module.exports={PINS,checkFingerprint,concurrentChecks};
