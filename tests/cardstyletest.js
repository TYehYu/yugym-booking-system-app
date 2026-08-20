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
ok('★ 捲動容器留下內距（使用者：「下面新增＋被切一半了」）', /padding:2px 0 14px;/.test(css));
ok('　　成因寫在程式裡', /最後那顆圓形按鈕正好貼在 overflow 的裁切邊上/.test(css));

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

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
