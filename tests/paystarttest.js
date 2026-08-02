/* 2026-08-02 使用者指示：
   「計薪的開關取消，員工從到職日開始需要給薪的要自動開啟」

   前情：余東翰底薪 35000，八月薪資卻顯示 0 —— 因為建檔時 count_salary 這個
   手動勾選框沒打開。那個開關藏在員工明細的人資設定裡，畫面上完全看不出原因，
   $0 跟「這個月真的沒領到錢」長得一模一樣。先前把開關拉到列表上，使用者看過之後
   決定連開關一起拿掉，改成從到職日自動判定 —— 對的，這種事本來就不該靠人記得打勾。

   規則：到職當月起算；離職當月仍算（那個月有上班）；之後不算。
   沒填到職日的（舊資料多半沒填）一律算，他們本來就在職。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const env={ ymd:()=>'2026-08-02', TODAY:new Date(2026,7,2) };
const F=new Function(...Object.keys(env), grabFn('empCountSalary')+'\n'+grabFn('empPayNote')
  +'\nreturn {empCountSalary,empPayNote};')(...Object.values(env));
const cs=F.empCountSalary, note=F.empPayNote;

console.log('① 從到職日開始算薪');
eq('★ 余東翰：到職 8/01 → 八月就要算（他的底薪 35000 不該再顯示 0）',
   cs({hire_date:'2026-08-01'}, '2026-08'), true);
eq('★ 同一個人的七月 → 還沒到職，不算', cs({hire_date:'2026-08-01'}, '2026-07'), false);
eq('★ 月中到職（8/20）→ 到職當月就算（那個月有上班，堂數與值班照算）',
   cs({hire_date:'2026-08-20'}, '2026-08'), true);
eq('★ 下個月才到職 → 這個月不算', cs({hire_date:'2026-09-01'}, '2026-08'), false);
eq('★ 早就到職的 → 一直算', cs({hire_date:'2024-07-01'}, '2026-08'), true);
eq('★ 沒填到職日（舊資料多半沒填）→ 算（他們本來就在職）', cs({}, '2026-08'), true);
eq('　　到職日是空字串也當成沒填', cs({hire_date:''}, '2026-08'), true);
eq('　　帶時間的日期格式也比得對', cs({hire_date:'2026-08-01T00:00:00Z'}, '2026-08'), true);
eq('　　沒有員工資料 → 不算（不會爆）', cs(null,'2026-08'), false);
eq('　　沒指定月份 → 用今天所在的月份', cs({hire_date:'2026-08-01'}), true);

console.log('\n② 離職');
eq('★ 離職當月仍算（那個月有上班，薪水要發）',
   cs({hire_date:'2024-07-01',resign_date:'2026-08-15'}, '2026-08'), true);
eq('★ 離職的下個月不算', cs({hire_date:'2024-07-01',resign_date:'2026-07-31'}, '2026-08'), false);
eq('★ 離職之前的月份照算（回頭看歷史月份不會全變 0）',
   cs({hire_date:'2024-07-01',resign_date:'2026-07-31'}, '2026-06'), true);
eq('　　同月到職又離職 → 算', cs({hire_date:'2026-08-05',resign_date:'2026-08-20'}, '2026-08'), true);

console.log('\n③ 二月：月底不是 31 號也要算對');
eq('★ 2/28 到職 → 二月算', cs({hire_date:'2026-02-28'}, '2026-02'), true);
eq('★ 3/01 到職 → 二月不算', cs({hire_date:'2026-03-01'}, '2026-02'), false);
eq('　　閏年 2/29 到職 → 二月算', cs({hire_date:'2024-02-29'}, '2024-02'), true);

console.log('\n④ 不算的時候要說得出原因');
eq('★ 還沒到職 → 講出哪天開始', note({hire_date:'2026-09-05'}, '2026-08'), '未到職（09/05 起）');
eq('★ 已離職 → 講「已離職」', note({hire_date:'2024-07-01',resign_date:'2026-07-31'}, '2026-08'), '已離職');
eq('★ 有算薪的月份不加註記（不吵）', note({hire_date:'2026-08-01'}, '2026-08'), '');
ok('　　為什麼要寫原因，寫在程式裡',
   /畫面上只寫「不計薪」等於沒說，看的人得自己去翻人事資料/.test(src));

console.log('\n⑤ 每個算錢的地方都改用同一個判斷');
ok('★ 月結薪資彙總', /const countSalary=empCountSalary\(emp, month\);/.test(src));
ok('★ 薪資單／薪資頁', /const countSalary=empCountSalary\(me, month\);/.test(src));
ok('★ 薪資月曆的每日試算', /const countSalary=empCountSalary\(me, String\(ds\)\.slice\(0,7\)\);/.test(src));
ok('★ 營運分析的教練總薪資', /if\(!empCountSalary\(c, month\)\) return;/.test(src));
/* 2026-08-02 二修：匯入月份有金額時以匯入為準（到職日補建得比匯入資料晚的情況），
   所以條件多了一個「而且沒有匯入金額」。 */
ok('★ 員工列表的實領欄：未到職／已離職直接寫原因，不寫 0',
   /const _noPay = !empCountSalary\(c,_ym\) && !\(Number\(st\.net\)>0\);/.test(src)
   && /_noPay \? `<i class="st-l-none" title="\$\{empPayNote\(c,_ym\)\}　·　到職當月才開始計薪">/.test(src));
eq('★ 沒有任何地方還在讀寫舊的 count_salary 欄位（只剩註解裡的來龍去脈）',
   [...src.matchAll(/[.\w]count_salary|count_salary\s*[=!]/g)].map(m=>m[0]), []);
ok('　　手動勾選框兩處都拆掉了（人資設定與薪資設定）',
   !/hr-countsalary/.test(src) && !/countsalary/.test(src));
ok('　　員工列表的開關排回六顆（沒有「計薪」那顆）',
   !/\{key:'pay',/.test(src) && !/st-swb-note/.test(src));

console.log('\n⑥ 月結畫面的說明也跟著換');
ok('★ 表格那一列標的是原因（不再是「不計薪」）',
   /<span class="tag tag-warn" style="font-size:10px;">\$\{empPayNote\(r\.emp, month\)\}<\/span>/.test(src));
ok('★ 展開的計算明細講清楚是哪個月不算',
   /\$\{empPayNote\(r\.emp, month\)\}，這個月不列入薪資計算/.test(src));
ok('★ 手機卡片版同一套', /\$\{r\.countSalary\?'':'・'\+empPayNote\(r\.emp, month\)\}/.test(src));
ok('★ 個人薪資頁的標題列同一套', /\$\{countSalary\?'':'　·　'\+empPayNote\(me, month\)\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
