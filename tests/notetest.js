/* 課卡備註（2026-07-29）與新增預約步驟 1 的會員／教練連動。
   備註的關鍵風險：bookings.note 同時放著匯入字串（selfVenueLabel 靠它推「跑步機／教室」），
   人工備註不能把它蓋掉，否則自主訓練的場地標示會憑空消失。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(extra?'  → '+extra:''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

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

/* ── 課程類型清單：友善自主訓練／場租不列 ── */
console.log('\n新增預約的課程類型清單');
ok('★ 友善自主訓練已排除', /自主訓練'\s*&&\s*\/友善\/\.test\(t\.name\|\|''\)\) return false/.test(src));
ok('★ 場租已排除', /if\(t\.category==='場租'\) return false/.test(src));
ok('★ 場地租借不再合成進課程卡', !/activeTypes\.concat\(\[BK_FACILITY_TYPE\]\)/.test(src));
ok('場地租借的收款流程仍保留（改由銷售視窗進）', /async function bkStep2Facility\(/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
