/* 教練首頁 V2（2026-08-21）
   使用者：「這是手機端的用管理員預覽教練頁面 我們來修改這個頁面的版面
   但先不要影響到教練們在使用的頁面可以嗎?」→ 選 A（加旗標）。
   規格：「要參考這個首頁 只是上方的今日營收要改成今日值班[早班][中班][晚班]
   點選這邊顯示照相機掃描QRcode簽到 教練篩選列移除 因為只要顯示該教練自己的課卡就好」
   追加：「教練端下面本月成績 只要顯示教練課 團體課 已銷課堂/總課堂
   不用顯示任何銷課金額跟總營收」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('旗標：只有「管理員預覽教練視角」看得到');
ok('★ 分岔在 PAGES.coach_today 的第一行，教練本人走原本整段',
   /if\(typeof isRealAdmin==='function' && isRealAdmin\(\) && SESSION && SESSION\.role==='coach'\)\{\s*\n\s*return coachHomeV2\(\);\s*\n\s*\}/.test(src));
ok('★ 判斷用「真實身分」而不是目前角色（預覽只換 SESSION.role，不動 _realRole）',
   /function isRealAdmin\(\)\{ return SESSION && SESSION\._realRole==='admin'; \}/.test(src)
   /* 預覽切換確實只改 role */
   && /function switchPreviewRole\(role\)\{\s*\n\s*if\(!isRealAdmin\(\)\) return;[\s\S]{0,40}?SESSION\.role=role;/.test(src));
ok('★ 標明這是暫時分岔，定案後要收掉（兩份版面長期並存會漏改一邊）',
   /這是\*\*暫時\*\*的分岔。定案後要把舊版整段刪掉、旗標一起拿掉/.test(src));

console.log('\n上方：今日值班（取代今日營收）');
ok('★ 三個班別膠囊', /const BANDS=\[\{k:'am',label:'早班'/.test(src)
   && /\{k:'mid',label:'中班',col:'#1F6F54'\}/.test(src)
   && /\{k:'pm',label:'晚班',col:'#3A5BA0'\}/.test(src));
ok('★ 點整塊 → 既有的掃碼打卡視窗（沒有另外寫一套相機）',
   /onclick="openStaffScanModal\(\)"/.test(src)
   && /function openStaffScanModal\(\)\{/.test(src));
ok('　　鍵盤也能開（role=button 要能按 Enter／空白）',
   /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);openStaffScanModal\(\);\}"/.test(src));
ok('★ 班別界線沿用既有的 dutyShiftColor（12 點前早班、12–15 中班、15 點後晚班）',
   /const bandOf=t=>\{ const m=timeToMin\(t\|\|'0:0'\); return m<12\*60\?'am':\(m<15\*60\?'mid':'pm'\); \};/.test(src)
   && /if\(m < 12\*60\) return '#D9A441';   \/\/ 早班：琥珀金/.test(src));
ok('　　沒排班就看實際打卡時間歸班（漏排班不該讓整條變灰）',
   /if\(!Object\.keys\(hit\)\.length && att&&att\.clock_in\) hit\[bandOf\(att\.clock_in\)\]/.test(src));
ok('　　請假／上班中／已下班各有對應文字',
   /const punchTxt = onLeave \? `今天請假/.test(src)
   && /`上班中　\$\{att\.clock_in\} 打卡`/.test(src)
   && /`已下班　\$\{att\.clock_in\}–\$\{att\.clock_out\}`/.test(src));

console.log('\n中間：只有自己的課卡');
ok('★ 只取自己的（教練篩選列不需要存在）',
   /\.filter\(b=>b&&bkCoachId\(b\)===SESSION\.id&&b\.date===date&&b\.status!=='cancelled'\)/.test(src));
ok('　　代課的課算在代課教練身上（bkCoachId 而不是 coach_id）',
   /bkCoachId\(b\)===SESSION\.id&&b\.date===date/.test(src));
ok('★ 沿用管理員首頁那套課卡（.tcard-std：時間／姓名＋出席章／第幾堂）',
   /<div class="tcard tcard-std \$\{_clsMap\[cc\]\|\|'course-pt'\}/.test(src)
   && /<span class="tcard-nmrow"><span class="tcard-mem">\$\{nm\}<\/span>\$\{stamp\}<\/span>/.test(src));
ok('　　教練標籤那一格改放課種（這頁的課全是自己的，再標教練名沒有資訊量）',
   /這一頁的課全是自己的，再標一次教練名沒有資訊量/.test(src));
ok('　　點擊沿用 onTcardClick（與首頁同一套課卡視窗）',
   /onclick="onTcardClick\(event,'\$\{b\.id\}'\)"/.test(src));
ok('★ 課卡產生器目前是複寫一份，理由寫在原地（旗標拿掉時要合併）',
   /課卡的產生器目前是複寫一份、不是共用管理員首頁那支 —— 刻意的/.test(src));

console.log('\n下方：本月成績只有堂數');
ok('★ 只有教練課與團體課兩列',
   /\$\{scoreRow\('教練課',_pt\)\}\$\{scoreRow\('團體課',_gp\)\}/.test(src));
ok('★ 已銷課堂／總課堂（已簽到或已完成 ÷ 本月未取消）',
   /return \{done:a\.filter\(b=>b\.status==='checked_in'\|\|b\.status==='completed'\)\.length, all:a\.length\};/.test(src));
ok('★ 沒有任何金額（使用者：不用顯示任何銷課金額跟總營收）',
   !/chv2-score[\s\S]{0,900}?(monthSalesValue|銷課金額|營收|toLocaleString)/.test(src));
ok('　　友善教練課併進「教練課」',
   /const c=evColorClass\(b,typeMap\); return c==='ev-pt'\|\|c==='ev-friendly';/.test(src));
ok('　　為什麼教練端不出現金額，寫在原地',
   /教練端不出現金額，避免把「這堂值多少錢」帶進上課現場/.test(src));

console.log('\n班別歸屬的算術（與 dutyShiftColor 同一組界線）');
{
  const timeToMin=t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);};
  const bandOf=t=>{ const m=timeToMin(t||'0:0'); return m<12*60?'am':(m<15*60?'mid':'pm'); };
  eq('★ 09:00 → 早班', bandOf('09:00'), 'am');
  eq('★ 12:00 整 → 中班', bandOf('12:00'), 'mid');
  eq('　　12:30 仍是中班', bandOf('12:30'), 'mid');
  eq('★ 15:00 整 → 晚班', bandOf('15:00'), 'pm');
  eq('　　小曾 15:02、BARRY 15:52 都是晚班（0806 回報的案例）',
     [bandOf('15:02'), bandOf('15:52')], ['pm','pm']);
  eq('　　14:59 還是中班', bandOf('14:59'), 'mid');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
