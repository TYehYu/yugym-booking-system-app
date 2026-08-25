/* 2026-08-03 使用者指示：「上個月尚未抽獎的客戶名單不見了，
   可以幫我保持抽獎提醒直到客戶來抽嗎？」

   原本 earned 與 used 都只看「當月」，所以 8/1 一到，七月滿了 4 堂卻還沒來抽的人
   就整批從名單上消失 —— 機會是客人掙到的，不該因為換月就沒了。

   改成：earned＝從系統上線那個月（LOTTO_FROM）起，逐月 floor(當月教練課簽到 ÷ 4) 累加；
        used ＝已登記的抽獎次數（不分月份）。left 就是「還欠客人幾次」。
   「滿 4 堂」仍然逐月結算（月底沒滿 4 堂的零頭不帶到下個月）—— 變的只有
   「抽獎機會不會過期」，不是門檻的算法。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const API=new Function('lottoVipSet','_lotPuDate',
  "const LOTTO_FROM='2026-07';\n"
  +['lottoEarnedByMember','lottoUsedByMember','lottoStats','lottoMapAll','lottoPendingFrom'].map(grabFn).join('\n')
  +'\nreturn {lottoEarnedByMember,lottoUsedByMember,lottoStats,lottoMapAll,lottoPendingFrom};')(
  ()=>new Set(), p=>p.date||'');

const bk=(mid,date,n,cat,st)=>Array.from({length:n},(_,i)=>
  ({member_id:mid, date:date, category:cat||'私人教練', status:st||'checked_in'}));
const lot=(mid,date)=>({source:'lottery', member_id:mid, date});

console.log('① 上個月沒抽的要留著');
{
  /* 使用者的情境：七月滿 4 堂、沒來抽；八月只上了 1 堂 */
  const B=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-01',1)];
  const now=API.lottoStats(B, [], '2026-08', []);
  eq('★ 八月看名單，七月那一次還在', now.map(x=>[x.id,x.left]), [['M1',1]]);
  eq('　　舊寫法會消失（當月只有 1 堂）—— 這裡確認不會', now.length, 1);

  const drawn=API.lottoStats(B, [lot('M1','2026-08-03')], '2026-08', []);
  eq('★ 客人來抽了就從名單移除', drawn.length, 0);
  eq('★ 八月抽掉的是七月掙的那一次（不分月份對沖）',
     API.lottoUsedByMember([lot('M1','2026-08-03')], '2026-08'), {M1:1});
}

console.log('\n② 門檻還是逐月結算（零頭不帶到下個月）');
{
  const B=[...bk('M1','2026-07-10',3), ...bk('M1','2026-08-05',3)];
  eq('★ 七月 3 堂＋八月 3 堂 → 0 次（不是合起來 6 堂算 1 次）',
     API.lottoStats(B, [], '2026-08', []).length, 0);
  const B2=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-05',4)];
  eq('★ 兩個月各滿 4 堂 → 累積 2 次', API.lottoStats(B2, [], '2026-08', [])[0].left, 2);
  eq('　　同一個月 8 堂 → 2 次', API.lottoStats(bk('M1','2026-07-10',8), [], '2026-07', [])[0].left, 2);
}

console.log('\n③ 起算月份要卡住（舊系統匯入的簽到不能回頭生機會）');
{
  const B=[...bk('M1','2026-05-10',8), ...bk('M1','2026-06-10',8)];
  eq('★ 2026-07 以前的簽到不算', API.lottoStats(B, [], '2026-08', []).length, 0);
  ok('　　起算月寫成常數', /const LOTTO_FROM='2026-07';/.test(src));
  ok('　　原因寫在程式裡', /舊系統匯入的簽到紀錄不該回頭生出抽獎機會。/.test(src));
}

console.log('\n④ 只算教練課、只算已簽到');
{
  eq('★ 團課不計', API.lottoStats(bk('M1','2026-07-10',8,'小班肌力'), [], '2026-07', []).length, 0);
  eq('★ 自主訓練不計', API.lottoStats(bk('M1','2026-07-10',8,'自主訓練'), [], '2026-07', []).length, 0);
  eq('★ 只預約沒簽到不計', API.lottoStats(bk('M1','2026-07-10',8,'私人教練','booked'), [], '2026-07', []).length, 0);
  eq('　　已完成也算（簽到即視為上課完成）',
     API.lottoStats(bk('M1','2026-07-10',4,'私人教練','completed'), [], '2026-07', [])[0].left, 1);
  eq('　　取消的不算', API.lottoStats(bk('M1','2026-07-10',8,'私人教練','cancelled'), [], '2026-07', []).length, 0);
}

console.log('\n⑤ 回頭看歷史月份要看得到當時的狀態');
{
  const B=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-05',4)];
  eq('★ 站在七月看：只有七月那一次', API.lottoStats(B, [], '2026-07', [])[0].left, 1);
  eq('★ 站在八月看：兩次', API.lottoStats(B, [], '2026-08', [])[0].left, 2);
  eq('　　八月才登記的抽獎，站在七月看不算',
     API.lottoStats(B, [lot('M1','2026-08-03')], '2026-07', [])[0].left, 1);
}

console.log('\n⑥ 名單上要標出是哪個月的舊帳');
{
  const B=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-05',4)];
  const x=API.lottoStats(B, [], '2026-08', [])[0];
  eq('★ 兩次都沒抽 → 標出七月那筆', API.lottoPendingFrom(x,'2026-08'), '7 月 未抽');
  const y=API.lottoStats(B, [lot('M1','2026-08-06')], '2026-08', [])[0];
  eq('★ 抽掉一次 → 先抵最早的，剩下的是八月的（不標）', API.lottoPendingFrom(y,'2026-08'), '');
  const z=API.lottoStats([...bk('M1','2026-07-10',8)], [], '2026-08', [])[0];
  eq('　　同一個月欠兩次 → 寫次數', API.lottoPendingFrom(z,'2026-08'), '7 月 2 次 未抽');
  eq('　　沒有資料不會爆', API.lottoPendingFrom(null,'2026-08'), '');
  ok('　　名單上用得到（沒有舊帳時退回顯示簽到堂數）',
     /\$\{lottoPendingFrom\(x, ym\)\|\|`簽到 \$\{x\.att\} 堂`\}/.test(src));
}

console.log('\n⑦ 課卡的禮物圖示與說明文字');
{
  const B=[...bk('M1','2026-07-10',4)];
  const map=API.lottoMapAll(B, [], '2026-08', []);
  eq('★ 首頁課卡的禮物也跟著累積（八月仍看得到七月未抽的）', map.M1, {earned:1,used:0,left:1,months:[{ym:'2026-07',n:1}]});
  const map2=API.lottoMapAll(B, [lot('M1','2026-08-01')], '2026-08', []);
  eq('　　抽完了仍回傳（卡片要畫「打開的禮物盒」）', map2.M1.left, 0);
  ok('★ 提示文字改成累計，並講明不會過期',
     /累計可抽 \$\{earned\} 次（已抽 \$\{used\}、待抽 \$\{left\}）　·　沒來抽的不會過期/.test(src));
  ok('★ 彈窗的說明也改了（原本寫「次月歸零」）',
     /<b>沒來抽的次數會一直留著<\/b>，直到客人來抽為止。/.test(src)
     && !/可累計、次月歸零/.test(src));
  ok('　　空狀態不再寫「本月」', /<div class="em-t">目前沒有待抽獎的會員<\/div>/.test(src));
}

console.log('\n名單版面（2026-08-21 使用者：「會員名單也改成一列 白色底」）');
ok('★ 卡片牆改成一列一位（直向排列，不再是自動填滿的格子）',
   /\.lot-btns\{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;/.test(src)
   && !/\.lot-btns\{[^}]*grid-template-columns/.test(src));
ok('★ 白底（原本是米底 var(--card2)）',
   /\.lot-btn\{display:flex;flex-direction:row;[\s\S]{0,160}?background:#fff;/.test(src));
ok('　　整列橫向：姓名靠左撐開，可抽次數與簽到堂數靠右',
   /\.lot-btn-nm\{font-size:14\.5px;font-weight:800;color:var\(--text\);flex:1;min-width:0;/.test(src)
   && /\.lot-btn-n\{[^}]*flex:none;\}/.test(src)
   && /\.lot-btn-sub\{[^}]*flex:none;\}/.test(src));
ok('　　長姓名截斷不換行（一列的高度要固定）',
   /overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}\n\.lot-btn-n\{/.test(src));
ok('　　選中仍是綠框綠底（沒有被白底蓋掉）',
   /\.lot-btn\.sel\{border-color:var\(--green\);background:#eaf3ee;/.test(src));
ok('　　改的原因寫在原地', /一位會員時會孤零零一張卡佔掉一大格/.test(src));

/* 2026-08-24 使用者回報：「剛剛櫃檯選錯抽獎項目，原本是運動按摩折價券，選到了運動按摩」
   →「這邊有辦法設計一個修改的功能嗎」。登記完原本沒有回頭路：櫃檯只能自己去票券頁
   把發錯的那張作廢，購買紀錄還是寫著錯的獎品、「這個月抽過了」也記在那一筆上。 */
console.log('\n改抽獎項目');
{
  /* ⚠ 結尾要停在 _lottoFixDo 自己的結尾 —— 抓到 lottoAwardDo 就會把它那一筆
     dbPut('purchases',{id:uid('LOT')…}) 也含進來，「不新增一筆」那條會假失敗。 */
  const _fi=src.indexOf('async function _lottoFixDo(lotId,key){');
  const f=src.slice(_fi, src.indexOf('/* 名單就地篩選', _fi));
  ok('★★ 只列今天的登記可以改（改的是剛剛按錯，不是翻舊帳）',
     /p\.source==='lottery' && _lotPuDate\(p\)===ymd\(TODAY\)/.test(src)
     && /只列今天的：改的是「剛剛按錯」，不是翻舊帳/.test(src));
  ok('★★ 已經被拿去預約的獎品票券不給改（會擋下來並說怎麼辦）',
     /if\(bks\.some\(b=>b && b\.ticket_id===old\.id && b\.status!=='cancelled'\)\)\{/.test(f)
     && /這張獎品票券已經被拿去預約了，不能直接改/.test(f));
/* 2026-08-24 使用者：「像這種發錯的調整，照理來講換完應該就要刪掉發錯的內容吧」——
   $0 的贈品、從來沒用過、也沒有收款，留一張「已退費」的票在票券夾只會讓人問「這是什麼」。 */
  ok('★★ 發錯的那張直接刪掉，連它的帳本一起（孤兒紀錄不要留）',
     /for\(const l of _lgs\)\{ await dbDel\('ticket_logs', l\.id\); \}/.test(f)
     && /await dbDel\('member_tickets', old\.id\);/.test(f));
  ok('★★ 刪不掉才退回作廢 —— 寧可留一張看得懂的廢票，也不要一半刪一半留',
     /if\(!_del && old\.status==='usable'\)\{/.test(f)
     && /logTicket\(old\.id,'adjust',-1,null,SESSION\.id,`抽獎項目更正：改為「\$\{np\.label\}」`\)/.test(f));
  ok('★ 更正的軌跡記在登記那一筆的 note 上（票刪了，事情還查得到）',
     /更正抽獎項目：\$\{cur\} → \$\{np\.label\}/.test(f)
     && /那才是「這件事發生過」該待的地方/.test(src));
  ok('★★ 更正的是**同一筆**登記，不新增一筆 —— 否則「這個月抽過幾次」會多算',
     /pu\.plan_name='抽獎：'\+np\.label;/.test(f)
     && /不新增一筆，否則「這個月抽過幾次」會多算/.test(f)
     && !/dbPut\('purchases',\{id:uid\('LOT'\)/.test(f));
  ok('★ 更正的軌跡寫進 note（誰、什麼時候、從什麼改成什麼）',
     /更正抽獎項目：\$\{cur\} → \$\{np\.label\}/.test(f));
  ok('★ 選到同一項時什麼都不做', /if\(cur===np\.label\)\{ showToast\('本來就是這一項，沒有變動'\)/.test(f));
  ok('★ 防連點', /async function lottoFixDo\(lotId,key\)\{ return onceAct\('lotfix:'\+lotId/.test(src));
  ok('　　找當初那張票用「時間貼近」而不是「最新一張」（同一天可能抽過兩次）',
     /\.filter\(x=>x\.d<5\*60000\)\.sort\(\(a,b\)=>a\.d-b\.d\)/.test(f));
}

/* 2026-08-24 使用者回報：「抽獎的視窗沒有路徑了」——
   原本唯一的入口是桌機首頁那顆滑出鈕，而它只在「有人可抽」時出現。
   選錯獎品的那位剛抽完就不在名單裡，想改也進不去；手機更是完全沒路。 */
console.log('\n入口：任何裝置、任何時候都要進得去');
ok('★★ 帳號選單多一項「現場抽獎登記」（手機的抽屜也是同一份）',
   /id="acct-lotto" onclick="closeAcctMenu\(\);openLottoModal\(\)"/.test(src)
   && /現場抽獎登記<\/button>/.test(src));
/* 2026-08-25 使用者：「管理員的帳號資訊裡面怎麼會有抽獎登記　不需要吧」「手機端」——
   登記是站在櫃檯的人的動作；管理員在桌機首頁有滑出鈕、改獎品在今日營收那一列。 */
ok('★★ 選單項只給櫃檯設備帳號與店長，管理員不畫',
   /_lot\.style\.display = \(role==='front_desk' \|\| !!\(SESSION&&SESSION\.is_manager\)\)\?'':'none';/.test(src));
ok('★★ openLottoModal 自己那道權限不動（不能只靠畫面沒畫按鈕）',
   /if\(typeof isDeskLike==='function' && !isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可登記抽獎'\); return; \}/.test(src));
ok('　　管理員仍有路：桌機首頁的滑出鈕（有人可抽時）＋今日營收那一列改獎品',
   /const lottoFab=\(!isMobileLayout\(\)&&_lotEls\.length\)/.test(src)
   && /onclick="lottoFixAsk\('\$\{r\.lot\}','rev'\)"/.test(src));
/* 2026-08-24 二修（使用者：「這邊不用再提示了」）——改獎品的入口已經在今日營收那一列，
   這顆就只剩提醒功能，沒人可抽時不需要一直掛在畫面上。 */
ok('★★ 首頁那顆鈕回到「有人可抽才出現」',
   /const lottoFab=\(!isMobileLayout\(\)&&_lotEls\.length\)/.test(src)
   /* ⚠ 「今天已登記（按錯了可以改）」那一區還在（抽獎視窗裡的），這裡只檢查 FAB 那顆。 */
   && !/今天已登記 <b>/.test(src));
ok('★★ 改成清單＋先確認（不再是六格方塊、也不再點一下就改）',
   /class="ash-eirow ash-ei-2c lot-row/.test(src)
   && /onclick="lottoFixConfirm\('\$\{lotId\}','\$\{x\.key\}'\)"/.test(src)
   && /async function lottoFixConfirm\(lotId,key\)\{/.test(src)
   && /<button class="btn btn-green" onclick="lottoFixDo\('\$\{lotId\}','\$\{key\}'\)">確定更改<\/button>/.test(src));
/* 2026-08-24 使用者：「列表都改成白色框，選取的這一個用品牌綠底」「就不用多一列」 */
ok('★★ 清單是白底框，目前登記的那一項用品牌綠底、按不動',
   /\$\{isCur\?' lot-row-cur':''\}"\$\{isCur\?' disabled':''\}/.test(src)
   && /\.lot-row\{margin-bottom:8px;background:#fff;border:1px solid var\(--bd\);/.test(src)
   && /\.lot-row\.lot-row-cur\{background:var\(--green\);border-color:var\(--green\);/.test(src)
   && /\.lot-row\.lot-row-cur \.ash-eilb\{color:#fff;\}/.test(src));
ok('★ 綠底標出來之後，挑選那一頁就不必再多一列「原本登記」',
   (()=>{ const i=src.indexOf('async function lottoFixAsk(lotId, from){');
     const ask=src.slice(i, src.indexOf('async function lottoFixConfirm(', i));
     return !/原本登記<\/span>/.test(ask); })()
   && /上面那一列「原本登記」就多餘了/.test(src));
/* ⚠ 確認視窗那一張仍然要寫「原本登記 → 改成」——那是要人核對的地方，不能省。 */
ok('　　確認視窗仍然寫「原本登記 → 改成」（那是要核對的）',
   (()=>{ const i=src.indexOf('async function lottoFixConfirm(lotId,key){');
     const cf=src.slice(i, src.indexOf('async function lottoFixDo(', i));
     return /原本登記<\/span>/.test(cf) && /<span>改成<\/span>/.test(cf); })());
ok('★★ 沒有待抽名單時也要畫出「今天已登記」那一區（早退掉的話最需要改的那筆看不到）',
   /if\(!list\.length\)\{[\s\S]{0,420}?\$\{_fixBlock\}/.test(src)
   && /這一段要算在「沒有待抽獎會員」的早退\*\*之前\*\*/.test(src));

/* 2026-08-24 使用者定案（兩句）：
   「在今日營收這邊顯示，左邊續約的標籤改成抽獎，從這邊去調整抽獎內容，
     所以只有看得到這個頁面的人可以修改」
   「這些抽獎的品項只能在當天修正，過了就不能修改，除非找管理員」 */
console.log('\n今日營收那一列的「抽獎」標籤＋當天限定');
{
  const f=src.slice(src.indexOf('function revAttribChip(r){'), src.indexOf('async function openRevAttribPick('));
/* 2026-08-24 版型改版：抽獎從第二欄的小標籤，改成最左邊那一欄的直式卡
   （與新約／續約／分期同一欄 —— 它們本來就是同一類資訊：這一筆是什麼性質）。 */
  ok('★★ 抽獎與約別收進同一支 revKindCell，畫在最左邊那一欄',
     /function revKindCell\(r\)\{/.test(src)
     && /class="rev-kind rev-kind-lottery/.test(src)
     && /lottoFixAsk\('\$\{r\.lot\}','rev'\)/.test(src));
  ok('★★ revAttribChip 只剩教練歸屬（抽獎那一段已經搬走）',
     !/rev-att-lot/.test(src));
  ok('★★ 當天＝櫃檯自己能改；過了當天＝只有管理員',
     /function lottoFixAllow\(pu\)\{/.test(src)
     && /if\(_lotPuDate\(pu\)===ymd\(TODAY\)\) return \{ok:true, why:''\};/.test(src)
     && /return isAdmin \? \{ok:true, why:''\}/.test(src));
  ok('★★ 判斷只寫一支，畫面與寫入端都吃它（兩邊各判各的遲早會漂）',
     /判斷只寫這一支，畫面與寫入端都吃它/.test(src)
     && /const _al=lottoFixAllow\(p\);/.test(src)
     && /const _al=lottoFixAllow\(pu\);/.test(src));
  ok('★★ 寫入前要再擋一次（入口有兩個，視窗開著跨過午夜也會變成隔天）',
     /視窗開著跨過午夜就會從「當天」變成「隔天」/.test(src));
  ok('★ 不能改的時候要說原因，不是只讓卡按不動（0823 的語彙）',
     /button\.rev-kind\.rev-kind-off\{opacity:\.5;\}/.test(src)
     && /<div class="modal-title">這一筆不能改<\/div>/.test(src)
     && /過了當天就不能自己改了/.test(src));
  ok('　　從今日營收進來的，改完關窗並重畫那一頁（標籤與品名要跟著更新）',
     /if\(window\._lotFixFrom==='rev'\)\{ window\._lotFixFrom=''; closeModal\(\); navTo\(CUR_PAGE\); return; \}/.test(src));
}

/* 2026-08-24 使用者回報：「今日營收這邊沒看到按鈕」——真因是 _dayPur 的白名單
   只收 reactivate／facility_rental／merchandise／installment，lottery 根本沒進清單，
   標籤沒有列可以掛。 */
ok('★★ 抽獎登記要列進今日營收的名單',
   /const _dayLot=\(purchases\|\|\[\]\)\.filter\(p=>p&&p\.source==='lottery'&&puLocalDate\(p\)===date\);/.test(src)
   && /\.\.\._dayLot\.map\(p=>\(\{/.test(src));
ok('★★ 只加進顯示用的 _revRows，不加進 _dayPur（那一份在算總額、發票、現金匯款拆帳）',
   /只加進\*\*顯示用\*\*的 _revRows，不加進 _dayPur/.test(src)
   && /const _dayPur=\(purchases\|\|\[\]\)\.filter\(p=>puLocalDate\(p\)===date&&\(p\.source==='reactivate'/.test(src)
   && !/p\.source==='lottery'\|\|p\.source==='reactivate'/.test(src));
ok('★★ 抽獎那一列不畫金額、付款方式與 30 分鐘退回（它不是收款）',
   /it:\(p\.plan_name\|\|'抽獎'\), amt:0, lot:p\.id, lotDate:puLocalDate\(p\) \}\)\)/.test(src)
   && /\(revAmtDup\(r\)\|\|r\.lot\)\?''/.test(src));

/* 2026-08-24 使用者：「跑出所有抽獎名單了，我只要今天的」（實際上那五筆都是當天的，
   問題是排在最前面把收款擠掉）＋「點下去只要跳窗讓我重新選擇就好」「不用進入會員資料」 */
ok('★★ 抽獎排在收款之後（這一頁叫「今日營收」，錢要先看到）',
   /inv:\(p\.invoice_type==='cloud'\|\|p\.invoice_type==='paper'\)\};\}\),\s*\n\s*\/\* 抽獎排在最後/.test(src));
ok('★★ 整列點下去就開重選視窗，不是跑去會員票券頁',
   (src.match(/r\.lot\?`onclick="lottoFixAsk\('\$\{r\.lot\}','rev'\)" title="改抽獎項目"`/g)||[]).length===2);
ok('★★ 第二欄兩列：姓名｜教練標籤 ／ 品項｜金額（現金匯款同時出現時自己疊兩列）',
   (src.match(/<div class="rv-r1">/g)||[]).length===2
   && (src.match(/<div class="rv-r2">/g)||[]).length===2
   && /\.mc-rev-r\{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px;\}/.test(src));
ok('　　首頁名單卡與營收彈窗兩處都要改（同一份資料兩個地方畫）',
   (src.match(/class="mc-rev-row\$\{\(r\.mid\|\|r\.lot\)\?' mc-rev-go':''\}"/g)||[]).length===2);

/* 2026-08-24 使用者指示：獎項順序照實際籤筒排。 */
ok('★★ 獎項順序：筋膜球 → 運動按摩折抵300 → 教練課折抵300 → 運動按摩 → 教練課 → 蛋白粉',
   (()=>{ const i=src.indexOf('const LOTTO_PRIZES=['), j=src.indexOf('];', i);
     const keys=[...src.slice(i,j).matchAll(/key:'(\w+)'/g)].map(m=>m[1]);
     return JSON.stringify(keys)===JSON.stringify(['ball','ms300','pt300','ms','pt','protein']); })());
ok('★★ label 一個字都沒改（它同時是寫進 purchases.plan_name 的字，改了對不上既有登記）',
   /label:'運動按摩折抵300'/.test(src) && /label:'教練課折抵300'/.test(src)
   && /label 一個字都沒有改/.test(src));
ok('★ 蛋白粉標「參加獎」（只是畫面上的副標，不進資料）',
   /icon:'bottle', note:'參加獎'/.test(src)
   && /\[x\.note\|\|'', x\.kind==='goods'\?'實體贈品・現場交付':'發進會員票券'\]/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
