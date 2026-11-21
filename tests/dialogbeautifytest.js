const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function grab(n){const m=src.match(new RegExp('^(?:async )?function '+n+'\\(','m'));return src.slice(m.index,src.indexOf('\n}',m.index)+2);}
async function run(mid,category){
 const el={'bk-type':{value:''},'bk-coach':{value:''},'bk-mem-pre':{value:''},'bk-s2btn':{textContent:''}};
 const env={document:{getElementById:id=>el[id]||null},window:{_bkTypes:[{id:'T',category}]},
  renderBkTypeCards(){},async onBkTypeChange(){el['bk-s2btn'].textContent='建立預約';},bkTypeTimeWarn(){},bkCoachChange(){},
  bkMemberOptsHTML(){return '';},bkRestoreRecur(){},recurTkInfoRefresh(){},recurContractChoices(){},bkIsGroup:t=>t.category==='小班肌力'};
 const restore=new Function(...Object.keys(env),grab('bkS2BtnSync')+'\n'+grab('bkRestoreStep1b')+'\nreturn bkRestoreStep1b;')(...Object.values(env));
 await restore({type_id:'T',member_id:mid,coach_id:'C'});return el;
}
(async()=>{
 let x=await run('M','私人教練');assert.equal(x['bk-s2btn'].textContent,'下一步 →');assert.equal(x['bk-mem-pre'].value,'M');assert.equal(x['bk-coach'].value,'C');
 x=await run('','私人教練');assert.equal(x['bk-s2btn'].textContent,'建立預約');
 x=await run('','體驗');assert.equal(x['bk-s2btn'].textContent,'下一步 →');
 x=await run('','小班肌力');assert.equal(x['bk-s2btn'].textContent,'下一步 →');
 console.log('6 passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
