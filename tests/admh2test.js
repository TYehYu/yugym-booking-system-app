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
ok('★ 兩欄各自 overflow-y:auto',
   /\.admh2-rail\{[^}]*overflow-y:auto/.test(src) && /\.admh2-cards\{[^}]*overflow-y:auto/.test(src));
ok('★★ 內層要捲得動就得有明確高度 → 掛載時依剩餘視窗高度算，resize／轉向重算',
   /const h=Math\.max\(240, Math\.round\(window\.innerHeight - r\.top - 24\)\);/.test(src)
   && /window\.addEventListener\('resize', \(\)=>\{ try\{ admh2Mount\(\); \}catch\(_\)\{\} \}\);/.test(src));
ok('　　底部留一點，不要讓人以為頁面到底了（下面還有今日值班／本月成績）',
   /全部吃滿會讓人以為頁面到底了/.test(src));
ok('★ 左右滑換週：往左＝下一週，沿用既有的 admWeekShift',
   /try\{ admWeekShift\(dx<0\?1:-1\); \}catch\(_\)\{\}/.test(src));
ok('★★ ⚠ 軸鎖：左欄本身是上下捲的，水平位移要 >48px 且大於垂直 1.5 倍才算換週',
   /if\(Math\.abs\(dx\)>48 && Math\.abs\(dx\)>Math\.abs\(dy\)\*1\.5\)\{/.test(src)
   && /不鎖軸的話手指稍微斜一點就會誤觸換週/.test(src));
ok('　　換週後把選取那天捲進視線', /if\(on && on\.scrollIntoView\) on\.scrollIntoView\(\{block:'nearest'\}\);/.test(src));

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
