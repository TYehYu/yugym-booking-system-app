/* 2026-08-08 使用者回報：「友善課程待簽約的課卡，我看的平日晚上跟假日都有出現，
   是忘記設定阻擋了嗎」→ 是忘記了。

   友善教練課／友善自主訓練是限時段票種（ticket_types.time_restricted）：
   只能平日 18:00 前開始。validateBooking 的 0b 段本來就會擋，但它是靠
   bk.ticket_type_id 判斷 —— 而待簽約卡位那一段刻意把它清成 null，
   註解寫「無票 → 不做限時票檢查」。

   那句話是錯的：卡位卡的就是「某一種票券的課」，type_id 一樣會寫進課卡。
   結果是卡在平日晚上／假日的位子建得起來、卻永遠轉不了正 ——
   轉正時 listUsableTickets 會把不合時段的票濾掉，
   櫃檯只看到「該會員沒有此課程的可用票券」，看不出真正卡住的是時段。

   （正式庫實際受影響：24 筆待簽約課卡，邱瑞君週一 19:30 ×12、楊鈞亦週五 18:00 ×12。） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 規則本身（validateBooking 的限時段檢查）');
{
  /* 把 0b 段抽出來單獨跑：平日 18:00「前」開始才行，不設下限 */
  const seg=/const dow=parseYmd\(date\)\.getDay\(\);[\s\S]*?return '此票券僅限平日 18:00 前使用';/.exec(grabFn('validateBooking'))[0];
  const chk=new Function('date','ns','parseYmd',
    'return (function(){'+seg+' return null; })();');
  const P=x=>new Date(x+'T00:00:00');
  eq('★ 平日 10:00 → 可以', chk('2026-08-10',600,P), null);
  eq('★ 平日 17:30 → 可以（貼著界線）', chk('2026-08-10',1050,P), null);
  eq('★★ 平日 18:00 → 不行（是「18:00 前」，不含 18:00 那一格）',
     chk('2026-08-10',1080,P), '此票券僅限平日 18:00 前使用');
  eq('★★ 平日 19:30 → 不行（使用者回報的那一種）',
     chk('2026-08-10',1170,P), '此票券僅限平日 18:00 前使用');
  eq('★★ 週六 10:00 → 不行（假日一律不行，時間再早也一樣）',
     chk('2026-08-08',600,P), '此票券僅限平日 18:00 前使用');
  eq('★ 週日 10:00 → 不行', chk('2026-08-09',600,P), '此票券僅限平日 18:00 前使用');
  eq('　　早上 8:00 可以（不設下限；2026-07-20 使用者更正）', chk('2026-08-10',480,P), null);
}

console.log('\n② 待簽約卡位不再繞過這條規則');
{
  const F=grabFn('submitPendingHold');
  ok('★★ 驗證時帶上票種（原本刻意清成 null）',
     /const vbk=\{id:null,coach_id,category:t\.category,ticket_type_id:type_id\};/.test(F)
     && !/ticket_type_id:null\};   \/\/ 無票 → 不做限時票檢查/.test(F));
  ok('★ 課卡本來就會寫進票種（所以「無票」那個前提本來就不成立）',
     /coach_id,ticket_id:null,ticket_type_id:type_id,category:t\.category/.test(F));
  ok('★★ 連續卡位逐筆驗證，擋掉的會列出原因、不會靜靜少建幾堂',
     /if\(verr\)\{ skipped\.push\(`\$\{String\(d\)\.slice\(5\)\.replace\('-','\/'\)\} \$\{tv\}（\$\{verr\}）`\); continue; \}/.test(F));
  ok('★ 一堂都建不成時，把第一個原因講出來',
     /if\(!made\)\{ showToast\('沒有可建立的時段：'\+\(skipped\[0\]\|\|'請確認時間'\)\); return; \}/.test(F));
  ok('　　為什麼原本那句註解是錯的，寫在原地',
     /但卡位「卡的就是某一種票券的課」（type_id 會寫進課卡），/.test(F)
     && /友善教練課限平日 18:00 前，卡在平日晚上或假日的位子，之後根本轉不了正/.test(F));
}
ok('★ 一般預約路徑本來就有帶票種（這次只補待簽約這一條）',
   (src.match(/const vbk=\{id:null,coach_id,category:t\.category,ticket_type_id:type_id\}/g)||[]).length>=3);

console.log('\n③ 建立之前就先講規則');
{
  const F=grabFn('openPendingHold');
  ok('★★ 限時段票種在視窗上方標明「僅限平日 18:00 前」',
     /\$\{w\.t\.time_restricted\?`<div style="background:#f7efe0;/.test(F)
     && /僅限<b>平日 18:00 前<\/b>開始。假日或 18:00 之後的時段不會建立（連續預約會自動跳過並列出）。/.test(F));
  ok('★ 不是限時段的票種不會多一塊警語（整塊掛在 w.t.time_restricted 上）',
     /\$\{w\.t\.time_restricted\?`[\s\S]*?連續預約會自動跳過並列出）。<\/div>`:''\}/.test(F));
  ok('　　為什麼要先講（櫃檯是在排連續預約）',
     /卡位當下擋得住，但櫃檯是在排連續預約，早點知道規則才不會整串被跳過。/.test(F));
}

console.log('\n④ 轉正時說得出真正的原因');
{
  /* doConvertPending 內含樣板字串（裡面有 }），大括號計數抓不完整 → 直接在全文比對。
     這幾條字串本來就只出現在那一段，不會誤判。 */
  const F=src;
  ok('★★ 沒有可用票券時先分辨「是沒票，還是時段不合」',
     /if\(_tt && _tt\.time_restricted\)\{/.test(F)
     && /const _bad=!\(_dow>=1&&_dow<=5\) \|\| timeToMin\(b\.start_time\)>=1080;/.test(F));
  ok('★★ 訊息指出是哪一堂、該怎麼辦（不是叫櫃檯去找一張已經在手上的票）',
     /僅限平日 18:00 前使用 —— 這堂是 \$\{b\.date\.slice\(5\)\.replace\('-','\/'\)\} \$\{b\.start_time\}，請先改時段再轉正/.test(F));
  ok('★ 判斷不出來就退回原本那句（不會反而更難懂）',
     /let _why='該會員沒有此課程的可用票券，請先完成銷售';/.test(F));
  ok('　　查票種失敗也不會爆', /\}catch\(_\)\{\}\n\s*_clr\(\); showToast\(_why\); return;/.test(F));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
