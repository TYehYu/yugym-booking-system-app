/* 2026-08-20 三項修正：
   ① 使用者回報「今日運勢點了沒反應」——手機版帳號抽屜開啟時會被搬到 body（脫離 #app-screen），
      `.role-admin #tb-fortune-inline{display:block}` 這條祖先選擇器就吃不到，籤抽到了卻整塊 display:none。
      修法同 bkCardPop 的 admh-pop：開啟前把 role-admin 補到抽屜元素本身。
   ② 簡易課卡右上角調整時間鈕：只顯示開始時間（9:00），不再帶結束時間，省視窗空間。
   ③ 簡易課卡會員姓名列最右邊掛教練名。
   ④ 首頁大日期的格線從「日期數字｜月份」之間，移到「大日期｜右側 KPI」之間。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i));};

console.log('今日運勢：抽屜搬到 body 後角色選擇器要還吃得到');
const sync=g('function syncAcctMenuItems(){','\ndocument.addEventListener(\'click\'');
ok('★ 開啟前把 role-admin 補到 #tb-acct-menu 本身', /getElementById\('tb-acct-menu'\)[\s\S]*classList\.toggle\('role-admin', *role==='admin'\)/.test(sync));
ok('　　補 class 排在 renderFortuneInline 之前（否則同一輪還是量到 none）',
   sync.indexOf("classList.toggle('role-admin'") < sync.indexOf('renderFortuneInline'));
ok('　　CSS 兩條規則仍靠 .role-admin 祖先（所以上面那行是必要的）',
   src.includes('.role-admin .tb-acct-butler{display:flex;}') && src.includes('.role-admin #tb-fortune-inline{display:block;}'));
ok('　　抽屜確實會被搬到 body（本 bug 的前提沒變）',
   g('function toggleAcctMenu(e){','function closeAcctMenu').includes('document.body.appendChild(menu)'));

console.log('簡易課卡（admh-sheet）課程卡');
const sheet=g('_cardHtml=`<div class="mtp-card admh-sheet"','\n  }else{');
if(!sheet) { console.log('  ✗ 取不到課程卡原始碼（結束標記對不上）'); process.exit(1); }
ok('★ 調整時間鈕只顯示開始時間、去掉開頭的 0', sheet.includes("${String(b.start_time||'').replace(/^0/,'')}"));
ok('★ 不再顯示 –結束時間', !sheet.includes('${b.start_time}–${endT}'));
ok('★ 第一列靠左＝課名・場地・時長', /class="ash-course">\$\{nm\}\$\{_vTxt\}<span class="ash-dot">・<\/span>\$\{_dur\} 分/.test(sheet));
ok('★ 第一列靠右＝可編輯的時間', /class="ash-right"><button type="button" class="ash-timebtn" onclick="admhMoveAsk/.test(sheet));
ok('★ 第二列＝教練靠左、日期靠右', /class="ash-meta">\$\{_coachTxt\}<span class="ash-mdate">/.test(sheet)
   && /\.ash-mdate\{margin-left:auto/.test(src));
ok('　　日期去掉開頭的 0', sheet.includes(".slice(5).replace('-','/').replace(/^0/,'')"));
ok('　　教練名不再靠右（改成第二列的最左）', !/\.ash-coachbtn,\.ash-coachtxt\{margin-left:auto/.test(src));
ok('★ 出席章從課程卡拿掉（狀態改標在會員名字旁）', !sheet.includes('admh-stamp') && !src.includes('const _st=((typeof grpAllOnLeave'));
ok('★ 代課鈕退場，改成點教練名字開代課面板', !src.includes('ash-subbtn') && /_coachTxt[\s\S]{0,300}bkOrbitSub\('\$\{b\.id\}'\)/.test(src));
ok('　　bkOrbitSub 本來就同時提供教練請假（所以不用另做選單）',
   /async function bkOrbitSub\(id\)\{[\s\S]{0,1600}canCoachLeave\(b\)/.test(src));
ok('★ 場地鈕退場，改成直接點課名右邊的場地字樣', !/'場地'\$\{EVO_IC/.test(src) && /_vTxt[\s\S]{0,200}bkOrbitVenue\('\$\{b\.id\}'\)/.test(src));
ok('　　只有自主訓練能換場地（A.sub===\'venue\'），其他就只是文字', /A\.sub==='venue'\s*\?\s*`・<button/.test(src));
ok('　　會員不再擠在課程卡上（.ash-name 退場）', !sheet.includes('class="ash-name"') && !src.includes('.ash-name{'));
ok('　　課名讓位、右上角不折行', /\.ash-course\{[^}]*white-space:nowrap/.test(src) && /\.ash-timebtn\{[^}]*white-space:nowrap/.test(src));

console.log('簡易課卡：每位會員一張卡');
ok('★ 團課逐名額一張卡、單人課一張', /_seatKs\.length \? _seatKs\.map\(sk=>\(\{sk, mid:seatMid\(sk\), n:seatNo\(sk\)\}\)\)/.test(src)
   && src.includes("(b.member_id ? [{sk:null, mid:b.member_id, n:1}]"));
ok('★ 點會員卡進會員資料', src.includes('onclick="collapseBkCard();openMemberDetail(\'${r.mid}\')"'));
ok('　　沒有會員記錄（體驗／場租）就不掛點擊', src.includes('${r.mid?` onclick='));
ok('★ 取消（上）／簽到（下）獨立在卡片外面',
   /<div class="ash-mrow">[\s\S]*<div class="ash-mcard[\s\S]*<\/div>\s*\$\{_outOrbs\?`<div class="ash-morbs">/.test(src)
   && /\.ash-morbs\{[^}]*flex-direction:column/.test(src));
ok('　　取消排在簽到前面（DOM 順序＝上下順序）',
   src.indexOf("`ashSeatAct('${b.id}','cancel','${r.sk}')`") < src.indexOf("`ashSeatAct('${b.id}','attend','${r.sk}')`"));
ok('★ 請假改成卡片內、姓名列最右邊的小按鈕',
   /_leaveBtn=`<button type="button" class="ash-mlv"[^`]*ashSeatAct\('\$\{b\.id\}','leave','\$\{r\.sk\}'\)/.test(src)
   && /\.ash-mlv\{margin-left:auto/.test(src));
ok('　　請假中換成「取消請假」（且傳會員 id，與名單視窗一致）',
   /class="ash-mlv ash-mlv-on"[^`]*ashSeatAct\('\$\{b\.id\}','leave','\$\{r\.mid\}'\)[^`]*>取消請假</.test(src));
ok('　　已簽到就不給請假／取消（同名單視窗）',
   src.includes('if(_ck && _canLeave && !inHere && !A.closed)')
   && src.includes("if(A.staff && !inHere && !A.closed) _outOrbs += evoBtn('','evo-danger'"));

console.log('請假只給有補課機制的票');
ok('★ 判定集中在 tkHasMakeup（口袋＋方案＋不是補課券三個條件）',
   /function tkHasMakeup\(t, typeMap\)\{[\s\S]*t\.source==='makeup'[\s\S]*memberLeave!=='makeup'[\s\S]*planHasMakeup\(t\.plan_name\)/.test(src));
ok('★ 目前只有「團課 4週優惠」有補課機制', /const MAKEUP_PLANS=\['團課 4週優惠'\];/.test(src));
ok('★ 補課券不能再請假（避免請假又送一張，無限展延）', /if\(!t \|\| t\.source==='makeup'\) return false;/.test(src));
ok('　　會員卡的請假鈕吃這個判定', src.includes('_canLeave = !!(_slot && tkHasMakeup(_slot.t,'));
ok('　　查不到這一格扣在哪張票就不給（會標到請假卻發不出券）', src.includes('let _canLeave=false;'));
ok('★ 行事曆情境仍然不給簽到（0819 定案：簽到只在首頁）',
   (src.match(/if\(_ck && !A\.calCtx && !A\.closed\)/g)||[]).length===2);
ok('　　單人課走 confirmCancelBooking／checkInBooking（沒有逐人請假的機制）',
   src.includes("collapseBkCard();confirmCancelBooking('${b.id}')") && src.includes("collapseBkCard();checkInBooking('${b.id}')"));
ok('　　待簽約／待分期不重複給圓鈕', src.includes('if(!A.pending && r.mid){') && src.includes('await bkCardPop(el, b, btns, {pending:true});'));
ok('　　票券圓點保留（使用者定案）＋逐名額各取自己那張',
   src.includes('r.sk?(W.seatOf(b.id,r.n)||W.ticketOf(b.id)):W.ticketOf(b.id)') && src.includes('ticketTokens(sl.t,sl.stamps,'));
ok('　　跨票時用票內序圈本堂（全體序會圈不到）', src.includes('if(s2&&s2.t&&s2.t.id===sl.t.id) _ord++;'));

console.log('搬家後下方那一列只剩新增');
const exp=g('async function expandBkCard(el, id){','async function bkCardPopClose');
ok('★ 代課改由課程卡的教練名負責（下方不再產生）', exp.includes('if(!_ashMode && staff && !closed && b.date>=ymd(TODAY)'));
ok('★ 取消改由會員卡負責', exp.includes('if(!_ashMode && canCancel && own){'));
ok('★ 簽到改由會員卡負責', exp.includes('if(!_ashMode && !_calCtx && (staff||coachCk) && !closed){'));
ok('★ 明細鈕撤掉（簡易課卡已涵蓋這些操作）', /2026-08-20 使用者指示：管理員手機的簡易課卡已經涵蓋這些操作，明細鈕撤掉。 \*\/\s*\n\s*if\(!_ashMode\) btns \+=/.test(exp));
ok('　　新增仍在下方（沒被搬走）', exp.includes("evoBtn('evo-b2','evo-gold',`collapseBkCard();openGroupMembers('${id}')`,'plus','新增')"));
ok('　　一顆都沒有時不畫空的圓鈕列', src.includes('${btns?`<div class="mtp-orbs">${btns}</div>`:\'\'}'));
ok('　　條件仍然只有 expandBkCard 在算（用 acts 帶給課卡）',
   /const acts = \{staff, own, coachCk, closed, canCancel, checked, isGroup, calCtx:_calCtx,/.test(exp)
   && exp.includes('await bkCardPop(el, b, btns, acts);'));

console.log('逐人動作做完要留在課卡');
ok('★ ashSeatAct 立旗標再呼叫名單視窗那三支共用函式',
   /window\._ashBack=\{id:String\(bid\), el:window\._expandedBkEl\|\|null, ts:Date\.now\(\)\}/.test(src)
   && src.includes('await groupToggleLeave(bid, seatKey)')
   && src.includes('await groupCancelSeat(bid, seatKey)')
   && src.includes('await toggleGroupAttend(bid, seatKey)'));
ok('★ openBookingDetail 開頭消化旗標、改回重開課卡',
   /async function openBookingDetail\(id\)\{[\s\S]{0,400}ashBackTake\(id\)[\s\S]{0,300}expandBkCard\(_back\.el, id\)/.test(src));
ok('　　旗標用完即丟', /window\._ashBack=null; return s;/.test(src));
ok('　　兩分鐘保險：沒被消化也不會一直攔截明細', /\(Date\.now\(\)-s\.ts\)>120000/.test(src));
ok('　　只攔同一筆預約', /s\.id!==String\(id\)/.test(src));
ok('　　失敗時清掉旗標', src.includes("}catch(e){ window._ashBack=null; showToast('操作失敗：'"));

console.log('首頁大日期格線');
const hero=g('admMobHero=`<div class="admh">','<div class="admh-div"></div>');
ok('★ 格線移出 .admh-bigdate', !/admh-bigdate[\s\S]*admh-dsep[\s\S]*admh-dside/.test(hero));
ok('★ 格線落在大日期與 KPI 之間',
   hero.indexOf('class="admh-bigdate"') < hero.indexOf('<span class="admh-dsep"></span>') &&
   hero.indexOf('<span class="admh-dsep"></span>') < hero.indexOf('<div class="admh-kpis">') &&
   hero.split('admh-dsep').length===2);
ok('　　格線仍是滿高的細線（flex 子項不被壓縮）', /\.admh-dsep\{[^}]*align-self:stretch[^}]*flex:none/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
