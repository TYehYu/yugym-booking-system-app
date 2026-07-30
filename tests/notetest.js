/* 課卡備註（2026-07-29）與新增預約步驟 1 的會員／教練連動。
   備註的關鍵風險：bookings.note 同時放著匯入字串（selfVenueLabel 靠它推「跑步機／教室」），
   人工備註不能把它蓋掉，否則自主訓練的場地標示會憑空消失。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(extra?'  → '+extra:''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

function grabBody(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到函式 '+name);
  let d=0,st=false;
  for(let k=src.indexOf('{',i);k<src.length;k++){
    if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){d--; if(st&&d===0) return src.slice(i,k+1);}
  }
  throw new Error('抓不到 '+name+' 的結尾');
}
function grab(startMark,endMark){
  const i=src.indexOf(startMark);
  if(i<0) throw new Error('找不到 '+startMark);
  const j=src.indexOf(endMark,i);
  if(j<0) throw new Error('找不到 '+endMark);
  return src.slice(i,j);
}

/* ── 備註切分／合併 ── */
const noteSrc=grab("const BK_NOTE_SEP=","function bkNoteBlock(");
const {bkNoteSplit,bkNoteJoin}=new Function(noteSrc+'\nreturn {bkNoteSplit,bkNoteJoin};')();

console.log('備註切分／合併');
eq('純人工備註：整段都可編輯', bkNoteSplit('會員肩傷'), {sys:'',user:'會員肩傷'});
eq('純匯入字串：整段列為系統註記、人工段留空',
   bkNoteSplit('舊系統匯入｜教室:跑步機2'), {sys:'舊系統匯入｜教室:跑步機2',user:''});
eq('匯入＋人工：以分隔符拆兩段',
   bkNoteSplit('舊系統匯入｜教室:跑步機2｜備註：遲到 15 分鐘'),
   {sys:'舊系統匯入｜教室:跑步機2',user:'遲到 15 分鐘'});

ok('★ 寫人工備註不會蓋掉匯入註記',
   bkNoteJoin('舊系統匯入｜教室:跑步機2','遲到 15 分鐘')==='舊系統匯入｜教室:跑步機2｜備註：遲到 15 分鐘');
ok('★ 清空人工備註時匯入註記仍在',
   bkNoteJoin('舊系統匯入｜教室:跑步機2','')==='舊系統匯入｜教室:跑步機2');
ok('沒有系統段時就是純備註', bkNoteJoin('','會員肩傷')==='會員肩傷');
ok('前後空白會被修掉', bkNoteJoin('','  會員肩傷  ')==='會員肩傷');

// 反覆編輯不得累積分隔符（存→讀→再存）
let n='舊系統匯入｜教室:跑步機2';
for(const t of ['第一次','第二次','第三次']) n=bkNoteJoin(bkNoteSplit(n).sys,t);
eq('★ 連改三次仍只有一個分隔符', n, '舊系統匯入｜教室:跑步機2｜備註：第三次');
eq('　　且系統段沒被吃掉', bkNoteSplit(n).sys, '舊系統匯入｜教室:跑步機2');

/* selfVenueLabel 仍要能從被加過人工備註的 note 推出教室 */
const svSrc=grab('function selfVenueLabel(','function CAL_isGroupCat(');
const selfVenueLabel=new Function(svSrc+'\nreturn selfVenueLabel;')();
console.log('\n加了人工備註後，場地標示不能消失');
ok('★ 自主訓練「教室:跑步機2」＋人工備註 → 仍標「跑步機」',
   selfVenueLabel({category:'自主訓練',note:'舊系統匯入｜教室:跑步機2｜備註：遲到 15 分鐘'})==='跑步機',
   selfVenueLabel({category:'自主訓練',note:'舊系統匯入｜教室:跑步機2｜備註：遲到 15 分鐘'}));
ok('★ 「教室:教室(代課)」＋人工備註 → 仍標「教室」',
   selfVenueLabel({category:'自主訓練',note:'舊系統匯入｜教室:教室(代課)｜備註：臨時換場'})==='教室');
ok('venue_unit 優先於 note', selfVenueLabel({category:'自主訓練',venue_unit:'multi_1',note:'舊系統匯入｜教室:跑步機2'})==='');

/* ── 步驟 1：會員下拉與教練連動 ── */
const optSrc=grab('const BK_MEM_CAP=','// 教練下拉變更');
const sandbox={window:{},normPhone:s=>String(s||'').replace(/\D/g,''),
  fmtPhone:s=>String(s||''),coachDisp:c=>c.name};
const bkMemberOptsHTML=new Function('window','normPhone','fmtPhone','coachDisp',
  optSrc+'\nreturn bkMemberOptsHTML;')(sandbox.window,sandbox.normPhone,sandbox.fmtPhone,sandbox.coachDisp);

const MEMS=[
  {id:'m1',name:'王小明',phone:'0911111111',default_coach_id:'c1'},
  {id:'m2',name:'李小華',phone:'0922222222',default_coach_id:'c2'},
  {id:'m3',name:'張大同',phone:'0933333333',default_coach_id:'c1'},
  {id:'m4',name:'陳無主',phone:'0944444444',default_coach_id:null},
];
sandbox.window._bkAllMembers=MEMS;
sandbox.window._bkCoaches=[{id:'c1',name:'SANDY'},{id:'c2',name:'MANGO'}];

console.log('\n會員下拉與教練連動');
sandbox.window._bkCoachSel='';
let html=bkMemberOptsHTML('');
ok('沒選教練 → 不分組', !/optgroup/.test(html));
ok('沒選教練 → 四位都在', ['m1','m2','m3','m4'].every(id=>html.includes(`value="${id}"`)));

sandbox.window._bkCoachSel='c1';
html=bkMemberOptsHTML('');
const iMine=html.indexOf('SANDY的會員'), iRest=html.indexOf('其他會員');
ok('★ 選了教練 → 該教練的會員自成一組且排在最上面', iMine>0 && iRest>iMine, `mine=${iMine} rest=${iRest}`);
ok('　　分組標題顯示人數（2 位）', html.includes('SANDY的會員（2）'));
ok('★ 其他會員仍然選得到（沒被濾掉）', html.includes('value="m2"')&&html.includes('value="m4"'));
ok('　　王小明、張大同落在該教練那組',
   html.indexOf('value="m1"')<iRest && html.indexOf('value="m3"')<iRest);

html=bkMemberOptsHTML('張');
ok('搜尋＋分組並用：只留張大同', html.includes('value="m3"')&&!html.includes('value="m1"'));
ok('　　搜不到的組不會留空標題', !/其他會員/.test(html));

html=bkMemberOptsHTML('0922');
ok('可用手機搜尋', html.includes('value="m2"')&&!html.includes('value="m1"'));

sandbox.window._bkCoachSel='c2';
html=bkMemberOptsHTML('');
ok('換教練 → 分組跟著換', html.includes('MANGO的會員（1）')&&html.includes('其他會員（3）'));

/* ── 名單長度上限（2026-07-29 使用者回報「選單會一直變長」） ── */
console.log('\n會員下拉不得無限長');
const MANY=Array.from({length:200},(_,i)=>({id:'x'+i,name:'會員'+i,phone:'09'+String(i).padStart(8,'0'),
  default_coach_id:i<3?'c1':null}));
sandbox.window._bkAllMembers=MANY;

sandbox.window._bkCoachSel='';
html=bkMemberOptsHTML('');
let shown=(html.match(/<option value="x/g)||[]).length;
ok('★ 沒選教練：200 位不會整份攤開', shown<=40, `列出 ${shown} 位`);
ok('★ 被截掉的有明講還有幾位', /還有 160 位，請用左邊搜尋/.test(html), html.slice(-120));

sandbox.window._bkCoachSel='c1';
html=bkMemberOptsHTML('');
ok('★ 該教練的會員一定全列（不被截）',
   ['x0','x1','x2'].every(id=>html.includes(`value="${id}"`)));
shown=(html.match(/<option value="x/g)||[]).length;
ok('★ 其他會員仍受上限保護', shown<=43, `列出 ${shown} 位`);
ok('　　組名顯示的是全部人數、不是截斷後的', html.includes('其他會員（197）'), html.match(/其他會員（\d+）/));

// 已選到的那位即使排在很後面，也必須留在清單裡，否則回上一步會選不回來
html=bkMemberOptsHTML('', 'x199');
ok('★ 已選的會員不會被截斷吃掉', html.includes('value="x199"'));

html=bkMemberOptsHTML('會員199');
ok('搜尋仍找得到被截掉的人', html.includes('value="x199"'));

/* ── 課卡彈出面板：不得再指向已退場的環繞層（2026-07-29「紀蘢無法刪除」） ──
   課卡按鈕從環繞圓鈕 .evc-orbit 改成 #bk-card-pop 的 .mtp-orbs 之後，
   仍寫死 .evc-orbit 的處理器會找不到容器而靜默 return，按了完全沒反應。 */
console.log('\n課卡按鈕不得指向已退場的環繞層');
// 只允許兩處：bkOrbHost 的舊版相容退路、collapseBkCard 的 DOM 清理
const OK_FNS=['bkOrbHost','collapseBkCard'];
const orbitHardcoded=[...src.matchAll(/closest\('\.evc-orbit'\)|querySelector\('\.evc-orbit'\)/g)]
  .map(m=>{
    const before=src.slice(0,m.index);
    const fn=[...before.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].pop();
    return fn?fn[1]:'(頂層)';
  })
  .filter(fn=>!OK_FNS.includes(fn));
ok('★ 沒有處理器再寫死 .evc-orbit', orbitHardcoded.length===0,
   `還在寫死的函式：${orbitHardcoded.join('、')}`);
ok('★ 改用共用的容器解析（新彈窗優先、舊環繞層相容）',
   /function bkOrbHost\(/.test(src) && /\.mtp-orbs, \.evc-orbit/.test(src));
ok('★ 課卡「取消」直接開取消視窗（含 24 小時警示與退課/扣課選擇）',
   /'x','取消'\)/.test(src) && /collapseBkCard\(\);confirmCancelBooking\('\$\{id\}'\)/.test(src));
ok('　　名單／代課面板改吊在彈窗裡', /bkPanelHost\(\) \|\| el/.test(src)
   && /host\.insertAdjacentHTML\('beforeend', html\)/.test(src));
ok('　　且彈窗版面板有自己的樣式（舊樣式只掛在課卡上）',
   /#bk-card-pop \.evc-roster\{/.test(src));

/* ── 合約 PDF 下載（2026-07-29 使用者回報「還是不能下載，會直接跳列印頁面」） ── */
console.log('\n合約要能真的產出 PDF 檔');
ok('★ 不再自動跳列印對話框（改由使用者按鈕決定）',
   /if\(opts&&opts\.auto===true\)/.test(src));
ok('★ 有獨立的「下載 PDF」鈕', /id="ct-dl" onclick="ctSavePdf\(\)"/.test(src));
ok('　　「列印」另外一顆，兩件事分開', /id="ct-pr" class="ghost" onclick="window\.print\(\)"/.test(src));
ok('★ 產檔用 jsPDF + html2canvas（避免內嵌數 MB 中文字型）',
   /html2canvas@1\.4\.1/.test(src) && /jspdf@2\.5\.1/.test(src));
ok('★ 依 A4 可用高度切頁（210×297，邊界 16／18／16mm）',
   /const A4W=210, A4H=297, MARGIN_X=16, MARGIN_TOP=18, MARGIN_BOT=16;/.test(src));
ok('★ 切頁前往上找空白列，不把字攔腰切斷', /function ctCutAt\(/.test(src));
ok('　　有無限迴圈保險絲', /if\(page>40\) break;/.test(src));
ok('　　產檔失敗會退回列印路徑並說明', /請改按「列印」，在印表機選「另存為 PDF」/.test(src));
ok('　　量測用的暫時樣式一定會還原（finally）',
   /\}finally\{[\s\S]{0,220}pg\.style\.width=keep\.w/.test(src));
ok('★ 三個入口都走同一支（檔名帶會員與日期）',
   (src.match(/ctPrintOpen\(ctPdfName\(/g)||[]).length===3);

/* ── 沒綁會員的課：標籤要對（2026-07-29 使用者回報：施佩怡待簽約卡位被標成「體驗」） ── */
const gl=new Function(grabBody('bkGuestLabel')+'\n'+grabBody('bkGuestName')+'\nreturn {bkGuestLabel,bkGuestName};')();
console.log('\n沒綁會員的課（trial_name）標籤');
eq('★ 待簽約卡位 → 待簽約', gl.bkGuestName({trial_name:'施佩怡',category:'私人教練',pending_contract:true}), '施佩怡（待簽約）');
eq('★ 體驗課仍是體驗', gl.bkGuestName({trial_name:'王小明',category:'體驗'}), '王小明（體驗）');
eq('★ 場租是場租', gl.bkGuestName({trial_name:'王媽媽',category:'場租'}), '王媽媽（場租）');
eq('　　認不出身分就只顯示姓名，不亂貼標籤', gl.bkGuestName({trial_name:'某人',category:'私人教練'}), '某人');
eq('　　待簽約優先於類別', gl.bkGuestLabel({category:'體驗',pending_contract:true}), '待簽約');
ok('★ 三處顯示共用同一支（時間軸／卡片／hover 提示）',
   (src.match(/bkGuestName\(b\)/g)||[]).length>=3);
ok('　　不再有寫死的「（體驗）」直接接 trial_name',
   !/b\.trial_name\+'（體驗）'/.test(src) || /b\.category==='體驗'/.test(src));

/* ── 課程類型清單：友善自主訓練／場租不列 ── */
console.log('\n新增預約的課程類型清單');
ok('★ 友善自主訓練已排除', /自主訓練'\s*&&\s*\/友善\/\.test\(t\.name\|\|''\)\) return false/.test(src));
ok('★ 場租已排除', /if\(t\.category==='場租'\) return false/.test(src));
ok('★ 場地租借不再合成進課程卡', !/activeTypes\.concat\(\[BK_FACILITY_TYPE\]\)/.test(src));
ok('場地租借的收款流程仍保留（改由銷售視窗進）', /async function bkStep2Facility\(/.test(src));


/* ── 沒綁票券的預約不該問「是否退回票券」（2026-07-30 使用者回報：8/03 劉雪珠待簽約卡位）── */
console.log('\n取消沒綁票券的預約');
{
  const i=src.indexOf('async function confirmCancelBooking(id){');
  const j=src.indexOf('\n}\n', src.indexOf("askSeriesCancel('${id}','auto')", i))+2;
  const run=(b)=>{ let html='';
    const fn=new Function('dbGet','showToast','showModal','hoursUntilStart','isDeskLike',
      src.slice(i,j)+'\nreturn confirmCancelBooking;')(async()=>b,()=>{},h=>{html=h;},()=>72,()=>true);
    return fn('X').then(()=>html); };
  return Promise.all([
    run({id:'X',date:'2026-08-03',start_time:'16:00',category:'私人教練',pending_contract:true,ticket_id:null,trial_name:'劉雪珠'}),
    run({id:'X',date:'2026-08-03',start_time:'16:00',category:'場租',pending_contract:false,ticket_id:null}),
    run({id:'X',date:'2026-08-03',start_time:'16:00',category:'私人教練',pending_contract:false,ticket_id:null}),
    run({id:'X',date:'2026-08-10',start_time:'16:00',category:'私人教練',pending_contract:false,ticket_id:'MTK-1'}),
  ]).then(([pend,rent,noTk,normal])=>{
    ok('★ 待簽約卡位：不再問退票，說明「還沒收款也沒有票券」',
       !/退回票券/.test(pend) && /這是<b>待簽約卡位<\/b>，還沒收款也沒有票券/.test(pend));
    ok('　　卡位上填的客戶姓名會帶出來', /劉雪珠/.test(pend));
    ok('　　只留一顆「確定取消」', (pend.match(/<button/g)||[]).length===2 && /確定取消/.test(pend));
    ok('★ 場租：說明不涉及票券', /場地租借不涉及票券/.test(rent) && !/退回票券/.test(rent));
    ok('★ 未綁票券的匯入預約：說明不影響堂數', /沒有綁票券/.test(noTk) && !/退回票券/.test(noTk));
    ok('★ 正常有綁票券的預約 → 兩種選擇照舊', /退回票券/.test(normal) && /扣課不退/.test(normal));
    ok('　　判斷條件是「有沒有綁票券」而非只看 pending_contract',
       /const noTicket = !b\.ticket_id;/.test(src));
    ok('　　原因寫在程式裡', /刪除「待簽約卡位」時跳出「是否退回票券」——那種卡位本來就沒有票券/.test(src));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail?1:0);
  });
}

