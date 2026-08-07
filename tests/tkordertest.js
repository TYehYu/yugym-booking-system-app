/* 2026-08-03 使用者回報＋定案（李約儒 #1／#4 案例）：
   「預約的時候應該要先把 #1 先使用才對，可是系統先用了 #4」
   「這種先後順序的預約，理論上應該要從編號比較前面的票券先使用，
     除非有後面的票券期限比較短的情況發生，才會使用期限較近的」

   出包的機制：舊排序是「到期日 asc、無到期日排最後」。#1（5/30 買）沒有效期
   → 被排到最後；#4（主顧友善，7/18 買、2027-09 到期）有效期 → 排前面。
   一年後才到期不叫「期限比較短」，卻先吃了新票。
   另外 #4 的起始日是 9/4 —— 還沒生效的票根本不該是候選。

   新規則（listUsableTickets）：
   ① 限時段票（友善）最先（只能平日 18:00 前用，最容易白白過期）
   ② 30 天內要到期的 → 依到期日先用（「期限比較短」的例外；四週票天生落在這裡，
      2026-07-30「別把四週票留到過期」的行為不變）
   ③ 其餘照購買順序先進先出（＝票券編號順序）
   加上：起始日還沒到的票，該日期不能用（tkFitsBooking）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 抽出 sort 比較器實跑 */
const i=src.indexOf('.sort((a,b)=>{', src.indexOf('async function listUsableTickets'));
const j=src.indexOf('});', i);
const cmpSrc='return '+src.slice(i+6, j+1).replace(/^\(/,'(');
const TODAY=new Date(2026,7,3);   // 2026-08-03
/* 2026-08-07：排序多了「同一天買的付費票優先」→ 沙箱補上 tkIsGift 替身
   （本檔的案例都不是加贈票，行為不變；加贈規則本身由 tkpickgifttest 驗）。 */
const grabFn=n=>{let k=src.indexOf('function '+n+'(');if(src.slice(k-6,k)==='async ')k-=6;
  let d=0;for(let z=src.indexOf('{',k);z<src.length;z++){if(src[z]==='{')d++;else if(src[z]==='}'){d--;if(!d)return src.slice(k,z+1);}}};
const _tkIsGift=new Function(grabFn('tkIsGift')+'\nreturn tkIsGift;')();
const mk=(restricted)=>new Function('tkIsTimeRestricted','tkIsGift','parseYmd','TODAY',
  'const cmp='+src.slice(i+6, j+1)+'; return cmp;')(
  t=>!!(restricted||new Set()).has(t.id),
  _tkIsGift,
  x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
  TODAY);
const sortWith=(list,restricted)=>list.slice().sort(mk(restricted)).map(t=>t.id);

console.log('① 李約儒的案例');
{
  const T1={id:'#1', purchase_date:'2026-05-30', expire_date:null};
  const T4={id:'#4', purchase_date:'2026-07-18', expire_date:'2027-09-03'};
  eq('★ #1（編號前、無效期）要排在 #4（一年後才到期）前面',
     sortWith([T4,T1]), ['#1','#4']);
}

console.log('\n② 「期限比較短」的例外');
{
  const OLD={id:'old', purchase_date:'2026-05-01', expire_date:null};
  const FOURWK={id:'4wk', purchase_date:'2026-07-20', expire_date:'2026-08-17'};   // 14 天後到期
  eq('★ 四週票 30 天內要到期 → 插隊到最前（7/30 的行為不變）',
     sortWith([OLD,FOURWK]), ['4wk','old']);
  const FAR={id:'far', purchase_date:'2026-07-20', expire_date:'2026-12-31'};
  eq('★ 五個月後才到期 → 不算急，照購買順序', sortWith([FAR,OLD]), ['old','far']);
  const A={id:'a', purchase_date:'2026-06-01', expire_date:'2026-08-20'};
  const B={id:'b', purchase_date:'2026-07-01', expire_date:'2026-08-10'};
  eq('　　兩張都急 → 先到期的先用（不看編號）', sortWith([A,B]), ['b','a']);
  eq('　　剛好 30 天（9/2 到期）也算急',
     sortWith([{id:'x',purchase_date:'2026-07-01',expire_date:'2026-09-02'},OLD]), ['x','old']);
}

console.log('\n③ 其他原有規則');
{
  const NORM={id:'n', purchase_date:'2026-05-01', expire_date:null};
  const FRIEND={id:'f', purchase_date:'2026-07-01', expire_date:null};
  eq('★ 限時段票（友善）永遠最先', sortWith([NORM,FRIEND], new Set(['f'])), ['f','n']);
  const P1={id:'p1', purchase_date:'2026-06-01', created_at:'2026-06-01T01:00Z', expire_date:null};
  const P2={id:'p2', purchase_date:'2026-06-01', created_at:'2026-06-01T02:00Z', expire_date:null};
  eq('　　同一天買的照建立順序', sortWith([P2,P1]), ['p1','p2']);
}

console.log('\n④ 起始日還沒到的票不能用');
ok('★ tkFitsBooking 擋掉 start_date > 預約日的票',
   /if\(bookDate && t\.start_date && String\(t\.start_date\)\.slice\(0,10\)>bookDate\) return false;/.test(src));
ok('　　案例寫在程式裡（主顧友善票 9/4 才開始，7/31 的課卻扣了它）',
   /主顧友善票 9\/4 才開始，\n\s*7\/31 的課卻扣了它/.test(src));
ok('★ 規則的三層順序寫在排序旁邊',
   /① 限時段的票（友善）最先/.test(src) && /② 30 天內要到期的票 → 依到期日先用/.test(src)
   && /③ 其餘照購買順序先進先出（＝票券編號的順序）/.test(src));
ok('　　使用者的定案原話記在程式裡',
   /應該從編號比較前面的票券先使用，除非後面的票券期限比較短才先用期限較近的/.test(src));
ok('　　為什麼舊規則錯，寫在程式裡', /一年後才到期不叫「期限比較短」/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
