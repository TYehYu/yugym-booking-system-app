import {provider} from './stage_provider.mjs';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const src=fs.readFileSync(new URL('../../../index.html',import.meta.url),'utf8');const start=src.indexOf('function invPayload(');const end=src.indexOf('\n}',start)+2;const ctx={};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
const api=await provider(process.argv[2]);const id='YGTEST'+Date.now()+crypto.randomBytes(3).toString('hex');const pur={id,deal_amount:100,plan_name:'測試驗收課程'};
const payload=ctx.invPayload(pur,{name:'測試資料',phone:'0900000000',email:'stage@example.invalid'},{mode:'carrier',email:'stage@example.invalid'},null);
const report={source_sha256:api.hash,endpoint:'https://einvoice-stage.ecpay.com.tw/B2CInvoice',relate:id,payload,checks:[]};const ok=(name,v)=>{report.checks.push({name,ok:!!v});assert(v,name)};
try{
 const first=await api.call('Issue',payload);report.first=first;ok('official sandbox issue accepted',first.ok&&/^[A-Z]{2}\d{8}$/.test(first.data?.InvoiceNo||''));
 const queried=await api.call('GetIssue',{RelateNumber:id});report.queried=queried;ok('query finds same invoice',queried.ok&&queried.data?.IIS_Number===first.data.InvoiceNo);ok('query matches amount and order',Number(queried.data?.IIS_Sales_Amount)===100&&queried.data?.IIS_Relate_Number===id);
 const again=await api.call('Issue',payload);report.duplicate=again;ok('same order cannot issue twice',again.ok===false);
 const last=await api.call('GetIssue',{RelateNumber:id});ok('same invoice after duplicate',last.ok&&last.data?.IIS_Number===first.data.InvoiceNo);
 const missing=await api.call('GetIssue',{RelateNumber:id+'X'});report.notfound=missing;ok('unknown order is distinguished',missing.ok===false);
 report.status='STAGE_PROVIDER_COMPLETE';
}catch(e){report.status='FAILED';report.error=e.message;process.exitCode=1;}
fs.writeFileSync(new URL('./stage_provider_report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks,error:report.error,providerMessage:report.first?.msg,providerCode:report.first?.code}));
