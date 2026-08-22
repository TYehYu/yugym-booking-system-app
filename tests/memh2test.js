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
t('預設只有真實管理員看得到（真會員碰不到）', /isRealAdmin\(\)\);\s*\/\/ 預覽限定/.test(on));
t('留一個 localStorage 開關可強制開/關', /localStorage\.getItem\('memh2'\)/.test(on));
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
t('篩選列有票才列出該分頁', /MEMH2_FILTERS\.filter\(\(\[k\]\)=>pk\[k\]>0\)/.test(html));
t('All 永遠在最前面', /mh2-chip[^`]*onclick="memh2PickFilter\('all'\)">All/.test(html));
t('篩選列滑到哪停到哪（同步還原、不閃）',
  /window\._mh2Chip=r\.scrollLeft/.test(s) && /memh2RestoreChips\(\);\s+\/\/ 要同步做/.test(s));
t('篩選列不共用 .admh-coach（避免被管理員教練列的位置推走）',
  !/class="admh-coach mh2-chips/.test(s));

// ── 左邊日期欄 ──
t('自主訓練＝今天起七天，其他＝該週週一起', /selfMode\?new Date\(TODAY\.getFullYear\(\),TODAY\.getMonth\(\),TODAY\.getDate\(\)\):heroWeekMonday\(s\.date\)/.test(html));
t('超出票券效期的那幾天暗化且點不下去', /const off=selfMode && selfLim && ds>selfLim/.test(html)
  && /off\?' disabled':/.test(html));
t('自主訓練不畫上下箭頭', /\$\{selfMode\?'':'<span class="a2-arw a2-arw-up"/.test(html));
t('自主訓練不綁換週拖曳（傳空函式給 admh2Mount）', /admh2Mount\(selfMode\?function\(\)\{\}:memh2WeekShift\)/.test(html));
const shift=cut('function memh2WeekShift(d){','function memh2PickFilter(k){');
t('換週落在該週週一', /heroWeekMonday\(s\.date\)/.test(shift) && /setDate\(mon\.getDate\(\)\+d\*7\)/.test(shift));
t('自主訓練模式直接擋掉換週', /if\(s\.filter==='self'\) return;/.test(shift));
t('切到自主訓練時把日期夾回七天內', /if\(s\.date<ymd\(TODAY\)\|\|s\.date>lim\) s\.date=ymd\(TODAY\)/.test(s));

// ── 課卡 ──
t('課卡點下去走 memh2Tap（簽到），不是編輯', /onclick="memh2Tap\('\$\{b\.id\}'\)/.test(html));
t('右下角教練名左邊有手勢圖示', /<span class="a2-coach">\$\{MEMH2_TAPIC\}/.test(html));
t('時間在右上、教練在右下（沿用雙欄課卡骨架）',
  html.indexOf('<span class="a2-time">')<html.indexOf('<span class="a2-coach">'));
t('票券顯示第幾堂／共幾堂', /第 \$\{_nth\} 堂／共 \$\{tk\.sessions_total\} 堂/.test(html));
t('可簽到的卡加金框', /st\.open\?' mh2-ck':''/.test(html));

// ── 簽到視窗 ──
const tap=cut('async function memh2Tap(id){','/* ［＋］預約自主訓練');
t('可簽到時才出現「確認簽到」', /st\.open[\s\S]{0,200}確認簽到/.test(tap));
t('還沒到時間顯示簽到規則', /簽到規則/.test(tap) && /開放簽到/.test(tap));
t('團課走 memGrpCheckin、其餘走 memCheckin', /memGrpCheckin\('\$\{b\.id\}'\)/.test(tap) && /memCheckin\('\$\{b\.id\}'\)/.test(tap));
t('只有團課與自主訓練給取消（教練課只做簽到）',
  /const selfServe=\(!st\.done && !st\.past\) && \(st\.isGrp \|\| bkIsSelf\(b\)\)/.test(tap));
t('改時間只給自主訓練', /selfServe && bkIsSelf\(b\) && b\.member_id===SESSION\.id[\s\S]{0,120}改時間/.test(tap));

// ── ［＋］沿用現有引擎 ──
t('時段探測已抽成共用的 msbProbeFree', /async function msbProbeFree\(\)\{/.test(s));
t('msbLoadSlots 改呼叫 msbProbeFree（沒有兩份探測邏輯）',
  /const r=await msbProbeFree\(\);/.test(cut('async function msbLoadSlots(){','async function msbPickSlot(t){')));
const add=cut('async function memh2SelfSlots(ds){','function memh2SelSlot(t){');
t('［＋］沿用 msbStart 建狀態', /await msbStart\(\)/.test(add));
t('［＋］收掉舊版下方訂位表但保留狀態', /getElementById\('msb-sheet'\); if\(sh\) sh\.remove\(\)/.test(add));
t('場地標三種：多功能訓練架／團課教室／跑步機',
  /multi:'多功能訓練架',group:'團課教室',treadmill:'跑步機'/.test(add));
t('只列可約時段', /Array\.from\(r\.free\)\.sort/.test(add));
t('要按確認才前進（與快速預約同一套）',
  /id="mh2qs-ok" disabled onclick="memh2GoSlot\(\)"/.test(add)
  && /closeModal\(\); msbPickSlot\(t\);/.test(cut('function memh2GoSlot(){','/* ══')||s));

// ── 底部導覽 ──
t('底部導覽「首頁」改成「我的預約」',
  /\{key:'mem_bookings', label:'我的預約'\}/.test(s));

// ── 樣式隔離 ──
const css=cut('/* ══ 會員手機首頁 V2','/* 2026-08-20 使用者指示：改白底＋左側課程色條');
t('所有新樣式都掛在 .memh2 或 .mh2- 之下',
  css.split('\n').filter(l=>/^\.[a-z]/.test(l.trim()))
     .every(l=>/^\.(memh2|mh2-)/.test(l.trim())));
t('頂列米色', /\.memh2\{background:var\(--card2\)/.test(css));

// ── 外框（2026-08-22 二修）：頂欄米色、收掉重置鈕、底部導覽品牌綠、下拉更新 ──
t('外框樣式掛在 body.memh2-shell（不影響真實會員）',
  /body\.memh2-shell \.topbar-fixed\{background:var\(--card2/.test(s));
t('頂欄的「更新畫面」圓鈕收掉', /body\.memh2-shell \.topbar \.tb-right \.rf-btn\{display:none/.test(s));
t('底部導覽改品牌綠', /body\.memh2-shell \.bottom-nav\{background:var\(--green\)/.test(s));
t('綠底導覽的文字翻淺色', /body\.memh2-shell \.bottom-nav \.bn-item\{color:rgba\(255,255,255/.test(s));
t('navTo 只在「我的預約」且 memh2On 時掛 shell',
  /classList\.toggle\('memh2-shell', _mv\)/.test(s)
  && /key==='mem_bookings' && typeof memh2On==='function' && memh2On\(\)/.test(s));
t('會員手機也啟用下拉更新', /SESSION\.role==='member'&&typeof memh2On==='function'&&memh2On\(\)\)\)\) admPtrInit\(\)/.test(s));
t('切預覽視角時補掛一次下拉更新', /if\(_mv && typeof admPtrInit==='function'\) admPtrInit\(\)/.test(s));
t('下拉更新後會員也回到原分頁', /_ptrBack && \(SESSION\.role==='admin'\|\|SESSION\.role==='member'\)/.test(s));

// ── 今日運勢（2026-08-22 使用者回報「會員跟教練點了沒反應」）──
t('抽籤結果框不再被手機版整個藏掉', !/\.tb-acct-fortune,#tb-fortune-inline\{display:none;\}/.test(s));
t('三種角色的手機版都看得到「今日運勢」入口',
  /\.role-admin \.tb-acct-butler,\.role-coach \.tb-acct-butler,\.role-member \.tb-acct-butler\{display:flex;\}/.test(s));

// ── LINE 圖文選單的深層連結 ──
t('?go=bookings 進「我的預約」', /if\(go==='bookings'\|\|go==='home'\)\{ navTo\('mem_bookings'\); return true; \}/.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
