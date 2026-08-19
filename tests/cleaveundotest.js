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
  const L=grabFn('bkCoachLeave');
  ok('★★ 請假不再立刻退堂、票繼續掛著（無 refundTicket 呼叫、不清 ticket_id）',
     !/refundTicket\(_tkId/.test(L) && !/b\.ticket_id=null/.test(L)
     && /堂數待簽到或取消時退回/.test(L));
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
ok('★★ 三處課卡（行事曆 ev 卡／標準卡／首頁今日課表）都換紅底標記',
   (src.match(/background:#7A2E28;color:#F4F1E8;">教練請假<\/span>/g)||[]).length>=3
   && /if\(bkIsCoachLeave\(b\)\) return `<span class="ev-coach-tag"/.test(src)
   && /const _abbrOut = bkIsCoachLeave\(b\)/.test(src)
   && /const coTag=bkIsCoachLeave\(b\)/.test(src));

console.log('\n④ 已請假的卡位不能轉正（2026-08-14 吳宜玲 8/21 案例：轉正把請假堂綁票扣課、吃掉分期額度）');
ok('★★ 轉正入口擋非 booked 狀態、卡上轉正鈕也不顯示',
   /if\(b\.status!=='booked'\)\{ _clr\(\); showToast\('這筆卡位已'/.test(src)
   && /if\(staff && !closed && b\.status==='booked'\) btns \+= evoBtn\('evo-r2','evo-primary',`collapseBkCard\(\);openConvertPending/.test(src));

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
ok('★★ 圓點：未到場結課（無 checked_in_at）不畫點不佔格；到場（checked_in 或有簽到時間）畫實心紅圈',
   /if\(b\.status==='checked_in'\|\|b\.checked_in_at\) _clvAttL\.push\(b\);/.test(src));

console.log('\n課卡環繞按鈕（2026-08-14 使用者指示：加金色「未到課」、拿掉代課）');
ok('★★ 請假堂有金色「未到課」圓鈕 → bkCoachLeaveNoShow',
   /if\(!_calCtx && \(staff\|\|coachCk\) && b\.status==='coach_leave'\) btns \+= evoBtn\('evo-b2','evo-gold',`collapseBkCard\(\);bkCoachLeaveNoShow\('\$\{id\}'\)`,'noshow','未到課'\);/.test(src));   // 2026-08-19 行事曆情境不放
ok('★★ 請假堂不顯示代課（復原入口在明細）',
   /b\.date>=ymd\(TODAY\) && !bkIsCoachLeave\(b\)\)\{/.test(src)
   && /教練請假的堂不顯示代課/.test(src));
ok('★ noshow 圖示已註冊', /noshow:`<svg viewBox="0 0 24 24"/.test(src));

console.log('\n自主訓練未到課（2026-08-14 使用者指示：金色圓鈕＋課卡右下角金色「未」章）');
ok('★★ 自主訓練預約中有金色「未到課」圓鈕 → bkSelfNoShow',
   /else if\(!_calCtx && \(staff\|\|coachCk\) && bkIsSelf\(b\) && !bkIsCoachLeave\(b\) && !isGroup && b\.status==='booked'\) btns \+= evoBtn\('evo-b2','evo-gold',`collapseBkCard\(\);bkSelfNoShow\('\$\{id\}'\)`,'noshow','未到課'\);/.test(src));   // 2026-08-19 行事曆情境不放
ok('★★ bkSelfNoShow＝completed＋no_show 旗標、點數照扣不退',
   (()=>{ const i2=src.indexOf('async function bkSelfNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 復原教練請假', i2));
     return i2>=0 && /b\.status='completed';/.test(F) && /b\.no_show=true;/.test(F)
       && !/refundTicket/.test(F) && /點數照扣/.test(F); })());
ok('★★ 教練請假未到場結課也記 no_show 旗標', (()=>{ const i2=src.indexOf('async function bkCoachLeaveNoShow');
     const F=src.slice(i2, src.indexOf('\n/* 自主訓練・未到課', i2));
     return i2>=0 && /b\.no_show=true;/.test(F); })());
ok('★★ 課卡右下角金色「未」章（優先於綠色簽章）',
   /b\.no_show===true && b\.status!=='cancelled' && !hideMember\)\n\s*\? `<span class="evc-check evc-noshow" title="未到課">未<\/span>`/.test(src)
   && /\.evc-check\.evc-noshow,\.cal-ev\.cal-ev-std \.evc-check\.evc-noshow\{background:var\(--gold-d,#9a6a1e\);\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
