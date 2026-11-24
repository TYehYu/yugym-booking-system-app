'use strict';
/* 員工管理「薪資條件」快速設定：真的跑 payRulesApplyNow／歷史保護，只 mock 資料存取與 DOM */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fn(name){const i=src.indexOf('function '+name+'(');assert(i>=0,name);let d=0,j=src.indexOf('{',i),k=j;for(;;k++){if(src[k]=='{')d++;if(src[k]=='}'&&--d==0)break;}return src.slice(src.lastIndexOf('async ',i)===i-6?i-6:i,k+1);}
function cst(name){const i=src.indexOf('const '+name+'=');assert(i>=0,name);const e=src.indexOf('];',i)+2;return src.slice(i,e);}
const names=['payRulesMap','empRuleAt','empAtMonth','payRuleSnapshot','payRulesApplyNow','payRulesPreserveHistory','payRulesGapMonths','staffHubCondRead','staffHubCondDiff','staffHubCondPreview','staffHubSalaryCond','staffHubSalaryCondSave','staffHubAttr','normEmp'];
const code=cst('PAY_RULE_KEYS')+'\n'+names.map(n=>{const i=src.indexOf('async function '+n+'(');return i>=0?fn(n).replace(/^/,''):fn(n);}).join('\n');
// SHC_LABEL 用原始碼那份
const label=src.slice(src.indexOf('const SHC_LABEL='),src.indexOf('\n',src.indexOf('const SHC_LABEL=')));
const els={};const mk=(id,val,checked)=>els[id]={value:val,checked:!!checked,style:{},innerHTML:''};
let db={},puts=[],toasts=[],modal='';
const c={TODAY:'2026-11-24',SESSION:{role:'admin'},ymd:x=>x,stMonthCur:()=>'2026-11',stCurYm:()=>'2026-11',
 document:{getElementById:id=>els[id]||null},console:{error:()=>{}},showToast:m=>toasts.push(m),showModal:h=>{modal=h},closeModal:()=>{},
 renderStaffHub:()=>{},openHrSalary:()=>{},loadSalaryTemplates:async()=>{},escH:s=>String(s),
 HR_ET_LIST:[['full_time','正職'],['part_time','兼職'],['contractor','合作'],['intern','支援']],window:{},
 dbGet:async(t,id)=>JSON.parse(JSON.stringify(db[id]||null)),dbPut:async(t,r)=>{puts.push(r);db[r.id]=JSON.parse(JSON.stringify(r));},
 empPayConfig:e=>({employment_type:e.employment_type,base_salary:Number(e.base_salary)||0,pt_mode:e.pt_mode||'flat',pt_rate:Number(e.pt_rate)||0,group_per_head:Number(e.group_rate)||0,duty_hourly:Number(e.duty_hourly)||0,need_duty:e.need_duty!==false})};
vm.createContext(c);vm.runInContext(label+'\n'+code+'\nthis.F={staffHubSalaryCond,staffHubSalaryCondSave,payRulesGapMonths};',c);
const full={id:'E1',name:'甲',employment_type:'full_time',base_salary:29500,pt_mode:'flat',pt_rate:600,group_rate:200,duty_hourly:0,need_duty:false,hire_date:'2026-01-01',pay_rules:null};
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
(async()=>{
 db.E1=JSON.parse(JSON.stringify(full));
 await c.F.staffHubSalaryCond('E1');
 test('缺 07–10 月快照→偵測出缺口並要求確認',()=>{assert.equal(c.F.payRulesGapMonths(db.E1,'2026-11').join(),'2026-07,2026-08,2026-09,2026-10');assert(modal.includes('shc-gapok'));});
 mk('shc-base','31000');mk('shc-needduty','',false);mk('shc-dutyrate','0');mk('shc-ptrate','600');mk('shc-group','200');mk('shc-gapok','',false);
 await c.F.staffHubSalaryCondSave('E1');
 test('沒勾確認→零寫入',()=>{assert.equal(puts.length,0);assert(toasts.some(t=>t.includes('確認')));});
 els['shc-gapok'].checked=true;
 await c.F.staffHubSalaryCondSave('E1');
 test('勾確認→補 07–10 月為「變更前」的值、當月起為新值',()=>{
   assert.equal(puts.length,1);const r=puts[0];
   ['2026-07','2026-08','2026-09','2026-10'].forEach(m=>assert.equal(r.pay_rules[m].base_salary,29500,m));
   assert.equal(r.pay_rules['2026-11'].base_salary,31000);assert.equal(r.base_salary,31000);});
 test('未改的欄位不變',()=>{const r=puts[0];assert.equal(r.pt_rate,600);assert.equal(r.group_rate,200);assert.equal(r.pay_rules['2026-11'].group_rate,200);});
 // 第二次：歷史已完整，不需確認
 puts=[];toasts=[];els['shc-base'].value='32000';els['shc-gapok'].checked=false;
 await c.F.staffHubSalaryCond('E1');els['shc-base'].value='32000';
 await c.F.staffHubSalaryCondSave('E1');
 test('歷史完整後直接儲存，且 07–10 月仍是舊值',()=>{assert.equal(puts.length,1);const r=puts[0];assert.equal(r.pay_rules['2026-10'].base_salary,29500);assert.equal(r.pay_rules['2026-11'].base_salary,32000);});
 // 沒改任何東西
 puts=[];toasts=[];await c.F.staffHubSalaryCond('E1');mk('shc-base','32000');
 await c.F.staffHubSalaryCondSave('E1');
 test('沒變更→不寫入',()=>{assert.equal(puts.length,0);assert(toasts.includes('沒有變更'));});
 // 驗證
 toasts=[];for(const bad of ['-5','abc','99999999']){els['shc-base'].value=bad;await c.F.staffHubSalaryCondSave('E1');}
 test('負數／非數字／過大 → 拒絕',()=>{assert.equal(puts.length,0);assert(toasts.length===3);});
 // 階梯計酬不被改
 db.E2=Object.assign(JSON.parse(JSON.stringify(full)),{id:'E2',pt_mode:'tier',pt_rate:0,pt_tiers:[{from:1,to:10,rate:500}],pay_rules:{'2026-07':{employment_type:'full_time',base_salary:29500,pt_mode:'tier',pt_rate:0,group_rate:200,duty_hourly:0}}});
 await c.F.staffHubSalaryCond('E2');
 test('階梯計酬：不畫單價欄、引導到完整設定',()=>assert(modal.includes('階梯計酬')&&!modal.includes('shc-ptrate')));
 console.log(n+' passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
