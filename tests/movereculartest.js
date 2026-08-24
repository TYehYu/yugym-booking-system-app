/* 連續預約放進「調整日期／時間」（2026-08-23 使用者指示：
   「那個連續預約功能 放在標題卡 調整日期/時間這個按鈕裡面」）

   守三件事：
   ① 建立流程不另寫一份 —— 一律走既有的 runRecurringBooking（挑票／扣課／寫 ticket_logs／
      場地配置／衝堂跳過／分期保留都在那支裡）。這裡若自己 dbPut，票就不會被扣。
   ② 起點是「隔天」—— buildRecurringDates 含起始日，傳當天會把這一堂再建一次。
   ③ 可用範圍收緊：團體課／待簽約／沒有 member_id 都不給（那三條路不是走 runRecurringBooking）。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('入口：標題卡 → 調整課程 → 調整日期／時間');
ok('★ 開關畫在「調整預約時間」那張視窗裡（不是另開一頁）',
   /recurBoxHtml\('amv', _rec\.max, \{countLabel:'往後再排幾堂（不含這一堂）'\}\)/.test(src)
   && /const _rec=await amvRecurCtx\(b\);/.test(src));
/* 2026-08-23：那一列改成「能改就給 admhMoveAsk、不能改就淡化寫原因」，入口本身沒換 */
ok('★ 「調整課程」那一列的入口沒被動到（admhMoveAsk 仍是同一支）',
   /: row\(`closeModal\(\);admhMoveAsk\('\$\{b\.id\}'\)`,'調整日期／時間'/.test(src));
ok('★★ 堂數標籤要換掉 —— 第一堂已經存在，沿用「含第一堂」會讓人多算一堂',
   /countLabel:'往後再排幾堂（不含這一堂）'/.test(src)
   && /function recurBoxHtml\(prefix, maxN, opts\)\{/.test(src)
   && /其餘呼叫端不傳＝行為不變/.test(src));
ok('　　預設勾好「這一堂的星期」，但**不**自動打開開關',
   /const cb=document\.querySelector\(`\.amv-dow\[value="\$\{v\}"\]`\);/.test(src)
   && /只勾星期、不打開開關：開關要使用者自己按/.test(src));

console.log('\n可用範圍（amvRecurCtx）');
ok('★★ 團體課不給 —— 名額與票掛在 member_ids 上，另有一套建立流程',
   /if\(bkIsGroup\(b\)\) return \{ok:false,max:0,why:''\};/.test(src)
   && /硬套會建出一人一堂的假團課/.test(src));
ok('★★ 待簽約／保留不給（沒有票也沒有會員），並且告訴使用者該走哪裡',
   /if\(b\.pending_contract\) return \{ok:false,max:0,why:'待簽約／保留的時段要連續卡位，請從「建立預約」的待簽約卡位進。'\};/.test(src));
ok('★ 沒有 member_id（場租、未安排會員的空堂）不給',
   /if\(!b\.member_id\) return \{ok:false,max:0,why:''\};/.test(src));
ok('★ 體驗不扣票 → 上限就是方案上限',
   /if\(b\.category==='體驗'\) return \{ok:true,max:RECUR_MAX,why:''\};/.test(src));
ok('★★ 其餘課別的上限＝這位會員這類課「已開通可約」的堂數（不是 sessions_remaining）',
   /const cands=await listUsableTickets\(b\.member_id, b\.ticket_type_id, b\.date, b\.start_time\);/.test(src)
   && /max=\(cands\|\|\[\]\)\.reduce\(\(s,t\)=>s\+tkUnlockedLeft\(t\),0\);/.test(src));
ok('　　沒有可用票券就不給，並講原因（不要給一個按下去只會失敗的開關）',
   /if\(!\(max>0\)\) return \{ok:false,max:0,why:'這位會員目前沒有可用票券，無法往後連排；請先儲值或續約。'\};/.test(src));

console.log('\n送出（admhMoveDo）');
/* 0824：這張視窗多了場地欄（建立時是硬指定的，改期也要），
   所以早退條件變成「時間、場地都沒動，也沒勾連續」。 */
ok('★★ 只勾連續、時間沒動也要放行 —— 原本「時間沒有變動」會把連排一起擋死',
   /const moved=\(nd!==b\.date \|\| nt!==b\.start_time\);/.test(src)
   && /if\(!moved && !vChanged && !rc\.on\)\{ showToast\('時間與場地都沒有變動'\); return; \}/.test(src));
ok('★★ 場地也是硬指定：選了哪個就用哪個，滿了直接擋',
   /const vbk=Object\.assign\(\{\}, b, \{venue_pref:nv\|\|null\}\);/.test(src)
   && /b\.venue_unit=vbk\.venue_unit\|\|b\.venue_unit;/.test(src));
ok('★ 沒有畫開關的情況（不可用）readRecur 不會炸',
   /const rc=\(document\.getElementById\('amv-recurring'\)\) \? readRecur\('amv'\) : \{on:false\};/.test(src));
ok('★ 勾了但沒選星期／沒填堂數要擋下來',
   /if\(!rc\.dows\.length\)\{ showToast\('請勾選至少一個星期'\); return; \}/.test(src)
   && /if\(!\(rc\.count>0\)\)\{ showToast\('請填寫要再排幾堂'\); return; \}/.test(src));
ok('★★ 有改時間時：先改期再連排，起點用「改完之後」的日期時間',
   /if\(rc\.on\) await amvRunRecur\(b, nd, nt, rc\);/.test(src)
   && /先改期再連排 —— 起點要用「改完之後」的日期時間/.test(src));
ok('★ 改期失敗就不連排（早退，不要在錯的時段上長出一串）',
   /catch\(err\)\{ showToast\('修改失敗：'\+\(err&&err\.message\?err\.message:err\)\); navTo\(CUR_PAGE\); return; \}/.test(src));
ok('★ 只連排不改期：走早退路徑，不進 confirmCalMove',
   /if\(!moved\)\{[\s\S]{0,320}?if\(rc\.on\) await amvRunRecur\(b, nd, nt, rc\);\s*\n\s*navTo\(CUR_PAGE\); return;/.test(src));
ok('　　只改場地（沒改時間）也要寫回去',
   /if\(vChanged\)\{ try\{ await dbPut\('bookings',b\); showToast\('已更新場地'\); \}/.test(src));

console.log('\n建立（amvRunRecur）');
ok('★★ 一律走 runRecurringBooking —— 自己 dbPut 的話票不會被扣',
   /r=await runRecurringBooking\(\{/.test(src)
   && /整個建立走既有的 runRecurringBooking/.test(src));
ok('★★ startDate 是「隔天」—— buildRecurringDates 含起始日，傳當天會把這一堂再建一次',
   /startDate: ymd\(addDays\(parseYmd\(d\), 1\)\),/.test(src)
   && /直接傳當天會把這一堂\s*\n\s*再建一次/.test(src));
ok('★ 教練／代課／使用人／場地偏好都沿用原本那一堂',
   /member_id:b\.member_id, coach_id:b\.coach_id, substitute_coach_id:b\.substitute_coach_id\|\|null,/.test(src)
   && /trial_name:\(b\.trial_name\|\|null\),/.test(src)
   && /venue_pref:b\.venue_pref\|\|null,/.test(src));
ok('★ 時長沿用原本那一堂（不要寫死 60）',
   /const dur=Number\(b\.duration\)\|\|60;\s*\n\s*let r=null;/.test(src)
   && /time:t, duration:dur,/.test(src));
ok('★★ held（分期待繳費保留）也算建立成功 —— 不算的話會顯示「沒有排成任何一堂」但行事曆多了幾張',
   /const okN=r\?\(r\.ok\|\|0\):0, held=r\?\(r\.held\|\|0\):0/.test(src)
   && /const made=okN\+held;/.test(src));
ok('★ 結果要講清楚：排了幾堂、幾堂衝堂、幾堂票券不足',
   /已再排 \$\{made\} 堂/.test(src)
   && /\$\{sk\} 堂衝堂略過/.test(src)
   && /\$\{nt2\} 堂票券不足/.test(src));
ok('　　整支包在 try/catch，失敗要吐司（不要靜靜地什麼都沒發生）',
   /\}catch\(e\)\{ showToast\('連續預約失敗：'\+\(\(e&&e\.message\)\|\|e\), 5000\); return; \}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
