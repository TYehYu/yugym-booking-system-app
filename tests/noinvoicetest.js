/* 2026-08-02 使用者指示：「銷售的地方先移除發票區，目前還沒串聯」
   → **2026-09-15 推翻**：「開發票這個功能只要有收款都要出現喔　現在的情況是有些散客
     會來買蛋白粉或體驗課程　這種時候就要看要不要開發票　要開就要手動輸入
     當時客人的載具或信箱」

   0802 拿掉的理由是「選了也沒有下文」；0915 綠界已經串好並正式開立（ECPAY_ENV=prod），
   那個理由消失了，四個銷售入口全部把發票區加回來。
   ⚠ 這支測試的①②段因此**反轉**：從「不准有發票區」改成「四個入口都要有」。
   ⚠ ③段（首頁 KPI 不要留「有發票 $0」死行）與發票區無關，原樣保留。
   ⚠ 舊的 id（fr-invoice/fv-invoice/ms-invoice/gt-invoice）沒有復活 —— 新版是共用的
     invFieldsHTML()，四處插同一份，不是各自做一套下拉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 每個收款入口都要問發票（2026-09-15 反轉 0802 的決定）');
eq('★★★ 五處插了共用的發票區（發放票券／場租／自主訓練票券／商品／分期）',
   (src.match(/\$\{invFieldsHTML\(\)\}/g)||[]).length, 5);
ok('★★★ 是共用一份，不是各自做一套下拉（舊 id 沒有復活）',
   !/id="(fr-invoice|fv-invoice|ms-invoice|gt-invoice)"/.test(src));
/* ⚠ 2026-09-15 二修：三個入口改成各自的 *InvSync 包裝（金額 0 要把發票區收起來，
   否則 invIssueForPurchase 的 `amt<=0 return null` 會讓櫃檯白問一次載具／信箱）。 */
ok('　　商品銷售（散客買蛋白粉也要能開）', /function msInvSync\(paid\)\{/.test(src));
ok('　　自主訓練票券', /function fvInvSync\(\)\{/.test(src));
ok('　　場地租借（散客，不傳 memberId；先卡位時也不開）', /function frInvSync\(\)\{/.test(src)
   && /try\{ invSync\(\{paid:!window\._frHold && fee>0\}\); \}catch\(_\)\{\}/.test(src));
ok('　　分期的每一期', /function inxInvSync\(\)\{/.test(src)
   && /try\{ invSync\(\{paid:amt>0, memberId:window\._inxMemberId/.test(src));

console.log('\n② 開了就真的開，沒開才記 none');
ok('★★★ 場租／自主訓練票券的 invoice_type 依實際選擇決定，不再寫死 none',
   (src.match(/const inv=\(_inv && _inv\.mode!=='none'\) \? 'ecpay' : 'none';/g)||[]).length===2
   && !/const inv='none';/.test(src));
ok('★★ 商品那筆仍預設 none —— 真的開成功時由 invIssueForPurchase 改寫成 ecpay',
   /invoice_type:'none',installment_count:1,note,operator/.test(src)
   && /invoice_type:'ecpay', invoice_number:rd\.InvoiceNo/.test(src));
ok('★★★ 四個入口都在 closeModal 之前讀表單（關掉之後 DOM 就沒了）',
   (src.match(/const _inv=invReadFields\(\);/g)||[]).length>=4);
ok('　　0802 那段「還沒串聯」的說明已經拿掉（理由消失了）',
   !/發票系統還沒接，欄位留著只是讓櫃檯每次多選一次、而且選了也沒有下文。/.test(src));

console.log('\n③ 首頁 KPI 不要留下「有發票 $0」這種死行');
ok('★ 桌機版：沒有發票金額就不列那一行',
   /\$\{_revInv>0\?`<div class="mc-kpi-rev-sub">有發票 \$\$\{_fm\(_revInv\)\} · 無發票 \$\$\{_fm\(_revNoInv\)\}<\/div>`:''\}/.test(src));
/* 2026-08-08 使用者指示：手機版那一列改成現金／匯款分列（櫃檯要算現金帳），
   發票的拆解留在桌機 KPI 卡上。 */
ok('★ 手機版同樣處理（改列現金／匯款）',
/* 2026-08-24 使用者指示：「這邊現金跟匯款也做成標籤」——手機版那一列原本是灰字
   用「·」串起來，改成與右欄營收卡同一組 .kpay 膠囊。
   ⚠ 2026-08-27：桌機 kpiStrip 上那組已依使用者要求撤掉（右欄營收面板取代），
     這裡改驗仍然留著的 _revCard（手機版在用，那邊沒有右欄面板）。 */
   /_revCash\?`<span class="kpay kpay-cash">現金 \$\$\{_fm\(_revCash\)\}<\/span>`:''/.test(src)
   && /_revBank\?`<span class="kpay kpay-bank">匯款 \$\$\{_fm\(_revBank\)\}<\/span>`:''/.test(src));
ok('　　舊資料還有發票時仍看得到（不是整段砍掉）', /_revInv>0\?/.test(src));
/* 2026-08-03 使用者指示：發票標籤整個移除（付款方式取代其位置，見 revpaytest.js） */
ok('　　營收名單上不再出現「發票」標籤', !/mc-rev-inv">發票/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
