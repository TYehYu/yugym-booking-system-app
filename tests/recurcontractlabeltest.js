const fs=require('fs'),path=require('path'),assert=require('assert');
const s=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=s.indexOf('function recurContractLabel('),end=s.indexOf('\n}',start)+2;
const label=new Function(s.slice(start,end)+';return recurContractLabel;')();
assert.equal(label({contract_id:'INTERNAL-123',payload:{total:12,plan:{name:'友善教練課 1V2',valid_days:365}}}),'友善教練課 1V2 · 12 堂 · 365 天');
assert.equal(label({contract_id:'INTERNAL-123'}),'未付款方案');
assert.equal(label({payload:{total:'12',plan:{name:'教練課',valid_days:'30'}}}),'教練課 · 12 堂 · 30 天');
assert.equal(label({payload:{total:0,plan:{name:'教練課',valid_days:'三十'}}}),'教練課');
const choices=s.slice(s.indexOf('async function recurContractChoices('),s.indexOf('\n}',s.indexOf('async function recurContractChoices('))+2);
assert(choices.includes("escH(r.contract_id)+'\">'+escH(recurContractLabel(r))"));
(async()=>{
 const first=s.indexOf('async function recurContractChoices('),last=s.indexOf('\n}',first)+2;
 const esc=s.match(/^function escH[^\n]+/m)[0];
 const el={value:'C2',dataset:{memberCourse:JSON.stringify(['M','TY'])}},field={hidden:true};
 const rows=[
  {contract_id:'C1',member_id:'M',status:'pending',payload:{total:12,plan:{ticket_type_id:'TY',name:'同名方案',valid_days:365}}},
  {contract_id:'C2',member_id:'M',status:'pending',payload:{total:12,plan:{ticket_type_id:'TY',name:'同名方案',valid_days:365}}},
  {contract_id:'C3',member_id:'M',status:'pending',payload:{plan:{ticket_type_id:'TY',name:'<script>alert(1)</script>'}}},
  {contract_id:'OTHER',member_id:'OTHER',status:'pending',payload:{plan:{ticket_type_id:'TY',name:'別人的方案'}}}
 ];
 const env={document:{getElementById:id=>id==='bk-hold-contract'?el:field},recurTkInputs:()=>({mid:'M',type:'TY',cid:'C2'}),dbGetAll:async()=>rows,recurTkInfoRefresh:()=>{throw Error('selection changed unexpectedly');},console};
 const choicesFn=new Function(...Object.keys(env),esc+'\n'+s.slice(start,end)+'\n'+s.slice(first,last)+';return recurContractChoices;')(...Object.values(env));
 await choicesFn();
 assert(el.innerHTML.includes('<option value="C1">同名方案 · 12 堂 · 365 天</option>'));
 assert(el.innerHTML.includes('<option value="C2">同名方案 · 12 堂 · 365 天</option>'));
 assert.equal(el.value,'C2');
 assert(!el.innerHTML.includes('<script>'));
 assert(el.innerHTML.includes('&lt;script>'));
 assert(!el.innerHTML.includes('別人的方案'));
 assert.equal(field.hidden,false);
 console.log('12 passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
