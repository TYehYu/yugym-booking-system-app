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
ok('★★★ 擋在函式最前面（不是只靠畫面沒畫出來）',
   C.indexOf("SESSION.role==='admin'") < C.indexOf('onceAct'));
ok('★★★ 選單那一條也只畫給管理員',
   /const _canComp=!!\(window\.SESSION&&SESSION\.role==='admin'\);/.test(src));
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

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
