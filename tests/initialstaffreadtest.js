const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const start=s.indexOf('  const initialStaffId=');
const defs=s.slice(start,s.indexOf('  // 預載自己的資料',start));
const a=s.indexOf('  (async()=>{ try{',start),ae=s.indexOf('})();',a)+5;
const b=s.indexOf('  (async()=>{\n    const item=',ae),be=s.indexOf('})();',b)+5;
const source='function run(){'+defs+s.slice(a,ae)+s.slice(b,be)+'}';
let count=0;async function test(role,fail=false){let reads=[],item={style:{}},ctx={SESSION:{role,id:'first'},window:{},document:{getElementById:id=>id==='acct-punchfix'?item:null},renderGreetBar(){},dbGet:async(t,id)=>{reads.push([t,id]);if(fail)throw Error('offline');return {need_punch:true}}};vm.createContext(ctx);vm.runInContext(source,ctx);ctx.run();await new Promise(r=>setImmediate(r));assert.equal(reads.length,1);count++;assert.equal(reads[0][0],role==='member'?'members':'coaches');count++;assert.equal(item.style.display,role==='member'||fail?'none':'');count++;ctx.SESSION.id='second';ctx.run();await new Promise(r=>setImmediate(r));assert.equal(reads.length,2);count++;assert.equal(reads[1][1],'second');count++;}
(async()=>{await test('coach');await test('front_desk');await test('member');await test('coach',true);console.log(count+' behavior assertions passed');})().catch(e=>{console.error(e);process.exitCode=1});
