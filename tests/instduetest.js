/* 分期票先把三期都畫出來（2026-10-12 使用者：「分期的票券 有辦法先顯示三期嗎
   我這個是mac的畫面」，附截圖：主顧客1V2 12 堂，右下只有 08/04 與 09/22 兩列）

   原本右下角那幾列只從 purchases 長出來，所以第 3 期收款之前永遠只有兩列，
   櫃檯得自己記得「這張是分幾期的」。期數與各期金額本來就存在票上：
   installment = {count:3, amounts:[7200,7200,7200], paid:[...], segments:[4,4,4]}。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* ⚠ tkMoneyHtml 的註解裡刻意不含大括號字元（見那支函式的警告），所以數括號抽得出來 */
function grab(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到 '+name);
  let d=0;
  for(let k=src.indexOf('{', i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
  throw new Error('括號沒收完 '+name);
}
const tkMoneyHtml=new Function('isDeskLike','window',grab('tkMoneyHtml')+'; return tkMoneyHtml;')(()=>true, {});

const mk=(invs, inst)=>{
  const W={_tkPayMap:{T1:{m:'transfer', invs}}};
  const f=new Function('isDeskLike','window',grab('tkMoneyHtml')+'; return tkMoneyHtml;')(()=>true, W);
  return f({id:'T1', amount_paid:14100, installment:inst});
};
const PAID2=[
  {no:null, amt:6900, pm:'transfer', at:'2026-08-04T06:00:00Z', vn:1, va:300, cu:0, lp:7200},
  {no:'FX28688382', amt:7200, pm:'transfer', at:'2026-09-22T06:00:00Z', vn:0, va:0, cu:0, lp:7200},
];
const INST3={count:3, amounts:[7200,7200,7200], paid:[true,true,false], current:2, segments:[4,4,4]};

console.log('① 使用者截圖那一張：收了兩期、分三期');
const h=mk(PAID2, INST3);
eq('★★★ 畫出三列', (h.match(/class="tk-payrow/g)||[]).length, 3);
eq('★★★ 第三列是「未繳」', (h.match(/tk-payrow-due/g)||[]).length, 1);
ok('★★★ 未繳那列帶出該期金額 $7,200', /tk-payrow-due[\s\S]*?\$7,200[\s\S]*?未繳/.test(h));
ok('★★ 已收的兩列不受影響（發票號碼還在）', h.indexOf('FX28688382')>=0);
ok('★★ 已收的金額以 purchases 為準，不被 amounts 覆蓋（第 1 期是 $6,900 不是 $7,200）',
   /\$6,900/.test(h));

console.log('\n② 不要多畫也不要少畫');
eq('★★★ 三期收滿就只有三列、沒有未繳',
   (x=>[(x.match(/class="tk-payrow/g)||[]).length,(x.match(/tk-payrow-due/g)||[]).length])
   (mk(PAID2.concat([{no:'FX1', amt:7200, pm:'cash', at:'2026-10-20T06:00:00Z'}]), INST3)), [3,0]);
eq('★★★ 非分期票（沒有 installment）維持一列',
   (x=>[(x.match(/class="tk-payrow/g)||[]).length,(x.match(/tk-payrow-due/g)||[]).length])
   (mk([PAID2[1]], null)), [1,0]);
eq('★★ 收款筆數比期數多（補收、改期）也不會砍掉多的那幾列',
   (x=>(x.match(/class="tk-payrow/g)||[]).length)
   (mk(PAID2.concat([{no:null,amt:100,pm:'cash',at:'2026-10-01T06:00:00Z'}]), {count:2, amounts:[7200,7200]})), 3);

console.log('\n③ 版面：多期是 grid，每一列的格子數要一樣');
ok('★★★ 未繳那列也輸出日期與付款方式的空格（少一格整列會往左位移）',
   /tk-payrow-due[\s\S]*?tk-when-na[\s\S]*?tk-pay-na/.test(h));
ok('★★ 三列都算 multi（會套 tk-paylist-multi 橫排）', /tk-paylist-multi/.test(h));

console.log('\n④ 顏色語意：未繳不是警示');
ok('★★ 用淡化＋灰籤，不用紅色（紅>金>綠；分期還沒到期不是錯）',
   /\.tk-payrow-due\{opacity:\.5;\}/.test(src)
   && /\.tk-due\{[^}]*color:var\(--t2\)/.test(src)
   && !/\.tk-due\{[^}]*danger/.test(src));

console.log('\n⑤ 判斷依據');
ok('★★★ 用收款筆數補到 count，不是看 installment.paid 那組旗標',
   /for\(let k=_list\.length;k<_instN;k\+\+\) _list\.push\(\{due:true, amt:Number\(_amts\[k\]\)\|\|0\}\);/.test(src)
   && /不要用 installment\.paid 判斷/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
