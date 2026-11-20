const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const {PINS,checkFingerprint}=require('./acceptance_common.cjs');const {FIXTURES,sameCounts,kinds}=require('./run_acceptance.cjs');
let passed=0;const test=(name,f)=>{f();passed++;};
const fp={...PINS,quota_trigger:true,desk_deduct:true,desk_cancel:true,refund_fn:true};
test('pins valid',()=>assert.deepEqual(checkFingerprint(fp),[]));
for(const k of Object.keys(fp))test('missing '+k,()=>{const b={...fp};delete b[k];assert(checkFingerprint(b).length)});
test('old function refused',()=>assert(checkFingerprint({...fp,settle_md5:'550c28a816b6e46f636287d7fa33405a'}).length));
test('all fixtures 12 total 6 open',()=>assert(FIXTURES.length===4&&FIXTURES.every(f=>f.holds===14&&f.tickets[0].n===12&&f.tickets[0].inst===6&&sameCounts(f.expect,{bind:6,hold:6,cancel:2,skip:0,defer:0}))));
test('missing 2 cancels rejected',()=>assert(!sameCounts({bind:6,hold:6,cancel:0},FIXTURES[0].expect)));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ch-harness-test-'));
try{
 for(const [name,env,args] of [['missing env',null,[]],['production refused','SB_URL=https://rlpiomzplckzqnqrvrwc.supabase.co\nANON_KEY=fake',true],['missing anon','SB_URL=https://kucvxpjatptfckhlxptj.supabase.co',true],['nonterminal refused','SB_URL=https://kucvxpjatptfckhlxptj.supabase.co\nANON_KEY=fake',true]]){
  test(name,()=>{const file=path.join(dir,'test.env');if(env)fs.writeFileSync(file,env);const r=cp.spawnSync(process.execPath,[path.join(__dirname,'run_acceptance.cjs'),'--work',path.join(dir,name),...(args===true?['--env',file]:[])],{encoding:'utf8',timeout:5000});assert(r.status!==0);assert(!fs.existsSync(path.join(dir,name,'sessions.json')));});
 }
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log(passed+' passed');
(async()=>{
 const {cleanupSpec}=require('./run_acceptance.cjs');const {createHarness}=require('../testdb/renewal/harness.js');
 const wd=fs.mkdtempSync(path.join(os.tmpdir(),'ch-cleanup-test-'));const H=createHarness({work:wd});H.newManifest('cleanup');
 const id='CC-EMP-HS-D-SELFTEST',employees=[],logs=[{row_id:'UNRELATED',op:'I'}];
 const api={rest:async(method,q,body)=>{
  const table=q.split('?')[0];const match=row=>q.includes('in.')?q.includes('"'+row[table==='employees'?'id':'row_id']+'"'):q.includes(row.id);
  if(table==='employees'&&method==='POST'){employees.push(body);logs.push({row_id:body.id,op:'I'});return {status:201};}
  if(table==='employees'&&method==='DELETE'){for(let i=employees.length-1;i>=0;i--)if(match(employees[i])){logs.push({row_id:employees[i].id,op:'D'});employees.splice(i,1);}return {status:204};}
  if(table==='change_log'&&method==='DELETE'){for(let i=logs.length-1;i>=0;i--)if(match(logs[i]))logs.splice(i,1);return {status:204};}
  return {status:200,json:(table==='employees'?employees:logs).filter(match)};
 }};
 try{await H.trackedInsert(api,'employees',{id});const r=await H.cleanup(api,cleanupSpec(H));assert.deepEqual(r.failures,[]);assert.equal(employees.length,0);assert.deepEqual(logs,[{row_id:'UNRELATED',op:'I'}]);console.log('3 cleanup checks passed（含刪除時新增的日誌、不刪無關日誌）');}finally{fs.rmSync(wd,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
