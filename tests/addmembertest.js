/* 課卡的［＋新增］會員（2026-08-24 使用者定案，建立預約改版第三批）

   使用者原話：「建立課程以後再點選課程，在標題卡下方會出現＋新增，新增會員；
   名單篩選 1 主教練為該課卡教練的會員名單，開頭加個星號；
   會員列表右邊顯示可使用票券/總票券」＋「團體課新增會員的時候，也要把有票券的會員放在最上面」。

   這一支的重點是 bkMemTicketInfo —— 它同時餵三個地方（單人課的＋新增、團課名單、
   之後的圓形卡調課），而且是**實跑**驗算，不是比對字串。

   最重要的一條：可用堂數一律走 tkFitsBooking。團課名單以前自己寫一套
   （只看 member_id 相符 ＋ sessions_remaining>0），於是看不到共享票、擋不住分期、
   也沒有超約防線 —— 名單說有票、送出卻扣不到就是這樣來的。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

/* 把 bkMemTicketInfo 與它依賴的判定一起抽出來實跑。
   ⚠ 依賴的那幾支（tkFitsBooking / tkOverBooked / tkUnlockedLeft / tkTimeOk / tkUsableBy /
     tkSharedIds / ticketMatchesCategory / tkIsInstall）全部取自真實原始碼，
     不自己造替身 —— 否則驗的就不是產品的判定了。 */
const lib=new Function('window','bkTicketTypeOk','ticketCategoryOf','categoryOfTypeId','parseYmd','timeToMin',
  [g('function tkUsableBy(','\n}'), g('function tkSharedIds(','\n}'),
   g('function tkIsInstall(','\n}'), g('function tkUnlockedLeft(','\n}'),
   g('function tkOverBooked(','\n}'), g('function tkTimeOk(','\n}'),
   g('function ticketMatchesCategory(','\n}'),
   g('function bkMemTicketInfo(','\n}'), g('function tkFitsBooking(','\n}')].join('\n')
  +'\nreturn {bkMemTicketInfo,tkFitsBooking,tkUnlockedLeft};')(
    {_ttCache:[{id:'TT-PT',time_restricted:false},{id:'TT-FR',time_restricted:true}]},
    (t,typeId)=>!typeId || t.ticket_type_id===typeId,
    t=>t.category||'私人教練',
    id=>({'TT-PT':'私人教練','TT-FR':'私人教練','TT-G':'小班肌力'})[id]||'私人教練',
    d=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d||'')); return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
    t=>{const p=String(t||'').split(':'); return (+p[0]||0)*60+(+p[1]||0);});

const B={id:'BK-1', category:'私人教練', ticket_type_id:'TT-PT', date:'2026-09-01', start_time:'10:00', duration:60};
const TK=(o)=>Object.assign({id:'T1', member_id:'M1', ticket_type_id:'TT-PT', category:'私人教練',
  status:'usable', sessions_total:10, sessions_remaining:10, expire_date:null, start_date:'2026-01-01'}, o||{});

console.log('① 正常有票：可用 / 總堂數都算得出來');
{
  const r=lib.bkMemTicketInfo('M1', B, [TK()], {});
  ok('★ 可用 10、總 10、沒有原因字串', r.left===10 && r.remain===10 && r.total===10 && r.why==='');
}

console.log('\n② 分母只算「還沒用完、也還沒過期」的票（2026-08-24 使用者更正）');
{
  const tks=[TK({id:'T1', sessions_remaining:2, sessions_total:10}),
             TK({id:'T2', sessions_remaining:0, sessions_total:8}),          // 用完
             TK({id:'T3', sessions_total:6, sessions_remaining:6, expire_date:'2026-08-01'})]; // 已過期
  const r=lib.bkMemTicketInfo('M1', B, tks, {});
  ok('★★ 分子只算現在能用的（2 堂）', r.left===2, r);
  /* 2026-08-24 使用者更正：「總堂數只要計算尚未用完方案，用完跟過期的方案就不要算進來了」
     ——正式庫的陳綉敏原本顯示「可用 1 / 109 堂」，那 109 是六張早就上完的舊方案疊出來的。
     T2 用完、T3 過期 → 分子分母都只剩 T1。 */
  ok('★★ 分母只算「還沒用完、也還沒過期」的票（T1 的 10，不是 10+8+6＝24）', r.total===10, r);
  ok('★★ 分子分母同一批票 —— remain 只加 T1 的 2 堂', r.remain===2, r);
}

console.log('\n③ 別的課別不算進來');
{
  const tks=[TK(), TK({id:'T9', category:'小班肌力', ticket_type_id:'TT-G'})];
  const r=lib.bkMemTicketInfo('M1', B, tks, {});
  ok('★ 團課票不會算進教練課的分母', r.total===10 && r.remain===10, r);
}

console.log('\n④ 沒票時要說得出原因，而且從「最容易補救」講起');
{
  ok('★ 完全沒有這個課別的票',
     lib.bkMemTicketInfo('M1', B, [], {}).why==='沒有這個課別的票券');
  ok('★ 票用完了',
     lib.bkMemTicketInfo('M1', B, [TK({sessions_remaining:0})], {}).why==='票券已用完或已退費');
  /* 這一條是「可以靠調課解決」的情況，所以要排在最前面講 —— 第四批的圓形卡調課接在這裡 */
  const over=lib.bkMemTicketInfo('M1', B, [TK({sessions_remaining:3})], {T1:10});
  ok('★★ 還有堂數但都被未來預約佔走 → 講「都已經排課了」（唯一能靠調課解決的）',
     over.why==='剩下的 3 堂都已經排課了', over);
  const fr=lib.bkMemTicketInfo('M1', {...B, ticket_type_id:'TT-FR', start_time:'19:00'},
    [TK({ticket_type_id:'TT-FR'})], {});
  ok('★ 限時段票排到晚上 → 講時段限制', fr.why==='票券限平日 18:00 前上完', fr);
  const inst=lib.bkMemTicketInfo('M1', B,
    [TK({installment:{n:3}, sessions_total:12, sessions_remaining:12, unlocked_sessions:0})], {});
  ok('★ 分期未繳 → 講「分期尚未繳費開通」', inst.why==='分期尚未繳費開通', inst);
  const exp=lib.bkMemTicketInfo('M1', B, [TK({expire_date:'2026-08-01'})], {});
  ok('★ 票在這一天已過期 → 講過期', exp.why==='票券在這一天已過期', exp);
}

console.log('\n⑤ 共享票要算得到（團課名單以前看不到，就是漏了這一條）');
{
  const shared=TK({id:'TS', member_id:'M9', shared_with:['M1']});
  const r=lib.bkMemTicketInfo('M1', B, [shared], {});
  ok('★★ 別人分享給我的票也算可用', r.left===10 && r.why==='', r);
}

console.log('\n⑥ 超約防線（sessions_remaining 不可信，0804 的教訓）');
{
  /* 票面還有 5 堂，但已經綁了 10 筆未取消的預約 → 不能再排 */
  const r=lib.bkMemTicketInfo('M1', B, [TK({sessions_remaining:5, sessions_total:10})], {T1:10});
  ok('★★ 已排滿總堂數就不算可用', r.left===0, r);
}

console.log('\n⑦ 接線：三個地方共用同一支判定');
{
  ok('★★ 單人課的［＋新增］用它', /const info=bkMemTicketInfo\(m\.id, b, allTk, cntMap\);/.test(src));
  ok('★★ 團課名單也改用它（原本自己寫一套，看不到共享票）',
     /const _info=bkMemTicketInfo\(m\.id, b, allTk, _cnt\);/.test(src)
     && /const tks=allTk\.filter\(tt=>tkFitsBooking\(tt, m\.id, b\.ticket_type_id, b\.date, b\.start_time, _cnt\)\)/.test(src)
     && !/allTk\.filter\(tt=>tt\.member_id===m\.id && ticketMatchesCategory\(tt,'小班肌力'\)/.test(src));
  ok('　　為什麼要收斂，寫在原地', /看不到共享票、擋不住分期未開通、也沒有超約防線/.test(src));
}

console.log('\n⑧ 排序與呈現');
{
  ok('★★ ［＋新增］名單：有票的最上面 → ★主教練 → 姓名',
     /\(c\.left>0\)-\(a\.left>0\) \|\| \(c\.mine-a\.mine\) \|\| String\(a\.name\)\.localeCompare\(String\(c\.name\),'zh-Hant'\)/.test(src));
  ok('★★ 團課名單：已選 → 有票 → ★主教練 → 姓名（0824 使用者指示）',
     /const ta=\(a\.sum>0\), tb=\(b\.sum>0\);\s*\n\s*if\(ta!==tb\) return ta\?-1:1;/.test(src)
     && /「有票」要排在「★」之前：沒票的人再熟也加不進去/.test(src));
  /* 2026-08-24 使用者回報：「手機端這邊沒有篩選出教練的會員」——
     原本只靠排序＋一個小星號，一長串名字裡看不出分界。歸屬也改用 bkCoachId（代課優先）。
     同日再指示：「安排會員的會員選單，要跟之前視窗二那個用一樣的就好」——
     整張名單從 .ash-eirow 白卡改成「搜尋框＋隱藏 <select>」，由 mpkScan 升級成
     統一挑選視窗（0801 定案）。分組改用 <optgroup>、★ 用 data-star、右邊的字用 data-sub。 */
  ok('★★ 教練歸屬用 bkCoachId（代課優先），不是原始 coach_id',
     /const _bcid=\(typeof bkCoachId==='function'\)\?bkCoachId\(b\):\(b\.coach_id\|\|null\);/.test(src)
     && /mine:!!_bcid && String\(m\.default_coach_id\|\|''\)===String\(_bcid\)/.test(src));
  ok('★★ 與視窗二同一套挑選器（.mem-pick-row＋隱藏 select＋mpkScan），不自己畫一份名單',
     /<div class="mem-pick-row">\s*\n\s*<input class="gt-search" id="bam-q"/.test(src)
     && /<select id="bam-sel" onchange="bamSelPick\(\)">\$\{bamOptsHTML\(kw\)\}<\/select>/.test(src)
     && /try\{ mpkScan\(\); \}catch\(_\)\{\}/.test(src));
  ok('★★ ★ 與右邊的堂數走 data-star／data-sub（寫進 option 文字會被 mpkLabel 回填到搜尋框）',
     /const opt=\(r,sub\)=>`<option value="\$\{r\.id\}"\$\{r\.mine\?' data-star="1"':''\} data-sub="\$\{escH\(sub\)\}">/.test(src));
  ok('★★ 每一組裡再切「○○的會員」／「其他會員」兩半（optgroup 不能巢狀，所以開兩個）',
     /<optgroup label="\$\{escH\(title\)\}・\$\{escH\(cn\|\|'這堂教練'\)\}的會員（\$\{mine\.length\}）">/.test(src)
     && /<optgroup label="\$\{escH\(title\)\}・其他會員（\$\{rest\.length\}）">/.test(src));
  ok('★★ 三組還在，而且每一組都寫出「按下去會怎樣」',
     /grp\('有可用票券', withTk, r=>`可用 \$\{r\.remain\} \/ \$\{r\.total\} 堂`\)/.test(src)
     && /grp\('票已排完，可以調課過來', sw, r=>`\$\{r\.why\} · 調課`\)/.test(src)
     && /grp\('沒有可用票券 —— 可先待簽約', no, r=>`\$\{r\.why\} · \$\{r\.inst\?'待簽約／待分期':'待簽約'\}`\)/.test(src));
  ok('★★ 選完之後依這一位的狀態分派（三種行為沒有變，只是不再是三張清單）',
     /if\(r\.left>0\) return bamPick\(mid\);\s*\n\s*if\(r\.swap\)   return bamSwap\(mid\);\s*\n\s*return bamHoldAsk\(mid\);/.test(src));
  ok('★ 視窗殼與建立預約同一個（showModal＋.modal-title＋.modal-foot），不再自己開 #adp-sheet',
     /function bamShell\(kw\)\{[\s\S]{0,400}?showModal\(`<div class="modal-title">新增會員/.test(src)
     && /<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal\(\)">取消<\/button><\/div>/.test(src));
  ok('★ 散客那一塊長得跟會員卡一致（使用者：「待簽約的按鈕也要跟會員卡片一致」）',
     /<summary class="ash-eirow">\s*\n\s*<span class="ash-eilb">不在名單上？直接建立待簽約<\/span>/.test(src));
}

console.log('\n⑨ 寫入端：加人＝綁會員＋綁票＋扣課，而且空堂要轉正');
{
  const f=g('async function bkAddMemberDo(','\n}');
  ok('★★ 扣課走共用的 deductTicket（唯一的扣課入口，不另寫一份）',
     /if\(!\(await deductTicket\(tk, b\.id, SESSION\.id\)\)\)\{ showToast\('扣課失敗（餘額護欄擋下），沒有加入'\); return; \}/.test(f));
  ok('★★ 有人有票之後要收掉 pending_contract（否則這堂永遠不進統計）',
     /b\.pending_contract=false;/.test(f) && /從空堂轉成正式課（統計才算得到）/.test(f));
  ok('★★ 寫入前再驗一次條件（名單畫出來到按下去之間，票可能被別人用掉）',
     /if\(!bkCanAddMember\(b\)\)\{ showToast\('這堂課已經有人或狀態已改變，請重新整理'\); return; \}/.test(f)
     && /const info=bkMemTicketInfo\(mid, b, allTk, cnt\);\s*\n\s*showToast\(info\.why/.test(f));
  ok('★ 兩張以上票先問要扣哪一張（與待簽約轉正同一個做法）',
     /if\(!tkId && cand\.length>1\)\{/.test(f));
  ok('★ 防連點（扣課的動作按兩下就扣兩堂）',
     /onceAct\('bkaddmem:'\+b\.id\+':'\+mid, \(\)=>bkAddMemberDo\(b\.id, mid\)\)/.test(src));
  ok('★★ 只給「還沒有人」的單人課（團課走名單視窗）',
     /function bkCanAddMember\(b\)\{[\s\S]{0,400}?if\(!b \|\| bkIsGroup\(b\)\) return false;[\s\S]{0,200}?if\(!bkIsOpenHold\(b\)\) return false;/.test(src));
  ok('　　過去的課與已取消／請假的不給',
     /if\(b\.status!=='booked'\) return false;/.test(src) && /if\(String\(b\.date\)<ymd\(TODAY\)\) return false;/.test(src));
  ok('★ 課卡上那顆鈕與團課的「新增」共用同一個位置與外觀',
     /btns \+= evoBtn\('evo-b2','evo-gold',`collapseBkCard\(\);bkAddMemberOpen\('\$\{id\}'\)`,'plus','新增'\);/.test(src));
}

console.log('\n⑩ 圓形卡調課（第四批）');
{
  const f=g('async function bkSwapDo(','\n}');
  ok('★★ 搬的是「人與票」，不是「課」—— A 清空變空堂、B 綁上會員與票',
     /A\.member_id=null; A\.ticket_id=null;[\s\S]{0,80}?A\.pending_contract=true;/.test(f)
     && /B\.member_id=mid; B\.ticket_id=tk\?tk\.id:null;/.test(f)
     && /B\.pending_contract=false;/.test(f));
  ok('★★ 為什麼不對調日期時間，寫在原地（A 有 A 的教練，對調會讓這堂變成 A 的教練上）',
     /A 有 A 的教練、B 有 B 的教練 —— 對調時間會讓/.test(src));
  ok('★★ 票券帳要誠實：A 退一堂、B 扣一堂（只改 ticket_id 會讓戳記歸錯堂）',
     /await refundTicket\(tk\.id, A\.id, SESSION\.id\)/.test(f)
     && /await deductTicket\(fresh\|\|tk, B\.id, SESSION\.id\)/.test(f)
     && /只把 ticket_id 改掉的話，帳本上那筆扣課仍指向 A/.test(src));
  ok('★★ refundTicket 收的是 ticket_id 不是票券物件（傳錯會靜靜地什麼都不退）',
     /refundTicket 的第一個參數是 \*\*ticket_id\*\*（不是票券物件）/.test(src)
     && /^async function refundTicket\(ticket_id,booking_id,operator\)\{/m.test(src));
  ok('★★ 套用既有的改期規則（含 24 小時與「教練只能動自己的課」）',
     (f.match(/bkMoveBlockReason\(A\)/g)||[]).length>=1
     && /const blk=\(typeof bkMoveBlockReason==='function'\)\?bkMoveBlockReason\(A\):'';/.test(f));
  ok('★★ 動之前先驗新時段（衝堂／場地／營業時間），過不了就整個不做',
     /const verr=await validateBooking\(vbk, B\.date, B\.start_time, Number\(B\.duration\)\|\|60\);/.test(f)
     && f.indexOf('validateBooking')<f.indexOf('refundTicket'));
  ok('★★ 扣課失敗時**不可以**寫回 B —— 否則變成「綁了票卻沒有扣課紀錄」的預約',
     /這裡\*\*不可以\*\*寫回 B/.test(f)
     && !/await dbPut\('bookings', B\); return;/.test(f)
     && /原本那一堂已經退成空堂，這一堂沒有變動，請重新指定/.test(f));
  const cf=g('async function bkSwapConfirm(','\n}');
  ok('★★ 動兩堂課與一張票，不該點一下就發生 → 先跳確認卡',
     /原本這一堂（會變成空堂）/.test(cf) && /調到這一堂/.test(cf));
  ok('★ 確認卡明講不會通知會員（使用者定案：不用通知）',
     /<b>不會通知會員<\/b>，請自行告知/.test(cf));
  ok('★ 防連點（這一步會退票再扣票）',
     /onceAct\('bkswap:'\+b\.id\+':'\+fromBid, \(\)=>bkSwapConfirm\(fromBid, b\.id, mid\)\)/.test(src));
  ok('★★ 圓點的可點模式預設關閉（既有呼叫點一個都不受影響）',
     /function ticketTokens\(t,bks,typeMap,usedCount,curId,memberId,selfSet,seatN,opts\)\{/.test(src)
     && /const _tapB=!!\(opts&&opts\.tapBooked&&b&&b\.id&&!cur&&!clv\);/.test(src));
  ok('　　只有「已預約未上、非本堂、非教練請假」的點能調',
     /只有「已預約未上」的點可以調（已上完、請假、未開通的都不行）/.test(src));
  ok('★ 調課視窗只列這個課別、而且真的有已預約堂數的票',
     /ticketMatchesCategory\(sl\.t, cat\) && \(sl\.pending>0\)/.test(src));
}

/* ── 2026-08-24 第二輪自查（使用者：「做完再重新檢查一遍有沒有問題」） ── */
console.log('\n第二輪自查');
{
  const f=g('async function bkSwapDo(','\n}');
  ok('★★ 退課失敗就整個不做 —— refundTicket 是「回傳 false」不是丟例外，'
   +'忽略回傳值＝A 的票沒退回來卻照樣從同一張票扣給 B（會員平白少一堂）',
   /let _rok=false;/.test(f)
   && /_rok=await refundTicket\(tk\.id, A\.id, SESSION\.id\)/.test(f)
   && /if\(!_rok\)\{ showToast\('退課沒有成功，這次沒有調課（兩堂都維持原樣）', 6000\);/.test(f)
   && /\*\*回傳 false\*\*、不丟例外/.test(src));
ok('★ 調走之後原時段留一行系統註記（不通知會員，但櫃檯查得到原因），'
   +'且不蓋掉「舊系統匯入」這類既有系統註記',
   /已將原本的課調到 \$\{String\(B\.date\)/.test(f)
   && /\(_an\.sys\?_an\.sys\+'／':''\)/.test(f));
ok('★★ 加會員的權限與課卡那顆鈕的 _editable 對齊：教練只能加在自己主帶／代課的那一堂',
   /const own = SESSION\.role!=='coach' \|\| !!SESSION\.is_manager \|\| bkIsCoach\(b, SESSION\.id\);/.test(src)
   && /return !!\(staff \|\| \(SESSION\.role==='coach' && own\)\);/.test(src)
   && !/isDeskLike\(\)\|\|SESSION\.role==='coach'/.test(src));
}

console.log('\n視窗二的會員名單：★ 與靠右的堂數');
ok('★★ ★ 與堂數放 data-*，不寫進 option 文字 —— 那段文字選完會被回填到搜尋框（mpkLabel）',
   /const star=\(cid && String\(m\.default_coach_id\|\|''\)===String\(cid\)\)\?' data-star="1"':'';/.test(src)
   && /const cnt=\(ti && ti\.remain>0\)\?` data-sub="可用 \$\{ti\.remain\} \/ \$\{ti\.total\} 堂"`:'';/.test(src)
   && /<option value="\$\{m\.id\}"\$\{star\}\$\{cnt\}>\$\{m\.name\}（\$\{fmtPhone\(m\.phone\)\}）<\/option>/.test(src));
ok('★★ 挑選視窗把 data-sub 畫成靠右那一格（使用者：「課堂數靠右顯示」）',
   /<span class="mpk-nm">\$\{star\}\$\{esc\(o\.textContent\)\}<\/span><span class="mpk-sub">\$\{esc\(sub\)\}<\/span>/.test(src)
   && /\.mpk-item\.mpk-item-2c\{display:flex;align-items:baseline;gap:10px;\}/.test(src)
   && /\.mpk-item-2c \.mpk-sub\{flex:none;[^}]*font-variant-numeric:tabular-nums;\}/.test(src));
ok('★★ 沒有附註的清單（教練、票種、場地…）輸出跟以前一樣，不能改到 .mpk-item 基底',
   /: star\+esc\(o\.textContent\)/.test(src)
   && /不要直接把 \.mpk-item 改成 flex/.test(src));
ok('★ 只對「有可用票券」那一組算堂數（481 位全算會很慢），沒算到的不顯示 0 誤導',
   /Object\.keys\(set\)\.forEach\(mid=>\{ try\{ _tkInfo\[mid\]=bkMemTicketInfo\(mid, _pb, tks, cnt\); \}catch\(_\)\{\} \}\);/.test(src));
ok('★★ 教練端的 _bkCoachSel 要補上自己，否則名單既沒分組也沒有 ★',
   /window\._bkCoachSel = prefillCoach \|\| \(isCoach\?SESSION\.id:''\);/.test(src));

/* ══ 「還沒到起始日」要寫原因（2026-09-05）══════════════════════════════
   tkFitsBooking 有一條 `start_date > 課程日期且未開通 → 不可用`，但它是靜默的：
   票券直接從清單消失、會員整列不見，櫃檯只看到人沒了。
   補課券改成「錨在缺席那堂」之後這條會真的被踩到 —— 9/12 請假發的券，
   拿去補 9/07 的課就會被擋。與 0823「不能用就寫原因，別藏按鈕」同一條語彙。 */
console.log('\n⑧ 還沒到起始日：要講原因，不是讓人整列消失');
{
  const b={date:'2026-09-07', start_time:'11:00', category:'小班肌力', ticket_type_id:'TT-G', duration:60};
  const mk=(o)=>Object.assign({id:'T1', member_id:'M1', ticket_type_id:'TT-G', category:'小班肌力',
    status:'usable', sessions_total:1, sessions_remaining:1, expire_date:'2026-09-26'}, o);

  let r=lib.bkMemTicketInfo('M1', b, [mk({source:'makeup', start_date:'2026-09-12'})], {});
  ok('★★★ 補課券起始日 9/12、要補 9/07 的課 → 講出「9/12 起才能用」',
     r.left===0 && /補課券 09\/12 起才能用/.test(r.why), r.why);
  ok('★★★ 而且要說明為什麼是那一天（不然櫃檯只會覺得系統壞了）',
     /效期自缺席那堂起算/.test(r.why), r.why);

  r=lib.bkMemTicketInfo('M1', b, [mk({source:'purchase', start_date:'2026-09-12'})], {});
  ok('★★ 一般票券（賣票時談好的未來開課日）講法不同，不要張冠李戴',
     /票券 09\/12 才開始生效/.test(r.why), r.why);

  /* 事後補發：起始日落在過去 → 這條擋門本來就不成立，不可以誤報原因 */
  r=lib.bkMemTicketInfo('M1', b, [mk({source:'makeup', start_date:'2026-08-30'})], {});
  ok('★★★ 事後補發（起始日在過去）→ 照常可用，不能冒出這個原因',
     r.left===1 && !r.why, {left:r.left, why:r.why});

  /* 已開通的票不套這條（2026-08-14 魏婉倫案例：首堂取消後改約更早的課） */
  r=lib.bkMemTicketInfo('M1', b, [mk({start_date:'2026-09-12', activated_at:'2026-09-01T00:00:00Z'})], {});
  ok('★★★ 已開通的票不套這條（首堂取消改約更早的課，錨點會自己往前挪）',
     r.left===1 && !r.why, {left:r.left, why:r.why});

  /* 混合：只有一部分被擋 → 還有能用的，就不該報這個原因 */
  r=lib.bkMemTicketInfo('M1', b, [mk({id:'T1', source:'makeup', start_date:'2026-09-12'}),
                                  mk({id:'T2', source:'purchase', start_date:'2026-08-01'})], {});
  ok('★★ 只有一部分被擋（另一張還能用）→ 不報原因，照常列出',
     r.left===1 && !r.why, {left:r.left, why:r.why});
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
