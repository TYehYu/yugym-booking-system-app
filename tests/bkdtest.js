/* 預約明細的票券圓點與「本堂第幾堂」（2026-07-29 使用者回報：張正怡）
   她的 7 堂 1V2 實際只剩 2 堂（7/30、8/6），卡片卻標「本堂 第 1／7 堂」＋5 顆空心。
   成因：直接綁到票券時，已用堂數只數「清單裡的出席筆數」，
   而匯入會員的歷史課沒有逐筆預約 → 已核銷的堂數整個消失，看起來像全新的票。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${a}，預期 ${e}`);

// 抽出修好的已用堂數算式（直接綁票券那條路）
const i=src.indexOf('const doneCount=_tkInferred ? _inferDone : (function(){');
if(i<0) throw new Error('找不到 doneCount 算式');
const body=src.slice(src.indexOf('(function(){',i), src.indexOf('})();',i)+5);
const calc=new Function('tkBks2','tkC','total', 'return '+body+';');

const BK=(st,date)=>({status:st,date,start_time:'16:00'});

console.log('已用堂數＝max(清單出席, 帳面已用−已預約)');
/* 張正怡：7 堂票、帳面剩 2、歷史 5 堂沒有逐筆紀錄。
   補綁前那 2 筆預約沒綁到票（ticket_id 為 null），所以根本不在清單裡 → 清單是空的。 */
eq('★ 張正怡（補綁前：剩 2、預約還沒綁到票）',
   calc([],{sessions_remaining:2},7), 5);
// 補綁後帳面變 0，但那 2 堂已被扣過 → 已用仍是 5，位置不變
eq('★ 張正怡（補綁後：剩 0、同樣 2 筆已預約）',
   calc([BK('booked','2026-07-30'),BK('booked','2026-08-06')],{sessions_remaining:0},7), 5);

console.log('\n其他情境不受影響');
eq('全新票（剩＝總、無預約）→ 0', calc([],{sessions_remaining:8},8), 0);
eq('逐筆完整的票（4 堂上完 3）→ 3',
   calc([BK('completed','2026-07-01'),BK('completed','2026-07-08'),BK('checked_in','2026-07-15'),
         BK('booked','2026-07-22')],{sessions_remaining:1},4), 3);
eq('清單出席數比帳面多時以清單為準（帳面沒跟上）',
   calc([BK('completed','2026-07-01'),BK('completed','2026-07-08')],{sessions_remaining:4},4), 2);
eq('餘額欄壞掉（null）→ 退回只數清單',
   calc([BK('completed','2026-07-01')],{sessions_remaining:null},5), 1);
eq('不會超過總堂數', calc([],{sessions_remaining:-3},4), 4);
eq('不會變負數', calc([BK('booked','2026-08-01')],{sessions_remaining:9},5), 0);

console.log('\n圓點渲染吃得到這個數字');
ok('★ doneCount 傳給 ticketTokens', /ticketTokens\(tkC,tkBks2,_typeMapD,doneCount,b\.id\)/.test(src));
ok('★ 已用堂數多於清單時，多出來的畫實心 ✓（沒有日期可標）',
   /const b=di<done\.length\?done\[di\+\+\]:null;/.test(src) && /\$\{b\?md\(b\):'✓'\}/.test(src));
ok('　　「本堂第幾堂」與圓點位置同源', /curIdx=_bi>=0\?doneCount\+_bi:-1/.test(src));

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

/* ── 會員票券：預約了但還沒上，不該被收進「歷史紀錄」（2026-07-29 使用者指示） ── */
console.log('\n會員票券的歷史紀錄判定');
const hs=src.slice(src.indexOf('const tkUsedCount=(t)=>{'), src.indexOf('  // 票券卡片渲染（圓圈進度）'));
const mk=(usedDates,bkByTk)=>new Function('usedDates','inferByTk','bkByTk','_grpTkNewest','_grpPending', hs+'\nreturn tkUsedCount;')(usedDates||{},{},bkByTk||{},null,0);
const BKD=n=>Array.from({length:n},()=>({status:'booked'}));

eq('★ 四堂全約完但一堂都還沒上 → 已上 0（不是 4）',
   mk({},{t:BKD(4)})({id:'t',sessions_total:4,sessions_remaining:0}), 0);
eq('　　上完兩堂、另兩堂已約 → 已上 2',
   mk({t:['2026-08-04','2026-08-11']},{t:BKD(2)})({id:'t',sessions_total:4,sessions_remaining:0}), 2);
eq('　　全部上完（沒有待上的預約）→ 已上 4',
   mk({t:['a','b','c','d']},{})({id:'t',sessions_total:4,sessions_remaining:0}), 4);

ok('★ 歷史判定改看「已上堂數」而非只看剩餘',
   /if\(total>0 && tkUsedCount\(t\)<total\) return false;/.test(src));
ok('★ 卡片圓點與歷史判定用同一個數字（不會出現空心圓卻被收進歷史）',
   /const usedCount = tkUsedCount\(t\);/.test(src));
ok('　　過期票仍照原規則歸類（不被新規則攔截）',
   /if\(_isExpiredTk\(t\)\) return false;[\s\S]{0,260}if\(t\.expire_date&&String\(t\.expire_date\)\.slice\(0,10\)<_todayYmd2\) return true;/.test(src));
ok('　　已退款的票仍算歷史', /if\(t\.status==='refunded'\) return true;/.test(src));

console.log('\n後台會員檔案的票券分頁也要同一套判準');
ok('★ 已上堂數抽成 usedOf()，卡片與歷史判定共用', /const usedOf=t=>\{/.test(src)
   && /const used=usedOf\(t\);/.test(src));
ok('★ 歷史判定先看已上堂數', /if\(total>0 && usedOf\(t\)<total\) return false;/.test(src));
ok('★ 團課待上堂數另外算（團課預約不綁 ticket_id）',
   /const _grpPendingP=\(\(\)=>\{/.test(src) && /const _grpPending=\(\(\)=>\{/.test(src));
ok('　　只算新制預約（BK- 開頭），匯入的舊預約不重複扣',
   (src.match(/String\(b\.id\|\|''\)\.indexOf\('BK-'\)!==0\) return;/g)||[]).length===2);
ok('　　待上堂數只從最近買的那張團課票扣',
   /_grpTkNewest && t\.id===_grpTkNewest\.id/.test(src) && /_grpNewestP && t\.id===_grpNewestP\.id/.test(src));
ok('　　已簽到就算真的用掉了，且改逐名額判斷（2026-07-30 名額鍵）',
     (src.match(/if\(at\[seen\[[a-zA-Z]+\]>1\?[a-zA-Z]+\+'#'\+seen\[[a-zA-Z]+\]:[a-zA-Z]+\]==='checked_in'\) return;/g)||[]).length>=2);
ok('★ 後台檔案頁的預約清單要含團課（學員在 member_ids、member_id 是 null）',
   /const myBk=bookings\.filter\(b=>b\.member_id===PP\.id\s*\n\s*\|\| \(Array\.isArray\(b\.member_ids\)&&b\.member_ids\.includes\(PP\.id\)\)\);/.test(src));

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
ok('　　私人教練／團課／體驗都不再重複顯示下方那組場地',
   /\$\{\(!isPersonalPT&&!isGroupD&&!isTrialD&&!isMemberView\)\?/.test(src));

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
