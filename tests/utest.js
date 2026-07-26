/* 會員票券卡「已用堂數」——從 index.html 抽出真正的 usedCount 運算式驗證。
   2026-07-26 改版：三訊號取最大（直連已上／FIFO 推算已上／帳面已用−直連預約中）。 */
const fs=require('fs');
const h=fs.readFileSync('/Users/tungyeh/Projects/yugym-booking-system-app/index.html','utf8');
const a=h.indexOf('    const inf=inferByTk[t.id]||[];');
const b=h.indexOf('const isDim=', a);
const src=h.slice(a,b);
const calc=(total,dates,t,inferByTk,bkByTk)=>new Function('total','dates','t','inferByTk','bkByTk',
  src+' return usedCount;')(total,dates,t,inferByTk||{},bkByTk||{});
let pass=0,fail=0;
const chk=(n,got,want)=>{const ok=got===want;ok?pass++:fail++;console.log(`  ${ok?'✓':'✗'} ${n}  got=${got} want=${want}`);};
const BK=st=>({status:st});

console.log('有綁預約（新系統票券）：');
chk('3 筆已上直連 → 已用 3', calc(4,['a','b','c'],{id:'t',sessions_remaining:1},{},{t:[BK('completed'),BK('completed'),BK('checked_in')]}), 3);
chk('綁的數量超過總堂 → 不超過總堂', calc(3,['a','b','c','d'],{id:'t',sessions_remaining:0},{},{t:[]}), 3);
chk('新系統票約滿未上（預約扣課）→ 已用 0', calc(4,[],{id:'t',sessions_remaining:0},{},{t:[BK('booked'),BK('booked'),BK('booked'),BK('booked')]}), 0);

console.log('混合票（匯入＋之後才綁到一筆）——陳蘭馨友善 1V2 真實案例：');
// 總 24、剩 19（口徑修正後）、直連只有 7/14 一堂已上 → 已用應為帳面 5，不是 1
chk('★ 直連 1 堂但帳面已用 5 → 顯示 5', calc(24,['7/14'],{id:'t',sessions_remaining:19},{},{t:[BK('checked_in')]}), 5);
chk('帳面已用要扣掉直連仍預約中的扣課', calc(24,['7/14'],{id:'t',sessions_remaining:18},{},{t:[BK('checked_in'),BK('booked')]}), 5);

console.log('未綁但推算得到（匯入票券）：');
// 朱庭箴：口徑修正後 剩2（總4、已上2、未來2 不預扣）→ 三訊號一致
chk('朱庭箴（修正後剩 2）：2 已上 + 2 未來 → 已用 2', calc(4,[],{id:'t',sessions_remaining:2},{t:[BK('completed'),BK('checked_in'),BK('booked'),BK('booked')]}), 2);
chk('全部未來預約（剩＝總）→ 已用 0', calc(4,[],{id:'t',sessions_remaining:4},{t:[BK('booked'),BK('booked')]}), 0);
chk('全部已上 → 已用 4（整排實心）', calc(4,[],{id:'t',sessions_remaining:0},{t:[BK('completed'),BK('completed'),BK('completed'),BK('completed')]}), 4);

console.log('推算不到時退回用餘額：');
chk('用完的歷史票券 → 整排實心', calc(12,[],{id:'t',sessions_remaining:0}), 12);
chk('全新未用 → 0', calc(4,[],{id:'t',sessions_remaining:4}), 0);
chk('餘額缺失 → 0', calc(8,[],{id:'t'}), 0);
chk('餘額 > 總堂（髒資料）→ 不變負數', calc(12,[],{id:'t',sessions_remaining:16}), 0);

console.log('全會員比對（2026-07-26）新增守則：');
// 有餘額資訊時，FIFO 推算不得抬高已用（歷史「已上課未扣票」會把沒用過的票塞滿）
chk('★ 推算 2 已上但帳面全新（剩=總）→ 顯示 0', calc(2,[],{id:'t',sessions_remaining:2},{t:[BK('completed'),BK('completed')]}), 0);
chk('餘額缺失時推算仍可當後備', calc(4,[],{id:'t'},{t:[BK('completed'),BK('completed')]}), 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
