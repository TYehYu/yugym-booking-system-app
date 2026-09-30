/* 分期不等於約別分期 —— 合約申請那條路漏改（2026-09-30 使用者回報）：
   「櫃檯反應 楊慧淳這一筆選了續約 最後在這邊還是變成分期」
   「因為櫃檯早上看到圓章是分 是他更正了」

   根因：grFillApply（合約申請 → 櫃檯補收款資訊 → 發放）裡
       sale_kind: isInstall ? 'installment' : (P.sale_kind||null)
   只要勾了分期就把櫃檯選的約別蓋掉。這一行是 0828 寫的，而 0907 已經定案
   「分期繳費不等於約別分期」（gtSaleKindSync 那段），前端改好了、這條路漏改。

     約別 ＝ 這張票怎麼成立的（第一次買／用完再買）  ← 票券層級，櫃檯選
     分期 ＝ 這筆錢怎麼收的                          ← 收款層級，系統自己標

   ⚠ 這一格直接連到教練的續約獎金：蓋成分期＝那筆續約獎金默默不見。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const grabFn=n=>{let i=src.indexOf('function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 實跑 grFillApply —— 只比字串抓不到「哪一個分支蓋掉了值」，這一支非實跑不可。
   ⚠ Proxy 作用域要放行 globalThis，否則 Number／String 之類會變 undefined。 */
function run(fields, P){
  const box=Object.assign({'gr-amt':'19200','gr-method':'cash','gr-install':'1'}, fields);
  const env={
    document:{getElementById:id=>(id in box)?{value:box[id]}:null},
    showToast:()=>{},
    window:{_grVoucherMax:0,_grVouchers:[]},
    splitSessions:(t,n)=>Array.from({length:n},()=>Math.floor(t/n)),
    splitAmount:(a,n)=>Array.from({length:n},()=>Math.round(a/n)),
  };
  const scope=new Proxy(env,{ has:()=>true,
    get:(t,k)=>(k in t)?t[k]:((k in globalThis)?globalThis[k]:undefined) });
  const f=new Function('scope','with(scope){return ('+grabFn('grFillApply')+')}')(scope);
  return f(P, true);
}

console.log('① 勾了分期，約別一個字都不會被動到');
{
  /* 楊慧淳 TK-mumhoocj8erq：櫃檯建約時選「續約」，補收款時勾 3 期 */
  const r=run({'gr-install':'3'}, {total:24, sale_kind:'renewal'});
  eq('★★★ 續約 ＋ 分期 3 期 → 還是續約（這就是楊慧淳那一筆）', r.sale_kind, 'renewal');
  eq('★★★ 分期資料照樣建起來（付款方式沒有被一起改掉）',
     [r.isInstall, r.installCount, !!r.installment, r.installment.count], [true,3,true,3]);
  eq('★★★ 新約 ＋ 分期 → 還是新約（許智宜那種第一次買的）',
     run({'gr-install':'3'}, {total:24, sale_kind:'new'}).sale_kind, 'new');
  eq('★★ 櫃檯真的選了「分期」就照他的（陳瀚竣那筆是看過紙本合約手動定的）',
     run({'gr-install':'3'}, {total:24, sale_kind:'installment'}).sale_kind, 'installment');
  eq('★★ 沒標約別的（團課／運動按摩／單堂）維持 null，不要憑空長出一個',
     [run({'gr-install':'3'}, {total:24}).sale_kind,
      run({'gr-install':'3'}, {total:24, sale_kind:''}).sale_kind], [null,null]);
  eq('★★★ 不分期時也一樣照櫃檯選的', run({}, {total:24, sale_kind:'renewal'}).sale_kind, 'renewal');
}

console.log('\n② 原本那條蓋掉約別的路已經拆掉');
{
  ok('★★★ 不再有「勾了分期就寫 installment」那一行',
     !/sale_kind: isInstall \? 'installment'/.test(src));
  ok('★★★ 改成直接照 payload 走', /^\s*sale_kind: P\.sale_kind\|\|null,$/m.test(src));
  ok('★★ 成因與規則寫在原地（別再改回去）',
     /約別 ＝ 這張票怎麼成立的（第一次買／用完再買）  ← 票券層級，櫃檯選/.test(src)
     && /這一格直接連到教練的續約獎金：蓋成分期＝那筆續約獎金默默不見/.test(src));
}

console.log('\n③ 0907 那一頭（建約時的下拉）沒被動到');
{
  /* 前端那邊 0907 就修好了：用內建分期賣時不自動選分期，但「分期」仍是合法選項 */
  ok('★★★ 建約的約別下拉三個選項都在',
     /<option value="new">新約<\/option><option value="renewal">續約<\/option><option value="installment">分期<\/option>/.test(src));
  ok('★★★ 改分期數會重算選項（0929 楊慧淳就是這樣被選成分期的）',
     /try\{ if\(typeof window\._gtHasPt!=='undefined'\) gtSaleKindOpts\(!!window\._gtHasPt\); \}catch\(_\)\{\}/.test(src));
  ok('★★ 分期時提示「第一期算續約」', /<b>分期繳費的第一期算續約<\/b>/.test(src));
  ok('★★ 送出時讀的就是那個下拉', /sale_kind:\(document\.getElementById\('gt-salekind'\)\|\|\{\}\)\.value\|\|null,/.test(src));
}

console.log('\n④ 後續各期的收款列仍然自己標「分期」（票券那一格不用跟著標）');
{
  ok('★★★ 收款列固定 kind=installment，不讀票券約別',
     /tk:_t\?_t\.id:undefined, kind:_t\?'installment':undefined,/.test(src));
  ok('★★★ 票券列（首期）照票券自己的約別', /kind:_saleKindOf\(t\),/.test(src));
  ok('★★ 續約獎金只認 renewal（所以蓋成 installment 就是少發錢）',
     /if\(t\.sale_kind!=='renewal'\) return;/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
