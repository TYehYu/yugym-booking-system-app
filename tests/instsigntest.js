/* Updated for receipt-bound installment confirmations. The former copied gate allowed
   missing contracts and unsigned legacy tablet flows; those behaviors are intentionally removed. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fn=name=>{const a=src.search(new RegExp('(?:async )?function '+name+'\\('));assert(a>=0,name);return src.slice(a,src.indexOf('\n}',a)+2)};
let n=0;const ok=(name,value)=>{assert(value,name);n++};
const terms={period_from:2,period_to:3,amount:8000,sessions:8};
const contract={id:'C',member_id:'M',sign_type:'remote',signed_at:'first',installment_signs:[{n:2,request_id:'1234-5678',signature:null,terms}]};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function make(){
 const host={innerHTML:'',remove(){}};let calls=[];
 const c={window:{_signInk:true},document:{getElementById:id=>id==='ct-sign'?{toDataURL:()=> 'data:image/png;base64,'+'A'.repeat(240)}:null,createElement:()=>host,body:{appendChild(){}}},
 SESSION:{id:'M'},CUR_PAGE:'tickets',dbGet:async()=>contract,instSignFind:(c,n)=>c.installment_signs.slice().reverse().find(x=>x.n===n),
 instSignsOf:c=>c.installment_signs||[],escH:esc,ctBodyHTML:()=>'',setTimeout(){},signPadInit(){},showToast(){},navTo(){},closeContractReader(){},closeModal(){},dbCacheClear(){},
 sb:{rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}}}},console};
 vm.createContext(c);for(const name of ['instTermsSummary','instHistoryHTML','memSignContract','memSignContractDo'])vm.runInContext(fn(name),c);
 return {c,host,calls};
}
(async()=>{
 let {c,host,calls}=make();await c.memSignContract('C',2);
 ok('member sees real fee',host.innerHTML.includes('8,000'));ok('member sees real sessions',host.innerHTML.includes('開通 8 堂'));ok('member sees covered periods',host.innerHTML.includes('第 2～3 期'));
 ok('submit binds displayed request id',host.innerHTML.includes("memSignContractDo('C',2,'1234-5678')"));
 await c.memSignContractDo('C',2,'1234-5678');ok('new member RPC used',calls[0].name==='fn_member_sign_installment_v2');ok('exact displayed request submitted',calls[0].args.p_request_id==='1234-5678');
 ({c,calls}=make());await c.memSignContractDo('C',2);ok('legacy requests use legacy RPC',calls[0].name==='fn_member_sign_installment');
 ({c,calls}=make());c.window._signInk=false;await c.memSignContractDo('C',2,'id');ok('empty signature not submitted',calls.length===0);
 ({c}=make());const html=c.instHistoryHTML({installment_signs:[{n:2,terms,sign_type:'paper',paper_ack:true,signature:null}]});ok('paper evidence honest',html.includes('簽名留在紙本'));ok('paper does not fabricate image',!html.includes('<img'));
 const changed=c.instHistoryHTML({installment_signs:[{n:2,terms,signature:null},{n:2,terms,signature:null}]});ok('superseded unsigned request clearly labeled',changed.includes('已改單，未簽署'));
 ok('history exported in printed contract',src.slice(src.indexOf('async function ctViewPrint('),src.indexOf('function openShiftQuickEdit(')).includes('instHistoryHTML(c)'));
 console.log(n+' signature assertions passed; no network');
})().catch(e=>{console.error(e);process.exitCode=1});
