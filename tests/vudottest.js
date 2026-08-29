/* 預約明細：場地旁邊的單位燈號開關（2026-07-31 使用者指示）

   「像今天下午五點的客人黃麗琴，我點開明細，場地旁邊要有燈號開關讓我選。」

   跑步機是「一個場地兩台」，一對二的客人可能一張票就佔掉兩台。
   灰＝可預約（可點，點了就改到那一台）、綠＝已預約、金框＝本堂目前用的那一台。
   只有兩台以上的場地才畫（教室只有一間，沒得選）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 實跑 venueUnitDots：把 dbGetAll 換成假資料 */
const mk=(BK)=>new Function('dbGetAll','timeToMin','venueCap','venuePriorityFor','venueName','venueAllowsMultiUnit',
  g('async function venueUnitDots(b, editable){','\n}\n')+'\nreturn venueUnitDots;')(
  async()=>BK,
  t=>{const[h,m]=String(t||'0:0').split(':').map(Number);return h*60+(m||0);},
  v=>({multi:3,treadmill:2,group:1}[v]||0),
  c=>c==='自主訓練'?['multi','group','treadmill']:['multi','group'],
  u=>({multi:'多功能訓練區',treadmill:'跑步機',group:'團課教室'}[String(u).split('_')[0]]||u),
  vid=>String(vid)==='treadmill');   // 2026-08-01：燈號只出現在跑步機

const SELF=(o)=>Object.assign({id:'B0',category:'自主訓練',date:'2026-07-31',start_time:'17:00',duration:60,venue_unit:'treadmill_1'},o);
const T=(u,t,o)=>Object.assign({id:u+t,date:'2026-07-31',status:'booked',venue_unit:u,start_time:t,duration:60},o||{});
/* 2026-08-12 使用者指示：「這邊改成兩個按鈕 一台 兩台」——逐台燈號（vu-dot）退場，
   改成「一台／兩台」台數按鈕（bkSetVenueUnits）。斷言改讀按鈕狀態：
   on＝綠底（目前台數）、dis＝不可按（另一台被別人佔走）、''＝可點。 */
const btns=h=>[...String(h).matchAll(/<button type="button" class="btn btn-ghost btn-sm"[\s\S]*?<\/button>/g)]
  .map(m=>m[0]).map(s=>(/ disabled/.test(s)?'dis':(/background:var\(--green\)/.test(s)?'on':'')));

(async()=>{
console.log('畫幾顆按鈕、什麼狀態（2026-08-12 改成「一台／兩台」按鈕）');
{
  let h=await mk([])(SELF(),true);
  eq('★ 跑步機畫兩顆', btns(h), ['on','']);   // 2026-08-12：燈號→台數按鈕；目前 1 台＝「一台」綠底
  ok('　　本堂台數綠底（on）、另一顆是可點的開關',
     /onclick="bkSetVenueUnits\('B0',2\)"/.test(h)
     && /同行使用，第 2 台不另外扣點/.test(h));   // 2026-08-12：開第 2 台改走 bkSetVenueUnits
  /* 2026-08-12 使用者指示：按鈕寫「一台／兩台」（要的是結果台數，不是機台編號） */
  ok('★ 按鈕標台數不標機台編號（一台／兩台）',
     />一台<\/button>/.test(h) && />兩台<\/button>/.test(h) && !/>[12]<\/(span|button)>/.test(h));

  h=await mk([T('treadmill_2','17:00')])(SELF(),true);
  eq('★ 另一台被別人約走 → 「兩台」不可按', btns(h), ['on','dis']);   // 2026-08-12：taken 燈→disabled 按鈕
  ok('　　不可按的那顆有講原因', /另一台已被其他預約佔用/.test(h));

  h=await mk([])(SELF({venue_unit:'treadmill_2'}),true);
  eq('　　本堂在 2 號 → 台數不變仍是「一台」綠底（按鈕不分機台）', btns(h), ['on','']);   // 2026-08-12：金框跟台跑的概念退場
}

/* 2026-08-01 使用者指示：「更換場地的燈號按鈕只要出現在選擇跑步機的時候，
   因為有開放一張自主訓練預約兩台跑步機的功能，會員可以選擇要一台還是兩台」。
   多功能訓練區的 3 個位子是「同時容納 3 個人」，不是同一張預約佔 3 個 —— 在那裡畫燈號是誤導。 */
console.log('\n只在跑步機畫（2026-08-01 收斂）');
{
  ok('★ 跑步機 → 畫兩顆', btns(await mk([])(SELF({venue_unit:'treadmill_1'}),true)).length===2);   // 2026-08-12：改數按鈕
  eq('★ 多功能訓練區 → 不畫（3 個位子是 3 個人，不是一張預約佔 3 個）',
     await mk([])(SELF({venue_unit:'multi_2'}),true), '');
  eq('★ 團課教室只有一間 → 不畫', await mk([])(SELF({venue_unit:'group_1'}),true), '');
  eq('　　沒有 venue_unit 時看課種的第一順位（自主訓練＝多功能）→ 不畫',
     await mk([])(SELF({venue_unit:null}),true), '');
  eq('　　沒有日期／時間不畫', await mk([])(SELF({start_time:null}),true), '');
}

console.log('\n佔用的判定');   /* 2026-08-12：斷言改讀「一台／兩台」按鈕狀態（on/dis/可點） */
{
  eq('　　別的時段不算', btns(await mk([T('treadmill_2','15:00')])(SELF(),true)), ['on','']);
  eq('　　跨時段重疊要算（16:30 的 60 分課壓到 17:00）',
     btns(await mk([T('treadmill_2','16:30')])(SELF(),true)), ['on','dis']);
  eq('　　已取消的不算', btns(await mk([T('treadmill_2','17:00',{status:'cancelled'})])(SELF(),true)), ['on','']);
  eq('　　別的場地不算', btns(await mk([T('multi_1','17:00')])(SELF(),true)), ['on','']);
  eq('★ 舊資料沒編號（venue_unit=treadmill）→ 仍算佔走一台（「兩台」不可按）',
     btns(await mk([T('treadmill','17:00')])(SELF({venue_unit:'treadmill_1'}),true)), ['on','dis']);
  eq('　　自己那筆不會算成佔用', btns(await mk([SELF()])(SELF(),true)), ['on','']);
  eq('★ 同一組的第二台也算「自己的」（目前台數＝2，「兩台」綠底）',
     btns(await mk([{id:'B9',date:'2026-07-31',status:'booked',venue_unit:'treadmill_2',
                     start_time:'17:00',duration:60,sibling_of:'B0'}])(SELF(),true)), ['','on']);
}

console.log('\n名額：亮幾個燈就佔幾台（2026-07-31 使用者確認）');
{
  const g2=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const code=g2('window.VENUES = window.VENUES || [','\n}\n')+'\n'
    +g2('function venuePriorityFor(category){','\n}\n')+'\n'
    +g2('function venueLoadAt(others, inst){','\n}\n')+'\n'
    +g2('function venuePrepAt(others, ns, ne, includeGrace){','\n}\n')+'\n'
    +g2('function allocateVenue(category, sameDay, ns, ne, selfId, forceVid){','\n}\n');
  /* 2026-08-29：allocateVenue 開始問口袋的 prepMin（團課開課前 15 分鐘要清場），
     沙箱要一起帶 venuePrepAt 與真的 bkPocketNow（見 tests/_pocketenv.js —— 
     在這裡自己寫一個假口袋等於把規則抄第二份）。 */
  const alloc=new Function('window','timeToMin','bkIsGroup','bkIsSelf','bkPocketNow','minToTime', code+'\nreturn allocateVenue;')({}, t=>{const[h,m]=String(t).split(':').map(Number);return h*60+(m||0);}, b=>!!b&&b.category==='小班肌力', b=>!!b&&b.category==='自主訓練', require('./_pocketenv.js').bkPocketNow, m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'));
  const B=(u,extra)=>Object.assign({id:u,venue_unit:u,start_time:'17:00',duration:60,category:'自主訓練'},extra||{});
  ok('★ 只亮一個燈 → 還有一個名額，別人約得到',
     !!alloc('自主訓練',[B('treadmill_2')],1020,1080,null,'treadmill').unit);
  ok('★ 兩個燈都亮 → 別人約不到（額滿）',
     !!alloc('自主訓練',[B('treadmill_2'),B('treadmill_1',{sibling_of:'treadmill_2'})],1020,1080,null,'treadmill').hardFull);
  ok('　　同行那筆是真的預約，佔位邏輯不必特別處理它（venue_unit 有值就算數）',
     /if\(!x\.venue_unit \|\| String\(x\.venue_unit\)\.split\('_'\)\[0\]!==vid\) return;/.test(src));
}

console.log('\n行事曆上是一張卡，不是兩張（2026-07-31 使用者回報）');
{
  const merge=new Function(g('function mergeSiblingUnits(list){','\n}\n')+'\nreturn mergeSiblingUnits;')();
  const L=[{id:'A',venue_unit:'treadmill_2'},{id:'S1',sibling_of:'A',venue_unit:'treadmill_1'},{id:'B',venue_unit:'multi_1'}];
  const out=merge(L);
  eq('★ 同行那筆不另外畫卡', out.map(x=>x.id), ['A','B']);
  eq('★ 主卡記下佔幾台', out[0]._units, 2);
  eq('　　沒有同行的維持原樣（不多加 _units）', out[1]._units, undefined);
  eq('　　三台也算得對', merge([{id:'A'},{id:'S1',sibling_of:'A'},{id:'S2',sibling_of:'A'}])[0]._units, 3);
  eq('　　空陣列／null 不會爆', [merge([]).length, merge(null).length], [0,0]);
}
/* 2026-08-05 使用者指示：「不要用燈號顯示了，直接顯示跑步機・一台或兩台」 */
ok('★ 台數改文字（跑步機・一台／兩台），燈號退場',
   /function venueUnitsLabel\(b\)\{/.test(src)
   && /return '跑步機・'\+\(NUM\[n\]\|\|\(n\+' 台'\)\);/.test(src)   /* 2026-08-18 抽出 NUM（訓練架多台共用） */
   && !/'●'\.repeat\(b\._units\)/.test(src));
ok('★ 四個畫課卡的地方都併卡：桌機行事曆／手機週檢視／首頁任務／桌機日檢視',
   /function mergeGroupBookings\(list\)\{\s*\n\s*list=mergeSiblingUnits\(list\);/.test(src)
   && (src.match(/mergeSiblingUnits\(bookings\.filter/g)||[]).length===3);
ok('　　兩個畫場地標籤的地方都改走 venueUnitsLabel',
   (src.match(/venueUnitsLabel\(b\)/g)||[]).length>=2);
ok('　　原因寫在程式裡', /一堂佔兩台跑步機是兩筆預約（venue_unit 一筆只存得下一台），但行事曆上應該是\s*\n\s*一張卡/.test(src));

console.log('\n只有櫃檯能開兩台（2026-07-31 使用者定案）');
ok('★ 會員自己一次只能約一個名額，兩台請洽櫃檯',
   /這是\*\*櫃檯專屬\*\*的操作（同日使用者定案）：會員自己在 App 只能一次約一個名額/.test(src));
ok('★ 理由寫在程式裡（避免一人占掉多筆，對其他會員不公平）',
   /避免一個人一次占掉多筆預約，對其他會員不公平/.test(src));
ok('★ 會員端沒有「兩台」的入口（自助預約的確認視窗只選場地，不選台數）',
   !/p_venue_unit2/.test(src));

console.log('\n手機點課卡時背景淡化（2026-07-31 使用者指示）');
/* 2026-08-05 使用者指示（附截圖）：點出卡片時後面頁面一律淡化——收回 07-29「桌機透明」。 */
ok('★ 課卡彈窗遮罩一律壓暗（桌機手機同款）',
   /#bk-card-pop \.mtp-back\{position:fixed;inset:0;z-index:9800;background:rgba\(20,18,14,\.34\);\}/.test(src)
   && !/#bk-card-pop \.mtp-back\{background:transparent;\}/.test(src));
ok('　　點遮罩仍可關閉', /<div class="mtp-back" onclick="collapseBkCard\(\)"><\/div>/.test(src));

console.log('\n權限');
{
  /* 2026-08-12 改按鈕後：不可編輯時不畫按鈕——1 台什麼都不顯示、2 台只顯示「使用 2 台」文字 */
  const h1=await mk([])(SELF(),false);
  const h2=await mk([{id:'B9',date:'2026-07-31',status:'booked',venue_unit:'treadmill_2',
                      start_time:'17:00',duration:60,sibling_of:'B0'}])(SELF(),false);
  ok('★ 不可編輯時只顯示、不給點', !/<button/.test(h1) && !/<button/.test(h2)
     && h1==='' && /使用 2 台/.test(h2));
}

console.log('\n接到明細裡');
ok('★ 模板不能 await → 先算好再帶進去',
   /const _vuDots=\(typeof venueUnitDots==='function'\)\?await venueUnitDots\(b, editable\):'';/.test(src));
/* 2026-08-03 排列定版：下方重複的場地列退場，剩三處（PT/團課體驗/通用） */
ok('★ 三處場地列都掛上', (src.match(/\$\{_vuDots\}/g)||[]).length===3);
/* 2026-07-31 二修（使用者定案）：燈號改成開關，一堂可以佔兩台 */
ok('★ 點燈號 → 開關這一台', /async function bkToggleVenueUnit\(id, unit\)\{/.test(src));
ok('★ 打開＝建一筆「同行使用」的預約，不綁票不扣點',
   /ticket_id:null, ticket_type_id:b\.ticket_type_id\|\|null,/.test(src)
   && /note:`同行使用（\$\{venueName\(vid\)\}）・不另外扣點`/.test(src));
ok('★ 關掉＝取消那一筆；至少要留一台',
   /if\(hit\.id===root\)\{ showToast\('至少要留一台；要收掉這一堂請用「取消預約」'\); return; \}/.test(src));
ok('★ 同一組用 sibling_of 串起來', /sibling_of:root,/.test(src)
   && /const root=b\.sibling_of\|\|b\.id;/.test(src));
ok('★ 開之前確認沒被別人搶走', /showToast\('這一台剛被別人約走了'\); openBookingDetail\(id\); return;/.test(src));
ok('★ 教練不能動別人的課', /if\(typeof coachOwnsBk==='function' && !coachOwnsBk\(b\)\)\{ showToast\('這不是你的課，只能查看'\); return; \}/.test(src));
ok('　　改完重開明細並重繪行事曆', /openBookingDetail\(id\);\s*\n\s*if\(typeof navTo==='function' && \(CUR_PAGE==='calendar'\|\|CUR_PAGE==='g_dashboard'\)\) navTo\(CUR_PAGE\);/.test(src));
ok('　　存檔失敗會講原因', /showToast\('儲存失敗：'\+\(\(e&&e\.message\)\|\|e\)\)/.test(src));
ok('　　樣式：灰底可點、綠底已預約、金框本堂',
   /\.vu-dot\.taken\{background:var\(--green,#1f6f54\);border-color:var\(--green,#1f6f54\);color:#fff;\}/.test(src)
   && /\.vu-dot\.cur\{box-shadow:0 0 0 2px var\(--gold-d,#b48a56\);\}/.test(src)
   && /button\.vu-dot\{cursor:pointer;\}/.test(src));
ok('　　讀不到資料不會讓明細開不起來（整段包 try）', /\}catch\(_\)\{ return ''; \}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
