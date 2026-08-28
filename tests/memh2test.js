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
/* 2026-08-31 使用者指示：「要顯示的應該是尚未銷課的課堂，已經預約的課堂但還沒使用
   也應該顯示在這邊」—— 票面剩餘在預約當下就扣掉了，所以要把「已預約未上」加回來。 */
t('友善教練課併進「教練課」那一格', /\['教練課',pk\.pt\+pk\.friendly\+_pend\.pt\+_pend\.friendly\]/.test(html));
t('三格＝教練課／團體課／自主訓練',
  /\['團體課',pk\.group\+_pend\.group\]/.test(html) && /\['自主訓練',pk\.self\+_pend\.self\]/.test(html));
/* 2026-08-31 使用者：「會員KPI可以篩選嗎　該會員有該種票券才顯示」 */
t('★★ 只列真的有的那幾格（0 的不畫）', /\.filter\(\(\[,n\]\)=>n>0\);/.test(html));
t('★★ 三格都 0 就寫一句話，不要留一整列空白',
  /: `<div class="mh2-kpi mh2-kpi-none">目前沒有可用堂數<\/div>`;/.test(html)
  && /\.memh2 \.mh2-kpi-none\{font-size:12px;color:var\(--t3\);/.test(s));
t('　 判準沿用「尚未銷課」—— 堂數用完但還有已預約未上的那一格會留著',
  /判準用的是上面剛算好的「尚未銷課」：票面剩餘＋已預約未上。/.test(s));
t('★★ KPI＝票面剩餘＋已預約未上（尚未銷課）',
  /const _pend=\{pt:0,friendly:0,group:0,self:0\};/.test(html)
  && /const k=bkCC\(b\); if\(k in _pend\) _pend\[k\]\+\+;/.test(html));
t('★★ 已簽到／已完成的不算（那是真的上掉了）',
  /if\(b\.status==='checked_in'\|\|b\.status==='completed'\) return;/.test(html));
t('★★ 待簽約（沒綁票）不算 —— 錢還沒付',
  /if\(b\.pending_contract && !b\.ticket_id\) return;/.test(html)
  && /待簽約（沒綁票）也不算 —— 錢還沒付。/.test(s));
t('★★ 教練請假中的算（那一堂還沒上，堂數也還在）',
  /教練請假中的算 —— 那一堂還沒上，堂數也還在。/.test(s));
const kind=cut('function memh2TkKind(t,typeMap){','function memh2CkState(b){');
t('票券分類靠 tkClass5＋友善字樣', /tkClass5/.test(kind) && /友善/.test(kind));
t('按摩券／折抵券不進三格', /if\(c!=='pt'\) return '';/.test(kind));

// ── 篩選列 ──
/* 0822 收斂（使用者）：「課程會員不必獨立出來看，只有自主訓練需要知道哪些日期可以約」 */
/* 2026-08-27：篩選列整條退場（使用者：「因為會員應該也用不到篩選列」），
   位置讓給搬上來的日期列。MEMH2_FILTERS 這個常數留著沒人用會誤導，一併移除。 */
t('★★ 篩選列已退場（沒有 chip、沒有 memh2PickFilter／memh2RestoreChips）',
  !/mh2-chip[^s]/.test(html) && !/function memh2PickFilter/.test(s) && !/function memh2RestoreChips/.test(s));
t('★★ 退場理由寫在原地', /課程篩選列已於 2026-08-27 退場（使用者：「會員應該也用不到篩選列」）/.test(s));
t('★★ s.filter 固定為 all —— 兩處判斷照舊讀它（若被切走團課報名卡會整片消失）',
  /const grpOpen=\(s\.filter==='all'\)/.test(html)
  && /s\.filter==='all'\|\|bkCC\(b\)===s\.filter/.test(html)
  && /const selfMode=false;/.test(html));
t('月曆圖例仍是四色（用另一份 MEMH2_LEGEND，不跟篩選列綁在一起）',
  /const MEMH2_LEGEND=\[\['pt','教練課'\],\['friendly','友善教練課'\],\['group','團體課'\],\['self','自主訓練'\]\];/.test(s)
  && /MEMH2_LEGEND\.map\(\(\[k,l\]\)=>`<span><i style="background:\$\{MEMH2_COL\[k\]\}"/.test(s));
t('MEMH2_FILTERS 這個常數也一起清掉（留著沒人用會誤導）',
  !/const MEMH2_FILTERS=/.test(s) && /MEMH2_FILTERS）已於 2026-08-27 整條退場/.test(s));

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
/* 2026-08-27：日期列搬到上方之後暗化七格會太吵，改成只講「你現在選的這一天」，
   鈕照樣留著（「不能用就寫原因，別藏按鈕」）。selfOk 仍然是那個判斷。 */
/* 2026-08-31：課卡下方那顆［＋］退場，底部的自主訓練列每一點可用點數都是一顆可按的圓卡 */
t('★★ 課卡下方的快速預約［＋］退場，理由寫在原地',
  /const addBtn='';/.test(html)
  && /底部的自主訓練列現在每一點可用點數都是一顆可按的圓卡/.test(s));
t('★★ selfOk 還留著（底部那一列要靠它算「第一個約得到的日子」）',
  /const selfOk=ds=>ds>=today && selfRanges\.some/.test(html));
t('訂位挑票優先用效期較短的那張（照到期日由近而遠排）',
  /String\(a\.expire_date\|\|'9999-12-31'\)\.localeCompare\(String\(b\.expire_date\|\|'9999-12-31'\)\)/.test(s));
t('還沒生效的票不會被挑走（起始日也要看）',
  /\.filter\(t=>!\(t\.start_date&&t\.expire_date\) \|\| String\(t\.start_date\)\.slice\(0,10\)<=s\.date\)/.test(s));
t('★★ 換週改用左右箭頭（左欄退場，上下拖曳那支手勢跟著沒了）',
  /<button class="a2-wnav" title="上一週" onclick="memh2WeekShift\(-1\)">‹<\/button>/.test(html)
  && /<button class="a2-wnav" title="下一週" onclick="memh2WeekShift\(1\)">›<\/button>/.test(html)
  && !/class="admh2-rail"/.test(html));
t('拖曳換週一律綁 memh2WeekShift', /admh2Mount\(memh2WeekShift\)/.test(html));
const shift=cut('function memh2WeekShift(d){','/* 課程篩選列已於');
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
/* 2026-08-24 使用者定案（推翻 0811 的整批隱藏）：待付款的課卡要讓會員看得到，
   「只是要用一個鎖頭鎖住」「如果這張課卡已經綁定會員，要讓會員看得到，只是要鎖著」。 */
t('剩兩列：課程・場地（粗體）／第幾堂共幾堂', /class="a2-l1">\$\{cname\}/.test(html)
  && /:\(_tkTxt\?`<div class="a2-l3">\$\{_tkTxt\}<\/div>`:''\)/.test(html)
  && /\.memh2 \.admh2-card \.a2-l1\{font-size:14\.5px;font-weight:800/.test(s));
t('沒綁票的團課就不畫第二列（不留空行）', /_tkTxt\?`<div/.test(html));
t('★★ 待付款的課卡蓋鎖頭，第二列寫清楚狀態（分期＝待繳費、教練先約＝待簽約）',
  /const _lk=!!\(b\.pending_contract && !b\.ticket_id\);/.test(html)
  && /const _lkTxt=_lk\?\(\(typeof bkIsInstHold==='function'&&bkIsInstHold\(b\)\)\?'待繳費':'待簽約'\):'';/.test(html)
  && /const stamp=_lk\?\[MEMH2_LOCKIC,'admh-st-lock'\]/.test(html)
  && /尚未付款，暫時不能簽到/.test(html));
t('★★ 會員端不再整批藏掉待付款的課（0811 那條 filter 已移除）',
  /const mine=bookings\.filter\(b=>bkHasMember\(b,SESSION\.id\)&&b\.status!=='cancelled'\)/.test(s)
  && !/&&!\(b\.pending_contract&&!b\.ticket_id\)/.test(s));
t('★★ 看得到但動不了：待付款一律不給簽到／改時間／取消',
  /const locked=!!\(b && b\.pending_contract && !b\.ticket_id\);/.test(s)
  && /if\(locked\) return \{ isSelfBk:false, selfServe:false, checkin:false, resched:false, cancel:false, locked:true \};/.test(s));

/* 2026-08-28 會員回報：「從我的預約點課卡就卡畫面了，只出現畫面讀取的動畫」——
   後端查證完全正常（簽到其實成功了、沒有任何錯誤），是前端沒有逃生門。 */
t('★★ 點課卡不會靜靜失敗（打不開要講出原因）',
  /async function memh2Tap\(id\)\{ return _memh2Tap\(id\)\.catch\(e=>\{/.test(s)
  && /showToast\('這張課卡打不開：'\+\(\(e&&e\.message\)\|\|e\), 8000\);/.test(s)
  && /沉默失敗比錯誤訊息糟。/.test(s));
t('★★ 讀取動畫撐過 12 秒就變成「點一下重新整理」（原本蓋滿畫面又不能點）',
  /const PGL_STUCK_MS=12000;/.test(s)
  && /el\.classList\.add\('pgl-stuck'\);/.test(s)
  && /onclick="hidePageLoading\(\);location\.reload\(\);"/.test(s)
  && /#pg-loading\.pgl-stuck\{pointer-events:auto;\}/.test(s));
t('★★ 不自動 reload —— 正在送出的動作可能還在路上，決定權交還給人',
  /不要改成「時間到就自動 reload」：正在送出的動作（簽到、預約）可能還在路上，/.test(s));
t('　 收掉 loader 時要一併清掉那個計時器', /try\{ clearTimeout\(el\._t\); \}catch\(_\)\{\}/.test(s));

// ── 簽到視窗 ──
const tap=cut('async function _memh2Tap(id){','/* ［＋］預約自主訓練');
/* 0822 二修（使用者）：「確認簽到跟關閉也改左右」——那顆從內文移到底部與關閉並排 */
/* 2026-08-24 使用者指示：會員端課卡改成簡易課卡（標題卡＋會員卡＋圓形按鈕）。
   ⚠ **規則一條都沒動**，只換呈現 —— 底下這幾條守的就是「規則沒被順手改掉」。 */
t('★★ 改成簡易課卡：標題卡＋會員卡＋圓形按鈕（不再是一般彈窗）',
  /<div class="mtp-card mtp-head"/.test(tap)
  && /<div class="mtp-mcard">/.test(tap)
  && /<div class="mtp-orbs">\$\{ckBtn\}\$\{rsBtn\}\$\{cxBtn\}<\/div>/.test(tap));
/* 2026-08-24 使用者問「團體課的簽到圓形鈕也正常嗎」——守住兩件事：
   ① 團課走 memGrpCheckin（逐名額的 RPC），不是單人課那支 memCheckin；
   ② 關窗要用 memTaskClose（新的 UI 是 #mem-task-pop，不是 modal）——
      用 closeModal 的話視窗不會關，按完像沒反應。 */
t('★★ 團體課簽到走 memGrpCheckin，而且關的是 #mem-task-pop',
  /st\.isGrp\?`memTaskClose\(\);memGrpCheckin\('\$\{b\.id\}'\)`:`memTaskClose\(\);memCheckin\('\$\{b\.id\}'\)`/.test(tap)
  && !/closeModal\(\)/.test(tap));
t('★★ 簽到是圓鈕，開窗才可按（memh2CkState 的 open）',
  /st\.open \? orb\('go','✓','簽到'/.test(tap)
  && /orb\('off','🕒','尚未開放',null,'開課前 30 分鐘開放簽到'\)/.test(tap));
t('　　簽到規則改放圓鈕下方，而且只在「還不能簽」時出現',
  /: \(st\.done\|\|st\.open\)\?''/.test(tap)
  && /課程開始前 <b>30 分鐘<\/b>開放簽到/.test(tap));
/* 2026-08-24 使用者指示：「鎖頭顯示的方式，就跟會員課卡手指箭頭的方式一樣，用線條刻畫」——
   emoji 的 🔒 在不同手機長得都不一樣（有的是彩色實心），跟這套介面對不起來。 */
t('★★ 鎖頭是線條圖（與手勢圖示同一套：stroke、currentColor）',
  /const MEMH2_LOCKIC='<svg class="mh2-lockic" viewBox="0 0 24 24" fill="none" stroke="currentColor"/.test(s)
  /* ⚠ 只檢查會員端這兩段 —— 員工端的分期未開通圓點等處還在用 🔒，那是另一回事。 */
  && !/🔒/.test(html) && !/🔒/.test(tap));
t('★★ 待付款的課點開只有一顆鎖頭與說明，沒有任何可按的圓鈕',
  /ckBtn=orb\('off',MEMH2_LOCKIC,\(typeof bkIsInstHold==='function'&&bkIsInstHold\(b\)\)\?'待繳費':'待簽約',null\);/.test(tap)
  && /rsBtn=''; cxBtn='';/.test(tap)
  && /這一堂<b>還沒完成付款<\/b>，時段已經先幫你留著。/.test(tap));
/* 2026-08-24 使用者回報：「教練手機端快速預約視窗，下面的關閉跟確認沒有一樣高」——
   等高這件事原本只在 .mh2-foot 這一組解掉，其他視窗照樣會歪。改成所有 .modal-foot
   的按鈕都吃同一個最小高度並置中。 */
t('★★ 所有視窗的底部按鈕一律等高（不只 mh2-foot 那一組）',
  /\.modal-foot \.btn\{box-sizing:border-box;min-height:44px;/.test(s)
  && /用 min-height 不是 height：有些視窗的按鈕字會折兩行/.test(s));
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
/* 2026-08-24：卡面的提示與視窗的圓鈕改吃同一支 memh2Acts ——
   分兩份寫一定會漂：卡上寫「點我改時間」、點進來卻沒有那顆鈕，比沒有提示更糟。 */
t('★★ 能做什麼只算一次（memh2Acts），視窗與卡面共用',
  /const _A=memh2Acts\(b, st\);/.test(tap)
  && /const _isSelfBk=_A\.isSelfBk, selfServe=_A\.selfServe;/.test(tap)
  && /const selfServe=\(!st\.done && !st\.past\) && \(st\.isGrp \|\| isSelfBk\);/.test(s));
t('★★ 卡面寫出「點了會怎樣」（有客戶不知道要點卡片才能改時間）',
  /function memh2Hint\(b, st\)\{/.test(s)
  && /if\(a\.checkin\) return \['點我簽到','go'\];/.test(s)
  && /if\(a\.resched\) return \['點我改時間或取消','go'\];/.test(s)
  && /if\(a\.cancel\)  return \['點我取消名額','go'\];/.test(s)
  && /return null;/.test(s));
t('★ 沒事可做就不寫（不要騙人點）',
  /有事可做才寫，沒事可做就不要騙人點/.test(s)
  && /\.memh2 \.admh2-card\.admh-done \.a2-hint,\.memh2 \.admh2-card\.mh2-past \.a2-hint\{display:none;\}/.test(s));
t('改時間只給自主訓練', /selfServe && _isSelfBk && b\.member_id===SESSION\.id[\s\S]{0,120}改時間/.test(tap));

// ── ［＋］沿用現有引擎 ──
t('時段探測已抽成共用的 msbProbeFree', /async function msbProbeFree\(\)\{/.test(s));
t('msbLoadSlots 改呼叫 msbProbeFree（沒有兩份探測邏輯）',
  /const r=await msbProbeFree\(\);/.test(cut('async function msbLoadSlots(){','async function msbPickSlot(t){')));
const add=cut('async function memh2SelfSlots(ds, until){','function memh2SelSlot(t){');
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
t('★★ 底部自主訓練列改成外殼層常駐（我的票券那一頁也看得到）',
  /async function memSelfBarSync\(\)\{/.test(s)
  && /setTimeout\(\(\)=>\{ try\{ memSelfBarSync\(\); \}catch\(_\)\{\} \},0\);/.test(s));
/* 2026-08-27：這一段移除了 —— filter 一旦被切成 'self'，grpOpen 就不畫，
   客人從［＋］回來之後「可報名的團體課」會整片不見。 */
t('★★ 點［＋］不再動 filter（否則團課報名卡會整片消失）',
  !/_s\.filter='self'/.test(s)
  && /不能留著：s\.filter 一旦被切成 'self'，memh2HTML 就不畫「當天可報名的團體課」/.test(s));
t('當天有開、自己還沒報名的團體課會列出來',
  /bkIsGroup\(b\)\s*\n\s*&& !\(typeof bkHasMember==='function' && bkHasMember\(b,SESSION\.id\)\)/.test(html));
t('只在「全部」分頁出現（團體課分頁已收掉）', /const grpOpen=\(s\.filter==='all'\)/.test(html));
t('★ 沒有團體課票券的人也看得到課卡（列出來不看票券）',
  !/grpTks[\s\S]{0,60}grpOpen/.test(html));
t('★ 沒票的人點下去給說明卡，不是一句吐司',
  /if\(!\(window\._msb\.grpTks\|\|\[\]\)\.length\)\{[\s\S]{0,400}購課請洽櫃檯或你的教練/.test(s));
/* 0823 使用者回報：「會員端過期的團課沒有暗化 看起來像是可以預約」——
   原本 _nowM 只在「看今天」時算得出來，其他日期一律 -1，而條件寫成 `_nowM<0 || …`，
   於是翻到過去的日期時第一個條件短路成立，整批被列成「還可報名」。
   改法：過去的照樣列（那天開過什麼課會員本來就該看得到），但暗化、不可點、寫「已結束」。 */
t('今天：已經開始的不列（報不了名）', /\(_grpPast \|\| _nowM<0 \|\| timeToMin\(b\.start_time\|\|'0:0'\)>=_nowM\)/.test(html)
  && /const _grpPast=\(s\.date<today\);/.test(html));
t('過去的日子：列出來但暗化、不可點、文案改「已結束」',
  /const past=_grpPast \|\| \(s\.date===today && _nowM>=0 && timeToMin\(b\.start_time\|\|'0:0'\)<_nowM\);/.test(html)
  && /\$\{past\?' mh2-past':''\}/.test(html)
  && /\$\{heads\}\/\$\{cap\} 人\$\{past\?'・已結束':\(full\?'・已額滿':'・還可報名'\)\}/.test(html));
/* 2026-08-24 使用者指示：「雖然我這帳號沒有團體課票，還是要先顯示團體課標題卡，
   然後下方圓形鈕＋加入」—— 卡片改成一律點得開（先看到卡），能不能加入由圓鈕自己說。 */
t('★★ 團體課卡一律點得開（額滿／已結束也看得到卡）', /const full=heads>=cap;/.test(html)
  && /onclick="memh2GrpTap\('\$\{b\.id\}'\)"/.test(html)
  && !/\(full\|\|past\)\?''/.test(html));
t('★★ 能不能加入由圓鈕說：額滿／已結束不可按，沒票改「需購票」',
  /joinOrb = past \? orb\('off','—','已結束',null\)/.test(s)
  && /full \? orb\('off','—','已額滿',null/.test(s)
  && /tkN>0 \? orb\('go','＋','加入'/.test(s)
  && /orb\('cx','＋','需購票',`memTaskClose\(\);memGrpPlans\(\)`/.test(s));
t('★★ 有沒有票的判準與 msbGrpJoin 挑票那一段一致（效期要涵蓋上課那天）',
  /t\.status==='usable' && \(Number\(t\.sessions_remaining\)\|\|0\)>0/.test(s)
  && /\(!t\.expire_date \|\| t\.expire_date>=b\.date\)/.test(s));
t('★ 方案表只講方案、不放下單按鈕（買方案一律洽櫃檯）',
  /function memGrpPlans\(\)\{/.test(s)
  && /row\('體驗課','1 堂','600',''\)/.test(s)
  && /row\('一般方案','12 堂','6,000','期限 12 個月'\)/.test(s)
  && /row\('優惠方案','4 堂','1,600','期限 4 週'\)/.test(s)
  && /欲購買方案請洽<b>櫃檯小編<\/b>/.test(s));
t('自己已報名的課卡過期也暗化，且用 st.ended（下課時間）不是 st.past（開始時間）',
  /\$\{\(st\.ended&&!st\.done\)\?' mh2-past':''\}/.test(html)
  && /ended:\(slot\+\(\(Number\(b\.duration\)\|\|60\)\*60000\)\)<=Date\.now\(\)/.test(s)
  && /past 給「改時間／取消」用 —— 課一開始就該鎖，這是原本的語意，不要動/.test(s)
  && /\.memh2 \.admh2-card\.mh2-past\{opacity:\.45;filter:brightness\(0\.92\) saturate\(0\.6\);\}/.test(s));
t('　　已簽到的不必再暗（那顆綠章就是結論，暗掉反而像沒上到）',
  /已簽到的不必再暗（那顆綠章就是結論，暗掉反而像沒上到）/.test(s));
t('可報名的卡用虛線框，與自己的課分得開',
  /\.memh2 \.admh2-card\.mh2-grpopen\{[^}]*border:1\.5px dashed/.test(s.replace(/\n\s*/g,'')));
t('報名沿用既有的 msbGrpJoin（只是先把 _msb 狀態建起來）',
  /async function memh2GrpJoin\(bid\)\{[\s\S]{0,2000}msbGrpJoin\(bid\);/.test(s));
/* 2026-08-22 使用者回報：8/24 13:00 教練請假的團課，張寶繡卻進了名單 */
t('★ 教練請假的團課不列進「可報名」', /&& !\(typeof bkIsCoachLeave==='function' && bkIsCoachLeave\(b\)\)/.test(html));
t('★ 報名那一步再擋一次（扣課的動作不能只靠畫面沒畫出來當防線）',
  /if\(_b && typeof bkIsCoachLeave==='function' && bkIsCoachLeave\(_b\)\)\{[\s\S]{0,300}這堂課教練請假/.test(s));

// ── 底部導覽 ──
t('底部導覽「首頁」改成「我的預約」',
  /\{key:'mem_bookings', label:'我的預約'\}/.test(s));

// ── 樣式隔離 ──
const css=cut('/* ══ 會員手機首頁 V2','/* 2026-08-20 使用者指示：改白底＋左側課程色條');
/* .modal-foot.mh2-foot 是彈窗底部的修飾 class（彈窗不在 .memh2 裡面，掛不進去），
   一樣只有帶 mh2-foot 的那幾張視窗吃得到。 */
/* .pp-head-self 是會員本人的個人資料（不在 .memh2 裡）、
   .tb-acct-item .acct-nsw 是帳號選單那顆開關 —— 兩者都各自有自己的範圍限定。 */
/* 2026-08-27 二修：橫排日期列那一組（.a2-week/.a2-wnav/.a2-wdays/.a2-wd/.a2-wdot/.a2-wtoday）
   提升成共用 —— 教練手機首頁與管理員手機首頁同日也改成「日期列在上」，三頁同一份樣式。
   ⚠ 白名單逐個列名，不放行整個 .a2- 前綴：.a2-day／.a2-railin／.a2-quickadd 那些是
     左欄與課卡欄在用的共用件，會員頁不該去動它們。 */
const MEMH2_SHARED_OK=/^\.a2-(week|wnav|wdays|wd|wdot|wtoday|wn|wback)(?![\w-])/;
t('所有新樣式都掛在 .memh2 / .mh2- / .modal-foot.mh2-foot / .pp-head / .pp-sheet-self / .tb-acct-item 之下',
  css.split('\n').filter(l=>/^\.[a-z]/.test(l.trim()))
     .every(l=>/^\.(memh2|mh2-|mh2p-|modal-foot\.mh2-foot|pp-head|pp-sheet(\.|-)|tb-acct-item)/.test(l.trim())
              || MEMH2_SHARED_OK.test(l.trim())));
/* 0823：主顧客課程價目那一段原本叫 lp-*，與桌機管理列表 lpTable 的 .lp-row 同名同權重，
   而且寫在樣式表更後面 → 全站管理列表的資料列都被它蓋成白框，連 820px 以下
   「攤成卡片」那條也失效。改名 mh2p-* 之後兩邊各歸各的。 */
t('★★ 主顧客課程價目改名 mh2p-*，不再與 lpTable 的 .lp-row 撞名',
  !/^\.lp-row\{display:grid;grid-template-columns:auto minmax\(0,1fr\) auto auto/m.test(s)
  && /\.mh2p-row\{display:grid;grid-template-columns:auto minmax\(0,1fr\) auto auto/.test(s)
  && /<div class="mh2p-row">/.test(s)
  && /全站每一張管理列表（會員、票券、收款…）的資料列都被這裡的白框樣式蓋掉/.test(s));
t('　　lpTable 那一組回到原本的「白底表格＋細分隔線」與 820px 攤成卡片',
  /\.lp-row\{display:grid;gap:12px;padding:15px 18px;align-items:center;/.test(s)
  && /\.lp-row\{display:flex;flex-direction:column;align-items:stretch;gap:8px;/.test(s));
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
  /body\.memh2-shell \.tb-bulb,\s*\n?body\.memh2-shell \.tb-butler,/.test(s));
/* 2026-08-27：入口合併成一顆 #acct-fortune，顯示由 syncAcctMenuItems 決定
   （原本手機／桌機各一顆，靠斷點錯開，601–1024 直式會同時出現）。 */
t('★★ 「今日運勢」入口只剩一顆，三種角色照舊都看得到',
  (s.match(/onclick="drawFortuneInline\(\)"/g)||[]).length===1
  && /<button id="acct-fortune" class="tb-acct-item tb-acct-butler"/.test(s)
  && /if\(_fort\) _fort\.style\.display =/.test(s));

// ── LINE 圖文選單的深層連結 ──
t('?go=bookings 進「我的預約」', /if\(go==='bookings'\|\|go==='home'\)\{ navTo\('mem_bookings'\); return true; \}/.test(s));

console.log('\n簡易課卡的圓形卡（2026-08-25 使用者回報「右邊四個位子偏移了　變高了」）');
/* 容器原本只設 margin-top，ticketTokens 吐出來的 .mtk 就是行內元素，走文字基線對齊：
   內容是「✓」的、是日期的、帶「本堂」彗星標記的各自基線不同，一換行就高高低低。
   別處的圓點容器（.mck-dots2）本來就是 flex-wrap，只有這裡漏掉。 */
t('★★ 圓點容器要 flex-wrap＋垂直置中，不能讓它走文字基線',
   /#mem-task-pop \.mtp-dots\{margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;align-items:center;\}/.test(s));
t('　　與別處的圓點容器同一組數值（.mck-dots2 是 flex-wrap gap:5px）',
   /\.mck-dots2\{display:flex;flex-wrap:wrap;gap:5px;\}/.test(s));
t('　　成因寫在原地', /走的是文字的基線對齊/.test(s));

/* 2026-08-27 客人回饋（使用者轉述）：「自主訓練在快速預約的時候　都要關掉視窗再選其他天
   再點快速預約　比起之前點快速預約可以在同一個頁面換日期多了一個步驟
   可以把日期列設計回去快速預約的視窗裡面嗎」 */
console.log('\n快速預約視窗裡的日期列（換一天不必關窗）');
{
  const QS=cut('async function memh2SelfSlots(ds, until){','function memh2SelSlot(');
  t('★★ 視窗裡有日期列，排在標題與 qs-head 之間',
    /<div class="modal-title">預約自主訓練<\/div>\s*\n\s*\$\{_dayRow\}\s*\n\s*<div class="qs-head">/.test(QS));
  t('★★ 點某一天＝同一個視窗換內容（重新呼叫自己，不另外開一層）',
    /onclick="memh2SelfSlots\('\$\{x\}','\$\{_lim\}'\)"/.test(QS));
  t('★★ 只列約得到的日子：今天起，且落在任何一張自主訓練票的效期內（多張取聯集）',
    /const _okDay=x=>x>=_t0 && \(!_lim \|\| x<=_lim\)/.test(QS)
    && /&& _rng\.some\(\(\[st,ex\]\)=>\(!st\|\|x>=st\)&&\(!ex\|\|x<=ex\)\);/.test(QS)
    && /const _selfTks=\[\]\.concat\(s\.groups\.self\|\|\[\], s\.groups\.friendly\|\|\[\]\);/.test(QS));
/* 2026-08-31 使用者：「上方的日期列也自動篩選該自主訓練的圓形卡的期限」 */
t('★★ 從底部圓卡點進來時帶著那一點的到期日，日期列只列到那天',
    /async function memh2SelfSlots\(ds, until\)\{/.test(s)
    && /window\._mh2SelfUntil=String\(until\|\|''\)\|\|null;/.test(s)
    && /onclick="memh2SelfSlots\('\$\{p\.from\}','\$\{p\.ex\|\|''\}'\)"/.test(s));
t('★★ 視窗裡換日期時效期篩選不能掉（客人會「看一下 7 點、再看一下 8 點」）',
    /onclick="memh2SelfSlots\('\$\{x\}','\$\{_lim\}'\)"/.test(QS)
    && /日期列會突然變回所有票的聯集 —— 剛做的按點篩選等於只在第一次生效。/.test(s));
t('★★ 說明也改成講「這一點」的效期，不是講所有票的最晚那天',
    /if\(_lim\) return `這一點的效期到 \$\{_lim\.replace\(\/-\/g,'\/'\)\}`;/.test(QS));
t('　 為什麼要按點篩選（白挨一次擋）—— 理由寫在原地',
    /點的是 9\/3 到期那一點、卻看得到 9\/10，按下去才被擋，那個擋是白挨的。/.test(s));
/* 2026-08-31 使用者：「會員選了自主訓練-點了某時段 但沒有返回的按鈕
   按了返回就回到主頁面 這樣有點慢」 */
t('★★ 確認預約那一步的「返回」退回挑時段，不是關掉整個流程',
  /<button class="btn btn-ghost" onclick="msbSlotBack\(\)">返回<\/button>/.test(s)
  && /function msbSlotBack\(\)\{\s*\n\s*const b=window\._mh2SlotBack;\s*\n\s*if\(b && b\.date\)\{ memh2SelfSlots\(b\.date, b\.until\|\|''\); return; \}/.test(s));
t('★★ 來路由 memh2GoSlot 立（日期＋那一點的效期都要帶）',
  /window\._mh2SlotBack=\{ date:\(\(window\._msb\|\|\{\}\)\.date\)\|\|mh2S\(\)\.date, until:window\._mh2SelfUntil\|\|'' \};/.test(s));
t('★★ 沒有來路就照舊關掉（舊版下方訂位表、改期那兩條路不受影響）',
  /closeModal\(\);\s*\n\}\s*\n\/\* 選好時段之後/.test(s) || /if\(b && b\.date\)\{ memh2SelfSlots[\s\S]{0,80}?closeModal\(\);/.test(s));
t('★★ 旗標用完就清（回到挑時段那頁、送出預約各清一次）',
  /window\._mh2SlotBack=null;        \/\/ 回到挑時段這一頁＝來路重新開始/.test(s)
  && /window\._mh2SlotBack=null;        \/\/ 送出＝這一輪結束，來路不留/.test(s));
t('★★ 日期列放大（52→70px，字級各升一級）',
    /\.qs-day\{flex:none;display:flex;flex-direction:column;align-items:center;gap:3px;\s*\n\s*min-width:70px;padding:10px 10px;/.test(s)
    && /\.qs-day b\{font-family:var\(--num\),inherit;font-size:19px;/.test(s));
  t('　 與課卡頁那支 selfOk 同一個判斷式（兩處要說同一件事）',
    /const selfOk=ds=>ds>=today && selfRanges\.some\(\(\[st,ex\]\)=>\(!st\|\|ds>=st\)&&\(!ex\|\|ds<=ex\)\);/.test(s));
  t('★★ 效期寫在說明裡（不是把不能用的日子偷偷藏掉）',
    /\$\{_limTxt\?`<li>\$\{_limTxt\}，上方只列效期內約得到的日子<\/li>`:''\}/.test(QS)
    && /這一列的定義就是「可預約日」/.test(s));
  t('★ 封頂 14 天，超過的用一枚「\+N」說一聲（不默默截掉）',
    /if\(_days\.length<14\) _days\.push\(\[x,dd\]\); else _more\+\+;/.test(QS)
    && /_more\?`<span class="qs-day qs-daymore" title="效期內還有 \$\{_more\} 天，先約近的">\+\$\{_more\}<\/span>`:''/.test(QS));
  t('★ 只有一天可約時不畫這一列（一顆按鈕的日期列沒有意義）',
    /const _dayRow=_days\.length>1/.test(QS));
  t('★ 選中＝品牌綠、今天＝金框（與頁面上的日期列同一組語彙）',
    /\.qs-day\.on\{background:var\(--green\);border-color:var\(--green\);\}/.test(s)
    && /\.qs-day\.qs-today\{border-color:var\(--gold,#B48A56\);\}/.test(s));
  t('★★ 原本的挑時段流程一格沒動（時段格、確認鈕、過去時段仍濾掉）',
    /onclick="memh2SelSlot\('\$\{minToTime\(m\)\}'\)"/.test(QS)
    && /<button class="btn btn-primary" id="mh2qs-ok" disabled onclick="memh2GoSlot\(\)">確認<\/button>/.test(QS)
    && /const mms=Array\.from\(r\.free\)\.filter\(m=>_nowMin<0\|\|m>=_nowMin\)\.sort\(\(a,b\)=>a-b\);/.test(QS));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
