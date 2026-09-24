/* 主管獎金的門檻設定（2026-09-24 使用者回報：「已經有一個教練達到100堂 但卻沒有變6000」
   「我剛剛去加那一列100/$2000 跳錯誤不給我改」）

   兩個 bug 疊在一起：
     ① hrReadTeamTiers 全文件掃 .hr-tt-row，掃到「主管津貼」那一列（沒有 .htt-c）
        → TypeError → 外層 try/catch 吞掉 → 門檻／名單／主管津貼三樣一起沒存
        這個洞從 0908 加主管津貼那一列的當下就在，所以第二階一直加不上去。
     ② 預設與 fallback 只有第一階（80/4000），把「100 堂追加 2,000」吃掉。
   正式庫的 team_tiers 因此停在一階，0923 薪資單上 105 堂的教練只算到 4,000。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 讀門檻只看 #hr-tt-list（主管津貼那一列不能被當成門檻）');
{
  /* 重現當時的 DOM：門檻清單 ＋ 一列「主管津貼」（同樣掛 .hr-tt-row，但沒有 .htt-c／.htt-a）。 */
  const mkRow=(c,a)=>({ querySelector:s=> s==='.htt-c'?{value:c}: s==='.htt-a'?{value:a}:null });
  const supRow={ querySelector:()=>null };          // 主管津貼那一列
  const list={ querySelectorAll:()=>[mkRow(80,4000), mkRow(100,2000)] };
  const doc={ getElementById:id=> id==='hr-tt-list'?list:null,
              querySelectorAll:()=>[supRow, mkRow(80,4000), mkRow(100,2000)] };
  const f=new Function('document', grab('hrReadTeamTiers')+'\nreturn hrReadTeamTiers;')(doc);
  eq('★★★ 讀得出兩階（0908 起這裡會 TypeError，三樣設定一起存不進去）',
     f(), [{classes:80,amount:4000},{classes:100,amount:2000}]);
  ok('★★★ 不掃全文件（掃到主管津貼那一列就會炸）',
     /const box=document\.getElementById\('hr-tt-list'\);/.test(src)
     && !/\[\.\.\.document\.querySelectorAll\('\.hr-tt-row'\)\]/.test(src));
  /* 第二道防線：就算容器選錯，沒有 .htt-c 的列也只是被跳過，不會整段爆掉。 */
  const doc2={ getElementById:()=>({ querySelectorAll:()=>[supRow, mkRow(80,4000)] }) };
  const f2=new Function('document', grab('hrReadTeamTiers')+'\nreturn hrReadTeamTiers;')(doc2);
  eq('★★★ 沒有 .htt-c 的列直接跳過，不拋例外', f2(), [{classes:80,amount:4000}]);
  ok('★★ 沒有那一塊時回空陣列（不是 undefined）—— 呼叫端只靠 hrReadTeamMembers 判斷要不要存',
     JSON.stringify(new Function('document', grab('hrReadTeamTiers')+'\nreturn hrReadTeamTiers;')(
       { getElementById:()=>null })())==='[]');
  eq('★★ 空白列（0/0）濾掉、由小到大排序',
     new Function('document', grab('hrReadTeamTiers')+'\nreturn hrReadTeamTiers;')(
       { getElementById:()=>({ querySelectorAll:()=>[mkRow(100,2000), mkRow(0,0), mkRow(80,4000)] }) })(),
     [{classes:80,amount:4000},{classes:100,amount:2000}]);
  ok('★★ 成因寫在原地（下一個人不要又把它改回全文件掃）',
     /而上面「主管津貼」那一列為了共用 grid 版型也掛了 \.hr-tt-row/.test(src));
}

console.log('\n② 預設與 fallback 都要有第二階');
{
  ok('★★★ SALARY_GLOBAL_DEFAULT 兩階',
     /team_tiers: \[\{classes:80, amount:4000\}, \{classes:100, amount:2000\}\],/.test(src));
  ok('★★★ leaderBonusOf 沒設 team_tiers 時，退回舊欄位的**兩個**門檻',
     /\.concat\(\(Number\(G\.leader_t2\)>0 && Number\(G\.leader_b2\)>0\)\s*\n\s*\? \[\{classes:Number\(G\.leader_t2\), amount:Number\(G\.leader_b2\)\}\] : \[\]\);/.test(src));
  ok('★★★ 設定畫面的 fallback 也是兩階（三處要一致，不然畫面與試算會對不起來）',
     /:\[\{classes:80,amount:4000\},\{classes:100,amount:2000\}\];/.test(src));
}

console.log('\n③ 多階是「追加」不是「取代」');
{
  const fn=new Function('LEADER_NEW_FROM','LEADER_TEAM_FROM',
    grab('leaderBonusOf')+'\nreturn leaderBonusOf;')('2026-08','2026-09');
  const G={ team_tiers:[{classes:80,amount:4000},{classes:100,amount:2000}], team_members:null };
  const rows=[{id:'A',name:'黃沛瀞',classes:85},{id:'B',name:'鄭百益',classes:105},{id:'C',name:'小明',classes:40}];
  const r=fn({is_manager:true}, {leaderRows:rows, leaderMgrs:['m1','m2'], month:'2026-09'}, G, '2026-09');
  eq('★★★ 105 堂＝4,000＋2,000＝6,000（使用者回報的那一筆）',
     r.hitRows.map(x=>x.name).join(',')+'|'+r.pool, '黃沛瀞,鄭百益|10000');
  eq('★★★ 池 $10,000 ÷ 2 位主管 ＝ $5,000', r.pay, 5000);
  ok('★★ 明細把每一位的金額寫出來', /鄭百益 105 堂 \$6,000/.test(r.detail), r.detail);
  /* 修好之前的樣子：只有一階 → 105 堂也只拿 4,000（正式庫就是這個狀態） */
  const bad=fn({is_manager:true}, {leaderRows:rows, leaderMgrs:['m1','m2'], month:'2026-09'},
    { team_tiers:[{classes:80,amount:4000}], team_members:null }, '2026-09');
  eq('　　（對照）只有一階時 105 堂只給 4,000 —— 使用者看到的就是這個', bad.pay, 4000);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
