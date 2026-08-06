/* 2026-08-01 使用者回報：許佳慈 8/14 的團課取消了，3 堂被吃掉，而且同事說「沒有看到那個視窗」。

   查證結果：他沒有誤按 —— 系統給他看的是**錯的那個視窗**。
   團課的票券不在 bookings.ticket_id（一堂多人，欄位放不下），而是記在 ticket_logs。
   0730 為了「待簽約卡位不該問退票」加的 noTicket 判斷只看 ticket_id，
   於是每一堂團課都被判成「沒有綁票券」→ 跳出「取消不會影響任何堂數」→ 以「不退」收掉。
   那句話本身也是錯的：實際上已經扣了堂數。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('修法');
ok('★ 團課改看扣課帳本，不再只看 bookings.ticket_id',
   /const noTicket = !b\.ticket_id && _grpNetDeduct<=0;/.test(src));
ok('★ 淨扣課＝deduct 筆數 − refund 筆數（重覆取消不會重覆問）',
   /_grpNetDeduct=_lg\.filter\(l=>l\.action==='deduct'\)\.length - _lg\.filter\(l=>l\.action==='refund'\)\.length;/.test(src));
ok('★ 只有團課才去翻帳本（其他課種維持原本的快速判斷）', /if\(bkIsGroup\(b\)\)\{/.test(src));
ok('★ 退票說明講實際筆數，不再一律寫「1 堂」（2026-08-06 起包在綠色色標裡）',
   /tkChip\('back', `加回 \$\{_grpNetDeduct>0\?`\$\{_grpNetDeduct\} 堂（本堂共扣了 \$\{_grpNetDeduct\} 堂）`:'1 堂'\}`\)/.test(src));
ok('　　整段包 try（讀不到帳本不能讓取消視窗開不起來）',
   /try\{\s*\n\s*const _lg=\(await dbGetAll\('ticket_logs'\)\)/.test(src));
ok('　　成因寫在程式裡', /每一堂團課都被判成「沒有綁票券」/.test(src));

console.log('\n退票流程本身沒被動到（它一直是對的，問題在走不到）');
/* 2026-08-06：只算真的退成功的（餘額已滿時護欄會擋下），Toast 才不會報錯數字 */
ok('★ 團課退票是逐筆 deduct 各退一次', /for\(const log of logs\)\{/.test(src)
   && /if\(await refundTicket\(log\.ticket_id,b\.id,SESSION\.id\)\) refundedCount\+\+;/.test(src));
ok('★ 已退過的不重退', /if\(\(refundCntByTk\[log\.ticket_id\]\|\|0\)>0\)\{ refundCntByTk\[log\.ticket_id\]--; continue; \}/.test(src));

console.log('\n實跑：哪一種課會跳哪一個視窗');
{
  const which=(b, netDeduct)=>{
    const isTrial=b.category==='體驗';
    const noTicket=!b.ticket_id && (netDeduct||0)<=0;
    if(noTicket && !isTrial) return '沒有票券・直接取消';
    if(isTrial) return '體驗課';
    return '選擇：退回票券／扣課不退';
  };
  const GRP=(o)=>Object.assign({category:'小班肌力',ticket_id:null},o);
  eq('★ 團課有扣課 → 要出現「退回票券／扣課不退」的選擇（原本走錯到不退那條）',
     which(GRP({}), 3), '選擇：退回票券／扣課不退');
  eq('★ 同一人佔 3 個名額 → 一樣走選擇（扣了 3 堂）', which(GRP({}), 3), '選擇：退回票券／扣課不退');
  eq('★ 團課完全沒扣過票（舊系統匯入、教練請客）→ 維持「不會影響堂數」',
     which(GRP({}), 0), '沒有票券・直接取消');
  eq('　　扣完又全退過的團課 → 也算沒票券', which(GRP({}), 0), '沒有票券・直接取消');
  eq('★ 待簽約卡位 → 維持不問退票（0730 那條修正沒被破壞）',
     which({category:'私人教練',ticket_id:null,pending_contract:true}, 0), '沒有票券・直接取消');
  eq('★ 一般教練課有綁票 → 照舊出現選擇',
     which({category:'私人教練',ticket_id:'MTK-1'}, 0), '選擇：退回票券／扣課不退');
  eq('　　體驗課走自己那條', which({category:'體驗',ticket_id:null}, 0), '體驗課');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
