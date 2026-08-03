/* 預約明細的票券圓點與「本堂第幾堂」（2026-07-29 使用者回報：張正怡）
   她的 7 堂 1V2 實際只剩 2 堂（7/30、8/6），卡片卻標「本堂 第 1／7 堂」＋5 顆空心。
   成因：直接綁到票券時，已用堂數只數「清單裡的出席筆數」，
   而匯入會員的歷史課沒有逐筆預約 → 已核銷的堂數整個消失，看起來像全新的票。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${a}，預期 ${e}`);

/* 2026-08-01 使用者回報（附截圖）：「為什麼明細這邊又跟會員票券不一樣了」
   「會員票券那邊正確了，我們不是從會員票券這邊拉圓形卡過來用的嗎」——
   預約明細原本自己算已用堂數（那正是分岔的來源），現在整段改問票券夾。
   逐案的已用堂數驗證統一在 utest.js／wallettest.js（那是票券夾自己的測試）。 */
console.log('明細的票券卡改由票券夾供應');
ok('★ 本堂蓋在哪張票上、蓋了哪些戳記、已用幾堂，三個答案都問票券夾',
   /const W=buildWallet\(b\.member_id,_wctxD\);/.test(src)
   && /_wSlotD = W\.ticketOf\(b\.id\) \|\| \(b\.ticket_id\?W\.of\(b\.ticket_id\):null\);/.test(src)
   && /const tkBks2=_wSlotD\?_wSlotD\.stamps:\[\];/.test(src)
   && /const doneCount=_wSlotD\?_wSlotD\.used:0;/.test(src));
ok('★ 原本那一整套推估（先進先出 → 以本堂為中心的視窗 → 三種已用口徑）已退場',
   !/const doneCount=_tkInferred \? _inferDone/.test(src)
   && !/_tkInferred/.test(src)
   && !/以本堂為中心取一個剛好 total 長的視窗/.test(src));
/* 2026-08-04：備援票也要回票券夾撈 slot（分期保留課的圓形卡才有日期） */
ok('　　票券夾也蓋不到（舊系統匯入/分期保留）才退回原本的挑票法，且備援票補撈戳記',
   /_tkCard=findRefundTargetTicket\(_wctxD\.tickets,b\.member_id,b\.ticket_type_id,b\.category,b\.format\);\n\s*if\(_tkCard\)\{ try\{ _wSlotD=W\.of\(_tkCard\.id\)\|\|null; \}catch\(_\)\{\} \}/.test(src));
ok('　　使用者的原話寫在程式裡', /我們不是從會員票券這邊拉圓形卡過來用的嗎/.test(src));

console.log('\n圓點渲染吃得到這個數字');
ok('★ doneCount 傳給 ticketTokens（2026-08-01 起多帶使用人，用來標「會員自行預約」）',
   /ticketTokens\(tkC,tkBks2,_typeMapD,doneCount,b\.id,b\.member_id,_wSlotD&&_wSlotD\.selfBk\)/.test(src));
ok('★ 已用堂數多於清單時，多出來的畫實心 ✓（沒有日期可標）',
   /const b=di<done\.length\?done\[di\+\+\]:null;/.test(src) && /\$\{b\?md\(b\):'✓'\}/.test(src));
ok('　　「本堂第幾堂」與圓點位置同源', /curIdx=_bi>=0\?doneCount\+_bi:-1/.test(src));
/* 2026-08-01：票券夾的已用堂數也要涵蓋「蓋上戳記且已簽到」的課 ——
   ticketTokens 是「前 used 格填已完成的課」，used 比戳記少那幾堂就整個畫不出來
   （使用者看到的「本堂沒有圓點」）。 */
ok('★ 票券夾的已用堂數涵蓋已簽到的戳記（否則最後那幾堂畫不出來）',
   /const attIn=bks\.filter\(isAtt\)\.length;/.test(src)
   && /Math\.max\(dAtt, attIn, Math\.max\(0, total-\(Number\(rem\)\|\|0\)-pending\)\)/.test(src));
ok('　　課比票多時保留最近的幾堂（本堂才不會落在圓點之外）',
   /if\(_cap>0 && feed\.length>_cap\) feed=feed\.slice\(feed\.length-_cap\);/.test(src));

console.log('\n繳費／續約提醒統一在右上角');
ok('★ 徽章改到右上', /\.ev-payalert\{position:absolute;top:2px;right:3px;left:auto;/.test(src));
ok('★ 判準抽成共用函式，桌機與手機同一套', /function computeLastBkMarks\(allTickets, bookings, typeMap\)\{/.test(src));
ok('　　桌機行事曆改呼叫它', /computeLastBkMarks\(allTickets, bookings, typeMap\);/.test(src));
ok('　　手機端週課表也算', /computeLastBkMarks\(_tkAll, bookings, Object\.fromEntries/.test(src));
ok('★ 手機端課卡渲染徽章', /const _mk = \(layer==='mine'\|\|isAdmin\)/.test(src));
ok('　　別人的課卡不顯示（不外洩誰快用完票）',
   /const _mk = \(layer==='mine'\|\|isAdmin\)[\s\S]{0,400}: '';/.test(src));
ok('　　簽到章在右下，不會跟徽章打架',
   /\.cal-ev\.cal-ev-std \.evc-check\{position:absolute;top:auto;left:auto;bottom:0;right:0;/.test(src));

/* ── 會員票券：預約了但還沒上，不該被收進「歷史紀錄」（2026-07-29 使用者指示） ──
   2026-07-31：已上堂數的算式搬進票券夾（buildWallet），逐案驗證移到 utest.js／wallettest.js，
   這裡只驗「兩個畫面都問同一個數字」。 */
console.log('\n會員票券的歷史紀錄判定');
ok('★ 歷史判定改看「已上堂數」而非只看剩餘',
   /else if\(total>0 && used<total\) state='active';/.test(src));
ok('★ 卡片圓點與歷史判定用同一個數字（不會出現空心圓卻被收進歷史）',
   /const usedCount = tkUsedCount\(t\);/.test(src)
   && /const tkUsedCount=\(t\)=>\(\(WAL\.of\(t\.id\)\|\|\{\}\)\.used\)\|\|0;/.test(src)
   && /const circles=ticketTokens\(t,WAL\.stampsOf\(t\.id\),typeMap,usedCount,null,member_id,WAL\.selfBk\);/.test(src));
ok('　　過期票仍照原規則歸類（不被新規則攔截）',
   /else if\(t\.expire_date && String\(t\.expire_date\)\.slice\(0,10\)<today\) state='expired';/.test(src)
   && /const _isExpiredTk=t=>\(\(WAL\.of\(t\.id\)\|\|\{\}\)\.state\)==='expired';/.test(src));
ok('　　已退款的票仍算歷史', /if\(t\.status==='refunded'\) state='history';/.test(src));

console.log('\n後台會員檔案的票券分頁也要同一套判準');
/* 2026-07-31 二修：後台票券分頁改從票券夾拿（buildWallet），已上堂數與三區判定同一份 */
ok('★ 已上堂數與三區判定同一份（票券夾）',
   /const usedOf=t=>\(WAL\.of\(t\.id\)\|\|\{\}\)\.used\|\|0;/.test(src)
   && /const used=sl\.used;/.test(src));
ok('★ 歷史判定先看已上堂數', /else if\(total>0 && used<total\) state='active';/.test(src)
   && /return \(\(WAL\.of\(t\.id\)\|\|\{\}\)\.state\)==='history';/.test(src));
/* 2026-07-31：兩處的「團課待上堂數」改吃 grpTicketAlloc（扣課紀錄），細節見 grpalloctest.js */
/* 2026-08-01：預約明細的團課名單改問票券夾之後，它自己那一次 grpTicketAlloc 呼叫退場，
   全檔只剩「定義」與「票券夾裡的那一次」—— 這正是收斂成單一來源的意思。 */
ok('★ 團課待上堂數只算一次（票券夾裡），不再各畫面各算各的',
   (src.match(/grpTicketAlloc\(/g)||[]).length===2
   && /const ga=grpTicketAlloc\(mine, live, c\.logs\|\|\[\], memberId, \(\)=>true\);/.test(src));
ok('　　兩個後台畫面都吃同一支',
   /const pending=bks\.filter\(b=>b\.ticket_id===t\.id && b\.status==='booked'\)\.length \+ \(ga\.pend\[t\.id\]\|\|0\);/.test(src));
/* 2026-07-31 二修：「這位會員的課卡」抽成共用的 bkHasMember／bkOfMember，
   原本這個判斷被抄在九個地方，漏改其中幾處就會整批漏掉團課 */
ok('★ 後台檔案頁的預約清單要含團課（學員在 member_ids、member_id 是 null）',
   /const myBk=bkOfMember\(bookings, PP\.id\);/.test(src)
   && /return String\(b\.member_id\|\|''\)===String\(mid\) \|\| mids\(b\)\.some\(x=>String\(x\)===String\(mid\)\);/.test(src));

/* ── 預約明細版面順序（2026-07-29 使用者指示） ── */
console.log('\n預約明細：教練與場地在時間下面、圓形卡上面');
{
  // 錨在明細視窗那一段（bkd-timeedit 只出現在這裡），不要抓到卡片內嵌編輯表單
  const i=src.indexOf('<span class="bkd-timeedit">');
  const j=src.indexOf('</div>`:`', i);
  const blk=src.slice(i,j);
  const pDate=blk.indexOf('id="ed-dur"');
  const pCoach=blk.indexOf('>教練<');
  const pVenue=blk.indexOf('>場地<');
  const pDots=blk.indexOf('${tkCircleHtml}');
  ok('★ 教練排在時間之後', pCoach>pDate, {pDate,pCoach});
  ok('★ 場地排在教練之後', pVenue>pCoach, {pCoach,pVenue});
  ok('★ 圓形卡排在教練與場地之後', pDots>pVenue, {pVenue,pDots});
  ok('　　會員視角不顯示場地（內部資訊）', /\$\{isMemberView\?'':`<div[\s\S]{0,120}>場地</.test(blk));
}
/* 2026-07-31 使用者指示：體驗的場地也重複了 → 下方那組再排除 isTrialD（團課本來就排除） */
/* 2026-08-03 排列定版：下方那組場地整個退場（各分支第四列各自一個） */
ok('　　所有課種都不再重複顯示下方那組場地', !/\$\{\(!isPersonalPT&&!isGroupD&&!isTrialD&&!isMemberView\)\?/.test(src));

/* 所有預約都能自己選票券（2026-07-30 使用者指示）——
   會員同時有長期方案與快到期的優惠票時，自動挑選未必是客人要的。 */
console.log('\n每個扣票的地方都能選票券');
ok('★ 會員端自主訓練：多張點數出下拉，預設最快到期（受限的先用）',
   /function msbTkCand\(time\)\{/.test(src) && /<select id="msb-tk-sel"/.test(src)
   && /const ra=tkIsTimeRestricted\(a\)\?0:1, rb=tkIsTimeRestricted\(b\)\?0:1;[\s\S]{0,200}9999-12-31/.test(src));
ok('　　只列該時段能用的（友善點 18:00 後不列）', /\.filter\(t=>!time \|\| tkTimeOk\(t,s\.date,time\)\)/.test(src));
ok('　　送出時用選的那張，失效才退回自動挑選',
   /const _sel=\(document\.getElementById\('msb-tk-sel'\)\|\|\{\}\)\.value\|\|s\.pickTk\|\|null;/.test(src)
   && /const tk=_cand\.find\(x=>x\.id===_sel\)\|\|_cand\[0\]\|\|null;/.test(src));
ok('　　換時段會重挑（候選會變）', /s\.pickTk=null;\s+\/\/ 換時段重挑/.test(src));
ok('★ 轉正簽約：兩張以上先問要扣哪一張',
   /async function doConvertPending\(memberId, tkId\)\{/.test(src)
   && /if\(!tkId && cand\.length>1\)\{/.test(src));
ok('★ 既有預約可事後更換票券', /async function openBkTicketChange\(id\)\{/.test(src)
   && /onclick="openBkTicketChange\('\$\{b\.id\}'\)"/.test(src));
ok('　　只給櫃檯／管理員、且限還沒簽到的預約',
   /已簽到的預約要先取消簽到才能換票券/.test(src)
   && /b\.status==='booked'&&b\.category!=='小班肌力'&&isDeskLike\(\)/.test(src));
ok('　　換票＝退舊扣新，兩邊都留票券紀錄',
   /await deductTicket\(tk,b\.id,SESSION\.id\);[\s\S]{0,300}refundTicket\(old,b\.id,SESSION\.id\)/.test(src));
ok('　　先扣新再退舊：中途失敗寧可重複扣也不憑空少扣，並提示人工處理',
   /先扣新的再退舊的/.test(src) && /新票已扣，但原票退回失敗，請手動調整/.test(src));
ok('　　沒有其他可用票券時明講', /沒有其他可用票券可以換。/.test(src));
ok('　　不會踩到 isGroupD 的 TDZ（宣告在這行之後）',
   /isGroupD 在這行之後才宣告（const，TDZ）/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
