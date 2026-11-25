'use strict';
/* 員工管理頁籤：勞健保／特休／權限設定併入（2026-11-24）。真的執行 PAGES.staff 與 staffHubMode。 */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fn(name){const i=src.indexOf('function '+name+'(');assert(i>=0,name);const st=src.slice(i-6,i)==='async '?i-6:i;let d=0,k=src.indexOf('{',i);for(;;k++){if(src[k]=='{')d++;if(src[k]=='}'&&--d==0)break;}return src.slice(st,k+1);}
function blk(start,endMarker){const i=src.indexOf(start);assert(i>=0,start);return src.slice(i,src.indexOf(endMarker,i)+endMarker.length);}
const stubs={renderStaffHub:'hub',renderStaffInsurance:'ins',renderStaffLeave:'leave',renderPayrollSummary:'pay',renderSalaryTemplates:'sal',renderStaffSchedule:'sch',renderStaffList:'list'};
const out={html:'',calls:[],navs:[]};
const c={window:{},document:{getElementById:id=>id==='staff-body'?{set innerHTML(v){out.body=v;},get innerHTML(){return out.body;}}:(id==='settings-salary-body'?{set innerHTML(v){out.sal=v;}}:null)},
  head:(a,b)=>`<h1>${b}</h1>`,PAGES:{},navTo:(...a)=>out.navs.push(a),CUR_GROUP:'g_admin',STAFF_HUB:{mode:'directory'},console,
  openPunchFixModal(){}};
c.C={set innerHTML(v){out.html=v;},get innerHTML(){return out.html;}};
Object.keys(stubs).forEach(k=>c[k]=async(arg)=>{out.calls.push(k+(arg?':'+arg:''));});
vm.createContext(c);
const pagesStaff=(()=>{const i=src.indexOf('PAGES.staff=async function(){');return src.slice(i,src.indexOf('\n};\n',i)+4);})();
vm.runInContext([blk('const STAFF_TABS=[','];'),"let _staffTab='list';let CUR_TAB=null;",blk('const STAFF_TAB_HEAD={','};'),blk('const STAFF_VIEWS=','];'),
  fn('staffViewTabs'),fn('staffHubMode'),fn('staffPermBodyHtml'),fn('staffPermLoadSalary'),pagesStaff,'this.S={get tab(){return _staffTab;},set tab(v){_staffTab=v;},get cur(){return CUR_TAB;}};'].join('\n'),c);
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
(async()=>{
 test('三個檢視：員工名單／月度作業／勞健保（特休併進員工名單，權限設定頁籤移除）',()=>assert.equal(vm.runInContext('STAFF_VIEWS.map(x=>x[1])',c).join(),'員工名單,月度作業,勞健保'));
 for(const [tab,call] of [['insurance','renderStaffInsurance'],['leave','renderStaffLeave']]){
   c.S.tab=tab;out.calls=[];await c.PAGES.staff();
   test(tab+'：頁首有同一排頁籤、內容走原本的畫面'+(tab==='insurance'?'、選中自己':'（舊連結相容）'),()=>{assert(out.html.includes('ui-tabs'));if(tab==='insurance')assert(out.html.includes('aria-selected="true" onclick="staffHubMode(\''+tab+'\')"'));assert(out.calls.includes(call));});
 }
 c.S.tab='perm';out.calls=[];out.html='';await c.PAGES.staff();
 test('權限設定（舊連結相容）：仍畫得出角色權限與薪資制度',()=>{assert(out.html.includes('ui-tabs'));assert(out.body.includes('角色與權限')&&out.body.includes('薪資制度'));assert(out.calls.includes('renderSalaryTemplates:settings-salary-body'));});
 test('權限設定頁的薪資制度存檔後會回到這個頁籤（host=staffperm）',()=>assert.equal(c.window._salaryHost,'staffperm'));
 // 切換
 out.navs=[];c.S.tab='list';c.staffHubMode('insurance');
 test('點「勞健保」→ 記住頁籤並整頁重畫',()=>{assert.equal(c.S.tab,'insurance');assert.equal(c.S.cur,'insurance');assert.equal(out.navs.length,1);});
 out.navs=[];c.staffHubMode('directory');
 test('從勞健保切回員工名單 → 整頁重畫回 list',()=>{assert.equal(c.S.tab,'list');assert.equal(out.navs.length,1);});
 // 選單與舊頁
 test('左側選單不再有勞健保／特休／權限設定獨立項目，員工管理涵蓋這三個 tab',()=>{
   const g=src.slice(src.indexOf("{key:'g_admin'"),src.indexOf("]},",src.indexOf("{key:'g_admin'")));
   assert(!/label:'勞健保'/.test(g)&&!/label:'特休'/.test(g)&&!/label:'權限設定'/.test(g));assert(/tabs:\['list','insurance','leave','perm'\]/.test(g));});
 test('舊頁面 settings_staff 仍在（舊深層連結不壞），用同一份內容',()=>assert(/PAGES\.settings_staff=async function\(\)\{[\s\S]{0,200}staffPermBodyHtml\(\)/.test(src)));
 test('勞健保：姓名欄有職等色頭像＋英文名，名單依職等排序（與員工名單一致）',()=>{const i=src.indexOf('async function renderStaffInsurance');const b=src.slice(i,i+1600);assert(/staffPersonCell\(c\)/.test(b)&&/staffHubRank\(a,stMonthCur\(\)\)-staffHubRank\(b,stMonthCur\(\)\)/.test(b));assert(/function staffPersonCell\(e,month\)\{[\s\S]{0,400}sh-avatar sh-rk/.test(src));});
 console.log(n+' passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
