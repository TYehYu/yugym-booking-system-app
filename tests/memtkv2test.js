/* 我的票券 V2（2026-08-22 使用者指示，只在管理員預覽會員視角時生效）：
   圓形卡放大一列 6 顆、使用狀況右上、起訖日右下、等級三條進度表、四個分頁。 */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };
const cut=(a,b)=>s.slice(s.indexOf(a), s.indexOf(b));

// ── 開關 ──
t('只有 memh2On 才走 V2（真會員仍是舊版）',
  /const mtkV2=\(typeof memh2On==='function'\)&&memh2On\(\);/.test(s));

// ── 票券卡 ──
const card=cut('    if(mtkV2){','    return `<div class="mck-card mck-${color}');
t('圓點一列 6 顆（固定六欄 grid，不靠固定寬度）',
  /class="mck-dots2 mck-dots6"/.test(card)
  && /\.mck-dots6\{display:grid !important;grid-template-columns:repeat\(6,1fr\)/.test(s));
t('圓點放大：寬度跟欄寬走、aspect-ratio 維持正圓',
  /\.mck-dots6 \.mtk\{width:100%;height:auto;aspect-ratio:1/.test(s));
t('「還有 N 顆」的收尾籤也跟著變圓、不撐破格',
  /\.mck-dots6 \.mtk-more\{width:100%;min-width:0;aspect-ratio:1/.test(s));
t('使用狀況＝已銷／總，放右上角且縮小',
  /<div class="mck-v2-use" title="已銷課堂數／總堂數"><b>\$\{usedCnt\}<\/b><span>\/\$\{total\}<\/span><\/div>/.test(card)
  && /\.mck-v2-use b\{font-size:17px/.test(s));
t('右下角顯示起始日 ～ 到期日',
  /const _dates=_ex \? `\$\{_st\?_st\.replace\(\/-\/g,'\/'\):'—'\} ～ \$\{_ex\.replace\(\/-\/g,'\/'\)\}` : fmtExpire\(null,t\);/.test(card)
  && /class="mck-v2-dates">\$\{_dates\}/.test(card));
t('未開通的票仍顯示「首堂課後 N 天」而不是空白', /: fmtExpire\(null,t\);/.test(card));
t('舊版那組大數字（mck-figures）不出現在 V2 卡上', !/mck-figures/.test(card));
t('分期、共享「享」章、合約鈕都保留',
  /mck-install/.test(card) && /享<\/span>/.test(card) && /openContractView/.test(card));

// ── 等級三條進度表 ──
const bar=cut('function memTierBar(fill, tone){','function memTierBlockV2(');
t('一條進度表固定四個刻度', /Array\.from\(\{length:4\}/.test(bar));
const blk=cut('function memTierBlockV2(ti, usableCount){','/* 主顧客優惠方案說明');
t('固定畫三條', /for\(let i=0;i<3;i\+\+\)/.test(blk) && (blk.match(/for\(let i=0;i<3;i\+\+\)/g)||[]).length===2);
t('會員：前 ok 條已滿、第 ok+1 條是本月、其餘留空',
  /if\(i<ti\.ok\) arr\.push\(memTierBar\(4,'done'\)\);/.test(blk)
  && /else if\(i===ti\.ok\) arr\.push\(memTierBar\(now, now>=4\?'done':'now'\)\);/.test(blk));
t('主顧客：未達標的月份標紅，滿三條就降級',
  /if\(i<ti\.low\) arr\.push\(memTierBar\(4,'miss'\)\);/.test(blk)
  && /調回「會員」/.test(blk));
t('VIP／手動鎖定不畫進度', /if\(ti\.manual\|\|ti\.state==='vip'\)\{/.test(blk));
t('刻度數與現行規則同源（4 堂／月、3 個月）',
  /滿 <b>4 堂<\/b>＝當月達標/.test(blk) && /<b>連續 3 個月<\/b>/.test(blk));

// ── 主顧客優惠按鈕 ──
t('等級卡上有「主顧客優惠」按鈕（不分目前等級）',
  /const perkBtn=`<button class="mtc-perk" onclick="openLoyalPerks\(\)">主顧客優惠 ›<\/button>`;/.test(blk));
t('點開是視窗', /function openLoyalPerks\(\)\{[\s\S]{0,1200}showModal\(/.test(s));
/* 0822 使用者提供價目表：主顧教練課／主顧友善課，1V1 與 1V2 兩種單價 */
t('★ 價目表已填入（12 堂・12 個月，1V1／1V2 兩價）',
  /\{tag:'主顧教練課', tone:'green', spec:'12 堂・12 個月'[\s\S]{0,80}p1:1500, p2:1800\}/.test(s)
  && /\{tag:'主顧友善課', tone:'gold'[\s\S]{0,120}p1:1300, p2:1600\}/.test(s));
t('★ 只有主顧客／VIP 看得到金額（使用者：要會員升級才可以看到內容）',
  /const unlocked=!!\(ti && \(ti\.state==='loyal' \|\| ti\.state==='vip'\)\);/.test(s));
t('★ 還沒升級：只講規則與鼓勵，不露金額',
  /升級主顧客後就看得到/.test(s) && /再撐一下，就快到了/.test(s));
t('★ tier 讀的是腳本裡的 _memTkData，不是 window（0822 實測抓到主顧客也被鎖住）',
  /const ti=\(typeof _memTkData!=='undefined' && _memTkData && _memTkData\.tier\)\|\|null;/.test(s));

// ── 分頁 ──
t('四個分頁：教練課／團體課／自主訓練／折扣券',
  /MTK_TABS=\[\['pt','教練課'\],\['group','團體課'\],\['self','自主訓練'\],\['voucher','折扣券'\]/.test(s));
t('運動按摩有票才多一格（不憑空多、也不把票藏起來）',
  /\['massage','運動按摩'\]\];/.test(s)
  && /const _tabs=MTK_TABS\.filter\(\(\[k\]\)=>_tabHas\[k\]\);/.test(s));
t('分頁只在有兩種以上票券時才畫', /mtkV2&&_tabs\.length>1/.test(s));
t('目前分頁不存在時自動落到第一個', /if\(!_tabs\.some\(\(\[k\]\)=>k===window\._mtkTab\)\)/.test(s));
t('V2 的清單吃「這個分頁的票」，不再固定排除自主訓練與折抵券',
  /mine\.filter\(t=>_kindOf\(t\)===window\._mtkTab\)/.test(s));
t('自主訓練／折扣券的獨立入口在 V2 收起（改由分頁承接）',
  /\(mtkV2\?tabRow:`<div class="mtk-entry-row">/.test(s));

/* 底部導覽的 iOS 問題改成全域處理了，斷言移到 tests/navfixedtest.js */

/* 時段視窗的說明改成一行一句（2026-08-22 使用者：「處理一下上方的斷句 方便閱讀」） */
t('時段視窗說明改成條列（不再是一整段）',
  /<ul class="qs-note">/.test(s) && /\.qs-note li\{position:relative;padding-left:12px/.test(s)
  && (s.match(/<ul class="qs-note">/g)||[]).length===2);

/* 待簽合約：在那張票券的圓形卡「上方」放一條簽名區（2026-08-22 使用者指示） */
t('★ 只有「這張票的合約還沒簽」才畫簽名區',
  /window\._ctSignByTicket=Object\.fromEntries\(window\._memContracts\s*\n\s*\.filter\(c=>c\.ticket_id && c\.sign_type==='remote' && !c\.signed_at\)/.test(s));
t('★ 簽名區排在圓形卡之前',
  s.indexOf('mck-signpad') < s.indexOf('<div class="mck-dots2 mck-dots6">'));
t('★ 點了進合約簽名（並擋掉整卡展開）',
  /onclick="event\.stopPropagation\(\);memSignContract\('\$\{_cid\}'\)"/.test(s));
t('　只認會員自己簽的遠端合約（紙本／現場電子簽不是會員的事）',
  /c\.sign_type==='remote' && !c\.signed_at/.test(s));
t('　金色＝需要會員動手（品牌色階：紅警示、金待辦、綠一般）',
  /\.mck-signpad\{[^}]*border:1\.5px dashed var\(--gold/.test(s.replace(/\n\s*/g,'')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
