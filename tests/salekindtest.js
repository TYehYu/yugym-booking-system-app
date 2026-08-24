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
ok('★ 首頁右欄名單卡（約別標籤在列最左、直式）',
   /return r\.kind\?`<span class="mc-rev-kv">\$\{saleKindChip\(r\.tk,r\.kind\)\}<\/span>`:'';/.test(src)
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
  const fn=new Function('types', g('  const _saleKindOf=t=>{','  };')+'\nreturn _saleKindOf;')(TYPES);
  eq('★ 教練課・標了續約 → renewal', fn({ticket_type_id:'pt',sale_kind:'renewal'}), 'renewal');
  eq('★ 教練課・標了分期 → installment', fn({ticket_type_id:'pt',sale_kind:'installment'}), 'installment');
  eq('★ 教練課・沒標 → 當新約', fn({ticket_type_id:'pt',sale_kind:null}), 'new');
  eq('　　教練課・標成團課（舊資料）→ 也當新約，不會顯示不存在的標籤',
     fn({ticket_type_id:'pt',sale_kind:'group'}), 'new');
  eq('★ 團課 → 不標', fn({ticket_type_id:'grp',sale_kind:'group'}), null);
  eq('　　運動按摩 → 不標', fn({ticket_type_id:'ms',sale_kind:'new'}), null);
  eq('　　票種認不出來 → 不標（寧可少標也不要標錯）', fn({ticket_type_id:'zzz',sale_kind:'renewal'}), null);
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
ok('★★ 沒有「已完成的教練課系方案」→ 續約與分期整個不列出來',
   /function gtSaleKindOpts\(donePt\)\{/.test(src)
   && /const allow=k=>\(k==='new'\|\|k==='group'\)\?true:!!donePt;/.test(src)
   && /選項直接不列，而不是列出來讓人選了才擋/.test(src));
ok('★★ 「已完成」以餘額為準、順帶認 used_up；退費的不算',
   /return \(Number\(t\.sessions_remaining\)\|\|0\)<=0 \|\| t\.status==='used_up';/.test(src)
   && /if\(t\.status==='refunded'\) return false;/.test(src)
   && /狀態會跟餘額打架，餘額才是真的/.test(src));
ok('★★ 只認教練課系（category 私人教練）——團課不受影響',
   /if\(\(tm\[t\.ticket_type_id\]\|\|\{\}\)\.category!=='私人教練'\) return false;   \/\/ 教練課／友善教練課/.test(src));
ok('★★ 賣的時候擋、事後也要擋（只擋一邊等於留了一個改成續約的後門）',
   /const _allow=k=>\(k==='new'\)\?true:_donePt;/.test(src)
   && /只擋一邊等於留了一個把新約改成續約的後門/.test(src));
ok('★★ 事後判斷要看「買這張之前」有沒有上完的（否則這張自己就是還沒上完）',
   /if\(_buy && String\(x\.purchase_date\|\|''\)\.slice\(0,10\)>_buy\) return false;   \/\/ 之後才買的不算/.test(src)
   && /if\(!x \|\| x\.id===t\.id \|\| x\.member_id!==t\.member_id\) return false;/.test(src));
ok('★★ 分期方案的約別事後也不給改（不然是多領獎金的後門）',
   /if\(t\.installment && typeof t\.installment==='object'\)\{/.test(src)
   && /這張是<b>分期方案<\/b>，約別由系統判定為「分期」，不能更改。/.test(src));
ok('★ 不能選的時候要寫原因（0823 的語彙）',
   /這位還沒有上完的教練課方案，所以只能是新約/.test(src)
   && /續約與分期要等上一份用完才會出現/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
