/* 運動按摩併進教練課堂數（2026-10-26 使用者定案「1 併入計算」）

   起因：使用者問「mango 9月 10月 運動按摩是不是沒有計算在教練課堂數裡面」。
   查出來比想的更嚴重 —— 不只沒算進堂數，**薪資制度裡根本沒有按摩這個項目**
   （五項：底薪／教練課費／達標獎金／團課人頭／值班時薪），
   所以那五堂（9 月 2、10 月 3，都是黃美蓉、都有扣票、每堂 60 分）
   等於上了沒有任何課堂報酬。

   定案：按摩與教練課**同費率、同級距**，也一起算達標獎金與店長獎金的堂數；
   並且在薪資單上標出「其中幾堂是按摩」（使用者：「可以顯示運動按摩堂數讓教練知道」）。

   ⚠ 這是追溯的 —— 9 月、10 月的薪資單數字會跟著變，那正是使用者要的。
   ⚠ 體驗仍然不算（0731 的定案沒有被推翻）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});
const grab=n=>{let i=src.indexOf('function '+n+'(');let d=0;
 for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 哪些課別算進教練課堂數');
const isPt=new Function(grab('isPtPayClass')+';return isPtPayClass;')();
eq('★★★ 私人教練 → 算', isPt({category:'私人教練'}), true);
eq('★★★ 運動按摩 → 算（1026 併進來）', isPt({category:'運動按摩'}), true);
eq('★★★ 體驗 → 不算（0731 定案，沒被推翻）', isPt({category:'體驗'}), false);
eq('★★ 團課 → 不算（它走團課人頭）', isPt({category:'小班肌力'}), false);
eq('★★ 自主訓練 → 不算', isPt({category:'自主訓練'}), false);
eq('★★ 場租 → 不算', isPt({category:'場租'}), false);
eq('　 空值不炸', [isPt(null), isPt({})], [false,false]);

console.log('\n② 其中幾堂是按摩（標給教練看）');
ok('★★★ 有這一支', /function countMassage\(list\)\{/.test(src));
/* ⚠ 用 bkIsMassage 不要自己比字串 —— 分類器只有一支（口袋規則）。 */
ok('★★★ 走 bkIsMassage，不自己比 category',
   /function countMassage\(list\)\{ return \(list\|\|\[\]\)\.filter\(b=>bkIsMassage\(b\)\)\.length; \}/.test(src));
const cm=new Function('bkIsMassage', grab('countMassage')+';return countMassage;')(
  b=>!!b && b.category==='運動按摩');
/* 正式庫 2026-10 的黃美蓉：私人教練 56 堂已簽到 ＋ 按摩 3 堂 */
const OCT=[...Array(56)].map(()=>({category:'私人教練'}))
  .concat([...Array(3)].map(()=>({category:'運動按摩'})))
  .concat([...Array(2)].map(()=>({category:'體驗'})));
eq('★★★ 實跑：10 月 59 堂裡有 3 堂按摩', cm(OCT), 3);
eq('★★★ 搭配 isPtPayClass：算薪堂數 59（56 教練課＋3 按摩，體驗不算）',
   OCT.filter(isPt).length, 59);
/* 9 月：私人教練 73 ＋ 按摩 2 ＋ 體驗 4 */
const SEP=[...Array(73)].map(()=>({category:'私人教練'}))
  .concat([...Array(2)].map(()=>({category:'運動按摩'})))
  .concat([...Array(4)].map(()=>({category:'體驗'})));
eq('★★★ 實跑：9 月算薪堂數 75（原本 73）', SEP.filter(isPt).length, 75);
eq('★★★ 9 月有 2 堂按摩', cm(SEP), 2);
eq('　 沒有按摩時回 0（薪資單就不標那一段）', cm([{category:'私人教練'}]), 0);

console.log('\n③ 兩份薪資單都標出來');
ok('★★★ 管理員那份', /const ptMassage=countMassage\(done\);/.test(src)
   && /const _mz=ptMassage>0\?`（含按摩 \$\{ptMassage\} 堂）`:'';/.test(src));
ok('★★★ 教練自己那份', /const ptMassage=countMassage\(myDone\);/.test(src)
   && /\$\{ptDone\} 堂\$\{ptMassage>0\?`（含按摩 \$\{ptMassage\} 堂）`:''\}/.test(src));
/* 四處：管理員那份兩處（底薪有／沒有兩條分支各一個 _mz），教練那份兩處（同樣兩條分支）。 */
ok('★★ 沒有按摩就不多畫那一段（四條分支都是 >0 才加）',
   (src.match(/ptMassage>0\?/g)||[]).length===4);

console.log('\n④ 來由寫在原地');
ok('★★★ 為什麼併進來（含「薪資制度裡根本沒有按摩這個項目」）',
   /\*\*薪資制度裡根本沒有按摩這個項目\*\*/.test(src));
ok('★★ 是追溯的，9／10 月的數字會跟著變', /這是\*\*追溯\*\*的：9 月、10 月的薪資單數字會跟著變/.test(src));
ok('★★ 體驗仍然不算', /體驗仍然不算 —— 0731 的定案沒有被推翻/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
