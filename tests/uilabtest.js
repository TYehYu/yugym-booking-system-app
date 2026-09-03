/* UI 實驗室（2026-09-03）

   ① 首頁那間（g_uilab）當天開、當天收：
      使用者「先做一個專門來測試技能的頁面」→ 試出三條 → 「首頁可以把實驗室上線
      然後關掉實驗室的頁面」。三條都搬進正式規則，頁面與導覽項目一起移除。
   ② 預約管理那間（g_uilab_cal）還開著：
      使用者「管理員桌機頁面-預約管理可以建立ui實驗室嗎 這邊好像更需要調整」。

   這支測試守的是**隔離**與**收攤有沒有收乾淨**，不是版面好不好看：
     ・導覽項目沒有 fd（櫃檯選單不會出現）
     ・頁面本身再守一次角色
     ・實驗樣式全部掛在 body.uilab 底下 —— 少寫一次前綴就會漏到營運畫面上
     ・不複製營運頁的程式，也不複製實驗室外殼
     ・收攤的那間，程式與導覽都要真的不見（留著半套比沒有更糟） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 首頁那間已經收乾淨');
ok('★★★ PAGES.g_uilab 不存在了', !/PAGES\.g_uilab=/.test(src));
ok('★★★ 導覽也沒有殘留的項目', !/\{label:'UI 實驗室', page:'g_uilab'\}/.test(src));
ok('★★ navTo 不再認 g_uilab', !/key==='g_uilab'\|\|/.test(src) && !/CUR_PAGE==='g_uilab'\b/.test(src));
/* dashRepaint 是為了實驗室才生出來的，但**刻意留著** ——
   下次任何「借用首頁畫面」的頁面都會踩到同一個坑（寫死 navTo 會把人彈出去）。 */
ok('★★ dashRepaint 留著，並寫明為什麼留',
   /function dashRepaint\(\)\{/.test(src)
   && /下次再有任何「借用首頁畫面」的頁面（預覽、實驗室、截圖模式）都會踩到同一個坑/.test(src)
   && (src.match(/window\._admCalKeep=true;\s*\n\s*dashRepaint\(\);/g)||[]).length===6);

console.log('\n② 三條實驗真的上線了（不是只把前綴拿掉就算）');
/* 【一】日期列「今天」：可點與不可點要分得出來 */
ok('★★★ 基本樣式已改成 透明底＋虛線框＋淡字',
   /\.twk-bar>\.twk-today-slot \.tl-daynav-today\.is-today\{\s*\n\s*background:transparent;color:var\(--t3\);border:1px dashed var\(--bd\);font-weight:600;/.test(src));
/* ⚠ 這一條是整組裡最容易漏的：基本樣式 (0,4,0) 壓不過 body.ink (0,4,1)，
     只改基本樣式的話，員工實際在用的 Ink 主題上完全看不出有改。 */
ok('★★★ Ink 主題也補了同一條（否則畫面上等於沒改）',
   /body\.ink \.twk-bar>\.twk-today-slot \.tl-daynav-today\.is-today\{\s*\n\s*background:transparent;color:var\(--t3\);border:1px dashed var\(--bd\);font-weight:600;\}/.test(src));
ok('★★ 權重這個坑寫在原地',
   /這條的權重是 \(0,4,0\)，\*\*壓不過\*\* body\.ink 那條 \(0,4,1\)/.test(src));
/* 【二】月曆「當月」跟進同一套 */
ok('★★★ 當月不再用 opacity 調淡，改成同一套虛線框',
   /\.mcal-btn-now\.is-now\{background:transparent;color:var\(--t3\);border:1px dashed var\(--bd\);/.test(src)
   && !/\.mcal-btn-now\.is-now\{opacity:\.55/.test(src));
ok('★★ 兩處是同一組語彙，寫明「改一邊要記得改另一邊」',
   /這一組語彙有兩處，改一邊要記得改另一邊/.test(src));
/* 【三】三組翻頁鈕長一樣 */
ok('★★★ 教練欄翻頁鈕改成 --card2 底、無陰影、hover 橄欖填滿',
   /\.tcol-pg\{[\s\S]{0,320}?background:var\(--card2\);[\s\S]{0,120}?box-shadow:none;\}/.test(src)
   && /\.tcol-pg:hover\{background:var\(--olive,#556B45\);border-color:var\(--olive,#556B45\);color:#F2EFE4;\}/.test(src));
ok('★★ 契約（0823「月曆翻頁跟日期列翻頁要一樣」）寫在原地',
   /0823 使用者定過「首頁的月曆翻頁跟日期列翻頁要一樣」/.test(src));
ok('★★★ 實驗區裡不留這三條的殘骸（留著＝同一條規則兩份）',
   !/body\.uilab \.twk-bar/.test(src) && !/body\.uilab \.mcal-btn-now/.test(src)
   && !/body\.uilab \.tcol-pg/.test(src));

console.log('\n③ 預約管理那間的三道隔離');
ok('★★★ 導覽項目沒有 fd（櫃檯的選單不會出現）',
   /\{label:'UI 實驗室', page:'g_uilab_cal'\},/.test(src)
   && !/\{label:'UI 實驗室', page:'g_uilab_cal', fd:true\}/.test(src));
ok('★★★ 頁面本身再守一次角色（不靠導覽當唯一的門）',
   /async function uilabShell\(realPage, backPage, backLabel, desc\)\{\s*\n\s*if\(!\(SESSION && SESSION\.role==='admin'\)\)\{/.test(src));
ok('★★★ body.uilab／uilab-cal 只在「管理員 ＋ 停在這一頁」時成立，換頁自動拆',
   /const _lab=\(key==='g_uilab_cal'\) && !!\(SESSION&&SESSION\.role==='admin'\);/.test(src)
   && /document\.body\.classList\.toggle\('uilab', _lab\);/.test(src)
   && /document\.body\.classList\.toggle\('uilab-cal', _lab && key==='g_uilab_cal'\);/.test(src));

console.log('\n④ 實驗樣式不能漏到營運畫面');
{
  const i=src.indexOf('/* ── 實驗區：以下自由塗改，每條都要 body.uilab 前綴');
  const j=src.indexOf('/* 課卡區的米色底', i);
  ok('　　實驗區存在', i>0 && j>i);
  const seg=src.slice(i,j).replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=seg.split('\n').map(l=>l.trim()).filter(l=>/^[.#a-z\[:]/.test(l) && l.includes('{'));
  const bad=rules.filter(l=>!/^body\.uilab\b/.test(l));
  ok('★★★ 實驗區的每一條都以 body.uilab 開頭（少一次前綴就會套到櫃檯身上）',
     bad.length===0, bad);
  /* 預約管理的實驗一定要再帶 uilab-cal：行事曆課卡與首頁課卡共用同一條 CSS 規則，
     只寫 body.uilab 的話，日後再開第二間就會互相污染。 */
  const calRules=rules.filter(l=>/\.cal-ev|\.cal-daycol|\.evc-/.test(l));
  ok('★★★ 動到課卡的實驗都帶了 .uilab-cal 與 .cal-ev（不能只寫 .evc-*）',
     calRules.length>0 && calRules.every(l=>/^body\.uilab\.uilab-cal\b/.test(l) && /\.cal-ev/.test(l)),
     calRules.filter(l=>!(/^body\.uilab\.uilab-cal\b/.test(l) && /\.cal-ev/.test(l))));
}
ok('★★★ 共用 CSS 這個陷阱寫在原地',
   /行事曆課卡（\.cal-ev-std）與首頁課卡（\.tcard-std）\*\*寫在同一條 CSS 規則裡\*\*/.test(src)
   && /只寫 \.evc-\* 會連首頁一起改/.test(src));
ok('★★ 「試出來要留的怎麼收尾」寫著',
   /搬到上面對應的區塊、拿掉 uilab 前綴，並補上為什麼要改/.test(src));

console.log('\n⑤ 不複製程式');
ok('★★★ 實驗室外殼只有一份，帶參數而不是複製兩份',
   (src.match(/async function uilabShell\(/g)||[]).length===1
   && /PAGES\.g_uilab_cal=async function\(\)\{\s*\n\s*await uilabShell\('calendar','calendar'/.test(src));
ok('★★★ 直接跑同一支 PAGES.calendar（同一份資料、同一批產生器）',
   /await PAGES\[realPage\]\(\);/.test(src)
   && (src.match(/PAGES\.calendar=async function\(\)\{/g)||[]).length===1);
ok('★★ 為什麼做成外殼而不是複製，寫在原地',
   /刻意做成一支帶參數的外殼，而不是複製兩份/.test(src));
ok('★★ 提示條插在真正那一頁畫完之後（整段 innerHTML 覆寫，先插會被蓋掉）',
   /await PAGES\[realPage\]\(\);[\s\S]{0,320}?C\.insertAdjacentHTML\('afterbegin',/.test(src)
   && /它是整段 innerHTML 覆寫，先插會被蓋掉/.test(src));
ok('★ 寫明「不會影響櫃檯與營運畫面」，並留一顆回營運的按鈕',
   /這裡的改動不會影響櫃檯與營運畫面。/.test(src)
   && /onclick="navTo\('\$\{backPage\}'\)">\$\{backLabel\}<\/button>/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
