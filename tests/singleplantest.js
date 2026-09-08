/* 單堂教練課（2026-09-08 使用者：「幫我新增一個單堂教練課 1v1 1700 1v2 2000
   這種不需要開合約」，同日補充：「單堂的期限 7天　雖然應該用不到　然後這個不用設定約別」） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 判準只有一支');
{
  const F=new Function('window','return '+g('function gtIsSingle(plan){','\n}'))({});
  eq('★★★ 1 堂＝單堂', F({sessions_base:1,sessions_bonus:0}), true);
  eq('★★★ 送的那幾堂要算進去（4＋1 不是單堂）', F({sessions_base:4,sessions_bonus:1}), false);
  eq('★★★ 只有贈堂也要算（0＋2）', F({sessions_base:0,sessions_bonus:2}), false);
  eq('★★ 0 堂也當單堂（自訂銷售填 0 的極端情況，一樣沒有一包方案可談）', F({sessions_base:0,sessions_bonus:0}), true);
  eq('★★ 讀不到方案就不當單堂（寧可多問一次，不要默默漏掉約別）', F(null), false);
}
ok('★★★ 不用簽約與不用約別共用同一支 —— 兩處各寫一次遲早有一個忘記加 bonus',
   /if\(gtIsSingle\(plan\)\) return false;/.test(g('function gtNeedsContract(sales, plan){','\n}'))
   && /if\(gtIsSingle\(\)\)\{/.test(g('function gtSaleKindSync(){','\n}')));

console.log('\n② 賣票時不畫約別');
{
  const S=g('function gtSaleKindSync(){','\n}');
  ok('★★★ 收起來就要把值清掉 —— 看不到卻有值的下拉等於偷偷替櫃檯標了約別',
     /if\(gtIsSingle\(\)\)\{[\s\S]{0,200}sel\.value=''; sel\.dataset\.touched='';/.test(S));
  ok('★★★ 原因照樣寫出來，不是只是消失（0823 定的規則）',
     /<b>單堂課不需要約別<\/b>/.test(S) && /hint\.style\.display='';/.test(S));
  ok('★★★ 講明「不列入續約獎金」—— 這一格直接連著教練的錢',
     /不列入續約獎金/.test(S));
  ok('★★ submitGrant 讀 value||null，清空就會寫 null',
     src.indexOf("sale_kind:(document.getElementById('gt-salekind')||{}).value||null")>0);
}

console.log('\n③ 事後改約別也擋');
{
  const P=g('async function openSaleKindPick(tkId){','\n}');
  ok('★★★ 同一條規則兩條路都要 —— 少一邊就是一個「改成續約多領獎金」的後門',
     /if\(\(Number\(t\.sessions_total\)\|\|0\)<=1 && ticketCategoryOf\(t\)==='私人教練'\)\{/.test(P));
  ok('★★★ 只擋教練課系（團課／自主訓練本來就沒有約別，不必多一張說明卡）',
     /ticketCategoryOf\(t\)==='私人教練'/.test(P));
  ok('★★ 這裡拿票券自己的堂數判斷（方案可能改過、或是自訂銷售）',
     /這裡拿票券自己的堂數判斷（方案可能已經改過或是自訂銷售）/.test(src));
  ok('★★ 說明卡寫得出理由，不是一句不能改', /這是<b>單堂課<\/b>，沒有約別。/.test(P));
}

console.log('\n④ 不用簽約那條沒有被動到');
ok('★★★ 仍然只對「私人教練」這一類生效',
   /if\(!\(s && s\.cat==='私人教練'\)\) return false;/.test(g('function gtNeedsContract(sales, plan){','\n}')));
ok('★★ 免簽約的那條路才當場問付款方式（gtPaySync）',
   /const need=gtNeedsContract\(\);/.test(g('function gtPaySync(){','\n}')));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
