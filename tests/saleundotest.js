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

console.log('① 還剩幾分鐘');
{
  const F=new Function('SALE_UNDO_MIN', grabFn('saleUndoLeft')+'\nreturn saleUndoLeft;')(30);
  const ago=m=>new Date(Date.now()-m*60000).toISOString();
  eq('★ 剛剛建立 → 還有 30 分鐘', F(ago(0)), 30);
  eq('★ 10 分鐘前 → 還有 20 分鐘', F(ago(10)), 20);
  eq('★★ 剛好 30 分鐘 → 0（不能再退）', F(ago(30)), 0);
  eq('★ 超過 → 0，不會變負數', F(ago(90)), 0);
  eq('　　沒有時間戳 → 0（不給按，寧可少給也不要誤刪）', F(null), 0);
  eq('　　時間戳壞掉 → 0', F('不是日期'), 0);
  ok('★ 30 分鐘寫成常數，不散在各處', /const SALE_UNDO_MIN=30;/.test(src));
}

console.log('\n② 按鈕在今日營收名單上');
{
  const F=grabFn('revUndoChip');
  ok('★ 只有櫃檯／管理員看得到', /if\(!r \|\| !isDeskLike\(\)\) return '';/.test(F));
  ok('★★ 超過 30 分鐘就不畫（不是畫了按下去才說不行）', /const left=saleUndoLeft\(r\.at\);\n\s*if\(left<=0\) return '';/.test(F));
  ok('★★ 按鈕上寫出還剩幾分鐘', /↩ 退回 \$\{left\}′/.test(F));
  ok('★ 票券與純收款兩種都認（場租／商品／重啟）',
     /const ref=r\.tk\?\('tk:'\+r\.tk\):\(r\.pur\?\('pur:'\+r\.pur\):''\);/.test(F));
  ok('★★ 首頁右欄名單卡與今日營收彈窗都有',
     (src.match(/\$\{revUndoChip\(r\)\}\$\{revPayChip\(r\)\}/g)||[]).length===2);
  ok('★ 列資料帶上建立時間（沒有它就算不出剩幾分鐘）',
     /at:t\.created_at\|\|null,   \/\/ 30 分鐘完整退回用（2026-08-08）/.test(src)
     && /pur:p\.id, at:p\.created_at\|\|null,   \/\/ 30 分鐘完整退回用（2026-08-08）/.test(src));
  ok('　　點退回不會順便觸發整列的「開啟會員票券」', /event\.stopPropagation\(\);openSaleUndo/.test(F));
}

console.log('\n③ 按下去之前先擋掉不乾淨的情況');
{
  const F=grabFn('openSaleUndo');
  ok('★★ 已經拿去排課 → 擋下並說明怎麼辦',
     /if\(bks\.length\) blocked=`這張票已經排了 \$\{bks\.length\} 堂課，不能直接退回 —— 請先取消那些預約，或改走票券退費`;/.test(F));
  ok('★★ 堂數被動過 → 擋下（扣課、調整都算）',
     /else if\(\(Number\(tk\.sessions_remaining\)\|\|0\)!==\(Number\(tk\.sessions_total\)\|\|0\)\)/.test(F));
  ok('★ 超過 30 分鐘 → 擋下，指向正規退費', /已超過 \$\{SALE_UNDO_MIN\} 分鐘，不能直接退回 —— 請改走票券退費/.test(F));
  ok('★★ 確認視窗逐條列出「會被清掉什麼」',
     /・票券作廢（會員看不到它）<br>・這筆購買紀錄刪除（今日營收會少掉這一筆）<br>・當時折抵的折抵券還回去<br>・當時建立的合約作廢/.test(F));
  ok('★ 明說這不是退費，真的要退錢走另一條路',
     /真的要退費給客人請改走票券頁的退費流程，那邊會留下退款紀錄。/.test(F));
  ok('★ 紅底警示（會扣掉東西＝紅，與既有色標一致）',
     /background:#fbeceb;border:1\.5px solid #e0a8a2/.test(F));
  ok('　　讀取時有忙碌提示', /const _busy=uiBusy\('檢查中…'\);/.test(F));
}

console.log('\n④ 真的退回時做了哪些事');
{
  const F=grabFn('_doSaleUndo');
  ok('★★ 折抵券照當初扣的那幾筆回沖',
     /String\(l\.note\|\|''\)\.indexOf\('折抵 \$300'\)===0/.test(F)
     && /await logTicket\(vid,'refund',back\[vid\],null,SESSION\.id,'售票整筆退回，折抵券還回'\);/.test(F));
  ok('★★ 購買紀錄刪掉（誤植不該留在營收裡）',
     /for\(const pp of purs\) if\(pp && pp\.ticket_id===id\) await dbDel\('purchases',pp\.id\);/.test(F));
  ok('★ 合約一併作廢', /for\(const c of cs\) if\(c && c\.ticket_id===id\) await dbDel\('contracts',c\.id\);/.test(F));
  ok('★ 走過審核的那筆也標回去（狀態不會停在「已發放」）',
     /r\.status='cancelled'; r\.cancel_reason='30 分鐘內整筆退回（輸入錯誤）';/.test(F));
  ok('★★ 票券留著但作廢，帳本留痕（不是靜靜消失）',
     /await logTicket\(id,'adjust',0,null,SESSION\.id,'售票整筆退回（30 分鐘內，輸入錯誤）'\);/.test(F)
     && /tk\.status='refunded'; tk\.sessions_remaining=0;/.test(F)
     && /售票整筆退回（輸入錯誤）`;/.test(F));
  ok('★ 執行前再驗一次時間（視窗開著放到超時也不能按過）',
     (F.match(/saleUndoLeft\((tk|pur)\.created_at\)<=0/g)||[]).length===2);
  ok('★ 純收款那條只刪收款紀錄（沒有票券要處理）',
     /await dbDel\('purchases',id\);\n\s*dbCacheClear\(\['purchases'\]\);/.test(F));
  ok('　　防連點', /async function doSaleUndo\(kind,id\)\{ return onceAct\('undo:'\+kind\+':'\+id, \(\)=>_doSaleUndo\(kind,id\)\); \}/.test(src));
  ok('　　寫入後清快取', /dbCacheClear\(\['member_tickets','ticket_logs','purchases','contracts','ticket_grant_requests'\]\);/.test(F));
}
ok('★ 為什麼是整筆清掉而不是退款紀錄，寫在原地',
   /這不是退費，是「這筆根本不該存在」——打錯方案、打錯人、重複儲值。/.test(src));
ok('　　使用者的原話寫在程式裡',
   /「所有銷售的產品都可以在 30 分鐘內有退回的機制，按鈕放在首頁今日營收這列表裡面」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
