/* 教練桌機：導覽列移到上方（2026-07-30 使用者回報「看起來是放大版的手機介面」）
   非店長教練不吃 desktop-wide（那是櫃檯／管理員的左側側欄版面），所以不管螢幕多寬
   都走手機版面：底部導覽＋放大的月曆。改成寬螢幕時導覽走上方，顯示 首頁／預約行事曆。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('版面切換');
ok('★ 另給一個 coach-wide class（不動 desktop-wide 的既有語意）',
   (src.match(/app\.classList\.toggle\('coach-wide'/g)||[]).length===3);
ok('★ 判定＝教練且非店長且非手機版',
   /app\.classList\.toggle\('coach-wide', !!\(SESSION&&SESSION\.role==='coach'&&!SESSION\.is_manager\) && !isMobileLayout\(\)\);/.test(src));
ok('　　旋轉／改變視窗大小時也跟著切', /app\.classList\.toggle\('coach-wide', !!\(SESSION\.role==='coach'&&!SESSION\.is_manager\) && !nowMobile\);/.test(src));
// 二修（使用者：頂欄要跟櫃檯版一樣）→ 改走 body.mc-mode 的綠底頂列，不再用舊的 navbar-row
ok('★ 教練桌機也套 mc-mode（與櫃檯／管理員同一條綠底頂列）',
   /const isCoachWide = !isMobileLayout\(\) && !!\(SESSION && SESSION\.role==='coach' && !SESSION\.is_manager\);/.test(src)
   && /document\.body\.classList\.toggle\('mc-mode', !!\(isDeskStaff\|\|isCoachWide\)\);/.test(src)
   && /if\(!isDeskStaff && !isCoachWide\)\{ el\.innerHTML=''; return; \}/.test(src));
ok('★ 底部導覽收起', /#app-screen\.coach-wide\.role-coach #bottom-nav\{display:none !important;\}/.test(src));
ok('　　底部留白收掉（沒有底部導覽要避開）', /#app-screen\.coach-wide\.role-coach \.content\{padding-bottom:32px;\}/.test(src));
ok('　　打卡 FAB 也收起（那是手機版右下角的）', /#app-screen\.coach-wide\.role-coach #punch-fab\{display:none !important;\}/.test(src));
ok('　　店長桌機那條規則沒被動到', /#app-screen\.desktop-wide\.role-coach \.navbar-row\{display:flex;\}/.test(src));

console.log('\n導覽項目');
ok('★ 綠底頂列只放 首頁 ＋ 預約行事曆',
   /\[\['coach_today','首頁','g_dashboard'\],\['calendar','預約行事曆','g_booking'\]\]\.map/.test(src));
ok('★ 只在「非手機且非店長」時走這條（店長仍是完整側欄版）',
   /if\(!isMobile && !SESSION\.is_manager\)\{[\s\S]{0,300}renderLeftSidebar\(\);/.test(src));
ok('★ 換頁時綠底頂列的高亮跟著換',
   /document\.querySelectorAll\('\.mc-nav-item\[data-page\]'\)\.forEach\(n=>n\.classList\.toggle\('active',n\.dataset\.page===key\)\);/.test(src));
ok('　　教練的名稱在頂列帳號卡顯示「教練」', /SESSION\.role==='coach'\?'教練':'管理員'/.test(src));
ok('　　手機版維持原本的底部導覽（首頁／行事曆）',
   /const COACH_BOTTOM_NAV=\[\s*\n\s*\{key:'coach_today',   label:'首頁'\},[\s\S]{0,300}\{key:'coach_calendar',label:'行事曆'\},/.test(src));
ok('　　薪資單／個人資料／補打卡仍在右上角 ☰ 選單', /薪資單、個人資料、補打卡等仍在右上角 ☰ 選單裡/.test(src));
ok('　　套用後直接 return，不會又被下面的 NAV.coach 覆蓋',
   /buildBottomNav\(\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*items = \(isMobile \? MOBILE_COACH_NAV : NAV\.coach\)\.slice\(\);/.test(src));
ok('　　舊的 navbar-row 顯示規則已移除（導覽改在綠底頂列）',
   !/#app-screen\.coach-wide\.role-coach \.navbar-row\{display:flex;\}/.test(src));
ok('　　原因寫在程式裡', /教練用桌機時是「放大版的手機介面」/.test(src));

console.log('\n教練看得到別人課卡的會員名（2026-07-30 使用者指示：只關互動，不遮名字）');
ok('★ 桌機行事曆不再把別人的課換成課程種類', /const hideMember = false;/.test(src));
ok('★ 手機 agenda 也一律顯示會員名（原本只顯示授課教練名）',
   /原本別人的課只顯示授課教練名，現在一律顯示會員名（不能點仍由 cag-noint 控制）/.test(src)
   && !/if\(layer==='mine' \|\| isAdmin\)\{   \/\/ 店長\/管理員：別人的課也顯示會員名/.test(src));
ok('★ 不能動別人的課仍然成立（三道：cal-ev-noint／cag-noint／coachOwnsBk）',
   /\.cal-ev\.cal-ev-noint\{pointer-events:none !important;/.test(src)
   && /\.cag-std\.cag-noint\{pointer-events:none;\}/.test(src)
   && /function coachOwnsBk\(b\)\{/.test(src));
ok('　　bkIsMasked 保留（仍控制別人的課卡淡化，不再管名字）',
   /function bkIsMasked\(b\)\{/.test(src) && /不再管名字/.test(src));
ok('　　原因寫在程式裡', /教練也開放看其他預約課卡的會員名字，只是關閉互動功能/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
