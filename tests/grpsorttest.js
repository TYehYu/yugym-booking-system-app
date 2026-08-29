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
/* 2026-08-29：清單拆成「會員 × 票券使用人」一列（見 tkfamusertest），
   分隔線改用 ROWS 找，但判準沒變 —— 仍是「這一列的會員有沒有被選」。 */
ok('★ 已選區與其餘會員之間有分隔標題', /const firstUnsel=ROWS\.findIndex\(r=>!isSel\(r\.m\)\);/.test(src)
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
  /* 只切「會員層的排序」那一段 —— 拆列是排序之後的事，不在這一支的守備範圍。
     2026-08-29 起後面接的是 _famKey／_groupsOf，切點改用它當結尾。 */
  const i=src.indexOf('  const selOrder={};');
  const j=src.indexOf('  /* 依票券使用人拆成幾列', i);
  const body=src.slice(i,j);
  const run=(data,sel,q='')=>new Function('window','sel','q',
    body+'\nreturn list.map(m=>m.name);')({_grpData:data},sel,q);
  /* 2026-08-29 起清單只列「有團體課票券」的會員，所以排序的樣本都要給 sum
     （沒票的會被濾掉，那是另一段的責任，見下面的「只列有票的」）。 */
  const D=[{id:'a',name:'王小明',mine:false,sum:1},{id:'b',name:'李大華',mine:false,sum:1},
           {id:'c',name:'陳美玲',mine:true,sum:1},{id:'d',name:'張三',mine:false,sum:1}];

  eq('★ 沒選人 → ★我的會員在前，其餘依姓名（localeCompare 的中文序）',
     run(D,[]), ['陳美玲','張三','李大華','王小明']);
  eq('★ 選了張三 → 張三跳到最上面', run(D,['d']), ['張三','陳美玲','李大華','王小明']);
  eq('★ 依加入順序：先選王小明再選張三', run(D,['a','d']), ['王小明','張三','陳美玲','李大華']);
  eq('　　選了 ★我的會員也照加入順序，不會插回第一', run(D,['d','c']), ['張三','陳美玲','李大華','王小明']);
  eq('　　同名再加一位（multiset）不改變順序', run(D,['d','d','a']), ['張三','王小明','陳美玲','李大華']);
  eq('　　全選 → 完全等於加入順序', run(D,['b','c','a','d']), ['李大華','陳美玲','王小明','張三']);
  eq('　　搜尋只留符合的，已選的仍在前', run(D,['d','a'],'王'), ['王小明']);
  eq('　　搜尋不到 → 空清單', run(D,['a'],'不存在'), []);

  /* 只列有團體課票券的會員（2026-08-29 使用者指示：「團體課的圓形按鈕＋新增
     這個視窗的列表要顯示有團體課票券的會員就好」）—— 432 位會員捲不完。 */
  console.log('\n只列有票的（搜尋時例外）');
  const N=D.concat([{id:'z',name:'趙沒票',mine:false,sum:0,total:0}]);
  eq('★★ 沒有團課票券的不列出來', run(N,[]).indexOf('趙沒票'), -1);
  /* 2026-08-29 二修（使用者：「下面這些沒有票券的就不要顯示了」）——
     第一版讓搜尋放行、淡化列出寫原因，但使用者看到的還是三行裡兩行不能點。
     這份清單只有一個用途＝挑人進名單，挑不進來的就不佔位置。
     「為什麼找不到某某」由清單底下那句「未列出 N 位沒有團體課票券的會員」回答。 */
  eq('★★ 搜尋也照濾（沒票的一律不列）', run(N,[],'趙'), []);
  eq('★★★ 已經在名單上的一定留著（濾掉的話櫃檯看不到也移不掉，存檔卻還在）',
     run(N,['z']).indexOf('趙沒票'), 0);
  eq('　 手上還有票、只是這堂扣不到（排課佔滿／分期未開通）仍要列出來，理由寫在列上',
     run(D.concat([{id:'y',name:'錢排滿',mine:false,sum:0,total:12,why:'剩下的 3 堂都已經排課了'}]),[])
       .indexOf('錢排滿')>=0, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
