/* 2026-11-12 自主訓練跑步機人數改回 1 人沒有取消同行預約（友善自主訓練 14:00 案例）。
   根因：_setSelfVenue 只會「加」同行預約（bkAddTreadmillUnits），沒有「減」，還顯示「場地已設為」。
   本檔驗證修復後的行為（用假資料層，不碰任何資料庫）：
     ① 2 人改 1 人 → 只取消同行預約；主預約／票券／簽到欄位不動；有 cancelled_at／cancel_reason；備註不動
     ② 同行預約已不是 booked（例如已簽到）→ 不取消、明確講原因、不顯示成功
     ③ 更新 0 列／回傳錯誤 → 不亂猜「已簽到」、不顯示成功
     ④ 改成其他場地且有同行 → 先問；按返回／關閉＝零寫入；保留＝只改主預約；一併取消＝兩者都做並核對
     ⑤ 連點兩次確認 → 只執行一次
     ⑥ 1→2 仍會新增；1→1 是空操作
     ⑦ 共用函式（vcCancelSibs／vcKeepSibs／doVenueChange）與 origin/master 逐字相同 */
const fs=require('fs'), path=require('path'), cp=require('child_process');
const FILE=path.join(__dirname,'..','index.html');
const src=fs.readFileSync(FILE,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);
  const st=src.lastIndexOf('async function '+n+'(',i+20)===i-6?i-6:i;let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(st,k+1);}}};
const grabAsync=n=>{const i=src.indexOf('async function '+n+'(');if(i<0)return grabFn(n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const labelDecl=src.match(/const SV_ST_LABEL=\{[^}]*\};/)[0];

const NAMES=['_svVt','_svBusy','bkLiveSiblings','bkCancelSiblingBooking','_setSelfVenue','_svAskSiblings','svSibChoose','_svApply','setSelfVenue','bkAddTreadmillUnits','onceAct'];
const code=labelDecl+'\nconst _actBusy={};\n'+NAMES.map(n=>n==='_svVt'||n==='_svBusy'||n==='_svAskSiblings'||n==='svSibChoose'?grabFn(n):grabAsync(n)).join('\n')
  +'\nreturn {setSelfVenue,svSibChoose,bkCancelSiblingBooking,_svAskSiblings};';

function mkEnv(){
  const env={ rows:[], log:{updates:[],puts:[],other:[],toasts:[],modals:[],closed:0,notify:0,cacheClear:0}, mode:{} , window:{_svPick:null,VENUES:[{id:'treadmill',capacity:2}]}};
  const clone=r=>JSON.parse(JSON.stringify(r));
  env.sb={ from(t){ if(t!=='bookings') env.log.other.push(t);
    return { update(patch){ const f={}; const q={ eq(k,v){f[k]=v;return q;},
      select(){ env.log.updates.push({patch,f});
        if(env.mode.error) return Promise.resolve({data:null,error:{message:'boom'}});
        if(env.mode.zero) return Promise.resolve({data:[],error:null});
        const hit=env.rows.filter(r=>Object.keys(f).every(k=>r[k]===f[k])); hit.forEach(r=>Object.assign(r,patch));
        return Promise.resolve({data:hit.map(clone),error:null}); } }; return q; } }; } };
  env.dbGet=async(s,id)=>{ const r=env.rows.find(x=>x.id===id); return r?clone(r):null; };
  env.dbGetAll=async()=>env.rows.map(clone);
  env.dbPut=async(s,o)=>{ if(env.mode.putFail) throw new Error('寫入失敗'); env.log.puts.push(clone(o)); const i=env.rows.findIndex(x=>x.id===o.id); if(i>=0) env.rows[i]=Object.assign({},env.rows[i],clone(o)); else env.rows.push(clone(o)); return o; };
  let n=0; env.uid=p=>p+'-NEW'+(++n);
  env.api=new Function('sb','dbGet','dbGetAll','dbPut','dbCacheClear','occCacheClear','mchgNotify','showToast','showModal','closeModal','navTo','venueName','timeToMin','allocateVenue','venueAllowsMultiUnit','uid','window','document','CUR_PAGE','SESSION',code)(
    env.sb,env.dbGet,env.dbGetAll,env.dbPut,()=>{env.log.cacheClear++;},()=>{},()=>{env.log.notify++;},
    (m)=>env.log.toasts.push(String(m)),(h)=>env.log.modals.push(String(h)),()=>{env.log.closed++;},()=>{},
    u=>({treadmill:'跑步機',group:'教室',multi:'多功能訓練區'}[String(u||'').split('_')[0]]||''),
    t=>{const [h,m]=String(t).split(':').map(Number);return h*60+m;},
    (cat,day,ns,ne,self,unit)=>({unit:unit==='treadmill'?'treadmill_1':unit==='group'?'group_1':'multi_1'}),
    vid=>vid==='treadmill', env.uid, env.window, {querySelectorAll:()=>[]}, 'calendar', {id:'e_fd'});
  return env;
}
const root=(o)=>Object.assign({id:'BK1',member_id:'m1',category:'自主訓練',date:'2026-11-12',start_time:'14:00',duration:60,status:'checked_in',checked_in_at:'2026-11-12T05:55:00Z',ticket_id:'TK1',venue_unit:'treadmill_1',note:'櫃檯備註',sibling_of:null},o||{});
const sib=(o)=>Object.assign({id:'BK2',member_id:'m1',category:'自主訓練',date:'2026-11-12',start_time:'14:00',duration:60,status:'booked',ticket_id:null,venue_unit:'treadmill_2',sibling_of:'BK1',note:'同行使用（跑步機）・不另外扣點'},o||{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const writes=e=>e.log.puts.length+e.log.updates.length;

(async()=>{
console.log('① 跑步機 2 人改 1 人');
{
  const e=mkEnv(); e.rows.push(root(),sib()); e.window._svPick={id:'BK1',unit:'treadmill',units:1};
  const before=JSON.stringify(e.rows.find(r=>r.id==='BK1'));
  await e.api.setSelfVenue();
  const s=e.rows.find(r=>r.id==='BK2'), r1=e.rows.find(r=>r.id==='BK1');
  ok('★ 多出的同行預約被取消', s.status==='cancelled', s);
  ok('★ 寫入 cancelled_at 與 cancel_reason', !!s.cancelled_at && /改為 1 人/.test(s.cancel_reason||''), s);
  ok('★ 備註沒被動（不做先讀再改再寫）', s.note==='同行使用（跑步機）・不另外扣點');
  ok('★ 條件式更新：id＋sibling_of＋status=booked 三個條件都帶',
     e.log.updates.length===1 && e.log.updates[0].f.id==='BK2' && e.log.updates[0].f.sibling_of==='BK1' && e.log.updates[0].f.status==='booked', e.log.updates);
  const r1b=Object.assign({},r1);
  ok('★ 主預約的狀態／票券／簽到／備註都沒變', r1.status==='checked_in' && r1.ticket_id==='TK1' && r1.checked_in_at==='2026-11-12T05:55:00Z' && r1.note==='櫃檯備註');
  ok('★ 沒有碰其他資料表（沒有票券／帳本寫入）', e.log.other.length===0, e.log.other);
  ok('★ 寫完清 bookings 快取並維持手機端變更通知', e.log.cacheClear>=1 && e.log.notify===1, e.log);
  ok('★ 重新讀取核對後才說「已改為 1 人」', /已改為 1 人/.test(e.log.toasts.slice(-1)[0]||''), e.log.toasts);
  ok('　　視窗已關閉', e.log.closed===1);
}
console.log('\n② 同行預約已不是 booked（已簽到）');
{
  const e=mkEnv(); e.rows.push(root(),sib({status:'checked_in'})); e.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await e.api.setSelfVenue();
  const t=e.log.toasts.slice(-1)[0]||'';
  ok('★ 不取消', e.rows.find(r=>r.id==='BK2').status==='checked_in');
  ok('★ 明確講目前狀態「已簽到」與沒有全部取消成功', /已簽到/.test(t) && /沒有全部取消成功/.test(t), t);
  ok('★ 不顯示成功字樣', !/已改為 1 人/.test(t), t);
  ok('　　主預約場地仍已更新（部分成功要分開講）', /主預約場地已更新/.test(t), t);
}
console.log('\n③ 更新 0 列／錯誤／主預約寫入失敗');
{
  const e=mkEnv(); e.rows.push(root(),sib()); e.mode.zero=true; e.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await e.api.setSelfVenue(); const t=e.log.toasts.slice(-1)[0]||'';
  ok('★ 0 列且重讀仍是 booked → 不說「已簽到」，講「沒有套用，可能權限不足或同時有人修改」', /更新沒有套用/.test(t) && !/已簽到/.test(t), t);
  ok('★ 不顯示成功', !/已改為 1 人/.test(t), t);
  const e2=mkEnv(); e2.rows.push(root(),sib()); e2.mode.error=true; e2.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await e2.api.setSelfVenue(); const t2=e2.log.toasts.slice(-1)[0]||'';
  ok('★ 更新回傳錯誤 → 顯示「儲存失敗」且不成功', /儲存失敗/.test(t2) && !/已改為 1 人/.test(t2), t2);
  const e3=mkEnv(); e3.rows.push(root(),sib({status:'cancelled'})); e3.mode.zero=true; e3.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await e3.api.setSelfVenue();
  ok('　　同行預約其實已被別人取消 → 目標已達成，不當成失敗', /已設為/.test(e3.log.toasts.slice(-1)[0]||'') && !/沒有全部取消成功/.test(e3.log.toasts.slice(-1)[0]||''), e3.log.toasts);
  const e4=mkEnv(); e4.rows.push(root(),sib()); e4.mode.putFail=true; e4.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await e4.api.setSelfVenue();
  ok('★ 主預約寫入失敗 → 同行預約完全不動，顯示「設定失敗」', e4.log.updates.length===0 && e4.rows.find(r=>r.id==='BK2').status==='booked' && /設定失敗/.test(e4.log.toasts.slice(-1)[0]||''), e4.log);
}
console.log('\n④ 改成其他場地且有同行預約');
{
  const mk=()=>{ const e=mkEnv(); e.rows.push(root({status:'booked'}),sib()); e.window._svPick={id:'BK1',unit:'group',units:1}; return e; };
  const e=mk(); await e.api.setSelfVenue();
  ok('★ 先跳「保留／一併取消」視窗', e.log.modals.length===1 && /保留/.test(e.log.modals[0]) && /一併取消/.test(e.log.modals[0]), e.log.modals);
  ok('★ 跳視窗這一步零寫入（還沒改主預約、也沒碰同行）', writes(e)===0, e.log);
  ok('★ 有「返回」，且返回只是重開場地視窗（bkOrbitVenue）', /bkOrbitVenue\('BK1'\)/.test(e.log.modals[0]));
  ok('★ 關閉視窗（不按任何鍵）＝零寫入、資料不變', writes(e)===0 && e.rows.find(r=>r.id==='BK1').venue_unit==='treadmill_1' && e.rows.find(r=>r.id==='BK2').status==='booked');
  const k=mk(); await k.api.setSelfVenue(); await wait(450); await k.api.svSibChoose('keep'); await wait(5);
  ok('★ 保留：只改主預約場地，同行預約不動，沒有偷偷取消', k.rows.find(r=>r.id==='BK1').venue_unit==='group_1' && k.rows.find(r=>r.id==='BK2').status==='booked' && k.log.updates.length===0, k.log);
  ok('　　保留的提示明講同行仍保留', /仍保留/.test(k.log.toasts.slice(-1)[0]||''), k.log.toasts);
  const c=mk(); await c.api.setSelfVenue(); await wait(450); await c.api.svSibChoose('cancel'); await wait(5);
  ok('★ 一併取消：主預約改場地＋同行預約取消，並核對結果', c.rows.find(r=>r.id==='BK1').venue_unit==='group_1' && c.rows.find(r=>r.id==='BK2').status==='cancelled' && /同行預約已取消/.test(c.log.toasts.slice(-1)[0]||''), c.log.toasts);
  const f=mk(); f.rows.find(r=>r.id==='BK2').status='checked_in'; await f.api.setSelfVenue(); await wait(450); await f.api.svSibChoose('cancel'); await wait(5);
  ok('★ 一併取消遇到已簽到的同行 → 不取消，成功與失敗分開講', f.rows.find(r=>r.id==='BK2').status==='checked_in' && /主預約場地已更新/.test(f.log.toasts.slice(-1)[0]||'') && /已簽到/.test(f.log.toasts.slice(-1)[0]||''), f.log.toasts);
  const n=mkEnv(); n.rows.push(root({status:'booked'})); n.window._svPick={id:'BK1',unit:'group',units:1}; await n.api.setSelfVenue();
  ok('　　沒有同行預約時不跳視窗，直接改場地', n.log.modals.length===0 && n.rows.find(r=>r.id==='BK1').venue_unit==='group_1', n.log);
}
console.log('\n⑤ 連點兩次確認');
{
  const e=mkEnv(); e.rows.push(root(),sib()); e.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await Promise.all([e.api.setSelfVenue(), e.api.setSelfVenue()]);
  ok('★ 只執行一次（只有一次取消更新）', e.log.updates.length===1, e.log.updates.length);
  await wait(450); e.window._svPick={id:'BK1',unit:'treadmill',units:1}; await e.api.setSelfVenue();
  ok('★ 就算再按一次也是對帳式空操作（沒有第二次取消）', e.log.updates.length===1, e.log.updates.length);
}
console.log('\n⑥ 加人與不變');
{
  const e=mkEnv(); e.rows.push(root({status:'booked'})); e.window._svPick={id:'BK1',unit:'treadmill',units:2};
  await e.api.setSelfVenue();
  ok('★ 1 人改 2 人：新增 1 筆同行預約（不綁票）', e.rows.filter(r=>r.sibling_of==='BK1'&&r.status==='booked'&&r.ticket_id===null).length===1, e.rows);
  ok('　　提示顯示 2 人', /2 人/.test(e.log.toasts.slice(-1)[0]||''), e.log.toasts);
  const e2=mkEnv(); e2.rows.push(root({status:'booked'})); e2.window._svPick={id:'BK1',unit:'treadmill',units:1};
  await e2.api.setSelfVenue();
  ok('★ 1 人維持 1 人：沒有取消、沒有新增', e2.log.updates.length===0 && e2.rows.length===1, e2.log);
  const e3=mkEnv(); e3.rows.push(root({status:'booked'}),sib()); e3.window._svPick={id:'BK1',unit:'treadmill',units:2};
  await e3.api.setSelfVenue();
  ok('★ 2 人維持 2 人：不重複新增、不取消（舊版會誤報「只保留 1 人」）', e3.rows.length===2 && e3.log.updates.length===0 && !/只有 1 人/.test(e3.log.toasts.slice(-1)[0]||''), e3.log.toasts);
}
console.log('\n⑦ 共用函式沒有被改動');
{
  let base=null; try{ base=cp.execSync('git show origin/master:index.html',{cwd:path.join(__dirname,'..'),maxBuffer:1<<28}).toString('utf8'); }catch(_){}
  const cut=(s,n)=>{const i=s.indexOf('function '+n+'(');const st=s.lastIndexOf('async ',i)===i-6?i-6:i;let d=0;for(let k=s.indexOf('{',i);k<s.length;k++){if(s[k]==='{')d++;else if(s[k]==='}'){d--;if(!d)return s.slice(st,k+1);}}};
  if(!base) console.log('  - 讀不到 origin/master，略過逐字比對');
  else ['vcCancelSibs','vcKeepSibs','doVenueChange','_bkToggleVenueUnit','_bkSetVenueUnits','bkAddTreadmillUnits'].forEach(n=>ok('★ '+n+' 與 origin/master 逐字相同', cut(src,n)===cut(base,n)));
  ok('★ bkOrbitVenue 內被 unitcounttest 釘住的註解還在', /setSelfVenue 會把同行的\s*\n\s*第 2 台當成「要收掉」而取消掉/.test(src));
  ok('★ 兩個 B 模式旗標不在這個版本（本修復不帶入 B 模式）', !/contractHoldB|grantCancelRpc/.test(src));
}
console.log('\n'+pass+' 通過，'+fail+' 失敗'); process.exit(fail?1:0);
})();
