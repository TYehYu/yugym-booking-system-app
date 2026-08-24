/* 移動課卡卡到場地（2026-07-30 使用者回報：張正怡 7/30 16:00 → 18:00 一直跳錯誤）

   真兇：validateBooking 會在傳入的預約物件上掛暫存欄位 _venueOverflow，
   而拖曳路徑把「同一個物件」直接丟進 dbPut → PostgREST 找不到該欄位，整筆 upsert 失敗。
   只要新時段的首選場地滿了（要擠去次選）就必炸，時段沒滿反而正常 —— 所以看起來時好時壞。

   兩件事要驗：
   1) dbPut 一律濾掉底線開頭的暫存欄位（資料庫沒有這種欄位）。
   2) 會擠到次選場地的移動，四條路徑都要先問過操作者。 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* ── 1. dbPut 濾掉暫存欄位 ───────────────────────────────── */
console.log('dbPut 送出前濾掉暫存欄位');
{
  const i=src.indexOf('async function dbPut(store,obj){');
  const j=src.indexOf('\n}', i)+2;
  let sent=null;
  const sb={from:()=>({upsert:(o)=>{sent=o;return{select:()=>({maybeSingle:async()=>({data:o,error:null})})};}})};
  /* 2026-08-04 精簡欄位讀取後，dbPut 多了「缺欄位先補齊」的護欄 → 這裡補上它的兩個相依。
     dbGet 回 null＝資料庫沒有這一筆（新建情境），護欄不介入，本段原本驗的東西不變。
     護欄本身的行為由 leanselecttest 實跑驗證。 */
  const dbPut=new Function('sb','tbl','dbFriendlyError','dbCacheApply','LEAN_DROP','dbGet',
    src.slice(i,j)+'\nreturn dbPut;')(sb,x=>x,e=>e,()=>{},
    {bookings:['is_substitute','original_coach_id','space_id','resource_id','checkin_source',
      'actor_user_id','operator_employee_id','makeup_status','import_ref']}, async()=>null);

  const bk={id:'IMP-00034',date:'2026-07-30',start_time:'18:00',venue_unit:'group_1',
            _venueOverflow:{fromVid:'multi',toVid:'group',unit:'group_1'}};
  return dbPut('bookings',bk).then(()=>{
    ok('★ _venueOverflow 不會被送進資料庫', !('_venueOverflow' in sent), Object.keys(sent));
    ok('★ 真正的欄位一個都不能少',
       sent.id==='IMP-00034' && sent.venue_unit==='group_1' && sent.start_time==='18:00', sent);
    ok('★ 不改動呼叫端手上的物件（後續程式還在用）', bk._venueOverflow!=null);
    return dbPut('bookings',{id:'x',note:'ok'});
  }).then(()=>{
    ok('　　沒有暫存欄位時原樣送出', sent.id==='x' && sent.note==='ok');
    rest();
  });
}

function rest(){
/* ── 2. 場地被擠 → 一定要讓操作者選 ──────────────────────── */
console.log('\n擠到次選場地時的提示');
ok('★ 拖曳確認框直接標出場地變更（不另跳第二個視窗）',
   /function venueMoveNote\(b\)\{/.test(src)
   && /\$\{venueMoveNote\(b\)\}/.test(src));
{
  const i=src.indexOf('function venueMoveNote(b){');
  const j=src.indexOf('\n}', i)+2;
  const note=new Function('venueName',src.slice(i,j)+'\nreturn venueMoveNote;')
    (u=>({multi_1:'多功能訓練區',group_1:'團課教室',treadmill_1:'跑步機區'}[u]||''));
  eq('沒有溢出就不顯示', note({}), '');
  eq('null 不炸', note(null), '');
  const h=note({_venueOverflow:{fromVid:'multi',toVid:'group'}});
  ok('★ 講清楚「原本要用哪、改用哪」', /多功能訓練區該時段已額滿/.test(h) && /<b>團課教室<\/b>/.test(h));
  ok('　　用品牌紅（場地被改動屬於要注意的事）', /var\(--danger,#b5372e\)/.test(h));
}
ok('★ 週曆拖放：先問過才寫入',
   /if\(b\._venueOverflow && !\(await confirmVenueOverflow\(b,'取消移動'\)\)\)\{ renderWeekTimeline\(\); return; \}/.test(src));
ok('★ 週曆長按移動：先問過才寫入',
   /if\(b\._venueOverflow && !\(await confirmVenueOverflow\(b,'取消移動'\)\)\) return;/.test(src));
ok('★ 明細改時間：先問過才寫入',
   /if\(vbk\._venueOverflow\)\{[\s\S]{0,320}confirmVenueOverflow\(vbk,'取消修改'\)/.test(src));
ok('　　視窗版取消後把明細叫回來，不會變成空白',
   /if\(_inModal\) openBookingDetail\(id\); return false;/.test(src));
ok('　　確認框的否定鈕文案可依情境改（移動時不該寫「取消預約」）',
   /function confirmVenueOverflow\(vbk, noLabel\)\{/.test(src)
   && /\$\{noLabel\|\|'取消預約'\}/.test(src));

/* ── 2b. 沒動到時間就別重新分配場地 ─────────────────────── */
console.log('\n只改備註不該跳場地提示（2026-07-30 使用者指示）');
ok('★ 時間／時長沒動 → 沿用原場地，不讓 validateBooking 重新推派',
   /const _timeMoved = nd!==b\.date \|\| nt!==b\.start_time \|\| ndur!==b\.duration;/.test(src)
   && /const _forceVid = pickedVid \|\| \(!_timeMoved \? \(curVid\|\|null\) : null\);/.test(src)
   && /if\(_forceVid\) vbk\.venue_pref=_forceVid;/.test(src));
ok('★ 下拉明確選了場地就用那個，不自動改派',
   /if\(newVid && newVid!==curVid\)\{ nVenue=`\$\{newVid\}_1`; pickedVid=newVid; \}/.test(src));
ok('★ 指定場地時 allocateVenue 只試那一個 → overflow 必為 false（不會跳提示）',
   /const pri=forceVid\?\[forceVid\]:venuePriorityFor\(category\);/.test(src)
   && /overflow: vid!==primaryVid/.test(src));
ok('　　只改備註時場地原地不動，連編號都不重排',
   /const _keepVenue = !_timeMoved && !pickedVid && !!b\.venue_unit;/.test(src)
   && /if\(_keepVenue\) vbk\.venue_unit=b\.venue_unit;/.test(src));
ok('　　也不會因為場地擠不下而擋住備註存檔',
   /if\(verr && _keepVenue && verr\.indexOf\('場地'\)>=0\) verr=null;/.test(src));
{
  const g=(s,e)=>{const i=src.indexOf(s);return src.slice(i,src.indexOf(e,i)+e.length);};
  const VEN=[{id:'multi',name:'多功能訓練區',cap:3},{id:'treadmill',name:'跑步機區',cap:2},{id:'group',name:'團課教室',cap:1}];
  /* 0824：loadAt 抽成頂層的 venueLoadAt（與「選場地時顯示還有幾位」共用同一份口徑），
     沙箱要一起帶進來，並補它用到的 bkIsGroup／bkIsSelf。 */
  const alloc=new Function('getVenues','venueCap','venuePriorityFor','timeToMin','bkIsGroup','bkIsSelf',
    g('function venueLoadAt(','\n}')+'\n'+g('function allocateVenue(','\n}')+'\nreturn allocateVenue;')(
      ()=>VEN, v=>(VEN.find(x=>x.id===v)||{}).cap||0,
      c=>c==='小班肌力'?['group']:(c==='自主訓練'?['multi','treadmill','group']:['multi','group']),
      t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0);},
      b=>!!b&&b.category==='小班肌力', b=>!!b&&b.category==='自主訓練');
  const day=[
    {id:'BK-19fa308315d574c',start_time:'18:00',duration:60,category:'自主訓練',venue_unit:'multi_2'},
    {id:'BK-ms4u17qlae7h',   start_time:'18:00',duration:60,category:'體驗',    venue_unit:'multi_3'},
    {id:'IMPB-B2026072417744498',start_time:'18:30',duration:60,category:'自主訓練',venue_unit:null},
  ];
  const r=alloc('私人教練',day,1080,1140,'IMP-00034','group');
  ok('★ 張正怡已在團課教室、只改備註 → 指定 group 重驗，不跳提示',
     r.unit==='group_1' && r.overflow===false && !r.error, r);
}

/* ── 3. 迴歸：allocateVenue 對 7/30 現場資料的判定 ───────── */
console.log('\n7/30 現場資料迴歸（張正怡 IMP-00034）');
{
  const g=(s,e)=>{const i=src.indexOf(s);return src.slice(i,src.indexOf(e,i)+e.length);};
  const VEN=[{id:'multi',name:'多功能訓練區',cap:3},{id:'treadmill',name:'跑步機區',cap:2},{id:'group',name:'團課教室',cap:1}];
  const alloc=new Function('getVenues','venueCap','venuePriorityFor','timeToMin','bkIsGroup','bkIsSelf',
    g('function venueLoadAt(','\n}')+'\n'+g('function allocateVenue(','\n}')+'\nreturn allocateVenue;')(
      ()=>VEN, v=>(VEN.find(x=>x.id===v)||{}).cap||0,
      c=>c==='小班肌力'?['group']:(c==='自主訓練'?['multi','treadmill','group']:['multi','group']),
      t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0);},
      b=>!!b&&b.category==='小班肌力', b=>!!b&&b.category==='自主訓練');
  // 當天與 18:00–19:00 有交集的實際預約
  const day=[
    {id:'BK-19fa308315d574c',start_time:'18:00',duration:60,category:'自主訓練',venue_unit:'multi_2'},
    {id:'BK-ms4u17qlae7h',   start_time:'18:00',duration:60,category:'體驗',    venue_unit:'multi_3'},
    {id:'IMPB-B2026072417744498',start_time:'18:30',duration:60,category:'自主訓練',venue_unit:null},
  ];
  const r=alloc('私人教練',day,1080,1140,'IMP-00034',null);
  ok('★ 18:00 可以排，但多功能滿了 → 擠到團課教室',
     r.unit==='group_1' && r.overflow===true && r.fromVid==='multi' && r.toVid==='group', r);
  ok('　　所以它不是錯誤，是要跳確認的情境', !r.error);
  const r2=alloc('私人教練',day.slice(0,2),1080,1140,'IMP-00034',null);
  ok('　　黃雅菁 18:30 那筆沒指定場地，被回推成佔用多功能（多功能因此 3/3 滿）',
     r2.unit && r2.overflow===false, r2);
  ok('★ 配到的編號不會跟現有預約撞號（multi_2、multi_3 已被佔 → 只能是 multi_1）',
     r2.unit==='multi_1', r2);
  ok('★ 撞號會害容量少算一個而超賣，所以要挑「時窗內沒被用到的最小號」',
     /挑「整個時窗內都沒被用到的最小號」/.test(src)
     && !/unit:`\$\{vid\}_\$\{Math\.min\(venueCap\(vid\),peak\+1\)\}`/.test(src));
  {
    const day2=[{id:'a',start_time:'10:00',duration:60,category:'私人教練',venue_unit:'multi_1'}];
    ok('　　只佔 multi_1 時排 multi_2', alloc('私人教練',day2,600,660,'X',null).unit==='multi_2');
    ok('　　沒人佔就從 1 號開始', alloc('私人教練',[],600,660,'X',null).unit==='multi_1');
    const day3=[{id:'a',start_time:'10:00',duration:60,category:'私人教練',venue_unit:'multi_1'},
                {id:'b',start_time:'10:30',duration:60,category:'私人教練',venue_unit:'multi_2'}];
    ok('　　跨半小時錯開的也算佔號（10:30 那筆與時窗有交集）',
       alloc('私人教練',day3,600,660,'X',null).unit==='multi_3');
    ok('　　時間完全不重疊的不佔號',
       alloc('私人教練',[{id:'a',start_time:'08:00',duration:60,category:'私人教練',venue_unit:'multi_1'}],600,660,'X',null).unit==='multi_1');
  }
}

console.log('\n忙碌回饋與即時更新（2026-08-07 使用者回報：「場地變更也沒有即時更新」）');
ok('★ 換場地時顯示忙碌狀態（要重跑一次容量檢查，會停一下）',
   /const done=cxBusy\('更換中…'\);/.test(src));
ok('★ 換完之後底下那一頁也重畫（原本只重開明細，行事曆還是舊場地）',
   /await openBookingDetail\(id\);/.test(src)
   && /window\._calStepping=true; navTo\(CUR_PAGE, CUR_GROUP\);/.test(src));
ok('　　重畫吃快取、0 網路等待（寫入時已就地更新）',
   /寫入時 dbCacheApply 已就地更新快取，所以是 0 網路等待/.test(src));
ok('　　每一條失敗路徑都會收掉忙碌狀態',
   /if\(!b\)\{done\(\);showToast\('找不到預約'\);return;\}/.test(src)
   && /if\(err\)\{ done\(\); showToast\('無法更換：'\+err\); return; \}/.test(src)
   && /\}catch\(e\)\{ done\(\); showToast\('更換失敗：/.test(src));

/* 2026-08-24 使用者回報：「點這堂課的標題卡，沒有更改場地的選項」——
   待簽約／空堂那條路的 acts 是手作的物件，從來沒有 venue 這個鍵。
   0820 當時待簽約還是少數狀況；會員改從課卡的［＋新增］安排之後，
   空堂變成建立預約的常態產物，「建好才發現場地要換」一定會發生。 */
console.log('\n待簽約／空堂的標題卡也要給得出「更換場地」');
ok('★★ 手作的 acts 補上 venue（條件與主路徑的 _editable 一字不差）',
   /const _pendVenue=\(\(staff\|\|own\) && !closed && String\(b\.date\)>=ymd\(TODAY\) && !bkIsCoachLeave\(b\)\)\s*\n\s*\? \(bkIsSelf\(b\)\?'self':'any'\) : null;/.test(src)
   && /editable:false,\s*\n\s*venue:_pendVenue\}\);/.test(src));
ok('★ editable 本身維持 false（它還管代課與團課人數，那兩件事沒有要一起開）',
   /editable:false,/.test(src)
   && /它還管著代課與團課人數，那兩件事沒有要一起開/.test(src));
ok('★ 兩種課別各走各的入口（自主訓練有跑步機台數 → bkOrbitVenue）',
   /if\(!_leave && A\.venue==='self'\) rows\+=row\(`closeModal\(\);bkOrbitVenue\('\$\{b\.id\}'\)`,'更換場地'/.test(src)
   && /else if\(!_leave && A\.venue==='any'\) rows\+=row\(`ashBackArm\('\$\{b\.id\}'\);closeModal\(\);openVenueChange\('\$\{b\.id\}','ash'\)`,'更換場地'/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
}
