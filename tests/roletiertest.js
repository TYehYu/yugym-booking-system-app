/* 權限分級（2026-08-23 使用者定案）
   ・銷售／收款／票券發放 → 管理員・店長・櫃檯（isDeskLike）
   ・報表／修改會員資料   → 只有管理員                                   */
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };

t('★★ 兩個判斷式都存在且都只認 admin',
  /function canEditMemberData\(\)\{ return !!\(SESSION && SESSION\.role==='admin'\); \}/.test(src)
  && /function canSeeReports\(\)\{ return !!\(SESSION && SESSION\.role==='admin'\); \}/.test(src));
t('　店長不算（is_manager 只在 isDeskLike 那邊成立）',
  !/canEditMemberData\(\)\{[^}]*is_manager/.test(src));

// ── 修改會員資料：只有管理員 ──
t('★★ 會員資料表頭的可編輯欄位改吃 canEditMemberData（原本是 isDeskLike）',
  /const _canBase = canEditMemberData\(\);/.test(src) && !/const _canBase = isDeskLike\(\);/.test(src));
t('★ 主教練／生日／性別的原地編輯也擋',
  /if\(fid==='default_coach_id' && !canEditMemberData\(\)\)/.test(src)
  && /if\(\(fid==='birthday'\|\|fid==='gender'\) && !\(canEditMemberData\(\)\|\|_selfM\)\)/.test(src));
t('★ 緊急聯絡人／載具／家庭成員三個入口各自守門',
  (src.match(/canEditMemberData\(\)\|\|ppSelfView\(\)/g)||[]).length===2
  && /async function ppFamEdit\(mid\)\{\s*\n\s*if\(!canEditMemberData\(\)\)/.test(src));
t('★★ 會員本人改自己的聯絡資料不受影響',
  /canEditMemberData\(\)\|\|ppSelfView\(\)/.test(src)
  && /!\(canEditMemberData\(\)\|\|_selfM\)/.test(src));
t('　姓名與等級本來就只有管理員（沒被動到）',
  /const _canTier = !!\(SESSION&&SESSION\.role==='admin'\);/.test(src)
  && /姓名只有管理員可以修改/.test(src));

// ── 銷售／票券發放：櫃檯以上，且函式自己也擋 ──
t('★★ 銷售／發放／儲值／票券頁四個入口都有 isDeskLike 守門',
  (src.match(/if\(!isDeskLike\(\)\)\{ showToast\('銷售／發放票券需要櫃檯以上權限'\); return; \}/g)||[]).length===3
  && /if\(!isDeskLike\(\)\)\{ showToast\('儲值／發放票券需要櫃檯以上權限'\); return; \}/.test(src)
  && /if\(!isDeskLike\(\)\)\{ showToast\('票券發放需要櫃檯以上權限'\); return; \}/.test(src));
t('　理由寫在原地（不能靠「畫面沒露出」當防線）',
  /靠「沒畫出來」當防線遲早會漏/.test(src));
t('　收款審核原本就有守門（沒被動到）', /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可審核'\); return; \}/.test(src));

// ── 報表：只有管理員 ──
t('★★ 經營報表與營運分析兩頁都擋 navTo 直接進入',
  /PAGES\.finance=async function\(\)\{\s*\n[\s\S]{0,320}if\(!canSeeReports\(\)\)/.test(src)
  && /PAGES\.dashboard=async function\(\)\{\s*\n[\s\S]{0,200}if\(!canSeeReports\(\)\)/.test(src));
t('　擋下來時給說明頁，不是白畫面', /這一頁需要管理員權限/.test(src));
t('　導覽本來就沒給櫃檯（g_admin 沒有 fd:true）',
  /\{key:'g_admin', icon:'🛠️', label:'管理員', sub:\[/.test(src));
t('　櫃檯手機導覽沒有報表',
  /const MOBILE_FRONTDESK_NAV=\[\s*\n\s*\{key:'fd_calendar'[\s\S]{0,160}\];/.test(src)
  && !/MOBILE_FRONTDESK_NAV=\[[\s\S]{0,200}dashboard/.test(src));

// ── 桌機首頁教練任務：日期列改回上方橫列 ──
t('★ 日期列在課卡區之上、獨立一列',
  /<div class="twk-bar">[\s\S]{0,260}<div class="twk-barin">\$\{_wkDays\}<\/div>[\s\S]{0,120}<div class="tl-3col">/.test(src));
t('★ 七天平分寬度（不是固定寬、不出現橫捲）',
  /\.twk-barin \.twk-day\{flex:1 1 0;min-width:0;/.test(src)
  && /\.twk-barin\{flex:1 1 auto;min-width:0;display:flex/.test(src));
t('★ 今天綠底、選取黑框的語彙沒被改掉',
  /\.twk-day\.today\{background:var\(--green\);color:#fff;border-color:var\(--green\);\}/.test(src)
  && /\.twk-day\.on\{border-color:#1a1a1a;border-width:2px;\}/.test(src));
t('　舊的直欄樣式已清掉（不留死 CSS）', !/\.twk-rail\{/.test(src) && !/\.twk-railin/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
