/* 2026-08-08 使用者指示：「店長薪資單列出負責的教練」

   原本店長獎金只有一行 detail：達標的人名擠在一起、沒達標的完全看不到。
   店長看不出「還差誰、差幾堂」，月底沒辦法盯 —— 而那正是這筆獎金的用途。

   改成整份名單（含未達標）逐位列出：姓名／堂數（未達標標出還差幾堂）／該位帶來的金額。
   ⚠ 名單只有在「新制 + 已設定計算名單」時才是真的「負責的教練」；
     舊制（七月以前）與「名單未設定」回的是全店名單，列出來會是錯的 → 靠 scoped 分辨。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const LB=new Function('LEADER_NEW_FROM', grabFn('leaderBonusOf')+'\nreturn leaderBonusOf;')('2026-08');

console.log('① 名單本身：只有「負責的教練」才算數');
{
  const rows=[{id:'C1',name:'阿明',classes:95},{id:'C2',name:'小美',classes:78},
              {id:'C3',name:'阿豪',classes:110},{id:'C4',name:'別人的',classes:200}];
  const emp={id:'E1',is_manager:true,leader_members:['C1','C2','C3'],
             leader_t1:80,leader_b1:4000,leader_t2:100,leader_b2:2000};
  const r=LB(emp,{leaderRows:rows,month:'2026-08'},{},'2026-08');
  eq('★★ rows 只留下這位店長負責的三位（不是全店）', r.rows.map(x=>x.id), ['C1','C2','C3']);
  eq('★ scoped 標明「這份是負責名單」', r.scoped, true);
  eq('★ 金額：95→4000、78→0、110→4000+2000', r.pay, 10000);
}
{
  const rows=[{id:'C1',name:'阿明',classes:95}];
  const noList=LB({id:'E1',is_manager:true},{leaderRows:rows,month:'2026-08'},{},'2026-08');
  eq('★★ 名單沒設定 → 不標 scoped（畫面就不會把全店當成負責名單列出來）', !!noList.scoped, false);
  eq('　　金額仍是 0，而且說得出原因', [noList.pay, noList.detail],
     [0,'尚未設定計算名單（薪資規則 → 店長獎金）']);
  const old=LB({id:'E1',is_manager:true,leader_members:['C1']},{leaderRows:rows,month:'2026-07'},{},'2026-07');
  eq('★ 舊制（七月以前的全店除法制）也不標 scoped', !!old.scoped, false);
}

console.log('\n② 薪資單帶出的名單');
{
  const F=grabFn('calcSalary');
  ok('★★ 只在 scoped 時才建名單（舊制／未設名單不會誤列全店）',
     /const leaderList=\(_ld\.scoped && Array\.isArray\(_ld\.rows\)\?_ld\.rows:\[\]\)\.map\(r=>\{/.test(F));
  ok('★ 逐位算出「這位帶來多少錢」（兩段門檻是追加、不是取代）',
     /const pay=\(_ldT1>0&&n>=_ldT1\?_ldB1:0\)\+\(\(_ldT2>0&&n>=_ldT2\)\?_ldB2:0\);/.test(F));
  ok('★★ 未達標的算出「還差幾堂」（達標的不標）',
     /need:\(_ldT1>0&&n<_ldT1\)\?\(_ldT1-n\):\(\(_ldT2>0&&n>=_ldT1&&n<_ldT2\)\?\(_ldT2-n\):0\)/.test(F));
  ok('★ 堂數由多到少（誰快到了排前面）', /\}\)\.sort\(\(a,b\)=>b\.classes-a\.classes\);/.test(F));
  ok('★ 門檻本身也一起帶出去（畫面要寫「門檻 N 堂 $X」）',
     /leaderList, leaderT1:_ldT1, leaderT2:_ldT2, leaderB1:_ldB1, leaderB2:_ldB2,/.test(src));
  ok('　　算不出薪資時的那條 return 也有這些欄位（畫面不會讀到 undefined）',
     /leaderList:\[\], leaderT1:0, leaderT2:0, leaderB1:0, leaderB2:0,/.test(src));
  ok('　　使用者的原話寫在程式裡', /店長薪資單列出負責的教練/.test(src));

  // 逐位金額與「還差幾堂」的實際算法（把那一段抽出來跑）
  const seg=/const leaderList=[\s\S]*?\.sort\(\(a,b\)=>b\.classes-a\.classes\);/.exec(F)[0];
  const run=new Function('_ld','_ldT1','_ldT2','_ldB1','_ldB2', seg+'\nreturn leaderList;');
  const L=run({scoped:true,rows:[{id:'C1',name:'阿明',classes:95},{id:'C2',name:'小美',classes:78},
                                 {id:'C3',name:'阿豪',classes:110}]},80,100,4000,2000);
  eq('★★ 阿豪 110 堂 → $6,000（4000 + 追加 2000）', [L[0].name,L[0].pay,L[0].hit,L[0].need], ['阿豪',6000,true,0]);
  eq('★★ 阿明 95 堂 → $4,000，還差 5 堂到第二段', [L[1].name,L[1].pay,L[1].need], ['阿明',4000,5]);
  eq('★★ 小美 78 堂 → 未達標，還差 2 堂', [L[2].name,L[2].pay,L[2].hit,L[2].need], ['小美',0,false,2]);
  eq('　　合計與 leaderBonusOf 算的一致', L.reduce((s,r)=>s+r.pay,0), 10000);
  const L2=run({scoped:true,rows:[{id:'C1',name:'阿明',classes:95}]},80,0,4000,0);
  eq('★ 第二段門檻填 0 ＝ 關掉（不會被當成沒填而套預設）', [L2[0].pay,L2[0].need], [4000,0]);
}

console.log('\n③ 畫面：達標標綠、沒達標標出還差幾堂');
/* 2026-08-13 更新：跳脫函式 _esc 已統一改名 escH（全檔已無 _esc），斷言跟上新名字 */
ok('★★ 逐位一列（姓名／堂數／金額）',
   /<span class="nl-nm">\$\{escH\(r\.name\|\|'—'\)\}<\/span>/.test(src)
   && /<span class="nl-plan">\$\{r\.classes\} 堂\$\{r\.hit\?'':\(r\.need>0\?`<span style="color:var\(--t3\);">　還差 \$\{r\.need\} 堂<\/span>`:''\)\}<\/span>/.test(src));
ok('★ 達標綠色、未達標灰色破折號（一眼分得出來）',
   /\$\{r\.hit\?'color:var\(--green\);':'color:var\(--t3\);'\}">\$\{r\.hit\?'\$'\+r\.pay\.toLocaleString\(\):'—'\}/.test(src));
ok('★ 底下一行寫「N / M 位達標」與門檻',
   /\$\{sal\.leaderList\.filter\(r=>r\.hit\)\.length\} \/ \$\{sal\.leaderList\.length\} 位達標/.test(src)
   && /門檻 \$\{sal\.leaderT1\} 堂 \$\$\{sal\.leaderB1\.toLocaleString\(\)\}/.test(src)
   && /\$\{sal\.leaderT2\} 堂再加 \$\$\{sal\.leaderB2\.toLocaleString\(\)\}/.test(src));
ok('★★ .pfd-nl 預設收合 → 這一塊要自己帶 open，否則整份名單看不見',
   /\.pfd-nl\{display:none;/.test(src) && /\.pfd-nl\.open\{display:flex;\}/.test(src)
   && /rows\+=`<div class="pfd-nl open" style="margin:2px 0 8px;">/.test(src));
ok('　　為什麼要帶 open，寫在原地', /這份名單沒有展開的按鈕，所以直接帶 open，不然會整塊看不見/.test(src));
ok('　　名單接在「店長獎金」那一列底下', (()=>{
  const a=src.indexOf(`rows+=row('店長獎金'`);
  const b=src.indexOf('rows+=`<div class="pfd-nl open"');
  return a>0 && b>a && (b-a)<600;
})());
ok('　　沒有名單就不畫空盒子', /if\(\(sal\.leaderList\|\|\[\]\)\.length\)\{/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
