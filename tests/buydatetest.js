/* 票券卡列出購買日（2026-07-30 使用者要求）＋ 補課券只屬於團課 ＋ 團課補課不重複認列金額 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('購買日');
ok('★ 抽成共用的一支', /function tkBuyDateHtml\(t\)\{/.test(src));
ok('★ 五個票券卡都列出來（會員名片可用／歷史、管理端、會員詳細、預約明細）',
   (src.match(/\$\{tkBuyDateHtml\(t\)\}/g)||[]).length===4
   && /\$\{tkBuyDateHtml\(tkC\)\}/.test(src));
ok('　　沒有購買日就用起始日，並標示出來（不假裝有資料）',
   /if\(sd\) return `購買 <b class="num" title="這張票沒有購買日，顯示的是舊系統的起始日">/.test(src)
   && /（起始日）/.test(src));
ok('　　兩者都沒有 → 破折號', /return `購買 <span style="opacity:\.7;">—<\/span>`;/.test(src));
{
  const i=src.indexOf('function tkBuyDateHtml(t){'); const j=src.indexOf('\n}\n',i)+2;
  const f=new Function(src.slice(i,j)+'\nreturn tkBuyDateHtml;')();
  ok('★ 有購買日 → 顯示購買日', /購買 <b class="num">2026\/07\/17<\/b>/.test(f({purchase_date:'2026-07-17'})));
  ok('★ 只有起始日 → 顯示起始日並標註', /2026\/05\/18/.test(f({start_date:'2026-05-18'})) && /（起始日）/.test(f({start_date:'2026-05-18'})));
  ok('　　都沒有 → —', /—/.test(f({})));
  ok('　　null 不炸', f(null)==='');
}

console.log('\n補課券只屬於團課（教練課沒有補課機制）');
ok('★ 會員頁補發補課券的課程類型只列團課',
   /const types=\(window\._ttCache\|\|\[\]\)\.filter\(t=>t\.name && \(t\.category==='小班肌力'\|\|t\.category==='團體課'\)\);/.test(src));
ok('★ 找不到團課票種時擋下並說明原因',
   /補課券只適用<b>團體課<\/b>（四週優惠方案的請假規則）；教練課沒有補課機制。/.test(src));
ok('　　說明文案寫在視窗上', /只適用團體課 —— 教練課沒有補課機制。/.test(src));
ok('　　課卡上的「補發補課券」本來就只給團課', /bkIsGroup\(b\)&&!b\.makeup_granted/.test(src));

console.log('\n團課補課不重複認列銷課金額');
ok('★ 逐人頭改用「這堂實際扣的那張票」的單價',
   /const _grpDeduct=\{\};/.test(src)
   && /if\(l&&l\.booking_id&&l\.action==='deduct'\)/.test(src)
   && /if\(i>=0\)\{ const t=_tkById\[pool\[i\]\]; pool\.splice\(i,1\); return a\+_tkUnitOf\(t\); \}/.test(src));
ok('★ 補課券是 $0 → 補課那堂金額 0（請假那堂已認過一次）',
   /const _tkUnitOf=t=>\{ const a=Number\(t&&t\.amount_paid\)\|\|0, n=Number\(t&&t\.sessions_total\)\|\|0; return n>0\?a\/n:0; \};/.test(src));
ok('　　查不到扣款紀錄（匯入的舊團課）才退回平均單價',
   /return a\+_grpUnit\(mid\);                       \/\/ 沒有扣款紀錄 → 用平均單價估/.test(src));
ok('　　同一人多名額：扣款紀錄逐筆取用，不重複配對', /pool\.splice\(i,1\)/.test(src));
ok('　　共享票也認得（持有人不是本人時）', /tkSharedIds\(t\)\.includes\(mid\)/.test(src));
ok('　　原因寫在程式裡', /同一筆錢被算兩次/.test(src));

console.log('\n待簽約轉正：不用再搜尋一次（2026-07-30 使用者指示）');
ok('★ 先用手機自動對（正規化：去非數字、886→0）',
   /const _norm=p=>String\(p\|\|''\)\.replace\(\/\\D\/g,''\)\.replace\(\/\^886\/,'0'\);/.test(src)
   && /let hit=_ph\?members\.filter\(m=>_norm\(m\.phone\)===_ph\):\[\];/.test(src));
ok('★ 手機沒填或對不到，改用姓名完全相同', /hit=members\.filter\(m=>String\(m\.name\|\|''\)\.trim\(\)===nm\);/.test(src));
ok('★ 唯一一位 → 直接進選票券／扣課，不出搜尋清單',
   /if\(hit\.length===1\)\{ doConvertPending\(hit\[0\]\.id\); return; \}/.test(src));
ok('　　多位同名 → 講清楚要選哪一位', /對到 <b>\$\{hit\.length\}<\/b> 位同名會員，請選擇正確的一位。/.test(src));
ok('　　對不到 → 說明卡位資料並提示先完成銷售', /找不到對應會員。<br>\s*請先完成「銷售」（建會員＋賣票）/.test(src));
ok('　　退回搜尋時，搜尋框預先帶入卡位姓名', /value="\$\{String\(b\.trial_name\|\|''\)\.replace\(\/"\/g,'&quot;'\)\}"/.test(src));
ok('　　原因寫在程式裡', /卡位當下就填了姓名與手機，轉正還要再搜尋一次很多餘/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
