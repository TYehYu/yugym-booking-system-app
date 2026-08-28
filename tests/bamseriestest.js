/* 空堂「安排會員」要能整串一起排（2026-08-28 使用者回報）

   「剛剛9/9 12:00待簽約 我填了會員 但是沒有跳出連續預約」

   實際資料：9/9 12:00 是一串每週三 12:00 的空堂（8/26 用連續預約整串建的：
   9/9、9/16、9/23、9/30、10/7、10/14）。使用者從課卡按「安排會員」，那位會員
   還沒買票 → 走 bamHoldAsk → 待簽約 → bkAddHoldDo，而那一支**只處理一堂**，
   後面五堂還是空的。綁定會員（bpGo）早就會整串一起做，這條路沒有。

   ⚠ 兩條路的「同一串」判準不能共用：
     bpSeriesOf 用 trial_name＋trial_phone 分組，而空堂那兩欄都是 null，
     直接沿用會把全店同票種的空堂通通當成同一串。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 主要動作不變，整串是「之後才問」');
{
  ok('★★ 先把這一堂排掉、吐司照舊，再問整串（使用者說不要就什麼都沒發生）',
     /const _rest=await bamSeriesRest\(b\)\.catch\(\(\)=>\[\]\);\s*\n\s*if\(_rest\.length\)\{ bamSeriesAsk\(b, _rest, mid, mode, guestName, guestPhone\); return; \}\s*\n\s*navTo\(CUR_PAGE\);/.test(src));
  ok('★★ 沒有同串空堂時行為完全和以前一樣（直接 navTo）',
     /if\(_rest\.length\)\{[^\n]*\}\s*\n\s*navTo\(CUR_PAGE\);/.test(src));
  ok('★★ 只在「綁人不扣票」這條路提供 —— 有票那條逐堂扣課是動到錢',
     /只在「綁人不扣票」這條路提供（待簽約／待分期）—— 有票那條會逐堂扣課，/.test(src));
  ok('★★ 有票那條（2026-08-28 二修）也問整串，但先把可用堂數算出來再問',
     /const _rest=await bamSeriesRest\(b\)\.catch\(\(\)=>\[\]\);\s*\n\s*if\(_rest\.length\)\{\s*\n\s*let _left=0;/.test(src)
     && /_left=Math\.max\(0, Number\(\(bkMemTicketInfo\(mid, b, _tk, _cnt\)\|\|\{\}\)\.left\)\|\|0\);/.test(src)
     && /bamSeriesAsk\(b, _rest, mid, 'book', null, null, _left\);/.test(src));
}

console.log('\n② 「同一串」的判準要窄，而且不能沿用 bpSeriesOf');
{
  const seg=src.slice(src.indexOf('async function bamSeriesRest(b){'),
                      src.indexOf('function bamSeriesAsk(b, rest, mid, mode, guestName, guestPhone, leftN){'));
  ok('★★ 六個條件：同教練、同時間、同星期、同票種、還是空堂、今天以後',
     /String\(x\.coach_id\|\|''\)===String\(b\.coach_id\|\|''\)/.test(seg)
     && /String\(x\.start_time\|\|''\)\.slice\(0,5\)===String\(b\.start_time\|\|''\)\.slice\(0,5\)/.test(seg)
     && /\(parseYmd\(x\.date\)\|\|new Date\(0\)\)\.getDay\(\)===_dow/.test(seg)
     && /String\(x\.ticket_type_id\|\|''\)===String\(b\.ticket_type_id\|\|''\)/.test(seg)
     && /x\.status==='booked' && x\.pending_contract===true/.test(seg)
     && /!x\.member_id && !x\.trial_name/.test(seg)
     && /String\(x\.date\|\|''\)>=_t0/.test(seg));
  ok('★★ 排除自己', /x && x\.id!==b\.id/.test(seg));
  ok('★★ 明講不能沿用 bpSeriesOf（空堂沒有姓名電話可分組）',
     /不能沿用綁定會員那支 bpSeriesOf —— 它是用 trial_name＋trial_phone 分組的，\s*\n\s*空堂那兩欄都是 null，會把全店同票種的空堂通通當成同一串。/.test(src));
  ok('★ 照日期排（視窗要按順序列出來）',
     /\.sort\(\(p,q\)=>String\(p\.date\)\.localeCompare\(String\(q\.date\)\)\)/.test(seg));

  /* 實跑：拿使用者這一次的真實資料形狀 */
  const f=new Function('dbGetAll','parseYmd','ymd','TODAY',
    seg.replace('async function bamSeriesRest(b){','return async function bamSeriesRest(b){').replace(/\}\s*$/,'};'));
  const D='2026-08-28';
  const mk=(id,date,o)=>Object.assign({id,date,start_time:'12:00',status:'booked',pending_contract:true,
    member_id:null,trial_name:null,coach_id:'C1',ticket_type_id:'TT1'},o||{});
  const rows=[
    mk('me','2026-09-09',{member_id:'M1'}),                 // 自己（剛剛排掉的）
    mk('a','2026-09-16'), mk('b','2026-09-23'), mk('c','2026-09-30'),
    mk('d','2026-10-07'), mk('e','2026-10-14'),
    mk('x1','2026-09-16',{status:'cancelled'}),             // 取消的不算
    mk('x2','2026-09-15'),                                  // 星期二，不同串
    mk('x3','2026-09-23',{coach_id:'C2'}),                  // 別的教練
    mk('x4','2026-09-23',{start_time:'13:00'}),             // 別的時間
    mk('x5','2026-09-23',{ticket_type_id:'TT2'}),           // 別的票種
    mk('x6','2026-09-23',{member_id:'M9'}),                 // 已經有人
    mk('x7','2026-09-23',{trial_name:'散客'}),               // 散客卡位（走綁定會員那條）
    mk('x8','2026-08-26'),                                  // 過去的
  ];
  const run=f(async()=>rows, d=>new Date(d+'T00:00:00'), d=>(d instanceof Date?d.toISOString().slice(0,10):d), new Date(D+'T00:00:00'));
  return run(rows[0]).then(out=>{
    eq('★★ 只抓到同一串的那五堂', out.map(x=>x.date), ['2026-09-16','2026-09-23','2026-09-30','2026-10-07','2026-10-14']);

    console.log('\n③ 視窗：先讓人看過日期再做');
    {
      ok('★★ 整串的日期逐筆列出來（最多 12 筆，超過寫「還有 N 堂」）',
         /rest\.slice\(0,12\)\.map\(x=>/.test(src)
         && /…還有 \$\{rest\.length-12\} 堂/.test(src));
      ok('★★ 兩顆鈕講清楚：只排這一堂／整串一起排 N 堂',
         /onclick="closeModal\(\);navTo\(CUR_PAGE\)">只排這一堂<\/button>/.test(src)
         && /onclick="bamSeriesGo\(\)">整串一起排 \$\{_can\} 堂<\/button>/.test(src));
      /* 2026-08-28 二修（使用者：「建立連續待簽約課卡目的就是要有票券的時候能夠連續預約」）——
         有票那條也給整串，但它會逐堂扣課，所以要先算「扣得起幾堂」再讓人按。 */
      ok('★★ 扣課模式：先算扣得起幾堂，票不夠的講明維持空堂',
         /const _can=_book\?Math\.min\(rest\.length, Math\.max\(0,Number\(leftN\)\|\|0\)\):rest\.length;/.test(src)
         && /票券不足 → 維持空堂/.test(src)
         && /目前可用 <b>\$\{Math\.max\(0,Number\(leftN\)\|\|0\)\}<\/b> 堂/.test(src));
      ok('★★ 一堂都扣不起時鈕直接停用（不要讓人按了才知道）',
         /\$\{\(_book&&!_can\)\s*\n\s*\? '<button class="btn btn-green" disabled[^']*票券不足，無法整串排/.test(src));
      ok('★★ 講明不扣票、不進統計（與單堂那一步同一個語意）',
         /一樣<b>不扣票、不進統計<\/b>，只是把人先掛上去。時段衝突的那幾堂會自動跳過並列出來。/.test(src));
    }

    console.log('\n④ 整串執行：逐堂驗證、跳過的要講出來');
    {
      const go=src.slice(src.indexOf('async function _bamSeriesGo(){'), src.indexOf('async function bamPick(mid){'));
      ok('★★ 每一堂都重讀＋重驗（名單畫出來之後狀態可能已經變了）',
         /const x=await dbGet\('bookings',id\)\.catch\(\(\)=>null\);/.test(go)
         && /if\(!x \|\| !bkCanAddMember\(x\)\)\{ skip\.push/.test(go)
         && /const verr=await validateBooking\(\{id:x\.id, coach_id:x\.coach_id/.test(go));
      ok('★★ 一律不綁票、維持待簽約（pending_contract 不能收，錢還沒到）',
         /x\.ticket_id=null; x\.pending_contract=true;/.test(go));
      ok('★★ 待分期的 note 字串與單堂那一支一字不差（promoteHeldBooking 靠它認）',
         (src.match(/分期待繳費保留（收款後自動補扣）/g)||[]).length>=3);
      ok('★★ 跳過的堂數與原因要說出來，不能默默少排',
         /showToast\(`整串已排：\$\{ok\} 堂`\+\(S\.mode==='book'\?`（扣 \$\{ok\} 堂）`:''\)\s*\n\s*\+\(skip\.length\?`；\$\{skip\.length\} 堂跳過/.test(go));
      ok('★★ 扣課模式逐堂挑票、逐堂扣；票在中途用完就停，剩下的維持空堂',
         /const cand=await listUsableTickets\(S\.mid, x\.ticket_type_id, x\.date, x\.start_time\);/.test(go)
         && /if\(!cand\.length\)\{ skip\.push\(String\(x\.date\)\.replace\(\/-\/g,'\/'\)\+'（票券不足）'\); continue; \}/.test(go)
         && /if\(!\(await deductTicket\(tk, x\.id, SESSION\.id\)\)\)\{/.test(go));
      ok('★★ 扣課模式才清票券快取（不扣票那條清 bookings 就好）',
         /dbCacheClear\(S\.mode==='book'\?\['bookings','member_tickets','ticket_logs'\]:\['bookings'\]\);/.test(go));
      ok('　 待簽約→儲值→轉正那條本來就會整串處理（不是這裡的責任）',
         /待簽約→儲值→轉正 那條路本來就會整串處理（見 _doConvertPending 的「整串卡位/.test(src));
      ok('★ 防連點（onceAct）', /async function bamSeriesGo\(\)\{ return onceAct\('bamseries', _bamSeriesGo\); \}/.test(src));
      ok('★ 做完一定重繪（finally）', /finally\{ done\(\); navTo\(CUR_PAGE\); \}/.test(go));
    }

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  });
}
