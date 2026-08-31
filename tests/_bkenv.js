/* 把 index.html 裡真正的 bkLeaveRefunded 挖出來，掛成沙箱看得到的全域。

   2026-08-30：「教練請假且已結課＝堂數已退，不算這張票的一堂」這條判準原本被抄成四份
   （票券夾 isAtt、ticketTokens、usedSessionsMap、renderMemTickets），
   結果 computeLastBkMarks 沒抄到 —— 鄭宇涵那張 8 堂票的第 7 堂被算成第 8 堂，
   誤判「最後一堂」、跳出收款提醒，櫃檯真的去跟客人收錢了。
   收斂成一支之後，只切某一段程式的舊沙箱就會缺這個函式。

   在各自的測試檔裡寫一個 `b=>b.coach_leave===true&&…` 的假貨最省事，
   但那就是規則的第五份副本 —— 正是這次事故的成因。所以這裡注入**真的那一支**。

   `new Function` 的函式本體跑在全域範疇，所以掛上 globalThis 就好，
   不必去動每個沙箱的參數列（同 _pocketenv.js 的用意，作法更輕）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const i=src.indexOf('function bkLeaveRefunded(b){');
if(i<0) throw new Error('_bkenv：切不到 bkLeaveRefunded');
const j=src.indexOf('\n}\n', i)+2;
const fn=new Function('return '+src.slice(i,j)+';')();
if(typeof fn!=='function') throw new Error('_bkenv：切出來的不是函式');
/* 自我驗證：切錯段落的話這兩條會當場爆掉，而不是讓測試靜靜地全過 */
if(fn({coach_leave:true,status:'completed'})!==true
   || fn({coach_leave:true,status:'booked'})!==false) throw new Error('_bkenv：切到的函式行為不對');
globalThis.bkLeaveRefunded=fn;

/* 2026-08-31 追加 tkUsableBy／tkSharedIds（同樣的理由）——
   連續預約的「還剩幾堂」原本寫成 `t.member_id===mid`，共享票就算成 0 堂
   （林繼霖用林政緯共享的團課票，那扇窗直接不給約）。改吃 tkUsableBy 之後，
   只切了團課那一段的沙箱就會缺這一支。 */
const i2=src.indexOf('function tkSharedIds(t){');
const j2=src.indexOf('// 找會員某類型最早到期的可用票券');
if(i2<0||j2<0||j2<i2) throw new Error('_bkenv：切不到 tkUsableBy 那一段');
const tkEnv=new Function(src.slice(i2,j2)+'\nreturn {tkUsableBy,tkSharedIds};')();
if(tkEnv.tkUsableBy({member_id:'A'},'A')!==true
   || tkEnv.tkUsableBy({member_id:'A',shared_with:['B']},'B')!==true
   || tkEnv.tkUsableBy({member_id:'A'},'B')!==false) throw new Error('_bkenv：tkUsableBy 行為不對');
globalThis.tkUsableBy=tkEnv.tkUsableBy;
globalThis.tkSharedIds=tkEnv.tkSharedIds;

module.exports={bkLeaveRefunded:fn, tkUsableBy:tkEnv.tkUsableBy, tkSharedIds:tkEnv.tkSharedIds};
