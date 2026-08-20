/* 2026-08-20 三項修正：
   ① 使用者回報「今日運勢點了沒反應」——手機版帳號抽屜開啟時會被搬到 body（脫離 #app-screen），
      `.role-admin #tb-fortune-inline{display:block}` 這條祖先選擇器就吃不到，籤抽到了卻整塊 display:none。
      修法同 bkCardPop 的 admh-pop：開啟前把 role-admin 補到抽屜元素本身。
   ② 簡易課卡右上角調整時間鈕：只顯示開始時間（9:00），不再帶結束時間，省視窗空間。
   ③ 簡易課卡會員姓名列最右邊掛教練名。
   ④ 首頁大日期的格線從「日期數字｜月份」之間，移到「大日期｜右側 KPI」之間。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i));};

console.log('今日運勢：抽屜搬到 body 後角色選擇器要還吃得到');
const sync=g('function syncAcctMenuItems(){','\ndocument.addEventListener(\'click\'');
ok('★ 開啟前把 role-admin 補到 #tb-acct-menu 本身', /getElementById\('tb-acct-menu'\)[\s\S]*classList\.toggle\('role-admin', *role==='admin'\)/.test(sync));
ok('　　補 class 排在 renderFortuneInline 之前（否則同一輪還是量到 none）',
   sync.indexOf("classList.toggle('role-admin'") < sync.indexOf('renderFortuneInline'));
ok('　　CSS 兩條規則仍靠 .role-admin 祖先（所以上面那行是必要的）',
   src.includes('.role-admin .tb-acct-butler{display:flex;}') && src.includes('.role-admin #tb-fortune-inline{display:block;}'));
ok('　　抽屜確實會被搬到 body（本 bug 的前提沒變）',
   g('function toggleAcctMenu(e){','function closeAcctMenu').includes('document.body.appendChild(menu)'));

console.log('簡易課卡（admh-sheet）');
const sheet=g('_cardHtml=`<div class="mtp-card admh-sheet"','</div>`;\n  }else{');
ok('★ 調整時間鈕只顯示開始時間、去掉開頭的 0', sheet.includes("${String(b.start_time||'').replace(/^0/,'')}"));
ok('★ 不再顯示 –結束時間', !sheet.includes('${b.start_time}–${endT}'));
ok('★ 姓名列最右邊掛教練名', /<div class="ash-name"><span>[\s\S]*<\/span>\$\{coachNm\?`<span class="ash-coach">\$\{coachNm\}<\/span>`:''\}<\/div>/.test(sheet));
ok('　　沒有教練時不留空節點', sheet.includes("coachNm?`<span class=\"ash-coach\">") && sheet.includes(":''}</div>"));
ok('　　.ash-name 改成左右分置的 flex 列', /\.ash-name\{display:flex;[^}]*justify-content:space-between/.test(src));
ok('　　.ash-coach 樣式存在且不換行', /\.ash-coach\{[^}]*white-space:nowrap/.test(src));
ok('　　coachNm 在組卡片前就算好（沿用既有變數，沒有多查一次）',
   src.indexOf('const _cn=cm[coach]; const coachNm=') < src.indexOf('_cardHtml=`<div class="mtp-card admh-sheet"'));

console.log('首頁大日期格線');
const hero=g('admMobHero=`<div class="admh">','<div class="admh-div"></div>');
ok('★ 格線移出 .admh-bigdate', !/admh-bigdate[\s\S]*admh-dsep[\s\S]*admh-dside/.test(hero));
ok('★ 格線落在大日期與 KPI 之間',
   hero.indexOf('class="admh-bigdate"') < hero.indexOf('<span class="admh-dsep"></span>') &&
   hero.indexOf('<span class="admh-dsep"></span>') < hero.indexOf('<div class="admh-kpis">') &&
   hero.split('admh-dsep').length===2);
ok('　　格線仍是滿高的細線（flex 子項不被壓縮）', /\.admh-dsep\{[^}]*align-self:stretch[^}]*flex:none/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
