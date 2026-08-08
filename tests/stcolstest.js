/* 2026-08-08 使用者指示（員工列表的月表現數字）：
   「體驗也列出一欄，然後團課列出課堂數跟人數」

   起因是前一則的疑問「這兩個人的總堂數是怎麼加出來的」——
   總堂數＝這個月帶的所有課（含體驗），但下面只列教練課與團課，
   差額（體驗）沒有地方看得到，只能用減的推。
   團課則是「一堂算一堂」，帶 5 個人和帶 1 個人看起來一樣。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 統計多算兩組數字');
ok('★ 體驗獨立算（category==="體驗"）',
   /const isTrial=b=>!!b && b\.category==='體驗';/.test(src)
   && /trial:done\.filter\(isTrial\)\.length, trialAll:mine\.filter\(isTrial\)\.length,/.test(src));
ok('★★ 團課人次用 grpHeadsNoLeave（與月報表同一支，請假不算）',
   /const _grpH=b=>\{ try\{ return grpHeadsNoLeave\(b\); \}/.test(src)
   && /grpH:done\.filter\(bkIsGroup\)\.reduce\(\(n,b\)=>n\+_grpH\(b\),0\),/.test(src)
   && /grpHAll:mine\.filter\(bkIsGroup\)\.reduce\(\(n,b\)=>n\+_grpH\(b\),0\),/.test(src));
ok('　　月報表也是同一支（口徑一致）', /if\(bkIsGroup\(b\)\) c\.grp\+=grpHeadsNoLeave\(b\);/.test(src));
ok('　　取不到人次時退回名單人數，不會讓整列爆掉', /catch\(_\)\{ return mids\(b\)\.length\|\|1; \}/.test(src));
ok('　　團課堂數仍照舊（一堂一筆）', /grp:done\.filter\(b=>bkIsGroup\(b\)\)\.length,/.test(src));

console.log('\n② 欄位順序與表頭');
{
  const m=/<span class="st-zb">總堂數\$\{_mTag\}<\/span>([\s\S]+?)<span>實領薪資/.exec(src);
  ok('★ 表頭找得到', !!m);
  const heads=[...(m[1]||'').matchAll(/<span>([^<$]+)\$\{_mTag\}<\/span>/g)].map(x=>x[1]);
  eq('★★ 總堂數之後依序是：教練課／團課堂數／團課人次／體驗／續約／工作時數',
     heads, ['教練課','團課堂數','團課人次','體驗','續約','工作時數']);
}
ok('★ 資料列的順序與表頭一致（索引 0–6）',
   /num\(st\.all,[^)]*\), 0, 'st-zb'\)/.test(src.replace(/\s+/g,' '))
   || /num\(st\.all, st\.allAll>st\.all\?`\/\$\{st\.allAll\}`:'', 0, 'st-zb'\)/.test(src));
ok('★ 團課人次排在團課堂數後面、體驗再後面',
   /num\(st\.grp, [^\n]*, 2\)\n\s*\+ num\(st\.grpH, [^\n]*, 3\)\n\s*\+ num\(st\.trial, [^\n]*, 4\)\n\s*\+ num\(st\.renew,'', 5\)\n\s*\+ num\(fmtHours\(st\.hours\),'h', 6\)/.test(src));

console.log('\n③ 版面跟著加欄');
ok('★ 桌機格線多兩欄（中段 62/62/62/62/56）',
   /grid-template-columns:10px 34px minmax\(130px,240px\) 62px 62px 62px 62px 56px 48px 58px 100px 1fr 92px 78px 372px 30px;/.test(src));
ok('★ 權限開關的靠左對齊往後移兩格（nth-child 13→15）',
   /\.st-lhead span:nth-child\(15\)\{text-align:left;\}/.test(src)
   && !/\.st-lhead span:nth-child\(13\)\{text-align:left;\}/.test(src));
ok('　　姓名那格沒被動到', /\.st-lhead span:nth-child\(3\)\{text-align:left;\}/.test(src));
ok('★ 手機版的欄名補齊到 n6',
   /\.st-l-n2::before\{content:'團課堂數';\}/.test(src)
   && /\.st-l-n3::before\{content:'團課人次';\}/.test(src)
   && /\.st-l-n4::before\{content:'體驗';\}/.test(src)
   && /\.st-l-n5::before\{content:'續約';\}/.test(src)
   && /\.st-l-n6::before\{content:'工時';\}/.test(src));

console.log('\n④ 總堂數的定義沒變');
ok('　　仍是「這個月帶的所有課、不分課種」', /總堂數（2026-07-31 使用者指示）＝這個月實際帶的所有課，不分課種/.test(src));
ok('　　教練課那欄仍不含體驗（算薪用）', /const isPt=isPtPayClass;   \/\/ 體驗不算（2026-07-31 使用者定案）/.test(src));
ok('　　使用者的原話寫在程式裡', /體驗也列出一欄，\n\s*然後團課列出課堂數跟人數/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
