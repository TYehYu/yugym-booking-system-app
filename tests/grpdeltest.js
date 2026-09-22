/* 團體課的「新增」與「刪除」權限（2026-08-22 使用者確認：只有櫃檯／店長／管理員桌機） */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };

// ── 新增：本來就對，這裡是回歸鎖 ──
const mk=s.slice(s.indexOf('async function openBookingModal(){'), s.indexOf('const _BK_ORDER='));
t('教練（非店長）建不了團課', /const isCoach=SESSION\.role==='coach' && !SESSION\.is_manager;/.test(mk)
  /* 2026-09-22：場租加進 coachAllowed（使用者：「因為現在教練可以卡位預約教練課，
     所以這次子安教練其實是先用教練課卡位」）——
     ⚠ 這一條守的沒變：教練**仍然建不了團課與自主訓練**。
     ⚠ 為什麼加場租反而讓帳乾淨：用教練課卡位一旦簽到就進 leaderClassCount
       （算堂數與主管獎金），場租在三份計堂清單裡都被排除。 */
  && /const coachAllowed=\['私人教練','體驗','場租'\];/.test(mk)
  && /if\(isCoach && !coachAllowed\.includes\(t\.category\)\) return false;/.test(mk));
t('教練仍然建不了團課與自主訓練（只多開場租）',
  !/const coachAllowed=\[[^\]]*小班肌力/.test(s)
  && !/const coachAllowed=\[[^\]]*自主訓練/.test(s));
t('開放的理由與「為什麼不加『要有票才建得了』」寫在原地',
  /堵一個更糟的洞/.test(s)
  && /那會讓「先卡位、之後再收」走不通/.test(s));
t('★ 手機一律建不了團課（含管理員／櫃檯）',
  /if\(isMobileBk && t\.category==='小班肌力'\) return false;/.test(mk));
t('店長比照櫃檯（is_manager 不算 isCoach）', /role==='coach' && !SESSION\.is_manager/.test(mk));

// ── 刪除整堂：0822 收成櫃檯以上 ──
t('★★ 「刪除預約」團課只給 staff，單人課教練仍可刪',
  /const _canDelBk = A\.canCancel && !A\.closed && \(A\.staff \|\| \(A\.own && !A\.isGroup\)\);/.test(s));
t('★ 教練看自己的團課時給說明列，不是把按鈕藏起來',
  /整堂取消請洽櫃檯/.test(s) && /教練請假會退課並發補課券；整班取消由櫃檯處理/.test(s)
  && /\.ash-eirow\.ash-ei-off\{[^}]*cursor:default/.test(s.replace(/\n\s*/g,'')));
t('★ 行事曆課卡的取消圓鈕：團課看 staff、單人課看 own',
  /if\(\(!_ashMode \|\| !isGroup\) && canCancel && \(isGroup \? staff : own\)\)\{/.test(s));
t('★ 舊資料團課（只有 member_id）那顆取消也收成 staff',
  /if\(A\.canCancel && A\.staff\) _outOrbs \+= evoBtn\('','evo-danger'/.test(s));
t('　staff 的定義沒被動到（admin／front_desk／店長）',
  /const staff = SESSION\.role==='admin' \|\| SESSION\.role==='front_desk' \|\| !!SESSION\.is_manager;/.test(s));
t('　教練請假這條路仍留給教練（那才是他該用的工具）',
  /canCoachLeave|教練請假/.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
