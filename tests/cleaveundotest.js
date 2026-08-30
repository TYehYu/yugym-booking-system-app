/* 2026-08-14 使用者需求：
   ①「教練請假按錯了沒有返回功能嗎」→ 復原鈕（bkCoachLeaveUndo）
   ②「教練請假後會員也不來，這堂卡住無法取消」→ coach_leave 的堂開放取消（無票簡易確認） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 復原教練請假');
{
  const F=grabFn('_bkCoachLeaveUndo');
  ok('★★ 只復原教練課的 coach_leave（團課是整堂取消，明講請重新建課）',
     /if\(b\.status!=='coach_leave'\)\{ showToast\('這堂不是可復原的教練請假（團課請假是整堂取消，請重新建課）'\)/.test(F));
  ok('★★ 舊制（已退堂）從 refund 帳本回查扣回；新制（票還掛著）不動票、只回調效期',
     /logs\.filter\(l=>l\.action==='refund'\)/.test(F)
     && /await logTicket\(tid,'deduct',-1,b\.id,SESSION\.id,'復原教練請假：扣回 1 堂'/.test(F)
     && /const _keepTk=!tid && !!b\.ticket_id;/.test(F));
  ok('★★ 那 1 堂已被用掉／票已作廢 → 擋下不硬扣', /退回的那 1 堂已被用掉或票已作廢，請先處理票券/.test(F));
  ok('★★ 效期回調：只有帳本有「教練請假展延」那筆才 −7 天',
     /l\.action==='adjust' && \/教練請假展延\/\.test\(l\.note\|\|''\)/.test(F)
     && /d0\.setDate\(d0\.getDate\(\)-COACH_LEAVE_EXTEND_DAYS\)/.test(F));
  ok('★★ 重綁票券時清掉待簽約標記（2026-08-14 林韋綺案例：留著會紅框標待簽約）',
     /if\(tid\) b\.pending_contract=false;/.test(F));
  ok('★ 課種從 note 的「原：X」還原、狀態回 booked、重綁票券',
     /const _m=String\(b\.note\|\|''\)\.match\(\/（原：（?\[\^）\]\+）?\/g\)\.length?/.test(F) || /（原：/.test(F)
     && /b\.status='booked'; b\.coach_leave=false; b\.category=orig; b\.ticket_id=tid\|\|b\.ticket_id\|\|null;/.test(F));   /* 新制票沒動過就保留（2026-08-14） */
  ok('★ 復原不再通知會員（2026-08-14 使用者指示：課程變動不通知，只留開課通知）',
     !/課程照常進行/.test(F) && /課程變動不通知會員/.test(F));
  ok('　　防連點', /bkCoachLeaveUndo\(id\)\{ return onceAct\('cleaveundo:'\+id/.test(src));
  ok('★ 明細標籤旁有復原鈕、代課面板的「已標記」也能點復原',
     /onclick="bkCoachLeaveUndo\('\$\{b\.id\}'\)"/.test(src)
     && /已標記教練請假<i>按錯了？點我復原<\/i>/.test(src));
}

console.log('\n①-b 新制：請假當下不退堂（2026-08-14 使用者定案：先釋出會被挪用，等簽到/取消才退）');
{
  /* 2026-08-30：bkCoachLeave 拆成「先問」＋「_bkCoachLeaveGo 才做」（使用者：
     「請假展延的訊息要先提醒在確認」），真正動手的那一半在 _bkCoachLeaveGo。 */
  const L=grabFn('_bkCoachLeaveGo');
  ok('★★ 請假不再立刻退堂、票繼續掛著（無 refundTicket 呼叫、不清 ticket_id）',
     !/refundTicket\(_tkId/.test(L) && !/b\.ticket_id=null/.test(L)
     && /堂數待簽到或取消時退回/.test(L));
  ok('★★★ 動手之前先讓人看到「效期會從幾號延到幾號」',
     /票券效期 <b>\$\{_f\(_from\)\} → \$\{_f\(_to\)\}<\/b>（延長 \$\{COACH_LEAVE_EXTEND_DAYS\} 天）/.test(src)
     && /<button class="btn btn-green" onclick="bkCoachLeaveGo\('\$\{id\}'\)">確認請假<\/button>/.test(src));
  ok('★★★ 沒有到期日要明講「不需要展延」（不能只是把那半句拿掉）',
     /這張票<b>沒有到期日<\/b>，不需要展延。/.test(src)
     && /\(_ext&&_ext\.skipped==='noexp'\)\?'這張票沒有到期日（不需展延）'/.test(src));
  /* 2026-08-30 使用者定案：同一週的教練請假只延一次 7 天 */
  ok('★★★ 同一週已延過 → 確認視窗先講，不要按了才發現沒延',
     /const _dupWk=\(_t&&_from\)\?await leaveExtDoneThisWeek\(b\.ticket_id,b\.date\):false;/.test(src)
     && /票券效期<b>不再延長<\/b> —— 這一週（/.test(src)
     && /同一週只補一次，不然一週排五堂就會多延五週。/.test(src));
  ok('★★ 完成後的提示也要說得出原因（不是只顯示「效期未變」）',
     /\(_ext&&_ext\.skipped==='week'\)\?'這一週已經延過，效期不再延'/.test(src));
  ok('★★ 確認之後再驗一次狀態（視窗開著時別人可能已經動過這堂）',
     /if\(bkIsCoachLeave\(b\)\)\{ closeModal\(\); showToast\('這堂已經標記過教練請假'\); return; \}/.test(src));
  ok('★★ 防連點（這會動效期）',
     /async function bkCoachLeaveGo\(id\)\{ return onceAct\('coachleave:'\+id, \(\)=>_bkCoachLeaveGo\(id\)\); \}/.test(src));
  ok('　 團課那條照舊走自己的確認視窗（它 0808 就會先問）',
     /if\(bkCoachLeaveMode\(b\)==='cancel'\) return grpCoachLeave\(id\);/.test(src));
  ok('★★ 簽到時釋出：前端 fallback 退堂＋解綁、RPC 端同步（migration 留檔）',
     /const _clvTk=\(b\.coach_leave===true && b\.ticket_id\) \? b\.ticket_id : null;/.test(src)
     && /await refundTicket\(_clvTk,b\.id,SESSION\.id\)/.test(src));
  const fs4=require('fs');
  ok('　　migration 留檔', fs4.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260814_coach_leave_deferred_refund.sql'));
}

console.log('\n② 教練請假的堂可以取消（會員不來時不卡死）');
ok('★★ canCancel 兩處都放行 coach_leave',
   (src.match(/b\.status==='booked' \|\| b\.status==='checked_in' \|\| b\.status==='coach_leave'/g)||[]).length
   +(src.match(/b\.status==='booked'\|\|b\.status==='checked_in'\|\|b\.status==='coach_leave'/g)||[]).length>=2);
ok('★★ 取消視窗依票況分流：票還掛著（新制）→ force 退回；已退過（舊制）→ none 只釋出',
   /const _hasTk=!!b\.ticket_id;/.test(src)
   && /教練請假的堂數尚未退回 —— 取消後退回 1 堂票券、釋出時段與場地/.test(src)
   && /askSeriesCancel\('\$\{id\}','\$\{_hasTk\?'force':'none'\}'\)/.test(src));
console.log('\n③ 請假課卡的視覺區分（2026-08-14 使用者指示：教練 tag 改紅底「教練請假」）');
/* 2026-08-21：標準卡與首頁卡的標籤字縮成「請假」（使用者：「其實改成請假就好」）——
   紅底不變，三處都還在標，只是字短了（原本在窄卡會被切成「教練…」）。 */
ok('★★ 三處課卡（行事曆 ev 卡／標準卡／首頁今日課表）都換紅底標記',
   (src.match(/background:#7A2E28;color:#F4F1E8;">(教練請假|請假)<\/span>/g)||[]).length>=3
   && /if\(bkIsCoachLeave\(b\)\) return `<span class="ev-coach-tag"/.test(src)
   && /const _abbrOut = bkIsCoachLeave\(b\)/.test(src)
   && /const coTag=bkIsCoachLeave\(b\)/.test(src));

console.log('\n④ 已請假的卡位不能轉正（2026-08-14 吳宜玲 8/21 案例：轉正把請假堂綁票扣課、吃掉分期額度）');
/* 2026-08-21：待簽約卡的按鈕改成三段（安排會員→儲值→轉正），
   b.status==='booked' 的守衛移到外層 if 包住整組，轉正本身多一個「有票才給」。 */
ok('★★ 轉正入口擋非 booked 狀態、卡上轉正鈕也不顯示',
   /if\(b\.status!=='booked'\)\{ _clr\(\); showToast\('這筆卡位已'/.test(src)
   /* 2026-08-24 拆成兩段：「還沒有人」放寬到教練（自己的課），
      「已經有人」的儲值／轉正／開通下一期仍然只給櫃檯以上（那些會動到錢與票）。 */
   && /if\(staff && !closed && b\.status==='booked' && b\.member_id\)\{/.test(src)
   && /if\(\(staff\|\|own\) && !closed && b\.status==='booked' && !b\.member_id\)\{/.test(src)
   && /evoBtn\('evo-r2','evo-primary',`ashBackArm\('\$\{id\}'\);collapseBkCard\(\);openConvertPending/.test(src));

console.log('\n⑤ 沒綁票券的堂不能教練請假（2026-08-14 使用者定案）');
ok('★★ canCoachLeave 要求有票（團課例外——票在帳本不在 ticket_id）',
   /function canCoachLeave\(b\)\{ return !!b && !!bkCoachLeaveMode\(b\) && \(bkIsGroup\(b\) \|\| !!b\.ticket_id\); \}/.test(src));
ok('★ 擋下時講清楚改用取消', /這堂沒有綁票券（待簽約或舊匯入），沒有票可退——請改用「取消」釋出時段/.test(src));

console.log('\n⑥ 圓形卡：教練請假＝紅圈空心（2026-08-14 使用者指示）');
ok('★★ booked 圓點掛 mtk-cleave、提示講清楚時段保留與退堂時點',
   /const clv=\(b&&typeof bkIsCoachLeave==='function'&&bkIsCoachLeave\(b\)\)\?' mtk-cleave':'';/.test(src)
   && /教練請假（時段保留；會員簽到或取消時退堂）/.test(src)
   && /\.mtk-booked\.mtk-cleave\{border:2px solid var\(--danger,#b5372e\);color:var\(--danger,#b5372e\);\}/.test(src));

console.log('\n票券夾：請假中的堂算「待上」（2026-08-14 吳宜玲 ✓ 鬼點＋9/11 被擠出開通區案例）');
ok('★★ slotOf 的 pending 含 coach_leave 狀態（已扣待退不是已用）',
   /const pending=bks\.filter\(b=>b\.ticket_id===t\.id && \(b\.status==='booked'\|\|b\.status==='coach_leave'\)\)\.length \+ \(ga\.pend\[t\.id\]\|\|0\);/.test(src));

console.log('\n簽到一律櫃檯負責＋未到場結課（2026-08-14 使用者指示）');
ok('★★ 會員端明細不給自簽鈕、改顯示「請洽櫃檯」', /教練請假堂：到場後請洽櫃檯簽到/.test(src));
ok('★★ checkInBooking 函式層也擋會員（深連結繞不過）',
   /if\(\(b\.status==='coach_leave'\|\|b\.coach_leave===true\) && SESSION && SESSION\.role==='member'\)\{/.test(src));
ok('★★ 櫃檯明細有兩顆：簽到（發點）＋未到場結課（不發點）',
   /onclick="bkCoachLeaveNoShow\('\$\{b\.id\}'\)">未到場結課<\/button>/.test(src)
   && /學生有到場：退堂＋發自主訓練點數/.test(src));
ok('★★ 未到場結課＝completed＋退堂、不發點、不寫 checked_in_at',
   (()=>{ const i2=src.indexOf('async function bkCoachLeaveNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 復原教練請假', i2));
     return i2>=0 && /b\.status='completed';/.test(F) && /refundTicket\(_tk,b\.id,SESSION\.id\)/.test(F)
       && !/checked_in_at=/.test(F) && !/grantCheckinReward|handle_checkin_reward|fn_checkin_booking/.test(F); })());
ok('★ 課程時間未到不能結課', /課程時間還沒到，還不能結課/.test(src));
/* 2026-08-30 使用者指示推翻 0814 同日二修：「8/24 要出現 就跟其他教練請假的圓形卡一樣」。
   當時不畫的理由是「堂數已退、人也沒來」，但那正是會員最需要看到的一格 ——
   鄭宇涵 8/24 那堂 MANGO 請假、人沒來，卡片上完全沒有痕跡，
   客人只會覺得「我約了 8 堂怎麼只看到 7 堂」。 */
/* 2026-08-30 二修（使用者：「喔喔 是因為未到 那用金色的色點」）——
   畫是要畫，但兩種要分得開：紅＝請假但人有來（教練與場地照樣被佔掉）、
   金＝請假而且人沒來。同一條紅>金>綠：紅要留意、金知道就好。 */
ok('★★★ 未到場結課畫金色點、到場畫紅色點（判準與 bkCoachLeaveNoShow 一致）',
   /const _clvNoShow=b=>!!b && b\.status!=='checked_in' && !b\.checked_in_at;/.test(src)
   && /\.mtk-lv\.mtk-lv-ns \.mtk-shdot\{background:var\(--gold-d,#b48a56\);\}/.test(src)
   && /mtk-lv\$\{ns\?' mtk-lv-ns':''\}/.test(src));
ok('★★ 滑鼠提示要說得出是哪一種（櫃檯不必靠記顏色）',
   /title="教練請假・\$\{ns\?'未到場結課':'會員已到場簽到'\}（堂數已退回票券）/.test(src));
ok('★★ 圓點：只要是「請假且已結課」就畫（不再分有沒有到場），一律不佔格',
   /if\(bkLeaveRefunded\(b\)\)\{[\s\S]{0,120}?_clvAttL\.push\(b\);\s*\n\s*return;/.test(src)
   && !/if\(b\.status==='checked_in'\|\|b\.checked_in_at\) _clvAttL\.push\(b\);/.test(src));

console.log('\n課卡環繞按鈕（2026-08-14 使用者指示：加金色「未到課」、拿掉代課）');
ok('★★ 請假堂有金色「未到課」圓鈕 → bkCoachLeaveNoShow',
   /if\(!_calCtx && \(staff\|\|coachCk\) && b\.status==='coach_leave'\) btns \+= evoBtn\('evo-b2','evo-gold',`collapseBkCard\(\);bkCoachLeaveNoShow\('\$\{id\}'\)`,'noshow','未到課'\);/.test(src));   // 2026-08-19 行事曆情境不放
ok('★★ 請假堂不顯示代課（復原入口在明細）',
   /b\.date>=ymd\(TODAY\) && !bkIsCoachLeave\(b\)\)\{/.test(src)
   && /教練請假的堂不顯示代課/.test(src));
ok('★ noshow 圖示已註冊', /noshow:`<svg viewBox="0 0 24 24"/.test(src));

console.log('\n未到課（2026-08-14 金色圓鈕＋課卡右下角金色「未」章；0825 擴到所有單人課）');
/* 2026-08-25 使用者回報「今天陳世勳未出席，為什麼圓形按鈕沒有按鈕可以按」——
   0814 這一顆的條件寫著 bkIsSelf(b)，所以只有自主訓練有；教練課、友善教練課、體驗
   全都沒有。櫃檯遇到客人沒來只剩假簽到或取消（取消會把堂數退回去）。 */
ok('★★ 所有單人課（預約中、非教練請假堂）都有金色「未到課」圓鈕 → bkMarkNoShow',
   /else if\(!_calCtx && \(staff\|\|coachCk\) && !bkIsCoachLeave\(b\) && !isGroup && b\.status==='booked'\) btns \+= evoBtn\('evo-b2','evo-gold',`collapseBkCard\(\);bkMarkNoShow\('\$\{id\}'\)`,'noshow','未到課'\);/.test(src)
   && !/bkIsSelf\(b\) && !bkIsCoachLeave\(b\) && !isGroup && b\.status==='booked'\) btns/.test(src));   // 2026-08-19 行事曆情境不放
ok('★★ bkMarkNoShow＝completed＋no_show 旗標、堂數照扣不退',
   (()=>{ const i2=src.indexOf('async function bkMarkNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 舊名字留著', i2));
     return i2>=0 && /b\.status='completed';/.test(F) && /b\.no_show=true;/.test(F)
       && !/refundTicket/.test(F) && /照扣/.test(F); })());
ok('★★ 團課與教練請假堂各自擋掉（那是另外兩套流程）',
   (()=>{ const i2=src.indexOf('async function bkMarkNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 舊名字留著', i2));
     return /if\(bkIsCoachLeave\(b\)\)\{ showToast\('教練請假的堂請用「未到場結課」'\)/.test(F)
       && /if\(bkIsGroup\(b\)\)\{ showToast\('團體課請在名單上逐位處理'\)/.test(F); })());
ok('★★ 時間還沒到不給標（防手滑）',
   (()=>{ const i2=src.indexOf('async function bkMarkNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 舊名字留著', i2));
     return /if\(new Date\(\)<slotDt\)\{ showToast\('課程時間還沒到，還不能標未到課'\); return; \}/.test(F); })());
ok('　　舊名字留著（0814～0825 之間可能還有別處在呼叫）',
   /function bkSelfNoShow\(id\)\{ return bkMarkNoShow\(id\); \}/.test(src));
ok('★★ 復原（bkUndoNoShow）認得出新的措辭，不然 note 會留一行殘骸',
   /!\/未到課（\(點數\|堂數\)照扣）\/\.test\(l\)/.test(src));
ok('★★ 教練請假未到場結課也記 no_show 旗標', (()=>{ const i2=src.indexOf('async function bkCoachLeaveNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 客人沒來', i2));
     return i2>=0 && /b\.no_show=true;/.test(F); })());
ok('★★ 課卡右下角金色「未」章（優先於綠色簽章）',
   /b\.no_show===true && b\.status!=='cancelled' && !hideMember\)\n\s*\? `<span class="evc-check evc-noshow" title="未到課">未<\/span>`/.test(src)
   && /\.evc-check\.evc-noshow,\.cal-ev\.cal-ev-std \.evc-check\.evc-noshow\{background:var\(--gold-d,#9a6a1e\);\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
