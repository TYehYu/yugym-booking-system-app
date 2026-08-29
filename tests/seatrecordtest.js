/* 2026-08-07 使用者追問：「許佳慈今天的課本來就分配好了、票券也全都預約上了，
   今天只是新儲值一堂，為什麼又會打亂之前的票券？」

   根源：團課「哪個名額用哪張票」只有**管理名單加名額**那條路會寫進 bookings.seat_tickets
   （2026-08-06 起）。另外兩條路 —— 建立團課（含連續預約開課）、加名單後的「後續場次
   連續預約」—— 扣了票卻沒記歸屬，票券夾只能用近似法重算：
     「把這堂課的扣課紀錄依購買日新→舊攤平，第 i 個名額配第 i 張」
   於是同一堂課上只要**新買一張票**（購買日最新 → 排到最前面），既有名額的配對整排位移，
   圓點看起來就被打亂了。

   修法：那兩條路在扣課成功的當下就把名額鍵→票券 id 寫進課卡。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 三條會扣團課票的路，都要記下名額歸屬');
{
  const writes=(src.match(/seat_tickets=Object\.assign\(/g)||[]).length;
  ok('★ 至少三處會寫 seat_tickets（建立團課／連續預約補位／管理名單）', writes>=3, writes);
}

console.log('\n② 建立團課（含連續預約開課）');
{
  ok('★ 扣課成功才記，記在剛建立的那張課卡上',
     /* 2026-08-27：團課一人多名額是合法的重複扣課，所以帶 {multi:true} 跳過冪等檢查 */
     /if\(tk && await deductTicket\(tk,bk\.id,SESSION\.id,\{multi:true\}\)\)\{ charged\+\+;/.test(src)
     && /bk\.seat_tickets=Object\.assign\(\{\}, bk\.seat_tickets\|\|\{\}, \{\[_sk\]:tk\.id\}\);/.test(src));
  ok('★ 名額鍵沿用既有規則（第 1 個是 id、第 2 個起是 id#N）',   // 2026-08-20 取消教練招待：鍵改依「實際加入」的格數編號
     /const _sk=\(_c>1\)\?\(mid\+'#'\+_c\):mid;\n\s*bk\.seat_tickets=/.test(src));
  ok('★ 名單與名額歸屬一次寫回課卡（扣到票的才進名單）',
     /else \{ skipped\+\+; _failedW\.add\(String\(mid\)\); \}\n\s*\}\n\s*await dbPut\('bookings',bk\);/.test(src));
}

console.log('\n③ 連續預約補位（後續場次一起約）');
{
  const r=grabFn('_grpFollowRun');
  ok('★ 每扣一堂就記一個名額', /_newSeatTk\[\(_n>0\)\?\(w\.mid\+'#'\+\(_n\+1\)\):w\.mid\]=tk\.id;/.test(r));
  /* 2026-08-29：has 改成「同一位使用人的名額數」（不同使用人要各佔各的名額），
     所以序號改用 _mine＝這位會員在這堂的總名額數。用 has 當索引會蓋掉別位使用人那一格。 */
  ok('★★ 名額序號要接在他既有的名額後面（不是從 0 重算）',
     /const _n=_mine\+addedSeats;/.test(r)
     && /const _mine=cur\.filter\(m=>String\(m\)===String\(w\.mid\)\)\.length;/.test(r));
  ok('★ 跟 member_ids 同一次寫回（不會只寫一半）',
     /x\.member_ids=cur\.concat\(Array\.from\(\{length:addedSeats\},\(\)=>w\.mid\)\);\n\s*x\.seat_tickets=Object\.assign\(\{\}, x\.seat_tickets\|\|\{\}, _newSeatTk\);\n\s*await dbPut\('bookings',x\);/.test(r));
  ok('　　扣不到票就停，停之前記的那幾格照樣有效', /if\(!tk\)\{ noTk=true; break; \}/.test(r));
}

console.log('\n④ 為什麼要記，寫在程式裡');
ok('★ 建立團課那一處講明白', /沒記下來的名額只能靠「把扣課紀錄依購買日\n\s*排序、第 i 個名額配第 i 張」的近似法，於是新買一張票就插到最前面/.test(src));
ok('★ 連續預約那一處也講明白',
   /連續預約補位原本只寫 member_ids，\n\s*歸屬要靠近似法重算，之後只要這位會員新買一張票，圓點就會整排位移/.test(src));
ok('　　移除名額時歸屬仍會跟著重編（既有規則沒被破壞）',
   /b\.seat_tickets=seatTkReindexAfterRemove\(b, i\);/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
