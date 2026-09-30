/* 分期期數改成獨立一枚章（2026-09-30 使用者回報）：
   「櫃檯反應 楊慧淳這一筆選了續約 最後在這邊還是變成分期 你可以幫我追蹤一下哪邊錯誤了嗎」

   追下去資料是對的 —— PUR-mumhooqjsqn7 / TK-mumhoocj8erq，sale_kind='renewal'，
   圓章畫的就是「續」。錯在用詞：「分期」同時是**約別**的一個選項、也是**付款方式**，
   而營收明細把它黏在方案名後面（「主顧客友善1V2（分期）」），櫃檯就讀成約別被改掉了。

   改成方案名乾淨、期數獨立一枚章寫「1/3 期」（使用者從三個方案裡挑的）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ');

console.log('① 期數算得對');
{
  const F=new Function('return '+g('function tkInsOf(t, pur){','\n}'))();
  /* 楊慧淳那張票的真實形狀 */
  const TK={installment:{paid:[true,false,false],count:3,amounts:[6400,6400,6400],current:1,segments:[4,4,4]}};
  eq('★★★ 票券列＝賣票那一刻，一定是第 1 期', F(TK,null), {n:1,total:3});
  eq('★★★ 後續各期從收款的 note 取', F(TK,{note:'（分期第2期／總額 $19,200）'}), {n:2,total:3});
  eq('★★ 第 3 期', F(TK,{note:'（分期第3期／總額 $19,200）'}), {n:3,total:3});
  /* ⚠ 不能讀 installment.current：那是「現在進行到第幾期」。
       翻看 9/29 那一天時 current 可能已經是 3，第 1 期那一列就會標成 3/3。 */
  eq('★★★ 不吃 installment.current（翻歷史日期時它早就往前走了）',
     [F({installment:{count:3,current:3}},null).n, F({installment:{count:3,current:3}},{note:'（分期第1期）'}).n],
     [1,1]);
  eq('★★ note 認不出期數就留 null（不要猜一個數字出來）',
     F(TK,{note:'手動補收'}), {n:null,total:3});
  eq('★★ 沒有 note 也不會爆', F(TK,{}), {n:null,total:3});
  eq('★★★ 不是分期票就回 null（一般票不該長出章）',
     [F({},null), F(null,null), F({installment:null},null)], [null,null,null]);
  eq('★★ 沒有 count 時退回用 amounts 的長度', F({installment:{amounts:[100,100]}},null), {n:1,total:2});
}

console.log('\n② 章畫得對');
{
  const C=new Function('return '+g('function revInsChip(r){','\n}'))();
  ok('★★★ 楊慧淳那一列畫「1/3 期」', /<span class="rv-ins" title="分期付款，共 3 期">1\/3 期<\/span>/.test(C({ins:{n:1,total:3}})));
  ok('★★ 第 2 期', /2\/3 期/.test(C({ins:{n:2,total:3}})));
  ok('★★ 期數認不出來就只寫「分期」（仍然比黏在方案名後面清楚）',
     />分期<\/span>/.test(C({ins:{n:null,total:3}})));
  eq('★★★ 不是分期的列整個不畫（不要留一枚空章）',
     [C({}), C(null), C({ins:null})], ['','','']);
}

console.log('\n③ 方案名乾淨了');
{
  ok('★★★ 票券列不再把「（分期）」黏在方案名後面',
     /it:\(t\.plan_name\|\|'票券'\), ins:tkInsOf\(t,null\),/.test(src)
     && !/\+\(t\.installment&&typeof t\.installment==='object'\?'（分期）':''\)/.test(bare));
  ok('★★★ 分期後續各期也一樣（原本是「（分期收款）」）',
     /it:\(p\.plan_name\|\|\(\{reactivate:'票券重啟',facility_rental:'場地租借',merchandise:'商品'\}\[p\.source\]\|\|'收款'\)\),/.test(src)
     && /ins:\(p\.source==='installment'\?tkInsOf\(_t,p\):null\),/.test(src)
     && !/'（分期收款）'/.test(bare));
  /* it 有三個使用端、其中兩個會跳脫，所以期數非得另外帶一個欄位不可 ——
     塞 HTML 進 it 的話，清單那兩處會把標籤原樣印出來 */
  ok('★★★ 三個使用端都接上了（首頁卡／全部清單／側滑視窗）',
     (src.match(/\$\{revInsChip\(r\)\}/g)||[]).length===2
     && /<span class="rvp-k">購買方案<\/span><span class="rvp-v">\$\{esc\(r\.it\|\|'—'\)\}\$\{/.test(src));
  ok('★★ 側滑視窗空間夠，寫整句「第 1/3 期」', /`第 \$\{r\.ins\.n\}\/\$\{r\.ins\.total\} 期`/.test(src));
}

console.log('\n④ 約別那一欄沒被動到（那才是櫃檯選的東西）');
{
  /* 約別章走 _saleKindOf(t) → 票券的 sale_kind，跟付款方式是兩回事。
     楊慧淳那筆 sale_kind='renewal'，章本來就畫「續」—— 這次一個字都不該改到。 */
  ok('★★★ 票券列的約別仍然只看票券的 sale_kind', /kind:_saleKindOf\(t\),/.test(src));
  ok('★★★ 分期後續各期仍然標「分期」章（首期＝票券列，照票券約別）',
     /tk:_t\?_t\.id:undefined, kind:_t\?'installment':undefined,/.test(src));
  ok('★★ 0929 那條「用內建分期賣時，約別不給選分期」還在',
     /SALE_KIND_OPTS|sale_kind/.test(src) && !/（分期）'\):\(t\.plan_name/.test(bare));
  ok('★★ 成因寫在原地（下一個人不要又把「分期」黏回方案名）',
     /「分期」同時是\*\*約別\*\*的一個選項、/.test(src)
     && /也是\*\*付款方式\*\*/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
