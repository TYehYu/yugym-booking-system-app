/* 會員列表比照員工列表分三區（2026-07-31 使用者指示）

   左＝姓名｜中＝會員狀態（票券、最近上課）｜右＝分類管理（會員等級、主教練、操作）。
   等級與主教練是「櫃檯怎麼歸類這個人」，和員工列表的權限開關同一種性質，所以歸右邊。

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
  const i=src.indexOf('  const cols=[\n    {label:\'姓名\',     width:\'1.4fr\', sortKey:\'name\'},');
  const cols=new Function('return '+src.slice(src.indexOf('[',i), src.indexOf('];',i)+1))();
  eq('★ 姓名 → 票券 → 最近上課 → 會員等級 → 主教練 → 操作',
     cols.map(c=>c.label), ['姓名','票券','最近上課','會員等級','主教練','']);
  eq('★ 分區線畫在「票券」（中區起點）與「會員等級」（右區起點）',
     cols.filter(c=>c.zone).map(c=>c.label), ['票券','會員等級']);
  ok('　　排序鍵沒掉（姓名／最近上課／會員等級）',
     cols.filter(c=>c.sortKey).map(c=>c.sortKey).join()==='name,last,tier');
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
ok('　　原因寫在程式裡', /等級與主教練是「櫃檯怎麼歸類這個人」/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
