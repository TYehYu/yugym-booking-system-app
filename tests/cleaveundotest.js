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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
