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
ok('★ 課程卡第二行＝日期・時長・教練', /class="ash-meta"[\s\S]*b\.date[\s\S]*\$\{_dur\} 分[\s\S]*\$\{coachNm\}/.test(sheet));
ok('　　日期去掉開頭的 0', sheet.includes(".slice(5).replace('-','/').replace(/^0/,'')"));
ok('★ 代課／場地移到課程卡右上角', sheet.includes('${_subBtn}') && /_subBtn = A\.sub/.test(src));
ok('　　自主訓練給「場地」、其他給「代課」', /A\.sub==='venue'\?`bkOrbitVenue/.test(src) && /:`bkOrbitSub/.test(src));
ok('　　會員不再擠在課程卡上（.ash-name 退場）', !sheet.includes('class="ash-name"') && !src.includes('.ash-name{'));
ok('　　課名讓位、代課不折行', /\.ash-course\{[^}]*white-space:nowrap/.test(src) && /\.ash-timebtn\{[^}]*white-space:nowrap/.test(src));

console.log('簡易課卡：每位會員一張卡');
ok('★ 團課逐名額一張卡、單人課一張', /_seatKs\.length \? _seatKs\.map\(sk=>\(\{sk, mid:seatMid\(sk\), n:seatNo\(sk\)\}\)\)/.test(src)
   && src.includes("(b.member_id ? [{sk:null, mid:b.member_id, n:1}]"));
ok('★ 點會員卡進會員資料', src.includes('onclick="collapseBkCard();openMemberDetail(\'${r.mid}\')"'));
ok('　　沒有會員記錄（體驗／場租）就不掛點擊', src.includes('${r.mid?` onclick='));
ok('★ 三顆圓鈕＝請假／取消／簽到', /evoBtn\('','',`ashSeatAct\('\$\{b\.id\}','leave','\$\{r\.sk\}'\)`,'noshow','請假'\)/.test(src)
   && /evoBtn\('','evo-danger',`ashSeatAct\('\$\{b\.id\}','cancel','\$\{r\.sk\}'\)`,'x','取消'\)/.test(src)
   && /ashSeatAct\('\$\{b\.id\}','attend','\$\{r\.sk\}'\)/.test(src));
ok('　　請假中只給「取消請假」（且傳會員 id，與名單視窗一致）',
   /if\(onLeave\)\{\s*_orbs \+= evoBtn\('','',`ashSeatAct\('\$\{b\.id\}','leave','\$\{r\.mid\}'\)`,'undo','取消請假'\)/.test(src));
ok('　　已簽到就不給請假／取消（同名單視窗）',
   src.includes("if(_ck && !inHere && !A.closed) _orbs += evoBtn('','',`ashSeatAct")
   && src.includes("if(A.staff && !inHere && !A.closed) _orbs += evoBtn('','evo-danger'"));
ok('★ 行事曆情境仍然不給簽到（0819 定案：簽到只在首頁）',
   (src.match(/if\(_ck && !A\.calCtx && !A\.closed\)/g)||[]).length===2);
ok('　　單人課走 confirmCancelBooking／checkInBooking（沒有逐人請假的機制）',
   src.includes("collapseBkCard();confirmCancelBooking('${b.id}')") && src.includes("collapseBkCard();checkInBooking('${b.id}')"));
ok('　　待簽約／待分期不重複給圓鈕', src.includes('if(!A.pending && r.mid){') && src.includes('await bkCardPop(el, b, btns, {pending:true});'));
ok('　　票券圓點保留（使用者定案）＋逐名額各取自己那張',
   src.includes('r.sk?(W.seatOf(b.id,r.n)||W.ticketOf(b.id)):W.ticketOf(b.id)') && src.includes('ticketTokens(sl.t,sl.stamps,'));
ok('　　跨票時用票內序圈本堂（全體序會圈不到）', src.includes('if(s2&&s2.t&&s2.t.id===sl.t.id) _ord++;'));

console.log('搬家後下方那一列只留明細與新增');
const exp=g('async function expandBkCard(el, id){','async function bkCardPopClose');
ok('★ 代課改由課程卡負責（下方不再產生）', exp.includes('if(!_ashMode && staff && !closed && b.date>=ymd(TODAY)'));
ok('★ 取消改由會員卡負責', exp.includes('if(!_ashMode && canCancel && own){'));
ok('★ 簽到改由會員卡負責', exp.includes('if(!_ashMode && !_calCtx && (staff||coachCk) && !closed){'));
ok('　　新增仍在下方（沒被搬走）', exp.includes("evoBtn('evo-b2','evo-gold',`collapseBkCard();openGroupMembers('${id}')`,'plus','新增')"));
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
