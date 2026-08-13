/* 票卡口袋（2026-07-31 使用者定案）

   「票卡夾分成五個口袋，分別裝 教練課／團體課／自主訓練／運動按摩／折價券，
     因為每種票券規則都不一樣。」「我希望接下來不要再重複找問題。」

   這支測試做三件事：
     ① 規則有主人 —— 每個口袋的差異寫在 TK_POCKETS，不是散在程式裡的 if
     ② 分類器守得住真實陷阱 —— 折價券掛在別的類別底下、團課靠 plan_name 認
     ③ 棘輪 —— 擋住新增的散裝課別比較，逼下一個人去問口袋而不是再寫一個 if

   ③ 是「不要再重複找問題」的實作：規則散開是所有重複問題的共同成因。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const _pi=src.indexOf('const TK_POCKETS={');
const api=new Function(src.slice(_pi, src.indexOf('\nfunction tkClass5(',_pi))
  +'\n'+grabFn('tkClass5')+'\n'+grabFn('seatNo')+'\n'+grabFn('makeupKey')
  +'\nreturn {TK_POCKETS,TK5,tkPocket,bkPocket,tkClass5,makeupKey};')();
const {TK_POCKETS,TK5,tkPocket,bkPocket,tkClass5,makeupKey}=api;

/* 正式庫真實票種 */
const TYPES={
  'tt-pt':        {id:'tt-pt',        name:'私人教練課', category:'私人教練', color:'pt'},
  'tt-fr':        {id:'tt-fr',        name:'友善教練課', category:'私人教練', color:'friendly'},
  'tt-mqdt4ubv8e5i':{id:'tt-mqdt4ubv8e5i',name:'團體課', category:'小班肌力', color:'group'},
  'tt-mqdt55uosz5n':{id:'tt-mqdt55uosz5n',name:'自主訓練', category:'自主訓練', color:'self'},
  'tt-ms':        {id:'tt-ms',        name:'運動按摩',   category:'運動按摩', color:'massage'},
  /* ⚠ 折價券掛在「私人教練」與「運動按摩」類別底下 —— 不先攔就會被歸錯口袋 */
  'tt-discount-pt300':{id:'tt-discount-pt300',name:'教練課折抵300',   category:'私人教練', color:'pt'},
  'tt-discount-ms300':{id:'tt-discount-ms300',name:'運動按摩折抵300', category:'運動按摩', color:'massage'},
};
const P=(o)=>tkPocket(o,TYPES).key;

console.log('五個口袋');
eq('★ 順序與名稱（分頁、列表欄位都吃這一組）', TK5,
   [['pt','教練課'],['group','團體課'],['self','自主訓練'],['massage','運動按摩'],['voucher','折價券']]);
ok('★ 每個口袋都有完整的規則欄位', Object.keys(TK_POCKETS).every(k=>{
  const p=TK_POCKETS[k];
  return ['key','label','unit','isCourse','stampFrom','perSeat','sharedBooking',
          'canShare','canExtend','canInstall','coachLeave','memberLeave','grantsOnCheckin']
    .every(f=>Object.prototype.hasOwnProperty.call(p,f));
}));
eq('★ 單位不同：堂／點／張', Object.keys(TK_POCKETS).map(k=>TK_POCKETS[k].unit),
   ['堂','堂','點','堂','張']);

console.log('\n分類：真實陷阱');
eq('★ 折價券掛在「私人教練」類別下 → 仍歸折價券', P({ticket_type_id:'tt-discount-pt300'}), 'voucher');
eq('★ 折價券掛在「運動按摩」類別下 → 仍歸折價券（不會混進按摩）', P({ticket_type_id:'tt-discount-ms300'}), 'voucher');
eq('★ 只有名稱帶「折抵」也認得', P({ticket_type_id:'tt-pt',plan_name:'課程折抵票券'}), 'voucher');
eq('★ 團體課票種的 category 是「小班肌力」，不是「團體課」', P({ticket_type_id:'tt-mqdt4ubv8e5i'}), 'group');
eq('★ 沒帶票種、只有 plan_name 帶「團」字（匯入票）', P({plan_name:'團課 4週優惠'}), 'group');
eq('★ 補課券也是團體課這個口袋', P({ticket_type_id:'tt-mqdt4ubv8e5i',plan_name:'團體課・補課券'}), 'group');
eq('　　友善教練課歸教練課', P({ticket_type_id:'tt-fr',plan_name:'友善教練課 1V2'}), 'pt');
eq('　　自主訓練點數', P({ticket_type_id:'tt-mqdt55uosz5n'}), 'self');
eq('　　運動按摩', P({ticket_type_id:'tt-ms',plan_name:'運動按摩 5 堂'}), 'massage');
eq('　　什麼都認不出來 → 落教練課（最大宗）', P({plan_name:'???'}), 'pt');
eq('★ 課卡也能問口袋（課卡沒有 plan_name，用 category）',
   bkPocket({category:'小班肌力',ticket_type_id:'tt-mqdt4ubv8e5i'},TYPES).key, 'group');
eq('　　課卡：自主訓練', bkPocket({category:'自主訓練'},TYPES).key, 'self');

console.log('\n規則差異（每一條都是真實決策，不是猜的）');
eq('★ 團體課是逐名額的（同一人可佔多個名額）', TK_POCKETS.group.perSeat, true);
eq('★ 團體課一張課卡多位學員（member_ids）', TK_POCKETS.group.sharedBooking, true);
eq('★ 團體課的課卡不綁 ticket_id → 只能靠扣課紀錄', TK_POCKETS.group.stampFrom.indexOf('direct'), -1);
eq('★ 教練課預約當下就綁 ticket_id', TK_POCKETS.pt.stampFrom.indexOf('direct')>=0, true);
/* 2026-08-08 使用者定案：「課程如果是因為"教練請假"該堂課該方案期限延長一週，
   如果是會員請假才給補課券」→ 團課也有教練請假了，但做法不同（整堂取消，不是改自主訓練）。 */
eq('★ 教練請假只有教練課與團體課有（按摩／自主訓練／體驗都沒有）',
   Object.keys(TK_POCKETS).filter(k=>TK_POCKETS[k].coachLeave), ['pt','group']);
eq('★★ 兩種做法分得清楚：教練課改自主訓練、團課整堂取消',
   [TK_POCKETS.pt.coachLeave, TK_POCKETS.group.coachLeave], ['self','cancel']);
eq('★ 逐人請假發補課券只有團體課有',
   Object.keys(TK_POCKETS).filter(k=>TK_POCKETS[k].memberLeave), ['group']);
eq('★ 運動按摩不設請假（跟教練另約時間、直接取消）',
   [TK_POCKETS.massage.coachLeave,TK_POCKETS.massage.memberLeave], [false,false]);
eq('★ 自主訓練點數效期 7 天、過期即作廢（不可展延）',
   [TK_POCKETS.self.expiryDays,TK_POCKETS.self.canExtend], [7,false]);
eq('★ 自主訓練一堂可扣多點（120 分＝2 點）', TK_POCKETS.self.multiPerBooking, true);
eq('★ 自主訓練有限時段票（友善點限平日 18:00 前）', TK_POCKETS.self.timeRestricted, true);
eq('★ 折價券不是一堂課：不蓋章、不進「剩幾堂」',
   [TK_POCKETS.voucher.isCourse, TK_POCKETS.voucher.stampFrom.length], [false,0]);
eq('★ 共享只給課程票券（點數與折價券不共享）',
   Object.keys(TK_POCKETS).filter(k=>TK_POCKETS[k].canShare), ['pt','group']);
eq('★ 分期只有教練課', Object.keys(TK_POCKETS).filter(k=>TK_POCKETS[k].canInstall), ['pt']);
eq('★ 簽到發自主訓練點數的只有教練課',
   Object.keys(TK_POCKETS).filter(k=>TK_POCKETS[k].grantsOnCheckin), ['pt']);
ok('　　跨口袋的動作寫在規則裡，不在各自口袋重做一次',
   /口袋不是互不相干的：教練課簽到會發自主訓練點數、團課的「會員請假」會發補課券、\n\s*「教練請假」則一律展延效期/.test(src));

console.log('\n補課券逐名額（2026-07-31 使用者回報：兩個名額都請假只發一張）');
eq('★ 第 1 個名額沿用課卡 id（舊資料不動）', makeupKey('IMP-00015','MEM-A'), 'IMP-00015');
eq('★ 第 2 個名額加 #2', makeupKey('IMP-00015','MEM-A#2'), 'IMP-00015#2');
eq('★ 第 3 個名額加 #3', makeupKey('IMP-00015','MEM-A#3'), 'IMP-00015#3');
eq('　　沒帶名額鍵＝第 1 個', makeupKey('IMP-00015'), 'IMP-00015');
ok('★ 發放與收回都用名額鍵當防重複的鍵',
   /&& t\.makeup_for_booking===_key && t\.member_id===_mid\);/.test(src)
   && /t\.makeup_for_booking===_key && t\.member_id===memberId\);/.test(src));
ok('★ 請假／取消請假都把名額鍵傳下去',
   /const tk=await grantMakeupTicket\(b,mid,sk\);/.test(src)
   && /const n=await revokeMakeupTicket\(b,mid,sk\);/.test(src));
ok('　　鍵沿用既有欄位，不另存一份',
   /鍵沿用既有的 makeup_for_booking 欄位、不另存一份/.test(src));
ok('　　為什麼會漏，寫在程式裡',
   /2026-07-30 出席狀態改成名額鍵之後，同一位會員在同一堂課本來就可能\s*\n\s*需要兩張補課券，舊的鍵把第二張擋掉了/.test(src));

/* ═══ 棘輪：擋住規則再度散開 ═══════════════════════════════════════
   規則散在各處是所有「同一個問題換個畫面又出現」的共同成因。
   這道門檻只能往下走：要新增課別判斷，請加在 TK_POCKETS 並問 tkPocket()／bkPocket()，
   不要再寫一個 category==='小班肌力'。
   （真的需要提高門檻時，請連同「為什麼這條非散不可」一起寫進註解再調整基準。） */
console.log('\n第一批搬遷（2026-07-31）：團體課的規則');
eq('★ 體驗與場租不吃票、不屬於任何口袋', bkPocket({category:'體驗'},TYPES), null);
eq('　　場租也是', bkPocket({category:'場租'},TYPES), null);
ok('★ 「這位會員的課卡」抽成共用（原本抄在九個地方）',
   /function bkHasMember\(b, mid\)\{/.test(src) && /function bkOfMember\(bookings, mid\)\{/.test(src)
   && /function bkSeatCount\(b, mid\)\{/.test(src));
ok('★ 九個呼叫點都改吃共用（不再各自拼 member_id / member_ids）',
   (src.match(/member_ids\.includes\(/g)||[]).length<=3);
ok('　　為什麼要抽，寫在程式裡',
   /這個判斷原本被抄在九個地方，\s*\n\s*每次有人只改其中幾處就出事/.test(src));
ok('★ 教練請假改問口袋（不再自己比 category）',
   /function bkCoachLeaveMode\(b\)\{ const v=b\?bkPocketNow\(b\)\.coachLeave:null; return v===true\?'self':\(v\|\|null\); \}/.test(src)
   && /function canCoachLeave\(b\)\{ return !!b && !!bkCoachLeaveMode\(b\); \}/.test(src));
ok('★ 展延改問口袋 —— 自主訓練點數過期不能展延（2026-07-31 使用者指示）',
   /if\(!tkPocketNow\(t\)\.canExtend\) return false;/.test(src)
   && /自主訓練點數過期不能展延（效期本來就只有 7 天、簽到贈送，/.test(src));
ok('　　按不到時說得出原因（不是只說「不符合條件」）',
   /`\$\{tkPocketNow\(t\)\.label\}不提供展延`/.test(src));

console.log('\n「是不是團課」收成一支（82 處 → 1 處）');
/* 剩下的 .category==='小班肌力' 是在判「票種」的類別（t=ticket_type），那是另一回事；
   課卡（b）上的判斷只剩 bkIsGroup 定義裡那一句。
   2026-08-13 更新：2026-08-11 張傅凱案（舊匯入團課沒 ticket_type_id）在 _saveGroupMembers
   加了一句自癒補票種的判斷 —— 語境是「已知團課且缺票種才動手」，與定義同格式、原地有註解，
   放行為第 2 句；除這兩句外不得再增。 */
ok('★ 課卡上只剩定義與自癒補票種那兩句在比字串',
   (src.match(/\bb\.category==='小班肌力'/g)||[]).length===2
   && /if\(b && b\.category==='小班肌力'\) return true;/.test(src)
   && /if\(b && !b\.ticket_type_id && b\.category==='小班肌力'\)\{/.test(src));
ok('★ 定義本身仍問口袋（票種帶進來時也認得）',
   /return !!bkPocketNow\(b\)\.sharedBooking;/.test(src));
ok('★ 對照表有快取（每一筆課卡都會呼叫，重建會拖垮清單頁）',
   /function typeMapNow\(\)\{/.test(src) && /if\(_tmNowSrc!==c\)\{ _tmNowSrc=c;/.test(src));
ok('　　為什麼要抽，寫在程式裡',
   /原本這句話被寫了 88 次，\s*\n\s*規則一改就得逐句找/.test(src));

console.log('\n第二批（2026-07-31）：自主訓練與運動按摩');
ok('★ 「是不是自主訓練」也收成一支（34 處 → 1 處）',
   /function bkIsSelf\(b\)\{/.test(src)
   && (src.match(/\bb\.category==='自主訓練'/g)||[]).length===1);
ok('★ 運動按摩同樣', /function bkIsMassage\(b\)\{/.test(src)
   && (src.match(/\bb\.category==='運動按摩'/g)||[]).length===1);
ok('　　為什麼自主訓練差最多，寫在程式裡',
   /單位是「點」不是「堂」、效期 7 天、120 分扣 2 點/.test(src));

console.log('\n棘輪：散裝的課別比較不得增加');
/* 2026-07-31 立基準 210 → 第一批（團體課 bkIsGroup）129 → 第二批（自主訓練／運動按摩）95。
   之後每搬一批就把這個數字調低，只能往下。
   2026-08-13 調整 95 → 99（+4，皆屬「非散不可」並在原地有註解）：
   ・2026-08-11 _saveGroupMembers 自癒補票種 2 處 —— 一處判課卡缺票種（上面已放行）、
     一處在 window._ttCache 裡找團課「票種」（t.category，本來就是口袋管不到的票種類別）；
   ・2026-08-13 營收分類 tkRevClass／monthSalesValue 的 tkClass 2 處 —— 看的是票種類別
     （tt.category），分的是「營收科目」不是課卡口袋，tkClass5 的五口袋粒度不合用。
   下一批搬遷時仍只能往下調。 */
const SCATTER_BASELINE=99;
const scattered=(src.match(/(===|!==)\s*'(小班肌力|自主訓練|運動按摩)'/g)||[]).length;
ok(`★ 散裝課別比較 ${scattered} 處（基準 ${SCATTER_BASELINE}，只能減不能增）`,
   scattered<=SCATTER_BASELINE, scattered);
ok('★ 口袋規則有唯一的入口（tkPocket／bkPocket）',
   /function tkPocket\(t, typeMap\)\{/.test(src) && /function bkPocket\(b, typeMap\)\{/.test(src));
ok('★ 分類器只有一支（tkClass5），口袋與分頁都吃它',
   (src.match(/function tkClass5\(/g)||[]).length===1
   && /return TK_POCKETS\[tkClass5\(t,typeMap\)\]\|\|TK_POCKETS\.pt;/.test(src));
ok('　　為什麼要有這一層，寫在程式裡',
   /沒有任何地方擁有「團體課的規則是什麼」的答案，於是加一種票要去兩百處找該補哪幾個/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
