/* 教練課費的級距明細（2026-10-26 使用者：「教練課費 86 堂這邊　可以用級距顯示給教練看」）

   鄭百益 10 月 86 堂 $53,125，薪資單上只寫「86 堂」——
   累進級距正是最容易被問「為什麼這個月每堂變貴了」的地方，看不到就只能來問人。

   這支盯三件事：
     ① calcSalary 把逐階的「哪幾堂・幾堂・單價・金額」帶出來（不是只有一行字串）
     ② 逐階金額加起來要等於 ptPay（畫面不自己再乘一次）
     ③ 只有跨到第二階才攤開；管理員與教練兩份薪資單都吃得到 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');let d=0;
 for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 正式庫的設定（2026-10-26 查到的）：1–59 $600、60–79 $650、80–99 $675、100 起 $700 */
const TIERS=[{min:0,max:59,rate:600},{min:60,max:79,rate:650},{min:80,max:99,rate:675},{min:100,max:null,rate:700}];

/* 把 calcSalary 裡那一段累進算式抽出來實跑（整支要太多相依，這裡只跑級距那一塊） */
function run(ptDone){
  const tiers=TIERS.slice().sort((a,b)=>(a.min||0)-(b.min||0));
  let ptPay=0; const ptParts=[];
  tiers.forEach((t,i)=>{
    const lo=(i===0)?1:(t.min||0);
    const hi=(t.max==null?Infinity:t.max);
    const cntInTier=Math.max(0, Math.min(ptDone, hi) - lo + 1);
    if(cntInTier>0){ const _amt=cntInTier*(t.rate||0); ptPay+=_amt;
      ptParts.push({lo, hi:(hi===Infinity?null:hi), n:cntInTier, rate:(t.rate||0), amount:_amt}); }
  });
  return {ptPay, ptParts};
}

console.log('① 逐階算出來的要對得上正式庫');
const r86=run(86);
ok('★★★ 86 堂 ＝ $53,125（與 10/26 薪資單上的數字一致）', r86.ptPay===53125, r86.ptPay);
ok('★★★ 分成三階：59×600 ／ 20×650 ／ 7×675',
   JSON.stringify(r86.ptParts.map(p=>[p.lo,p.hi,p.n,p.rate,p.amount]))
   === JSON.stringify([[1,59,59,600,35400],[60,79,20,650,13000],[80,99,7,675,4725]]), r86.ptParts);
ok('★★★ 逐階金額加起來＝ptPay（畫面不自己再乘一次）',
   r86.ptParts.reduce((a,p)=>a+p.amount,0)===r86.ptPay);
const r59=run(59), r0=run(0), r120=run(120);
ok('★★ 59 堂只有一階（不攤開）', r59.ptParts.length===1 && r59.ptPay===35400, r59.ptPay);
ok('★★ 0 堂沒有任何一階', r0.ptParts.length===0 && r0.ptPay===0);
ok('★★ 120 堂會吃到最後那一階（無上限，hi 記成 null）',
   r120.ptParts.length===4 && r120.ptParts[3].hi===null && r120.ptParts[3].n===21,
   r120.ptParts[3]);

console.log('\n② calcSalary 真的把它帶出來');
ok('★★★ 算的時候就把逐階存起來',
   /ptParts\.push\(\{lo, hi:\(hi===Infinity\?null:hi\), n:cntInTier, rate:\(t\.rate\|\|0\), amount:_amt\}\);/.test(src));
ok('★★★ 回傳值裡有 ptParts', /ptPay, ptDetail, ptParts, ptIncome/.test(src));
ok('★★ 另外兩條路（固定費率、全 0）形狀一致，不會是 undefined',
   /ptDetail:`\$\{ptDone\} 堂 × \$\$\{emp\.pt_rate\|\|0\}`, ptParts:\[\]/.test(src)
   && /ptPay:0, ptDetail:'', ptParts:\[\], ptIncome:0/.test(src));
ok('　　金額在算的地方就定案（理由寫在原地）',
   /金額在這裡算好帶出去，不要讓畫面自己再乘一次/.test(src));

console.log('\n③ 畫面');
const fn=grab('ptTierListHTML');
ok('★★★ 有這一支', !!fn);
ok('★★★ 一階的人不攤開（右邊那列已經寫了「n 堂 × $x」）',
   /if\(ps\.length<2\) return '';/.test(fn));
ok('★★ 每一列寫「第 a–b 堂　n 堂 × $x　$金額」',
   /第 \$\{p\.lo\}\$\{p\.hi==null\?' 堂起':`–\$\{p\.hi\} 堂`\}/.test(fn)
   && /\$\{p\.n\} 堂 × \$\{_m\(p\.rate\)\}/.test(fn)
   && /\$\{_m\(p\.amount\)\}/.test(fn));
ok('★★ 最後一列結總（累進計算・共 n 堂）', /累進計算・共 \$\{_n\} 堂/.test(fn));
/* ⚠ 堂數用逐階加總，不可以去讀那個「已完成堂數」的鍵 —— calcSalary 沒有回傳它
   （salkeystest 的「算了卻沒回傳」那一條會紅）。
   ⚠ 斷言寫成反面時要避開自己的註解：這裡用字串拼出來比，不要把那個名字寫進字面。 */
ok('★★★ 堂數用逐階加總，不讀那個沒被回傳的鍵',
   /const _n=ps\.reduce\(\(a,p\)=>a\+\(Number\(p\.n\)\|\|0\),0\);/.test(fn)
   && fn.indexOf('sal.'+'ptDone')<0);
ok('★★ 版型沿用 .pfd-nl（跟值班重疊、店長名單同一組）', /class="pfd-nl open"/.test(fn));

/* 實跑一次，確認畫得出來而且數字就是上面那三階 */
(function(){
  const f=new Function('escH', fn+';return ptTierListHTML;')(x=>String(x==null?'':x));
  const html=f({ptParts:r86.ptParts, ptPay:r86.ptPay});
  ok('★★★ 實跑：三階都畫出來了',
     (html.match(/nl-row/g)||[]).length===3, html.slice(0,60));
  ok('★★★ 實跑：金額就是 35,400／13,000／4,725，合計 53,125',
     html.indexOf('$35,400')>=0 && html.indexOf('$13,000')>=0
     && html.indexOf('$4,725')>=0 && html.indexOf('$53,125')>=0);
  ok('★★★ 實跑：範圍寫成「第 1–59 堂」「第 80–99 堂」',
     html.indexOf('第 1–59 堂')>=0 && html.indexOf('第 80–99 堂')>=0);
  ok('★★ 實跑：一階的人回空字串', f({ptParts:r59.ptParts, ptPay:r59.ptPay})==='' );
  ok('★★ 實跑：沒有 ptParts 也不會爆', f({})==='' && f(null)==='');
})();

console.log('\n④ 兩份薪資單都吃得到');
/* 2026-10-26：堂數後面可能接「（含按摩 N 堂）」—— 按摩併進教練課堂數之後，
   使用者要求標出來讓教練知道。級距明細的位置沒變。 */
ok('★★★ 教練自己那份（sal-rows）',
   /h\+=row\('教練課費',`\$\$\{sal\.ptPay\.toLocaleString\(\)\}`,`\$\{ptDone\} 堂\$\{ptMassage>0\?`（含按摩 \$\{ptMassage\} 堂）`:''\}`\);\s*\n\s*h\+=ptTierListHTML\(sal\);/.test(src));
ok('★★★ 管理員那份（pfd-row）', /rows\+=ptTierListHTML\(sal\);/.test(src));
ok('★★ 攤開時上面那列只寫堂數，不再重複同一串',
   /const _hasTier=\(\(sal\.ptParts\|\|\[\]\)\.length>1\);/.test(src)
   && /_hasTier\?`\$\{ptDone\} 堂`:\(sal\.ptDetail\|\|`\$\{ptDone\} 堂`\)/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
