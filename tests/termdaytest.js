/* 2026-08-08 使用者更正：「課程優惠方案的期限，如果限制是 28 天，開始用的第一天
   也要算進去才對，所以今天林紫錡購買的 #7 團課 4 週優惠應該是 8/15~9/11 才對吧」

   對的。expire_date 是「最後一個可用日」（各處判定都是 expire_date < 預約日 才算過期），
   所以 N 天的到期日 ＝ 起算日 + (N-1)。她那張 8/15 開通、28 天 → 9/11。系統記成 9/12。

   這不是政策調整，是前端的 off-by-one：「含首日」本來就是全系統的約定 ——
     ・場租票（32345）本來就寫 addDays(start,6) 並註明「效期 7 天（含啟用日）」
     ・資料庫的 handle_checkin_reward 一直是 b.date + valid_days - 1
   只有前端這幾處多加了一天，同一張簽到贈點前端與 DB 還會算出差一天的效期。

   修法：抽一支 termExpire(base, days)，所有「N 天期限」都問它。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const env=new Function(
  grabFn('ymd')+'\n'+grabFn('parseYmd')+'\n'+grabFn('addDays')+'\n'+grabFn('termExpire')
  +'\nreturn {termExpire,ymd,parseYmd,addDays};')();
const T=env.termExpire;

console.log('① 使用者提的那一張');
eq('★★ 團課 4 週優惠：8/15 開通、28 天 → 9/11（不是 9/12）', T('2026-08-15',28), '2026-09-11');
eq('　　第 1 天就是開通那天', T('2026-08-15',1), '2026-08-15');

console.log('\n② 其他常見期限');
eq('★ 補課券 14 天：8/08 開課 → 8/21', T('2026-08-08',14), '2026-08-21');
eq('★ 自主訓練贈點 7 天：8/08 上課 → 8/14', T('2026-08-08',7), '2026-08-14');
eq('★ 一般教練課 365 天：7/29 開通 → 隔年 7/28', T('2026-07-29',365), '2027-07-28');
eq('★ VIP 730 天：8/12 開通 → 2028/08/10', T('2026-08-12',730), '2028-08-10');
eq('　　跨月：8/25 起 14 天 → 9/07', T('2026-08-25',14), '2026-09-07');
eq('　　跨年：12/25 起 14 天 → 隔年 1/07', T('2026-12-25',14), '2027-01-07');
eq('　　閏年 2 月：2028/02/20 起 14 天 → 3/04（2028 是閏年）', T('2028-02-20',14), '2028-03-04');

console.log('\n③ 防呆');
eq('　　0 天當 1 天（至少當天可用，不會算出昨天）', T('2026-08-15',0), '2026-08-15');
eq('　　沒帶天數也一樣', T('2026-08-15',null), '2026-08-15');
eq('　　日期壞掉回 null，不會丟出例外', T('',28), null);
eq('　　收 Date 物件也可以', T(new Date(2026,7,15),28), '2026-09-11');

console.log('\n④ 每一條期限都問同一支');
{
  ok('★★ 票券開通（效期自第一堂預約起算）',
     /ticket\.expire_date=termExpire\(d,ticket\.valid_days\);   \/\/ 含開通當天（2026-08-08 使用者更正）/.test(src));
  /* 補課券 2026-09-05 起分兩種（見 makeupTerm）：自主訓練含開課當天、其餘從隔天起算。
     判準集中在 makeupExpire 一支，它仍然是問 termExpire ——「含首日」這個底層約定沒變，
     變的是要不要把缺席那天算進去（那天會員來不了，就不算）。 */
  ok('★★ 補課券（自主含當天、其餘隔天起算，判準只有 makeupExpire 一支）',
     /return termExpire\(base, selfLike \? days : days\+1\);/.test(src)
     && /return \{ base, days, self, expire: makeupExpire\(base, days, self\) \};/.test(src)
     && /const expire=makeupExpire\(_term\.base, makeupDays, _selfLike\);/.test(src)
     && !/termExpire\(_term\.base,makeupDays\)/.test(src));
  ok('★★ 簽到贈點（前端原本比 DB 多一天）',
     /const expire=termExpire\(rewardStart,VALID_DAYS\);/.test(src)
     && /資料庫的 handle_checkin_reward 一直是\s*\n\s*b\.date \+ valid_days - 1，這裡多加了一天/.test(src));
  ok('★ 場租票改用同一支（原本自己寫 -1，留著兩套遲早又分岔）',
     /const expire=termExpire\(start,7\);   \/\/ 效期 7 天（含啟用日）/.test(src));
  ok('★ 售票畫面／合約上寫的到期日也同一套（講的與實際發的一致）',
     /const expire=plan\.valid_days\?`\$\{plan\.valid_days\} 天（至 \$\{termExpire\(TODAY,plan\.valid_days\)\}）`:'—';/.test(src)
     && /const expire=termExpire\(TODAY,plan\.valid_days\);/.test(src));
  ok('★ 舊系統轉入的到期日推算與預設值', /const exp=termExpire\(d,p\.valid_days\);/.test(src)
     && /value="\$\{termExpire\(TODAY,365\)\}"/.test(src));
  ok('★ 會員端申請購買的合約快照', /expire_date:termExpire\(TODAY,p\.valid_days\)\}/.test(src));
  ok('★★ 沒有殘留「起算日 + N」的舊寫法',
     !/expire_date=ymd\(addDays\(d,ticket\.valid_days\)\)/.test(src)
     && !/ymd\(addDays\(TODAY,plan\.valid_days\)\)/.test(src)
     && !/ymd\(addDays\(TODAY,p\.valid_days\)\)/.test(src));
}

console.log('\n⑤ 為什麼是 N-1，寫在程式裡');
ok('★ expire_date 是「最後一個可用日」這件事講出來',
   /expire_date 是「最後一個可用日」（各處判定都是 expire_date < 預約日 才算過期），/.test(src));
ok('★ 使用者的原話與例子',
   /「課程優惠方案的期限，如果限制是 28 天，開始用的第一天也要算進去才對」：/.test(src)
   && /28 天的票 8\/15 開通 → 可用到 9\/11（8\/15 是第 1 天），不是 9\/12。/.test(src));
ok('★ 指出這本來就是全系統的約定（場租票與 DB 都這樣算）',
   /場租票（32345）與資料庫的\s*\n\s*handle_checkin_reward（b\.date \+ valid_days - 1）都是這樣算，/.test(src));
ok('　　過期判定沒被動到（仍是 expire_date < 預約日）',
   /if\(bookDate && t\.expire_date && t\.expire_date<bookDate\) return false; \/\/ 已過期/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
