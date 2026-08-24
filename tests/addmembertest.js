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
  ok('★ 可用 10、總 10、沒有原因字串', r.left===10 && r.total===10 && r.why==='');
}

console.log('\n② 分母是「該課別的總堂數」，含已用完與過期的票（使用者定案）');
{
  const tks=[TK({id:'T1', sessions_remaining:2, sessions_total:10}),
             TK({id:'T2', sessions_remaining:0, sessions_total:8}),          // 用完
             TK({id:'T3', sessions_total:6, sessions_remaining:6, expire_date:'2026-08-01'})]; // 已過期
  const r=lib.bkMemTicketInfo('M1', B, tks, {});
  ok('★★ 分子只算現在能用的（2 堂）', r.left===2, r);
  ok('★★ 分母是這個課別的總堂數（10+8+6＝24）', r.total===24, r);
}

console.log('\n③ 別的課別不算進來');
{
  const tks=[TK(), TK({id:'T9', category:'小班肌力', ticket_type_id:'TT-G'})];
  const r=lib.bkMemTicketInfo('M1', B, tks, {});
  ok('★ 團課票不會算進教練課的分母', r.total===10, r);
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
  ok('★ 主教練是本堂教練的加 ★',
     /mine:String\(m\.default_coach_id\|\|''\)===String\(b\.coach_id\|\|''\) && !!b\.coach_id/.test(src)
     && /<i class="bam-star">★<\/i>/.test(src));
  ok('★ 右邊顯示「可用 N / 總 M 堂」，沒票就寫原因',
     /可用 <b>\$\{r\.left\}<\/b> \/ \$\{r\.total\} 堂/.test(src)
     && /const tag=m\.sum>0\?`可用 \$\{m\.sum\} \/ \$\{m\.total\|\|m\.sum\} 堂`:\(m\.why\|\|'無票（無法加入，請先儲值）'\)/.test(src));
  ok('★ 不能加入的淡化列出、不藏起來（0823 定的語彙）',
     /class="ash-eirow\$\{r\.left>0\?'':' ash-ei-off'\}"/.test(src));
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

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
