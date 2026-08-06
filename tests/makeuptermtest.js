/* 2026-08-06 使用者指示：「團課客人週六要請假（優惠票券）→ 要給補課券，
   補課券的期限要從週六那天開始計算」

   原本 grantMakeupTicket 一律 ymd(addDays(TODAY,14))：櫃檯提前兩天登記請假，
   會員就平白少掉兩天。改成基準日＝那堂課的日期；課已經過去的（事後補發）仍以今天起算，
   否則補發當下就快過期。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

/* 今天固定在 2026-08-06（週四），那堂團課是 08-08（週六） */
const TODAY=new Date(2026,7,6);
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const parseYmd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const makeupTerm=new Function('TODAY','ymd','addDays','parseYmd',
  grabFn('makeupTerm')+'\nreturn makeupTerm;')(TODAY,ymd,addDays,parseYmd);

console.log('① 效期起算日（實跑 makeupTerm，今天＝2026-08-06 週四）');
eq('★ 週六(08-08)的課、今天先登記請假 → 從 08-08 起算 14 天＝08-22',
   makeupTerm({category:'小班肌力',date:'2026-08-08'}), {base:'2026-08-08',days:14,expire:'2026-08-22'});
eq('★ 就是今天的課 → 從今天起算（規則不變）',
   makeupTerm({category:'小班肌力',date:'2026-08-06'}), {base:'2026-08-06',days:14,expire:'2026-08-20'});
eq('★ 上週的課事後補發 → 仍從今天起算（不會一發下去就過期）',
   makeupTerm({category:'小班肌力',date:'2026-07-28'}), {base:'2026-08-06',days:14,expire:'2026-08-20'});
eq('　　沒有課日期（會員頁手動補發） → 今天起算',
   makeupTerm({category:'小班肌力'}), {base:'2026-08-06',days:14,expire:'2026-08-20'});
eq('★ 自主訓練類仍是 7 天，起算日規則相同',
   makeupTerm({category:'自主訓練',date:'2026-08-08'}), {base:'2026-08-08',days:7,expire:'2026-08-15'});

console.log('\n② 接線');
ok('★ grantMakeupTicket 走 makeupTerm（不再寫死 addDays(TODAY,14)）',
   /const _term=makeupTerm\(booking\);/.test(src)
   && /const expire=\(makeupDays===_term\.days\) \? _term\.expire : ymd\(addDays\(parseYmd\(_term\.base\),makeupDays\)\);/.test(src)
   && !/const expire=ymd\(addDays\(TODAY,makeupDays\)\);/.test(src));
ok('★ 票種名稱含「自主」的也吃 7 天（原本的 planName 判斷保留）',
   /const makeupDays=\(_term\.days===7 \|\| \(planName&&planName\.includes\('自主'\)\)\) \? 7 : 14;/.test(src));
ok('★ start_date 維持今天（只延後期限，不擋提早使用）',
   /source:'makeup', purchase_date:today, start_date:today, expire_date:expire,/.test(src));
ok('★ 補發視窗顯示真正的起算日與到期日（不再寫死「自今日起 14 天」）',
   /const _tm=makeupTerm\(b\);/.test(src)
   && /效期：自 \$\{_tm\.base===ymd\(TODAY\)\?'今日':_tm\.base\.slice\(5\)\.replace\('-','\/'\)\+'（該堂課日）'\} 起 \$\{_tm\.days\} 天/.test(src)
   && !/效期：自今日起 14 天/.test(src));
ok('★ 請假／補發的提示改報實際效期日',
   /已標記請假：本堂照扣，已發補課券（效期至 \$\{String\(tk\.expire_date\|\|''\)\.slice\(5\)\.replace\('-','\/'\)\}）/.test(src)
   && !/已補發補課券（效期 14 天）/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
