'use strict';
/* 2026-11-22：職務切換（stPickSet）、主管／督導旗標（stCardToggle）、排班設定（saveSchedule）的歷史薪資保護。
   實際執行三個入口（不是只比對原始碼）：改當月設定後，過去月份結果不變；當月與未來月份依生效時間計算；缺歷史依據時零寫入。
   ⚠ 範圍：只涵蓋「員工本人欄位」；全域薪資模板、全店主管獎金設定仍會回算歷史（見 docs/hr-perm/PAY_HISTORY_GAPS.md），這支測試不宣稱那些已固定。 */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const src=fs.readFileSync(process.env.INDEX_PATH||path.join(__dirname,'../index.html'),'utf8');
function grab(name){const rx=new RegExp('(?:async )?function '+name+'\\('),m=rx.exec(src);if(!m)throw Error(name);let a=m.index,d=0;for(let i=src.indexOf('{',a);i<src.length;i++){if(src[i]==='{')d++;else if(src[i]==='}'&&!--d)return src.slice(a,i+1);}throw Error(name);}
const a=src.indexOf('const PAY_RULE_KEYS='),constant=src.slice(a,src.indexOf('];',a)+2);
const mgrT=src.slice(src.indexOf('const _MGR_TITLES='),src.indexOf(';',src.indexOf('const _MGR_TITLES='))+1);
let saved=[],messages=[],current,inputs={};
const root={employment_type:'full_time',base_salary:29500,pt_mode:'tier',pt_rate:0,pt_tiers:[{min:0,rate:600}],group_rate:200,duty_hourly:0,need_duty:true,is_manager:false,is_supervisor:false,insured_grade:29500,labor_insurance_status:'enrolled',health_insurance_status:'enrolled',birthday_bonus_off:false};
const make=(over={})=>({id:'E',name:'假教練',role:'coach',employment_type:'full_time',base_salary:29500,need_duty:true,need_punch:true,can_teach:true,is_manager:false,is_supervisor:false,birthday_bonus_off:false,job_title:'',hire_date:'2026-07-01',pay_rules:{'2026-07':structuredClone(root)},...over});
const c={TODAY:'2026-11-18',ymd:x=>x,stCurYm:()=> '2026-11',document:{getElementById:id=>inputs[id]||null,querySelectorAll:()=>[]},
  showToast:s=>messages.push(String(s)),closeModal(){},stReload(){},navTo(){},stApplyEmpType:async()=>{},
  dbGet:async()=>structuredClone(current),dbPut:async(t,e)=>{saved.push({t,row:structuredClone(e)});return e;},
  ppEmpSwitchOn:(e,k)=>k==='manager'?!!e.is_manager:k==='supervisor'?!!e.is_supervisor:k==='teach'?e.can_teach!==false:false,console};
vm.createContext(c);
vm.runInContext(constant+'\n'+mgrT+'\n'+['payRulesMap','empRuleAt','empAtMonth','payRuleSnapshot','payRulesPreserveHistory','payRulesApplyNow','stSyncMgrTitle','stPickSet','stCardToggle','saveSchedule'].map(grab).join('\n'),c);
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
const at=(row,ym)=>c.empAtMonth(row,ym);
(async()=>{
 /* ① 主管旗標 */
 current=make();saved=[];messages=[];await c.stCardToggle('E','manager');
 test('主管旗標：開啟後只寫一次',()=>assert.equal(saved.length,1));
 let r=saved[0].row;
 test('主管旗標：七～十月仍不是主管（過去月份結果不變）',()=>{for(const m of ['07','08','09','10'])assert.equal(at(r,'2026-'+m).is_manager,false);});
 test('主管旗標：本月與未來月份是主管（依生效時間）',()=>{assert.equal(at(r,'2026-11').is_manager,true);assert.equal(at(r,'2026-12').is_manager,true);assert.equal(at(r,'2027-03').is_manager,true);});
 test('主管旗標：即時欄位也同步、職稱連動不受影響',()=>{assert.equal(r.is_manager,true);assert.equal(r.job_title,'主管');});
 /* 已排好的未來月份快照也要一起改 */
 current=make({pay_rules:{'2026-07':structuredClone(root),'2026-12':{...structuredClone(root),is_manager:false,need_duty:false}}});saved=[];await c.stCardToggle('E','manager');r=saved[0].row;
 test('主管旗標：已排程的 12 月快照一併改成新值，其他欄位不動',()=>{assert.equal(r.pay_rules['2026-12'].is_manager,true);assert.equal(r.pay_rules['2026-12'].need_duty,false);assert.equal(at(r,'2026-10').is_manager,false);});
 /* 督導旗標 */
 current=make();saved=[];await c.stCardToggle('E','supervisor');r=saved[0].row;
 test('督導旗標：過去不變、本月起是督導',()=>{assert.equal(at(r,'2026-10').is_supervisor,false);assert.equal(at(r,'2026-11').is_supervisor,true);});
 /* 關閉主管旗標：過去月份保留「當時是主管」 */
 current=make({is_manager:true,job_title:'主管',pay_rules:{'2026-07':{...structuredClone(root),is_manager:true}}});saved=[];await c.stCardToggle('E','manager');r=saved[0].row;
 test('關閉主管：過去月份仍是主管（獎金池不被抽掉），本月起不是',()=>{for(const m of ['07','08','09','10'])assert.equal(at(r,'2026-'+m).is_manager,true);assert.equal(at(r,'2026-11').is_manager,false);assert.equal(r.is_manager,false);});
 /* 不影響薪資的開關：不進保護、缺歷史也照存 */
 current=make({pay_rules:{}});saved=[];await c.stCardToggle('E','teach');
 test('開課開關不動薪資：缺歷史也照存、pay_rules 不被改寫',()=>{assert.equal(saved.length,1);assert.equal(JSON.stringify(saved[0].row.pay_rules),'{}');assert.equal(saved[0].row.can_teach,false);});
 current=make({pay_rules:{}});saved=[];messages=[];await c.stCardToggle('E','manager');
 test('缺歷史依據時主管旗標零寫入、不猜過去',()=>{assert.equal(saved.length,0);assert(messages.some(x=>/設定失敗/.test(x)));});
 /* ② 職務切換（stPickSet） */
 current=make();saved=[];await c.stPickSet('E','role','manager');r=saved[0].row;
 test('職務切換→主管：過去不變、本月起是主管',()=>{assert.equal(at(r,'2026-10').is_manager,false);assert.equal(at(r,'2026-11').is_manager,true);assert.equal(r.role,'coach');});
 current=make();saved=[];await c.stPickSet('E','role','admin');r=saved[0].row;
 test('職務切換→管理員：薪資欄位沒動，不寫快照也能存',()=>{assert.equal(r.role,'admin');assert.equal(JSON.stringify(r.pay_rules),JSON.stringify(make().pay_rules));});
 current=make();saved=[];await c.stPickSet('E','punch','0');r=saved[0].row;
 test('值班關閉：過去月份仍需值班，本月起不需值班，打卡旗標同步',()=>{for(const m of ['07','08','09','10'])assert.equal(at(r,'2026-'+m).need_duty,true);assert.equal(at(r,'2026-11').need_duty,false);assert.equal(r.need_punch,false);});
 current=make({pay_rules:{'2026-07':structuredClone(root),'2026-12':{...structuredClone(root),need_duty:true}}});saved=[];await c.stPickSet('E','punch','0');r=saved[0].row;
 test('值班關閉：已排程的未來月份一併改（月初翻過去不會變回去）',()=>assert.equal(r.pay_rules['2026-12'].need_duty,false));
 current=make({pay_rules:{}});saved=[];messages=[];await c.stPickSet('E','punch','0');
 test('值班入口缺歷史依據零寫入',()=>{assert.equal(saved.length,0);assert(messages.some(x=>/設定失敗/.test(x)));});
 /* ③ 排班設定 */
 inputs={'sch-duty':{checked:false},'sch-sub':{checked:true},'sch-punch':{checked:true},'sch-bday':{checked:true}};
 current=make();saved=[];await c.saveSchedule('E');r=saved[0].row;
 test('排班設定改值班：過去需值班不變、本月起不需值班',()=>{for(const m of ['07','08','09','10'])assert.equal(at(r,'2026-'+m).need_duty,true);assert.equal(at(r,'2026-11').need_duty,false);assert.equal(r.can_substitute,true);});
 inputs={'sch-duty':{checked:true},'sch-sub':{checked:true},'sch-punch':{checked:true},'sch-bday':{checked:true}};
 current=make({pay_rules:{}});saved=[];await c.saveSchedule('E');
 test('排班設定只改不影響薪資的欄位（代課）：缺歷史也照存、pay_rules 不動',()=>{assert.equal(saved.length,1);assert.equal(JSON.stringify(saved[0].row.pay_rules),'{}');assert.equal(saved[0].row.can_substitute,true);});
 inputs={'sch-duty':{checked:false},'sch-sub':{checked:false},'sch-punch':{checked:true},'sch-bday':{checked:true}};
 current=make({pay_rules:{}});saved=[];messages=[];await c.saveSchedule('E');
 test('排班設定改值班但缺歷史依據：零寫入（不猜）',()=>{assert.equal(saved.length,0);assert(messages.some(x=>/儲存失敗/.test(x)));});
 /* 生日禮金開關：既有設計（2026-10-03）刻意不做按月快照，只存現值——這支測試把「它仍是缺口」明確記下來，不宣稱已保護 */
 inputs={'sch-duty':{checked:true},'sch-sub':{checked:false},'sch-punch':{checked:true},'sch-bday':{checked:false}};
 current=make({pay_rules:{}});saved=[];await c.saveSchedule('E');r=saved[0].row;
 test('生日禮金開關仍是現值設定：缺歷史也照存、不寫快照（已知缺口 #3，不在保護範圍）',()=>{assert.equal(saved.length,1);assert.equal(r.birthday_bonus_off,true);assert.equal(JSON.stringify(r.pay_rules),'{}');});
 current=make();saved=[];await c.saveSchedule('E');r=saved[0].row;
 test('生日禮金開關不會因此去動薪資快照（過去月份不被凍結也不被改寫）',()=>assert.equal(JSON.stringify(r.pay_rules),JSON.stringify(make().pay_rules)));
 /* ④ 其他保證 */
 test('快照清單沒有生日禮金開關（刻意設計，見 hrsalsrctest）',()=>assert.equal(vm.runInContext('PAY_RULE_KEYS',c).includes('birthday_bonus_off'),false));
 test('保護不會把「未來月份」的其他月快照刪掉或合併',()=>{current=make({pay_rules:{'2026-07':structuredClone(root),'2027-01':{...structuredClone(root),base_salary:31000}}});});
 saved=[];await c.stCardToggle('E','supervisor');r=saved[0].row;
 test('未來月份快照的底薪等其他欄位原封不動',()=>assert.equal(r.pay_rules['2027-01'].base_salary,31000));
 /* ⑤ 月中切換：生效單位是「月」，不是「日」（TODAY 設在 11/18 月中）。算薪一律 calcSalary(empAtMonth(員工, 該月))，一個月只吃一份規則。 */
 current=make();saved=[];await c.stCardToggle('E','manager');r=saved[0].row;
 test('月中（11/18）切成主管：11 月整月都用新規則（沒有 11/1–11/17 舊、11/18 起新的分段）',()=>{
   assert.equal(Object.keys(r.pay_rules).includes('2026-11'),true);
   assert.equal(at(r,'2026-11').is_manager,true);            // 同一份 11 月快照，整月適用
   assert.equal(at(r,'2026-10').is_manager,false);           // 10 月（含 10/31）仍是舊規則
   assert.equal(r.pay_rules['2026-11'].is_manager,true);
 });
 test('月中切換不產生「日」層級的資料：快照鍵只有 YYYY-MM',()=>assert.equal(Object.keys(r.pay_rules).every(k=>/^\d{4}-\d{2}$/.test(k)),true));
 console.log(n+' passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
