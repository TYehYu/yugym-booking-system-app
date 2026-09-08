/* 員工資料 2026-09-08 三件事：
   ①「店長」全面正名「主管」（使用者：「店長獎金　身份店長　都改成主管　系統裡的店長都收斂成主管」）
   ② 四個分頁依身份顯示（使用者：「該員工有課堂才顯示本月課堂　值班也是一樣」）
   ③ 特休時數移到上方基本資料（使用者：「員工資料上方的基本資料新增　特休時數」） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
/* 只看「畫面上會出現的字」：把整行是註解、或「店長」落在 // 與 /* 之後的都排掉 */
const uiLines=src.split('\n').map((l,i)=>[i+1,l]).filter(([,l])=>{
  if(!l.includes('店長')) return false;
  const b=l.slice(0,l.indexOf('店長'));
  if(/^\s*(\/\/|\/\*|\*|・|⚠|＊)/.test(l)) return false;
  return !b.includes('//') && !b.includes('/*');
});

console.log('① 店長 → 主管');
ok('★★★ 畫面上不再出現「店長」，只剩職稱下拉的舊稱相容選項',
   uiLines.filter(([,l])=>!l.includes("['店長','店長（舊稱）']")).every(([,l])=>/^\s*[^'"`]*$/.test(l)||!/['"`>][^'"`]*店長/.test(l)),
   uiLines.filter(([,l])=>!l.includes("['店長','店長（舊稱）']")).map(([n])=>n));
ok('★★★ 舊資料的職稱「店長」要留得住 —— 選項砍掉會被 fallback 改寫成「老闆」（0721 踩過）',
   /\['店長','店長（舊稱）'\]/.test(src) && !/\['店長','店長'\]/.test(src));
ok('★★★ 薪資單那一列改成「主管獎金」，四個入口都改到（薪資單／薪資列表／教練端／規則頁）',
   (src.match(/'主管獎金'/g)||[]).length>=5 && !/'店長獎金'/.test(src));
ok('★★ 身份章不會印出兩個「主管」—— is_supervisor 已退場，兩顆都叫主管會重複',
   !/c\.is_supervisor\?'主管'/.test(src) && !/me\.is_supervisor\?`主管`/.test(src));
ok('★★ 權限開關的吐司名稱跟著改（manager 那顆）', /manager:'主管'/.test(src));
ok('★  規則頁前言的三項清單不再是「主管／店長」兩個混著講',
   /全域制度（續約／主管津貼／主管獎金／勞健保）/.test(src) );

console.log('\n② 四個分頁依身份顯示');
ok('★★★ 課堂看 can_teach，值班看 need_duty 或 need_punch',
   /const _canTeach = \(PP\.rec&&PP\.rec\.can_teach\)!==false;/.test(src)
   && /const _hasDuty  = !!\(PP\.rec&&\(PP\.rec\.need_duty\|\|PP\.rec\.need_punch\)\);/.test(src));
ok('★★★ 值班要吃 need_punch —— 只打卡沒排班的人也要進得去（值班與打卡 0802 併成同一頁）',
   /PP\.rec\.need_duty\|\|PP\.rec\.need_punch/.test(src));
ok('★★★ 薪資單與薪資規則不受影響（不開課也有底薪與津貼要看）',
   /\[\['salary','薪資單'\],\['rules','薪資規則'\]\]\);/.test(src));
ok('★★★ 記住的分頁被藏起來時要落到第一個看得到的 —— 否則停在沒有按鈕的空白面板',
   /if\(!PP\.recView \|\| !EMP_TABS\.some\(t=>t\[0\]===PP\.recView\)\) PP\.recView=EMP_TABS\[0\]\[0\];/.test(src));
ok('★★ 上方摘要那一行也跟著藏，不會留下「本月課堂 0/0 堂」',
   /const _capBits=\[\]\.concat\(\s*\n\s*_canTeach\?\[/.test(src)
   && /const cap=_capBits\.length\?/.test(src));

console.log('\n③ 特休時數移到上方基本資料');
ok('★★★ 特休掛在員工的 meta 列（會員那半邊不受影響）',
   /\+ mv\('Email', r\.email,'email'\) \+ empChips \+ empAl \+ empLine;/.test(src));
ok('★★★ 合作教練寫「不適用」而不是 0 —— 0 會被讀成「休完了」',
   /if\(_rule\.leaveApplicable===false\)/.test(src) && /不適用<\/span><\/div>/.test(src));
ok('★★ 判準跟特休管理頁同一句（EMP_RULES[normEmp(...)].leaveApplicable）',
   /const _et=normEmp\(r\.employment_type\|\|r\.pay_type\);/.test(src)
   && /const _rule=EMP_RULES\[_et\]\|\|\{\};/.test(src));
ok('★★ 櫃檯以上點得開特休設定，教練自己看純顯示',
   /const _canAl = isDeskLike\(\);/.test(src) && /onclick="openLeaveEdit\('\$\{r\.id\}'\)"/.test(src));
ok('★★ 下方工作紀錄不再重複顯示特休（同一個數字兩個地方會對不起來）',
   !/特休 <b>\$\{al\}<\/b> 小時可用/.test(src) && !/const al = ppAlAvailable\(PP\.rec\);/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
