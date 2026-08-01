/* 2026-08-01 使用者回報：「手機端在行事曆上下滑動的時候，有時候會拉到頂欄，
   這個能改善嗎？在預約課程的時候很困擾。」

   成因：課表容器捲到頂／到底之後，手指繼續滑，瀏覽器會把捲動「接力」給外層（scroll chaining），
   於是被拉動的是整個頁面，固定在上面的頂欄就跟著跑。
   解法是 overscroll-behavior：
     contain → 只擋接力，容器自己的橡皮筋還在（手感不變）
     none    → 連自己的橡皮筋一起關（用在最外層那一圈） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('捲動容器不再把捲動外溢給整頁');
ok('★ 手機端 agenda 的內容區（.cag-body）', /\.cag-body\{[^}]*overscroll-behavior-y:contain;\}/.test(src));
ok('★ 手機端週時間軸（.wtl-body）', /\.wtl-body\{[^}]*overscroll-behavior-y:contain;\}/.test(src));
ok('★ 共用行事曆本體（.cal-body）', /\.cal-body\{[\s\S]{0,240}overscroll-behavior:contain;\}/.test(src));

console.log('\n滿版圖層本身也擋一層');
ok('★ .cag-wrap', /\.cag-wrap\{[\s\S]{0,200}overscroll-behavior:none;\}/.test(src));
ok('★ .wtl-wrap', /\.wtl-wrap\{[\s\S]{0,260}overscroll-behavior:none;\}/.test(src));
/* 刻意不加 touch-action —— wtl-body 有橫向滑動換週（initWtlSwipe）、課卡有長按拖曳改期，
   限制觸控行為的風險大於好處；overscroll-behavior 已經解決「整頁被拉走」這件事。 */
ok('　　沒有動到 touch-action（橫向換週與課卡拖曳都靠觸控事件）',
   !/\.cag-wrap\{[\s\S]{0,200}touch-action:/.test(src) && !/\.wtl-wrap\{[\s\S]{0,260}touch-action:/.test(src));
ok('　　橫向換週的手勢還在', /function initWtlSwipe\(\)\{/.test(src));

console.log('\n整頁的橡皮筋只在行事曆頁關掉');
ok('★ 有行事曆圖層時才鎖整頁', /body:has\(#wtl-page\),body:has\(\.cag-wrap\)\{overscroll-behavior-y:none;\}/.test(src));
ok('★ 不是全站一律關（其他頁的下拉重新整理要留著）',
   !/^html,body\{overscroll-behavior/m.test(src) && !/^body\{overscroll-behavior/m.test(src));
ok('　　成因與兩種值的差別寫在程式裡',
   /手指繼續滑會把捲動「接力」給整頁/.test(src)
   && /`none` 會連系統的橡皮筋一起關掉、\s*\n\s*手感變硬，contain 只擋外溢/.test(src));

console.log('\n沒有動到既有的捲動設定');
ok('　　-webkit-overflow-scrolling 仍在（舊 iOS 的慣性捲動）',
   /\.cag-body\{[^}]*-webkit-overflow-scrolling:touch;/.test(src)
   && /\.wtl-body\{[^}]*-webkit-overflow-scrolling:touch;/.test(src));
ok('　　彈窗與時段清單原本就有的 contain 沒被改掉',
   /\.modal\{[^}]*overscroll-behavior:contain;\}/.test(src)
   && /\.cag-slots\{[^}]*overscroll-behavior:contain;\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
