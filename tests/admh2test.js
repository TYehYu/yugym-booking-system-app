/* 管理員手機首頁：左日期欄／右課卡欄的雙欄試點（2026-08-22 使用者指示，附參考圖）
   「左邊大日期欄獨立卷軸 右邊當日課卡欄獨立卷軸；左欄顯示一週、週一第一個、左右滑上下週」
   ＋「下拉更新只有從頂列往下滑才會觸發」＋課卡欄位重排＋一個可以關掉的開關。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('① 開關（使用者：先看效果）');
ok('★ 程式面一行改回舊版', /const ADMH2_DEFAULT = true;/.test(src)
   && /function admh2On\(\)\{/.test(src));
ok('★ 現場面不用改程式也能關（localStorage admh2=0／1）',
   /const v=localStorage\.getItem\('admh2'\); if\(v==='0'\) return false; if\(v==='1'\) return true;/.test(src));
ok('　　舊版單欄那條路原封不動留著（開關關掉就回去）',
   /\}else\{\s*\n\s*admMobHero=`<div class="admh">/.test(src)
   && /舊版單欄那條路到此為止/.test(src));
ok('　　註明定案後要把開關與舊版一起收掉', /定案之後這個開關與舊版那條路要一起收掉/.test(src));

console.log('\n② 只隔開管理員手機首頁（教練端不受影響）');
ok('★★ 雙欄樣式一律掛在 .admh2 之下 —— .admh 是教練手機首頁（admh chv2）共用的',
   /\.admh2-body\{display:flex;/.test(src)
   && /\.admh 這組 class 是教練手機首頁（coachHomeV2 的/.test(src));
ok('　　CSS 沒有任何一條把雙欄樣式加在裸 .admh 上',
   !/^\.admh\{[^}]*display:flex[^}]*\}/m.test(src)
   && (src.match(/\.admh2-/g)||[]).length>10);
ok('　　教練首頁仍是 admh chv2（沒被改成雙欄）', /<div class="admh chv2">/.test(src));

console.log('\n③ 版面：上方不動，下方兩欄各自捲動');
ok('★ 大日期＋KPI 與教練篩選列維持原本那組 class',
   /<div class="admh admh2">[\s\S]{0,900}?<div class="admh-bigrow">[\s\S]{0,1200}?<div class="admh-coach a2-chips">/.test(src));
ok('★ 左欄七天、週一第一個（沿用既有的 heroWeekMonday，不另立一套）',
   /let _a2Rail='';[\s\S]{0,120}?for\(let i=0;i<7;i\+\+\)\{ const d=new Date\(_mon\);/.test(src)
   && /const _mon=heroWeekMonday\(date\);/.test(src));
/* 2026-08-22 二修（使用者）：「讓畫面固定顯示七天…只有右邊課卡可以滑動」 */
ok('★★ 左欄不捲：七天平分整欄高度（視窗矮的時候一起縮，不會有人被切掉）',
   /\.admh2-rail\{flex:0 0 62px;overflow:hidden;/.test(src)
   && /justify-content:space-evenly;/.test(src)
   && /\.a2-day\{flex:1 1 0;min-height:0;overflow:hidden;/.test(src));
ok('★ 只有右欄會捲', /\.admh2-cards\{flex:1 1 auto;min-width:0;overflow-y:auto;/.test(src));
ok('★ 左欄不再顯示堂數（少一列才塞得下七天）',
   !/<span class="a2-dc">/.test(src) && !/\.a2-day \.a2-dc\{/.test(src));
ok('★★ 捲到底要放開再滑一次才帶動整頁 —— 這是原生行為，所以刻意不設 overscroll-behavior:contain',
   /\.admh2-cards\{[^}]*overscroll-behavior-y:auto;/.test(src)
   && /設了會變成永遠帶不動頁面/.test(src));
ok('　　左欄不捲了，就不需要把選取那天捲進視線',
   !/if\(on && on\.scrollIntoView\)/.test(src));
ok('★★ ⚠ 高度只能依版面位置算，不能依當下捲動位置（使用者：「連續點下方的首頁 畫面會變成這樣」）'
   +' —— navTo 保留捲動位置，捲下去之後 r.top 變小甚至變負，再算一次就把兩欄撐得比視窗還高',
   /const docTop=r\.top\+\(window\.scrollY\|\|document\.documentElement\.scrollTop\|\|0\);/.test(src)
   && /window\.innerHeight - docTop - navH - 16/.test(src)
   && /改成先換回「文件座標」再算，重算幾次都是同一個值/.test(src));
ok('★★ 內層要捲得動就得有明確高度 → 掛載時依剩餘視窗高度算，resize／轉向重算',
   /const h=Math\.max\(240, Math\.round\(window\.innerHeight - docTop - navH - 16\)\);/.test(src)
   && /window\.addEventListener\('resize', \(\)=>\{ try\{ admh2Mount\(\); \}catch\(_\)\{\} \}\);/.test(src));
/* 2026-08-22 使用者回報三件事，這三條各守一件 */
ok('★★ 高度要扣掉底部導覽列（「左邊日期欄週日會被下方導覽列擋住」）—— 它是 fixed、不佔文件高度',
   /\.bottom-nav 是 position:fixed、不佔文件高度/.test(src)
   && /document\.querySelectorAll\('\.bottom-nav'\)\.forEach\(n=>\{/.test(src));
ok('　　⚠ 取「量得到高度的那一個」：DOM 裡有隱藏的導覽列，抓第一個會拿到 0',
   /用 querySelector 抓第一個會拿到 0，最後一天照樣被壓到導覽列底下/.test(src));
ok('★★ 課卡不能被壓扁（「右邊課卡全部重疊在一起了」）—— flex 直排＋固定高度時預設會 shrink',
   /\.admh2-cards>\*\{flex:0 0 auto;\}/.test(src)
   && /子項預設 flex-shrink:1 會被壓扁到重疊/.test(src));
ok('★ 捲軸不顯示（左欄已經不捲了，只剩右欄要藏）',
   /\.admh2-cards::-webkit-scrollbar\{display:none;width:0;height:0;\}/.test(src)
   && /\.admh2-cards\{[\s\S]{0,200}?scrollbar-width:none;-ms-overflow-style:none;\}/.test(src));
ok('　　底部留一點，不要讓人以為頁面到底了（下面還有今日值班／本月成績）',
   /讓下面的「今日值班／本月成績」露出一角，不會讓人以為頁面到底了/.test(src));
/* 2026-08-22 三修（使用者）：改成上下拖曳、拉住 0.5 秒才換週、上下畫箭頭提示 */
ok('★ 每一天一個白框（與右欄課卡同語彙）',
   /\.a2-day\{[\s\S]{0,220}?border:1px solid var\(--bd\);background:#fff;/.test(src));
ok('★ 上下箭頭提示可換週，也可以直接點',
   /<span class="a2-arw a2-arw-up" onclick="admWeekShift\(-1\)"><\/span>/.test(src)
   && /<span class="a2-arw a2-arw-dn" onclick="admWeekShift\(1\)"><\/span>/.test(src)
   && /\.a2-arw-up\{border-bottom:6px solid var\(--t3\);\}/.test(src));
ok('　　純 CSS 三角形，不吃字型（跨機一致）',
   /\.a2-arw\{[\s\S]{0,160}?border-left:5px solid transparent;border-right:5px solid transparent;/.test(src));
ok('★★ 上下拖曳換週：欄位跟著手指走一點點（打四五折、最多 26px）',
   /const TH=44, HOLD=500, MAXOFF=26;/.test(src)
   && /inner\.style\.transform='translateY\('\+Math\.max\(-MAXOFF,Math\.min\(MAXOFF, dy\*0\.45\)\)\+'px\)';/.test(src));
ok('★★ 拉過門檻要「停住 0.5 秒」才真的換週（隨手一滑不會換掉整週）',
   /armT=setTimeout\(\(\)=>\{ fired=true; clearArm\(\); snap\(\);/.test(src)
   && /\},HOLD\);/.test(src)
   && /和下拉更新同一套「拉到位再停一下」的手感/.test(src));
ok('　　手縮回門檻內或放開就取消，並且彈回原位',
   /if\(d===dir\) return;\s*\n\s*clearArm\(\); dir=d;/.test(src)
   && /const snap=\(\)=>\{ inner\.style\.transition='transform \.18s'; inner\.style\.transform='';/.test(src)
   && /const end=\(\)=>\{ if\(!fired\)\{ clearArm\(\); snap\(\); \} y0=null; \};/.test(src));
ok('★ 上推＝下一週、下拉＝上一週（跟月曆一樣，往回拉就是往回看）',
   /const d=\(dy<=-TH\)\?1:\(\(dy>=TH\)\?-1:0\);/.test(src)
   && /rail\.classList\.add\(d>0\?'a2-armnext':'a2-armprev'\);/.test(src));
ok('　　待命時亮起「會換到哪一週」那一顆箭頭',
   /\.admh2-rail\.a2-armprev \.a2-arw-up\{opacity:1;transform:scale\(1\.35\);border-bottom-color:var\(--green\);\}/.test(src)
   && /\.admh2-rail\.a2-armnext \.a2-arw-dn\{opacity:1;transform:scale\(1\.35\);border-top-color:var\(--green\);\}/.test(src));
ok('　　左欄自己不捲，所以垂直手勢全歸換週用（不需要軸鎖）',
   /左欄自己不捲（overflow:hidden），所以這裡不需要軸鎖/.test(src));

console.log('\n④ 下拉更新只從頂列觸發（使用者指示）');
ok('★★ 手指要落在頂欄上才起算（雙欄各自有捲軸，落在欄位裡往下滑是要捲內容）',
   /return !!\(el && el\.closest && el\.closest\('\.topbar,\.topbar-fixed'\)\);/.test(src)
   && /if\(\(window\.scrollY\|\|document\.documentElement\.scrollTop\|\|0\)<=0 && fromTop\(e\.touches\[0\]\)\)\{/.test(src));
ok('　　理由寫在原地', /再讓它同時觸發整頁重載會打架/.test(src));

console.log('\n⑤ 課卡欄位（使用者定版）');
ok('★ 出席章獨立一欄在左上', /<div class="a2-stampcol">\$\{_st\?`<span class="admh-stamp \$\{_st\[1\]\}">\$\{_st\[0\]\}<\/span>`:''\}<\/div>/.test(src)
   && /\.admh2-card \.a2-stampcol\{display:flex;align-items:flex-start;/.test(src));
ok('★ 中間三列：課程・場地／會員姓名（粗體）／第幾張票券',
   /<div class="a2-l1">\$\{cname\}\$\{_vlb\?'・'\+_vlb:''\}<\/div>/.test(src)
   && /<div class="a2-l2">\$\{mname\}<\/div>/.test(src)
   && /<div class="a2-l3">\$\{_tkTxt\?'票券 '\+_tkTxt:''\}<\/div>/.test(src)
   && /\.admh2-card \.a2-l2\{font-size:15px;font-weight:800;/.test(src));
ok('★★ ⚠ 別在 .a2-side 寫 max-width:34% —— 它是 grid item，百分比是對「那一欄」算的，'
   +'欄寬又由內容決定，等於自己乘自己，整欄會塌成 13px（時間與教練被擠到卡片中間）',
   !/\.admh2-card \.a2-side\{[^}]*max-width:34%/.test(src)
   && /百分比是對「那一欄的寬度」算的/.test(src));
ok('★ 改成把「教練名」那一行封頂（88px），欄寬自然跟著封頂',
   /\.admh2-card \.a2-coach\{font-size:10\.5px;color:var\(--t2\);display:block;max-width:88px;/.test(src));
ok('★ 右上時間、右下教練名（請假標貼著教練名）',
   /<span class="a2-time">\$\{b\.start_time\}<\/span>\s*\n\s*<span class="a2-coach">\$\{_lvTag\}\$\{_cnm\|\|''\}<\/span>/.test(src)
   && /\.admh2-card \.a2-side\{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;/.test(src));
ok('　　窄欄放不下就截斷，不要把卡撐爆',
   /\.admh2-card \.a2-l1\{[^}]*text-overflow:ellipsis;\}/.test(src)
   && /\.admh2-card \.a2-l2\{[^}]*text-overflow:ellipsis;\}/.test(src));
ok('★★ 票券「第幾張／共幾張」兩種版面共用同一份算法（不要兩套會漂移）',
   /const _tkTxt=tk\?\(\(\)=>\{const _lt=/.test(src)
   && /\$\{_tkTxt\?`<div class="admh-tk">票券 \$\{_tkTxt\}<\/div>`:''\}/.test(src));
ok('　　已簽到仍是整張填滿課程色（與單欄版同語彙）',
   /\.admh2-card\.admh-done\{background:var\(--admh-c,#1f6f54\);color:#fff;\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
