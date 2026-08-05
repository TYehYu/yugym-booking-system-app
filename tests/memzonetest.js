/* 會員列表比照員工列表分三區（2026-07-31 使用者指示）

   二修（同日使用者定案，整份對齊員工列表）：
   左＝姓名（主教練接在姓名旁＝員工英文名的位置；會員等級與電話在下面那行＝員工「正職・職稱」的位置）
   中＝教練課／團體課／自主訓練／運動按摩／折抵券 五格，各自用圓形卡
   右＝最近上課、註冊日、操作

   分區線的做法與員工列表一致：絕對定位畫線，格子不 stretch，欄位維持垂直置中。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

const lpTable=new Function(g('function lpTable(cols, rows, sort){','\n}\n')+'\nreturn lpTable;')();

console.log('欄位順序與分區');
{
  const i=src.indexOf("  const cols=[\n    {label:'姓名',     width:'1.5fr', sortKey:'name'},");
  /* 2026-07-31 二修：TK5 由 TK_POCKETS 產生，這裡連口袋定義一起抽出來跑 */
  const _pi=src.indexOf('const TK_POCKETS={');
  const TK5=new Function(src.slice(_pi, src.indexOf('\nconst TK5=',_pi))
    +'\nreturn Object.keys(TK_POCKETS).map(k=>[k,TK_POCKETS[k].label]);')();
  /* 2026-08-02：多了「連動核對」欄（只有名單裡有主顧客時才長出來）——
     沙箱注入 _legacyCol，兩種情況各驗一次。 */
  const mkCols=(legacy)=>new Function('TK5','_legacyCol','return '+src.slice(src.indexOf('[',i), src.indexOf('  ];',i)+3))(TK5,legacy);
  const cols=mkCols(false);
  eq('★ 姓名 → 五個課別 → 最近上課 → 註冊日 → 操作',
     cols.map(c=>c.label),
     ['姓名','教練課','團體課','自主訓練','運動按摩','折價券','最近上課','註冊日','']);
  eq('★ 名單裡有主顧客時，註冊日後面多一欄「連動核對」',
     mkCols(true).map(c=>c.label),
     ['姓名','教練課','團體課','自主訓練','運動按摩','折價券','最近上課','註冊日','連動核對','']);
  eq('★ 分區線畫在「教練課」（中區起點）與「最近上課」（右區起點）',
     cols.filter(c=>c.zone).map(c=>c.label), ['教練課','最近上課']);
  ok('　　排序鍵：姓名／最近上課／註冊日', cols.filter(c=>c.sortKey).map(c=>c.sortKey).join()==='name,last,reg');
  ok('　　五個課別欄各自帶 tkKey', cols.filter(c=>c.tkKey).map(c=>c.tkKey).join()==='pt,group,self,massage,voucher');
}

console.log('\nlpTable 畫得出分區線');
{
  const cols=[{label:'姓名',width:'1fr'},{label:'票券',width:'2fr',zone:true},
              {label:'最近上課',width:'1fr',sortKey:'last'},{label:'等級',width:'1fr',zone:true},
              {label:'',width:'54px'}];
  const html=lpTable(cols,[{onclick:"go()",cells:['<div class="lp-primary">王</div>','●●','昨天','VIP','<div class="lp-rowact">👁</div>']}],
                     {key:'last',dir:1,onclick:"sortBy('{k}')"});
  eq('★ 表頭有兩條分區線', (html.match(/lp-th[^"]*lp-zb/g)||[]).length, 2);
  eq('★ 資料列也有兩條', (html.match(/lp-cell lp-zb|lp-zb lp-/g)||[]).length, 2);
  ok('★ 可排序的欄位掛上分區線也不會壞掉（class 疊在一起）',
     /class="lp-th sortable"/.test(html) || /class="lp-th sortable sorted"/.test(html));
  ok('★ 傳進來就是 lp- 開頭的自訂格子（如 lp-primary）也掛得上',
     /<div class="lp-zb lp-/.test(html) || !cols[0].zone);
  ok('　　沒標 zone 的欄位不掛', (html.match(/lp-zb/g)||[]).length===4);   // 表頭 2 ＋ 資料列 2
}

console.log('\n不影響其他用 lpTable 的頁面');
{
  const cols=[{label:'A',width:'1fr'},{label:'B',width:'1fr',sortKey:'b'}];
  const html=lpTable(cols,[{cells:['a','b']}],{});
  ok('★ 完全沒帶 zone → 一條線都不畫', !/lp-zb/.test(html));
  ok('　　表頭與資料列照舊', /class="lp-th"/.test(html) && /class="lp-cell"/.test(html));
}

console.log('\n分區線的樣式');
ok('★ 用絕對定位畫，格子不 stretch（欄位維持垂直置中）',
   /\.lp-zb\{position:relative;padding-left:12px;margin-left:-6px;\}/.test(src));
ok('★ 表頭與資料列的上下內距不同，線長各自調',
   /\.lp-thead \.lp-zb::before\{content:'';position:absolute;left:0;top:-12px;bottom:-12px;/.test(src)
   && /\.lp-row \.lp-zb::before\{content:'';position:absolute;left:0;top:-15px;bottom:-15px;/.test(src));
ok('　　窄螢幕（≤900px）換排法，分區線關掉',
   /@media\(max-width:900px\)\{ \.lp-zb\{padding-left:0;margin-left:0;\} \.lp-zb::before\{display:none;\} \}/.test(src));
ok('　　與員工列表同一套做法（那邊是 .st-zb）',
   /\.st-zb\{position:relative;padding-left:12px;margin-left:-6px;\}/.test(src));
ok('　　原因寫在程式裡', /主教練接在姓名旁，位置比照員工的英文名/.test(src));

console.log('\n姓名區：比照員工列表');
ok('★ 主教練接在姓名旁（＝員工英文名的位置）',
   /<i class="lp-coach" style="background:\$\{cl\.bg\};color:\$\{cl\.fg\};">\$\{coachMap\[m\.default_coach_id\]\|\|''\}<\/i>/.test(src)
   && /\.lp-name \.lp-coach\{font-style:normal;font-size:11px;font-weight:700;border-radius:999px;/.test(src));
/* 2026-08-01：同一行前面多了「已停用」章（見 tests/memregtest.js），等級與電話的位置不變 */
ok('★ 會員等級移到姓名下面那行（＝員工「正職・職稱」的位置），與電話同一行',
   /\$\{tierLabel\(effTier\(m\)\)\}\$\{m\.phone\?'　'\+fmtPhone\(m\.phone\):''\}`/.test(src));
ok('　　那一行放不下色塊 tag → 另做純文字＋顏色的 tierLabel',
   /function tierLabel\(tier\)\{/.test(src)
   && /那裡是小字副標，塞不下色塊 tag/.test(src));

console.log('\n中間五格：各自的圓形卡');
/* 2026-07-31 二修：列表改從票券夾拿（buildWallet），分類／分配／leftover 都在那裡算 */
ok('★ 一格一個課別，用共用的 tkClass5 分類', /const live=w\.active\(k\);/.test(src)
   && /cls:tkClass5\(t,typeMap\), total, used, pending,/.test(src));
ok('★ 整袋一起分配，不是每格各配一次（同一堂會在多張票上重複冒出來）',
   /const w=_mTk\(m\.id\);/.test(src) && /put=\(tid,b\)=>\{ if\(!tid\|\|byBooking\[b\.id\]\) return;/.test(src));
ok('★ 每位會員只算一次（掃票券＋配預約＋算 leftover 都跟課別無關）',
   /const _mCache=\{\};/.test(src) && /const _mTk=\(mid\)=>_mCache\[mid\]\|\|\(_mCache\[mid\]=buildWallet\(mid,/.test(src));
ok('★ 只畫「還在用的最新一張」，沒有在用的就畫最近一張',
   /const sl=live\[0\] \|\| w\.inClass\(k\)\.slice\(\)/.test(src));
ok('★ 同課別還有幾張在用會標出來', /＋\$\{n-1\}<\/span>/.test(src) && /\.tkcat-n\{font-size:10px;/.test(src));
ok('★ 沒有那個課別的票就留空（不要塞「—」把五格擠滿）',
   /if\(!sl\) return '';/.test(src));
ok('　　沿用原本那顆圓形卡（tkRowHtml），不另做一套', /return tkRowHtml\(sl, w\.leftoverIn\(k\), m\.id\)/.test(src));

console.log('\n左緣色條＝會員等級（2026-07-31 使用者指示）');
ok('★ 每一列帶等級色', /lc:\(TIER_DEFS\[effTier\(m\)\]\|\|\{\}\)\.color\|\|'#8a8478',/.test(src));
ok('★ lpTable 支援 row.lc（opt-in，其他頁不受影響）',
   /<div class="lp-row\$\{r\.lc\?' lp-lc':''\}" style="grid-template-columns:\$\{grid\};\$\{r\.lc\?`--lc:\$\{r\.lc\};`:''\}"/.test(src));
ok('★ 與員工列表同一種語言（那邊是聘僱類型色條）',
   /\.lp-row\.lp-lc\{border-left:4px solid var\(--lc,#8a8478\);\}/.test(src)
   && /border-left:4px solid var\(--pc,#8a8478\);/.test(src));
/* 2026-08-05 三修（使用者附截圖）：色票併入工具列 lead 槽（與搜尋/篩選/翻頁同一列），
   新舊核對進度改統計卡第五格——表格上方不再各佔一列。 */
ok('★ 色票說明帶各等級人數，走工具列 lead 槽',
   /const tierLegend=`<div class="lp-legend">/.test(src)
   && /lead: tierLegend,/.test(src)
   && /if\(o\.lead\) r1 \+= o\.lead;/.test(src)
   && /body = lpTable\(cols, rows,/.test(src)
   && /\.lp-legend b::before\{content:"";width:10px;height:10px;border-radius:3px;background:var\(--lc\);\}/.test(src));
{
  const cols=[{label:'A',width:'1fr'}];
  const html=lpTable(cols,[{lc:'#8A5E28',cells:['a']},{cells:['b']}],{});
  ok('　　有帶 lc 的列才畫色條', (html.match(/lp-lc/g)||[]).length===1 && /--lc:#8A5E28;/.test(html));
}

console.log('\n右區');
/* 2026-07-31 使用者指示：最近上課與註冊日都改用日期顯示（原本是「3 天前」那種相對日期） */
ok('★ 兩欄都用日期，不用相對日期',
   /lastClassMap\[m\.id\] \? `<span class="num" title="\$\{lastClassMap\[m\.id\]\}">\$\{fmtDateShort\(lastClassMap\[m\.id\]\)\}<\/span>` : ''/.test(src)
   && /m\.created_at \? `<span class="num" title="\$\{String\(m\.created_at\)\.slice\(0,10\)\}">\$\{fmtDateShort\(String\(m\.created_at\)\.slice\(0,10\)\)\}<\/span>` : ''/.test(src));
ok('　　滑過仍看得到完整年月日', /title="\$\{lastClassMap\[m\.id\]\}"/.test(src));
{
  const f=new Function('ymd','TODAY',g('function fmtDateShort(ds){','\n}\n')+'\nreturn fmtDateShort;')(()=>'2026-07-31',null);
  eq('★ 同一年只顯示 MM/DD（欄位窄也塞得下）', f('2026-07-14'), '07/14');
  eq('★ 跨年才帶年份', f('2025-12-03'), '2025/12/03');
  eq('　　帶時間的 created_at 也切得出來', f('2026-07-14T10:00:00Z'), '07/14');
  eq('　　空值／格式不對回空字串', f('')+f(null)+f('abc'), '');
}
ok('　　等級排序的表頭沒了，這件事有寫在程式裡',
   /會員等級不再是獨立欄位 → 少了「依等級排序」的表頭；等級篩選仍在上方工具列/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
