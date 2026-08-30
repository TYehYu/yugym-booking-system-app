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
module.exports={bkLeaveRefunded:fn};
