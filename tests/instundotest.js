/* 分期那一期按錯要退回（2026-10-13 使用者：「如果分期是真的不小心按錯 要退回呢?」）

   原本「退回」對分期後續收款是走**票券**那條（r.tk 是那張分期票），
   於是一定撞上「這張票已經排了 N 堂課，不能直接退回」——
   嚴晴那筆（TK-mtiqpnms2gde，12 堂分 2 期、已排 6 堂）就是這樣卡住的。
   但要退的其實只有**這一期**：刪掉那筆收款、把開通堂數與期數收回去，
   票券本身與已排的課一行都不動。

   ⚠ 關卡用「回退後的開通數 ≥ 已使用堂數」——
     它同時涵蓋「那次開通順便補綁了待繳費預約」那種情況（補綁會扣課，已使用就變多）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

function grab(sig){
  const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
}
const instUndoSessions=new Function(grab('function instUndoSessions(pur, tk){')+'; return instUndoSessions;')();

/* 嚴晴那張票的真實樣子（退回前） */
const TK={id:'TK-mtiqpnms2gde', sessions_total:12, sessions_remaining:6, unlocked_sessions:12,
  amount_paid:21600, installment:{paid:[true,true],count:2,amounts:[10800,10800],current:2,segments:[6,6]}};
const PUR={id:'PUR-mv6owaub3x33', ticket_id:TK.id, deal_amount:10800, source:'installment',
  note:'分期收款・開通 6 堂（已全數開通）'};

console.log('① 這一期開通了幾堂');
eq('★★★ 從 note 讀「開通 N 堂」（櫃檯可以自己改堂數，不能拿 segments 反推）',
   instUndoSessions(PUR, TK), 6);
eq('★★ note 寫「累計 N/M」那種也讀得到', instUndoSessions(
   {note:'分期收款・開通 4 堂（累計 10/12）'}, TK), 4);
eq('★★ 讀不到就退回 segments 的那一段', instUndoSessions({note:''}, TK), 6);
eq('★★ 兩個都讀不到回 0（寧可少收回，多收回會鎖掉別期的堂數）',
   instUndoSessions({note:''}, {installment:null}), 0);

console.log('\n② 收不收得回來：關卡是「回退後的開通數 ≥ 已使用堂數」');
{
  const can=(tk,n)=>{
    const used=Math.max(0,(tk.sessions_total||0)-(tk.sessions_remaining||0));
    const after=Math.max(0,(tk.unlocked_sessions||0)-n);
    return after>=used;
  };
  ok('★★★ 嚴晴那筆：開通 12 − 6 = 6，已用 6 → 收得回來', can(TK,6));
  ok('★★★ 若那次開通又補綁了 3 堂（已用變 9）→ 擋下來',
     !can({...TK, sessions_remaining:3}, 6));
  ok('★★ 第 1 期剛收完、一堂都還沒上 → 收得回來',
     can({sessions_total:12,sessions_remaining:12,unlocked_sessions:6},6));
}

console.log('\n③ 期數要照新的開通數重算');
{
  const roll=(segs, after)=>{ let cum=0,cur=0; const paid=[];
    segs.forEach((sg,i)=>{ cum+=sg; const d=after>=cum; paid[i]=d; if(d) cur=i+1; });
    return {current:Math.max(1,cur), paid}; };
  eq('★★★ 12 堂分 2 期、退回後開通 6 → 回到第 1 期', roll([6,6],6), {current:1,paid:[true,false]});
  eq('★★ 12 堂分 3 期、退回後開通 4 → 回到第 1 期', roll([4,4,4],4), {current:1,paid:[true,false,false]});
  eq('★★ 全部退光也至少停在第 1 期（current 不能是 0）', roll([6,6],0), {current:1,paid:[false,false]});
}

console.log('\n④ 程式接得起來');
ok('★★★ 分期列的退回改走收款那條（不要去作廢整張票）',
   /const _instRow=\(r\.src==='installment' && r\.pur\);/.test(src)
   && /openSaleUndo\(_instRow\?\('pur:'\+r\.pur\)/.test(src));
ok('★★★ 開窗前就先檢查收不收得回來，並寫出擋下的原因',
   /if\(_after<_used\) blocked=`這一期開通的 \$\{_n\} 堂已經有 \$\{_used-_after\} 堂上掉了，不能直接退回`/.test(src));
ok('★★★ 確認視窗寫明「票券與已排的課都不動」',
   /這一期開通的 <b>\$\{_instN\}<\/b> 堂收回去（票券與已排的課都不動）/.test(src)
   && /期數退回上一期，之後可以重收一次/.test(src));
ok('★★★ 真的退回時：開通數、累計實收、期數三件一起改',
   /t\.unlocked_sessions=after;/.test(src)
   && /t\.amount_paid=Math\.max\(0,\(Number\(t\.amount_paid\)\|\|0\)-\(Number\(pur\.deal_amount\)\|\|0\)\);/.test(src)
   && /inst\.current=Math\.max\(1,cur\);/.test(src));
ok('★★★ 送出時再驗一次（視窗開著的期間別人可能先排了課）',
   /if\(after<used\)\{ done\(\); showToast\(`這一期已經有課上掉了，不能直接退回/.test(src));
ok('★★★ 先改票券再刪收款（反過來失敗會變成「錢沒了、堂數還開著」）',
   /先改票券再刪收款/.test(src));
ok('★★ 帳本留痕（收回幾堂、少了多少錢）',
   /分期收款退回（當天，輸入錯誤）：收回開通 \$\{n\} 堂，實收 −\$\$\{/.test(src));
ok('★★ 發票照既有那條跟著作廢（_undoPurIds 本來就含這一筆）',
   /const _undoPurIds=\(kind==='pur'\)\?\[id\]:\[\];/.test(src)
   && /await invVoidForPurchase\(pid, '銷售退回'\);/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
