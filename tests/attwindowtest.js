/* 出席圓鈕（簽到／未到課）開課前 30 分鐘才顯示（2026-11-16）
   ⚠ 前端防誤觸，不是資料庫強制限制。
   跑法（假 HOME 指向本分支工作目錄）：
     mkdir -p $TMP/Projects && ln -s <本分支目錄> $TMP/Projects/yugym-booking-system-app
     HOME=$TMP node tests/attwindowtest.js
   這支用 new Function 逐字抽出 index.html 裡真正的函式去跑（不是重寫一份）。 */
const fs=require('fs');
const P=process.env.HOME+'/Projects/yugym-booking-system-app/index.html';
const src=fs.readFileSync(P,'utf8');
console.log('讀取：'+fs.realpathSync(P));
let fail=0; const ok=(c,m)=>{ if(c) console.log('  ✓ '+m); else { fail++; console.log('  ✗ '+m); } };
if(!src.includes('function bkAttOpenAt(')){ console.log('✗ 讀到的 index.html 不是本分支（沒有 bkAttOpenAt）'); process.exit(1); }

const grab=(startMark,endMark)=>{ const i=src.indexOf(startMark); const j=src.indexOf(endMark,i); if(i<0||j<0) throw new Error('抽不到：'+startMark); return src.slice(i,j); };
const code=grab('const BK_ATT_LEAD_MIN','function evoBtn(')
  + src.slice(src.indexOf('function evoBtn('), src.indexOf('/* 扇形排列'));

/* 假環境：可控時鐘、假計時器、極簡 DOM */
function mk(){
  const E={now:0,toasts:[],timers:[],cleared:0,host:null};
  const mkBtn=html=>{
    const cls=(html.match(/class="([^"]*)"/)||[])[1]||'';
    const at=(html.match(/data-att-at="(\d+)"/)||[])[1];
    const set=new Set(cls.split(/\s+/).filter(Boolean));
    return {html, classList:{contains:c=>set.has(c),remove:c=>set.delete(c)}, getAttribute:k=>k==='data-att-at'?at:null,
            visible:()=>!set.has('evo-att-wait')};
  };
  E.mkBtn=mkBtn;
  const fn=new Function('Date','showToast','document','window','setTimeout','clearTimeout','EVO_IC','dbGet',
    code+'\nreturn {bkAttOpenAt,bkAttOk,evoAttBtn,bkAttSchedule,bkAttGate,bkAttBtnHtml};');
  const FakeDate={now:()=>E.now, parse:Date.parse};
  const win={};
  E.win=win;
  E.api=fn(FakeDate,m=>E.toasts.push(m),{getElementById:id=>id==='bk-card-pop'?E.host:null, querySelectorAll:sel=>E.host?E.host.querySelectorAll(sel):[]},win,
    (f,ms)=>{ const t={f,ms,id:E.timers.length+1,live:true}; E.timers.push(t); return t.id; },
    id=>{ const t=E.timers[id-1]; if(t&&t.live){ t.live=false; E.cleared++; } }, {}, async(tb,id)=>{ if(E.throwDb) throw new Error('net'); return E.db?(E.db[id]||null):null; });
  E.tp=(s)=>Date.parse(s+'+08:00');
  E.liveTimers=()=>E.timers.filter(t=>t.live).length;
  return E;
}

console.log('① 門檻：11/17 19:00 開課');
{ const E=mk(), A=E.api;
  const b={date:'2026-11-17',start_time:'19:00'};
  E.now=E.tp('2026-11-17T18:29:59'); ok(/evo-att-wait/.test(A.evoAttBtn(b,'evo-r2','evo-primary','x()','check','簽到')),'18:29:59 隱藏');
  ok(A.bkAttOk(b.date,b.start_time)===false && E.toasts.length===1,'18:29:59 點擊重驗被擋並提示');
  E.now=E.tp('2026-11-17T18:30:00'); ok(!/evo-att-wait/.test(A.evoAttBtn(b,'evo-r2','evo-primary','x()','check','簽到')),'18:30:00 顯示');
  ok(A.bkAttOk(b.date,b.start_time)===true,'18:30:00 點擊放行');
  E.now=E.tp('2026-11-17T19:05:00'); ok(!/evo-att-wait/.test(A.evoAttBtn(b,'','evo-gold','x()','noshow','未到課')),'開課後顯示');
  E.now=E.tp('2026-11-10T09:00:00'); ok(!/evo-att-wait/.test(A.evoAttBtn({date:'2026-11-09',start_time:'09:00'},'','','x()','check','簽到')),'過去課程（補登）維持顯示');
  E.now=E.tp('2026-11-16T20:00:00'); ok(/evo-att-wait/.test(A.evoAttBtn(b,'','','x()','check','簽到')),'前一天晚上更早 → 隱藏');
  const h=A.evoAttBtn({date:'2026-11-17',start_time:'19:00:00'},'','','x()','check','簽到');
  ok(/data-att-at="\d+"/.test(h),'start_time 含秒數也能算');
}
console.log('② 跨午夜：11/18 00:10 開課');
{ const E=mk(), A=E.api; const b={date:'2026-11-18',start_time:'00:10'};
  E.now=E.tp('2026-11-17T23:39:59'); ok(A.bkAttOk(b.date,b.start_time)===false,'11/17 23:39:59 不可');
  E.now=E.tp('2026-11-17T23:40:00'); ok(A.bkAttOk(b.date,b.start_time)===true,'11/17 23:40:00 可（跨午夜）');
  ok(A.bkAttOpenAt('2026-11-17','19:00')===E.tp('2026-11-17T18:30:00'),'一律以 +08:00 台北時間計算，與瀏覽器時區無關');
}
console.log('③ 課卡開著跨門檻：自動出現；關閉清計時器；不重複註冊');
{ const E=mk(), A=E.api; const b={date:'2026-11-17',start_time:'19:00'};
  E.now=E.tp('2026-11-17T18:29:00');
  E.host={querySelectorAll:()=>[...btns]};
  const btns=[E.mkBtn(A.evoAttBtn(b,'evo-r2','evo-primary','x()','check','簽到')), E.mkBtn(A.evoAttBtn(b,'','evo-gold','y()','noshow','未到課'))];
  ok(btns.every(x=>!x.visible()),'開卡時兩顆都隱藏');
  A.bkAttSchedule(); A.bkAttSchedule(); A.bkAttSchedule();
  ok(E.liveTimers()===1,'重複排程只留 1 個計時器（實際 '+E.liveTimers()+'）');
  const t=E.timers.filter(x=>x.live)[0]; ok(t.ms===60000,'排在剛好 60 秒後（'+t.ms+'ms）');
  E.now=E.tp('2026-11-17T18:29:59'); t.live=false; t.f(); ok(btns.every(x=>!x.visible()) && E.liveTimers()===1,'差 1 秒觸發：仍隱藏並重排');
  const t2=E.timers.filter(x=>x.live)[0]; E.now=E.tp('2026-11-17T18:30:00'); t2.live=false; t2.f();
  ok(btns.every(x=>x.visible()),'到 18:30:00 自動出現');
  ok(E.liveTimers()===0,'都顯示後不再排計時器');
  // 關卡清計時器：模擬 bkCardPopClose 開頭那兩行
  const E2=mk(), A2=E2.api; E2.now=E2.tp('2026-11-17T18:00:00');
  const bb=[E2.mkBtn(A2.evoAttBtn(b,'','','x()','check','簽到'))]; E2.host={querySelectorAll:()=>bb};
  A2.bkAttSchedule(); ok(E2.liveTimers()===1,'開卡後有 1 個計時器');
  // （關卡計時器改在 ⑦ 以真正的 bkCardPopClose／closeModal 流程驗證）
  // 超過 1 小時的等待分段
  const E3=mk(), A3=E3.api; E3.now=E3.tp('2026-11-17T08:00:00');
  const bc=[E3.mkBtn(A3.evoAttBtn(b,'','','x()','check','簽到'))]; E3.host={querySelectorAll:()=>bc};
  A3.bkAttSchedule(); ok(E3.timers.filter(x=>x.live)[0].ms===3600000,'等很久時單次最長 1 小時（避開 setTimeout 上限）');
}
console.log('④ 各入口都走時間閘、原本限制不變（靜態檢查）');
{
  const lines=src.split('\n');
  const circ=lines.map((l,i)=>[i+1,l]).filter(([,l])=>/evoBtn\(|evoAttBtn\(/.test(l) && /'check','簽到'|'check',inHere|'noshow','未到課'/.test(l));
  ok(circ.length>=6,'找到的出席圓鈕入口 '+circ.length+' 處');
  const raw=circ.filter(([,l])=>/evoBtn\(/.test(l) && !/inHere\?'取消簽到'|'取消簽到'/.test(l));
  ok(raw.length===0,'沒有「簽到／未到課」還在用未過閘的 evoBtn：'+raw.map(x=>x[0]).join(','));
  ok(/evoBtn\('evo-r2','',`bkOrbitUndo\(this,'\$\{id\}'\)`,'undo','取消簽到'\)/.test(src),'單人「取消簽到」維持原樣（不過閘）');
  ok(/evoBtn\('evo-b2','evo-gold',`collapseBkCard\(\);bkUndoNoShow\('\$\{id\}'\)`,'noshow','取消未到課'\)/.test(src),'「取消未到課」維持原樣');
  ok(/if\(!_calCtx && \(staff\|\|coachCk\) && !bkIsCoachLeave\(b\) && !isGroup && b\.status==='booked'\) btns \+= evoAttBtn/.test(src),'未到課原有角色／狀態條件仍在');
  ok(/if\(\(!_ashMode \|\| !isGroup\) && !_calCtx && \(staff\|\|coachCk\) && !closed\)\{/.test(src),'簽到原有角色／行事曆情境／已關閉條件仍在');
  ok(/if\(!A\.pending && _canAct\)\{/.test(src),'待簽約（A.pending）仍不畫逐人圓鈕');
  const ci=src.indexOf('async function _checkInBooking('); const seg=src.slice(ci,ci+1800);
  ok(/bkAttOk\(b\.date,b\.start_time,'尚未開放簽到（課程開始前 30 分鐘起）'\)/.test(seg),'checkInBooking 的 30 分鐘檢查改用共用判斷（訊息不變）');
  ok(/b\.status!=='booked'/.test(src.slice(src.indexOf('async function bkMarkNoShow'),src.indexOf('async function bkMarkNoShow')+700)) && /還不能標未到課/.test(src),'bkMarkNoShow 既有檢查未動');
  ok(!/evo-att-wait[^\n]*opacity/.test(src),'隱藏用 display:none，不是變淡');
  ok(/\.evo-att-wait\{display:none !important;\}/.test(src),'CSS 隱藏規則存在');
}

console.log('⑤ 預約明細／名單列的員工小按鈕、課卡開著被改期');
(async()=>{
  { const E=mk(), A=E.api; const b={id:'B1',date:'2026-11-17',start_time:'19:00'};
    E.now=E.tp('2026-11-17T18:00:00');
    ok(/evo-att-wait/.test(A.bkAttBtnHtml(b,'btn-green btn-sm',"checkInBooking('B1')",'簽到')),'明細「簽到」開課前 30 分鐘前隱藏');
    ok(/evo-att-wait/.test(A.bkAttBtnHtml(b,'btn-ghost btn-sm',"bkCoachLeaveNoShow('B1')",'未到場結課','t')),'明細「未到場結課」隱藏');
    E.now=E.tp('2026-11-17T18:30:00');
    const h=A.bkAttBtnHtml(b,'btn-green btn-sm',"checkInBooking('B1')",'簽到');
    ok(!/evo-att-wait/.test(h)&&/簽到<\/button>/.test(h),'18:30:00 顯示');
    ok(/bkAttGate\('B1','2026-11-17','19:00'\)\.then/.test(h),'小按鈕點擊同樣走最新資料重驗');
    // 明細開著跨門檻：自動補出
    E.now=E.tp('2026-11-17T18:29:00');
    const mb=E.mkBtn(A.bkAttBtnHtml(b,'btn-green btn-sm',"x()",'簽到')); E.host={querySelectorAll:()=>[mb]};
    A.bkAttSchedule(); ok(!mb.visible(),'明細開著、未到點仍隱藏');
    const t=E.timers.filter(x=>x.live)[0]; E.now=E.tp('2026-11-17T18:30:00'); t.live=false; t.f(); ok(mb.visible(),'明細開著跨門檻 → 自動出現');
  }
  { // 開卡時 19:00 已開放，卡開著被別人改到 21:00 → 點擊用最新值擋下
    const E=mk(), A=E.api; E.now=E.tp('2026-11-17T18:45:00');
    E.db={B2:{id:'B2',date:'2026-11-17',start_time:'21:00'}};
    ok(await A.bkAttGate('B2','2026-11-17','19:00')===false && E.toasts.length===1,'開卡後被改期到 21:00：舊值 19:00 不放行');
    E.db={B2:{id:'B2',date:'2026-11-17',start_time:'19:00'}}; E.toasts.length=0;
    ok(await A.bkAttGate('B2','2026-11-17','21:00')===true,'卡上舊值較晚、最新值已到：以最新值為準放行');
    E.db={B2:{id:'B2',date:'2026-11-18',start_time:'00:05'}};
    ok(await A.bkAttGate('B2','2026-11-17','19:00')===false,'改到隔天凌晨：擋下');
    E.db={}; E.toasts.length=0; ok(await A.bkAttGate('B2','2026-11-17','19:00')===false && /重新開啟課卡/.test(E.toasts[0]||''),'查無預約：拒絕並提示重新開啟課卡（不退回舊值放行）');
    E.db=null; E.toasts.length=0; E.throwDb=true; ok(await A.bkAttGate('B2','2026-11-17','19:00')===false && /重新開啟課卡/.test(E.toasts[0]||''),'讀取失敗（丟例外）：同樣拒絕，不用舊值放行'); E.throwDb=false;
  }
  console.log('⑥ 明細入口原有限制（靜態）');
  ok(/b\.status==='booked'&&!isGroupD&&staffCanCheckin\n\s*\? \(\(function\(\)\{const nd=/.test(src),'明細簽到仍限 staffCanCheckin、非團課、booked');
  ok(/openMakeupModal\('\$\{b\.id\}'\)">補簽<\/button>/.test(src),'過去課程「補簽」不變');
  ok(/onclick="undoCheckin\('\$\{b\.id\}'\)">取消簽到<\/button>/.test(src),'明細「取消簽到」不變');
  ok(/\(inHere\|\|isPastD\)\s*\n\s*\? `<button class="btn btn-ghost btn-sm" onclick="toggleGroupAttend\('\$\{b\.id\}','\$\{sk\}'\)">\$\{inHere\?'取消簽到':'補簽'\}/.test(src),'團課名單列：取消簽到／補簽不過閘，簽到才過閘');
  ok(!/onclick="checkInBooking\('\$\{b\.id\}'\)">簽到<\/button>`\)/.test(src.slice(src.indexOf("<span>預約明細</span>"),src.indexOf("<span>預約明細</span>")+1500)),'明細標題列沒有未過閘的員工簽到');
  await new Promise(r=>setTimeout(r,0));
})().then(()=>{
  return (async()=>{
  console.log('⑦ 寫入函式（真正的 _toggleGroupAttend／bkRosterToggle）自己也擋提前簽到');
  const grabF=(a,b)=>{ const i=src.indexOf(a), j=src.indexOf(b,i); if(i<0||j<0) throw new Error('抽不到 '+a); return src.slice(i,j); };
  const attObjSrc=grabF('function attObj(b){','// 團課：切換某會員的簽到狀態');
  const togSrc=grabF('async function _toggleGroupAttend(','// 距開課剩餘');
  const rosSrc=grabF('async function bkRosterToggle(','// ── 代課');
  function wr(nowStr, rec){
    const E=mk(); E.now=E.tp(nowStr); const puts=[]; const A=E.api;
    class FD extends Date{ static now(){ return E.now; } }
    const f=new Function('Date','showToast','dbGet','dbPut','dbCacheClear','openBookingDetail','bkOrbitRoster','bkAttOk','window',
      attObjSrc+togSrc+rosSrc+'\nreturn {_toggleGroupAttend,bkRosterToggle};');
    const dbGet=async(t,id)=>{ if(E.throwDb) throw new Error('net'); return rec?JSON.parse(JSON.stringify(rec)):null; };
    const api=f(FD,m=>E.toasts.push(m),dbGet,async(t,r)=>{puts.push(r);},()=>{},()=>{},()=>{},A.bkAttOk,{});
    return {E,puts,api};
  }
  const g={id:'G1',date:'2026-11-17',start_time:'19:00',status:'booked',member_ids:['M1'],attendance:{M1:'booked'}};
  { const {E,puts,api}=wr('2026-11-17T18:00:00',g);
    await api._toggleGroupAttend('G1','M1'); ok(puts.length===0 && E.toasts.length===1,'團課處理函式：開課前 2 小時簽到 → 拒絕、沒寫入');
    await api.bkRosterToggle('att|G1|M1','G1'); ok(puts.length===0,'名單切換（新結構）提前簽到 → 拒絕、沒寫入');
    await api.bkRosterToggle('bk|G1','G1'); ok(puts.length===0,'名單切換（舊結構）提前簽到 → 拒絕、沒寫入'); }
  { const {E,puts,api}=wr('2026-11-17T18:30:00',g);
    await api._toggleGroupAttend('G1','M1'); ok(puts.length===1 && puts[0].attendance.M1==='checked_in','18:30:00 可簽到並寫入'); }
  { const gi=Object.assign({},g,{status:'checked_in',attendance:{M1:'checked_in'}});
    const {E,puts,api}=wr('2026-11-17T10:00:00',gi);
    await api._toggleGroupAttend('G1','M1'); ok(puts.length===1 && puts[0].attendance.M1==='booked','已簽到者「取消簽到」不受時間限制');
    await api.bkRosterToggle('att|G1|M1','G1'); ok(puts.length===2,'名單「取消簽到」不受限'); }
  { const past=Object.assign({},g,{date:'2026-11-10'}); const {puts,api}=wr('2026-11-17T10:00:00',past);
    await api._toggleGroupAttend('G1','M1'); ok(puts.length===1,'過去課程補簽維持原行為'); }
  { const {E,puts,api}=wr('2026-11-17T19:30:00',null);
    await api._toggleGroupAttend('G1','M1'); ok(puts.length===0 && /重新開啟課卡/.test(E.toasts[0]||''),'查無預約：停止並提示重新開啟課卡');
    await api.bkRosterToggle('att|G1|M1','G1'); ok(puts.length===0,'名單切換查無預約：停止'); }
  { const {E,puts,api}=wr('2026-11-17T19:30:00',g); E.throwDb=true;
    let threw=false; try{ await api._toggleGroupAttend('G1','M1'); }catch(_){ threw=true; }
    ok(puts.length===0,'讀取失敗：沒寫入（'+(threw?'丟例外交由外層 toast':'已提示')+'）'); }
  // 兩次讀取之間被改期：按鈕閘當時 OK，但寫入函式讀到最新值已是 21:00 → 拒絕
  { const moved=Object.assign({},g,{start_time:'21:00'}); const {E,puts,api}=wr('2026-11-17T18:45:00',moved);
    await api._toggleGroupAttend('G1','M1'); ok(puts.length===0,'按鈕放行後被改期到 21:00：寫入函式以最新值擋下'); }

  console.log('⑧ 關閉流程（真正的 bkCardPopClose／closeModal）清計時器，且不誤清別處仍在等的');
  const clSrc=grabF('function bkCardPopClose(animate){','/* ── 出席圓鈕時間閘');
  const cmSrc=grabF('function closeModal(){','\n/*', ) ;
  function dom(){
    const nodes=[]; const D={nodes};
    const mkN=(id,cls,parent)=>{ const n={id,parent,attrs:{},connected:true,cls:new Set(cls),dataset:{},
      classList:{contains:c=>n.cls.has(c),remove:c=>n.cls.delete(c),add:c=>n.cls.add(c)},
      remove(){ n.connected=false; },
      isConn(){ return n.connected && (!n.parent||n.parent.isConn()); },
      closest(sel){ const m=sel.match(/\[data-closing="1"\]/); for(let x=n;x;x=x.parent) if(m&&x.dataset.closing==='1') return x; return null; },
      getAttribute(k){ return n.attrs[k]; },
      querySelector(){ return null; }, querySelectorAll(){ return []; } };
      nodes.push(n); return n; };
    D.mk=mkN;
    D.document={ body:{style:{}},
      getElementById:id=>nodes.find(n=>n.id===id&&n.isConn())||null,
      querySelectorAll:sel=>nodes.filter(n=>n.isConn()&&n.cls.has('evo-att-wait')) };
    return D;
  }
  function boot(){
    const E=mk(); const D=dom(); E.now=E.tp('2026-11-17T18:00:00');
    const at=E.tp('2026-11-17T18:30:00');
    const f=new Function('document','window','setTimeout','clearTimeout','bkAttSchedule','mpkSheetClose',
      clSrc.replace(/function evoBtn\([\s\S]*$/,'')+cmSrc+'\nreturn {bkCardPopClose,closeModal};');
    const win={};
    // 排程用真的 bkAttSchedule：重新生成一份綁同一個 document／window／計時器
    const sched=new Function('Date','document','window','setTimeout','clearTimeout',
      grabF('function bkAttSchedule(){','function evoBtn(')+'\nreturn bkAttSchedule;')(
      {now:()=>E.now,parse:Date.parse},D.document,win,
      (f2,ms)=>{ const t={f:f2,ms,live:true}; E.timers.push(t); return E.timers.length; },
      id=>{ const t=E.timers[id-1]; if(t) t.live=false; });
    win.bkAttSchedule=sched;
    const api=new Function('document','window','setTimeout','clearTimeout','bkAttSchedule','mpkSheetClose',
      clSrc.replace(/function evoBtn\([\s\S]*$/,'')+cmSrc+'\nreturn {bkCardPopClose,closeModal};')(
      D.document,win,setTimeout,clearTimeout,sched,undefined);
    const card=D.mk('bk-card-pop',[],null); const cb=D.mk(null,['evo-att-wait'],card); cb.attrs['data-att-at']=String(at);
    const modal=D.mk('modal-bg',[],null); const mb=D.mk(null,['evo-att-wait'],modal); mb.attrs['data-att-at']=String(at);
    return {E,D,win,sched,api,card,modal,live:()=>E.timers.filter(t=>t.live).length};
  }
  { const X=boot(); X.sched(); X.sched(); ok(X.live()===1,'課卡＋明細都在等：只有 1 個計時器');
    X.api.closeModal(); ok(X.live()===1,'只關明細：課卡還在等 → 計時器保留（不誤清）');
    X.api.bkCardPopClose(false); ok(X.live()===0 && !X.win._bkAttTimer,'再關課卡 → 沒有等待按鈕 → 計時器清除'); }
  { const X=boot(); X.sched();
    X.api.bkCardPopClose(false); ok(X.live()===1,'只關課卡：明細還在等 → 計時器保留（不誤清）');
    X.api.closeModal(); ok(X.live()===0,'再關明細 → 計時器清除'); }
  { const X=boot(); X.modal.remove(); X.sched(); ok(X.live()===1,'只有課卡在等');
    X.api.bkCardPopClose(false); ok(X.live()===0,'關課卡 → 計時器清除'); X.api.bkCardPopClose(false); ok(X.live()===0,'重複關閉不出錯'); }
  { const X=boot(); X.sched(); X.card.dataset.closing='1'; X.sched(); ok(X.live()===1,'課卡播關閉動畫中不算等待，但明細仍在等 → 保留');
    X.modal.remove(); X.sched(); ok(X.live()===0,'明細也沒了 → 清除'); }
  })();
}).then(()=>{ console.log(fail?`\n失敗 ${fail} 項`:'\n全部通過'); process.exit(fail?1:0); });
