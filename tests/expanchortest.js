/* 2026-08-14 魏婉倫案例：「啟用日是 8/25 為什麼到期日只有 9/14」——
   效期從首堂起算，但首堂取消後錨點沒跟著挪。
   修正：單人課（refundTicket）與團課名額取消兩條路，取消首堂時效期改依最早剩餘預約重算。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 單人課：refundTicket');
{
  const F=grabFn('refundTicket');
  ok('★★ 查最早剩餘預約（order date asc）而不只查有沒有', /\.order\('date',\{ascending:true\}\)\.limit\(1\)/.test(F));
  ok('★★ 取消的是首堂且新首堂較晚 → 重錨（start_date＋valid_days−1）',
     /String\(cb\.date\)\.slice\(0,10\)===String\(t\.start_date\)\.slice\(0,10\) && ns>String\(t\.start_date\)\.slice\(0,10\)/.test(F)
     && /de\.setDate\(de\.getDate\(\)\+\(Number\(t\.valid_days\)\|\|0\)-1\)/.test(F));
  ok('★ 全取消仍退回未開通（原行為不變）', /t\.activated_at=null; t\.start_date=null; t\.expire_date=null; reverted=true;/.test(F));
  ok('　　票上留一行說明', /首堂取消，效期改依新首堂/.test(F));
}
console.log('\n② 團課名額取消');
ok('★★ 用帳本淨扣課回推剩餘堂的日期、取消首堂時重錨',
   /const dcnt=\{\}; lgs\.forEach\(l=>\{ dcnt\[l\.booking_id\]=\(dcnt\[l\.booking_id\]\|\|0\)\+\(l\.action==='deduct'\?1:l\.action==='refund'\?-1:0\); \}\);/.test(src)
   && /if\(ds\.length && ds\[0\]>String\(fresh\.start_date\)\.slice\(0,10\)\)/.test(src));
ok('★ 補課券不套（效期不變的既有規則）', /tk\.valid_days && tk\.start_date && !tkIsMakeup\(tk\)/.test(src));
ok('★ 全取消退回未開通', /fresh\.activated_at=null; fresh\.start_date=null; fresh\.expire_date=null;/.test(src));
console.log('\n③ 反向：改約更早的課（2026-08-14 魏婉倫「可用 0 堂」案例）');
ok('★★ 已開通的票不套「起始日前不能用」防線（那條只擋談好未來開課日的票）',
   /String\(t\.start_date\)\.slice\(0,10\)>bookDate && !t\.activated_at\) return false;/.test(src));
ok('★★ 扣課時預約日早於起算日 → 錨點往前挪、效期重算',
   /if\(b && b\.date && String\(b\.date\)\.slice\(0,10\)<String\(ticket\.start_date\)\.slice\(0,10\)\)/.test(src)
   && /ticket\.start_date=ymd\(d\); ticket\.expire_date=termExpire\(d,ticket\.valid_days\);/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
