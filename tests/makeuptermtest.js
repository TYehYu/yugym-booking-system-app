/* 2026-08-06 使用者指示：「團課客人週六要請假（優惠票券）→ 要給補課券，
   補課券的期限要從週六那天開始計算」
   → 追加定案：「所有補課券都以開課當天計算，補發也是」

   原本 grantMakeupTicket 一律 ymd(addDays(TODAY,14))＝從按下去的那天算，
   櫃檯提前兩天登記請假、會員就平白少掉兩天。改成基準日一律＝那堂課的日期，
   與按下按鈕的時間無關（含事後補發）。 */
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
/* 2026-08-08 使用者更正：期限含首日（見 termdaytest.js）→ 14 天 ＝ 開課日 +13 */
const termExpire=(base,days)=>{const d=(base instanceof Date)?base:parseYmd(String(base||'').slice(0,10));
  if(!d||isNaN(d.getTime()))return null; return ymd(addDays(d,Math.max(1,Number(days)||1)-1));};
/* 2026-09-05：判準抽成 makeupSelfLike／makeupExpire，makeupTerm 靠它們，一起切進來 */
const makeupTerm=new Function('TODAY','ymd','addDays','parseYmd','termExpire',
  [grabFn('makeupSelfLike'),grabFn('makeupExpire'),grabFn('makeupTerm')].join('\n')
  +'\nreturn makeupTerm;')(TODAY,ymd,addDays,parseYmd,termExpire);

console.log('① 效期起算日（實跑 makeupTerm，今天＝2026-08-06 週四）');
/* ══ 2026-09-05 使用者定案：含不含開課當天，看「那天還能不能用得到」══
   「自主訓練的 7 天是因為客人當天其實還可以預約自主訓練，所以要當天開始計算」
   「但是請假的客人代表他當天是不能來的，所以補課的效期要從隔天開始計算」
   起因是客人的說法：9/12 請假、補課券兩週，往後兩個週六（9/19、9/26）都要能補。 */
eq('★★★ 團課：08-08 的課請假 → 從隔天起算 14 天＝08-22（不是含當天的 08-21）',
   makeupTerm({category:'小班肌力',date:'2026-08-08'}),
   {base:'2026-08-08',days:14,self:false,expire:'2026-08-22'});
eq('★★ 就是今天的課 → 錨點仍是今天，但一樣從隔天算（08-20）',
   makeupTerm({category:'小班肌力',date:'2026-08-06'}),
   {base:'2026-08-06',days:14,self:false,expire:'2026-08-20'});
eq('★ 上週的課事後補發 → 一樣錨在開課日 07-28（隔天起算＝08-11），不是今天',
   makeupTerm({category:'小班肌力',date:'2026-07-28'}),
   {base:'2026-07-28',days:14,self:false,expire:'2026-08-11'});
eq('　　開課日久遠 → 算出來就是已過期（規則本身的結果，補發視窗會警示）',
   makeupTerm({category:'小班肌力',date:'2026-05-01'}),
   {base:'2026-05-01',days:14,self:false,expire:'2026-05-15'});
eq('　　沒有課日期（會員頁手動補發） → 錨點退回今天',
   makeupTerm({category:'小班肌力'}), {base:'2026-08-06',days:14,self:false,expire:'2026-08-20'});
eq('★★★ 自主訓練：7 天且**含開課當天**（那天他還能再約一次自主訓練）→ 08-14',
   makeupTerm({category:'自主訓練',date:'2026-08-08'}),
   {base:'2026-08-08',days:7,self:true,expire:'2026-08-14'});
/* 客人那個情境的實跑：缺席 9/12（週六），往後兩個週六都要補得到 */
eq('★★★ 李曉娟情境：缺席 9/12 週六 → 效期至 9/26，9/19 與 9/26 兩個週六都在裡面',
   (()=>{ const t=makeupTerm({category:'小班肌力',date:'2026-09-12'});
          return {expire:t.expire, 含9_19:t.expire>='2026-09-19', 含9_26:t.expire>='2026-09-26'}; })(),
   {expire:'2026-09-26', '含9_19':true, '含9_26':true});
ok('★★ 兩種票的差別就是「那天用不用得到」，理由寫在 makeupTerm 原地',
   /自主訓練不綁固定時段，同一天換個時間\n\s*就能來，那天對他是有價值的/.test(src)
   && /週課一天只有那一堂，缺席日對他是零價值的一天/.test(src));

console.log('\n② 接線');
ok('★ grantMakeupTicket 走 makeupTerm（不再寫死 addDays(TODAY,14)）',
   /const _term=makeupTerm\(booking\);/.test(src)
   && !/const expire=ymd\(addDays\(TODAY,makeupDays\)\);/.test(src));
ok('★★ 票種名稱含「自主」但 category 不含的那種票，也走自主那一套（含當天）',
   /const _selfLike=_term\.self \|\| makeupSelfLike\(planName\);/.test(src)
   && /const makeupDays=_selfLike \? 7 : 14;/.test(src));
ok('★★★ 含不含開課當天只有一支判準（兩邊各算一次遲早會分岔）',
   /const expire=makeupExpire\(_term\.base, makeupDays, _selfLike\);/.test(src)
   && /function makeupExpire\(base, days, selfLike\)\{/.test(src)
   && !/termExpire\(_term\.base,makeupDays\)/.test(src));
/* ══ 2026-09-05 使用者回報：李曉娟 9/12 團課請假「補課券卻是今天開始計算」══
   效期本來就是對的（9/12 起算 14 天含當天＝9/25，從今天算會是 9/18）。
   錯的是 start_date 寫今天，而會員票券明細那一列的標籤就叫「開始計算」。
   除了讀起來對不上，提前請假還會開一個洞：券今天就能用 → 用掉後再取消請假，
   revokeMakeupTicket 只收「完全沒用過」的，於是券留著、原本那一格也退回來，
   淨得一堂免費課。改成與效期同一個錨點。 */
ok('★★★ start_date 與效期同一個錨點（_term.base，不是今天）',
   /source:'makeup', purchase_date:today, start_date:_term\.base, expire_date:expire,/.test(src)
   && !/start_date:today, expire_date:expire,/.test(src));
ok('★★★ 購買日仍是今天（那是「什麼時候發的」，跟起算日是兩件事）',
   /purchase_date:today, start_date:_term\.base/.test(src));
ok('★★ 手動補發沒有課日期時退回今天（makeupTerm 的既有退路，別被改掉）',
   /const base=String\(\(booking&&booking\.date\)\|\|''\)\.slice\(0,10\) \|\| ymd\(TODAY\);/.test(src));
ok('★★ 補課券沒有 valid_days，所以那兩條會改寫 start_date 的路走不到它',
   /補課券沒有 valid_days，所以 activateTicketIfNeeded 與首堂取消退效期/.test(src));
ok('★★ 為什麼不能維持今天（那個免費課的洞）寫在原地',
   /用掉之後再取消請假/.test(src) && /淨得一堂免費課/.test(src));
/* 實跑：確認新的起算日在「提前請假」與「事後補發」兩種情境下都算對 */
eq('★★★ 實跑・提前請假（今天 9/05、課在 9/12）→ 起算 9/12、到期 9/26',
   (()=>{ const t=makeupTerm({category:'小班肌力',date:'2026-09-12'});
          return {start:t.base, expire:t.expire}; })(),
   {start:'2026-09-12', expire:'2026-09-26'});
eq('★★★ 實跑・事後補發（課在 8/08）→ 起算落在過去，不會擋掉任何預約',
   (()=>{ const t=makeupTerm({category:'小班肌力',date:'2026-08-08'});
          return {start:t.base, expire:t.expire}; })(),
   {start:'2026-08-08', expire:'2026-08-22'});
ok('★★ 補發視窗要講清楚是「起」還是「之後」（不然櫃檯自己對會差一天）',
   /const _tm=makeupTerm\(b\);/.test(src)
   && /\(_tm\.self\?'起':'之後'\)/.test(src)
   && !/效期：自今日起 14 天/.test(src));
ok('★ 開課日起算已過期時，補發視窗先警示',
   /依開課日起算已超過效期，補發後即為過期票券/.test(src));
ok('★ 請假／補發的提示改報實際效期日',
   /已標記請假：本堂照扣，已發補課券（效期至 \$\{String\(tk\.expire_date\|\|''\)\.slice\(5\)\.replace\('-','\/'\)\}）/.test(src)
   && !/已補發補課券（效期 14 天）/.test(src));

/* ══ 卡片要講起算日（2026-09-05 第二報）══════════════════════════════
   資料改對之後使用者仍回報「現在看到還是 9/5」—— 因為卡片那一行寫的是
   tkBuyDateHtml，顯示 purchase_date（發券日），從頭到尾沒顯示過起算日。
   一般票券兩者同一天所以看不出問題，補課券是唯一會分開的票種。 */
console.log('\n③ 卡片顯示（補課券講起算日，不是購買日）');
(function(){
  const i=src.indexOf('function tkBuyDateHtml(t){');
  if(i<0) throw new Error('切不到 tkBuyDateHtml');
  let d=0,j=src.indexOf('{',i),e=j;
  for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){e=k+1;break;}} }
  const fn=new Function(src.slice(i,e)+'\nreturn tkBuyDateHtml;')();

  const mk=fn({source:'makeup',purchase_date:'2026-09-05',start_date:'2026-09-12'});
  ok('★★★ 補課券顯示起算日 9/12（不是發券日 9/05）',
     /起算 <b class="num">2026\/09\/12<\/b>/.test(mk) && !/購買/.test(mk), mk);
  ok('★★ 發券日仍看得到（櫃檯對帳會問「這張什麼時候發的」）',
     /（2026\/09\/05 補發）/.test(mk), mk);
  const same=fn({source:'makeup',purchase_date:'2026-09-05',start_date:'2026-09-05'});
  ok('★★ 兩個日期同一天（事後補發／手動補發）就不重複寫',
     /起算 <b class="num">2026\/09\/05<\/b>$/.test(same), same);
  const norm=fn({source:'purchase',purchase_date:'2026-08-15',start_date:'2026-08-15'});
  ok('★★★ 一般票券照舊講「購買」（這條只准影響補課券）',
     /^購買 <b class="num">2026\/08\/15<\/b>$/.test(norm), norm);
  const old=fn({source:'import',start_date:'2026-01-02'});
  ok('★★ 舊系統匯入、沒有購買日的那條退路沒被擋掉',
     /（起始日）/.test(old), old);
})();

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
