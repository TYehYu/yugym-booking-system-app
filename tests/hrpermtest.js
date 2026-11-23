/* 2026-11-18 人事權限修補（前端半邊）：去敏名單讀取層＋補打卡核准走 RPC。
   資料庫半邊見 docs/hr-perm/verify_roles_v2.sql（測試庫各角色實測）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.INDEX_PATH||(process.env.HOME+'/Projects/yugym-booking-system-app/index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const fn=(name)=>{const i=src.indexOf(name);if(i<0)return'';let d=0,k=src.indexOf('{',i);for(;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)break;}}return src.slice(i,k+1);};

console.log('① 去敏名單讀取層：只在一個地方處理');
ok('宣告 empPublicMode／dbSrc／empMergeSelf',/function empPublicMode\(/.test(src)&&/function dbSrc\(/.test(src)&&/async function empMergeSelf\(/.test(src));
ok('整表讀取 q() 走 dbSrc',/sb\.from\(dbSrc\(_tk\)\)\.select\(_sel\)/.test(src));
ok('增量補資料走 dbSrc 並補回自己整列',/sb\.from\(dbSrc\(key\)\)\.select\(sel\)\.in\('id'/.test(src)&&/data:await empSelf\(key,out\)/.test(src));
ok('單筆 dbGet：自己走基表、別人走名單',/const _own=\(tbl\(store\)==='employees' && empPublicMode\(\)/.test(src));
ok('整表抓取（含背景校正）兩處都補自己整列',(src.match(/await empSelf\(store, await _dbGetAllFresh\(store\)\)/g)||[]).length===2);
ok('快取紀元已跳號（讀取規則改版）',/const CACHE_EPOCH='2026-11-18\.hrperm'/.test(src));
ok('前端沒有直接 sb.from(\'employees_public\') 的散落呼叫（只有 dbSrc 一處字串）',(src.match(/employees_public/g)||[]).length<=6,(src.match(/employees_public/g)||[]).length);

console.log('② 行為（假 sb）');
{
  const calls=[];
  const mk=(role,id)=>{
    const env={SESSION:{role,id}, calls};
    const sb={from:(t)=>{calls.push(t);const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id,name:'本人',base_salary:123},error:null})};return q;}};
    const code=fn('function empPublicMode(')+'\n'+fn('function dbSrc(')+'\n'+fn('async function empMergeSelf(')+'\nreturn {empPublicMode,dbSrc,empMergeSelf};';
    return new Function('SESSION','sb',code)(env.SESSION,sb);
  };
  const adm=mk('admin','A'), coach=mk('coach','C'), desk=mk('front_desk','F'), mem=mk('member','M');
  ok('管理員讀基表',adm.dbSrc('employees')==='employees');
  ok('教練／櫃檯讀去敏名單',coach.dbSrc('employees')==='employees_public'&&desk.dbSrc('employees')==='employees_public');
  ok('其他資料表不受影響',coach.dbSrc('bookings')==='bookings'&&coach.dbSrc('members')==='members');
  const rows=[{id:'C',name:'公開'},{id:'X',name:'他人'}];
  (async()=>{
    const r=await coach.empMergeSelf(rows.slice());
    ok('自己那一列換成基表整列（含底薪），他人仍是公開欄位',r.find(x=>x.id==='C').base_salary===123&&r.find(x=>x.id==='X').base_salary===undefined);
    const r2=await coach.empMergeSelf([{id:'X'}]);
    ok('名單沒有自己時補上',r2.some(x=>x.id==='C'));
    const before=calls.length; await mem.empMergeSelf([]);
    ok('會員不多打一次請求',calls.length===before);
    after();
  })();
}
function after(){
console.log('③ 補打卡：核准／駁回走 RPC，前端不再直接寫表');
ok('punchDecide 呼叫 fn_punch_decide',/sb\.rpc\('fn_punch_decide',\{p_id:id,p_approve:!!approve\}\)/.test(src));
const ap=fn('async function approvePunchReq('), rj=fn('async function rejectPunchReq(');
ok('approvePunchReq／rejectPunchReq 不再 dbPut punch_requests／attendance',!/dbPut\('punch_requests'/.test(ap+rj)&&!/dbPut\('attendance'/.test(ap+rj)&&/punchDecide\(id,true\)/.test(ap)&&/punchDecide\(id,false\)/.test(rj));
ok('全檔只剩「送出」與「代登」兩處寫 punch_requests',(src.match(/dbPut\('punch_requests'/g)||[]).length===2,(src.match(/dbPut\('punch_requests'/g)||[]).length);
ok('核准後清掉 punch_requests／attendance 快取',/dbCacheClear\('punch_requests'\); dbCacheClear\('attendance'\)/.test(src));
ok('核准鈕只給主管以上，且不是自己的申請',/isManagerUp\(\) && String\(r\.emp_id\)!==String\(SESSION\.id\)/.test(src));
ok('異常與補卡視窗（實際入口）也只給主管以上核准、櫃檯看到待主管核准並可代登',(src.match(/isManagerUp\(\) && String\(r\.emp_id\)!==String\(SESSION\.id\)/g)||[]).length>=2&&/openPunchProxy\(\)">代登補打卡申請/.test(src));
ok('櫃檯看到「待主管核准」',/待主管核准/.test(src));
ok('代登只送 pending 並帶代登人',/status:'pending'[\s\S]{0,120}requested_by:SESSION\.id/.test(fn('async function submitPunchProxy(')));
ok('RPC 錯誤碼都有人話',['PR.SELF','AUTH.NOT_IN_SCOPE','PR.NOT_PENDING','PR.NOT_FOUND','AUTH.FORBIDDEN'].every(c=>fn('function punchDecideMsg(').includes(c)));
ok('一般送出（本人）維持 pending、不帶審核欄位',/status:'pending',\s*created_at:new Date\(\)\.toISOString\(\)\}/.test(fn('async function submitPunchRequest(')));
ok('打卡改用資料庫回傳的伺服器時間（下班／上班／掃碼下班）',(src.match(/const saved=await dbPut\('attendance',rec\);/g)||[]).length>=3);
ok('出勤規則錯誤有人話並指向補打卡',/ATT\\\.\(LOCKED\|DATE_WINDOW\|NOT_SELF\)/.test(src)&&/申請補打卡」/.test(fn('function dbFriendlyError(')));
{
  const allowed=role=>new Function('SESSION',fn('function canManagePunch(')+';return canManagePunch();')(role);
  ok('補打卡管理入口：櫃檯、主管與管理員可用',allowed({role:'front_desk'})&&allowed({role:'coach',is_manager:true})&&allowed({role:'admin'}));
  ok('補打卡管理入口：一般教練、會員與未登入不可用',!allowed({role:'coach'})&&!allowed({role:'member',is_manager:true})&&!allowed(null));
}
console.log('④ 主管出勤範圍：到班狀態只給最少資訊、不混進出勤明細');
ok('presence 讀取走 attendance_presence 檢視、只在主管身分載入',/sb\.from\('attendance_presence'\)\.select\('emp_id,date,has_in,has_out'\)/.test(src)&&/function attIsManager\(\)/.test(src));
ok('empSelf 對 attendance 只載到班狀態、不改回傳列',/if\(tbl\(store\)==='attendance'\) \{ await attPresenceLoad\(\); return rows; \}/.test(src));
ok('今日值班圈與未打卡計數用 stub，圈對 _presence 畫簡化圈',/attPresenceStub\(c\.id,date\)/.test(src)&&/attPresenceStub\(s\.emp_id,date\)/.test(src)&&/att\._presence/.test(fn('function dutyRingHTML(')));
ok('舊頁面保護的錯誤有人話（ATT.PENDING_REQUEST）',/ATT\\\.PENDING_REQUEST/.test(src));
{ const env={window:{_attPresence:null}}; const code=fn('function attPresenceStub(')+'\nreturn attPresenceStub;'; const st=new Function('window',code)(env.window);
  ok('stub：沒資料＝null',st('E1','2026-11-19')===null); env.window._attPresence={'E1|2026-11-19':{in:true,out:false}};
  const r=st('E1','2026-11-19'); ok('stub：只含到班旗標、不含時間與工時',r&&r._presence&&r.has_in===true&&r.has_out===false&&!('clock_in' in r)&&!('work_hours' in r)); }
console.log('\n'+pass+' 通過 / '+fail+' 失敗'); process.exit(fail?1:0);
}
