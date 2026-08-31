/* 補扣未付款預約：分期票只能扣「已開通」的額度（2026-08-31 劉雪珠案例）

   使用者：「這一筆要變成12堂分3期 每4堂一期 然後要歸類在續約
             並且確保之後這種問題不會再發生」

   出事經過（TK-mtgyqnwffb8l，主顧客友善1V1）：
     08:13  櫃檯先建了 12 筆預約（當時沒票可扣）
     08:15  發放票券：12 堂分 3 期、首期只開通 4 堂、只收了第 1 期 $5,200
     08:15:11–16  askChargeUnpaid 把 **12 堂全部補扣光**
   → 客人付了三分之一的錢、課全排了、票券餘額歸零，
     之後「開通下一期」也沒有東西可開。分段開通的鎖等於不存在。

   成因：askChargeUnpaid 用的是 sessions_remaining（12），
   不是 tkUnlockedLeft（4）。tkFitsBooking 與「整串卡位轉正」早就夾了這條線，
   補扣這一支是漏網的第三條路。

   ⚠ 未開通的那一段**不是「超出堂數」**，不能拿去問要不要取消 ——
     取消掉等於把客人已經排好的時段還出去。它們要留成「分期繳費保留」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 補扣改吃已開通額度');
{
  ok('★★★ 可補扣堂數＝tkUnlockedLeft，不是 sessions_remaining',
     /const left=Math\.max\(0, tkUnlockedLeft\(tk\)\);/.test(src)
     && !/const left=Number\(tk\.sessions_remaining\)\|\|0; if\(left<=0\) return;/.test(src));
  ok('★★★ 執行迴圈那一關也改（畫面擋住、執行沒擋等於沒擋）',
     /if\(!tk \|\| !\(tkUnlockedLeft\(tk\)>0\)\) break;/.test(src));
  ok('★★★ 未開通那一段留成分期繳費保留，不進「要不要取消」那一批',
     /const _hold=_inst \? _allUnpaid\.slice\(left, _rem\) : \[\];/.test(src)
     && /const over=_allUnpaid\.slice\(_inst\?_rem:left\)\.filter\(b=>b && b\.pending_contract===true\);/.test(src));
  ok('★★★ 取消掉會把客人排好的時段還出去 —— 理由寫在原地',
     /\*\*絕對不能拿去問要不要取消\*\*：\s*\n\s*取消掉等於把客人已經排好的時段還出去。/.test(src));
  ok('★★ 已開通額度用完、但還有課沒扣時要出聲（不能靜靜什麼都不做）',
     /這張分期票的已開通額度用完了，/.test(src)
     && /收到下一期款項、按「開通下一期」時會自動補綁扣課/.test(src));
  ok('★★ 視窗上把那幾堂列出來（櫃檯要看得到哪幾堂沒扣）',
     /⏳ 另外 <b>\$\{_hold\.length\}<\/b> 堂落在<b>還沒繳費的期數<\/b>裡/.test(src));
  ok('★★ 劉雪珠那個案例寫在原地',
     /她那張 12 堂分 3 期、只繳了第 1 期（開通 4 堂），/.test(src));
}

console.log('\n② 實跑：切法對不對');
{
  /* tkUnlockedLeft 從原始碼挖出來跑 */
  const i=src.indexOf('function tkUnlockedLeft(t){');
  const j=src.indexOf('function tkIsInstall(t){');
  const api=new Function(src.slice(i,j)+'\nreturn {tkUnlockedLeft};')();
  const tk=(total,remain,unlocked,inst)=>({sessions_total:total,sessions_remaining:remain,
    unlocked_sessions:unlocked, installment:inst?{count:3,segments:[4,4,4]}:null});

  eq('★★★ 劉雪珠發票券當下：12 堂／開通 4 → 只能補扣 4 堂',
     api.tkUnlockedLeft(tk(12,12,4,true)), 4);
  eq('★★★ 修正後的現況：已扣 4 → 一堂都不能再補（要等下一期）',
     api.tkUnlockedLeft(tk(12,8,4,true)), 0);
  eq('★★ 開通第 2 期（8 堂）後又能補 4 堂',
     api.tkUnlockedLeft(tk(12,8,8,true)), 4);
  eq('★★★ 非分期票行為完全不變（＝sessions_remaining）',
     [api.tkUnlockedLeft(tk(10,10,null,false)), api.tkUnlockedLeft(tk(10,3,null,false))], [10,3]);

  /* askChargeUnpaid 的三段切法 */
  const split=(all, left, rem, inst)=>({
    charge: all.slice(0,left),
    hold:   inst ? all.slice(left, rem) : [],
    over:   all.slice(inst?rem:left),
  });
  const B=n=>Array.from({length:n},(_,k)=>'B'+(k+1));

  eq('★★★ 劉雪珠：12 堂已排、開通 4、餘額 12 → 扣 4、保留 8、超出 0',
     (r=>[r.charge.length,r.hold.length,r.over.length])(split(B(12),4,12,true)),
     [4,8,0]);
  eq('★★ 排了 14 堂、票只有 12 → 扣 4、保留 8、超出 2（那 2 堂才是真的多的）',
     (r=>[r.charge.length,r.hold.length,r.over.length])(split(B(14),4,12,true)),
     [4,8,2]);
  eq('★★★ 非分期票：排 14 堂、票 10 堂 → 扣 10、保留 0、超出 4（舊行為不變）',
     (r=>[r.charge.length,r.hold.length,r.over.length])(split(B(14),10,10,false)),
     [10,0,4]);

  /* 修好之前的行為，留一條反例釘樁 */
  eq('★★★ 舊算法：用 sessions_remaining 當上限 → 12 堂全扣（＝這次的災情）',
     B(12).slice(0,12).length, 12);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
