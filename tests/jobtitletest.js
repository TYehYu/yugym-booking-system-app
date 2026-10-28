/* 職稱怎麼寫出來（2026-10-29 使用者指示）
   「教練其實可以不用寫 大家都是教練」
   「工讀要改成支援」
   「另外 曹智詠為何是教練不是工讀？」

   第三句問出了這一支測試真正要守的事：**職稱（job_title）跟職務（employment_type）
   是兩個欄位**。曹智詠的僱用別是 intern（支援），職稱卻被打成「教練」——
   列表副標印的是職稱，所以看起來像教練。兩欄不會互相校正，也不該互相校正：
   職稱是給人看的自由欄位，僱用別是算薪水的 enum。

   做法：資料庫那幾個字一律不動，只在「寫出來」的時候過一層對照。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{const i=src.indexOf('function '+n+'(');let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const alias=src.slice(src.indexOf('const _JT_ALIAS='), src.indexOf('\n', src.indexOf('const _JT_ALIAS=')));
const F=new Function(alias+'\n'+grab('jobTitleTx')+'\n'+grab('jobTitleSub')
  +'\nreturn {tx:jobTitleTx, sub:jobTitleSub};')();

console.log('① 舊值對照（資料庫不動，只換寫出來的字）');
eq('★★★ 工讀 → 支援', F.tx('工讀'), '支援');
eq('★★  店長 → 主管（2026-09-08 的正名，這裡一起收）', F.tx('店長'), '主管');
eq('★   沒有對照的照原樣', F.tx('行政'), '行政');
eq('　　前後空白修掉', F.tx(' 工讀 '), '支援');
eq('　　空的就是空的（不要變成 undefined 或 null 字樣）', F.tx(null), '');
eq('　　沒填不會被塞預設值', F.tx(''), '');

console.log('\n② 列表副標：教練不寫');
/* 使用者：「教練其實可以不用寫　大家都是教練」——
   店裡每個人都是教練，那兩個字在列表上等於沒寫，還會把生日擠掉（1028 的省略號事故）。 */
eq('★★★ 教練 → 不寫', F.sub('教練'), '');
eq('★★★ 工讀 → 支援（副標也吃對照）', F.sub('工讀'), '支援');
eq('★★  行政照寫 —— 沒有章的人全系統只有這一行寫得出他不是教練', F.sub('行政'), '行政');
eq('★   支援照寫', F.sub('支援'), '支援');
eq('　　沒填就是空的', F.sub(null), '');

console.log('\n③ 兩個欄位不互相校正');
/* 曹智詠：employment_type='intern'（支援）、job_title='教練'。
   職稱不寫教練之後，他的副標會是空的，而他的「職務」那顆 pill 照樣寫支援 ——
   這是對的：想知道僱用別就看那顆 pill，職稱只是備註。
   ⚠ 不要寫「職稱空白就拿僱用別來填」那種退路：那會讓六個教練的副標
     突然冒出正職／合作／支援，正是 1028 砍掉的重複資訊。 */
ok('★★★ 沒有「職稱空白就退回僱用別」的退路',
   !/jobTitleSub\([^)]*\)\s*\|\|\s*PAY_LABEL/.test(src)
   && !/_jt\s*\|\|\s*PAY_LABEL/.test(src));
ok('★★★ 列表副標吃 jobTitleSub（不是直接印 c.job_title）',
   /const _jt=\(!_lv && c\.job_title\) \? jobTitleSub\(c\.job_title\) : '';/.test(src)
   && !/const _jt=\(!_lv && c\.job_title\) \? c\.job_title : '';/.test(src));
ok('★★  姓名前那枚章吃 jobTitleTx（主管／管理員才有章，那裡要寫得出職稱）',
   /escH\(jobTitleTx\(c\.job_title\)\|\|/.test(src));
ok('★★  員工卡的「職稱」那一格也吃對照（看到的字要跟列表一致）',
   /_eEdit\('職稱', jobTitleTx\(r\.job_title\),'job_title','未填'\)/.test(src));
ok('★   待審申請的兩個入口也一致（列表列與控制台列）',
   (src.match(/jobTitleTx\(a\.job_title\)/g)||[]).length===2);

console.log('\n④ 編輯視窗：舊值要留得住');
/* 0721 踩過：選項砍掉 → 舊值對不到任何一個 option → 一進編輯就 fallback
   顯示第一個選項，按下儲存就把人家的職稱改掉了。 */
ok('★★★ 新增「支援」選項', /\['支援','支援'\]/.test(src));
ok('★★★ 舊值「工讀」留著（砍掉會被 fallback 改寫）',
   /\['工讀','工讀（舊稱，請改支援）'\]/.test(src));
ok('★★  寫明是舊稱，不然兩個選項看起來一樣有效',
   /工讀（舊稱，請改支援）/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
