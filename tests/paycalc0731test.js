/* 薪資口徑兩項定案（2026-07-31 使用者指示）

   1) 體驗不要算 —— 體驗課不進教練的堂數，也不支課費。
      （7 月對帳：系統 vs 櫃檯的表差 10 堂，其中 7 堂就是體驗課：BARRY 3、MANGO 2、ZOE 2）
      體驗課仍然會建卡、仍算場地佔用、仍能拿來判定續約歸屬 —— 只有「薪資堂數」不算。
   2) 值班工時：正職不再扣「值班時段內上課」的重疊時數。
      正職是月薪制，值班與上課在同一段班內，扣了等於雙重懲罰；兼職／工讀維持原規則。 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const api=new Function('timeToMin',
  g('function normEmp(v){','\n}\n')+'\n'
  +g('function isPtPayClass(b){','\n')+'\n'
  +g('function dutyClassOverlapHours(','\n}\n')
  +'\nreturn {isPtPayClass,dutyClassOverlapHours};')(t=>{const[h,m]=String(t||'0:0').split(':').map(Number);return h*60+(m||0);});

console.log('體驗不算薪資堂數');
{
  const B=(cat)=>({category:cat,status:'checked_in'});
  eq('★ 私人教練 → 算', api.isPtPayClass(B('私人教練')), true);
  eq('★ 體驗 → 不算', api.isPtPayClass(B('體驗')), false);
  eq('　　小班肌力 → 不算（團課另有人次計法）', api.isPtPayClass(B('小班肌力')), false);
  eq('　　自主訓練 → 不算', api.isPtPayClass(B('自主訓練')), false);
  eq('　　null 不會爆', api.isPtPayClass(null), false);
  const bks=[B('私人教練'),B('私人教練'),B('體驗'),B('小班肌力')];
  eq('★ 3 堂教練課＋1 堂體驗 → 薪資堂數 2', bks.filter(api.isPtPayClass).length, 2);
}

console.log('\n所有薪資站點都換成同一支 isPtPayClass');
ok('★ 教練薪資單', /const ptDone=myDone\.filter\(isPtPayClass\)\.length;/.test(src));
ok('★ 薪資列表（櫃檯／管理員）', /const ptDone=done\.filter\(isPtPayClass\)\.length;/.test(src));
ok('★ 員工表現（本月統計）', /const ptCount=myBk\.filter\(isPtPayClass\)\.length;/.test(src)
   && /const ptDone=myDone\.filter\(isPtPayClass\)\.length;/.test(src));
ok('★ 員工列表統計', /const isPt=isPtPayClass;/.test(src));
ok('★ 續約歸屬用的 ptDoneById', /&&isPtPayClass\(b\)\)\.length;/.test(src));
ok('★ 教練首頁「今日預估薪資」', /const todayPtDone=myToday\.filter\(b=>\(b\.status==='completed'\|\|b\.status==='checked_in'\)&&isPtPayClass\(b\)\)\.length;/.test(src));
ok('★ 營運分析的薪資試算', /const ptD=myDone\.filter\(isPtPayClass\)\.length;/.test(src));
ok('★ 每日薪資 dayResult（兩處）', (src.match(/const dPt=dayBk\.filter\(isPtPayClass\)\.length;/g)||[]).length===2);
ok('★ 員工列表的排課數與已完成數同口徑（不然分母含體驗會對不起來）',
   /const ptAll=mine\.filter\(isPtPayClass\)\.length;/.test(src));
ok('★ 薪資相關的地方不再出現舊的「私人教練||體驗」寫法（只剩場地／歸屬／課量統計）',
   (src.match(/b\.category==='私人教練'\|\|b\.category==='體驗'/g)||[]).length===7);

console.log('\n刻意保留體驗的地方（不是薪資）');
ok('　　教練課場地容量（體驗也佔多功能訓練區）', /const ptN=myList\.filter\(b=>b\.category==='私人教練'\|\|b\.category==='體驗'\)\.length;/.test(src));
ok('　　續約歸屬「購買前 90 天帶最多教練課的教練」（體驗也是他帶的）',
   (src.match(/&&b\.date>=from&&b\.date<=upTo&&\(b\.category==='私人教練'\|\|b\.category==='體驗'\)\) cnt\[b\.coach_id\]/g)||[]).length===2);
ok('　　今日課程分佈（營運分析看的是課量不是薪水）', /const pt=todayBk\.filter\(b=>b\.category==='私人教練'\|\|b\.category==='體驗'\)\.length;/.test(src));
ok('　　值班重疊仍把體驗算進「有上課」（人確實在課上）',
   /b\.category==='私人教練'\|\|b\.category==='體驗'\|\|bkIsGroup\(b\)/.test(src));

console.log('\n值班重疊：正職不扣');
{
  const SH=[{emp_id:'C1',date:'2026-07-05',start_time:'10:00',end_time:'18:00'}];
  const BK=[{coach_id:'C1',status:'checked_in',category:'私人教練',date:'2026-07-05',start_time:'11:00',duration:60},
            {coach_id:'C1',status:'checked_in',category:'私人教練',date:'2026-07-05',start_time:'14:00',duration:60}];
  const f=(emp)=>api.dutyClassOverlapHours(SH,BK,'C1','2026-07',emp);
  eq('★ 正職（full_time）→ 0，值班時數不再被課程時段吃掉', f({employment_type:'full_time'}), 0);
  eq('★ 兼職（part_time）→ 照舊扣 2 小時', f({employment_type:'part_time'}), 2);
  eq('　　工讀（intern）→ 照舊扣', f({employment_type:'intern'}), 2);
  eq('　　合作（contractor）→ 照舊扣', f({employment_type:'contractor'}), 2);
  eq('　　寫法沒正規化過的 fulltime 也認得', f({employment_type:'fulltime'}), 0);
  eq('　　只有 pay_type 欄位時也認得', f({pay_type:'full_time'}), 0);
  eq('★ 沒帶 emp（舊呼叫）→ 維持原行為，不會突然變 0', f(undefined), 2);
  eq('　　課只有一半落在班內 → 只扣重疊的那半小時',
     api.dutyClassOverlapHours([{emp_id:'C1',date:'2026-07-05',start_time:'10:00',end_time:'11:30'}],
       [{coach_id:'C1',status:'checked_in',category:'私人教練',date:'2026-07-05',start_time:'11:00',duration:60}],
       'C1','2026-07',{employment_type:'part_time'}), 0.5);
}

console.log('\n七個呼叫點都補上 emp（漏一個就會有一頁算出不同數字）');
{
  const calls=src.match(/(function )?dutyClassOverlapHours\([^)]*\)/g)||[];
  const real=calls.filter(c=>!c.startsWith('function '));   // 排除函式定義本身
  eq('★ 呼叫點共 7 處', real.length, 7);
  ok('★ 每一處都帶了第 5 個參數', real.every(c=>c.split(',').length===5), real.filter(c=>c.split(',').length!==5));
}

console.log('\n原因寫在程式裡（下次有人想改回去看得到）');
ok('　　體驗不算的理由', /體驗課不算進教練課堂數，也不支薪/.test(src));
ok('　　正職不扣重疊的理由', /正職是月薪制，值班與上課本來就在同一段班內，扣了等於雙重懲罰/.test(src));
ok('　　兼職維持原規則也寫清楚', /兼職／工讀維持原規則/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
