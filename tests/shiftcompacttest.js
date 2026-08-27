/* 排班表上半部壓縮（2026-08-27 使用者指示）
   「目標是在一般桌機畫面進入頁面後，不需要往下捲動就能直接看到至少 4–5 位員工的排班內容」

   原本上半部是三段各自佔一整行：
     ①「店長 · 可編輯排班」自成一列（page-head）
     ② 月份切換獨立一張大卡（ops-datebar，裡面「本月」又是一行）
     ③「月排班」標題列
   合成一條 toolbar，權限與員工數退成標題底下的一行小字。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* ⚠ 只看 renderShiftsTab 這一支 —— ops-datebar 與「N 月 排班表」在月報表、薪資、
   唯讀班表彈窗等十幾處都還在用，拿整份 src 比會誤判。 */
const RS=(()=>{const a=src.indexOf('async function renderShiftsTab(){');
  const raw=src.slice(a, src.indexOf('\n}', src.indexOf('${gapCard}`;', a)));
  /* 去掉註解 —— 註解裡本來就會提到 ops-datebar（在說明「它退場了」） */
  return raw.replace(/\/\*[\s\S]*?\*\//g,'');})();

console.log('① 三段合成一條 toolbar');
{
  ok('★★ 月份切換那張獨立大卡（ops-datebar）退場', !/ops-datebar/.test(RS));
  ok('★★ 「沒有值班員工」那條分支也走同一條 toolbar（不然像換了一頁）',
     (RS.match(/<div class="sh-toolbar">/g)||[]).length===2
     && /兩條分支的上半部長得不一樣的話，\s*\n\s*「這個月沒人排班」看起來會像換了一頁/.test(src));
  ok('★★ 改成一條 toolbar：月排班　‹ 年月 ›　本月　……　複製上月班表',
     /<div class="sh-toolbar">/.test(src)
     && /<span class="sh-tb-t">月排班<\/span>/.test(src)
     && /<button type="button" class="sh-mbtn" onclick="shiftMonthMove\(-1\)" title="上個月">‹<\/button>/.test(src)
     && /<span class="sh-mlabel">\$\{my\} 年 \$\{mm\} 月<\/span>/.test(src)
     && /<button type="button" class="sh-mbtn" onclick="shiftMonthMove\(1\)" title="下個月">›<\/button>/.test(src));
  ok('★★ 「2026年08月排班表」那個長標題不見了（月份本身就夠了）',
     !/月 排班表/.test(RS));
  ok('　 唯讀班表彈窗那一支沒被動到（openMonthScheduleModal 是另一條路）',
     /<div class="modal-title">\$\{my\} 年 \$\{Number\(mm\)\} 月 排班表 <span class="tag tag-warn"/.test(src));
  ok('★ 「複製上月班表」推到最右（margin-left:auto）',
     /class="btn btn-ghost btn-sm sh-tb-r" onclick="copyPrevMonthShifts\(\)"/.test(src)
     && /\.sh-tb-r\{margin-left:auto;\}/.test(src));
}

console.log('\n② 「店長・可編輯排班」不再獨占一行');
{
  ok('★★ 頁面不再單獨掛那一列（head 只在帶 scope 進來時保留麵包屑）',
     /const hd = scoped \? head\('SHIFTS', SCOPE\.name\+' · 排班', sub\) : '';/.test(src));
  ok('★★ 改成標題底下的一行小字：值班員工共 N 位　·　店長可編輯',
     /<div class="sh-tb-sub">值班員工共 \$\{staff\.length\} 位　·　\$\{_canEditShifts\?'店長可編輯':'<b class="sh-ro">檢視模式<\/b>'\}<\/div>/.test(src));
  ok('★ 檢視模式（櫃檯）仍然標得出來，而且用金色點出（那是「你不能改」的提示）',
     /\.sh-tb-sub \.sh-ro\{color:var\(--gold-d\);font-weight:700;\}/.test(src));
  ok('　 從員工管理帶 scope 進來時的麵包屑沒被一起砍掉',
     /從員工管理帶 scope 進來時仍保留麵包屑那一行（那是「你現在在看誰」，不能省）/.test(src));
}

console.log('\n③ 分頁列收窄');
{
  ok('★★ padding 與下方留白都收（原本 11/12 ＋ 22px）',
     /\.subnav\{margin-bottom:12px;\}/.test(src)
     && /\.subnav-item\{padding:8px 14px 9px;font-size:14px;\}/.test(src));
  ok('　 原本的值還在（只是被後面這條蓋掉，要退回很容易）',
     /\.subnav\{display:flex;flex-direction:row;align-items:center;gap:4px;overflow-x:auto;\s*\n\s*border-bottom:1px solid var\(--bd\);margin-bottom:22px;/.test(src));
  ok('　 底線與 active 的語彙沒動（分頁還是分頁）',
     /\.subnav-item\.active\{color:var\(--green\);font-weight:700;border-bottom-color:var\(--green\);background:transparent;\}/.test(src));
}

console.log('\n④ 省下多少高度（估算，用實際的 CSS 數值）');
{
  /* 舊：page-head-subonly(約 20 ＋ margin 14) ＋ ops-datebar 卡（padding 上下約 32 ＋ 內容 40
     ＋ margin 14）＋ subnav 多出來的 padding/margin。這裡只驗「有沒有真的把三個容器拿掉」，
     不去對像素 —— 像素會隨字級與瀏覽器變。 */
  const seg=src.slice(src.indexOf('body.innerHTML=`\n  <div class="card">'), src.indexOf('${gapCard}'));
  eq('★★ 表格上面只剩一張卡（不再是「日期卡＋內容卡」兩張）',
     (seg.match(/<div class="card"/g)||[]).length, 1);
  ok('★★ 一行 toolbar ＋ 一行小字 ＋ 一行說明，就接表格',
     seg.indexOf('sh-toolbar') < seg.indexOf('sh-tb-sub')
     && seg.indexOf('sh-tb-sub') < seg.indexOf('sh-tb-note')
     && seg.indexOf('sh-tb-note') < seg.indexOf('sh-scroll'));
  ok('　 toolbar 高度壓在 44px（使用者要 64–72px 的 compact toolbar，含卡片內距後落在區間內）',
     /\.sh-toolbar\{[^}]*min-height:44px;/.test(src));
}

console.log('\n⑤ 功能一個都沒動');
{
  const keep=[['上個月', /onclick="shiftMonthMove\(-1\)"/],['下個月', /onclick="shiftMonthMove\(1\)"/],
    ['回本月', /onclick="shiftThisMonth\(\)"/],['複製上月班表', /onclick="copyPrevMonthShifts\(\)"/],
    ['排班表格', /<table class="sh-table">/],['缺班提示', /\$\{gapCard\}/],
    ['權限判斷', /await checkCanEditShifts\(\);/]];
  eq('★★ 七項全在', keep.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★★ 已經在本月時「本月」鈕淡化但不藏（不能用就寫原因，別藏按鈕）',
     /\$\{isCur\?'disabled title="已經在本月"':'onclick="shiftThisMonth\(\)"'\}/.test(src)
     && /\.sh-nowbtn\.on\{opacity:\.45;cursor:default;\}/.test(src));
  ok('　 這組樣式刻意不掛 body.ink（櫃檯看的是同一頁，版面不該因人而異）',
     /這一組是\*\*基礎樣式\*\*（不掛 body\.ink）/.test(src)
     && !/body\.ink \.sh-toolbar/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
