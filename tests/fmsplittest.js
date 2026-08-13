/* 2026-08-08 使用者指示（月報表左邊那欄）：「這邊要把教練課跟團課人數分開」

   原本「總堂數／全店」是一欄，把 pt+grp 加在一起 —— 教練課是堂數、團課是人次，
   兩種單位混在同一個數字裡，看不出這個月團課帶了多少人次。
   拆成兩欄，而且兩欄都要跟著凍結（原本只有一欄黏在日期欄右邊）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 表頭：一個大標、兩個子標');
ok('★ 上排「全店合計」橫跨三欄（2026-08-13 加營業額欄）',
   /<th class="fm-d fm-h">日期<\/th><th class="fm-h fm-t" colspan="3">全店合計<\/th>/.test(src));
ok('★ 下排拆成「教練課」與「團課」',
   /<th class="fm-sh fm-t">教練課<\/th><th class="fm-sh fm-t fm-t2">團課<\/th>/.test(src));

console.log('\n② 每日與月合計都拆開算');
ok('★ 每天分別累加（不再 pt+grp 混在一起）', /dayPt\+=v\.pt; dayGrp\+=v\.grp;/.test(src)
   && !/dayTotal\+=v\.pt\+v\.grp;/.test(src));
ok('★ 每日列輸出兩格',
   /<td class="fm-c fm-t">\$\{num\(dayPt\)\}<\/td><td class="fm-c fm-t fm-t2">\$\{num\(dayGrp\)\}<\/td>/.test(src));
ok('★ 月合計也分開', /sumPt\+=s\.pt; sumGrp\+=s\.grp;/.test(src)
   && /<td class="fm-c fm-t">\$\{num\(sumPt\)\}<\/td><td class="fm-c fm-t fm-t2">\$\{num\(sumGrp\)\}<\/td>/.test(src));
ok('　　舊的合併變數整個退場', !/sumAll/.test(src) && !/dayTotal/.test(src));

console.log('\n③ 兩欄都要凍結');
ok('★ 教練課黏日期欄右邊、團課再黏教練課右邊',
   /\.fm-tb \.fm-t\{position:sticky;left:var\(--fm-l1,74px\)/.test(src)
   && /\.fm-tb \.fm-t\.fm-t2\{left:var\(--fm-l2,126px\)/.test(src));
ok('★ 位移用量的、不寫死（字體與縮放都會變；2026-08-13 起第四欄 --fm-l3 一樣用量的）',
   /const t1=tb\.querySelector\('thead tr:nth-child\(2\) \.fm-t:not\(\.fm-t2\):not\(\.fm-t3\)'\);/.test(src)
   && /if\(w1>0&&w2>0\) tb\.style\.setProperty\('--fm-l2',\(w1\+w2\)\+'px'\);/.test(src)
   && /if\(w1>0&&w2>0&&w3>0\) tb\.style\.setProperty\('--fm-l3',\(w1\+w2\+w3\)\+'px'\);/.test(src));
ok('★ 粗右線只留在凍結區最右邊（2026-08-13 起最右是營業額欄）',
   /\.fm-tb \.fm-t\{[^}]*border-right:1px solid var\(--bd\);\}/.test(src)
   && /\.fm-tb \.fm-t\.fm-t3\{[^}]*border-right:2px solid var\(--bd\)/.test(src)
   && !/\.fm-tb \.fm-t\.fm-t2\{[^}]*border-right:2px/.test(src));
ok('　　團課那一欄用棕色（與教練欄裡的團課同色）',
   /\.fm-tb \.fm-t\.fm-t2\{[^}]*color:var\(--brown\)/.test(src));

console.log('\n④ 既有行為不變');
ok('　　每位教練仍是四欄一組（教練課／團課／業績／新續）',
   /<th class="fm-sh fm-gs" style="--cc:\$\{cc\};">教練課<\/th><th class="fm-sh">團課<\/th><th class="fm-sh">業績<\/th>/.test(src));
ok('　　月合計仍凍結在表頭下方', /\.fm-tb \.fm-sum td,\.fm-tb \.fm-sum th\{position:sticky;top:calc\(var\(--fm-h1,28px\) \+ var\(--fm-h2,24px\)\);/.test(src));
ok('　　使用者的原話寫在程式裡', /這邊要把教練課跟團課人數分開/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
