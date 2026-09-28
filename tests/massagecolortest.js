/* 運動按摩的課程色（2026-09-28 使用者附截圖：
     「今天14:00陳秀蘭 這一張課卡是運動按摩 可是這個顏色好像不是運動按摩」）

   根因：課程色 token 只有 pt／friendly／group／self／trial 五種，**沒有 massage**。
   缺了那一層之後，三個畫面各自想辦法繞過去：
     ・桌機行事曆（renderCalendar）直接把 ev-massage 對應成 **course-friendly**（藍）
       ← 使用者看到的就是這一個
     ・教練行事曆（renderCoachAgenda）給 ev-massage，但 Ink 課卡吃的是 --course-accent，
       沒有值就 fallback 成綠（＝跟教練課同色）
     ・日檢視另外寫了一條 !important 的保底 teal
   修法是補上缺的那一層，不是再加一條繞道。

   ⚠ 色值沿用全系統既有的按摩 teal（#2F8F83），不是新訂一個顏色。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 課程色 token 六種都在（原本缺 massage）');
['pt','friendly','group','self','trial','massage'].forEach(k=>{
  ok(`★★★ --course-${k}-accent／soft 有定義`,
     new RegExp('--course-'+k+'-accent:\\s*#[0-9A-Fa-f]{6};\\s*--course-'+k+'-soft:\\s*#[0-9A-Fa-f]{6};').test(src));
  ok(`★★★ .course-${k} 把 token 接到 --course-accent／soft`,
     new RegExp('\\.course-'+k+'\\{--course-accent:var\\(--course-'+k+'-accent\\);--course-soft:var\\(--course-'+k+'-soft\\);\\}').test(src));
});
ok('★★ 今日教練任務卡（mck-*）同一組 token，六種齊',
   ['pt','friendly','group','self','trial','massage'].every(k=>
     new RegExp('\\.mck-'+k+'\\{--mck-accent:var\\(--course-'+k+'-accent\\);--mck-soft:var\\(--course-'+k+'-soft\\);\\}').test(src)));
ok('★★★ 按摩色沿用既有的 teal，不是新訂一個',
   /--course-massage-accent:#2F8F83;/.test(src) && /\.tag-massage\{background:#dcefec;color:#2f8f83;\}/.test(src));

console.log('\n② 三個畫面都對應到 course-massage');
ok('★★★ 桌機行事曆不再把按摩當成友善課（這就是使用者看到的那張藍卡）',
   /'ev-trial':'course-trial','ev-massage':'course-massage'\}\)\[cls\]\|\|'course-pt'\)/.test(src)
   && !/'ev-massage':'course-friendly'/.test(src.replace(/\/\*[\s\S]*?\*\//g,' ')));
ok('★★★ 手機課卡（tcard）本來就對了',
   /'ev-trial':'course-trial','ev-massage':'course-massage'\}/.test(src));
ok('★★★ 教練行事曆兩個 class 都給（課程色走 course-massage、保底色走 ev-massage）',
   /const courseCls = _cc==='massage' \? 'course-massage ev-massage' : \('course-'\+_cc\);/.test(src));

console.log('\n③ 既有的保底規則不要動到（拿掉會影響日檢視、籤、列表）');
ok('★★ 日檢視的保底 teal 還在', /\.cal-ev\.cal-ev-day\.ev-massage\{background:#e4f2ef !important;/.test(src));
ok('★★ 籤、列表、週檢視那幾處的按摩色還在',
   /\.cal-chip\.cal-chip-course\.ev-massage\{background:#e0efec;color:#2f8f83;\}/.test(src)
   && /\.list-item\.li-course\.ev-massage\{border-left-color:#2f8f83;\}/.test(src)
   && /\.wk-massage\{background:#dcefec;color:#2f8f83;\}/.test(src));

console.log('\n④ 判色那一支本來就認得按摩（資料沒問題，問題只在顏色那一層）');
ok('★★ bkCC：票種 color=massage → massage', /if\(tt\.color==='massage'\) return 'massage';/.test(src));
ok('★★ evColorClass：票種 color=massage → ev-massage', /if\(color==='massage'\)return 'ev-massage';/.test(src));
ok('★★ 兩支都有 category 退路（舊資料沒有票種時）',
   /if\(cat==='運動按摩'\)return 'ev-massage';/.test(src)
   && /if\(tt && tt\.category==='運動按摩'\) return 'massage';/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
