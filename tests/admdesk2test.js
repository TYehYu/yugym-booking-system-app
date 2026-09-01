/* 管理員桌機首頁改版（2026-09-01 使用者指示，試點）

   「先幫我改管理員桌機的首頁　ＫＰＩ改到右上角　第一列教練課＋團體課　第二列營收
     原本右上角三個按鈕 新增會員 銷售 查看合約改到左下角　移除健身小卡
     中間日期列調整到 今日收款提醒 即將降級名單右邊　日期列的卡片大小調整跟這兩張卡片一樣大
     下方教練任務列改成直式 上下滾動查看當日預約 左右查看每個教練的課 用滑動的 不要看到卷軸」
   ＋「先不要動到櫃檯的首頁」＋「即將降級名單內的教練標籤　用上教練的顏色」

   ⚠ 這一支的重點有兩個：新版面真的長出來了，以及**櫃檯那條路一格沒動**。
     首頁是四個角色共用一份程式，改版一律開新分支、不要就地改（同 admMobHero 的作法）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 只吃「管理員＋桌機」');
{
  ok('★★★ 旗標寫死兩個條件（櫃檯與手機都不受影響）',
     /const _admD2=!!\(SESSION&&SESSION\.role==='admin'\) && !isMobileLayout\(\);/.test(src)
     && /使用者明講「先不要動到櫃檯的首頁」/.test(src));
  ok('★★★ 版面差異全部掛在 \.admd2 這個 class 底下',
     /<div class="mc-dash\$\{_admD2\?' admd2':''\}">/.test(src)
     && /整段都掛在 \.admd2 底下 —— 櫃檯與手機不受影響/.test(src));
  ok('★★★ 每一處差異都是三元式，舊那條路原封不動留著',
     (src.match(/\$\{_admD2\s*\n?\s*\?/g)||[]).length>=1
     && /: `<div class="mc-know-left">\$\{knowCardHTML\(\)\}<\/div>`\}/.test(src)
     && /\$\{_admD2\?_admD2Kpi:`<div class="mc-quick-top">\$\{quickCard\}<\/div>`\}/.test(src));
}

console.log('\n② KPI 移到右上角，第一列 教練課＋團體課、第二列 營收');
{
  ok('★★★ 右欄最上方換成 KPI 卡',
     /\$\{_admD2\?_admD2Kpi:`<div class="mc-quick-top">/.test(src));
  ok('★★★ 兩列的內容就是使用者指定的順序',
     /<div class="admd2-kpi-row">\$\{_kpiPt\}\$\{_kpiGrp\}<\/div>/.test(src)
     && /<div class="admd2-kpi-row admd2-kpi-rev">\$\{_kpiRev\}<\/div>/.test(src));
  ok('★★★ 三個數字只算一份（舊那條 kpiStrip 與新版共用同一組變數）',
     /const _kpiPt=_kpiIt\(ICONS\.cal,'教練課',`\$\{_ptN\}<small>堂<\/small>`\);/.test(src)
     && /const _kpiRev=_kpiIt\(OPS_TODO_IC\.money,'今日營收',`\$\$\{_fm\(_revTotal\)\}`\);/.test(src)
     && /不要各算一次/.test(src));
  ok('★★ 兩列之間有分隔線（第二列是不同量級的東西）',
     /\.admd2 \.admd2-kpi-row\+\.admd2-kpi-row\{border-top:1px solid var\(--border-light\);/.test(src));
}

console.log('\n③ 三顆快捷鈕改到左下角、健身小卡移除');
{
  ok('★★★ 左欄最下是快捷鈕，且用 margin-top:auto 頂到底',
     /<div class="mc-quick-bot">\$\{quickCard\}<\/div>/.test(src)
     && /\.admd2 \.mc-quick-bot\{margin-top:auto !important;\}/.test(src));
  ok('★★★ 管理員桌機看不到健身小卡（但函式與櫃檯那條路都還在）',
     /\/\* 三顆鈕改到左下角（健身小卡移除） \*\//.test(src)
     && /function knowCardHTML\(/.test(src)
     && /<div class="mc-know-left">\$\{knowCardHTML\(\)\}<\/div>/.test(src));
}

console.log('\n④ 日期列搬到兩張提醒卡右邊，卡片同尺寸');
{
  ok('★★★ 日期列抽成 _twkBar，上方那一列＝兩張提醒卡＋日期列',
     /const _twkBar=`<div class="twk-bar">/.test(src)
     && /const _admD2Top=`<div class="admd2-top">\$\{alertCards\}\$\{_twkBar\}<\/div>`;/.test(src));
  ok('★★★ 原本的位置改成「管理員桌機不畫」（其他角色照舊在課卡區之上）',
     /\$\{_admD2\?'':_twkBar\}/.test(src));
  ok('★★★ 中間欄最上方換成那一列（原本是 kpiStrip）',
     /\$\{_admD2\?_admD2Top:kpiStrip\}/.test(src));
  ok('★★★ 三種卡同一個尺寸（同一組 --admd2-cw／--admd2-ch）',
     /\.admd2 \.admd2-top \.mc-a2\{width:var\(--admd2-cw,96px\);min-width:0;min-height:var\(--admd2-ch,96px\);/.test(src)
     && /\.admd2 \.admd2-top \.twk-day\{flex:1 1 0;min-width:0;min-height:var\(--admd2-ch,96px\);/.test(src));
  ok('★★ 日期列不再是細長一條（圓角與內距跟提醒卡對齊）',
     /\.admd2 \.admd2-top \.twk-day\{[^}]*border-radius:14px;padding:14px 4px;/.test(src));
}

console.log('\n⑤ 教練任務改直式：上下捲當日預約、左右捲教練，看不到捲軸');
{
  ok('★★★ 一個容器同時吃兩個方向（上下捲時所有教練欄一起動，時間才對得起來）',
     /\.admd2 \.tcard-body\{flex-direction:row;align-items:flex-start;gap:14px;\s*\n\s*overflow:auto;/.test(src)
     && /分成每欄各自捲會各滑各的/.test(src));
  ok('★★★ 捲軸全部藏起來（使用者：「用滑動的　不要看到卷軸」）',
     /scrollbar-width:none;-ms-overflow-style:none;/.test(src)
     && /\.admd2 \.tcard-body::-webkit-scrollbar\{display:none;width:0;height:0;\}/.test(src));
  ok('★★★ 一位教練一欄（列改成欄）',
     /\.admd2 \.tcard-row\{flex:0 0 auto;width:150px;flex-direction:column;/.test(src)
     && /\.admd2 \.tcard-list\{flex-direction:column;flex-wrap:nowrap;/.test(src));
  ok('★★ 教練那顆球黏在欄頂（橫向滑到哪一欄都看得到是誰）',
     /\.admd2 \.tcard-coach\{width:auto;padding:0;position:sticky;top:0;/.test(src));
  ok('★★ 「一列到底」的翻頁鈕在直式沒有意義，收掉',
     /\.admd2 \.tcard-pg\{display:none !important;\}/.test(src));
  ok('★★★ 捲動容器的高度要量出來寫死（用百分比會整個攤開、外面反而長出捲軸）',
     /const tb=cc\.querySelector\('\.tcard-body'\);/.test(src)
     && /if\(cc\.closest\('\.admd2'\)\)\{/.test(src)
     && /tb\.style\.maxHeight=Math\.max\(220, Math\.round\(window\.innerHeight - tbTop - 22\)\)\+'px';/.test(src));
  ok('★★ 舊版面要把量過的高度還原（不然切回去會卡著上一版的數字）',
     /\}else\{ tb\.style\.removeProperty\('max-height'\); \}/.test(src));
}

console.log('\n⑥ 降級名單的教練章穿教練色');
{
  ok('★★★ 用同一支 coachTagColor（不另訂一套色）',
     /const cc=\(it\.coachId&&typeof coachTagColor==='function'\)\?coachTagColor\(it\.coachId\):null;/.test(src)
     && /const st=cc\?` style="background:\$\{cc\.bg\};color:\$\{cc\.fg\};"`:'';/.test(src));
  ok('★★ 沒指定主教練的維持灰字（看得出是「沒有」而不是還沒載完）',
     /if\(!it\.coach\) return `<span class="tdl-co tdl-co-no">未指定主教練<\/span>`;/.test(src));
}

console.log('\n⑦ 櫃檯那條路一格沒動');
{
  /* 舊版面的四個特徵都還在原地 —— 只要有人「順手」把三元式改成直接取代，這裡就會紅。 */
  ok('★★★ 舊：左欄最下是健身小卡', /<div class="mc-know-left">\$\{knowCardHTML\(\)\}<\/div>/.test(src));
  ok('★★★ 舊：中間欄最上是 kpiStrip（兩張提醒卡＋KPI 一整條）',
     /\$\{_admD2\?_admD2Top:kpiStrip\}/.test(src)
     && /let kpiStrip=`<div class="mc-kpistrip"><!--ALERTS-->/.test(src));
  ok('★★★ 舊：右欄最上是三顆快捷鈕', /`<div class="mc-quick-top">\$\{quickCard\}<\/div>`/.test(src));
  ok('★★★ 舊：日期列在教練任務卡裡（_admD2 為假時照畫）', /\$\{_admD2\?'':_twkBar\}/.test(src));
  ok('★★★ 舊版面的 CSS 一條都沒被改掉（.admd2 之外的選擇器不受影響）',
     /\.tcard-body\{display:flex;flex-direction:column;gap:10px;padding:2px 2px;\}/.test(src)
     && /\.tcard-row\{display:flex;align-items:flex-start;gap:14px;padding:7px 0;border-bottom:1px solid var\(--border-light\);\}/.test(src)
     && /\.tcard-list\{flex:1;display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;min-width:0;\}/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
