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
/* 2026-08-03「顯示現金還是匯款」：約別與發票之間插了付款方式標籤（見 revpaytest.js） */
ok('★ 首頁右欄名單卡', /\$\{r\.kind\?saleKindChip\(r\.tk,r\.kind\):''\}\s*\n\s*\$\{r\.pay\?[^\n]*\n\s*\$\{r\.inv\?'<span class="mc-rev-inv">發票<\/span>':''\}\s*\n\s*<span class="mc-rev-amt">\$\$\{_fm\(r\.amt\)\}/.test(src));
ok('★ 營收彈窗', /\$\{r\.kind\?saleKindChip\(r\.tk,r\.kind\):''\}\s*\n\s*\$\{r\.pay\?[^\n]*\n\s*\$\{r\.inv\?'<span class="mc-rev-inv">發票<\/span>':''\}\s*\n\s*<span class="mc-rev-amt">\$\{money\(r\.amt\)\}/.test(src));
ok('　　列上帶了票券 id，改的時候才知道改哪一張', /amt:Number\(t\.amount_paid\)\|\|0, tk:t\.id, kind:_saleKindOf\(t\),/.test(src));

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
}

console.log('\n樣式');
ok('★ 續約用品牌金（要看得見，它牽動獎金）', /\.rev-kind-renewal\{background:#f7efe0;color:#8a5e28;/.test(src));
ok('　　新約低調、分期另一色', /\.rev-kind-new\{background:var\(--card2,#F2EEE4\);/.test(src)
   && /\.rev-kind-installment\{background:#efe7f3;/.test(src));
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

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
