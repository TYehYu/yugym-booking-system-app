/* 2026-07-30 使用者指示三件事：
   ① 行事曆加「預約模式」：關掉課卡互動，直接點時間格就能排課
   ② 團體課卡只要名單裡有一位是最後一堂，就要顯示驚嘆號
   ③ 回報「代課按鈕失效」—— 按鈕面板改掛 <body> 後，點外收合把它自己當成「點在卡外」 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* ── ③ 代課按鈕失效 ───────────────────────────────── */
console.log('代課按鈕失效（回歸測試）');
{
  const i=src.indexOf('function _bkOutsideClose(e){');
  const j=src.indexOf('\n}', i)+2;
  const mkFn=(card)=>{ let collapsed=false;
    const fn=new Function('window','collapseBkCard', src.slice(i,j)+'\nreturn _bkOutsideClose;')(
      {_expandedBkEl:card}, ()=>{collapsed=true;});
    return {fn,got:()=>collapsed};
  };
  const card={contains:()=>false,getBoundingClientRect:()=>({left:100,top:100,right:200,bottom:160}),querySelectorAll:()=>[]};
  const ev=(inPop,x,y)=>({target:{closest:s=>(inPop&&s==='#bk-card-pop')?{}:null},clientX:x,clientY:y});
  let a=mkFn(card); a.fn(ev(true,600,400));
  ok('★ 點按鈕面板（#bk-card-pop）內 → 不收合，代課才點得動', a.got()===false);
  let b=mkFn(card); b.fn(ev(false,600,400));
  ok('★ 點真正的空白處 → 照樣收合', b.got()===true);
  let c=mkFn(card); c.fn(ev(false,150,130));
  ok('　　點課卡本身 → 不收合', c.got()===false);
  ok('★ 原因寫在程式裡（面板改掛 body 後不在課卡內）',
     /按鈕面板改掛在 <body>（#bk-card-pop）後就不在課卡裡了/.test(src));
  ok('★ bkOrbitSub 拿不到容器時退回明細，不再靜靜什麼都不做',
     /async function bkOrbitSub\(id\)\{\s*\n\s*const el = window\._expandedBkEl;\s*\n\s*if\(!el && !bkPanelHost\(\)\)\{ openBookingDetail\(id\); return; \}/.test(src));
  ok('　　團課簽到名單（bkOrbitRoster）同樣處理',
     /if\(!el && !bkPanelHost\(\)\)\{ openBookingDetail\(id\); return; \}/.test(src)
     && (src.match(/if\(!el && !bkPanelHost\(\)\)/g)||[]).length===2);
  ok('　　兩支都用 bkPanelHost() 當容器', (src.match(/const host = bkPanelHost\(\) \|\| el;/g)||[]).length===2);
}

/* ── ① 預約模式 ───────────────────────────────────── */
console.log('\n預約模式');
ok('★ 行事曆右上有「預約模式」按鈕', /id="cal-bookmode-btn"[\s\S]{0,200}onclick="toggleCalBookMode\(\)"/.test(src));
ok('★ 開啟時按鈕變綠並打勾', /window\._calBookMode\?'btn-green':'btn-ghost'/.test(src)
   && /window\._calBookMode\?'✓ 預約模式':'預約模式'/.test(src));
ok('★ 課卡整層不吃點擊（含拖曳）', /\.cal-bookmode \.cal-ev\{pointer-events:none !important;\}/.test(src));
ok('★ 時間格可點、游標與底色都有提示',
   /\.cal-bookmode \.cal-half:not\(\.cal-half-noadd\)\{cursor:crosshair;/.test(src)
   && /\.cal-bookmode \.cal-half:not\(\.cal-half-noadd\):hover\{background:rgba\(31,111,84,\.15\);\}/.test(src));
ok('　　課卡降低透明度，讓人看得出現在只是背景', /\.cal-bookmode \.cal-ev:not\(\.cal-ev-active\)\{opacity:\.62;\}/.test(src));
ok('★ 上方掛提示條，並可直接結束',
   /預約模式中：課卡暫時不反應點擊，直接點時間格即可新增預約/.test(src)
   && /<button class="btn btn-ghost" onclick="toggleCalBookMode\(\)">結束預約模式<\/button>/.test(src));
ok('★ 切換時先收掉已展開的課卡面板', /if\(window\._calBookMode\) collapseBkCard\(\);/.test(src));
ok('　　保留當前檢視週與捲動位置（不跳回本週、不跳回 08:00）',
   /window\._calScrollTop=_sb\.scrollTop;\s*\n\s*window\._calStepping=true;/.test(src));
ok('　　狀態記在 localStorage，換頁回來還在',
   /localStorage\.setItem\('yugym_cal_bookmode'/.test(src)
   && /localStorage\.getItem\('yugym_cal_bookmode'\)==='1'/.test(src));
ok('　　容器加上 cal-bookmode 類別', /class="cal-wrap\$\{window\._calBookMode\?' cal-bookmode':''\}"/.test(src));
ok('　　營業前的「＋」仍可點（那格本來就是新增用）', /\.cal-bookmode \.cal-early-add\{pointer-events:auto;\}/.test(src));

/* ── ② 團課最後一堂的驚嘆號 ───────────────────────── */
console.log('\n團體課卡的最後一堂提醒');
{
  const i=src.indexOf('function computeLastBkMarks(');
  const j=src.indexOf('\nasync function renderCalendar(', i);
  const body=src.slice(i,j);
  const mk=()=>{ const w={};
    return {w, fn:new Function('window','ymd','TODAY','tkRenewGroup',
      body+'\nreturn computeLastBkMarks;')(w,()=>'2026-07-30',new Date(2026,6,30),()=>'grp')}; };
  const TM={g:{category:'小班肌力',color:'group'}};
  const T=(m,rem,o)=>Object.assign({id:'T'+m,member_id:m,ticket_type_id:'g',status:'usable',
    sessions_total:4,sessions_remaining:rem,purchase_date:'2026-06-01'},o||{});
  const B=(id,d,ids)=>({id,date:d,start_time:'11:00',status:'booked',category:'小班肌力',member_ids:ids,ticket_id:null});

  let a=mk(); a.fn([T('A',0),T('B',2)],[B('b1','2026-07-30',['A','B']),B('b2','2026-08-06',['A','B'])],TM);
  ok('★ 名單裡有一位用完 → 他最晚那堂標驚嘆號（另一位還有堂數也照標）',
     !!a.w._renewLastBk['b2'] && !a.w._renewLastBk['b1']);
  let b=mk(); b.fn([T('A',2),T('B',2)],[B('b1','2026-07-30',['A','B'])],TM);
  ok('★ 全部都還有堂數 → 不標', Object.keys(b.w._renewLastBk).length===0);
  let c=mk(); c.fn([T('A',3,{expire_date:'2026-07-01'})],[B('b1','2026-07-30',['A'])],TM);
  ok('　　已過期的票不算餘額 → 照樣標', !!c.w._renewLastBk['b1']);
  let d=mk(); d.fn([T('A',0),T('B',0)],[B('b1','2026-07-30',['A']),B('b2','2026-08-06',['B'])],TM);
  ok('　　兩人各自最晚的那堂都標', !!d.w._renewLastBk['b1'] && !!d.w._renewLastBk['b2']);
  let e=mk(); e.fn([T('A',0)],[B('b1','2026-07-30',['A']),{...B('b2','2026-08-06',['A']),status:'cancelled'}],TM);
  ok('　　已取消的那堂不算「最晚的一堂」', !!e.w._renewLastBk['b1'] && !e.w._renewLastBk['b2']);
  let f=mk(); f.fn([T('A',0)],[{...B('b1','2026-07-30',['A']),category:'私人教練'}],TM);
  ok('　　非團課不走這條（由票券判定）', Object.keys(f.w._renewLastBk).length===0);
  ok('★ 原因寫在程式裡（團課預約不綁 ticket_id）',
     /團課預約不綁 ticket_id（一筆多位學員，欄位放不下），上面以票券為主軸的判定完全撈不到它/.test(src));
  ok('　　已續約／不續約的標記優先，不會又綠勾又驚嘆號',
     /if\(window\._renewDoneBk\[bid\] \|\| window\._renewNoBk\[bid\]\) return;/.test(src));
  ok('　　驚嘆號本來就不靠票券（團課沒票券也畫得出來）',
     /\$\{bkRenewBadge\(\{done:_renewDone,no:_renewNo,renew:_renewAlert,pay:_payAlert\}\)\}/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
