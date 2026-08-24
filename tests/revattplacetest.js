/* 2026-08-07 使用者指示（今日營收／收款名單的業績歸屬標籤）：
   「團課不需要設定歸屬，只有教練課跟友善教練課。然後歸屬教練放在會員姓名上方。」

   在此之前：每一列都掛歸屬標籤，團課 4週優惠、團課體驗、自訂方案（都掛在小班肌力底下）
   全部顯示金色的「未歸屬」，看起來像漏設定；標籤又貼在姓名右邊，長姓名會把它擠掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 只有教練課系要標歸屬');
{
  const m=/const _attNeed=(.+);/.exec(src);
  ok('★ 判斷式存在', !!m);
  const fn=new Function('types', 'const _attNeed='+m[1]+'; return _attNeed;')([
    {id:'tt-pt',   category:'私人教練'},
    {id:'tt-fr',   category:'私人教練'},
    {id:'tt-lim',  category:'私人教練'},
    {id:'tt-grp',  category:'小班肌力'},
    {id:'tt-self', category:'自主訓練'},
    {id:'tt-mas',  category:'運動按摩'},
    {id:'tt-trial',category:'體驗'},
  ]);
  ok('★ 教練課 → 要標', fn({ticket_type_id:'tt-pt'})===true);
  ok('★ 友善教練課 → 要標', fn({ticket_type_id:'tt-fr'})===true);
  ok('　　限定教練課（舊制，同屬私人教練）→ 也標', fn({ticket_type_id:'tt-lim'})===true);
  ok('★★ 團課（含團課體驗、掛在團課底下的自訂方案）→ 不標', fn({ticket_type_id:'tt-grp'})===false);
  ok('★ 自主訓練 → 不標', fn({ticket_type_id:'tt-self'})===false);
  ok('　　運動按摩 → 不標', fn({ticket_type_id:'tt-mas'})===false);
  ok('　　體驗 → 不標', fn({ticket_type_id:'tt-trial'})===false);
  ok('　　票種查不到 → 不標（寧可少標也不要亂標）', fn({ticket_type_id:'tt-???'})===false);
  ok('★ 與約別標籤同一條規則（都看 category 是不是私人教練）',
     /if\(cat!=='私人教練'\) return null;                      \/\/ 只有教練課系要標/.test(src));
}

console.log('\n② 接到列表上');
ok('★ 票券列：要標才給 attKind', /attKind:_attNeed\(t\)\?'tk':null,/.test(src));
ok('★ 純收款列（場租／商品／票券重啟）一律不標（2026-08-15 起分期收款例外：章與歸屬跟票券走）', /att:\(_t\?\( p\.coach_id\|\|_t\.sold_by\|\|null\):\(p\.coach_id\|\|null\)\), attKind:\(_t&&_attNeed\(_t\)\)\?'tk':null, attRef:_t\?_t\.id:p\.id,/.test(src));
ok('　　沒有 attKind 就不畫標籤（既有防線）', /if\(!r \|\| !r\.attKind\) return '';/.test(src));

console.log('\n③ 標籤放在會員姓名上方');
{
/* 2026-08-24 使用者定案（版型改版）：「最左邊獨立一欄直式卡片 新約 續約 分期 抽獎；
   第二欄調成兩列，第一列 會員姓名靠左、教練標籤靠右；第二列 購買品項靠左、金額靠右；
   金額又有現金跟匯款，如果同時出現則要再分成兩列」——
   歸屬標籤從「姓名上方自成一列」改成「與姓名同一列、靠右」。 */
  const rows=(src.match(/<div class="rv-r1">/g)||[]).length;
  eq('★ 兩個列表（首頁右欄、今日營收彈窗）都改了', rows, 2);
  ok('★ 歸屬標籤與姓名同一列、靠右',
     (src.match(/<span class="mc-rev-nm">\$\{(esc\()?r\.nm\)?\}<\/span>\$\{revAttribChip\(r\)\}/g)||[]).length===2
     && /\.rv-r1,\.rv-r2\{display:flex;align-items:baseline;justify-content:space-between;/.test(src)
     && /\.rv-r1>\.rev-att\{flex:none;\}/.test(src));
  ok('　　不再用 margin-left 貼在名字右邊', !/\.rev-att\{[^}]*margin-left:6px/.test(src));
  ok('　　為什麼要搬，寫在程式裡', /歸屬教練放在會員姓名上方/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
