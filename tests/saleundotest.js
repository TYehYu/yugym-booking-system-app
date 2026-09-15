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
  const agoMin=m=>new Date(Date.now()-m*60000).toISOString();
  const agoDay=d=>new Date(Date.now()-d*86400000).toISOString();
  eq('★ 剛剛建立 → 可以退', F(agoMin(0)), true);
  eq('★★★ 90 分鐘前（同一天）→ 仍可以退（這就是放寬的重點）', F(agoMin(90)), true);
  eq('★★★ 昨天 → 不能退（跨日就走正規退費）', F(agoDay(1)), false);
  eq('★ 一週前 → 不能退', F(agoDay(7)), false);
  eq('　　沒有時間戳 → false（不給按，寧可少給也不要誤刪）', F(null), false);
  eq('　　時間戳壞掉 → false', F('不是日期'), false);
  ok('★★ 判準是比對當日字串，不是 24 小時（跨日就該走退費）',
     /return ymd\(t\)===ymd\(new Date\(\)\);/.test(grabFn('saleUndoOk')));
}

console.log('\n② 按鈕在今日營收名單上');
{
  const F=grabFn('revUndoChip');
  ok('★ 只有櫃檯／管理員看得到', /if\(!r \|\| !isDeskLike\(\)\) return '';/.test(F));
  ok('★★ 不是今天的就不畫（不是畫了按下去才說不行）', /if\(!saleUndoOk\(r\.at\)\) return '';/.test(F));
  /* 改成「當天」後不再顯示剩餘分鐘 —— 早上打錯到晚上還有幾百分鐘，寫「退回 640′」很莫名 */
  ok('★★ 按鈕不再寫剩餘分鐘（當天制之下那個數字沒有意義）',
     /↩ 退回<\/button>/.test(F) && !/\$\{left\}′/.test(F));
  ok('★ 票券與純收款兩種都認（場租／商品／重啟）',
     /const ref=r\.tk\?\('tk:'\+r\.tk\):\(r\.pur\?\('pur:'\+r\.pur\):''\);/.test(F));
  /* 2026-09-15 使用者：「營收明細退回的按鈕可以改在發票左邊　這樣就不會多一列了」——
     退回鈕從右側直欄（.mc-rev-r）搬到姓名那一行，排在發票標記左邊。
     ⚠ 兩份不對稱：首頁版姓名那行是「姓名＋退回＋發票」，彈窗版沒有發票標記（只到退回）。
       所以不能只用一條正則數兩處，兩邊各釘各的。 */
  ok('★★ 首頁右欄名單卡與今日營收彈窗都有（0915 起放在姓名那一行）',
     (src.match(/<\/span>\$\{revUndoChip\(r\)\}/g)||[]).length===2
     && /<div class="rv-r1"><span class="mc-rev-nm">\$\{r\.nm\}<\/span>\$\{revUndoChip\(r\)\}\$\{revInvChip\(r\)\}<\/div>/.test(src)
     && /<div class="rv-r1"><span class="mc-rev-nm">\$\{esc\(r\.nm\)\}<\/span>\$\{revUndoChip\(r\)\}<\/div>/.test(src));
  ok('★ 列資料帶上建立時間（沒有它就算不出剩幾分鐘）',
     /at:t\.created_at\|\|null,   \/\/ 30 分鐘完整退回用（2026-08-08）/.test(src)
     && /pur:p\.id, at:p\.created_at\|\|null,   \/\/ 30 分鐘完整退回用（2026-08-08）/.test(src));
  ok('　　點退回不會順便觸發整列的「開啟會員票券」', /event\.stopPropagation\(\);openSaleUndo/.test(F));
}

console.log('\n②-2 Ink 模式下的份量（2026-09-15 使用者：「這個退回的標籤很突兀」）');
/* 突兀的根源不是位置，是只有它漏掉了 Ink 的扁平化 —— 同一列的「匯款」與教練名
   早就被退成純文字，只剩它還是粉紅底＋紅框＋圓角膠囊。 */
ok('★★★ 〔退回〕併進 Ink 的扁平化規則（與 .mc-rev-pay／.rev-att 同一條）',
   /body\.ink \.mc-revlist-card \.mc-rev-pay,\s*\n\s*body\.ink \.mc-revlist-card \.rev-undo,\s*\n\s*body\.ink \.mc-revlist-card \.rev-att\{/.test(src));
ok('★★ 紅色保留（那是語意：這顆會扣掉東西），只是不再用色塊喊話',
   /body\.ink \.mc-revlist-card \.rev-undo\{font-size:11px;color:#b5372e !important;\}/.test(src));
ok('★ 非 Ink 的原始膠囊樣式留著（只有 Ink 那層被扁平化）',
   /\.rev-undo\{font-size:10px;font-weight:800;border-radius:999px;/.test(src));

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
