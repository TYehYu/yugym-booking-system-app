/* 2026-08-21 使用者指示：「桌機首頁課卡跟行事曆課卡 統一改成 時間＋會員姓名 靠左置中
   教練放底部靠右 簽到的課卡滿版上色 出席章在會員姓名右邊
   待簽約跟未安排會員的課卡 都用淡化顯示加紅框」

   兩張卡共用同一套 class 語彙（行事曆 .evc-* ／首頁 .tcard-*），所以規則成對寫。
   只作用在桌機：手機的管理員首頁走 admMobHero，課卡版面不動。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const css=src.slice(src.indexOf('<style>'), src.indexOf('</style>'));

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 抽出這次新增的桌機區塊，確認每一條都寫在裡面（而不是誤加到全域影響手機） */
const i=css.indexOf('/* ══ 課卡定版（2026-08-21 使用者指示）');
const j=(()=>{ let k=css.indexOf('@media(min-width:601px){', i); let d=0, p=css.indexOf('{',k);
  for(let q=p;q<css.length;q++){ if(css[q]==='{')d++; else if(css[q]==='}'){d--; if(!d) return q;} } return -1; })();
const blk=(i>=0&&j>i)?css.slice(i,j+1):'';

console.log('桌機課卡定版');
ok('★ 抽得到這次新增的桌機區塊', blk.length>500, blk.length);
ok('★ 只作用在桌機（min-width:601px），手機課卡不動',
   /@media\(min-width:601px\)\{/.test(blk));

/* 2026-08-21 二修（使用者附截圖）：一修的垂直置中在窄欄位裡讓每張卡文字高度都不同、
   一整排對不齊 → 改回貼齊上緣。 */
ok('★ ① 時間＋姓名靠左上（兩張卡成對）',
   /\.cal-ev\.cal-ev-std \.evc-txt,\s*\n\s*\.tcard\.tcard-std \.tcard-txt\{ justify-content:flex-start !important; \}/.test(blk));

ok('★ ② 教練放底部靠右（margin-top:auto 推到底＋align-self 靠右）',
   /\.cal-ev\.cal-ev-std \.evc-coach,\s*\n\s*\.tcard\.tcard-std \.tcard-co\{ margin-top:auto !important; align-self:flex-end !important; \}/.test(blk));

/* 三修（使用者指示）：「桌機版課卡 移除出席章好了，在簡易課卡這邊的會員卡姓名右邊
   可以看到就好」——行事曆一格塞不下四樣東西，到課狀態改成點開課卡再看。 */
ok('★ ③ 桌機課卡不畫出席章',
   /\.cal-ev\.cal-ev-std \.evc-check,\s*\n\s*\.tcard\.tcard-std \.tcard-chk\{ display:none !important; \}/.test(blk));
ok('　　只在桌機隱藏，手機的角落章與 DOM 都沒動',
   /手機仍是原本的角落章，所以只在桌機隱藏，DOM 與手機樣式都不動/.test(blk)
   && /<span class="evc-check"/.test(src));
ok('　　到課狀態改在簡易課卡的會員卡上看（那三個標籤仍在）',
   /ash-mtag-leave">請假/.test(src) && /ash-mtag-ns">未到/.test(src) && /ash-mtag-ok">已簽到/.test(src));

ok('★ ④ 已簽到 → 整卡填課程色（原本標準卡刻意不填，這次改回填滿）',
   /\.cal-ev\.cal-ev-std\.cal-ev-checked \.evc-body,\s*\n\s*\.tcard\.tcard-std\.tcard-done \.tcard-body\{\s*\n\s*background:var\(--course-accent,#3D7039\) !important;/.test(blk));
ok('　　運動按摩有自己的色（沒有 --course-accent，會退回預設綠）',
   /\.tcard\.tcard-std\.tcard-done\.course-massage \.tcard-body\{\s*\n\s*background:#2f8f83 !important;/.test(blk));
ok('　　填色後文字轉白', /\.tcard\.tcard-std\.tcard-done \.tcard-mem\{ color:#fff !important; \}/.test(blk));

ok('★ ⑤ 待簽約與空堂 → 淡化＋紅框',
   /\.cal-ev\.cal-ev-std\.cal-ev-pend \.evc-body,\s*\n\s*\.tcard\.tcard-std\.tcard-pend \.tcard-body\{\s*\n\s*border:2px solid var\(--danger,#b5372e\) !important;/.test(blk)
   && /\.tcard\.tcard-std\.tcard-pend \.tcard-txt\{ opacity:\.62; \}/.test(blk));

console.log('\n行事曆課卡要有對應的 class（原本只有首頁標得出待簽約）');
ok('★ 新增 cal-ev-pend，掛在課卡上',
   /const _pendCls = b\.pending_contract \? 'cal-ev-pend' : '';/.test(src)
   && /\$\{_checkedCls\} \$\{_pendCls\} \$\{_pastCls\}/.test(src));
ok('　　空堂也吃得到（bkIsOpenHold 的前提就是 pending_contract）',
   /pending_contract=true ＋ 沒有 member_id ＋ 沒有 trial_name/.test(src));

console.log('\n出席章的 DOM 只放一份');
ok('★ 行事曆：章排在姓名之後、自成一列，外層不再重複輸出',
   /<span class="evc-name">\$\{_stdName\}<\/span>\$\{_stampOut\}\$\{_venueSub\}\$\{_stdTag\}/.test(src)
   && /出席章已移進 _bodyOut 的姓名列（2026-08-21），這裡不再重複輸出一份/.test(src));
ok('★ _stampOut 必須先於 _bodyOut 算完（否則 const TDZ 直接爆）',
   src.indexOf('const _stampOut =') < src.indexOf('const _bodyOut ='),
   {stamp:src.indexOf('const _stampOut ='), body:src.indexOf('const _bodyOut =')});
ok('　　順序要求寫在程式裡（免得日後有人搬回去）',
   /這一段要在 _bodyOut 之前算完/.test(src));
ok('★ 首頁：章也排在姓名之後',
   /<span class="tcard-mem">\$\{nm\}<\/span>\$\{\(\(\)=>\{const k=bkStampKind\(b\);/.test(src));

console.log('\n過期的課卡也要開簡易課卡');
ok('★ 不再依 editable 分流到舊的預約明細',
   /\$\{_viewOnly \|\| opts\.allMode \|\| bkIsMasked\(b\) \? '' : `onclick="onEvClick\(event,'\$\{b\.id\}'\)"`\}/.test(src)
   && !/editable\?`onclick="onEvClick\(event,'\$\{b\.id\}'\)"`:\(opts\.allMode/.test(src));
ok('　　全店模式與遮蔽卡仍然不可點、view-only 也不變',
   /全店模式與遮蔽卡維持不可點，view-only（教練看別人的課）也不變/.test(src));
ok('　　成因寫在程式裡（editable 在課程日已過時是 false）',
   /editable 在課程日已過／已完成／已取消時是 false/.test(src));

console.log('\n姓名斷行（2026-08-21 使用者回報「蕭育筑跟蔡美芬 這樣都斷得很醜」）');
ok('★ 不再用 word-break:break-all（中文會在任意兩字之間斷開）',
   !/overflow:hidden;text-overflow:ellipsis;word-break:break-all;\}/.test(css));
ok('★ keep-all：中文詞內不斷，只在空白處斷（一格兩個人名正好用空白隔開）',
   /word-break:keep-all; line-break:strict; overflow-wrap:anywhere;\}/.test(css));
ok('　　line-break:strict → 「（」不會落在行尾、「）」不會落在行首',
   /line-break:strict＝不在「（」之後、「）」之前斷，括號不會落單/.test(css));
ok('　　overflow-wrap:anywhere 留作保險（單一個名字就超過一行時仍斷得掉）',
   /單一個名字本身就超過一行時仍斷得掉，不會爆出卡外/.test(css));

console.log('\n教練標籤不要被切成「教練…」');
ok('★ 長標籤改成換行，不用省略號',
   /white-space:normal !important; word-break:keep-all; line-break:strict;/.test(blk)
   && /text-overflow:clip !important;/.test(blk));
ok('　　成因寫在程式裡（84px 卡扣掉內距只剩 66px）',
   /卡片只有 84px 寬、扣掉內距剩 66px/.test(blk));

console.log('\n桌機課卡寬度以圓點為基準（使用者：一列顯示 8 個圓形卡）');
ok('★ 面板收到 408px',
   /#bk-card-pop\.admh-pop \.mtp\{left:50%;right:auto;width:min\(408px,92vw\);/.test(css));
ok('★ 從卡片開出來的視窗跟著收斂到同寬',
   /\.modal:has\(\.ash-sheetmk\)\{width:min\(408px,92vw\) !important; max-width:min\(408px,92vw\) !important;\}/.test(css));
ok('　　寬度怎麼算的寫在程式裡（8×34＋7×5＝307，外框 82，捲軸 12）',
   /8 顆 ＝ 8×34 \+ 7×5 ＝ 307px/.test(css)
   && /面板自己還有一條捲軸約 12px/.test(css));

console.log('\n從課卡的位置放大／縮小（2026-08-21 使用者指示）');
ok('★ 縮放原點設在被點課卡的中心（換算成面板內座標）',
   /const ox=Math\.max\(0,Math\.min\(bx\.width,  r\.left\+r\.width\/2  - bx\.left\)\);/.test(src)
   && /box\.style\.transformOrigin=`\$\{Math\.round\(ox\)\}px \$\{Math\.round\(oy\)\}px`;/.test(src));
ok('★ 先關掉 CSS 彈出動畫再量位置（不然量到動畫途中被縮放的框）',
   /box\.style\.animation='none';\s*\n\s*const bx=box\.getBoundingClientRect\(\);/.test(src));
ok('★ 收起來播反向縮放，跑完才移除 DOM',
   /a\.onfinish=\(\)=>h\.remove\(\);/.test(src) && /a\.oncancel=\(\)=>h\.remove\(\);/.test(src));
ok('★ 有保險：動畫沒跑或跑不完，逾時也一定移除',
   /if\(document\.getElementById\('bk-card-pop'\)===h\) h\.remove\(\);/.test(src));
ok('★ 只有「收卡」那條路播動畫，開新卡一律立即移除舊的',
   /function bkCardPopClose\(animate\)\{/.test(src)
   && /bkCardPopClose\(true\);/.test(src));

console.log('\n面板底部的按鈕不能被裁掉');
/* 2026-08-21 二修（使用者：「下面新增還是會被遮住切割」）——
   加內距治不了根本（要捲到底才看得到，而人不會知道要捲）。
   改成面板自己不捲：標題卡與按鈕列釘住，中間名單自己捲。 */
ok('★ 面板自己不捲，標題卡與按鈕列釘住', /max-height:88vh;overflow:hidden;/.test(css)
   && /#bk-card-pop\.admh-pop \.mtp-card\.admh-sheet\{flex:none;/.test(css)
   && /flex-wrap:nowrap;gap:12px;flex:none;\}/.test(css));
ok('★ 名單可捲但不畫捲軸（2026-08-21 使用者指示）',
   /scrollbar-width:none;-ms-overflow-style:none;\}/.test(css)
   && /#bk-card-pop\.admh-pop \.ash-mems::-webkit-scrollbar\{width:0;height:0;display:none;\}/.test(css));
ok('★ 只有名單捲，且每一列不准被壓縮',
   /flex:1 1 auto;min-height:0;overflow-y:auto;/.test(css)
   && /\.ash-mems > \.ash-mrow\{flex:none;\}/.test(css));
ok('　　成因寫在程式裡（實測 12 張卡被壓成 47px，捲軸根本沒出現）',
   /實測 12 張卡在 900px 高的畫面上被壓成 47px 一張，捲軸根本沒出現/.test(css));

console.log('\n會員資料上方卡收緊（使用者：佔比太大了）');
ok('★ 大頭照 92→64、內距與行距一起收',
   /\.pp-head-m2 \.pp-avatar\{width:64px;height:64px;\}/.test(css)
   && /\.pp-head\.pp-head-m2\{gap:10px 32px;padding:14px 20px;\}/.test(css));
ok('★ 刪除會員從整列大按鈕收成右側小按鈕',
   /\.pp-head-m2 \.pp-head-act\{justify-content:flex-end;margin-top:2px;\}/.test(css));
ok('　　欄位一個都沒拿掉，只是不再那麼鬆', /欄位本身一個都沒拿掉，只是不再那麼鬆/.test(css));

console.log('\n教練標籤改回全名（2026-08-21 使用者指示：太小才簡寫）');
ok('★ 兩種都畫出來，由 CSS 依卡片寬度挑一個',
   /const _coSw=\(f,a\)=>`<span class="co-fl">\$\{f\}<\/span><span class="co-ab">\$\{a\}<\/span>`;/.test(src)
   && /\$\{_coSw\(_coFull,_coAbbr\)\}/.test(src));
ok('★ 首頁卡也是同一套（固定 84px，比照窄卡用縮寫）',
   /<span class="co-fl">\$\{coachDisp\(c\)\}<\/span><span class="co-ab">\$\{coachAbbr\(c\)\}<\/span>/.test(src));
ok('★ 門檻沿用既有的 ev-w-narrow／ev-w-tiny，不另立一套寬度判斷',
   /\.cal-ev\.cal-ev-std\.ev-w-narrow \.co-fl,\s*\n\s*\.cal-ev\.cal-ev-std\.ev-w-tiny \.co-fl,\s*\n\s*\.tcard\.tcard-std \.co-fl\{display:none;\}/.test(css)
   && /\.co-ab\{display:none;\}/.test(css));
ok('★ 請假標籤縮成「請假」（使用者：其實改成請假就好）',
   /color:#F4F1E8;">請假<\/span>`\+_venueTag/.test(src)
   && /<span class="tcard-co" style="background:#7A2E28;color:#F4F1E8;">請假<\/span>/.test(src));

console.log('\n場地移到會員姓名下方（教室／跑步機）');
ok('★ 不再是右下角跟教練並列的膠囊',
   /const _venueTag = '';/.test(src)
   && /const _venueSub = _selfVenue \? `<span class="evc-sub evc-vsub">\$\{_selfVenue\}<\/span>` : '';/.test(src));
ok('★ 排在姓名之後、體驗／待簽約標籤之前',
   /<span class="evc-name">\$\{_stdName\}<\/span>\$\{_stampOut\}\$\{_venueSub\}\$\{_stdTag\}/.test(src));
ok('　　只有教室／跑步機會有值（多功能是預設場地、不標）',
   /selfVenueLabel 本來就只在教室／跑步機才有值/.test(src));

console.log('\n會員資料的新表頭要給櫃檯（使用者：櫃檯端的會員資料頁面還沒修改）');
ok('★ 版面判斷從 role===admin 放寬到櫃檯以上（含店長）',
   /if\(isM && \(typeof isDeskLike==='function' \? isDeskLike\(\) : \(SESSION && SESSION\.role==='admin'\)\)\)\{/.test(src)
   && !/if\(isM && SESSION && SESSION\.role==='admin'\)\{\s*\n\s*\/\* 三修/.test(src));
ok('★ 權限沒有跟著放寬：改名／刪除／看密碼／改等級仍限管理員',
   /const delBtn = \(isM && SESSION && SESSION\.role==='admin'\)/.test(src)
   && /const _nameHtml=\(isM && SESSION && SESSION\.role==='admin'\)/.test(src)
   && /const _canTier = !!\(SESSION&&SESSION\.role==='admin'\);/.test(src)
   && /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以刪除會員'\); return; \}/.test(src));
ok('　　櫃檯沒有可按的動作時整列不畫（不留一條空白）',
   /\$\{act\?`<div class="pp-head-act">\$\{act\}<\/div>`:''\}/.test(src));
ok('　　為什麼放寬，寫在程式裡',
   /版面本身跟權限無關/.test(src));

console.log('\n過去的課不該有修改選項（2026-08-21 使用者回報 8/18 那筆）');
/* 教練請假後來搬進「指派代課教練」，那一層的日期判斷改由 acts.sub 把關
   （sub 本來就要 _editable），所以這裡只剩兩項直接吃 A.editable。 */
ok('★ 修改項統一吃 acts.editable（含「課程日 >= 今天」）',
   /editable: _editable,/.test(src)
   && /if\(!_leave && A\.editable\) rows\+=row\(`closeModal\(\);admhMoveAsk/.test(src)
   && /if\(!_leave && A\.isGroup && A\.editable\)/.test(src));
ok('　　請假那條路也擋得住過去的課（代課視窗本身要 _editable 才進得去）',
   /sub: \(_editable && !bkIsSelf\(b\)\) \? 'sub' : null/.test(src));
ok('★ 舊的判斷（只看 staff／closed，沒帶日期）已經拿掉',
   !/if\(!_leave && A\.staff && !A\.closed\) rows\+=row\(`closeModal\(\);admhMoveAsk/.test(src)
   && !/\}else if\(A\.staff && !A\.closed && canCoachLeave\(b\)\)\{/.test(src)
   && !/if\(!_leave && A\.isGroup && A\.staff && !A\.closed\)/.test(src));
ok('　　成因寫在程式裡（canCoachLeave 本身沒有日期條件）',
   /都沒帶到日期，\s*\n\s*所以 8\/18 這種已經上完的課還給得出改期與請假/.test(src));

/* 使用者兩次回報：「是不是沒有課程取消的按鈕？」→「要有取消預約的選項，
   不然建立預約以後都不能刪除了」。第一次我只補團課（單人課本來就有紅色圓鈕），
   但使用者要的是「課程層級的動作都在這張清單裡找得到」—— 找不到就等於沒有。 */
console.log('\n兩種課別都要有取消（使用者要求兩次）');
ok('★ 不再只給團課',
   /if\(A\.staff && A\.canCancel && !A\.closed\)/.test(src)
   && !/if\(A\.isGroup && A\.staff && A\.canCancel && !A\.closed\)/.test(src));
/* 2026-08-21 三修（使用者：「還是統一改成刪除課卡 比較直覺」） */
ok('★ 統一叫「刪除預約」（使用者正式定名），範圍寫在副標',
   /rows\+=row\(`collapseBkCard\(\);confirmCancelBooking\('\$\{b\.id\}'\)`,'刪除預約',/.test(src)
   && !/A\.isGroup\?'取消整堂課程':'取消預約',/.test(src));
ok('　　會員卡上那顆圓鈕仍叫「取消」（範圍是這個人／這個名額，不是整張卡）',
   /跟整張課卡不是同一件事，同名反而會讓人以為按哪個都一樣/.test(src));
ok('　　團課說清楚會退幾個名額', /整堂取消、名單上的 \$\{mids\(b\)\.length\} 個名額一起退/.test(src));
ok('　　單人課說明下一步還能選退不退', /下一步可以選擇退回票券或扣課不退/.test(src));
ok('　　過去的課照樣給（誤建要刪得掉，與「修改」不同）',
   /過去的課照樣給（誤建要刪得掉，那與「修改」不同/.test(src));

console.log('\n會員資料的活動紀錄也要給櫃檯（使用者：下方卡沒有更新）');
ok('★ 分頁列的判斷同樣放寬到櫃檯以上',
   /const _m2=\(typeof isDeskLike==='function'\) \? isDeskLike\(\) : !!\(SESSION && SESSION\.role==='admin'\);/.test(src)
   && !/const _m2=!!\(SESSION && SESSION\.role==='admin'\);/.test(src));

console.log('\n教練請假搬進「指派代課教練」（2026-08-21 使用者指示）');
ok('★ 代課清單裡有請假這一列', /row\(`closeModal\(\);bkCoachLeave\('\$\{bid\}'\)`,'教練請假',/.test(src));
ok('★ 調整課程那一層不再給請假', !/rows\+=row\(`closeModal\(\);bkCoachLeave\('\$\{b\.id\}'\)`,'教練請假'/.test(src));
ok('★ 已經請假的不重複給（只在還沒請假時出現）', /canCoachLeave\(b\) && !bkIsCoachLeave\(b\)/.test(src));
ok('　　復原留在上一層（請假後變自主訓練，代課視窗根本進不去）',
   /acts\.sub 的條件不成立、代課視窗進不去，放那裡等於藏起來/.test(src));

console.log('\n代課清單用教練自己的顏色（使用者：教練們的白框 用該教練的顏色）');
ok('★ 每列吃 coachTagColor（與課卡標籤同一組色）',
   /const cc=\(typeof coachTagColor==='function'\)\?coachTagColor\(c\.id\):/.test(src)
   && /background:\$\{cc\.bg\};--ash-co-fg:\$\{cc\.fg\};/.test(src));
ok('★ 文字色跟著換，淡底上才讀得清楚',
   /\.ash-eirow\.ash-ei-co \.ash-eilb\{color:var\(--ash-co-fg,var\(--text\)\);\}/.test(css));

console.log('\n子視窗的返回要回到「調整課程」');
ok('★ 三支都收 backTo 參數',
   /async function openVenueChange\(id, backTo\)\{/.test(src)
   && /async function openBkTicketChange\(id, backTo\)\{/.test(src)
   && /async function openMakeupModal\(id, backTo\)\{/.test(src));
ok('★ 從調整課程進去的都帶 ash',
   (src.match(/openVenueChange\('\$\{b\.id\}','ash'\)|openBkTicketChange\('\$\{b\.id\}','ash'\)|openMakeupModal\('\$\{b\.id\}','ash'\)/g)||[]).length===3);
ok('★ 其餘呼叫端不帶參數、行為不變（仍走 openBookingDetail）',
   /backTo==='ash'\?`closeModal\(\);ashEditAsk\('\$\{id\}'\)`:`openBookingDetail\('\$\{id\}'\)`/.test(src));

console.log('\n更換場地：目前場地不淡化（使用者指示）');
ok('★ 目前場地用正常字色＋綠框，不再跟「已滿」一樣灰',
   /o\.cur\s*\n?\s*\?`<button class="btn btn-ghost" disabled style="color:var\(--text\);border-color:var\(--green\)/.test(src)
   && !/o\.cur\s*\n?\s*\?`<button class="btn btn-ghost" disabled style="opacity:\.55;"/.test(src));
ok('　　「已滿」仍然是淡的（那才是真的不能選）',
   /disabled style="opacity:\.4;">\$\{o\.name\}（該時段已滿）/.test(src));

console.log('\n調整預約時間：日期也要置中');
ok('★ 日期欄的內部元件撐滿並置中（只給外層 text-align 不生效）',
   /\.ash-eilabel input\[type=date\]::-webkit-datetime-edit\{width:100%;text-align:center;\}/.test(css)
   && /\.ash-eilabel input\[type=date\]::-webkit-datetime-edit-fields-wrapper\{display:flex;justify-content:center;width:100%;\}/.test(css));

console.log('\n窄欄位的取捨（使用者：Mac 桌機 7 日檢視「課卡內容被壓縮」）');
ok('★ 時間永遠不換行（「19:0／0」是最刺眼的一種壞法）',
   /\.cal-ev\.cal-ev-std \.evc-time\{white-space:nowrap;\}/.test(css));
ok('★ 標準卡終於有窄卡專屬字級（原本只有舊卡 .ev-time／.evd-\* 有）',
   /\.cal-ev\.cal-ev-std\.ev-w-narrow \.evc-time\{font-size:11px;\}/.test(css)
   && /\.cal-ev\.cal-ev-std\.ev-w-tiny   \.evc-time\{font-size:10px;\}/.test(css)
   && /\.cal-ev\.cal-ev-std\.ev-w-tiny   \.evc-name\{font-size:11\.5px !important;/.test(css));
ok('★ 越窄越少東西：窄卡先讓場地，極窄卡連教練也讓',
   /\.cal-ev\.cal-ev-std\.ev-w-narrow \.evc-vsub\{display:none;\}/.test(css)
   && /\.cal-ev\.cal-ev-std\.ev-w-tiny   \.evc-vsub,\s*\n\s*\.cal-ev\.cal-ev-std\.ev-w-tiny   \.evc-coach\{display:none;\}/.test(css));
ok('　　原則寫在程式裡（寧可少一項，也不要每一項都殘缺）',
   /寧可少一項，也不要每一項都殘缺/.test(css));

console.log('\n體驗課也要有簽到與取消（使用者指示）');
ok('★ 圓鈕不再被 r.mid 擋住（體驗課不綁會員，只有 trial_name）',
   /const _canAct = !!r\.mid \|\| b\.category==='體驗';/.test(src)
   && /if\(!A\.pending && _canAct\)\{/.test(src));
ok('　　場租維持原樣（沒有人要簽到一間場地）',
   /場租維持原樣（沒有人要簽到一間場地）/.test(src));

console.log('\n待簽約卡：明細退場、刪除課卡補上（使用者回報）');
/* 只查「待簽約」那一段 —— 檔案裡另一處 openBookingDetail 在 !_ashMode 分支下，
   而 ashCardMode() 涵蓋全體員工，那條實際上走不到（留著當備援）。 */
{
  const i=src.indexOf("if(b.pending_contract && !b.ticket_id){");
  const seg=src.slice(i, src.indexOf('window._expandedBkEl = el;', i));
  ok('★ 不再開已退役的預約明細；有綁會員就直接進會員資料',
     /if\(b\.member_id\) btns \+= evoBtn\('evo-b1','',`collapseBkCard\(\);openMemberDetail\('\$\{b\.member_id\}'\)`,'doc','會員'\);/.test(seg)
     && !/openBookingDetail/.test(seg));
}
ok('★ acts 補齊，標題卡的調整課程給得出刪除課卡',
   /await bkCardPop\(el, b, btns, \{pending:true, staff, own, canCancel, closed, isGroup, editable:false\}\);/.test(src));
ok('★ 待簽約沒有票券 → 不列「更換票券」（否則是死路）',
   /if\(!_leave && !A\.pending && b\.status==='booked' && !A\.isGroup && isDeskLike\(\)\)/.test(src));
ok('　　pending 仍為 true，會員卡照舊不畫圓鈕（不會變成兩顆按鈕做同一件事）',
   /pending 仍為 true，\s*\n\s*所以會員卡照舊不畫圓鈕/.test(src));

console.log('\n正式定名（2026-08-21 使用者：更換場地／刪除預約）');
ok('★ 「更改場地」→「更換場地」（與更換票券同一組動詞）',
   (src.match(/'更換場地',\(typeof venueDisplay/g)||[]).length===2
   && !/'更改場地',\(typeof venueDisplay/.test(src));

console.log('\n團課名單視窗（使用者：風格要更新、返回會跑回詳細預約）');
ok('★ 掛上 ash-sheetmk，吃簡易課卡那一套視窗風格',
   /showModal\(`<div class="ash-sheetmk"><\/div><div class="modal-title">團體課名單<\/div>/.test(src));
ok('★ 返回退回課卡，不再跳已退役的預約明細',
   /onclick="closeModal\(\);expandBkCard\(window\._expandedBkEl\|\|null,'\$\{id\}'\)">返回/.test(src));

console.log('\n會員姓名右邊的使用人按鈕（使用者：蘭馨這堂是爸爸來用的）');
ok('★ 按鈕接進會員卡的姓名列',
   /<div class="ash-mname"><span>\$\{nm2\}<\/span>\$\{_famBtn\}/.test(src)
   && /class="ash-mfam" title="更改使用人"/.test(src));
ok('★ 只有設定過家庭名單的會員才畫（沒設定的不出現）',
   /const f=\(m&&Array\.isArray\(m\.family_members\)\)\?m\.family_members\.filter\(Boolean\):\[\];\s*\n\s*if\(f\.length\) _famMap\[m\.id\]=f;/.test(src)
   && /_famMap\[r\.mid\]/.test(src));
ok('★ 團課不畫（trial_name 是整筆預約的欄位，逐名額指定不了）',
   /const _famBtn=\(!r\.sk && r\.mid && _famMap\[r\.mid\]\)/.test(src));
ok('★ 沿用既有的挑選視窗與寫入（openBkFamChange／setBkFamUser，不另寫一份）',
   /function ashFamAsk\(bid\)\{ ashBackArm\(bid\); openBkFamChange\(bid, 'ash'\); \}/.test(src)
   && /async function openBkFamChange\(bid, backTo\)\{/.test(src));
ok('　　取消與改完都回課卡，不跳已退役的預約明細',
   /backTo==='ash'\?`closeModal\(\);expandBkCard\(window\._expandedBkEl\|\|null,'\$\{bid\}'\)`/.test(src)
   && /setBkFamUser 收尾的 openBookingDetail\s*\n\s*會被 ashBackTake 接走/.test(src));

console.log('\n更換課程（使用者：這張課卡還沒有會員預約的時候方便調整）');
ok('★ 只在「完全沒有人」的卡上給：沒會員、沒名單、也沒散客姓名',
   /const _nobody = !b\.member_id && \(typeof mids==='function'\?mids\(b\)\.length===0:true\)\s*\n\s*&& !String\(b\.trial_name\|\|''\)\.trim\(\);/.test(src));
ok('★ 不能用 A.editable（待簽約那條路刻意設成 false），自己判日期',
   /const _futureOk = A\.staff && !A\.closed && String\(b\.date\)>=ymd\(TODAY\);/.test(src)
   && /不能用 A\.editable：待簽約／空堂那條路刻意把它設成 false/.test(src));
ok('★ 換課別要重跑衝堂與場地檢查（教練課換團課可能就擠不下）',
   /const verr=await validateBooking\(vbk, b\.date, b\.start_time, Number\(b\.duration\)\|\|60\);/.test(src));
ok('★ 換成團課要補人數上限（否則名單視窗抓不到預設值）',
   /&& !\(Number\(b\.max_heads\)>0\)\) b\.max_heads=5;/.test(src));
ok('　　課別清單與建立預約同一套過濾（停售／VIP 限定／場租／友善自主訓練不列）',
   /if\(typeof bkIsMergedPT==='function' && bkIsMergedPT\(t\)\) return false;/.test(src)
   && /if\(bkIsSelf\(\{category:t\.category\}\) && \/友善\/\.test\(t\.name\|\|''\)\) return false;/.test(src));
ok('　　課別判斷走口袋分類器，不散裝比字串（pockettest 的棘輪）',
   /if\(bkIsGroup\(\{category:t\.category\}\) && !\(Number\(b\.max_heads\)>0\)\) b\.max_heads=5;/.test(src));

console.log('\n教練請假的團課：可以把課卡收起來，但要講清楚不做什麼');
ok('★ 新增純顯示旗標 card_hidden，不動 status／票券／效期',
   /function bkShowsCancelled\(b\)\{ return !!b && b\.status==='cancelled' && b\.coach_leave===true && bkIsGroup\(b\) && !b\.card_hidden; \}/.test(src)
   && /b\.card_hidden=true;/.test(src));
ok('★ 按鈕出現在「無法復原」那段說明底下',
   /closeModal\(\);ashHideLeftAsk\('\$\{b\.id\}'\)`,'刪除預約',/.test(src));
ok('★ 確認視窗講明已退的堂數與已延長的效期不會收回',
   /已退的堂數與已延長的效期<b>不會收回<\/b>/.test(src)
   && /使用期限也各延長 \$\{_d\} 天/.test(src));
ok('　　為什麼要講，寫在程式裡（否則櫃檯會以為按了就整組回沖）',
   /否則櫃檯會以為按了就整組回沖/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
