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
ok('★★★ 幽靈卡上有「第 n 位」的標，且跟著落點更新',
   /tag\.className='cxe-slot'; ghost\.appendChild\(tag\);/.test(FN)
   && /ghost\._slot\.textContent='第 '\+\(idx\+1\)\+' 位';/.test(FN));
ok('★★ 標的樣式有定義（貼在卡片右上角外側，不壓到動作名）',
   /\.cxe-slot\{position:absolute;right:-6px;top:-10px;/.test(src));

console.log('\n③ 0916 在手機上試出來的三道防線沒被動到');
ok('★★★ pointerdown 當下就關掉 touch-action', /el\.style\.touchAction='none'/.test(FN));
ok('★★★ non-passive touchmove，長按成立後 preventDefault',
   /const tmove=\(ev\)=>\{ if\(armed\) ev\.preventDefault\(\); \};/.test(FN)
   && /addEventListener\('touchmove',tmove,\{passive:false\}\)/.test(FN));
ok('★★★ 長按成立後 pointercancel 不當結束', /const onCancel=\(\)=>\{ if\(!armed\) finish\(false\); \};/.test(FN));
ok('★★ 拖移全程只搬 DOM（放開才寫回資料庫）',
   /box\.insertBefore\(el, ref\);/.test(FN) && /cxeSaveOrder\(rowsNow\(\)\.map\(r=>r\.dataset\.id\)/.test(FN));

console.log('\n④ 方案編輯器那一支是另一份，這次沒動');
ok('★★ wpLpStart 還在（它有自己的 moveTo）', /function wpLpStart\(/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
