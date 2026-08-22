/* 會員手機首頁 V2（2026-08-22）：只在管理員的「會員視角」預覽生效，
   頂列米色＋三格票券餘額、篩選列、左日期欄／右課卡欄、課卡點擊＝簽到、
   自主訓練＝今天起七天不翻頁＋［＋］訂位。 */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(name,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+name); };
const cut=(a,b)=>s.slice(s.indexOf(a), s.indexOf(b));

// ── 開關：只有管理員預覽會員視角才會走 V2 ──
const on=cut('function memh2On(){','function mh2S(){');
t('只吃手機版面', /isMobileLayout\(\) && !isMobileLayout\(\)|!isMobileLayout\(\)\) return false/.test(on));
t('只吃會員視角', /SESSION\.role!=='member'\) return false/.test(on));
/* 2026-08-22：預覽期結束，正式對所有會員開放 */
t('已對所有會員開放（不再是 isRealAdmin 預覽限定）',
  /\n  return true;\n\}/.test(on) && !/return !!\(typeof isRealAdmin/.test(on));
t('留一個 localStorage 開關可即時退回舊版（memh2=0）', /localStorage\.getItem\('memh2'\)/.test(on)
  && /if\(v==='0'\) return false;/.test(on));
t('會員首頁有掛進去且早於舊版渲染', s.indexOf('if(memh2On()){')>0
  && s.indexOf('if(memh2On()){') < s.indexOf("C.innerHTML=`<div class=\"cal-hero\""));

// ── KPI：票券剩餘堂數（使用者定案），友善併進教練課 ──
const html=cut('function memh2HTML(o){','/* 點課卡 → 簽到確認視窗');
t('KPI 用票面剩餘堂數', /pk\[k\]\+=Number\(t\.sessions_remaining\)\|\|0/.test(html));
t('友善教練課併進「教練課」那一格', /\['教練課',pk\.pt\+pk\.friendly\]/.test(html));
t('三格＝教練課／團體課／自主訓練', /\['團體課',pk\.group\],\['自主訓練',pk\.self\]/.test(html));
const kind=cut('function memh2TkKind(t,typeMap){','function memh2CkState(b){');
t('票券分類靠 tkClass5＋友善字樣', /tkClass5/.test(kind) && /友善/.test(kind));
t('按摩券／折抵券不進三格', /if\(c!=='pt'\) return '';/.test(kind));

// ── 篩選列 ──
/* 0822 收斂（使用者）：「課程會員不必獨立出來看，只有自主訓練需要知道哪些日期可以約」 */
t('篩選列只有 All 與自主訓練', /const MEMH2_FILTERS=\[\['self','自主訓練'\]\];/.test(s));
t('自主訓練也是有票才出現', /MEMH2_FILTERS\.filter\(\(\[k\]\)=>pk\[k\]>0\)/.test(html));
t('月曆圖例仍是四色（用另一份 MEMH2_LEGEND，不跟篩選列綁在一起）',
  /const MEMH2_LEGEND=\[\['pt','教練課'\],\['friendly','友善教練課'\],\['group','團體課'\],\['self','自主訓練'\]\];/.test(s)
  && /MEMH2_LEGEND\.map\(\(\[k,l\]\)=>`<span><i style="background:\$\{MEMH2_COL\[k\]\}"/.test(s));
t('All 永遠在最前面', /mh2-chip[^`]*onclick="memh2PickFilter\('all'\)">All/.test(html));
t('篩選列滑到哪停到哪（同步還原、不閃）',
  /window\._mh2Chip=r\.scrollLeft/.test(s) && /memh2RestoreChips\(\);\s+\/\/ 要同步做/.test(s));
t('篩選列不共用 .admh-coach（避免被管理員教練列的位置推走）',
  !/class="admh-coach mh2-chips/.test(s));

// ── 左邊日期欄 ──
/* 0822 二修（使用者）：「自主訓練的日期列七天 還是幫我改回跟教練課顯示的一樣 週一～週日
   只是不能預約的日期要暗化 保持上下拖拉會換頁」 */
t('日期列一律週一～週日（自主訓練不再特例）', /const base=heroWeekMonday\(s\.date\);/.test(html)
  && !/selfMode\?new Date\(TODAY/.test(html));
/* 0822（使用者）：兩張效期不同的自主訓練票 → 日期列要點亮的是聯集 */
t('多張自主訓練票取聯集：任何一張蓋得到就點亮',
  /const selfOk=ds=>ds>=today && selfRanges\.some\(\(\[st,ex\]\)=>\(!st\|\|ds>=st\)&&\(!ex\|\|ds<=ex\)\);/.test(html));
t('每張票各自記 [起,訖]，不是只看最晚到期日',
  /selfRanges\.push\(\[st,e\]\);/.test(html));
t('自主訓練分頁：蓋不到的那幾天暗化且點不下去',
  /const off=selfMode && !selfOk\(ds\);/.test(html) && /off\?' disabled':/.test(html));
t('訂位挑票優先用效期較短的那張（照到期日由近而遠排）',
  /String\(a\.expire_date\|\|'9999-12-31'\)\.localeCompare\(String\(b\.expire_date\|\|'9999-12-31'\)\)/.test(s));
t('還沒生效的票不會被挑走（起始日也要看）',
  /\.filter\(t=>!\(t\.start_date&&t\.expire_date\) \|\| String\(t\.start_date\)\.slice\(0,10\)<=s\.date\)/.test(s));
t('上下箭頭一律畫（自主訓練也能翻頁）',
  /<span class="a2-arw a2-arw-up" onclick="memh2WeekShift\(-1\)"><\/span>/.test(html)
  && !/\$\{selfMode\?'':'<span class="a2-arw/.test(html));
t('拖曳換週一律綁 memh2WeekShift', /admh2Mount\(memh2WeekShift\)/.test(html));
const shift=cut('function memh2WeekShift(d){','function memh2PickFilter(k){');
t('換週落在該週週一', /heroWeekMonday\(s\.date\)/.test(shift) && /setDate\(mon\.getDate\(\)\+d\*7\)/.test(shift));
t('換週不再因為自主訓練而被擋掉', !/if\(s\.filter==='self'\) return;/.test(shift));

// ── 課卡 ──
t('課卡點下去走 memh2Tap（簽到），不是編輯', /onclick="memh2Tap\('\$\{b\.id\}'\)/.test(html));
t('右下角教練名左邊有手勢圖示', /<span class="a2-coach">\$\{MEMH2_TAPIC\}/.test(html));
t('時間在右上、教練在右下（沿用雙欄課卡骨架）',
  html.indexOf('<span class="a2-time">')<html.indexOf('<span class="a2-coach">'));
t('票券顯示第幾堂／共幾堂', /第 \$\{_nth\} 堂／共 \$\{tk\.sessions_total\} 堂/.test(html));
/* 0822（使用者）：「手機版的課卡不用顯示金色外框 那個是給員工看的」 */
t('課卡不加金框（金框在員工端是「逾時未簽到」的意思）', !/mh2-ck'/.test(html)
  && !/\.mh2-ck\{/.test(s));
/* 0822 再修（使用者）：「課卡的簽到狀態文字也不用顯示 直接看手指圖示就好」 */
t('課卡不再寫簽到狀態文字', !/可以簽到了/.test(html) && !/開課前 30 分鐘可簽到/.test(html)
  && !/a2-l2/.test(html));
t('已簽到／請假／未到仍靠左邊那顆出席章辨識',
  /st\.leave\?\['假','admh-st-leave'\]/.test(html) && /st\.done\?\['簽','admh-st-done'\]/.test(html));
t('剩兩列：課程・場地（粗體）／第幾堂共幾堂', /class="a2-l1">\$\{cname\}/.test(html)
  && /\$\{_tkTxt\?`<div class="a2-l3">\$\{_tkTxt\}<\/div>`:''\}/.test(html)
  && /\.memh2 \.admh2-card \.a2-l1\{font-size:14\.5px;font-weight:800/.test(s));
t('沒綁票的團課就不畫第二列（不留空行）', /\$\{_tkTxt\?`<div/.test(html));

// ── 簽到視窗 ──
const tap=cut('async function memh2Tap(id){','/* ［＋］預約自主訓練');
/* 0822 二修（使用者）：「確認簽到跟關閉也改左右」——那顆從內文移到底部與關閉並排 */
t('可簽到時「確認簽到」出現在底部、與關閉並排',
  /class="modal-foot mh2-foot\$\{st\.open\?'':' one'\}"/.test(tap)
  && /st\.open\?`<button class="btn btn-green"[\s\S]{0,160}確認簽到<\/button>`:''/.test(tap));
t('內文只留狀態字，不再放整寬的簽到鈕', /現在可以簽到了/.test(tap));
t('底部兩顆固定左右各半、等高',
  /\.modal-foot\.mh2-foot\{display:grid;grid-template-columns:1fr 1fr/.test(s)
  && /\.modal-foot\.mh2-foot \.btn\{[^}]*height:44px/.test(s)
  && /\.modal-foot\.mh2-foot\.one\{grid-template-columns:1fr;\}/.test(s));
t('自主訓練訂位視窗與教練快速預約也吃同一組底部',
  /class="modal-foot mh2-foot\$\{mms\.length\?'':' one'\}"/.test(s)
  && /class="modal-foot mh2-foot\$\{slots\.length\?'':' one'\}"/.test(s));
t('還沒到時間顯示簽到規則', /簽到規則/.test(tap) && /開放簽到/.test(tap));
t('團課走 memGrpCheckin、其餘走 memCheckin', /memGrpCheckin\('\$\{b\.id\}'\)/.test(tap) && /memCheckin\('\$\{b\.id\}'\)/.test(tap));
/* 0822 覆查：教練請假改記成自主訓練的教練課、以及場租，都不算會員自助 */
t('只有團課與自主訓練給取消（教練課只做簽到）',
  /const selfServe=\(!st\.done && !st\.past\) && \(st\.isGrp \|\| _isSelfBk\)/.test(tap));
t('改時間只給自主訓練', /selfServe && _isSelfBk && b\.member_id===SESSION\.id[\s\S]{0,120}改時間/.test(tap));

// ── ［＋］沿用現有引擎 ──
t('時段探測已抽成共用的 msbProbeFree', /async function msbProbeFree\(\)\{/.test(s));
t('msbLoadSlots 改呼叫 msbProbeFree（沒有兩份探測邏輯）',
  /const r=await msbProbeFree\(\);/.test(cut('async function msbLoadSlots(){','async function msbPickSlot(t){')));
const add=cut('async function memh2SelfSlots(ds){','function memh2SelSlot(t){');
t('［＋］沿用 msbStart 建狀態', /await msbStart\(\)/.test(add));
t('［＋］收掉舊版下方訂位表但保留狀態', /getElementById\('msb-sheet'\); if\(sh\) sh\.remove\(\)/.test(add));
/* 0822 二修（使用者）：「多功能訓練架不用顯示」「8/22 9:00 也過期了 自主應該也不能預約」 */
t('多功能訓練架不標（沒標就是它），只標教室與跑步機',
  /VN=\{multi:'',group:'團課教室',treadmill:'跑步機'\}/.test(add));
t('沒有標籤就不畫空的 tag', /tag\?`<span class="cag-slot-tag">/.test(add));
t('今天已經過去的時段要濾掉', /const _nowMin=\(date===ymd\(TODAY\)\)\?/.test(add)
  && /\.filter\(m=>_nowMin<0\|\|m>=_nowMin\)/.test(add));
t('要按確認才前進（與快速預約同一套）',
  /id="mh2qs-ok" disabled onclick="memh2GoSlot\(\)"/.test(add)
  && /closeModal\(\); msbPickSlot\(t\);/.test(cut('function memh2GoSlot(){','/* ══')||s));

// ── 月曆（2026-08-22 使用者指示）──
const mon=cut('function memh2MonthHTML(mine){','/* 點課卡 → 簽到確認視窗');
t('月曆掛在頁面最下面（雙欄之後）', /<\/div>\s*\$\{memh2MonthHTML\(mine\)\}/.test(html));
t('週一為一週之始', /const lead=\(first\.getDay\(\)\+6\)%7/.test(mon)
  && /\['一','二','三','四','五','六','日'\]/.test(mon));
t('圓點顏色照課別，與課卡同一份 MEMH2_COL', /MEMH2_COL\[bkCC\(b\)\]\|\|MEMH2_COL\.pt/.test(mon));
t('一天多堂依時間排序後左右排列', /sort\(\(a,b\)=>String\(a\.start_time\|\|''\)\.localeCompare/.test(mon)
  && /\.memh2-mon-dots\{display:flex;flex-wrap:wrap/.test(s));
t('圓點不被壓縮（flex:0 0 auto）', /\.memh2-mon-dots i\{[^}]*flex:0 0 auto/.test(s));
t('月曆不吃上方的篩選列（要看整月全貌）', !/s\.filter/.test(mon));
t('點某一天＝把上面的日期欄跳過去', /onclick="memh2PickDay\('\$\{ds\}'\)"/.test(mon));
t('今天綠底、選取金框（與日期欄同語彙）',
  /\$\{ds===today\?' today':''\}\$\{\(ds===s\.date&&ds!==today\)\?' on':''\}/.test(mon));
t('換月只重繪、不改選取的那一天',
  /memh2MonthShift\(d\)\{[\s\S]{0,320}?memh2PickDay\(s\.date\);\s+\/\/ 只重繪/.test(s));
t('月曆卡用白底（外框本來就是 card2，同色會整張消失）',
  /\.memh2-mon\{background:#fff/.test(s));
t('下方有四色圖例', /MEMH2_LEGEND\.map\(\(\[k,l\]\)=>`<span><i style="background:\$\{MEMH2_COL\[k\]\}"/.test(mon));

t('［＋］的時段也是點了就選它，誤觸第二下不會洗掉狀態',
  /window\._mh2Pick=t;/.test(cut('function memh2SelSlot(t){','function memh2GoSlot(){'))
  && !/_mh2Pick===t\)\?'':t/.test(s));

// ── 快速預約與團體課報名（2026-08-22 使用者指示）──
t('［＋］在每個分頁都出現，只看有沒有自主訓練點數',
  /const addBtn=\(pk\.self>0\)/.test(html) && !/const addBtn=selfMode\?/.test(html));
t('點［＋］先把篩選列切到自主訓練（日期欄才會連動）',
  /if\(_s\.filter!=='self'\)\{ _s\.filter='self'; try\{ memh2PickDay\(date\); \}catch\(_\)\{\} \}/.test(s));
t('當天有開、自己還沒報名的團體課會列出來',
  /bkIsGroup\(b\)\s*\n\s*&& !\(typeof bkHasMember==='function' && bkHasMember\(b,SESSION\.id\)\)/.test(html));
t('只在「全部」分頁出現（團體課分頁已收掉）', /const grpOpen=\(s\.filter==='all'\)/.test(html));
t('★ 沒有團體課票券的人也看得到課卡（列出來不看票券）',
  !/grpTks[\s\S]{0,60}grpOpen/.test(html));
t('★ 沒票的人點下去給說明卡，不是一句吐司',
  /if\(!\(window\._msb\.grpTks\|\|\[\]\)\.length\)\{[\s\S]{0,400}購課請洽櫃檯或你的教練/.test(s));
t('已經開始的不列（報不了名）', /\(_nowM<0 \|\| timeToMin\(b\.start_time\|\|'0:0'\)>=_nowM\)/.test(html));
t('額滿的畫出來但點不下去', /const full=heads>=cap;/.test(html)
  && /full\?'':` onclick="memh2GrpJoin\('\$\{b\.id\}'\)"`/.test(html));
t('可報名的卡用虛線框，與自己的課分得開',
  /\.memh2 \.admh2-card\.mh2-grpopen\{[^}]*border:1\.5px dashed/.test(s.replace(/\n\s*/g,'')));
t('報名沿用既有的 msbGrpJoin（只是先把 _msb 狀態建起來）',
  /async function memh2GrpJoin\(bid\)\{[\s\S]{0,900}msbGrpJoin\(bid\);/.test(s));

// ── 底部導覽 ──
t('底部導覽「首頁」改成「我的預約」',
  /\{key:'mem_bookings', label:'我的預約'\}/.test(s));

// ── 樣式隔離 ──
const css=cut('/* ══ 會員手機首頁 V2','/* 2026-08-20 使用者指示：改白底＋左側課程色條');
/* .modal-foot.mh2-foot 是彈窗底部的修飾 class（彈窗不在 .memh2 裡面，掛不進去），
   一樣只有帶 mh2-foot 的那幾張視窗吃得到。 */
/* .pp-head-self 是會員本人的個人資料（不在 .memh2 裡）、
   .tb-acct-item .acct-nsw 是帳號選單那顆開關 —— 兩者都各自有自己的範圍限定。 */
t('所有新樣式都掛在 .memh2 / .mh2- / .modal-foot.mh2-foot / .pp-head / .pp-sheet-self / .tb-acct-item 之下',
  css.split('\n').filter(l=>/^\.[a-z]/.test(l.trim()))
     .every(l=>/^\.(memh2|mh2-|modal-foot\.mh2-foot|pp-head|pp-sheet(\.|-)|tb-acct-item|lp-)/.test(l.trim())));
t('頂列米色', /\.memh2\{background:var\(--card2\)/.test(css));

// ── 外框（2026-08-22 二修）：頂欄米色、收掉重置鈕、底部導覽品牌綠、下拉更新 ──
t('外框樣式掛在 body.memh2-shell（不影響真實會員）',
  /body\.memh2-shell \.topbar-fixed\{background:var\(--card2/.test(s));
t('頂欄的「更新畫面」圓鈕收掉', /body\.memh2-shell \.topbar \.tb-right \.rf-btn\{display:none/.test(s));
t('底部導覽改品牌綠', /body\.memh2-shell \.bottom-nav\{background:var\(--green\)/.test(s));
t('綠底導覽的文字翻淺色', /body\.memh2-shell \.bottom-nav \.bn-item\{color:rgba\(255,255,255/.test(s));
t('navTo 只在「我的預約」／「我的票券」且 memh2On 時掛 shell',
  /classList\.toggle\('memh2-shell', _mv\)/.test(s)
  && /\(key==='mem_bookings'\|\|key==='mem_tickets'\)\s*\n?\s*&& typeof memh2On==='function' && memh2On\(\)/.test(s));
t('會員手機也啟用下拉更新', /SESSION\.role==='member'&&typeof memh2On==='function'&&memh2On\(\)\)\)\) admPtrInit\(\)/.test(s));
t('切預覽視角時補掛一次下拉更新', /if\(_mv && typeof admPtrInit==='function'\) admPtrInit\(\)/.test(s));
t('下拉更新後會員也回到原分頁', /_ptrBack && \(SESSION\.role==='admin'\|\|SESSION\.role==='member'\)/.test(s));

// ── 今日運勢（2026-08-22 使用者回報「會員跟教練點了沒反應」）──
t('抽籤結果框不再被手機版整個藏掉', !/\.tb-acct-fortune,#tb-fortune-inline\{display:none;\}/.test(s));
t('頂欄左邊的燈泡小管家收掉（入口留在帳號選單）',
  /body\.memh2-shell \.tb-bulb,\s*\n?body\.memh2-shell \.tb-butler,/.test(s)
  && /body\.memh2-shell \.tb-acct-butler\{display:flex !important;\}/.test(s));
t('三種角色的手機版都看得到「今日運勢」入口',
  /\.role-admin \.tb-acct-butler,\.role-coach \.tb-acct-butler,\.role-member \.tb-acct-butler\{display:flex;\}/.test(s));

// ── LINE 圖文選單的深層連結 ──
t('?go=bookings 進「我的預約」', /if\(go==='bookings'\|\|go==='home'\)\{ navTo\('mem_bookings'\); return true; \}/.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
