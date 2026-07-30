/* 團課名單：已選取的會員排到最上面（2026-07-30 使用者指示）
   會員多的時候要往下捲才看得到剛加的人，也不容易一眼確認名單對不對。
   一支 renderGrpPick 同時服務「開課精靈」與「管理名單」兩個視窗，改一處兩邊生效。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('程式碼');
ok('★ 排序第一鍵＝是否已選', /const sa=isSel\(a\), sb=isSel\(b\);\s*\n\s*if\(sa!==sb\) return sa\?-1:1;/.test(src));
ok('★ 已選區內依加入順序（＝實際報名順序）', /if\(sa&&sb\) return selOrder\[a\.id\]-selOrder\[b\.id\];/.test(src));
ok('　　其餘維持原本 ★我的會員 → 姓名', /if\(a\.mine!==b\.mine\) return a\.mine\?-1:1;\s*\n\s*return \(a\.name\|\|''\)\.localeCompare\(b\.name\|\|''\);/.test(src));
ok('　　同名重複報名只取第一次出現的順序（multiset 不影響排序）',
   /\(sel\|\|\[\]\)\.forEach\(\(x,i\)=>\{ if\(selOrder\[x\]==null\) selOrder\[x\]=i; \}\);/.test(src));
ok('★ 已選區與其餘會員之間有分隔標題', /const firstUnsel=list\.findIndex\(m=>!isSel\(m\)\);/.test(src)
   && /<div class="grp-div">其他會員<\/div>/.test(src)
   && /\.grp-div\{font-size:11px;font-weight:800;/.test(src));
ok('　　全部都已選（沒有其他會員）時不畫分隔', /firstUnsel>0/.test(src) && /_i===firstUnsel&&firstUnsel>0/.test(src));
ok('★ 搜尋隱藏了已選會員時會講清楚幾位', /（搜尋中隱藏了 \$\{total-shown\} 位已選會員）/.test(src));
ok('　　兩個視窗共用同一支 renderGrpPick（開課精靈＋管理名單）',
   (src.match(/renderGrpPick\(\);/g)||[]).length>=2 && (src.match(/function renderGrpPick\(\)/g)||[]).length===1);
ok('　　原因寫在程式裡', /會員多的時候要往下捲才看得到剛加的人/.test(src));

// 實跑排序：抽出 renderGrpPick 的排序段
console.log('\n實跑排序');
{
  const i=src.indexOf('  const selOrder={};');
  const j=src.indexOf('  const firstUnsel=', i);
  const body=src.slice(i,j);
  const run=(data,sel,q='')=>new Function('window','sel','q',
    body+'\nreturn list.map(m=>m.name);')({_grpData:data},sel,q);
  const D=[{id:'a',name:'王小明',mine:false},{id:'b',name:'李大華',mine:false},
           {id:'c',name:'陳美玲',mine:true},{id:'d',name:'張三',mine:false}];

  eq('★ 沒選人 → ★我的會員在前，其餘依姓名（localeCompare 的中文序）',
     run(D,[]), ['陳美玲','張三','李大華','王小明']);
  eq('★ 選了張三 → 張三跳到最上面', run(D,['d']), ['張三','陳美玲','李大華','王小明']);
  eq('★ 依加入順序：先選王小明再選張三', run(D,['a','d']), ['王小明','張三','陳美玲','李大華']);
  eq('　　選了 ★我的會員也照加入順序，不會插回第一', run(D,['d','c']), ['張三','陳美玲','李大華','王小明']);
  eq('　　同名再加一位（multiset）不改變順序', run(D,['d','d','a']), ['張三','王小明','陳美玲','李大華']);
  eq('　　全選 → 完全等於加入順序', run(D,['b','c','a','d']), ['李大華','陳美玲','王小明','張三']);
  eq('　　搜尋只留符合的，已選的仍在前', run(D,['d','a'],'王'), ['王小明']);
  eq('　　搜尋不到 → 空清單', run(D,['a'],'不存在'), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
