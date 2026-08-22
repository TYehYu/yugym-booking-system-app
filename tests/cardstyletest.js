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

/* 三修：「桌機版課卡 移除出席章好了」→ 四修（同日）：「不要用填滿的 只要在會員姓名
   右邊顯示出席章」。首頁課卡的最終樣子驗在下面「簽到的課卡不填滿」那一段；
   這裡只留「行事曆那半邊沒被動到」。 */
/* 2026-08-21 五修：行事曆也改成「不填滿＋姓名右邊的章」，與首頁統一。
   這一段原本驗的是「行事曆維持角標隱藏＋整卡填滿」，整組換掉；
   現在的行為驗在下方「桌機行事曆也不填滿了」。 */
ok('★ ③ 行事曆課卡改成畫出席章（不再隱藏）',
   !/\.cal-ev\.cal-ev-std \.evc-check\{ display:none !important; \}/.test(blk)
   && /<span class="evc-check"/.test(src));
ok('★ ④ 行事曆已簽到 → 不填滿了（那一組規則已刪除）',
   !/\.cal-ev\.cal-ev-std\.cal-ev-checked \.evc-body\{/.test(blk)
   && /已簽到不再填滿 —— 那一組規則直接刪掉了/.test(blk));

/* 2026-08-21：淡化改暗化（驗在下方「待簽約／待付款的課卡也改暗化」） */
ok('★ ⑤ 待簽約與空堂 → 暗化＋紅框',
   /\.cal-ev\.cal-ev-std\.cal-ev-pend \.evc-body,\s*\n\s*\.tcard\.tcard-std\.tcard-pend \.tcard-body\{\s*\n\s*border:2px solid var\(--danger,#b5372e\) !important;/.test(blk)
   && /\.tcard\.tcard-std\.tcard-pend\{ filter:brightness\(0\.9\) saturate\(0\.72\); \}/.test(blk));   /* 0822 與過期／教練請假團課統一數值 */

console.log('\n行事曆課卡要有對應的 class（原本只有首頁標得出待簽約）');
ok('★ 新增 cal-ev-pend，掛在課卡上',
   /const _pendCls = b\.pending_contract \? 'cal-ev-pend' : '';/.test(src)
   && /\$\{_checkedCls\} \$\{_pendCls\} \$\{_pastCls\}/.test(src));
ok('　　空堂也吃得到（bkIsOpenHold 的前提就是 pending_contract）',
   /pending_contract=true ＋ 沒有 member_id ＋ 沒有 trial_name/.test(src));

console.log('\n出席章的 DOM 只放一份');
ok('★ 行事曆：章排在姓名之後、自成一列，外層不再重複輸出',
   /<span class="evc-nmrow"><span class="evc-name">\$\{_stdName\}<\/span>\$\{_stampOut\}<\/span>\$\{_venueSub\}\$\{_stdTag\}/.test(src)
   && /出席章已移進 _bodyOut 的姓名列（2026-08-21），這裡不再重複輸出一份/.test(src));
ok('★ _stampOut 必須先於 _bodyOut 算完（否則 const TDZ 直接爆）',
   src.indexOf('const _stampOut =') < src.indexOf('const _bodyOut ='),
   {stamp:src.indexOf('const _stampOut ='), body:src.indexOf('const _bodyOut =')});
ok('　　順序要求寫在程式裡（免得日後有人搬回去）',
   /這一段要在 _bodyOut 之前算完/.test(src));
/* 2026-08-21 四修：章移到姓名同一列（.tcard-nmrow 包住兩者），
   「第幾堂／共幾堂」則排在那一列的下面。 */
ok('★ 首頁：章緊接在姓名右邊',
   /<span class="tcard-nmrow"><span class="tcard-mem">\$\{nm\}<\/span>\$\{\(\(\)=>\{const k=bkStampKind\(b\);/.test(src));

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
/* 2026-08-21 二修（使用者：「下面應該要切齊視窗底部」）：88vh→96vh。
   實測 415×740：1 張卡 252px 置中、3 張 504px 置中、5 張以上撐到 710px（上下各 15px）並自己捲。 */
ok('★ 面板自己不捲，標題卡與按鈕列釘住', /max-height:96vh;overflow:hidden;/.test(css)
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
ok('★ 首頁卡也是同一套（兩種都畫，由 CSS 挑）',
   /<span class="co-fl">\$\{coachDisp\(c\)\}<\/span><span class="co-ab">\$\{coachAbbr\(c\)\}<\/span>/.test(src));
/* 2026-08-21 二修（使用者：「首頁課卡右下角應該可以顯示完整教練標籤」）——
   首頁卡當天從 84px 加寬到 120px，「比照窄卡用縮寫」的理由消失了。 */
ok('★ 首頁卡改回顯示全名（不再跟著窄卡用縮寫）',
   !/\.tcard\.tcard-std \.co-fl\{display:none;\}/.test(css)
   && !/\.tcard\.tcard-std \.co-ab\{display:inline;\}/.test(css)
   && /首頁卡當天從 84px 加寬到 120px，原本「比照窄卡用縮寫」的理由消失了/.test(css));
ok('★ 行事曆的窄卡規則不動（那邊真的窄）',
   /\.cal-ev\.cal-ev-std\.ev-w-narrow \.co-fl,\s*\n\s*\.cal-ev\.cal-ev-std\.ev-w-tiny \.co-fl\{display:none;\}/.test(css)
   && /\.co-ab\{display:none;\}/.test(css));
ok('　　太長的名字折行、不切成「…」（0821 已有的規則接手）',
   /white-space:normal !important; word-break:keep-all/.test(css));
ok('★ 請假標籤縮成「請假」（使用者：其實改成請假就好）',
   /color:#F4F1E8;">請假<\/span>`\+_venueTag/.test(src)
   && /<span class="tcard-co" style="background:#7A2E28;color:#F4F1E8;">請假<\/span>/.test(src));

console.log('\n場地移到會員姓名下方（教室／跑步機）');
ok('★ 不再是右下角跟教練並列的膠囊',
   /const _venueTag = '';/.test(src)
   && /const _venueSub = _selfVenue \? `<span class="evc-sub evc-vsub">\$\{_selfVenue\}<\/span>` : '';/.test(src));
ok('★ 排在姓名之後、體驗／待簽約標籤之前',
   /<span class="evc-nmrow"><span class="evc-name">\$\{_stdName\}<\/span>\$\{_stampOut\}<\/span>\$\{_venueSub\}\$\{_stdTag\}/.test(src));
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
  /* 2026-08-21 二修：連「會員」鈕也拿掉了（點會員卡就會進會員資料）——
     這一段現在完全不開任何舊視窗。 */
  ok('★ 不再開已退役的預約明細，也不重複給會員入口',
     !/openBookingDetail/.test(seg) && !/'doc','會員'/.test(seg));
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
/* 2026-08-21 二修：團課從「不畫」改成「改票券」——見下方「團課名額的使用人按鈕」。 */
ok('★ 單人課走 r.sk 為空那一支',
   /if\(!r\.sk\)\{\s*\n\s*_famBtn=`<button type="button" class="ash-mfam" title="更改使用人"/.test(src));
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
/* 2026-08-21：原本只濾掉「友善自主訓練」（與自主訓練同行為、不重複列）；
   後來使用者確認空堂不能是自主訓練，於是整個課別都不列，這條併進下面那一項。 */
ok('　　課別清單與建立預約同一套過濾（停售／VIP 限定／場租不列）',
   /if\(typeof bkIsMergedPT==='function' && bkIsMergedPT\(t\)\) return false;/.test(src)
   && /if\(t\.category==='場租'\) return false;/.test(src));
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

console.log('\n待簽約卡的下一步：安排會員 → 儲值 → 轉正 →（簽到）');
ok('★ 「會員」鈕拿掉（點會員卡本來就會進會員資料）',
   !/evoBtn\('evo-b1','',`collapseBkCard\(\);openMemberDetail\('\$\{b\.member_id\}'\)`,'doc','會員'\)/.test(src)
   && /onclick="collapseBkCard\(\);openMemberDetail\('\$\{r\.mid\}'\)"/.test(src));
ok('★ 沒排人 → 安排會員',
   /if\(!b\.member_id\)\{\s*\n\s*btns \+= evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);openBindPending/.test(src));
/* 2026-08-21：分期保留走「分期」，一般待簽約才走「儲值」 */
ok('★ 有人沒票 → 儲值（開銷售視窗，會員已預選）',
   /: evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);ppTopUp\('\$\{b\.member_id\}'\)`,'plus','儲值'\)\);/.test(src)
   && /function ppTopUp\(mid\)\{\s*\n\s*window\._salesPreMember=mid;/.test(src));
ok('★ 有票沒綁 → 轉正',
   /_hasTk\s*\n?\s*\? evoBtn\('evo-r2','evo-primary',`ashBackArm\('\$\{id\}'\);collapseBkCard\(\);openConvertPending/.test(src));
ok('★ 有無票券用既有的 listUsableTickets 判（與步驟 2 挑票同一支）',
   /_hasTk=\(\(await listUsableTickets\(b\.member_id, b\.ticket_type_id, b\.date, b\.start_time\)\)\|\|\[\]\)\.length>0;/.test(src));
ok('　　綁完就走一般卡，簽到本來就在會員卡上，第三段不必重畫',
   /綁完之後這張卡就走一般路徑，簽到鈕本來就在會員卡上，所以第三段不必在這裡畫/.test(src));

console.log('\n沒有票券圓點的卡不要細成一條（使用者：會員卡太細了 畫面重量失衡）');
ok('★ 卡片與旁邊的圓鈕欄等高（兩顆 47＋間距 6＝100）',
   /min-height:100px;box-sizing:border-box;\}/.test(css));
ok('★ 沒有圓鈕的卡不撐高（待簽約／空堂，免得一片空白）',
   /\.ash-mrow:not\(:has\(\.ash-morbs\)\) \.ash-mcard\{min-height:0;\}/.test(css));
ok('★ 補一行這張卡真正該有的資訊，不是留白',
   /if\(b\.category==='體驗'\) _noTkSub=`體驗課・不扣票券/.test(src)
   && /else if\(b\.category==='場租'\) _noTkSub=`場地租借/.test(src)
   && /\? '分期待繳費・尚未綁定票券' : '待簽約・尚未綁定票券';/.test(src));
ok('★ 有票券圓點的卡不受影響（只在 !_tk 時才補）',
   /if\(!_tk && !r\.sk\)\{/.test(src));
ok('　　體驗帶聯絡電話（櫃檯真的會用到）',
   /const _ph=String\(b\.trial_phone\|\|''\)\.trim\(\);/.test(src));

console.log('\n改使用人：要先確認，改完不能跑到左上角');
ok('★ 選了之後先跳確認（講清楚從誰改成誰）',
   /async function ashFamConfirm\(bid, name, backTo\)\{/.test(src)
   && /這一堂的使用人從「<b>\$\{escH\(_from\)\}<\/b>」改成「<b>\$\{escH\(_to\)\}<\/b>」/.test(src));
ok('★ 目前那位不給按（按了也是同一個結果）', /\$\{cur===v\?'　（目前）':''\}/.test(src));
ok('★ 確認文案講明只改「誰來上」，不動票券',
   /只改「這堂是誰來上」，扣的還是同一張票券、堂數不變/.test(src));
ok('★ 錨點脫離 DOM 時退回置中（改完 navTo 重畫，原本那張課卡已經不在）',
   /const _elOk = !!\(el && el\.isConnected && el\.getBoundingClientRect/.test(src)
   && /if\(!isMobileLayout\(\) && _elOk\)\{/.test(src));
ok('　　成因寫在程式裡（拿脫離 DOM 的元素量會全拿到 0）',
   /拿一個已脫離 DOM 的元素去 getBoundingClientRect\(\) 會全部拿到 0/.test(src));

console.log('\n分期保留要走「開通下一期」而不是「儲值」（使用者：這堂其實是分期）');
ok('★ 用 bkIsInstHold 分辨（靠建立保留時寫的 note 標記）',
   /const _isInst=\(typeof bkIsInstHold==='function'\) && bkIsInstHold\(b\);/.test(src)
   && /_isInst\s*\n?\s*\? evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);ashInstNext\('\$\{id\}'\)`,'plus','分期'\)/.test(src));
ok('★ 副標也分得出來（分期待繳費 vs 待簽約）',
   /\? '分期待繳費・尚未綁定票券' : '待簽約・尚未綁定票券';/.test(src));
ok('★ openInstallNext 吃票券 id，所以要先從預約找出那張分期票',
   /async function ashInstNext\(bid\)\{/.test(src)
   && /&& \(\(Number\(x\.sessions_total\)\|\|0\)-\(Number\(x\.unlocked_sessions\)\|\|0\)\)>0\)/.test(src));
ok('　　找不到分期票就退回儲值，不留死路',
   /showToast\('找不到還有未開通堂數的分期票券，改用儲值'\);\s*\n\s*return ppTopUp\(b\.member_id\);/.test(src));

console.log('\n團課名單：5 人要完整顯示、請假卡不突兀');
ok('★ 取消請假搬到右邊圓鈕（卡片內不再塞長按鈕）',
   /_outOrbs \+= evoBtn\('','',`ashSeatAct\('\$\{b\.id\}','leave','\$\{r\.mid\}'\)`,'undo','取消請假'\);/.test(src)
   && !/_leaveBtn=`<button type="button" class="ash-mlv ash-mlv-on"/.test(src));
ok('　　動作參數仍用 r.mid（取消請假是按人找回名額，用 sk 會取消錯人）',
   /動作參數沿用原本的 r\.mid（不是 r\.sk）/.test(src));
ok('★ 卡片瘦身讓 5 張塞得下（內距 11→9、名單間距 8→7、面板間距 18→13）',
   /padding:9px 14px 9px 15px;/.test(css)
   && /\.ash-mems\{display:flex;flex-direction:column;gap:7px;/.test(css)
   && /flex-direction:column;gap:13px;padding:2px 0 12px;/.test(css));

console.log('\n非團課的簽到／取消擺回下方（使用者指示）');
ok('★ 單人課走下方那一排，團課仍逐名額掛在自己那一列',
   /if\(\(!_ashMode \|\| !isGroup\) && canCancel && own\)\{/.test(src)
   && /if\(\(!_ashMode \|\| !isGroup\) && !_calCtx && \(staff\|\|coachCk\) && !closed\)\{/.test(src));
ok('★ 會員卡右側不再重複畫同一組按鈕（只留團課的舊資料分支）',
   /\}else if\(A\.isGroup\)\{/.test(src)
   && /一般單人課走下方那一排（2026-08-21），這裡不再重複畫/.test(src));
ok('★ 標題卡再縮短（內距 18→13、色條跟著收、第二列間距 9→6）',
   /padding:13px 18px 13px 26px;box-shadow:0 10px 30px rgba\(30,25,15,\.3\);\}/.test(css)
   && /\.ash-bar\{position:absolute;left:12px;top:12px;bottom:12px;/.test(css)
   && /\.ash-meta\{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px;/.test(css));
ok('　　為什麼搬（為了兩顆按鈕把卡撐到 100px 高）',
   /右邊掛兩顆圓鈕等於為了兩顆按鈕把卡撐到 100px 高/.test(css.length?src:src));

console.log('\n空堂不能是自主訓練（使用者：自主訓練必須要有票券才能建立）');
ok('★ 更換課程的清單整個不列自主訓練（那張卡沒有人＝沒有點數可扣）',
   /if\(bkIsSelf\(\{category:t\.category\}\)\)\{[\s\S]{0,260}?return false;\s*\n\s*\}/.test(src));
ok('★ 空堂建立本身也擋（不倚賴建立預約那邊的手機過濾）',
   /if\(bkIsSelf\(\{category:t\.category\}\)\)\{\s*\n\s*showToast\('自主訓練要有票券才能建立，請改用「選擇會員」'\);\s*\n\s*return;\s*\n\s*\}/.test(src));
ok('　　為什麼要各自擋一次，寫在程式裡（原本只是「剛好擋住」，不是規則）',
   /但那是「剛好擋住」，不是規則本身。規則寫在這裡，日後桌機開放也守得住/.test(src));

console.log('\n自家日期挑選器（使用者：這邊的按鈕 有更符合我們風格的方式嗎）');
ok('★ 欄位換成自家按鈕＋隱藏 input（讀值的程式一行都不用改）',
   /function ashDateField\(id, value, min, onchange\)\{/.test(src)
   && /<input type="hidden" id="\$\{id\}"/.test(src)
   && /\$\{ashDateField\('bk-date', pf\.date\|\|'', '', 'bkRefreshPlanFilter\(\)'\)\}/.test(src)
   && /\$\{ashDateField\('amv-d', b\.date, ymd\(TODAY\)\)\}/.test(src));
ok('★ 兩個原生 input[type=date] 都換掉了',
   !/<input type="date" id="bk-date"/.test(src) && !/<input type="date" id="amv-d"/.test(src));
ok('★★ 不能用 showModal —— 日期欄長在「建立預約」那張視窗裡，一開日曆整張表單就沒了',
   /function ashDateClose\(\)\{ const h=document\.getElementById\('adp-sheet'\); if\(h\) h\.remove\(\); \}/.test(src)
   && /host\.id='adp-sheet'/.test(src)
   && /它會先清掉現有的 \.modal-bg，/.test(src));
ok('★ 浮層疊在 modal 之上（modal-bg 是 9750）', /#adp-sheet\{position:fixed;inset:0;z-index:10090;\}/.test(css));
ok('★ onchange 掛在隱藏 input 上，原本的 bkRefreshPlanFilter 照樣會跑',
   /try\{ inp\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\); \}catch\(_\)\{\}/.test(src)
   && /onchange 掛在隱藏 input 上/.test(src));
/* 2026-08-21 二修：月曆換成捲動清單，下限改用「清單從下限開始長」實作 —— 過去的日子根本不列 */
ok('★ 單位標在滾輪下方，不跟著捲',
   /<div class="wh-unit"><span>年<\/span><span>月<\/span><span>日<\/span><\/div>/.test(src)
   && /<div class="wh-unit wh-unit-2"><span>時<\/span><span>分<\/span><\/div>/.test(src));
ok('　　營業時間 08–22、分鐘只有整點與半點',
   /const hours=Array\.from\(\{length:15\},\(_,i\)=>\(\{v:i\+8/.test(src)
   && /const mins=\[\{v:'00',label:'00'\},\{v:'30',label:'30'\}\];/.test(src));

console.log('\n時間也用自家挑選器（使用者：這邊也是）');
ok('★ 兩處時間欄都換掉原生 select',
   /\$\{ashTimeField\('bk-time', pf\.time\|\|'', 'bkRefreshPlanFilter\(\)'\)\}/.test(src)
   && /\$\{ashTimeField\('amv-t', b\.start_time\)\}/.test(src)
   && !/<select id="bk-time"/.test(src) && !/<select id="amv-t"/.test(src));
ok('★ 與日期共用同一層浮層（不會再蓋掉底下的表單）',
   /function ashTimeOpen\(id\)\{[\s\S]{0,600}?host\.id='adp-sheet'/.test(src));
console.log('\n更換場地：沒填 venue_unit 也要認得出預設場地');
ok('★ 抽出 venueEffId 當唯一來源（venueDisplay 一直這樣顯示，那張視窗沒跟上）',
   /function venueEffId\(b\)\{/.test(src)
   && /return bkIsGroup\(b\) \? 'group' : 'multi';/.test(src)
   && /const curVid=venueEffId\(b\);/.test(src));
ok('★ 抬頭也改用 venueDisplay（原本讀 venueName(b.venue_unit) 會寫「目前：—」）',
   /目前：\$\{\(typeof venueDisplay==='function'\?venueDisplay\(b\):''\)\|\|'—'\}/.test(src));
ok('　　bkTimeOptions 保留（會員快速預約與班表還在用）',
   /function bkTimeOptions\(selected, opts\)\{/.test(src)
   && /bkTimeOptions 其他流程還在用（會員快速預約、班表），所以函式保留/.test(src));

console.log('\n課程也換自家挑選器；日期改成捲動清單；連續預約星期一列');
/* 只查建立預約那張表單 —— 別處還有一個同 id 的暫時 select（tkFitsBooking 的沙箱用） */
ok('★ 課程欄不再是原生 select', (()=>{
  const i=src.indexOf('<div class="modal-title">建立預約</div>');
  const form=src.slice(i, src.indexOf('onclick="bkStep2()"', i));
  return !/<select id="bk-type"/.test(form)
    && /<button type="button" class="adp-field" id="bk-type-btn" onclick="ashTypeOpen\(\)">/.test(form);
})());
ok('　　每一列帶課種色塊（與課卡的顏色語彙一致）',
   /<span class="adp-sw" style="background:\$\{col\};"><\/span>/.test(src));
/* 2026-08-21 三修（使用者附圖 iOS 滾輪＋「只要一列就可以完成」）：
   月曆 → 捲動清單 → 滾輪。日期與時間各一欄，捲到哪一格就是哪一個。 */
ok('★ 滾輪：中央高亮帶＋scroll-snap＋上下遮罩淡出',
   /<div class="wh-band"><\/div>/.test(src)
   && /scroll-snap-type:y mandatory/.test(css)
   && /-webkit-mask-image:linear-gradient\(180deg,transparent 0,#000 26%,#000 74%,transparent 100%\)/.test(css));
/* 2026-08-21 四修（使用者附圖）：一欄 → 各欄獨立滾動。
   日期年／月／日三欄、時間時／分兩欄；年月日不顯示星期。 */
ok('★ 日期三欄（年／月／日）獨立滾動',
   /<div class="wh-wrap wh-3">/.test(src)
   && /\$\{ashWheelCol\('y',years,base\.getFullYear\(\)\)\}/.test(src)
   && /\$\{ashWheelCol\('m',months,base\.getMonth\(\)\+1\)\}/.test(src)
   && /\$\{ashWheelCol\('d',days,base\.getDate\(\)\)\}/.test(src));
ok('★ 時間兩欄（時／分）獨立滾動',
   /<div class="wh-wrap wh-2">/.test(src)
   && /\$\{ashWheelCol\('h',hours,ch\)\}/.test(src)
   && /\$\{ashWheelCol\('i',mins,cm\)\}/.test(src));
ok('★ 年月日不顯示星期（使用者指示）',
   /const years=\[\]; for\(let y=y0-1;y<=y0\+2;y\+\+\) years\.push\(\{v:y,label:y\}\);/.test(src)
   && /const months=Array\.from\(\{length:12\},\(_,i\)=>\(\{v:i\+1,label:i\+1\}\)\);/.test(src));
ok('★ 轉年／月時日數要跟著改（2 月 28、4 月 30）',
   /function ashDateFixDays\(\)\{/.test(src)
   && /if\(window\._adpCtx && window\._adpCtx\.mode==='date' && \(key==='y'\|\|key==='m'\)\) ashDateFixDays\(\);/.test(src));
ok('　　超過該月天數的日會被夾到最後一天',
   /const keep=Math\.min\(Number\(ashWheelVal\('d'\)\)\|\|1, days\);/.test(src));
ok('　　有下限時按確定才擋（三欄各自轉，中途一定會經過不合法的組合）',
   /if\(c && c\.min && ds<c\.min\)\{ showToast\('不能選在 '\+c\.min\.replace\(\/-\/g,'\/'\)\+' 之前'\); return; \}/.test(src));
ok('★ 上下留半屏內距，第一格與最後一格才捲得到中央',
   /padding:88px 0;/.test(css)
   && /一定要留上下內距（容器高的一半減半格）/.test(src));
ok('★ 捲停後 Math.round\(scrollTop\/格高\) 就是選到第幾格（不自己算慣性）',
   /const i=Math\.round\(col\.scrollTop\/ASH_WH_ITEM\);/.test(src)
   && /交給瀏覽器原生捲動，手感才對/.test(src));
ok('★ 月曆與清單都已退場', !/adp-grid/.test(src) && !/function ashDateMove/.test(src)
   && !/<div class="adp-list"/.test(src));
ok('　　開窗各欄都轉到目前的值', /ashWheelGo\('y', Math\.max\(0,years\.findIndex/.test(src)
   && /ashWheelGo\('h', hi<0\?1:hi\);/.test(src));
ok('★ 日期顯示 2026/08/21，不帶星期（使用者定版）',
   /return `\$\{d\.getFullYear\(\)\}\/\$\{String\(d\.getMonth\(\)\+1\)\.padStart\(2,'0'\)\}\/\$\{String\(d\.getDate\(\)\)\.padStart\(2,'0'\)\}`;/.test(src));
ok('★ 連續預約：七顆星期膠囊一列，時間在下一列',
   /<div class="rc-chips">/.test(src) && /<div class="rc-times" id="\$\{prefix\}-dowtimes">/.test(src)
   && /\.rc-chip input:checked \+ span\{background:var\(--green\)/.test(css));
ok('★ 勾了哪天、那天的時間才出現（沒勾的清空值）',
   /if\(row\) row\.style\.display=on\?'':'none';/.test(src)
   && /if\(tm && !on\)\{\s*\n\s*tm\.value='';/.test(src));
ok('　　readRecur 一行都不用改（仍讀 .{prefix}-dow 與 .{prefix}-dowt[data-dow]）',
   /class="\$\{prefix\}-dowt" data-dow="\$\{v\}"/.test(src)
   && /所以那支一行都不用改 —— 只是換了排法/.test(src));


console.log('\n團課名額的使用人按鈕（2026-08-21 使用者：「團課是不是沒有家庭成員按鈕」）');
ok('★ 團課名額也有按鈕了，但改的是「票」不是「這一堂」',
   /}else if\(_slot && _slot\.t\)\{/.test(src)
   && /onclick="event\.stopPropagation\(\);ashTkFamAsk\('\$\{_slot\.t\.id\}','\$\{b\.id\}'\)">👤 \$\{escH\(String\(_slot\.t\.family_user\|\|''\)\.trim\(\)\|\|'本人'\)\} ▾<\/button>/.test(src));
ok('　　單人課仍走 booking.trial_name（兩者欄位不同）',
   /onclick="event\.stopPropagation\(\);ashFamAsk\('\$\{b\.id\}'\)">👤 \$\{escH\(String\(b\.trial_name\|\|''\)\.trim\(\)\|\|'本人'\)\} ▾/.test(src));
ok('　　查不到這一格扣在哪張票就不畫（沒有可以改的對象）',
   /let _famBtn='';\s*\n\s*if\(r\.mid && _famMap\[r\.mid\]\)\{/.test(src));
ok('★ 一定要跳確認，而且講明會連同這張票的其他格一起改',
   /async function ashTkFamConfirm\(tid, bid, name\)\{/.test(src)
   && /團課只能整張票設定/.test(src)
   && /用它約掉的\$\{_n>1\?` \$\{_n\} 格（含已上過的）`:'每一格'\}都會跟著改/.test(src));
ok('　　堂數與效期不變要寫出來（0810 的教訓：不寫櫃檯會以為整組回沖）',
   /堂數、效期、扣的是哪一張票都不變。/.test(src));
ok('　　目前這位不給按（與單人課同一套）',
   /\$\{cur===v\s*\n?\s*\? 'disabled style="justify-content:flex-start;text-align:left;padding:11px 14px;opacity:\.7;cursor:default;"'/.test(src));
ok('　　寫回票券要清快取，然後回到那張課卡（ashBackArm 已設）',
   /function ashTkFamAsk\(tid, bid\)\{ ashBackArm\(bid\); ashTkFamPick\(tid, bid\); \}/.test(src)
   && /t\.family_user=name\|\|null;[\s\S]{0,80}?dbCacheClear\('member_tickets'\);/.test(src)
   && /openBookingDetail\(bid\);   \/\/ ashBackArm 已設/.test(src));
ok('　　格數要數 stamps 裡的預約本身（slotOf 的 stamps 就是 bookings，沒有 booking_id 欄）',
   /_n=\(\(_sl&&_sl\.stamps\)\|\|\[\]\)\.filter\(x=>x&&x\.id\)\.length;/.test(src));

console.log('\n會員資料的歷史紀錄預設展開（2026-08-21 使用者指示）');
ok('★ 櫃檯端（會員資料 → 票券）',
   /<details class="pp-hist" open><summary>歷史紀錄（\$\{hist\.length\}）<\/summary>/.test(src));
ok('★ 教練端的簡易名片也一致',
   /<details class="md-tk-hist" open><summary>歷史紀錄（\$\{history\.length\}）<\/summary>/.test(src));
ok('　　「已過期方案」原本就會在有可展延的票時展開，行為不變',
   /<details class="pp-hist"\$\{_extable\.length\?' open':''\}><summary>已過期方案/.test(src));

console.log('\n調整課程視窗的間距（2026-08-21 使用者回報「視窗內容連在一起了」）');
ok('★ 說明塊與清單列的下間距一致，不然兩張白卡會黏成一片',
   /\.ash-einote\{font-size:12\.5px;color:var\(--t2\);line-height:1\.9;background:#fff;\s*\n\s*border-radius:18px;padding:14px 16px;margin-bottom:9px;box-shadow:0 6px 18px rgba\(30,25,15,\.13\);\}/.test(src));
ok('　　跟 .ash-eirow 同一個數字（9px）',
   /border-radius:18px;padding:14px 16px;margin-bottom:9px;cursor:pointer;/.test(src));
ok('　　會撞到的實際情境寫在程式裡（教練請假：說明＋刪除預約）',
   /說明塊原本沒有下間距，後面接著一列（教練請假那張：說明＋「刪除預約」）時/.test(src));

console.log('\n簽到的課卡不填滿、章回到姓名右邊（2026-08-21 四修）');
/* 使用者：「首頁簽到的課卡 不要用填滿的 只要在會員姓名右邊顯示出席章
   然後簽到的課卡為什麼第幾堂/總堂數的標示不見了」。
   ⚠ 後半段其實是前半段造成的：填滿只把 time／mem／sub 三個改成白字，
   當天稍早才加的 .tcard-seq 不在那份清單裡 → 深色底上的深色字，看不見。 */
ok('★ 首頁課卡（.tcard-std）簽到後不再填滿',
   !/\.tcard\.tcard-std\.tcard-done \.tcard-body\{/.test(src)
   && !/\.tcard\.tcard-std\.tcard-done \.tcard-mem\{ color:#fff/.test(src));
/* 五修（同日）：桌機行事曆不填滿、手機維持填滿 —— 驗在下方「桌機行事曆也不填滿了」。
   這裡只驗「桌機那一塊（min-width:601px）裡沒有填滿規則」。 */
ok('★ 桌機的填滿規則已移除（手機那份在別的 media 區塊）',
   !/\.cal-ev\.cal-ev-std\.cal-ev-checked \.evc-body\{/.test(blk));
/* 2026-08-21 再修：章從姓名右邊移到卡片左下角（見下方「章移到左下角」） */
ok('★ 出席章改回顯示（首頁卡仍在姓名右邊）',
   !/\.tcard\.tcard-std \.tcard-chk\{ display:none !important; \}/.test(src)
   && /<span class="tcard-nmrow"><span class="tcard-mem">\$\{nm\}<\/span>\$\{\(\(\)=>\{const k=bkStampKind\(b\);/.test(src)
   && /\.tcard-nmrow\{display:flex;align-items:center;justify-content:center;gap:4px;/.test(src));
ok('　　章從右下角的三角形角章改成小圓章（角章會壓到教練標籤）',
   /\.tcard-chk\{flex:none;width:16px;height:16px;border-radius:50%;/.test(src)
   && /角章壓在教練標籤那一角，卡片一窄就互相疊/.test(src));
ok('　　三種章各有顏色：簽到綠、請假紅、未到金',
   /\.tcard-chk\.tcard-chk-leave\{background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.tcard-chk\.tcard-chk-ns\{background:var\(--gold-d,#b48a56\);\}/.test(src));
ok('★ 「第幾堂／共幾堂」仍在姓名列的下面（不是被塞進姓名那一列）',
   /<\/span>\$\{\(\(\)=>\{\s*\n\s*const q=\(window\._bkSeq\|\|\{\}\)\[b\.id\];/.test(src));
ok('　　簽到的辨識改靠既有的綠環（0806 就有，不必再靠填色）',
   /\.tcard-std\.tcard-done:not\(\.tcard-live\)::before\{content:'';position:absolute;inset:-2px;/.test(src));
ok('　　「看不見」的成因寫在原地，避免日後又把填滿加回來',
   /於是深色底上是深色字 —— 使用者回報「簽到的課卡為什麼第幾堂\/總堂數的標示不見了」/.test(src));

console.log('\n禮物箱移到課卡左下（2026-08-21 使用者指示）');
ok('★ 不再排在文字流裡（會把「第幾堂」那一列往下擠），改成絕對定位貼左下',
   /\.tcard-giftpos\{position:absolute;left:5px;bottom:4px;/.test(src)
   && /<\/div>\$\{\(b\.member_id\?`<span class="tcard-giftpos">\$\{lottoGiftIcon\(_lotMap\[b\.member_id\]\)\}<\/span>`:''\)\}/.test(src));
ok('　　與右下角的教練標籤左右對稱', /與右下角的教練標籤左右對稱/.test(src));
ok('　　不吃點擊（純標示，點下去仍是開課卡）', /\.tcard-giftpos\{[^}]*pointer-events:none;\}/.test(src));

console.log('\n桌機行事曆也不填滿了（2026-08-21 五修）');
/* 使用者：「桌機版行事曆 不要用填滿的方式簽到 用會員姓名旁邊顯示出席章」——
   四修時我刻意只改首頁、留著行事曆；這次兩邊統一。 */
ok('★ 填滿那一組規則整組刪掉（不是用覆蓋蓋掉）',
   !/\.cal-ev\.cal-ev-day\.cal-ev-checked\{background:color-mix/.test(src)
   && !/\.cal-ev\.cal-ev-day\.cal-ev-checked \.evd-name\{color:#fff;\}/.test(src)
   && /用覆蓋的方式蓋不乾淨（底色、邊框、左色條、三種文字色各有 !important/.test(src));
ok('★ DOM 仍在姓名列裡（絕對定位是相對整張卡，擺哪裡都不影響姓名列寬度）',
   /<span class="evc-nmrow"><span class="evc-name">\$\{_stdName\}<\/span>\$\{_stampOut\}<\/span>/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-nmrow\{display:flex;align-items:center;justify-content:center;/.test(src));
ok('★ 章在卡片左下角，桌機用小圓章（1/4 圓在淺底卡上太搶）',
   /\.cal-ev\.cal-ev-std \.evc-check\{ position:absolute; left:4px; bottom:4px; right:auto; top:auto;\s*\n\s*width:16px; height:16px; border-radius:50%;/.test(src));
ok('　　手機（.admcag）維持 1/4 圓 —— 深色滿版卡上圓章反而糊',
   /手機那邊維持 1\/4 圓（\.admcag 那組，深色滿版卡上圓章反而糊）/.test(src)
   && /\.admcag\.cal-ev-std \.evc-check\{position:absolute;bottom:0;right:0;top:auto;left:auto;\s*\n\s*width:26px;height:26px;border-radius:100% 0 10px 0;/.test(src));
ok('　　右下角讓給教練標籤，左下角本來是空的（理由寫在原地）',
   /右下角讓給教練標籤（\.evc-abbr），左下角本來是空的；用與手機同一種 1\/4 圓/.test(src));
ok('　　桌機是左下角小圓章，手機的角標基底規則不動',
   /\.cal-ev\.cal-ev-std \.evc-check\{ position:absolute; left:4px; bottom:4px;/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-check\{position:absolute;top:auto;left:auto;bottom:0;right:0;/.test(src));
ok('　　窄欄位時名字自己截斷，不會把章擠掉',
   /\.cal-ev\.cal-ev-std \.evc-nmrow \.evc-name\{min-width:0;\}/.test(src));
/* 同日追加：「手機版行事曆就用填滿的方式呈現 不然畫面太亂」——兩邊刻意不同。 */
ok('★ 手機維持填滿（桌機不填、手機填，是兩個不同的決定）',
   /@media\(max-width:600px\),\(orientation:portrait\) and \(max-width:1024px\)\{\s*\n\s*\.cal-ev\.cal-ev-std\.cal-ev-checked \.evc-body\{\s*\n\s*background:var\(--course-accent,#3D7039\) !important;/.test(src));
ok('　　填色之後角落的章與教練標籤要翻成半透明白，不然深底上看不見',
   /\.cal-ev\.cal-ev-std\.cal-ev-checked \.evc-check\{\s*\n\s*background:rgba\(255,255,255,\.28\) !important; color:#fff !important; \}/.test(src)
   && /\.cal-ev\.cal-ev-std\.cal-ev-checked \.ev-coach-tag\{\s*\n\s*background:rgba\(255,255,255,\.25\) !important;/.test(src));
ok('　　為什麼兩邊不同寫在原地（避免日後為了「統一」又改掉一邊）',
   /手機一格更小，姓名旁邊再塞一顆章會擠成一團；填色是最省空間的辨識方式。\s*\n\s*兩邊刻意不同，不要為了「統一」再把其中一邊改掉。/.test(src));

console.log('\n首頁課卡一列到底＋翻頁（2026-08-21 使用者指示）');
ok('★ 不換行（原本 flex-wrap:wrap，課多就佔兩列高度）',
   /\.tcard-list\{flex:1;display:flex;gap:8px;align-items:stretch;min-width:0;overflow-x:auto;\s*\n\s*padding-bottom:2px;flex-wrap:nowrap;/.test(src));
ok('★ 左右各一顆翻頁鈕，放不下才出現',
   /<button type="button" class="tcard-pg tcard-pg-l" onclick="tcardPage\(event,-1\)"/.test(src)
   && /<button type="button" class="tcard-pg tcard-pg-r" onclick="tcardPage\(event,1\)"/.test(src)
   && /\.tcard-row\.has-pg \.tcard-pg\{display:flex;\}/.test(src));
ok('★ 到頭／到底那一顆淡化並停用',
   /\.tcard-row\.pg-atstart \.tcard-pg-l\{opacity:\.25;pointer-events:none;\}/.test(src)
   && /\.tcard-row\.pg-atend \.tcard-pg-r\{opacity:\.25;pointer-events:none;\}/.test(src));
ok('　　一次捲一個可視寬度，留 15% 重疊（翻過去還看得到前一張）',
   /list\.scrollBy\(\{left:dir\*Math\.max\(160, Math\.round\(list\.clientWidth\*0\.85\)\), behavior:'smooth'\}\);/.test(src));
ok('　　狀態在畫完與捲動時各算一次（要等版面算完才量得到 scrollWidth）',
   /function tcardPagerSync\(\)\{/.test(src)
   && /row\.classList\.toggle\('has-pg', l\.scrollWidth > l\.clientWidth\+2\);/.test(src)
   && /try\{ tcardPagerSync\(\); \}catch\(_\)\{\}/.test(src)
   && /l\.addEventListener\('scroll',\(\)=>tcardPagerSync\(\),\{passive:true\}\)/.test(src));
ok('　　捲軸藏起來（改用翻頁鈕）', /\.tcard-list::-webkit-scrollbar\{display:none;\}/.test(src));

console.log('\n過去的課卡淡化加重（2026-08-21 使用者：「淡化的課卡不夠強」）');
/* 四修（同日）：opacity .5 → .32（太強）→ 灰遮罩（還是偏淡）→ 直接壓亮度。
   使用者：「桌機行事曆過期課卡用暗化表示 不要透明化」。 */
ok('★ 用暗化（brightness），不是透明化（opacity）',
   /\.cal-ev\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-dark\{opacity:1;filter:brightness\(0\.9\) saturate\(0\.72\);transition:filter \.18s;\}/.test(src)
   /* 0822：.cal-ev-std 的投影（同樣兩個 class、又寫在後面）會把整條 filter 蓋掉，
      所以要用三個 class 再寫一次，並且把投影一起寫進來 */
   && /\.cal-ev\.cal-ev-std\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-std\.cal-ev-dark\{filter:drop-shadow\(0 1px 2px rgba\(60,50,38,\.12\)\) brightness\(0\.9\) saturate\(0\.72\);\}/.test(src)
   && !/\.cal-ev\.cal-ev-past::after\{/.test(src));
ok('★ 整欄再暗一階（與單卡疊加，效果相乘）',
   /\.cal-daycol\.col-past \.cal-ev\{filter:brightness\(0\.88\) saturate\(0\.5\);\}/.test(src));
ok('　　兩者差別寫在原地（透明會連字一起糊掉，暗化保持對比度）',
   /透明化與暗化不是同一件事：透明會讓卡片和背景混在一起、字也跟著糊掉；/.test(src));
ok('　　滑過去仍然恢復原狀（不是把資訊藏起來）',
   /\.cal-ev\.cal-ev-past:hover,\s*\n\.cal-ev\.cal-ev-dark:hover\{filter:none;\}/.test(src)
   && /\.cal-daycol\.col-past \.cal-ev:hover\{filter:none;\}/.test(src));
ok('　　未完成的過去課卡仍不淡化（0801 定案：那是待辦，不能一起壓暗）',
   /\.cal-ev\.cal-ev-todo,\s*\n\.cal-daycol\.col-past \.cal-ev\.cal-ev-todo\{opacity:1;filter:none;\}/.test(src));

console.log('\n管理員手機行事曆的課卡：2026-08-21 統一走教練版那一份');
/* 當天先在 .admcag（管理員專屬的滿版實色卡）上補了簽章、改成 1/4 圓、再改成實色；
   最後使用者直接定案「統一改成圖2的版本」——兩邊差在課卡大小與配色，不只字級。
   .admcag 分支整段移除，管理員與教練共用同一份課卡（連帶簽章也只剩一套）。 */
ok('★ renderCard 不再依角色分兩種課卡',
   !/if\(SESSION&&SESSION\.role==='admin'\)\{\s*\n\s*const _tmA=/.test(src)
   && /2026-08-21 使用者定案取消：「手機端 教練版跟管理員版 自己的課卡的比例是不是不一樣/.test(src));
ok('★ 共用的那一份本來就有簽章（假／簽），所以沒有漏掉',
   /return k==='leave'\?'<span class="evc-check evc-leave" title="全員請假">假<\/span>'\s*\n\s*:\(k==='done'\|\|k==='makeup'\)\?`<span class="evc-check" title="\$\{k==='makeup'\?'補簽':'已完成'\}">簽<\/span>`:'';/.test(src));
ok('　　.admcag 樣式暫留備查，理由寫在原地',
   /以下 \.admcag \/ \.acg-\* 於 2026-08-21 起沒有呼叫端/.test(src));

console.log('\n過去的課卡淡化加重（2026-08-21 使用者：「淡化的課卡不夠強」）');
/* 四修（同日）：opacity .5 → .32（太強）→ 灰遮罩（還是偏淡）→ 直接壓亮度。
   使用者：「桌機行事曆過期課卡用暗化表示 不要透明化」。 */
ok('★ 用暗化（brightness），不是透明化（opacity）',
   /\.cal-ev\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-dark\{opacity:1;filter:brightness\(0\.9\) saturate\(0\.72\);transition:filter \.18s;\}/.test(src)
   /* 0822：.cal-ev-std 的投影（同樣兩個 class、又寫在後面）會把整條 filter 蓋掉，
      所以要用三個 class 再寫一次，並且把投影一起寫進來 */
   && /\.cal-ev\.cal-ev-std\.cal-ev-past,\s*\n\.cal-ev\.cal-ev-std\.cal-ev-dark\{filter:drop-shadow\(0 1px 2px rgba\(60,50,38,\.12\)\) brightness\(0\.9\) saturate\(0\.72\);\}/.test(src)
   && !/\.cal-ev\.cal-ev-past::after\{/.test(src));
ok('★ 整欄再暗一階（與單卡疊加，效果相乘）',
   /\.cal-daycol\.col-past \.cal-ev\{filter:brightness\(0\.88\) saturate\(0\.5\);\}/.test(src));
ok('　　兩者差別寫在原地（透明會連字一起糊掉，暗化保持對比度）',
   /透明化與暗化不是同一件事：透明會讓卡片和背景混在一起、字也跟著糊掉；/.test(src));
ok('　　滑過去仍然恢復原狀（不是把資訊藏起來）',
   /\.cal-ev\.cal-ev-past:hover,\s*\n\.cal-ev\.cal-ev-dark:hover\{filter:none;\}/.test(src)
   && /\.cal-daycol\.col-past \.cal-ev:hover\{filter:none;\}/.test(src));
ok('　　未完成的過去課卡仍不淡化（0801 定案：那是待辦，不能一起壓暗）',
   /\.cal-ev\.cal-ev-todo,\s*\n\.cal-daycol\.col-past \.cal-ev\.cal-ev-todo\{opacity:1;filter:none;\}/.test(src));

console.log('\n滾輪可以點（2026-08-21 使用者：「這邊時間不能按」「日期也是」）');
ok('★ 每一格都掛 onclick，點了捲到中央',
   /onclick="ashWheelGo\('\$\{key\}',\$\{i\},1\)"/.test(src)
   && /function ashWheelGo\(key, idx, byTap\)\{/.test(src));
ok('　　選取仍由 ashWheelSync 依中央位置判定（只有一套真相）',
   /點擊＝把那一格捲到中央，選取仍然由 ashWheelSync 依中央位置判定，只有一套真相/.test(src));
ok('　　點年／月要立刻重算日數（平滑捲動要等動畫結束才觸發捲動事件）',
   /if\(byTap && window\._adpCtx && window\._adpCtx\.mode==='date' && \(key==='y'\|\|key==='m'\)\)\{/.test(src));
ok('　　開窗定位維持瞬間到位（不要平滑）',
   /if\(byTap && col\.scrollTo\) col\.scrollTo\(\{top:idx\*ASH_WH_ITEM, behavior:'smooth'\}\);/.test(src));
ok('　　點得動要看得出來（cursor:pointer）',
   /cursor:pointer;-webkit-tap-highlight-color:transparent;\}   \/\* 點得動要看得出來/.test(src));

console.log('\n待簽約／待付款的課卡也改暗化（2026-08-21 使用者指示）');
ok('★ 不再壓文字透明度，改成整張卡壓亮度',
   /\.cal-ev\.cal-ev-std\.cal-ev-pend,\s*\n\s*\.tcard\.tcard-std\.tcard-pend\{ filter:brightness\(0\.9\) saturate\(0\.72\); \}/.test(src)
   && !/\.tcard\.tcard-std\.tcard-pend \.tcard-txt\{ opacity:\.62; \}/.test(src));
ok('　　紅框維持滿的（那是「還沒收款」的警示，不能一起變淡）',
   /\.tcard\.tcard-std\.tcard-pend \.tcard-body\{\s*\n\s*border:2px solid var\(--danger,#b5372e\) !important;/.test(src));
ok('　　滑過去恢復原狀', /\.tcard\.tcard-std\.tcard-pend:hover\{ filter:none; \}/.test(src));
ok('　　與過期課卡同一套邏輯（透明會讓字糊掉，暗化保持對比度）',
   /原本是把文字 opacity 壓到 \.62（透明化），字會跟背景糊在一起；/.test(src));

console.log('\n快速預約改回右下角浮動圓鈕（2026-08-21 使用者指示）');
ok('★ 模式列右邊的＋移除（連樣式一起）',
   !/class="admcal-add"/.test(src)
   && !/\.admcal-add\{/.test(src)
   && /\.admcal-add（模式列上的＋）於 2026-08-21 隨按鈕一起移除/.test(src));
ok('★ 既有的右下角浮動＋回來（0819 為了模式列的＋把它藏起來）',
   !/\.role-admin \.cag-fab\{display:none !important;\}/.test(src)
   && /<button type="button" class="cag-fab\$\{window\._cagSlotOpen\?' on':''\}" onclick="cagToggleSlots\(\)"/.test(src));
ok('　　沒有做出第二顆（沿用既有的 .cag-fab，不另立一套）',
   (src.match(/class="cag-fab/g)||[]).length===1);
ok('　　一週檢視沒有這顆的理由寫在原地',
   /一週檢視沒有這顆：那邊點空白時段本來就會直接開新增預約/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
