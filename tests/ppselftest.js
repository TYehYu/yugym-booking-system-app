/* 會員本人看自己的「個人資料」：內部欄位不外露
   （2026-08-22 使用者：「會員點帳號資訊的個人資料可以看到這麼多東西嗎？」） */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };
const cut=(a,b)=>s.slice(s.indexOf(a), s.indexOf(b));

const fn=cut('function ppSelfView(){','function ppHeaderHtml(){');
t('判斷只認「會員本人 × 會員資料 × 自己的 id」',
  /SESSION\.role==='member' && PP\.kind==='member'/.test(fn)
  && /String\(PP\.id\)===String\(SESSION\.id\)/.test(fn));
t('櫃檯／教練／管理員看會員資料不受影響（沒有其他角色分支）',
  !/front_desk|coach'/.test(fn));

const hd=cut('function ppHeaderHtml(){','function ppOpenPage(');
t('會員看自己時不顯示「等級」與「主教練」',
  /\(ppSelfView\(\)\?'':tierItem \+ coachItem\)/.test(hd));
t('緊急聯絡人／LINE／載具照舊（本來就是會員自己能改的）',
  /ecItem \+ lineItem \+ carrierItem/.test(hd));
t('等級章仍只有管理員點得動（原規則沒被動到）',
  /const _canTier = !!\(SESSION&&SESSION\.role==='admin'\);/.test(hd));
t('家庭成員仍只有櫃檯以上維護', /const famItem = \(isM&&_canBase\)\?/.test(hd));

/* 2026-08-22 二修（使用者）：「會員本人只需要看到上方的基本資料」——整張活動紀錄不畫 */
t('會員看自己時整張「活動紀錄」不畫', /if\(ppSelfView\(\)\) return '';\n    return `<div class="pp-card">/.test(s));
t('櫃檯以上照舊看得到票券／預約紀錄／交易',
  /ppDashRow\('ticket','票券'/.test(s) && /ppDashRow\('calendar','預約紀錄'/.test(s)
  && /ppDashRow\('money','交易'/.test(s));

t('交易頁只列自己的日期／項目／金額／付款方式，沒有業績或成本欄位',
  (()=>{ const pay=cut("if(PP.recView==='pay'){","return `<div class=\"pp-card\">${back}<div class=\"pp-card-t\">訓練紀錄");
    return !/sale_kind|sold_by|獎金|成本|業績/.test(pay); })());

// ── 2026-08-22 三修（使用者）：改成視窗、欄位一列一列、移除修改密碼、更換照片改名 ──
t('會員本人看自己也用浮動視窗（不是全頁面）',
  /const _winM = !!\(kind==='member' && isMobileLayout\(\)\s*\n\s*&& \(\(SESSION && SESSION\.role==='admin'\) \|\| ppSelfView\(\)\)\);/.test(s));
t('會員本人走「一列一列」的 pp-head-m2 版面',
  /if\(isM && \(_selfPP \|\| \(typeof isDeskLike==='function'/.test(s)
  && /pp-head-m2\$\{_selfPP\?' pp-head-self':''\}/.test(s));
t('那個版面裡等級與主教練照樣不畫',
  /pp-idtier">\$\{_selfPP\?'':tierItem\}/.test(s)
  && /pp-fields">\$\{_selfPP\?'':coachItem\}/.test(s));
t('會員不顯示「修改密碼」（LINE 登入）',
  /pwBtn\.style\.display = \(SESSION\.role==='member'\)\?'none':''/.test(s)
  && /if\(role!=='member'\) items\+=`<button class="more-item" onclick="closeModal\(\);openChangePassword\(\)">/.test(s));
t('員工仍看得到修改密碼（帳號密碼登入）', /id="acct-changepw"/.test(s));
t('「更換照片」改名「上傳大頭照」', !/更換照片<\/button>/.test(s)
  && /上傳大頭照<\/button>/.test(s) && /📷　上傳大頭照/.test(s));

// ── 2026-08-22 四修：白底可點的一列一列、LINE 移到通知設定、通知開關進選單 ──
/* ⚠ 特異度：要 .pp-head.pp-head-self 才壓得過 .pp-head.pp-head-m2 的兩欄 grid
   （0822 第一版只寫 .pp-head-self，欄位還是左右兩欄、緊急聯絡人被擠成三行） */
t('可修改欄位是一列一張白卡、點了就改',
  /\.pp-head\.pp-head-self\{grid-template-columns:1fr;max-width:340px;margin:0 auto;\}/.test(s)
  && /\.pp-head-self \.pp-idfields,\.pp-head-self \.pp-fields\{display:flex;flex-direction:column;\}/.test(s)
  && /\.pp-head-self \.pp-meta-i\{background:#fff/.test(s));
t('可點的那幾列有 › 指示', /\.pp-head-self \.pp-meta-i\.pp-f-click::after\{content:'›'/.test(s));
t('LINE 那一列不在個人資料裡（已在通知設定）',
  /pp-idfields">\$\{phoneItem\}\$\{genderItem\}\$\{bdayItem\}\$\{_selfPP\?'':lineItem\}/.test(s));
/* 2026-08-23：這顆開關從「只給會員」放寬成會員／教練／管理員共用（使用者：
   「管理員應該也要有」「直接把開關設計在這個頁面就好」），寫入也從直接 update members
   改走 fn_set_line_notify（那支同時認員工與會員）。細節由 aug23batchtest ⑦ 守著，
   這裡只確認會員端沒有因為放寬而掉功能。 */
t('「通知設定」右邊直接放 LINE 提醒開關（不用再開視窗）',
  /if\(notif && notif\.style\.display!=='none'\)\{/.test(s)
  && /sw\.onclick=e=>\{ e\.stopPropagation\(\); acctQuickNotifToggle\(sw\); \};/.test(s)
  && /notif\.style\.display = \(role==='coach'\|\|role==='member'\|\|role==='admin'\)\?'':'none';/.test(s));
t('開關即時寫回（會員寫 members、員工寫 employees），失敗會扳回去',
  /async function acctQuickNotifToggle\(sw\)\{/.test(s)
  && /sb\.rpc\('fn_set_line_notify',\{p_on:next\}\)/.test(s)
  && /sw\.classList\.toggle\('on', !next\)/.test(s));
t('開關靠右且不吃整列的點擊', /\.tb-acct-item \.acct-nsw\{margin-left:auto;flex:none;\}/.test(s));

// ── 課卡互動規則覆查（2026-08-22 使用者要求）──
t('★ 只有自主訓練能改時間', /if\(selfServe && _isSelfBk && b\.member_id===SESSION\.id\)[\s\S]{0,120}改時間/.test(s));
t('★ 只有團課與自主訓練能自行取消',
  /const selfServe=\(!st\.done && !st\.past\) && \(st\.isGrp \|\| _isSelfBk\);/.test(s));
t('★ 教練請假改記成自主訓練的教練課不算（本質仍是教練課）',
  /!\(typeof bkIsCoachLeave==='function' && bkIsCoachLeave\(b\)\)/.test(s));
t('★ 場地租借也不算會員自助範圍', /&& b\.category!=='場租';/.test(s));
t('★ 教練課只有簽到（沒有其他按鈕）',
  /const acts=\[\];/.test(s) && /acts\.length\?`<div style="display:flex;gap:8px;margin-top:10px;">/.test(s));

t('★ 視窗縮到內容高度並置中（不再撐滿整個畫面）',
  /\.pp-sheet\.pp-sheet-win\.pp-sheet-self \.pp-root\{height:auto;max-height:calc\(100dvh - 24px\);/.test(s));
t('會員本人的視窗才掛 pp-sheet-self（櫃檯端不受影響）',
  /\+\(\(typeof ppSelfView==='function'&&ppSelfView\(\)\)\?' pp-sheet-self':''\)/.test(s));
t('欄位不換行（緊急聯絡人不會被擠成三行）', /white-space:nowrap;box-shadow:0 1px 4px rgba\(50,42,30,\.06\);\}/.test(s));

// ── 會員自己改資料不通知櫃檯（2026-08-22 使用者附截圖指正）──
/* 來源是 dbPut → mchgNotify（走 fn_mobile_change_alert，沿用 self_move/self_cancel 兩種
   既有型別，所以在 notifications.type 裡看不到獨立的名字 —— 我第一次查就是因此漏掉。 */
t('★ 會員本人寫自己那一筆 members 時不發桌機通知',
  /if\(store==='members' && SESSION && SESSION\.role==='member'\s*\n\s*&& obj && String\(obj\.id\)===String\(SESSION\.id\)\) return;/.test(s));
t('★ 只擋這一種：櫃檯／教練在手機改別人的會員資料照舊通知',
  /SESSION\.role==='member'/.test(s.slice(s.indexOf('async function mchgNotify'), s.indexOf('async function dbPut'))));
t('★ 預約與補卡申請不受影響（MCHG_LABEL 沒動）',
  /const MCHG_LABEL=\{ bookings:'預約', punch_requests:'補卡申請',\s*\n\s*members:'會員資料' \};/.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
