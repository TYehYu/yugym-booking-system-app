/* 2026-08-02 使用者定案：「全員請假該堂課就不成立，如果該堂課有一名簽到還是要計算」

   起因（使用者附截圖）：「7月份怎麼會有 83/84，是哪一堂沒簽？」
   查出來是黃美蓉 7/31 11:00 的小班肌力（IMP-00015）—— 三個名額（黃姸元 ×2、徐翎娟）
   全部請假，沒人到，櫃檯自然沒按簽到，於是卡在「已預約」：算進排定的 84、不在已完成的 83。

   真正的問題不是那一堂，是同月 7/30 19:30（IMP-00026）也全員請假、卻被按了簽到，
   所以同樣的情況一堂算、一堂不算 —— 差別只在櫃檯當下有沒有順手按。
   把「算不算」從「有沒有按到簽到」改成看名單本身，這個數字才不會取決於操作習慣。

   全員請假的判斷沿用 grpAllOnLeave（2026-07-31 蓋紅色「假」章那一支，見 allleavetest.js）：
   畫面上蓋「假」章的課，跟統計上不算數的課，本來就該是同一批。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

const bkCounts=new Function('bkIsGroup',
  g('function mids(','\n}\n')+'\n'+g('function seatKeys(b){','\n}\n')+'\n'
  +g('function attObj(b){','\n}\n')+'\n'+g('function grpAllOnLeave(b){','\n}\n')+'\n'
  +g('function bkCounts(b){','\n')+'\nreturn bkCounts;'
)(b=>!!(b&&b.category==='小班肌力'));

/* 正式庫的兩筆真資料 */
const V={id:'IMP-00015', category:'小班肌力', date:'2026-07-31', status:'booked',
  member_ids:['MEM-F29DF20E9B43','MEM-F29DF20E9B43','MEM-C1C433044420'],
  attendance:{'MEM-F29DF20E9B43':'leave','MEM-F29DF20E9B43#2':'leave','MEM-C1C433044420':'leave'}};
const K={id:'IMP-00026', category:'小班肌力', date:'2026-07-30', status:'checked_in',
  member_ids:['MEM-A846527FAB2D','MEM-FFE5746F92BC','MEM-479AF190C9C2','MEM-05ADCB7CE754','MEM-FFE5746F92BC'],
  attendance:{'MEM-A846527FAB2D':'leave','MEM-FFE5746F92BC':'leave','MEM-FFE5746F92BC#2':'leave',
              'MEM-479AF190C9C2':'checked_in','MEM-05ADCB7CE754':'checked_in'}};

console.log('① 使用者問的那兩堂');
eq('★ 7/31 三個名額全請假 → 不成課（83/84 差的就是這一堂）', bkCounts(V), false);
eq('★ 7/30 有人簽到 → 照算（定案的另一半）', bkCounts(K), true);
eq('　　而且不是看 status：7/31 是 booked、7/30 是 checked_in，兩堂都不靠那個欄位判斷',
   [V.status, K.status, bkCounts(V), bkCounts(K)], ['booked','checked_in',false,true]);

console.log('\n② 邊界：不能把「還沒表態」當成請假');
const G=(ids,att,st)=>({category:'小班肌力', member_ids:ids, attendance:att||{}, status:st||'booked'});
eq('★ 三個名額只有兩個請假、一個還沒點 → 還算數（可能只是還沒上課）',
   bkCounts(G(['A','B','C'],{A:'leave',B:'leave'})), true);
eq('★ 完全還沒點名 → 還算數（未來的課不會整批消失）', bkCounts(G(['A','B','C'],{})), true);
eq('　　沒有 attendance 欄位也一樣', bkCounts({category:'小班肌力',member_ids:['A'],status:'booked'}), true);
eq('★ 一位請假、一位未到（no_show）→ 有人沒請假，仍算數',
   bkCounts(G(['A','B'],{A:'leave',B:'no_show'})), true);
eq('★ 同一人佔兩個名額、兩個都請假 → 不成立', bkCounts(G(['A','A'],{A:'leave','A#2':'leave'})), false);
eq('　　同一人兩個名額只請一個 → 算數', bkCounts(G(['A','A'],{A:'leave'})), true);

console.log('\n③ 單人課與取消');
eq('★ 單人課不套這個規則（請假走的是另一條路）',
   bkCounts({category:'私人教練',member_id:'A',status:'booked',attendance:{A:'leave'}}), true);
eq('★ 取消的課本來就不算', bkCounts(G(['A'],{A:'checked_in'},'cancelled')), false);
eq('　　沒有課卡 → 不算數，也不會爆', bkCounts(null), false);

console.log('\n④ 每個會用到堂數的地方都改了');
ok('★ 員工列表的本月統計（83/84 就是這裡）',
   /const _mBk=\(_bk\|\|\[\]\)\.filter\(b=>String\(b\.date\|\|''\)\.slice\(0,7\)===_ym && bkCounts\(b\)\);/.test(src));
ok('★ 營運分析與教練排行（共用同一份 monthBk）',
   /const monthBk=bookings\.filter\(b=>\(b\.date\|\|''\)\.slice\(0,7\)===month && bkCounts\(b\)\);/.test(src));
ok('★ 月結薪資：教練課堂數與當月課堂',
   /&&bkCounts\(b\)&&\(b\.date\|\|''\)\.slice\(0,7\)===month&&isPtPayClass\(b\)/.test(src)
   && /const myDone=bookings\.filter\(b=>bkCoachId\(b\)===emp\.id&&\(b\.status==='completed'\|\|b\.status==='checked_in'\)&&bkCounts\(b\)/.test(src));
ok('★ 店長獎金的達標堂數', /&& bkCounts\(b\)   \/\/ 全員請假不成課/.test(src));
ok('★ 個人薪資頁的已完成／排定',
   /const myAll=bookings\.filter\(b=>bkCoachId\(b\)===empId&&bkCounts\(b\)&&b\.date\.slice\(0,7\)===month\);/.test(src));
ok('★ 值班時段上課的重疊時數（不成課就沒有佔到值班時間）',
   /\(b\.status==='completed'\|\|b\.status==='checked_in'\) && bkCounts\(b\)\n\s*&& \(b\.category==='私人教練'/.test(src));

console.log('\n⑤ 課堂月曆看得到「不成課」，不是默默消失');
ok('★ 月曆合計把不成課的堂數另外列出來', /\$\{voided\}<\/b> 堂不成課（全員請假）/.test(src));
ok('★ 格子上標出來（不然那天看起來像沒課）', /\$\{off\} 堂不成課/.test(src));
ok('★ 點開那天，那一堂的狀態直接寫「不成課」',
   /\$\{grpAllOnLeave\(b\)\?'<b class="ppc-w">不成課<\/b>':stName\(b\.status\)\}/.test(src));
ok('　　當天的堂數只數算數的那幾堂', /\$\{bk\.filter\(bkCounts\)\.length\} 堂<\/div>/.test(src));
ok('　　月曆本身仍載入這些課（要看得到，只是不計數）',
   /bookings:\(bookings\|\|\[\]\)\.filter\(b=>bkIsCoach\(b,id\)&&b\.status!=='cancelled'\),/.test(src));

console.log('\n⑥ 判斷只有一份');
ok('★ 統計與計薪一律走 bkCounts（不是各處各寫一個條件）',
   /function bkCounts\(b\)\{ return !!b && b\.status!=='cancelled' && !grpAllOnLeave\(b\); \}/.test(src));
/* isCancelled 不是全域函式（只有某個頁面內的區域 const）—— 寫成 isCancelled(b) 會 ReferenceError */
ok('　　不依賴不存在的全域 isCancelled', !/function bkCounts\(b\)\{[^}]*isCancelled/.test(src));
ok('★ 沿用蓋「假」章那一支，不另外寫一個判斷',
   /全員請假的判斷沿用 grpAllOnLeave（2026-07-31 蓋紅色「假」章用的那一支）/.test(src)
   && !/function bkAllLeave\(/.test(src));
ok('　　為什麼不能把「還沒表態」當請假，寫在程式裡',
   /還有名額沒表態的（可能還沒上課、\n\s*或櫃檯還沒點）不算不成課，否則未來的課會整批消失。/.test(src));
ok('　　起因（7\/31 與 7\/30 的不一致）記在程式裡',
   /同樣的情況一堂算、一堂不算，\n\s*差別只在櫃檯當下有沒有順手按/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
