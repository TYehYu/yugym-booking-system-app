/* 2026-09-09 使用者兩條：
   ①「團體課新增會員　預設要關閉重複預約」
   ②「課表的圓形按鈕不要出現在櫃檯桌機的課卡」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 團課［＋新增］的重複預約預設關閉');
ok('★★★ 打開［＋新增］就是關的（不再預設開）',
   /if\(addMode && !keepSel\) window\._grpRep=false;/.test(src)
   && !/if\(addMode\) window\._grpRep=\(window\._grpRep==null\)\?true:!!window\._grpRep;/.test(src));
ok('★★★ 每次打開都重設 —— 不是只在第一次（否則上次開過就一直是開的）',
   /「預設關閉」要每次成立，\s*\n\s*不然上次開過之後就一直是開的/.test(src));
ok('★★★ 從別的視窗按「上一步」退回來時保留選擇（keepSel）',
   /if\(addMode && !keepSel\)/.test(src)
   && /keepSel＝從別的視窗按「上一步」退回來，那時要保留使用者剛剛的選擇/.test(src));
ok('★★ 開關本身還在（使用者要開還是開得起來）',
   /window\._grpRep=!window\._grpRep;/.test(src)
   && /<span class="nsw\$\{window\._grpRep\?' on':''\}" id="grp-rep-sw">/.test(src));
ok('★★★ 關著就不問後面的場次（存檔那一關看的是同一個旗標）',
   /if\(window\._grpAdd && window\._grpRep && \(window\._grpPick\|\|\{\}\)\.mid\)\{/.test(src));
ok('★★★ 「管理名單」那條路不受影響（它本來就沒有這個開關，一律詢問）',
   /const _askRep=\(!window\._grpAdd\) \|\| !!window\._grpRep;/.test(src));
ok('★★ 改口的理由寫在原地（原本預設開是 0829 定的）',
   /2026-09-09 使用者改口「團體課新增會員　預設要關閉重複預約」/.test(src));

console.log('\n② 課表圓鈕不給櫃檯');
/* 2026-09-09 二修（使用者：「版本2240桌機帳號還是可以看到課表按鈕」「櫃檯」）——
   排除法只要有一種角色狀態沒被列到就會漏，改成正面白名單。 */
/* 2026-09-11：白名單改走 isTeachable（能開課的人），而 isCoachable 本來就只收教練與管理員 —— 櫃檯照樣畫不出來 */
ok('★★★ 正面白名單：只有教練與管理員畫得出這顆鈕',
   /function tlCanLog\(\)\{ return !!\(SESSION && isTeachable\(SESSION\)\); \}/.test(src)
   && /function isCoachable\(c\)\{ return c && \(c\.role==='coach' \|\| c\.role==='admin'\); \}/.test(src)
   && /if\(!_calCtx && tlOwnsBk\(b\) && tlLoggable\(b\) && tlCanLog\(\)\)/.test(src)
   && !/!\(SESSION&&SESSION\.role==='front_desk'\)/.test(src));
ok('★★★ 另一處課卡（教練／管理員手機首頁）也吃同一支白名單',
   /const _tlOk=tlLoggable\(b\) && tlCanLog\(\) && tlOwnsBk\(b\);/.test(src));
ok('★★★ 進入點也擋一次（繞過畫面也開不了）',
   /if\(!tlCanLog\(\)\)\{ showToast\('只有能開課的教練能開課表'\); return; \}/.test(src));
ok('★★ 為什麼用白名單寫在原地（漏了只會少畫一顆鈕，不會放錯人進來）',
   /白名單漏了只會少畫一顆鈕，不會把不該看的人放進來/.test(src));
ok('★★★ 整個角色都不畫，不只桌機（同一顆鈕在櫃檯手機上一樣沒意義）',
   /整個角色都不畫，不只桌機/.test(src));
ok('★★ 教練／管理員照舊畫得出來（其餘條件沒動）',
   /btns \+= evoBtn\('evo-t2','',`collapseBkCard\(\);openTrainingLog\('\$\{id\}'\)`,'plan','課表'\);/.test(src));
ok('★★★ 就算繞過前端也開不了 —— openTrainingLog 自己擋非本堂教練',
   /showToast\('這不是你的課，看不到課表'\); return;/.test(src));

console.log('\n③ 自主訓練點數被重複扣了一次（2026-09-09 客訴：「明明有兩點　但下方自主訓練列只有一個按鈕可以用」）');
{
  /* 把那一行的算法挖出來實跑 */
  const left=(rem,tot,mine)=>Math.max(0, Math.min(Number(rem)||0, (Number(tot)||0) - mine));
  const eq=(n,a,b)=>ok(n,a===b,{得到:a,預期:b});
  ok('★★★ 不再減 mine.length（自主訓練是預約當下就扣點，餘額已經扣過了）',
     /const left=Math\.max\(0, Math\.min\(Number\(t\.sessions_remaining\)\|\|0,\s*\n\s*\(Number\(t\.sessions_total\)\|\|0\) - mine\.length\)\);/.test(src)
     && !/const left=Math\.max\(0, \(Number\(t\.sessions_remaining\)\|\|0\) - mine\.length\);/.test(src));
  eq('★★★ 鄭雅芳的案子：2 點、約掉 1（餘額 1）→ 還有 1 顆［＋］（原本算成 0）',
     left(1,2,1), 1);
  eq('★★★ 真的用完就沒有［＋］：2 點、約掉 2（餘額 0）', left(0,2,2), 0);
  eq('★★★ 一顆都還沒約：2 點餘額 2 → 兩顆［＋］', left(2,2,0), 2);
  eq('★★ 上限夾住：舊預約沒扣到點（餘額 2、已約 1、總共 2）→ 只畫 1 顆，不會超過整張票',
     left(2,2,1), 1);
  ok('★★★ 「還有 N 個沒顯示」的總數用同一套算法',
     /return s\+Math\.max\(0, Math\.min\(Number\(t\.sessions_remaining\)\|\|0,\s*\n\s*\(Number\(t\.sessions_total\)\|\|0\) - _mine\)\);/.test(src));
  ok('★★ 根因寫在原地（餘額本身就是「還能約幾點」）',
     /自主訓練是\*\*預約當下就扣點\*\*，sessions_remaining 早就把已約的那幾點扣掉了/.test(src));
}

console.log('\n④ 會員端「訓練紀錄」分頁（2026-09-09 使用者：擺最右邊、圖示也沒有、配色不一致）');
ok('★★★ 排在最右邊（我的預約 → 我的票券 → 訓練紀錄）',
   /\{key:'mem_bookings', label:'我的預約'\}[\s\S]{0,400}\{key:'mem_tickets',  label:'我的票券'\}[\s\S]{0,600}\{key:'mem_training', label:'訓練紀錄'\},\n\];/.test(src));
ok('★★★ 有圖示 —— BN_ICONS 要登記，沒登記畫出來是空字串（不會 fallback 成 emoji）',
   /\n  mem_training:'<svg viewBox="0 0 24 24"/.test(src)
   && /<span class="bn-ic">\$\{BN_ICONS\[n\.key\]\|\|''\}<\/span>/.test(src));
ok('★★★ 外框配色跟另外兩頁一致（memh2-shell 是白名單，漏掛就變成另一套外框）',
   /const _mv=\(\(key==='mem_bookings'\|\|key==='mem_tickets'\|\|key==='mem_training'\)/.test(src));
ok('★★ 白名單這件事寫在原地（日後加會員頁要記得回來加一筆）',
   /新增會員頁一定要回來加一筆：外框樣式是白名單，不是預設/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
