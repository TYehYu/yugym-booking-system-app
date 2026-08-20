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
ok('★ 第一列靠左＝課名・場地（教練請假標已移到第二列）',
   /class="ash-course">\$\{nm\}\$\{_vTxt\}<\/span>/.test(sheet) && !/class="ash-course">[^<]*admh-lvtag/.test(sheet));
ok('★ 教練請假標在第二列、靠右且在教練名左邊（與首頁課卡一致）',
   /\$\{_dur\} 分<\/span>\$\{bkIsCoachLeave\(b\)\?'<span class="admh-lvtag ash-lvtag">教練請假<\/span>':''\}\$\{_coachTxt\}/.test(sheet)
   && /\.ash-meta \.ash-lvtag\{margin-left:auto/.test(src)
   && /\.ash-meta:has\(\.ash-lvtag\) \.ash-coachtxt\{margin-left:0;\}/.test(src));
ok('★ 第一列靠右＝時間（純文字，編輯走視窗）', /class="ash-right">\$\{String\(b\.start_time\|\|''\)\.replace\(\/\^0\/,''\)\}<\/span>/.test(sheet));
ok('★ 第二列＝日期・時長靠左、教練靠右',
   /class="ash-meta"><span class="ash-mdate">[\s\S]*<span class="ash-dot">・<\/span><span>\$\{_dur\} 分<\/span>/.test(sheet)
   && sheet.includes('${_coachTxt}</div>')
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
ok('★ 調整預約時間的「返回」退回上一層，不是關掉全部（使用者回報）',
   /onclick="closeModal\(\);ashEditAsk\('\$\{b\.id\}'\)">返回<\/button>/.test(src));
ok('　　開這張時不再先收課卡（原本先收掉，返回就什麼都不剩）',
   !/if\(b\.date<ymd\(TODAY\)\)\{ showToast\('已過期的預約無法調整'\); return; \}\s*\n\s*try\{ collapseBkCard\(\); \}catch\(_\)\{\}/.test(src));
ok('　　真的送出時才收課卡（confirmCalMove 之後會 navTo 重繪，浮層會變孤兒）',
   /closeModal\(\);\s*\n\s*\/\* 真的要送出了才收課卡[\s\S]{0,140}try\{ collapseBkCard\(\); \}catch\(_\)\{\}\s*\n\s*confirmCalMove\(/.test(src));
/* 2026-08-20 使用者指示：教練課／友善教練課也要能調整場地 → venue 與 sub 拆成兩個旗標。
   自主訓練走 bkOrbitVenue（只有它有跑步機台數），其他課別走 openVenueChange（逐場地檢查衝突）。 */
ok('★ 視窗集合：更改場地（所有課別，不再只有自主訓練）',
   /A\.venue==='self'\) rows\+=row\(`closeModal\(\);bkOrbitVenue/.test(ei)
   && /A\.venue==='any'\) rows\+=row\(`ashBackArm\('\$\{b\.id\}'\);closeModal\(\);openVenueChange/.test(ei));
ok('　　venue 對所有課別開放、sub 只給非自主訓練',
   /venue: _editable \? \(bkIsSelf\(b\)\?'self':'any'\) : null,/.test(src)
   && /sub: \(_editable && !bkIsSelf\(b\)\) \? 'sub' : null/.test(src));
ok('　　openVenueChange 的返回是 openBookingDetail，先立旗標才不會被丟進明細',
   /ashBackArm\('\$\{b\.id\}'\);closeModal\(\);openVenueChange/.test(ei));
ok('★ 視窗集合：指派代課教練', /A\.sub==='sub'\) rows\+=row\(`closeModal\(\);ashSubPick\('\$\{b\.id\}'\)`,'指派代課教練'/.test(ei));
/* 2026-08-20 二修（使用者回報：團課的會員卡一疊很長，代課名單吊在課卡上方沒空間）——
   改成獨立視窗，不再用 bkOrbitSub 那個掛在課卡上的面板。 */
ok('★ 代課改成獨立視窗（不再吊在課卡上）',
   /async function ashSubPick\(bid\)\{/.test(src)
   && /showModal\(`<div class="ash-sheetmk"><\/div><div class="modal-title">指派代課教練<\/div>/.test(src)
   && !/ashSubAsk/.test(src));
ok('　　挑到人仍走既有的 bkOrbitSubSet（含衝堂驗證與寫入）',
   /closeModal\(\);bkOrbitSubSet\('\$\{bid\}','\$\{c\.id\}'\)/.test(src)
   && /if\(clash\)\{ showToast\('該教練此時段已有課程，無法代課'\); return; \}/.test(src));
ok('　　有代課時多一列「清除代課」', /closeModal\(\);bkOrbitSubSet\('\$\{bid\}',''\)`,'清除代課'/.test(src));
ok('　　教練請假不重複列進來（調整課程已經是獨立一項）',
   !g('async function ashSubPick(bid){','\n/* 復原前先問一次').includes('canCoachLeave'));
ok('　　返回退回「調整課程」那一層', /onclick="closeModal\(\);ashEditAsk\('\$\{bid\}'\)">返回/.test(src));
ok('★ 沒有錨點課卡也能重開面板（首頁那條路本來就沒有 el，原本會丟例外）',
   (src.match(/if\(el\)\{ el\.style\.marginLeft=''; el\.style\.marginTop=''; el\.classList\.add\('cal-ev-active'\); \}/g)||[]).length===2);
ok('★ 視窗集合：本堂人數上限（改人數搬進標題卡）',
   ei.includes("openGrpMaxEdit('${b.id}')") && ei.includes('A.isGroup && A.staff && !A.closed'));
ok('　　改人數做完要回課卡（它的取消與儲存都會 openBookingDetail）', ei.includes("ashBackArm('${b.id}');closeModal();openGrpMaxEdit"));
ok('★ 教練請假：未請假給「教練請假」、已請假給「復原」', /if\(_leave\)\{[\s\S]*'取消教練請假（復原）'[\s\S]*\}else if\([\s\S]*'教練請假',bkCoachLeaveSub\(b\)/.test(ei));
/* 5 條：調整時間、更改場地（自主訓練）、更改場地（其他課別）、指派代課、本堂人數上限 */
ok('　　已請假的堂不再列出調整時間／場地／代課／改人數', (ei.match(/!_leave &&/g)||[]).length===5);
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
ok('　　從課卡開的視窗都掛上標記（調整課程／指派代課／取消教練請假／調整預約時間／會員備註）',
   (src.match(/<div class="ash-sheetmk"><\/div>/g)||[]).length===5);
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

ok('★ 未到要排在已簽到前面（使用者回報蕭育筑 8/20 被標成已簽到）',
   /const _noShow=\(!r\.sk && b\.no_show===true\);/.test(src)
   && /const _badge=onLeave\?[^\n]*\n\s*:\(_noShow\?[^\n]*未到[^\n]*\n\s*:\(inHere\?[^\n]*已簽到/.test(src));
ok('　　根因寫在註解裡：標記未到課的收尾是 completed＋no_show，done 也會是 true',
   /標記未到課的收尾是「結課蓋未章」：status 會變 completed、no_show=true/.test(src));

console.log('會員卡的備註（2026-08-20）');
ok('★ 右上角一顆備註鈕，有內容就直接顯示、靠右截斷',
   /<button type="button" class="ash-mnote\$\{_noteTxt\?' on':''\}"/.test(src)
   && /\.ash-mnote\{margin-left:auto;[^}]*text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\}/.test(src));
ok('　　沒有備註顯示「＋ 備註」', /\$\{_noteTxt\?escH\(_noteTxt\):'＋ 備註'\}/.test(src));
ok('★ 用的是會員列表同一個欄位（members.note），不另建資料',
   /note:Object\.fromEntries\(\(ms\|\|\[\]\)\.map\(m=>\[m\.id,m\.note\|\|''\]\)\)/.test(src)
   && /m\.note=String\(el\.value\|\|''\)\.trim\(\);/.test(src));
ok('★ 存完回課卡，不會被帶去會員列表（既有那支存完會 navTo(\'members\')）',
   /async function ashMemNoteSave\(bid, mid\)\{[\s\S]{0,600}ashBackArm\(bid\); openBookingDetail\(bid\);/.test(src)
   && /async function saveMemberNote\(member_id\)\{[\s\S]{0,400}navTo\('members'\)/.test(src));
ok('　　改完清掉對照表快取，卡片才會顯示新備註', /window\._bkNameMapC=null;\s*\/\* 對照表帶著備註/.test(src));

console.log('團課的請假／補課券規則');
/* 2026-08-20 定版：團體課一律都有請假發補課券，不再分方案（當天稍早曾限定 4週優惠，
   使用者改口統一：「以免櫃檯跟會員介紹的時候出現混亂」）。 */
ok('★ 判定集中在 tkHasMakeup（口袋＋不是補課券兩個條件）',
   /function tkHasMakeup\(t, typeMap\)\{\s*\n\s*if\(!t \|\| t\.source==='makeup'\) return false;\s*\n\s*return \(tkPocket\(t,typeMap\)\|\|\{\}\)\.memberLeave==='makeup';\s*\n\}/.test(src));
ok('★ 不再有方案白名單（團體課一律都有補課機制）',
   !/MAKEUP_PLANS/.test(src) && !/planHasMakeup/.test(src));
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
ok('★ 請假的堂照樣標教練名（使用者回報只看到「教練請假」、沒有教練名）',
   /const _cnm=\(\(!bkIsSelf\(b\)\|\|bkIsCoachLeave\(b\)\)&&_cid&&_cm\[_cid\]\)\?_cm\[_cid\]:'';/.test(src));

console.log('會員資料頁（管理員手機）');
const ph=g('function ppHeaderHtml(){','\n// ══════ Tabs ══════');
/* 2026-08-20 四修：桌機版也走同一套版面 → 條件不再看 isMobileLayout()。
   仍限「管理員」與「會員」——員工資料與其他角色維持原本的橫向表頭。 */
ok('★ 管理員看會員資料一律走新版面（手機與桌機同一套）',
   /if\(isM && SESSION && SESSION\.role==='admin'\)\{[\s\S]{0,400}return `<div class="pp-head pp-head-m2">/.test(ph)
   && !/if\(isM && SESSION && SESSION\.role==='admin' && isMobileLayout\(\)\)/.test(ph));
ok('★ 大頭照＋姓名獨立一列、橫跨兩欄（使用者回報左右失衡）',
   /<div class="pp-idtop">\s*\n\s*\$\{_avatar\}[\s\S]{0,260}<div class="pp-meta pp-idtier">\$\{tierItem\}<\/div>/.test(ph)
   && /\.pp-head-m2 \.pp-idtop\{grid-column:1\/-1/.test(src));
ok('★ 底下左右各四列：電話/性別/生日/LINE ｜ 主教練/緊急聯絡人/載具/家庭成員',
   ph.includes('<div class="pp-meta pp-idfields">${phoneItem}${genderItem}${bdayItem}${lineItem}</div>')
   && ph.includes('<div class="pp-meta pp-fields">${coachItem}${ecItem}${carrierItem}${famItem}</div>')
   && /\.pp-head\.pp-head-m2\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/.test(src));
ok('★ 大頭照放大', /\.pp-head-m2 \.pp-avatar\{width:76px;height:76px;\}/.test(src));
ok('★ 姓名與等級靠右（大頭照留在左邊）',
   /\.pp-head-m2 \.pp-idname\{[^}]*margin-left:auto;[\s\S]{0,80}align-items:flex-end;text-align:right/.test(src));
ok('★ 視窗裡的卡片改新語彙：去細框、加大圓角與柔和陰影（手機與桌機同一套）',
   /\.pp-sheet-win \.pp-head,\.pp-sheet-win \.pp-card,\s*\n\s*\.pp-sheet-desk \.pp-head,\.pp-sheet-desk \.pp-card\{border:none;border-radius:20px;/.test(src)
   && /\.pp-sheet-win \.pp-card-t,\.pp-sheet-desk \.pp-card-t\{border-bottom:none/.test(src));
ok('　　標題列與視窗同底、不畫分隔線', /\.pp-sheet\.pp-sheet-win \.pp-sheet-bar\{[^}]*background:var\(--bg\);border-bottom:none;\}/.test(src));
ok('　　只吃這兩種視窗，其他地方的 .pp-card 基底規則沒被動到',
   /^\.pp-card\{background:var\(--card\);border:1px solid var\(--bd\);border-radius:14px;/m.test(src));
ok('　　主教練／家庭成員抽成具名變數，兩種版面共用同一份', /const coachItem = isM \? mvA\('主教練'/.test(src)
   && /const famItem = \(isM&&_canBase\)\?/.test(src)
   && /const meta = isM\s*\n\s*\? tierItem \+ coachItem \+ ecItem \+ lineItem \+ carrierItem \+ famItem/.test(src));
ok('　　姓名與大頭照抽成共用變數，兩種版面各用一次（沒有複製兩份）',
   (ph.match(/\$\{_avatar\}/g)||[]).length===2 && (ph.match(/\$\{_nameHtml\}/g)||[]).length===2);
ok('　　員工資料／其他角色維持原本的橫向表頭', ph.includes('return `<div class="pp-head">'));
ok('★ 活動紀錄改成一列按鈕，點了下方換內容（手機與桌機同一套）',
   /const _m2=!!\(SESSION && SESSION\.role==='admin'\);/.test(src)
   && /const back=_m2\s*\n\s*\? `<div class="pp-rectabs">/.test(src));
ok('★ 四顆平分整列，最右邊的訓練紀錄不會被切掉（使用者回報）',
   /\.pp-rectabs\{display:flex;gap:5px;margin-bottom:14px;\}/.test(src)
   && /\.pp-rectab\{flex:1 1 0;min-width:0;/.test(src)
   && !/\.pp-rectabs\{[^}]*overflow-x:auto/.test(src));
/* 按鈕上的筆數 2026-08-20 加、同日移除（使用者看過實機後決定不要）——
   數字仍在分頁標題上（例：預約紀錄（49）），按鈕列保持乾淨。 */
ok('★ 按鈕不帶筆數', !/pp-rectab-n/.test(src) && !/'票券',c\.tkCount/.test(src));
ok('　　四顆：票券／預約紀錄／交易／訓練紀錄',
   /'tickets','票券'/.test(src) && /'bookings','預約紀錄'/.test(src)
   && /'pay','交易'/.test(src) && /'training','訓練紀錄'/.test(src));
ok('　　預設顯示票券（原本 recView 是 null＝顯示入口清單）', src.includes("if(_m2 && !PP.recView) PP.recView='tickets';"));
ok('　　其他角色與桌機維持清單＋返回鈕', /: `<div style="margin-bottom:10px;"><button class="btn btn-ghost btn-sm" onclick="ppRecordBack\(\)">‹ 返回/.test(src));
ok('★ 交易分頁：四欄表格改成一筆一列的卡片（桌機仍是表格）',
   /if\(_m2\)\{[\s\S]{0,700}<div class="pp-txrow">[\s\S]{0,400}<b class="pp-txamt">/.test(src)
   && src.includes('<table class="mtk-table"><thead><tr><th>日期</th>'));
ok('★ 票券卡：購買・效期提到第二列（緊接編號那一列）',
   /\$\{_m2\?`<div class="tkc-meta">\$\{tkBuyDateHtml\(t\)\}　·　效期至/.test(src)
   && /\.tkc-meta\{font-size:11px/.test(src));
console.log('「已完成」＝課真的銷完，不是排完');
ok('★ 判定抽成 tkStBadgeUsed：只有實際銷課數達標才標已完成',
   /function tkStBadgeUsed\(t, used, total\)\{[\s\S]{0,220}if\(t\.status==='used_up' && Number\(total\)>0 && Number\(used\)<Number\(total\)\) return '';/.test(src));
ok('★ 持有中的票券卡吃這個判定（原本直接讀 DB 的 status）',
   src.includes('const stTag=tkStBadgeUsed(t, used, total);') && !/const stTag=tkStBadge\(t\.status\);/.test(src));
ok('　　used／total 在 stTag 之前就算好', (()=>{const i=src.indexOf('const cardOf=t=>{');
   const seg=src.slice(i, i+900);
   return seg.indexOf('const used=sl.used;') < seg.indexOf('tkStBadgeUsed(t, used, total)');})());
ok('　　只擋已完成，已過期／已退費照舊（與銷課數無關）',
   /只擋「已完成」——已過期／已退費與銷課數無關，照舊顯示/.test(src)
   && /return tkStBadge\(t\.status\);\s*\n\}/.test(src));
ok('　　歷史／過期區那張卡不動（那裡的已完成本來就成立）', /const st=tkStBadge\(t\.status\)\s*\n\s*\|\| tkStBadge\(\(total>0&&used>=total\)\?'used_up'/.test(src));

ok('★ 票券卡：狀態章（已完成／已過期／已退費）移到課程方案名稱右邊',
   src.includes("${tkNoTag(sl.no)}${t.plan_name||'票券'}${_m2?stTag:''}")
   && !/tkc-meta">\$\{tkBuyDateHtml\(t\)\}[^`]*\$\{stTag/.test(src));
ok('★ 票券卡：金額改放右下角、就在作廢按鈕上方',
   /<span class="tkc-money">\$\{tkMoneyHtml\(t\)\.replace\(\/\^　·　\/,''\)\}<\/span>/.test(src)
   && /\.tkc-foot\{flex-direction:column;align-items:flex-end/.test(src));
ok('　　桌機與其他角色維持原本的單行底列',
   src.includes(": `${tkBuyDateHtml(t)}　·　效期至 ${fmtExpire(t.expire_date,t)}"));
ok('★ 預約紀錄：520px 月曆改成按月分段的清單（桌機仍是月曆）',
   /if\(_m2\)\{[\s\S]{0,900}<div class="pp-bkmon">[\s\S]{0,900}<div class="pp-bkrow"/.test(src)
   && src.includes('renderMemberWeek(); }catch(_){} },0);'));
ok('　　清單一列一堂：日期／課名（帶課程色）／時間／教練／狀態',
   /\.pp-bkrow::before\{[^}]*background:var\(--bkc/.test(src) && /class="pp-bktag \$\{st\[1\]\}"/.test(src));
ok('★ 會員資料改用浮動視窗、不再滿版（使用者指示：用視窗比較有彈性感）',
   /const _winM = !!\(SESSION && SESSION\.role==='admin' && kind==='member' && isMobileLayout\(\)\);/.test(src)
   && /if\(isMobileLayout\(\)\) ppOpenSheet\(false, _winM\); else ppOpenPage\(\);/.test(src)
   && /\.pp-sheet\.pp-sheet-win\{background:rgba\(18,26,22,\.48\)/.test(src));
ok('　　點背景可關閉（兩種浮動模式共用）', /if\(desk\|\|win\) sh\.addEventListener\('click'/.test(src));
ok('　　編輯的底部操作列改貼在視窗內（原本 fixed 會飄在視窗外）',
   /\.pp-sheet\.pp-sheet-win \.pp-footbar\{position:sticky/.test(src));
ok('　　員工資料與其他角色維持滿版', /sh\.className='pp-sheet'\+\(desk\?' pp-sheet-desk':''\)\+\(win\?' pp-sheet-win':''\)/.test(src));

console.log('團課標題卡的場地人數');
ok('★ 場地旁邊標人數', /const _seatTxt = \(A\.isGroup && typeof grpLiveHeads==='function'\)/.test(src)
   && src.includes("const _vTxt = (_v ? '・'+_v : '') + _seatTxt;"));
ok('　　口徑同名單視窗：有效名額＝總名額−請假', /const _live=grpLiveHeads\(b\), _max=Math\.max\(1,Number\(b\.max_heads\)\|\|5\);/.test(src));
ok('　　滿了標紅', /_live>=_max\?' ash-seats-full':''/.test(src) && /\.ash-seats-full\{color:var\(--danger/.test(src));

console.log('行事曆課卡（管理員一日卡）');
ok('★ 白底＋左側課程色條', /\.cal-ev\.cag-std\.admcag\{background:#fff !important/.test(src)
   && /\.cal-ev\.cag-std\.admcag::before\{content:'';position:absolute;left:0[\s\S]{0,80}background:var\(--amc/.test(src));
ok('★ 已簽到才填滿課程色（原本是整張淡化）',
   /\.cal-ev\.cag-std\.admcag\.admcag-done\{background:var\(--amc,#1f6f54\) !important;color:#fff;\}/.test(src)
   && !/\.admcag\.admcag-done\{opacity:\.62;\}/.test(src));
ok('★ 簽到章拿掉、請假章保留', /return k==='leave'\?'<span class="evc-check evc-leave" title="全員請假">假<\/span>':'';\}\)\(\)\}/.test(src));
ok('　　文字讓開左邊色條', /\.cal-ev\.cag-std\.admcag \.acg-in\{padding-left:7px/.test(src));

console.log('登入頁改版（使用者參考圖）');
ok('★ 字標照參考圖：Training／YUGYM／有肌訓練／分隔線／標語',
   /<div class="lgm-word"><span class="lgm-script">Training<\/span><span class="lgm-en">YUGYM<\/span><\/div>/.test(src)
   && /<div class="lgm-zh">有 肌 訓 練<\/div>/.test(src)
   && /<div class="lgm-rule"><\/div>/.test(src)
   && /<div class="lgm-tag">TRAIN BETTER, LIVE BETTER<\/div>/.test(src));
ok('★ Training 用草寫字體（Yellowtail，另備系統手寫體後備）',
   /family=Yellowtail/.test(src)
   && /font-family:"Yellowtail","Snell Roundhand","Apple Chancery","Brush Script MT",cursive/.test(src));
ok('　　併進既有那一條 Google Fonts，不多開請求',
   (src.match(/fonts\.googleapis\.com\/css2\?family=/g)||[]).length===1);
ok('★ Training 靠右壓在 GYM 上（靠齊字寬右緣，不是版面右緣）',
   /\.login-mark \.lgm-word\{display:inline-block;\}/.test(src)
   && /\.login-mark \.lgm-script\{display:block;text-align:right;margin:0 2px -18px 0;/.test(src));
ok('　　行高留 1.3，草寫的上伸部不會被行框切掉', /font-size:30px;font-weight:400;line-height:1\.3;/.test(src));
ok('　　不畫那圈金色圓框（只有一條細分隔線）',
   !/\.login-mark\{[^}]*border-radius:50%/.test(src) && /\.login-mark \.lgm-rule\{width:74px;height:1px/.test(src));
ok('★ 米色卡框拿掉，整頁就是品牌綠（不要像一頁式網站）',
   /#login-screen \.login-card\{background:none;border:none;box-shadow:none;/.test(src));
ok('　　註冊頁仍保留米色卡（整頁表單需要承載面）', /^\.login-card-brand\{background:#F1EADA;/m.test(src));
ok('　　「會員登入」小標移除（這頁只有一條登入路徑）',
   !/<div class="login-tag">會員登入<\/div>/.test(src));
ok('　　沒有卡片後，這一頁的文字改亮色（註冊頁仍是米卡深字）',
   /#login-screen \.login-lnhint\{color:rgba\(255,255,255,\.62\)\}/.test(src)
   || /#login-screen \.login-lnhint\{color:rgba\(255,255,255,\.62\);\}/.test(src));
ok('★ 版本編號移除（JS 那行有 if(lv) 防呆，不會報錯）',
   !/id="login-ver"/.test(src) && /const lv=document\.getElementById\('login-ver'\); if\(lv\)/.test(src));
ok('★ 員工入口從會員頁移除，但 #staff 網址仍直達員工表單',
   !/員工 \/ 管理後台登入 →/.test(src)
   && /<div id="login-staff-view" class="hidden">/.test(src)
   && /switchLoginMode\(\/staff\/i\.test\(hash\) \? 'staff' : 'member'\)/.test(src));
ok('★ 說明在上、LINE 按鈕在下', /<div class="login-lnhint">一鍵登入[\s\S]{0,120}<\/div>\s*\n\s*<button id="line-login-btn"/.test(src));
ok('★ LINE 按鈕維持官方配色', /id="line-login-btn"[^>]*background:#06C755;color:#fff/.test(src));
ok('★ 整頁品牌綠（登入頁二版起不再有米色卡）',
   /#login-screen\{background:linear-gradient\(165deg,#0a4438/.test(src));
ok('　　只吃登入頁與註冊卡，其他頁維持白卡', /^\.login-card\{background:#fff;/m.test(src)
   && !/login-card-dark/.test(src));   /* 舊的深卡 class 已全面改名，不該有殘留 */
ok('　　填寫區白底黑字', /#login-screen input,#login-screen select,\.login-card-brand input,\.login-card-brand select\{\s*\n\s*background:#fff;color:#111;/.test(src));
ok('★ 綠底鋪到 body（內容超出畫面或下拉回彈時不會露出米色）',
   /body:has\(#login-screen:not\(\.hidden\)\)\{background:#003d32;\}/.test(src));
ok('　　登入後 body 回到原本的米色（用 :not(.hidden) 綁在登入頁還在畫面上時）',
   /body\{background:linear-gradient\(155deg,#F7F4EC/.test(src));

console.log('會員資料視窗變窄後冒出來的兩處');
ok('★ LINE 通知的開關靠右（縮放原點原本是 left center，畫出來會往左縮）',
   /\.pp-head-m2 \.pp-idfields \.switch\{transform-origin:right center !important;\}/.test(src));
ok('★ 底部不再掛一塊空米色：浮動視窗取消 #pp-body 的 400px 保底',
   /\.pp-sheet-win #pp-body\{min-height:0;\}/.test(src) && /^#pp-body\{min-height:400px;\}/m.test(src));
ok('　　只有浮動視窗取消，滿版模式仍保留原規則（切分頁不縮）',
   src.indexOf('#pp-body{min-height:400px;}') < src.indexOf('.pp-sheet-win #pp-body{min-height:0;}'));
ok('★ 票券種類放不下就換行、按鈕本身不折字（原本擠成直的）',
   /\.pp-sheet-win \.tkfilter,\.pp-sheet-desk \.tkfilter\{flex-wrap:wrap;\}/.test(src)
   && /\.pp-sheet-win \.tkfilter \.tkf-btn,\.pp-sheet-desk \.tkfilter \.tkf-btn\{flex:0 0 auto;white-space:nowrap;\}/.test(src));
ok('　　桌機尺寸另外給（同一套版面、空間寬鬆一點）',
   /@media\(min-width:601px\)\{\s*\n\s*\.pp-head\.pp-head-m2\{gap:14px 32px/.test(src)
   && /\.pp-head-m2 \.pp-avatar\{width:92px;height:92px;\}/.test(src));
/* 兩頁的底色不同，文字色也各自對應：登入頁沒有卡、字直接落在綠底 → 亮色；
   註冊頁是米色卡 → 深色。這條守住兩者沒有互相汙染。 */
ok('　　登入頁亮字、註冊頁深字，各自對應自己的底色',
   /#login-screen \.login-lnhint\{color:rgba\(255,255,255/.test(src)
   && /\.login-logo-main \.lg-zh\{[^}]*color:var\(--green,#003d32\)/.test(src)
   && !/\.login-card-brand[^{]*\{[^}]*color:rgba\(255,255,255/.test(src));
ok('★ 註冊頁同一套風格（同一個入口、導向不同）',
   /<div class="login-card login-card-brand"[^>]*>\s*\n\s*\$\{[\s\S]{0,120}\}\s*\n\s*<div class="login-logo login-logo-main"><div class="lg-zh">有肌訓練/.test(src));
/* 卡片翻成米色之後，先前為了深底加的反白覆寫全部撤掉 —— 表單回到全站預設的深色文字、
   主要按鈕也回到品牌綠（在米色卡上對比本來就夠）。這裡守住「沒有殘留的反白規則」。 */
ok('　　為深底加的反白覆寫已撤除（表單回到全站預設）',
   !/\.login-card-\w+ \.form-row label/.test(src)
   && !/\.login-card-\w+ \.btn-ghost\{/.test(src)
   && !/\.login-card-\w+ \.btn-primary\{/.test(src));
ok('　　說明文字用 class 帶次要灰（原本是行內色，翻配色時改不到）',
   /\.login-note\{color:var\(--t3\);\}/.test(src) && /<div class="login-note"/.test(src));
ok('　　登入／註冊的欄位 id 與送出函式都沒動', ['login-acct','login-pw','reg-surname','reg-given','reg-phone','reg-pw','reg-pw2','reg-submit']
   .every(id=>src.includes(`id="${id}"`)) && /onclick="submitRegister\(\)"/.test(src) && /onclick="lineLoginStart\(\)"/.test(src));

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
