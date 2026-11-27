'use strict';
/* 特休三個視窗「只改呈現」的等價性驗證（2026-11-27）
   用法：node leave_logic_equiv.js <基底 index.html> <新 index.html>
   做法：從兩份 index.html 取出同一組函式，放進同樣的假環境（同一組假員工、同一份假資料）各自執行，比較：
     ① 所有資料存取呼叫（dbGet／dbGetAll／dbPut／dbDel）的順序與參數
     ② 視窗狀態 window._settleCtx（折薪／結轉的計算結果）
     ③ 確認結算與儲存特休實際寫入的資料列（欄位與數值）、提示文字、之後導向
     ④ 視窗裡顯示的所有數字（去掉標籤後的數字集合）
   版面（HTML 字串）當然不同，不比較；比較的是「做了什麼」與「顯示什麼數字」。 */
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const [,, BASE, NEW]=process.argv;
if(!BASE||!NEW){ console.error('用法：node leave_logic_equiv.js <base index.html> <new index.html>'); process.exit(2); }

function fnSrc(src,name){
  const m=new RegExp('(?:async )?function '+name+'\\(').exec(src); assert(m,'找不到 '+name);
  const i=m.index; let d=0,k=src.indexOf('{',i);
  for(;;k++){ if(src[k]==='{')d++; if(src[k]==='}'&&--d===0)break; }
  return src.slice(i,k+1);
}
const NAMES=['annualLeaveAccount','openLeaveSettlement','openLeaveSettleOne','settlePreview','confirmLeaveSettle','openLeaveEdit','saveLeave','leaveCashoutHourly'];

function makeEnv(src){
  const log=[]; const modals=[]; const nodes={}; let checked=null;
  const emps={
    e1:{id:'e1',name:'王小明',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:12,al_earned_hours:56,base_salary:30000},
    e2:{id:'e2',name:'歐陽鈺翎・Christopher Alexander Montgomery',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:0,al_earned_hours:0,base_salary:30000},
    e3:{id:'e3',name:'林依晨',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:7.5,al_earned_hours:42.25,base_salary:30000},
    e4:{id:'e4',name:'吳小數',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:0.5,al_earned_hours:0.25,base_salary:30000},
    e9:{id:'e9',name:'離職員工',employment_type:'full_time',hire_date:'2022-03-01',al_carry_hours:0,al_earned_hours:56,base_salary:30000,_resigned:true},
  };
  const shifts=[{emp_id:'e1',date:'2026-03-02',leave_type:'特休',leave_hours:8},{emp_id:'e3',date:'2026-04-01',leave_type:'特休',leave_hours:2.5}];
  const settled=[{emp_id:'e4',year:'2026',carry_forward_hours:25.5,cashout_hours:10}];
  const ctx={
    window:{_leaveYear:2026}, TODAY:new Date(2026,10,27), SESSION:{name:'櫃台'}, console, setTimeout:fn=>{ log.push(['setTimeout']); return 0; },
    uid:p=>p+'-FIXED', LEAVE_HOURS_PER_DAY:8, FT_MONTHLY_HOURS:130,
    normEmp:x=>x||'full_time', EMP_RULES:{full_time:{label:'正職教練',leaveApplicable:true}},
    effRates:()=>({duty_hourly:300}), calcSeniority:()=>({years:4,days:1637}), statutoryAnnualLeave:()=>14,
    earnedLeaveForYear:(e)=> e._resigned?{hours:41.5,prorated:true,ratio:0.5,inService:181,daysInYear:365,fullHours:84,resignDate:'2026-06-30'}:{hours:Number(e.al_earned_hours)||0,prorated:false},
    _hrStaffList:async()=>{ log.push(['_hrStaffList']); return Object.values(emps); },
    dbGetAll:async t=>{ log.push(['dbGetAll',t]); return t==='shifts'?shifts:(t==='leave_settlements'?settled:[]); },
    dbGet:async(t,id)=>{ log.push(['dbGet',t,id]); return JSON.parse(JSON.stringify(emps[id]||null)); },
    dbPut:async(t,r)=>{ log.push(['dbPut',t,JSON.parse(JSON.stringify(r))]); },
    dbDel:async(t,id)=>{ log.push(['dbDel',t,id]); },
    showModal:h=>{ modals.push(h); }, closeModal:()=>log.push(['closeModal']), showToast:m=>log.push(['toast',m]), navTo:p=>log.push(['navTo',p]),
    escH:x=>String(x),
    document:{ getElementById:id=>(nodes[id]=nodes[id]||{style:{},disabled:false,innerHTML:'',value:''}),
               querySelector:sel=>(/earnedDisp.*:checked/.test(sel)&&checked)?{value:checked}:null },
  };
  ctx.window.SALARY_TPL={}; vm.createContext(ctx);
  vm.runInContext(NAMES.map(n=>fnSrc(src,n)).join('\n')+'\nthis.F={'+NAMES.join(',')+'};',ctx);
  return {ctx,log,modals,nodes,pick:v=>{checked=v;}};
}
const nums=h=>String(h).replace(/<[^>]*>/g,' ').match(/-?\d[\d,]*\.?\d*/g)||[];
const norm=a=>a.map(x=>x.replace(/,/g,'')).sort();

async function scenario(src){
  const E=makeEnv(src); const out={};
  await E.ctx.F.openLeaveSettlement();
  out.listLog=JSON.stringify(E.log.splice(0));
  out.listNums=[...new Set(norm(nums(E.modals.pop())))];            // 名單：桌機表格與手機卡片各一份 → 比「不重複的數字集合」
  for(const id of ['e1','e2','e3','e4','e9']){
    await E.ctx.F.openLeaveSettleOne(id,2026);
    out['one_'+id+'_log']=JSON.stringify(E.log.splice(0));
    out['one_'+id+'_ctx0']=JSON.stringify(E.ctx.window._settleCtx);
    out['one_'+id+'_nums']=norm(nums(E.modals.pop())).join(',');
    for(const opt of ['carry','cash']){
      E.pick(opt); E.ctx.F.settlePreview();
      out['one_'+id+'_'+opt+'_ctx']=JSON.stringify(E.ctx.window._settleCtx);
      out['one_'+id+'_'+opt+'_prevnums']=norm(nums(E.nodes['settle-preview'].innerHTML)).join(',');
      out['one_'+id+'_'+opt+'_btn']=JSON.stringify([E.nodes['settle-confirm']&&E.nodes['settle-confirm'].disabled]);
      // 確認結算（寫入）：只比較「寫了什麼」
      E.log.splice(0); await E.ctx.F.confirmLeaveSettle();
      out['one_'+id+'_'+opt+'_confirm']=JSON.stringify(E.log.splice(0)).replace(/"settled_at":"[^"]*"/g,'"settled_at":"T"');   // 時間戳記不比
      out['one_'+id+'_'+opt+'_year']=E.ctx.window._leaveYear; E.ctx.window._leaveYear=2026;
    }
    E.pick(null); E.ctx.F.settlePreview(); out['one_'+id+'_nochoice']=JSON.stringify(E.ctx.window._settleCtx);
    await E.ctx.F.openLeaveEdit(id);
    out['edit_'+id+'_log']=JSON.stringify(E.log.splice(0));
    out['edit_'+id+'_nums']=norm(nums(E.modals.pop())).join(',');
    E.nodes['lv-carry']={value:'3.5'}; E.nodes['lv-earned']={value:'20'};
    await E.ctx.F.saveLeave(id);
    out['edit_'+id+'_save']=JSON.stringify(E.log.splice(0));
  }
  return out;
}
(async()=>{
  const A=await scenario(fs.readFileSync(BASE,'utf8')), B=await scenario(fs.readFileSync(NEW,'utf8'));
  let ok=0, bad=0; const fails=[];
  Object.keys(A).forEach(k=>{ if(JSON.stringify(A[k])===JSON.stringify(B[k])){ok++;} else {bad++; fails.push(k+'\n  基底：'+String(A[k]).slice(0,300)+'\n  新版：'+String(B[k]).slice(0,300));} });
  console.log(`比較項目 ${ok+bad} 項：相同 ${ok}、不同 ${bad}`);
  if(bad){ console.log(fails.join('\n')); process.exit(1); }
  console.log('✓ 資料存取順序／參數、折薪結轉計算狀態、確認結算與儲存寫入的資料列、顯示的數字，基底與新版完全一致');
})().catch(e=>{ console.error(e); process.exit(1); });
