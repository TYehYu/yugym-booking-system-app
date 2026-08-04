/* 2026-08-01 使用者回報：「今日儲值 巫雅雯第一份錯了，註銷後系統吃了兩堂課，
   是跟剛剛一樣的錯誤嗎？這個客人今天應該是一個 8 堂方案，8/1 用了一堂，
   剩下重複預約每週六 13:00 才對。」

   查證：不是同一個錯誤，是兩件事疊在一起 ——
   ① 重複儲值：同一份 8 堂自訂方案在 15 分鐘內被建了兩次（05:25、05:40），
      $12,000 記了兩筆，之後排課一路挑錯票。
   ② 重複扣課：8/01 那堂在 51 毫秒內被扣了兩次（同一筆 booking、同樣的 log 內容）——
      彈窗按鈕是 inline onclick，手機上會收到補發的第二次點擊。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 重複儲值防呆');
ok('★ 發放前檢查「今天同一位會員、同名同堂數」是否已有一張',
   /const _sameToday=\(await dbGetAll\('member_tickets'\)\)\.filter\(t=>/.test(src)
   && /String\(t\.purchase_date\|\|''\)\.slice\(0,10\)===_todayY/.test(src)
   && /String\(t\.plan_name\|\|''\)===String\(plan\.name\|\|''\)/.test(src)
   && /Number\(t\.sessions_total\)===Number\(\(plan\.sessions_base\|\|0\)\+\(plan\.sessions_bonus\|\|0\)\)/.test(src));
ok('★ 作廢過的不算（重發一張是正常補救）', /t\.status!=='refunded'/.test(src));
ok('★ 是確認不是禁止（真的要賣兩份仍可繼續）', /確定還要再發一張嗎/.test(src)
   && /if\(_sameToday\.length && !confirm\(/.test(src));
ok('　　訊息講清楚後果（重複的那張之後會一直被挑走）', /重複的那張之後排課會一直被挑走，很難清乾淨/.test(src));
ok('　　整段包 try（查不到票券不能擋住正常銷售）', /\}catch\(_\)\{\}/.test(src));

console.log('\n② 重複扣課防連點');
ok('★ 有動作層的重入鎖', /const _actBusy=\{\};/.test(src) && /async function onceAct\(key, fn\)\{/.test(src));
ok('★ 跑完再多留 400ms，吃掉補發的那一次點擊',
   /finally\{ setTimeout\(\(\)=>\{ delete _actBusy\[key\]; \}, 400\); \}/.test(src));
ok('★ 換票券的動作有上鎖', /async function doBkTicketChange\(id,newTkId\)\{ return onceAct\('tkchg:'\+id, \(\)=>_doBkTicketChange\(id,newTkId\)\); \}/.test(src));
ok('★ 轉正式預約（會扣課）也有上鎖',
   /return onceAct\('convert:'\+\(window\._cpBid\|\|''\)\+':'\+\(tkId\|\|''\)\+':'\+\(mode\|\|''\), \(\)=>_doConvertPending\(memberId,tkId,mode\)\);/.test(src));   // 2026-08-04 鍵多帶模式
ok('　　鎖的 key 帶票券 id —— 選不同票券是不同動作，不會被互相擋住',
   /'convert:'\+\(window\._cpBid\|\|''\)\+':'\+\(tkId\|\|''\)/.test(src));
ok('　　成因寫在程式裡', /手機上偶爾會收到兩次事件（touchend 之後補發的 click、/.test(src));

console.log('\n實跑重入鎖');
(async()=>{
  const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const mk=new Function(g('const _actBusy={};','\n}\n')+'\nreturn onceAct;')();
  let runs=0;
  const slow=()=>new Promise(r=>setTimeout(()=>{runs++;r('done');},30));
  // 同一個 key 連按三次 → 只跑一次
  const [a1,a2,a3]=await Promise.all([mk('k',slow),mk('k',slow),mk('k',slow)]);
  eq('★ 同一個動作連按三次 → 只執行一次', runs, 1);
/* 2026-08-01 二修：原本擋掉的那一次回 undefined，但 checkInBooking／saveBookingTime
   的回傳值是有人在看的（const ok=await …），undefined 會被當成「失敗」跳錯誤訊息。
   改成讓重複的那幾次「跟著等同一個結果」—— 動作仍然只跑一次。 */
  eq('　　被擋掉的那幾次跟著等同一個結果（不是 undefined，也不是重跑）', [a2,a3], ['done','done']);
  eq('　　真正執行的那次仍拿得到回傳值', a1, 'done');
  // 不同 key 互不影響
  runs=0;
  await Promise.all([mk('x',slow),mk('y',slow)]);
  eq('★ 不同動作不會互相擋住', runs, 2);
  // 放行後可以再跑
  runs=0; await mk('z',slow);
  await new Promise(r=>setTimeout(r,460));
  await mk('z',slow);
  eq('★ 放行後同一個動作可以再執行', runs, 2);
  // 丟例外也要解鎖
  runs=0;
  try{ await mk('e',()=>{ throw new Error('boom'); }); }catch(_){}
  await new Promise(r=>setTimeout(r,460));
  await mk('e',slow);
  eq('★ 動作丟例外也會解鎖（不會整個功能鎖死）', runs, 1);

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
