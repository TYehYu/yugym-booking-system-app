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
const sheet=g('_cardHtml=`<div class="mtp-card admh-sheet ash-crs"','\n  }else{');
if(!sheet) { console.log('  ✗ 取不到課程卡原始碼（結束標記對不上）'); process.exit(1); }
ok('★ 調整時間鈕只顯示開始時間、去掉開頭的 0', sheet.includes("${String(b.start_time||'').replace(/^0/,'')}"));
ok('★ 不再顯示 –結束時間', !sheet.includes('${b.start_time}–${endT}'));
ok('★ 第一列靠左＝課名・場地', /class="ash-course">\$\{nm\}\$\{_vTxt\}\$\{bkIsCoachLeave/.test(sheet));
ok('★ 第一列靠右＝時間（純文字，編輯走視窗）', /class="ash-right">\$\{String\(b\.start_time\|\|''\)\.replace\(\/\^0\/,''\)\}<\/span>/.test(sheet));
ok('★ 第二列＝日期・時長靠左、教練靠右',
   /class="ash-meta"><span class="ash-mdate">[\s\S]*<span class="ash-dot">・<\/span><span>\$\{_dur\} 分<\/span>\$\{_coachTxt\}<\/div>/.test(sheet)
   && /\.ash-coachtxt\{margin-left:auto/.test(src));
ok('　　日期去掉開頭的 0', sheet.includes(".slice(5).replace('-','/').replace(/^0/,'')"));
ok('★ 出席章從課程卡拿掉（狀態改標在會員名字旁）', !sheet.includes('admh-stamp') && !src.includes('const _st=((typeof grpAllOnLeave'));
ok('　　會員不再擠在課程卡上（.ash-name 退場）', !sheet.includes('class="ash-name"') && !src.includes('.ash-name{'));
ok('　　課名不折行（右邊還有時間要放）', /\.ash-course\{[^}]*white-space:nowrap/.test(src));

console.log('標題卡＝點一下跳「調整課程」視窗（卡面不放虛線與按鈕）');
ok('★ 卡面上的按鈕全數退場（時間鈕／場地虛線／代課鈕）',
   !src.includes('ash-timebtn') && !src.includes('ash-linkbtn') && !src.includes('ash-coachbtn') && !src.includes('ash-subbtn'));
ok('★ 整張標題卡可點，開 ashEditAsk', /class="mtp-card admh-sheet ash-crs"[^>]*onclick="ashEditAsk\('\$\{b\.id\}'\)"/.test(sheet)
   && /\.ash-crs\{cursor:pointer;\}/.test(src));
ok('　　acts 掛上 window 讓視窗拿得到（同 _expandedBkEl 的做法）', src.includes('window._ashActs=A;'));
const ei=g('async function ashEditAsk(id){','\n/* 復原前先問一次');
ok('★ 視窗集合：調整日期／時間', ei.includes("closeModal();admhMoveAsk('${b.id}')") && ei.includes("'調整日期／時間'"));
ok('★ 視窗集合：更改場地（只有自主訓練）', /A\.sub==='venue'\) rows\+=row\(`closeModal\(\);bkOrbitVenue/.test(ei));
ok('★ 視窗集合：指派代課教練', /A\.sub==='sub'\) rows\+=row\(`closeModal\(\);bkOrbitSub/.test(ei));
ok('　　bkOrbitSub 本來就同時提供教練請假（所以不用另做選單）',
   /async function bkOrbitSub\(id\)\{[\s\S]{0,1600}canCoachLeave\(b\)/.test(src));
ok('★ 視窗集合：本堂人數上限（改人數搬進標題卡）',
   ei.includes("openGrpMaxEdit('${b.id}')") && ei.includes('A.isGroup && A.staff && !A.closed'));
ok('　　改人數做完要回課卡（它的取消與儲存都會 openBookingDetail）', ei.includes("ashBackArm('${b.id}');closeModal();openGrpMaxEdit"));
ok('★ 教練請假：未請假給「教練請假」、已請假給「復原」', /if\(_leave\)\{[\s\S]*'取消教練請假（復原）'[\s\S]*\}else if\([\s\S]*'教練請假',bkCoachLeaveSub\(b\)/.test(ei));
ok('　　已請假的堂不再列出調整時間／代課／改人數', (ei.match(/!_leave &&/g)||[]).length===4);
ok('　　團課請假＝整堂取消、救不回來，照實說明', ei.includes('這堂的教練請假是<b>整堂取消</b>，無法復原'));
ok('★ 復原前先跳視窗確認（使用者指示）',
   /async function ashCoachLeaveUndoAsk\(id\)[\s\S]*取消教練請假？[\s\S]*bkCoachLeaveUndo\('\$\{b\.id\}'\)/.test(src));
ok('　　不是 coach_leave 就擋下（團課請假不可復原）', /if\(b\.status!=='coach_leave'\)\{ showToast\('這堂不是可復原的教練請假/.test(src));
ok('★ 視窗要蓋在課卡之上（使用者回報「沒有出現在最前面」）',
   /#bk-card-pop\.admh-pop \.mtp-back\{z-index:9740/.test(src)
   && /#bk-card-pop\.admh-pop \.mtp\{z-index:9741;\}/.test(src)
   && /\.modal-bg\{[^}]*z-index:9750/.test(src));
ok('　　只壓管理員手機那張面板，共用的 #bk-card-pop 維持原層級',
   /#bk-card-pop \.mtp\{position:fixed;z-index:9801/.test(src));
ok('★ 視窗風格對齊課卡（使用者回報「跟我們剛剛調整的差太多」）',
   /\.modal:has\(\.ash-sheetmk\)\{background:var\(--bg\);border-radius:22px/.test(src)
   && /\.ash-eirow\{[\s\S]{0,220}background:#fff;border:none;[\s\S]{0,120}box-shadow:0 6px 18px/.test(src)
   && /\.modal:has\(\.ash-sheetmk\) \.modal-foot \.btn\{border-radius:999px/.test(src));
ok('　　三張視窗都掛上標記（調整課程／取消教練請假／調整預約時間）',
   (src.match(/<div class="ash-sheetmk"><\/div>/g)||[]).length===3);
ok('　　只吃帶標記的視窗，其他彈窗不受影響', /\.modal\{background:var\(--surface-3\)/.test(src) && /\.ash-sheetmk\{display:none;\}/.test(src));

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
ok('★ 有補課機制的方案：團課 4週優惠＋團課【4堂優惠】（0820 使用者確認是同一檔的舊寫法）',
   /const MAKEUP_PLANS=\['團課 4週優惠','團課【4堂優惠】'\]/.test(src));
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

console.log('首頁課卡：白底＋左色條，只有已簽到填滿');
ok('★ 只在管理員手機產生（範圍沒有外溢）', /if\(SESSION\.role==='admin' && isMobileLayout\(\)\)\{/.test(src)
   && src.indexOf("if(SESSION.role==='admin' && isMobileLayout()){") < src.indexOf('class="admh-card${done?'));
ok('★ 白底＋左側課程色條', /\.admh-card\{[^}]*background:#fff/.test(src)
   && /\.admh-card::before\{content:'';position:absolute;left:0[^}]*background:var\(--admh-c/.test(src));
ok('★ 已簽到才填滿課程色（原本是整張淡化）', /\.admh-done\{background:var\(--admh-c,#1f6f54\);color:#fff;\}/.test(src)
   && !/\.admh-done\{opacity:\.55;\}/.test(src));
ok('★ 出席章移到第二列會員姓名旁邊', /<div class="admh-mname">\$\{mname\}\$\{_st\?`<span class="admh-stamp/.test(src)
   && !/class="admh-time">\$\{b\.start_time\}\$\{_st/.test(src));
ok('★ 章的顏色：未出席金／已簽到綠／請假紅',
   /\.admh-st-done\{background:var\(--green\)/.test(src)
   && /\.admh-st-ns\{background:var\(--gold,#B48A56\)/.test(src)
   && /\.admh-st-leave\{background:#b5372e/.test(src));
ok('　　白底上的章改用陰影（原本的白圈在白底看不見）', /\.admh-stamp\{[^}]*box-shadow:0 1px 3px/.test(src)
   && /\.admh-done \.admh-stamp\{box-shadow:0 0 0 1\.5px/.test(src));
ok('　　填滿時字色一併轉白', /\.admh-done \.admh-mname,\.admh-done \.admh-time\{color:#fff;\}/.test(src));

ok('★ 教練請假標移到右下角、教練名左邊', /const _foot=\(_cnm\|\|_lvTag\)\?`<div class="admh-foot">\$\{_lvTag\}/.test(src)
   && !/class="admh-cname">\$\{cname\}[^<]*\$\{_lv\?/.test(src));
ok('　　右下角多一個標，卡片右側再讓一點（避免壓到票券那行）', /\.admh-card:has\(\.admh-lvtag\)\{padding-right:152px;\}/.test(src));

console.log('會員資料頁（管理員手機）');
const ph=g('function ppHeaderHtml(){','\n// ══════ Tabs ══════');
ok('★ 只有管理員手機走新版面', /if\(isM && SESSION && SESSION\.role==='admin' && isMobileLayout\(\)\)\{\s*\n\s*return `<div class="pp-head pp-head-m2">/.test(ph));
ok('★ 左欄：一列大頭照、二列姓名、三列電話',
   /<div class="pp-idcol">\s*\n\s*\$\{_avatar\}\s*\n\s*<div class="pp-name-row">\$\{_nameHtml\}\$\{code\}\$\{typeBadge\}<\/div>\s*\n\s*<div class="pp-meta pp-idphone">\$\{phoneItem\}<\/div>/.test(ph));
ok('★ 右欄：其他欄位一列一列（性別／生日＋原本的 meta）', ph.includes('<div class="pp-meta pp-fields">${genderItem}${bdayItem}${meta}</div>')
   && /\.pp-head-m2 \.pp-fields\{display:flex;flex-direction:column/.test(src));
ok('　　姓名與大頭照抽成共用變數，兩種版面各用一次（沒有複製兩份）',
   (ph.match(/\$\{_avatar\}/g)||[]).length===2 && (ph.match(/\$\{_nameHtml\}/g)||[]).length===2);
ok('　　桌機／其他角色維持原本的橫向表頭', ph.includes('return `<div class="pp-head">'));
ok('★ 活動紀錄改成一列按鈕，點了下方換內容',
   /const _m2=!!\(SESSION && SESSION\.role==='admin' && isMobileLayout\(\)\);/.test(src)
   && /const back=_m2\s*\n\s*\? `<div class="pp-rectabs">/.test(src));
ok('　　四顆：票券／預約紀錄／交易／訓練紀錄',
   /\[\['tickets','票券'\],\['bookings','預約紀錄'\],\['pay','交易'\],\['training','訓練紀錄'\]\]/.test(src));
ok('　　預設顯示票券（原本 recView 是 null＝顯示入口清單）', src.includes("if(_m2 && !PP.recView) PP.recView='tickets';"));
ok('　　其他角色與桌機維持清單＋返回鈕', /: `<div style="margin-bottom:10px;"><button class="btn btn-ghost btn-sm" onclick="ppRecordBack\(\)">‹ 返回/.test(src));

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
