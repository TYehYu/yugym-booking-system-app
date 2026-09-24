/* 2026-08-08 使用者指示：
     「為了避免有輸入錯誤的情況發生，幫我設計一個 30 分鐘內可以完整退回的按鈕」
     「所有銷售的產品都可以在 30 分鐘內有退回的機制，按鈕放在首頁今日營收這列表裡面」

   ⚠ 這不是退費，是「這筆根本不該存在」——打錯方案、打錯人、重複儲值
     （8/01 巫雅雯就發生過同一份 8 堂自訂方案 15 分鐘內建兩次、$12,000 記兩筆）。
     所以是整筆清掉：票券作廢、購買紀錄刪除、折抵券還回去、合約作廢。
     真正要退錢給客人請走票券頁的退費，那邊才會留下退款紀錄。

   ⚠ 只在「還沒被用過」時給按 —— 已經拿去排課、或堂數被動過，就不再是乾淨的撤銷。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 是不是今天建立的（2026-09-15 由 30 分鐘放寬成「當天」）');
/* 使用者：「目前很少有退款　只有櫃檯操作錯誤需要重新輸入」→「當天可修正」
   30 分鐘一過就只剩「票券退費」那條路，但那條會按合約算比例、扣 20% 手續費、開折讓，
   把櫃檯打錯當成客人中途解約 —— 完全是錯的處理方式。 */
{
  const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const F=new Function('ymd', grabFn('saleUndoOk')+'\nreturn saleUndoOk;')(ymd);
  /* ⚠ 基準用「今天中午」不是 Date.now()（2026-09-25 修）——
     saleUndoOk 比的是「跟今天同一天嗎」，而原本用 Date.now() 往前推 90 分鐘：
     在凌晨 00:00–01:30 跑測試時那是**昨天**，這一條會無故變紅。
     測試不該有「幾點跑會不一樣」的成分；中午當基準，±90 分鐘一定同一天。 */
  const noon=(()=>{ const d=new Date(); d.setHours(12,0,0,0); return d.getTime(); })();
  const agoMin=m=>new Date(noon-m*60000).toISOString();
  const agoDay=d=>new Date(noon-d*86400000).toISOString();
  eq('★ 剛剛建立 → 可以退', F(agoMin(0)), true);
  eq('★★★ 90 分鐘前（同一天）→ 仍可以退（這就是放寬的重點）', F(agoMin(90)), true);
  eq('★★★ 昨天 → 不能退（跨日就走正規退費）', F(agoDay(1)), false);
  eq('★ 一週前 → 不能退', F(agoDay(7)), false);
  eq('　　沒有時間戳 → false（不給按，寧可少給也不要誤刪）', F(null), false);
  eq('　　時間戳壞掉 → false', F('不是日期'), false);
  ok('★★ 判準是比對當日字串，不是 24 小時（跨日就該走退費）',
     /return ymd\(t\)===ymd\(new Date\(\)\);/.test(grabFn('saleUndoOk')));
}

console.log('\n② 退回的入口（2026-09-21 起在點出來的小視窗裡，不在卡片上）');
{
  /* 2026-09-21 使用者：「把退回的按鈕從卡片拿掉 已經在點出的視窗有按鈕了」——
     卡片上那顆膠囊鈕（連同它的樣式）整個移除，退回改由 revRowPanel 的第五顆鈕進入。
     ⚠ 退回的**邏輯**完全沒動：能不能退仍由 saleUndoOk 決定（見上面 ①），
       按下去走的也還是同一支 openSaleUndo（見下面 ③）。 */
  const P=grabFn('revRowPanel'), A=grabFn('rvpAct');
  ok('★★ 只有櫃檯／管理員按得動', /const desk=\(typeof isDeskLike==='function'\)&&isDeskLike\(\);/.test(P)
     && /const _undoOk=desk && /.test(P));
  ok('★★ 不是今天的就按不動（沿用同一支判準）',
     /typeof saleUndoOk!=='function' \|\| saleUndoOk\(r\.at\)/.test(P));
  ok('★ 票券與純收款兩種都認（場租／商品／重啟）',
     /!!\(r\.tk\|\|r\.pur\)/.test(P)
     && /openSaleUndo\(r\.tk\?\('tk:'\+r\.tk\):\('pur:'\+r\.pur\)\)/.test(A));
  /* 不能退的時候要暗化＋寫原因，不是整顆消失（yugym-disabled-with-reason）——
     櫃檯看不到按鈕會以為功能壞了。 */
  ok('★★★ 不能退時仍然畫出來，只是暗化並寫明原因',
     /btn\('undo','退回'/.test(P) && /只能在收款當天退回/.test(P));
  ok('★ 列資料帶上建立時間（沒有它就判不出是不是今天）',
     /at:t\.created_at\|\|null,   \/\/ 30 分鐘完整退回用（2026-08-08）/.test(src)
     /* 2026-09-21：收款列多帶了 src（判斷商品章用），at 的位置往後挪了一格 */
     && /pur:p\.id, src:p\.source\|\|null, at:p\.created_at\|\|null,   \/\/ 30 分鐘完整退回用（2026-08-08）/.test(src));
  /* 卡片上那顆已經不存在了 —— 用剝過註解的版本比對，否則會命中說明文字本身 */
  const codeOnly=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  ok('★★★ 卡片上不再有退回鈕（連樣式一起清掉，不留死碼）',
     !/revUndoChip/.test(codeOnly) && !/rev-undo/.test(codeOnly));
}

console.log('\n③ 按下去之前先擋掉不乾淨的情況');
{
  const F=grabFn('openSaleUndo');
  ok('★★ 已經拿去排課 → 擋下並說明怎麼辦',
     /if\(bks\.length\) blocked=`這張票已經排了 \$\{bks\.length\} 堂課，不能直接退回 —— 請先取消那些預約，或改走票券退費`;/.test(F));
  ok('★★ 堂數被動過 → 擋下（扣課、調整都算）',
     /else if\(\(Number\(tk\.sessions_remaining\)\|\|0\)!==\(Number\(tk\.sessions_total\)\|\|0\)\)/.test(F));
  ok('★ 不是今天 → 擋下，指向正規退費', /這筆不是今天建立的，不能直接退回 —— 請改走票券退費/.test(F));
  ok('★★ 確認視窗逐條列出「會被清掉什麼」',
     /<li>票券作廢（會員看不到它）<\/li><li>購買紀錄刪除，今日營收少這一筆<\/li><li>折抵券還回去、合約作廢<\/li>/.test(F));
  ok('★ 明說這不是退費，真的要退錢走另一條路',
     /<div class="mk-key">這不是退費，整筆會被清掉/.test(F)
     && /<li>真的要退費給客人請改走票券頁的退費流程，那邊會留下退款紀錄<\/li>/.test(F));
  /* 2026-09-11：紅底色塊改成共用的 .mk-key（預設就是品牌暗紅） */
  ok('★ 紅字警示（會扣掉東西＝紅，與既有色標一致）',
     /<div class="mk-key">這不是退費/.test(F) && !/<div class="mk-key (gold|green)">這不是退費/.test(F));
  ok('　　讀取時有忙碌提示', /const _busy=uiBusy\('檢查中…'\);/.test(F));
}

console.log('\n④ 真的退回時做了哪些事');
{
  const F=grabFn('_doSaleUndo');
  ok('★★ 折抵券照當初扣的那幾筆回沖',
     /String\(l\.note\|\|''\)\.indexOf\('折抵 \$300'\)===0/.test(F)
     && /await logTicket\(vid,'refund',back\[vid\],null,SESSION\.id,'售票整筆退回，折抵券還回'\);/.test(F));
  /* 2026-08-11 發票串接：刪掉的 purchase id 先收進 _undoPurIds，有開發票的話退回時要跟著作廢 */
  ok('★★ 購買紀錄刪掉（誤植不該留在營收裡；id 收進 _undoPurIds 供發票作廢）',
     /for\(const pp of purs\) if\(pp && pp\.ticket_id===id\)\{ _undoPurIds\.push\(pp\.id\); await dbDel\('purchases',pp\.id\); \}/.test(F));
  ok('★ 合約一併作廢', /for\(const c of cs\) if\(c && c\.ticket_id===id\) await dbDel\('contracts',c\.id\);/.test(F));
  ok('★ 走過審核的那筆也標回去（狀態不會停在「已發放」）',
     /r\.status='cancelled'; r\.cancel_reason='當天整筆退回（輸入錯誤）';/.test(F));
  ok('★★ 票券留著但作廢，帳本留痕（不是靜靜消失）',
     /await logTicket\(id,'adjust',0,null,SESSION\.id,'售票整筆退回（當天，輸入錯誤）'\);/.test(F)
     && /tk\.status='refunded'; tk\.sessions_remaining=0;/.test(F)
     && /售票整筆退回（輸入錯誤）`;/.test(F));
  ok('★ 執行前再驗一次日期（視窗開著放過午夜也不能按過）',
     (F.match(/!saleUndoOk\((tk|pur)\.created_at\)/g)||[]).length===2);
  ok('★ 純收款那條只刪收款紀錄（沒有票券要處理）',
     /await dbDel\('purchases',id\);\n\s*dbCacheClear\(\['purchases'\]\);/.test(F));
  ok('　　防連點', /async function doSaleUndo\(kind,id\)\{ return onceAct\('undo:'\+kind\+':'\+id, \(\)=>_doSaleUndo\(kind,id\)\); \}/.test(src));
  ok('　　寫入後清快取', /dbCacheClear\(\['member_tickets','ticket_logs','purchases','contracts','ticket_grant_requests'\]\);/.test(F));
}
ok('★ 為什麼是整筆清掉而不是退款紀錄，寫在原地',
   /這不是退費，是「這筆根本不該存在」——打錯方案、打錯人、重複儲值。/.test(src));
ok('　　使用者的原話寫在程式裡',
   /「所有銷售的產品都可以在 30 分鐘內有退回的機制，按鈕放在首頁今日營收這列表裡面」/.test(src)
   && /「目前很少有退款　只有櫃檯操作錯誤需要重新輸入」→「當天可修正」/.test(src));
ok('★★ 為什麼放寬成當天，理由寫在原地（資料佐證別再重查一次）',
   /29 張 void_mode 是 null/.test(src) && /386 筆收款裡只有 1 筆走過〔退回〕/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
