/* 2026-08-01 使用者指示：「首頁的營收列表，如果是教練課要顯示分類『新約』『續約』『分期』，
   因為有關續約獎金；這邊也要保留變更彈性，避免輸入時手誤。」

   續約獎金只認 sale_kind='renewal'（見 renewListOf／computeMonthlyPayroll），
   賣票當下按錯就直接影響教練的錢，所以名單上要看得到、而且點得動。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('只有教練課要標');
ok('★ 有分類函式，且非私人教練回 null', /const _saleKindOf=t=>\{/.test(src)
   && /if\(cat!=='私人教練'\) return null;/.test(src));
ok('★ 沒標過的當新約（與獎金口徑一致：只有 renewal 才算續約）',
   /return \(k==='new'\|\|k==='renewal'\|\|k==='installment'\) \? k : 'new';/.test(src));
ok('　　為什麼團課不標，寫在程式裡', /團課與其他類別不標：它們本來就不進續約獎金/.test(src));

console.log('\n兩個畫面都要有（首頁名單卡＋點開的彈窗）');
/* 2026-08-03 三修：發票移除、付款方式可修正、付款方式疊在金額上方（長度才夠） */
/* 2026-08-08：同一格前面多了「30 分鐘退回」鈕（revUndoChip） */
/* 2026-08-13 兩修：①首頁名單卡的約別標籤移到列最左直式（.mc-rev-kv 包 saleKindChip）；
   ②付款標籤已帶金額時隱藏重複粗體金額（revAmtDup 條件包住 mc-rev-amt）；首頁那格前面再多發票鈕 revInvChip */
/* 2026-08-24 版型改版：最左邊那一欄改由 revKindCell 統一畫（新約／續約／分期／抽獎）。 */
/* 2026-09-03：使用者要「圓形鈕」＋「沒有分類的也保留左邊空間」，
   所以 revKindCell 不再回空字串，改回一個空的佔位格（見 tests/revkindtest.js）。
   這裡守的仍是「約別在列最左、由 revKindCell 統一畫」。 */
ok('★ 首頁右欄名單卡（約別標籤在列最左，沒有約別也佔住那一格）',
   /\? `<span class="mc-rev-kv">\$\{saleKindChip\(r\.tk,r\.kind\)\}<\/span>`\s*\n\s*: `<span class="mc-rev-kv mc-rev-kv-none" aria-hidden="true"><\/span>`;/.test(src)
   && /\$\{revKindCell\(r\)\}\s*\n\s*<div class="mc-rev-b">/.test(src)
/* 2026-08-24：抽獎那一列不畫金額（它是 $0 的贈品紀錄，不是收款），
   所以多一個 ||r.lot 的條件。 */
   && /<span class="mc-rev-r">\$\{revInvChip\(r\)\}\$\{revUndoChip\(r\)\}\$\{revPayChip\(r\)\}\$\{\(revAmtDup\(r\)\|\|r\.lot\)\?'':`<span class="mc-rev-amt">\$\$\{_fm\(r\.amt\)\}/.test(src));
ok('★ 營收彈窗也走同一支（約別也在最左邊那一欄）',
   (src.match(/\$\{revKindCell\(r\)\}/g)||[]).length===2
   && /<span class="mc-rev-r">\$\{revUndoChip\(r\)\}\$\{revPayChip\(r\)\}\$\{\(revAmtDup\(r\)\|\|r\.lot\)\?'':`<span class="mc-rev-amt">\$\{money\(r\.amt\)\}/.test(src));
ok('　　列上帶了票券 id，改的時候才知道改哪一張', /amt:_tkDayAmt\(t\), tk:t\.id, kind:_saleKindOf\(t\),/.test(src));   /* 2026-08-15 起金額改用當日實收 */

console.log('\n可以就地更改');
ok('★ 有選擇視窗與寫入函式', /async function openSaleKindPick\(tkId\)\{/.test(src) && /async function setSaleKind\(tkId, kind\)\{/.test(src));
ok('★ 只有櫃檯／管理員點得動（教練看得到但不能改）',
   /const can=\(typeof isDeskLike==='function'\) && isDeskLike\(\);/.test(src)
   && /if\(!isDeskLike\(\)\) return;/.test(src));
ok('★ 點標籤不會連帶觸發整列的「開啟會員票券」', /event\.stopPropagation\(\);openSaleKindPick/.test(src));
ok('★ 視窗有講清楚後果（續約獎金只認「續約」）',
   /<b>續約獎金只認「續約」<\/b>，改了會即時反映在教練的薪資計算上/.test(src));
ok('★ 寫回的是同一個欄位 sale_kind，不另存一份', /t\.sale_kind=kind;\s*\n\s*await dbPut\('member_tickets',t\);/.test(src));
ok('★ 改動有留痕（誰、什麼時候、從什麼改成什麼）',
   /`約別調整：\$\{before\} → \$\{SALE_KIND_LB\[kind\]\}`/.test(src));
ok('　　沒有變更就直接關掉，不寫多餘的紀錄', /if\(t\.sale_kind===kind\)\{ closeModal\(\); return; \}/.test(src));

console.log('\n已退款／作廢的票不算續約（2026-08-02 使用者回報）');
/* 「mango 那筆巫雅雯是新約，不是續約」——
   實情是 8/01 05:25 建了一張 $0 的票並標成續約，15 分鐘後才建正確的 $12,000 新約，
   第一張隨即退掉。但 renewListOf 只看 sale_kind 與購買月份，不看票券狀態，
   於是錢退了、獎金照發。 */
{
  const body=g('function renewListOf(','\n  return out;');
  ok('★ 續約名單會跳過 refunded 的票', /if\(t\.status==='refunded'\) return;/.test(body), body.slice(0,400));
  ok('　　而且擋在「算月份、算課種」之前（先排除無效的票再談其他）',
     body.indexOf("t.status==='refunded'") < body.indexOf("purchase_date"));
  ok('　　原因寫在程式裡', /錢退了獎金卻照發，等於憑一筆不存在的成交付錢。/.test(src));
  ok('　　張數與名單走同一支，所以兩邊一起修好',
     /function renewMapOf\(month, tickets, purchases, bookings, types\)\{\n\s*const list=renewListOf\(/.test(src));
  /* 2026-08-05 使用者回報：手機報表「員工表現」Mango 續約標 1，其實沒有——
     同一張作廢票。8/02 只修了薪資的 renewListOf，報表的 renewMap 與今日營運的 todayRenews
     各自散裝計數，沒排除 refunded。 */
  ok('★ 手機報表「員工表現」的續約數也跳過 refunded',
     /if\(!inRange\(t\.purchase_date\|\|''\) \|\| t\.sale_kind!=='renewal'\) return;\n\s*if\(t\.status==='refunded'\) return;/.test(src));
  ok('★ 今日營運的「今日續約」也跳過 refunded',
     /if\(t\.sale_kind!=='renewal'\) return false;[^\n]*\n\s*if\(t\.status==='refunded'\) return false;/.test(src));
}

console.log('\n樣式');
/* 2026-08-08 使用者指示：「新約跟續約要用金色跟綠色區分」——
   新約＝金（新客人，值得注意）、續約＝綠（既有客人回頭）。原本新約是灰、續約是金。 */
ok('★★ 新約用品牌金', /\.rev-kind-new\{background:#f7efe0;color:#8a5e28;/.test(src));
ok('★★ 續約用綠', /\.rev-kind-renewal\{background:#eef5f1;color:#1f6f54;/.test(src));
ok('　　分期另一色（與前兩者分得開）', /\.rev-kind-installment\{background:#efe7f3;/.test(src));
ok('　　可點的才有 hover 與手指游標', /button\.rev-kind\{cursor:pointer;\}/.test(src));

console.log('\n獎金口徑沒有被動到');
ok('★ 續約獎金仍只認 sale_kind===\'renewal\'',
   (src.match(/sale_kind!=='renewal'/g)||[]).length>=3);

console.log('\n實跑分類');
{
  const TYPES=[{id:'pt',category:'私人教練'},{id:'grp',category:'小班肌力'},{id:'self',category:'自主訓練'},{id:'ms',category:'運動按摩'}];
  /* ⚠ 注入**真的**那一份 TK_GIFT_SRC（不要在這裡寫 {lottery:1,...} 的假貨）——
     假貨就是規則的第二份副本，正式碼那邊加一種來源時這裡不會跟著紅。 */
  const GIFTSRC=(src.match(/const TK_GIFT_SRC=\{[^}]*\};/)||[])[0];
  if(!GIFTSRC) throw new Error('salekindtest：切不到 TK_GIFT_SRC');
  const fn=new Function('types', GIFTSRC+'\n'+g('  const _saleKindOf=t=>{','  };')+'\nreturn _saleKindOf;')(TYPES);
  eq('★ 教練課・標了續約 → renewal', fn({ticket_type_id:'pt',sale_kind:'renewal'}), 'renewal');
  eq('★ 教練課・標了分期 → installment', fn({ticket_type_id:'pt',sale_kind:'installment'}), 'installment');
  eq('★ 教練課・沒標 → 當新約', fn({ticket_type_id:'pt',sale_kind:null}), 'new');
  eq('　　教練課・標成團課（舊資料）→ 也當新約，不會顯示不存在的標籤',
     fn({ticket_type_id:'pt',sale_kind:'group'}), 'new');
  eq('★ 團課 → 不標', fn({ticket_type_id:'grp',sale_kind:'group'}), null);
  eq('　　運動按摩 → 不標', fn({ticket_type_id:'ms',sale_kind:'new'}), null);
  eq('　　票種認不出來 → 不標（寧可少標也不要標錯）', fn({ticket_type_id:'zzz',sale_kind:'renewal'}), null);
  /* 2026-09-01：「抽獎的票不要出現約別」 */
  eq('★★★ 抽獎的教練課票 → 不標（就算舊資料上被寫了 renewal）',
     fn({ticket_type_id:'pt',sale_kind:'renewal',source:'lottery'}), null);
  eq('★★ 補課券 → 不標', fn({ticket_type_id:'pt',sale_kind:'new',source:'makeup'}), null);
  eq('★★ 簽到贈送 → 不標', fn({ticket_type_id:'pt',sale_kind:'new',source:'checkin_grant'}), null);
  eq('★★★ 真的買的照標（排除法沒有誤傷）',
     fn({ticket_type_id:'pt',sale_kind:'renewal',source:'purchase'}), 'renewal');
  eq('★★ 來源是空的也照標（舊資料不能因此變成沒有約別）',
     fn({ticket_type_id:'pt',sale_kind:'renewal',source:null}), 'renewal');
}

console.log('\n分期後續收款列的章與歸屬（2026-08-15 使用者回報：蔡宜芬那筆沒有分期章跟業績歸屬）');
ok('★★ 分期收款列帶那張票的約別章與歸屬（attKind=tk：點了改票券、各期收款一起跟）',
   /const _t=p\.source==='installment'&&p\.ticket_id \? \(mtickets\|\|\[\]\)\.find\(x=>x\.id===p\.ticket_id\) : null;/.test(src)
   && /tk:_t\?_t\.id:undefined, kind:_t\?'installment':undefined,/.test(src)
   && /att:\(_t\?\( p\.coach_id\|\|_t\.sold_by\|\|null\):\(p\.coach_id\|\|null\)\), attKind:\(_t&&_attNeed\(_t\)\)\?'tk':null, attRef:_t\?_t\.id:p\.id,/.test(src));
ok('★ 分期收款寫入時直接蓋教練歸屬（票券的 sold_by）',
   /coach_id:t\.sold_by\|\|null,   \/\* 業績歸屬跟著票券（2026-08-15 蔡宜芬案例） \*\//.test(src));

console.log('\n約別定義二修（2026-08-15 使用者：「第一期屬於續約、後面的期數都算分期」）');
ok('★★ 票券約別照登記（新約/續約），首期列顯示它——沒有分期蓋台',
   !/if\(t\.installment&&typeof t\.installment==='object'\) return 'installment';/.test(src)
   && /第一期屬於續約、後面的期數都算分期/.test(src));
ok('★★ 後續各期收款列一律標「分期」（固定，不讀票券約別）',
   /kind:_t\?'installment':undefined,/.test(src));
ok('★★ 分期續約的續約獎金照算一次（renewListOf 不排除分期票、以票掛購買月）',
   (()=>{ const i2=src.indexOf('function renewListOf');
     const F=src.slice(i2, src.indexOf('\n}\n', i2));
     return !/if\(t\.installment&&typeof t\.installment==='object'\) return;/.test(F)
       && /獎金在購買月成立一次，後續各期不再計/.test(F); })());

/* ══ 2026-08-24 使用者定案：約別盡量交給系統，避免人為多發或少發獎金 ══
   ①「分期基本上是沒問題的…這種儲值就要移除類別選項，避免選錯」
     → 用內建分期功能賣的（期數>1），約別自動判定成分期，整欄不畫。
     ⚠ 自訂方案手動分期（每一期分開儲值）不在此列：資料上看不出是同一份合約的第 N 期。
   ②「續約或分期的標示，要在該會員是有【已完成】的教練課或者友善教練課的方案、
      再次儲值才會出現」
     → 這一條是 0727 高估的解藥（當時「買過同類票就算續約」，推出 38 張、實際 9 張）。 */
console.log('\n約別由系統判定（0824）');
ok('★★ 內建分期：整欄不畫、強制標成分期',
   /function gtSaleKindSync\(\)\{/.test(src)
   && /row\.style\.display=inst\?'none':'';/.test(src)
   && /if\(inst\)\{ sel\.value='installment'; sel\.dataset\.touched=''; \}/.test(src)
   && /約別：<b>分期<\/b>（這張是分期方案，系統自動判定，不需要選）/.test(src));
ok('　　期數一改就跟著（不是只有進到那一步才算一次）',
   /onchange="refreshInstallPreview\(\);refreshGrantVoucher\(\);gtSaleKindSync\(\)"/.test(src));
/* ══ 2026-09-01 使用者定版：約別二選一 ══════════════════════════════
   「該會員只要票券歷史紀錄裡面有教練課或友善教練課，下次儲值就只有分期跟續約的判斷；
     如果都沒有，就只有新約的判斷」

   ⚠ 這放寬了 0824 的「已**完成**的方案才給選」（那條是 0727 高估的解藥）。
     使用者知情後仍定為「有過就算」，代價由「新約消失」來抵：加購／補儲不能再標新約，
     要在續約（計獎金）與分期（不計）之間選。這一欄直接連到教練的錢。 */
console.log('\n約別二選一（0901 定版）');
ok('★★★ 判準只有一支 memHasPtHistory（賣的時候與事後改共用）',
   /async function memHasPtHistory\(mid, exceptTkId, beforeDate\)\{/.test(src)
   && (src.match(/memHasPtHistory\(/g)||[]).length===3);   // 宣告 1 ＋ 兩條路各 1
ok('★★★ 有紀錄 → 新約不列；沒紀錄 → 續約與分期不列',
   /const allow=k=>hasPt\?\(k!=='new'\):\(k==='new'\);/.test(src)
   && /選項直接不列，而不是列出來讓人選了才擋/.test(src));
ok('★★★ 事後改約別同一條規則（少一邊就是一個多領獎金的後門）',
   /const _allow=k=>_hasPt\?\(k!=='new'\):\(k==='new'\);/.test(src));
ok('★★★ 退路退到「還在清單裡的第一個」，不是寫死 new',
   /sel\.value=allow\(cur\)\?cur:\(\(keep\[0\]\|\|\['new'\]\)\[0\]\);/.test(src)
   && /有紀錄的人會被設成一個不在選單裡的值，sel\.value 變空字串/.test(src));
ok('★★★ 條件是「有過」，不再要求上完（0824 那兩行已經不在判斷式裡）',
   !/return \(Number\(x\.sessions_remaining\)\|\|0\)<=0 \|\| x\.status==='used_up';/.test(src));
ok('★★★ 共享票要算（爸爸用兒子共享的票上完課也是紀錄）',
   /if\(!x \|\| \(exceptTkId && x\.id===exceptTkId\) \|\| !tkUsableBy\(x, mid\)\) return false;/.test(src));
ok('★★★ 折抵券不算（它掛在「私人教練」底下，但抽到一張 \$300 券不是上過教練課）',
   /if\(bkIsPtVoucherType\(ty\)\) return false;/.test(src)
   && /抽獎抽到一張 \$300 券\s*\n\s*不是「上過教練課」/.test(src));
ok('★★ 只認教練課系（體驗、運動按摩、團課、自主訓練都不算）',
   /if\(!ty \|\| ty\.category!=='私人教練'\) return false;/.test(src)
   && /體驗課的人確實是第一次簽約/.test(src));
ok('★★ 退費作廢的不算（那不是紀錄，是拿回去了）',
   /if\(x\.status==='refunded'\) return false;/.test(src));

/* 2026-09-01 使用者：「抽獎的票不要出現約別」——
   順著同一條理由，送的／補的也不算「這位買過教練課」。 */
ok('★★★ 送的、補的不算買過（抽獎／補課券／簽到贈送）',
   /const TK_GIFT_SRC=\{lottery:1, makeup:1, checkin_grant:1\};/.test(src)
   && /if\(TK_GIFT_SRC\[String\(x\.source\|\|''\)\]\) return false;   \/\/ 抽獎／補課券／簽到贈送不算/.test(src));
ok('★★★ 抽獎票不畫約別章（_saleKindOf 回 null）',
   /if\(TK_GIFT_SRC\[String\(t\.source\|\|''\)\]\) return null;/.test(src)
   && /抽獎的票不要出現約別/.test(src));
ok('★★★ 事後改約別也擋掉，而且寫出原因（不是靜靜什麼都不做）',
   /if\(TK_GIFT_SRC\[String\(t\.source\|\|''\)\]\)\{/.test(src)
   && /這張是<b>\$\{_lb\}<\/b>，沒有約別。/.test(src)
   && /它不是一筆成交，所以不算新約也不算續約，續約獎金與新／續統計都不會計入。/.test(src));
ok('★★ 用排除法不用白名單（來源多一種或舊資料是空的，預設仍算數）',
   /用排除法而不是白名單/.test(src)
   && /漏認一筆會讓老客戶被迫標新約，那比多認一筆難發現/.test(src));
ok('　　三種來源的名字都寫出來（訊息不能只說「贈送」）',
   /const _lb=\{lottery:'抽獎獎品', makeup:'補課券', checkin_grant:'簽到贈送'\}/.test(src));
ok('★★ 事後改要看「買這張之前」的紀錄（否則這張自己也會被算進去）',
   /if\(beforeDate && String\(x\.purchase_date\|\|''\)\.slice\(0,10\)>beforeDate\) return false;/.test(src)
   && /const _hasPt=await memHasPtHistory\(t\.member_id, t\.id, String\(t\.purchase_date\|\|''\)\.slice\(0,10\)\);/.test(src));
ok('　　賣票是「現在」，不帶界線也不排除任何票',
   /const _hasPt=await memHasPtHistory\(mid\);/.test(src));
ok('★★ 兩邊都不准再用 member_id 直接比（那是 0831/0901 修掉的共享票 bug）',
   !/x\.member_id!==t\.member_id/.test(src) && !/if\(!t \|\| t\.member_id!==mid\) return false;/.test(src));
ok('★★ 不能選的時候要寫原因，兩個方向都要寫（0823 語彙）',
   /這位已經有教練課／友善教練課的紀錄，所以不是新約 —— 請選續約或分期（分期不計續約獎金）。/.test(src)
   && /這位還沒有教練課／友善教練課的紀錄，所以只能是新約/.test(src)
   && /這位在買這張之前<b>已經有<\/b>教練課／友善教練課的紀錄/.test(src));
ok('★★ 事後改的視窗要寫出「目前是什麼」（新約可能已經不在選項裡了）',
   /目前：<b>\$\{SALE_KIND_LB\[t\.sale_kind\]\|\|'（未標）'\}<\/b>/.test(src));
ok('★★ 0824 那段沿革留在原地（下一個人要知道為什麼放寬）',
   /這條放寬了 0824 的「已\*\*完成\*\*的方案才給選」/.test(src)
   && /推出 38 張、實際只有 9 張的高估/.test(src));

ok('★★ 分期方案的約別事後也不給改（不然是多領獎金的後門）',
   /if\(t\.installment && typeof t\.installment==='object'\)\{/.test(src)
   && /這張是<b>分期方案<\/b>，約別由系統判定為「分期」，不能更改。/.test(src));
/* 「不能選就寫原因」那一條已經改寫在上面的 0901 區塊（兩個方向都要寫），
   這裡不再重複釘同一件事。 */

/* ══ 2026-09-05 使用者指示：約別只給「私人教練」══════════════════════════
   「運動按摩不需要約別」「而且我看到約別裡面有團課 購買團課也不需要約別」

   這其實是把畫面補回程式本來就有的規則：_saleKindOf 對 category!=='私人教練'
   一律回 null，所以運動按摩／自主訓練／體驗／團課標了約別也讀不出來、也不計獎金。
   舊的 'group' 選項更慘 —— SALE_KIND_LB 裡沒有它，存進去的票在約別章上顯示
   「（未標）」，純粹是髒資料。 */
console.log('\n約別只給教練課（0905 定版）');
ok('★★★ 團課選項整個移除（SALE_KIND_LB 沒有 group，存了也讀不出來）',
   !/<option value="group">團課<\/option>/.test(src)
   && !/sel\.value='group'/.test(src)
   && /const SALE_KIND_LB=\{new:'新約', renewal:'續約', installment:'分期'\};/.test(src));
ok('★★★ 判準與 _saleKindOf／_attNeed 同一條：category==="私人教練"',
   /function gtSaleKindNeed\(\)\{/.test(src)
   && /return cat\?\(cat==='私人教練'\):true;/.test(src));
ok('★★★ 讀不到類別時維持顯示（漏標會少算續約獎金，寧可多問一次）',
   /寧可多問一次，\n\s*也不要因為一次載入失敗就把該標的約別默默漏掉/.test(src));
ok('★★★ 收起來的時候要清空值，不能留看不見卻有值的下拉',
   /sel\.value=''; sel\.dataset\.touched='';\n\s*return;/.test(src)
   && /submitGrant 讀 value\|\|null/.test(src));
ok('★★ 換方案就重判（類別戳在 dataset.cat 上，refreshGrantInfo 那裡本來就算好 cat）',
   /_sk\.dataset\.cat=cat; gtSaleKindSync\(\);/.test(src));
ok('★★ 進第二步那條非同步線也要自己收一次，而且排在 Opts 後面',
   /gtSaleKindOpts\(_hasPt\);\n\s*gtSaleKindSync\(\);/.test(src)
   && /if\(!gtSaleKindNeed\(\)\) return;/.test(src));

/* 實跑：把兩支函式切出來，配假 DOM 走一遍四種類別 —— 正則只證明字面，
   證不了「按鈕真的收起來、值真的清掉」。 */
(function(){
  const cut=n=>{ const i=src.indexOf(`function ${n}(){`); if(i<0) throw new Error('切不到 '+n);
    let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} } };
  const els={};
  const mk=id=>els[id]={id,style:{display:''},dataset:{},value:''};
  ['gt-salekind-row','gt-salekind-auto','gt-salekind-hint','gt-salekind','gt-install'].forEach(mk);
  const document={getElementById:id=>els[id]||null};
  const fn=new Function('document',`${cut('gtSaleKindNeed')}\n${cut('gtSaleKindSync')}\nreturn {gtSaleKindNeed,gtSaleKindSync};`)(document);

  const run=(cat,inst)=>{ els['gt-salekind'].dataset.cat=cat; els['gt-salekind'].value='renewal';
    els['gt-install'].value=String(inst||1); fn.gtSaleKindSync();
    return {row:els['gt-salekind-row'].style.display, hint:els['gt-salekind-hint'].style.display,
            auto:els['gt-salekind-auto'].style.display, val:els['gt-salekind'].value}; };

  let r=run('運動按摩'); ok('★★★ 實跑・運動按摩 → 整欄收起來且值清空（使用者原話）',
    r.row==='none' && r.hint==='none' && r.auto==='none' && r.val==='');
  r=run('小班肌力'); ok('★★★ 實跑・團課 → 一樣收起來（0905 補上）',
    r.row==='none' && r.val==='');
  ['自主訓練','體驗'].forEach(c=>{ const x=run(c);
    ok(`★★ 實跑・${c} → 收起來`, x.row==='none' && x.val===''); });
  r=run('私人教練'); ok('★★★ 實跑・教練課 → 照畫，值不動（這一欄連著續約獎金）',
    r.row==='' && r.hint==='' && r.auto==='none' && r.val==='renewal');
  r=run('私人教練',3); ok('★★★ 實跑・教練課＋分期 → 收成自動判定那一行（0824 規則沒被打壞）',
    r.row==='none' && r.auto==='' && r.hint==='none' && r.val==='installment');
  r=run('',1); ok('★★★ 實跑・類別讀不到 → 照畫（退路不能是默默不標）',
    r.row==='' && r.val==='renewal');
})();

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
