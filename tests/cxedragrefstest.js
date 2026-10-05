/* 常用動作拖移的基準點（2026-10-05 使用者：「這邊動作庫拖移卡片順序的時候以卡片的左上角
   為基準點　不然拖移的時候都不知道卡片會換到哪邊去」）。

   0916 清單改多欄時，落點是用**游標**去比各張卡片的中心點。游標在卡片上的哪個位置
   取決於你一開始按在哪裡 —— 按右半邊就整整差好幾格。
   改成以「拖著那張卡片的左上角」對「各張卡片的左上角」比距離。

   Playwright 實測（桌機 1400 寬、四欄，把第 1 張拖到第 7 張的格子上，抓在卡片 85% 寬處）：
     ・改後（左上角）：落在第 7 張前面      ← 眼睛看到什麼就是什麼
     ・改前（游標）  ：落到第 4 個位置      ← 差三格
   所以這支守住的是「基準點是左上角、距離比到左上角」這兩件事。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i));};
const FN=g('function cxeLpStart(e,id){','\nfunction cxeCardHtml(list){');

console.log('① 基準點是卡片左上角，不是游標');
ok('★★★ 先把左上角算出來（游標扣掉抓握偏移）',
   /const gx=x-offX, gy=y-offY;/.test(FN));
ok('★★ 幽靈卡片跟著同一組座標（畫出來的位置＝算進去的位置）',
   /ghost\.style\.left=gx\+'px'; ghost\.style\.top=gy\+'px';/.test(FN));

console.log('\n② 落點是算格子，不是找最近的那一張卡');
ok('★★★ 抬起來時量一次格線（欄距／列距／欄數都是量的，不是用 280px 回推）',
   /const measureGrid=\(\)=>\{/.test(FN)
   && /pitchX:\(lefts\.length>1\?lefts\[1\]-lefts\[0\]:rs\[0\]\.width\)/.test(FN)
   && /pitchY:\(tops\.length>1\?tops\[1\]-tops\[0\]:rs\[0\]\.height\)/.test(FN)
   && /cols:lefts\.length/.test(FN));
ok('★★★ 欄與列都用 round（吸到最近的一格，不必把角推過邊界）',
   /const col=Math\.max\(0, Math\.min\(grid\.cols-1, Math\.round\(\(gx-grid\.x0\)\/grid\.pitchX\)\)\);/.test(FN)
   && /const row=Math\.max\(0, Math\.round\(\(gy-grid\.y0\)\/grid\.pitchY\)\);/.test(FN));
ok('★★★ 第幾格 = 列 × 欄數 + 欄，夾在 0..seq.length',
   /const idx=Math\.max\(0, Math\.min\(seq\.length, row\*grid\.cols\+col\)\);/.test(FN));
ok('★★ 量不到格線才退回舊的「找最近的一張」（不要整個拖移失效）',
   /if\(grid && grid\.cols>0 && grid\.pitchX>0 && grid\.pitchY>0\)\{/.test(FN)
   && /let target=null, best=Infinity, after=false;/.test(FN));

console.log('\n②b 放開前就知道會放到第幾個');
ok('★★★ 有「第 n 位」的標，且跟著落點更新',
   /ghost\._slot\.textContent='第 '\+\(idx\+1\)\+' 位';/.test(FN));
/* ⚠ 2026-10-05 二修（使用者：「第n位的標籤會被遮住」）——卡片有 overflow:hidden，
   標塞在卡片裡會被切掉，所以改成掛在 body 上、每次 moveTo 定位到卡片右上角。 */
ok('★★★ 標掛在 body（不是塞進卡片，會被 overflow:hidden 切掉）',
   /tag\.className='cxe-slot'; document\.body\.appendChild\(tag\);/.test(FN)
   && !/ghost\.appendChild\(tag\)/.test(src));
ok('★★★ 標是 fixed、層級高過幽靈卡（10200）',
   /\.cxe-slot\{position:fixed;z-index:10300;/.test(src));
ok('★★★ 每次移動都把標定位到卡片右上角',
   /const gb=ghost\.getBoundingClientRect\(\);/.test(FN)
   && /ghost\._slot\.style\.left=gb\.right\+'px'; ghost\._slot\.style\.top=gb\.top\+'px';/.test(FN));
ok('★★ 放開時標要跟著收掉（不然會留一顆浮在畫面上）',
   /if\(ghost\)\{ try\{ if\(ghost\._slot\) ghost\._slot\.remove\(\); \}catch\(_\)\{\}/.test(FN));

console.log('\n③ 0916 在手機上試出來的三道防線沒被動到');
ok('★★★ pointerdown 當下就關掉 touch-action', /el\.style\.touchAction='none'/.test(FN));
ok('★★★ non-passive touchmove，長按成立後 preventDefault',
   /const tmove=\(ev\)=>\{ if\(armed\) ev\.preventDefault\(\); \};/.test(FN)
   && /addEventListener\('touchmove',tmove,\{passive:false\}\)/.test(FN));
ok('★★★ 長按成立後 pointercancel 不當結束', /const onCancel=\(\)=>\{ if\(!armed\) finish\(false\); \};/.test(FN));
ok('★★ 拖移全程只搬 DOM（放開才寫回資料庫）',
   /box\.insertBefore\(el, ref\);/.test(FN) && /cxeSaveOrder\(rowsNow\(\)\.map\(r=>r\.dataset\.id\)/.test(FN));

console.log('\n④ 訓練方案編輯器那一支（wpLpStart）同一天也改了');
/* ⚠ 不能照抄常用動作那套算格線：這一頁是**單欄**，而且每一張卡的高度不一樣
   （有沒有數字列／備註都會差）。改成「上緣越過幾張卡的中線就排第幾個」。
   實測（第 1 張拖到第 6 張的位置）：抓上緣／中間／下緣三種都落在第 5 位；
   舊版分別是第 5、第 6、第 6 位。 */
const WP=g('function wpLpStart(e,i){','\nfunction ');
ok('★★★ 基準點是卡片上緣，不是游標',
   /const gy=y-offY;/.test(WP) && /if\(ghost\) ghost\.style\.top=gy\+'px';/.test(WP));
ok('★★★ 落點＝上緣越過幾張卡的中線（中線才有遲滯，不會在邊界彈）',
   /if\(gy > b2\.top \+ b2\.height\/2\) idx\+\+; else break;/.test(WP));
ok('★★★ 手上那張卡也寫「第 n 位」（與常用動作同一套語彙、共用 .cxe-slot）',
   /tag\.className='cxe-slot'; document\.body\.appendChild\(tag\);/.test(WP)
   && /ghost\._slot\.textContent='第 '\+\(idx\+1\)\+' 位';/.test(WP)
   && /ghost\._slot\.style\.left=gb\.right\+'px';/.test(WP));
ok('★★ 單欄專用：沒有去算等距格線（每張卡高度不一樣，算了會錯）',
   !/measureGrid/.test(WP) && !/grid\.pitchY/.test(WP));
ok('★★★ 0909 那三道防線沒被動到',
   /el\.style\.touchAction='none'/.test(WP)
   && /const tmove=\(ev\)=>\{ if\(armed\) ev\.preventDefault\(\); \};/.test(WP)
   && /const onCancel=\(\)=>\{ if\(!armed\) finish\(false\); \};/.test(WP));
ok('★★ 仍然只改記憶體裡的 S.items（要按「儲存方案」才寫回資料庫）',
   /const order=rowsNow\(\)\.map\(r=>Number\(r\.dataset\.i\)\)/.test(WP));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
