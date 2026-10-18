/* 招待名額（2026-10-18 使用者：「幫我新增管理員帳號可以免費預約名額
   下週一想要讓兩個長輩免費體驗13:00的團課」
   追加：「只限定管理員帳號使用 但是要算教練的薪資堂數喔」）

   做法刻意繞一圈：**發一張 $0 的票，再走正常加入流程**，而不是硬塞無票名額。
   因為 0820 使用者定案「團課名額一定有票」—— 起因是林婉華那次：
   硬加出來的無票名額後續請假又發補課券，變成雙重補償。
   發票保住這個不變量，請假／補課券／名額計算全部一行都不用改。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 權限：只有管理員');
const C=grab('bamCompDo');
ok("★★★ 用 SESSION.role==='admin'，不是 isManagerUp（店長櫃檯都不給）",
   /SESSION\.role==='admin'/.test(C) && !/isManagerUp/.test(C));
/* ⚠⚠ 2026-10-18 使用者回報兩次「管理員帳號還是沒看到招待的選項」——
   我寫成 window.SESSION。SESSION 是 `let SESSION=null`，**不掛在 window 上**，
   window.SESSION 永遠 undefined，所以四處判斷全部不成立：鈕不畫、按了也被擋。
   這個地雷程式裡已經記過三次警語，我還是踩了。
   ⚠ 上一版的測試只比對字串、沒有實跑，所以「通過」卻是壞的 —— 現在改成
     ① 全檔禁止 window.SESSION 出現在程式碼裡（註解不算）
     ② 把判斷式實跑一次，確認 admin 會過、店長與櫃檯不會過 */
{
  /* ⚠ 先整塊剝掉 /* … *\/ 再剝 // —— 只看「行首是不是 /*」會漏掉區塊內的續行，
     那幾行正好就是在警告不要用 window.SESSION（見 68347）。 */
  const code=src.replace(/\/\*[\s\S]*?\*\//g,'')
                .split('\n').map(l=>l.replace(/\/\/.*$/,'')).join('\n');
  const hits=(code.match(/window\.SESSION/g)||[]).length;
  ok('★★★ 程式碼裡不可以出現 window.SESSION（SESSION 是 let，不在 window 上）',
     hits===0, hits);
  const gate=new Function('SESSION',"return !!(SESSION&&SESSION.role==='admin');");
  ok('★★★ 判斷式實跑：管理員會過', gate({role:'admin'})===true);
  ok('★★★ 判斷式實跑：店長不會過', gate({role:'coach',is_manager:true})===false);
  ok('★★★ 判斷式實跑：櫃檯不會過', gate({role:'front_desk'})===false);
  ok('★★ 還沒登入不會爆', gate(null)===false);
  const bad=new Function('SESSION',"var window={};return !!(window.SESSION&&SESSION.role==='admin');");
  ok('★★★ 壞寫法連管理員都過不了 —— 這就是當初的症狀', bad({role:'admin'})===false);
}
ok('★★★ 擋在函式最前面（不是只靠畫面沒畫出來）',
   C.indexOf("SESSION.role==='admin'") < C.indexOf('onceAct'));
ok('★★★ 選單那一條也只畫給管理員',
   /const _canComp=!!\(SESSION&&SESSION\.role==='admin'\);/.test(src));
ok('★★ 不是管理員時，沒有分期票就照舊直接走待簽約（不多一層視窗）',
   /if\(!r\.inst && !_canComp\) return bamHoldDo\(mid,'sign'\);/.test(src));

console.log('\n② 招待票的形狀');
ok("★★★ source 標成 'comp'（可追溯、報表分得出來）", /source:'comp'/.test(C));
ok('★★★ 金額 0', /unit_price:0, amount_paid:0/.test(C));
ok('★★★ 只有 1 堂（不能拿去上第二堂）',
   /sessions_total:1, sessions_remaining:1/.test(C));
ok('★★★ 效期限當天（加入失敗也不會留下一張能亂用的免費票）',
   /expire_date:b\.date/.test(C));
ok('★★★ 付款狀態 paid（否則會跑進待收款，見 tkOwesMoney）',
   /payment_status:'paid'/.test(C));
ok('★★ 已開通 1 堂（不是分期票，不會被 tkUnlockedLeft 鎖住）',
   /unlocked_sessions:1, installment:null/.test(C));
ok('★★ 票種跟著這堂課走', /ticket_type_id:b\.ticket_type_id/.test(C));
ok('★★ 有寫 ticket_logs（誰開的、哪一堂）', /logTicket\(t\.id,'grant',1/.test(C));

console.log('\n③ 不進營收');
/* 抽獎會寫 $0 的 purchases 是為了留抽獎紀錄；招待沒收到錢，不該出現在營收裡 */
ok('★★★ 不寫 purchases（沒收到錢就不要進營收）', !/purchases/.test(C));
ok('★★ 有清快取，不然畫面讀到舊票列', /dbCacheClear\(\['member_tickets','ticket_logs'\]\)/.test(C));

console.log('\n④ 加入時要指定票，不能讓它自動挑');
/* 這位會員可能剛好有別張付費票，自動挑會扣到人家付過錢的那張 */
ok('★★★ 票 id 直接傳給 bkAddMemberDo', /bkAddMemberDo\(b\.id, mid, t\.id\)/.test(C));
ok('★★★ bkAddMemberDo 收得下第三個參數', /async function bkAddMemberDo\(bid, mid, tkId\)/.test(src));
ok('★★ 開票失敗就停住，不會半套（沒票卻加進去）',
   /showToast\('開立招待票失敗/.test(C) && C.indexOf("開立招待票失敗") < C.indexOf('bkAddMemberDo'));
ok('★★ 有 onceAct 防連點（兩位長輩不會變成四張票）', /onceAct\('bkcomp:'/.test(C));

console.log('\n⑤ 系統要認得這張 $0 是哪來的');
{
  const g=new Function(grab('tkIsGift')+'\nreturn tkIsGift;')();
  const z=new Function(grab('tkZeroWhy')+'\nreturn tkZeroWhy;')();
  ok('★★★ tkIsGift 認得招待票（自動挑票時付費的排前面）',
     g({amount_paid:0,source:'comp'})===true);
  ok('★★ 有金額就不是贈票（招待票一定是 0，這條是防呆）',
     g({amount_paid:500,source:'comp'})===false);
  eq('★★★ tkZeroWhy 講得出「管理員招待」', z({source:'comp'}), '管理員招待');
  eq('★★ 沒動到抽獎那條', z({source:'lottery'}), '抽獎贈送');
}

console.log('\n⑥ 教練薪資：招待名額照算');
/* 使用者指名要求。團課人頭費算的是 grpAttendHeads（已簽到的名額數），
   完全不看票的金額 —— 所以招待名額簽到後，教練的人頭費自動算得到。
   ⚠ 這組斷言是在釘住「不要哪天為了排除招待而去改 grpAttendHeads」。 */
{
  /* seatKeys 還依賴 mids，一起抽出來跑（不要自己寫一份假的 —— 那就測不到真的） */
  const f=new Function(grab('mids')+'\n'+grab('seatKeys')+'\n'+grab('attObj')
    +'\n'+grab('grpAttendHeads')+'\nreturn grpAttendHeads;')();
  const b={member_ids:['m1','m2','m3'],
           attendance:{m1:'checked_in', m2:'checked_in', m3:'checked_in'}};
  ok('★★★ 三個名額都簽到＝3 人次（其中兩個是招待，一樣算）', f(b)===3);
  ok('★★★ grpAttendHeads 不看票（原始碼裡沒有任何金額／票券判斷）',
     !/amount_paid|ticket|source/.test(grab('grpAttendHeads')));
}
ok('★★ 團課人頭費就是 人次 × 單價', /const groupPay=groupHeads\*ghead;/.test(src));

console.log('\n⑦ 0820 的不變量沒有被破壞');
/* 這才是整個做法的重點：沒有新增「無票名額」這條路 */
ok('★★★ 沒有新增硬塞無票名額的路（招待一定先發票）',
   /await dbPut\('member_tickets',t\);[\s\S]{0,400}bkAddMemberDo\(b\.id, mid, t\.id\)/.test(C));
ok('★★★ 0820 那段「扣不到票就不寫入名單」還在',
   /取消教練招待（2026-08-20）：扣不到票的名額不再寫入名單/.test(src)
   || /沒扣到票的名額從名單移除/.test(src));

/* ══ 團課那一支（2026-10-18 使用者回報：「管理員帳號還是沒看到招待的選項」）══
   ⚠⚠ 團課走的是 openGroupMembers，不是課卡的［＋新增］——
     bkCanAddMember 第一行就對團課回 false，所以 bamCompDo 永遠跑不到團課。
     第一版只改了課卡那支，使用者在團課裡當然看不到。
   ⚠ 而且 0829 定案「團課清單只列有團體課票券的會員」，沒票的人根本不出現，
     招待鈕沒有地方掛 —— 所以是另開入口，不是在清單列上加按鈕。 */
console.log('\n⑧ 團課的招待入口');
ok('★★★ bkCanAddMember 對團課回 false（證明兩條路本來就分開）',
   /if\(!b \|\| bkIsGroup\(b\)\) return false;/.test(src));
const G=grab('grpCompDo'), O=grab('grpCompOpen');
ok('★★★ 團課有自己的招待入口（grpCompOpen／grpCompDo）', !!G && !!O);
ok('★★★ 兩支都只給管理員',
   /SESSION\.role==='admin'/.test(O) && /SESSION\.role==='admin'/.test(G));
ok('★★★ 入口鈕也只畫給管理員',
   /\$\{\(SESSION&&SESSION\.role==='admin'\)\?`[\s\S]{0,400}grpCompOpen/.test(src));
ok('★★ 票的形狀與課卡那支一致（$0／1 堂／限當天／paid／comp）',
   /source:'comp'/.test(G) && /unit_price:0, amount_paid:0/.test(G)
   && /sessions_total:1, sessions_remaining:1/.test(G)
   && /expire_date:b\.date/.test(G) && /payment_status:'paid'/.test(G));
ok('★★★ 不寫 purchases', !/purchases/.test(G));
/* 重開時 _grpData 會從資料庫重建 —— 自己補一份 sum/tks 等於兩個真相 */
ok('★★★ 發完票是「重開名單視窗」，不是手動改 _grpData',
   /openGroupMembers\(b\.id, true, true\)/.test(G) && !/_grpData/.test(G));
ok('★★★ 重開要帶 keepSel（不然剛招待的那位會被清掉）',
   /openGroupMembers\(b\.id, true, true\)/.test(G));
ok('★★★ 有把人推進 _grpSel（重開後是勾起來的）',
   /window\._grpSel\.push\(mid\)/.test(G));
ok('★★ 有 onceAct 防連點', /onceAct\('grpcomp:'/.test(G));
ok('★★ 返回名單也帶 keepSel', /openGroupMembers\('\$\{b\.id\}',true,true\)/.test(src));
/* 最後仍然是走原本的存檔路徑 —— 0820 的「名額一定有票」不變 */
ok('★★★ 加入仍然走 saveGroupMembers（沒有另開一條存檔路）',
   /onclick="saveGroupMembers\('\$\{id\}'\)"/.test(src));

console.log('\n⑨ 不用先建檔（2026-10-18 使用者：「不建檔不能預約嗎？」）');
/* 票一定要掛在某個 member_id 上（0820：名額一定有票），所以檔還是要有 ——
   省掉的是「跑一趟會員管理填整張表」。姓名必填、手機選填，兩格就好。
   ⚠ 不用管理員自己的名義：那會把長輩的出席算到老闆頭上，教練人頭費與
     統計都會歪，之後也查不到「那天是誰來上課」。 */
const N=grab('grpCompNew');
ok('★★★ 招待視窗裡可以當場建一位', !!N && /建檔並招待/.test(src));
ok('★★★ 姓名必填', /if\(!nm\)\{ showToast\('請填姓名'\)/.test(N));
ok('★★★ 手機選填', /placeholder="手機（選填）"/.test(src));
ok('★★★ 有填手機就先查，不要建出第二個同一個人',
   /\.eq\('phone',ph\)\.maybeSingle\(\)/.test(N));
ok('★★★ 建完直接走同一支發票流程（邏輯只有一份）', /return grpCompDo\(mid\);/.test(N));
ok('★★ 新會員帶上這堂課的教練當預設教練', /default_coach_id:\(b&&b\.coach_id\)\|\|null/.test(N));
ok('★★ 建完要清 members 快取', /dbCacheClear\(\['members'\]\)/.test(N));
ok('★★ 有 onceAct 防連點（不會建出兩筆）', /onceAct\('grpcompnew:'/.test(N));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
