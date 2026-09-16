/* 訓練課表 2026-09-09 四件事：
   ① 教練只能看／設定自己課的課表，代課看得到該會員的歷史
   ②「剩餘 自訂方案 0/10」被讀成第 0 堂 → 改寫第幾堂
   ③「最近訓練」那一格沒有置中
   ④ 三大項歷史紀錄（深蹲／硬舉／臥推），超過就自動換、舊的留著 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
/* 〔已移除〕g() —— 把某段程式碼整段挖出來實跑的 helper，只有 ④ 三大項那一區在用，
   PR 清掉之後就沒有呼叫端了（2026-09-16）。 */

console.log('① 教練只進得去自己的課');
ok('★★★ 不是這堂的負責教練就擋下',
   /if\(!tlOwnsBk\(b\)\)\{ showToast\('這不是你的課，看不到課表'\); return; \}/.test(src));
ok('★★★ 前面先過一次白名單（櫃檯／會員／不開課的人連開都開不了）',
   /if\(!tlCanLog\(\)\)\{ showToast\('只有能開課的教練能開課表'\); return; \}/.test(src));
ok('★★★ 代課算自己的課 —— tlOwnsBk 看實際上課的人（bkCoachId 代課優先）',
   /function bkCoachId\(b\)\{ return \(b && \(b\.substitute_coach_id \|\| b\.coach_id\)\) \|\| null; \}/.test(src)
   && /function tlOwnsBk\(b\)\{ return !!\(SESSION && b && String\(bkCoachId\(b\)\|\|''\)===String\(SESSION\.id\)\); \}/.test(src));
ok('★★★ 前端這道只是為了給訊息，真正的把關寫明在資料庫',
   /真正的把關在資料庫的\s*\n\s*training_logs \/ tlog_select_scoped/.test(src));
/* 2026-09-11 使用者：「該課卡的負責教練　才可以看到課表的按鈕」—— 0909 的主管例外收掉 */
ok('★★★ 主管與管理員也只進得去自己帶的課（不再一律放行）',
   !/!SESSION\.is_manager && !bkIsCoach\(b,SESSION\.id\)\)\{\s*\n\s*showToast\('這不是你的課/.test(src));

console.log('\n② 第幾堂');
ok('★★★ 不再直接印 sessions_remaining/total',
   !/tkText=`\$\{tk\.plan_name\|\|'票券'\}　\$\{tk\.sessions_remaining\}\/\$\{tk\.sessions_total\}`/.test(src));
ok('★★★ 沿用 2026-08-19 定版的算法：已用 −「排在本堂之後」的有效預約',
   /_seq=\(_tot-_rem\)-_after;/.test(src)
   && /第N ＝ 帳面已用（總−剩餘）−「排在本堂之後」的有效預約數/.test(src));
ok('★★★ 只算這張票、排除取消與 sibling（重複扣的第二個名額）',
   /String\(x\.ticket_id\|\|''\)===String\(tk\.id\)\s*\n?\s*&& x\.status!=='cancelled' && !x\.sibling_of/.test(src));
ok('★★★ 之後 = 日期＋時間都比本堂晚（同日多堂不能只比日期）',
   /const _key=x=>String\(x\.date\|\|''\)\+' '\+String\(x\.start_time\|\|''\);/.test(src)
   && /_mine\.filter\(x=>_key\(x\)>_key\(b\)\)\.length/.test(src));
ok('★★★ 算不出合理值就退回舊寫法，不硬印一個錯的堂數',
   /\(_seq>=1 && _tot>0 && _seq<=_tot\)/.test(src)
   && /剩餘 \$\{_rem\}\/\$\{_tot\}/.test(src));
ok('★★ 「剩餘」兩個字不再重複（外層已經拿掉）',
   !/`　·　剩餘 \$\{window\._tlTkText\}`/.test(src));
ok('★★ 誤讀的原因寫在原地（預扣型票券帳面剩餘早早歸 0）',
   /預扣型票券的帳面剩餘很早就歸 0/.test(src));

console.log('\n③ 最近訓練那格置中');
ok('★★★ 兩格改直向置中（原本只有 text-align，內容矮的那格貼上緣）',
   /\.tlh-ov-cell\{[^}]*display:flex;flex-direction:column;align-items:center;justify-content:center;\}/.test(src));
ok('★★ 原因寫在原地', /只靠 text-align\s*\n?\s*只有水平置中/.test(src));

/* 〔已移除〕④ 三大項歷史紀錄（2026-09-16 使用者：「三大項ＰＲ移除了」「一併清掉」）——
   這一區原本把整套 PR 算法挖出來實跑：訓練總量（次數×組數×重量）當判準、
   換動作照樣歸戶（史密斯深蹲也算深蹲）、lb 先換算成公斤、打平不算破紀錄、
   次數組數沒填當 1 不當 0。
   程式碼側一併清除：tlPrScore／tlPrBetter／tlPrChain／tlPrByExercise／tlPrVol／
   tlPrDate／tlOpenPrHistory／TL_PR_LIFTS／TL_LB2KG，以及三組 CSS
   （.tlh-prb-*／.tlh-pr-*／.prh-*）。
   ⚠ 沒有動到 training_logs 的任何欄位：PR 本來就是從既有紀錄推導的，沒有自己的資料表，
     日後要做回來只是重寫推導，一筆資料都沒少。
   ⚠ 底下那條 body:has 的斷言不屬於這一區，已移到後面保留。 */
/* ⚠ 下面這一條**不屬於 PR**：它釘的是 tlSetLine（那支沒有被刪），
   守的是「數字順序一律 組數 × 次數 × 重量」這個全系統慣例。 */
ok('★★★ 次數與組數本來就在紀錄列上（tlSetLine 就是「12 次 × 3 組 × 70kg」）',
   /* 2026-09-11 使用者：「訓練紀錄統一改成 組數x次數x重量」 */
   /\(l\.sets\?l\.sets\+' 組':null\),\(l\.reps!=null\?l\.reps\+' 次':null\)/.test(src));
/* ⚠ 這一條**不屬於 PR**，所以 PR 清掉之後它要留著、繼續有人守：
   body:has 那條規則同時服務 #tl-sheet／#tl-add-sheet／#qb-sheet／#bk-mem-sheet 四個抽屜，
   從抽屜裡開出來的視窗（套用歷史課表、修改紀錄、套用方案…）全靠它才蓋得住抽屜。 */
ok('★★ 從抽屜裡開的視窗靠 body:has 那條規則才蓋得住抽屜',
   /body:has\(#tl-sheet\) \.modal-bg/.test(src));

console.log('\n⑤ 抽屜不要蓋住頂列（2026-09-09：「上面表頭logo要露出」）');
ok('★★★ mc-mode 下抽屜從頂列下方開始（桌機 60px、平板 56px）',
   /body\.mc-mode #tl-sheet,body\.mc-mode #tl-add-sheet\{top:60px;\}/.test(src)
   && /@media\(max-width:1080px\)\{ body\.mc-mode #tl-sheet,body\.mc-mode #tl-add-sheet\{top:56px;\} \}/.test(src));
ok('★★★ 數字對得上頂列本身的高度（不是隨手抓的）',
   /body\.mc-mode \.mc-sidebar\{[\s\S]{0,200}height:60px;/.test(src)
   && /body\.mc-mode \.mc-sidebar\{width:100%;padding:0 12px;height:56px;\}/.test(src));
ok('★★★ 手機不套（.topbar 是 sticky、沒有 fixed 頂列要讓）',
   /手機沒有 fixed 頂列（\.topbar 是 sticky、會跟著捲），維持整片蓋滿/.test(src)
   && /\.topbar-fixed\{position:sticky;top:0;/.test(src));
ok('★★★ 頂列露出來就點得到 → 換頁要把抽屜收掉，否則浮在新頁面上',
   /if\(document\.getElementById\('tl-sheet'\)\)\{ try\{ closeTrainingLog\(\); \}catch\(_\)\{\} \}/.test(src)
   && /function navTo\(key, gkey\)\{\s*\n\s*inkApply\(\);\s*\n\s*\/\* 課表抽屜的頂列是露出來的/.test(src));
ok('★★ 只改 top，面板置中靠 top:50% 自己重算（沒有第二處要跟著改）',
   /\.ms-panel\{position:absolute;left:0;right:0;top:0;/.test(src)
   && /只改 top，不動 inset 其餘三邊/.test(src));

console.log('\n⑥ 「點下方新增動作開始記錄」卡在奇怪的位子（2026-09-09）');
ok('★★★ 根因：值班時間軸的 .tl-empty 是絕對定位、又排在最後 → 蓋掉抽屜的同名規則',
   /\.tl-track \.tl-empty\{position:absolute;top:50%;left:50%;/.test(src)
   && !/^\.tl-empty\{position:absolute/m.test(src));
ok('★★★ 抽屜的空狀態改用自己的名字，不再被同名規則波及',
   /\.tls-empty\{text-align:center;/.test(src)
   /* 2026-09-11 簡化：空狀態縮成一行（使用者：「這個頁面可以簡化」）—— 守的仍是 class 名稱，不是文字 */
   && /\? '<div class="tls-empty">還沒有紀錄<\/div>'/.test(src));
/* ⚠ 2026-09-16 兩修：米底先加在 .tls-panel（課表專屬），同日使用者選 A
   「一次全改」之後上移到 .ms-panel（11 個視窗共用的底），.tls-panel 就不再自己指定背景。
   這一條要守的東西始終沒變：**面板用的是 .tls-panel 這個名字**，
   不是時間軸那張卡的 .tl-panel（那邊的 padding／背景／overflow-x 會整組蓋過來）。 */
ok('★★★ 抽屜面板也改名 —— .tl-panel 是時間軸那張卡，padding／背景／overflow-x 會整組蓋過來',
   /\.tls-panel\{[^}]*padding-bottom:16px;/.test(src)
   && /\.ms-panel\{[^}]*background:var\(--card2\);/.test(src)
   && /<div class="ms-panel tls-panel">/.test(src));
ok('★★★ 抽屜裡不再留任何 tl-panel／tl-empty 的用法',
   !/class="ms-panel tl-panel"/.test(src)
   && !/<div class="tl-empty">尚無訓練紀錄/.test(src));
ok('★★ 時間軸那邊照舊（🌙 今日無課 仍在 .tl-track 裡，仍是釘在長條中央）',
   /<div class="tl-track">/.test(src) && /<div class="tl-empty">🌙 今日無課<\/div>/.test(src));
ok('★★ 陷阱寫在原地：tl- 前綴被兩個不相干的東西共用',
   /tl- 這個前綴被兩個不相干的東西共用（值班時間軸／訓練課表）/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
