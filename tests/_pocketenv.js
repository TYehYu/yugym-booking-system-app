/* 把 index.html 裡真正的「票卡口袋」那一段挖出來，給測試沙箱注入用。

   2026-08-29 新增：場地分配開始問口袋的 prepMin（團課開課前 15 分鐘要清場），
   於是幾支只切了場地那一段的舊測試都缺 bkPocketNow。在各自的檔案裡寫一個
   `b=>b.category==='小班肌力'?…` 的假貨最省事，但那就變成規則的第二份副本 ——
   正是 TK_POCKETS 當初要消滅的東西（見 index.html 的口袋註解）。
   所以這裡注入的是**真的那一支**。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const i=src.indexOf('const TK_POCKETS={'), j=src.indexOf('function lpPerson(', i);
if(i<0||j<0) throw new Error('_pocketenv：切不到 TK_POCKETS 區塊');
const env=new Function('window', src.slice(i,j)+'\nreturn {tkPocketNow, bkPocketNow, tkClass5, TK_POCKETS};')({_ttCache:[]});
module.exports=env;
