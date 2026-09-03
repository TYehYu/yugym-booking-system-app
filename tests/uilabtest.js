/* UI 實驗室（2026-09-03 使用者指示：「先做一個專門來測試技能的頁面」）

   要試 UI 技能（ui-skills 的 improve-ui、taste-skill…）給的建議，但不能動到營運畫面
   —— 管理員桌機首頁與櫃檯是**同一支頁面**（PAGES.g_dashboard，fd:true，桌機版沒有角色分支），
   直接在那裡試，櫃檯明天開店就看到了。

   這支測試守的是**隔離**，不是版面好不好看：
     ① 導覽項目沒有 fd（櫃檯選單不會出現這一項）
     ② 頁面本身再守一次角色
     ③ 實驗樣式全部掛在 body.uilab 底下 —— 少寫一次前綴就會漏到營運畫面上
     ④ 不複製首頁的程式（複製出來的兩份會各自長歪） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 三道隔離');
ok('★★★ 導覽項目沒有 fd（櫃檯的選單不會出現）',
   /\{label:'UI 實驗室', page:'g_uilab'\},/.test(src)
   && !/\{label:'UI 實驗室', page:'g_uilab', fd:true\}/.test(src));
ok('★★★ 頁面本身再守一次角色（不靠導覽當唯一的門）',
   /PAGES\.g_uilab=async function\(\)\{\s*\n\s*if\(!\(SESSION && SESSION\.role==='admin'\)\)\{/.test(src));
ok('★★★ body.uilab 只在「管理員 ＋ 停在這一頁」時成立，換頁自動拆',
   /document\.body\.classList\.toggle\('uilab', key==='g_uilab' && !!\(SESSION&&SESSION\.role==='admin'\)\);/.test(src));

console.log('\n② 實驗樣式不能漏到營運畫面');
{
  /* 實驗區＝那段註解到 CSS 區塊結束之間的規則，每一條都必須 body.uilab 開頭。
     .uilab-bar 是實驗室自己的提示條，它只出現在這一頁的 DOM 上，允許裸寫。 */
  const i=src.indexOf('/* ── 實驗區：以下自由塗改，每條都要 body.uilab 前綴');
  const j=src.indexOf('/* 課卡區的米色底', i);
  ok('　　實驗區存在', i>0 && j>i);
  const seg=src.slice(i,j).replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=seg.split('\n').map(l=>l.trim()).filter(l=>/^[.#a-z\[:]/.test(l) && l.includes('{'));
  const bad=rules.filter(l=>!/^body\.uilab\b/.test(l));
  ok('★★★ 實驗區的每一條都以 body.uilab 開頭（少一次前綴就會套到櫃檯身上）',
     bad.length===0, bad);
}
ok('★★ 前綴這件事寫在原地（下一個人才不會漏）',
   /少寫一次前綴，那條規則就會套到營運畫面上（管理員首頁與櫃檯是同一支頁面）/.test(src));
ok('★★ 也寫了「試出來要留的怎麼收尾」',
   /試出來要留的，\s*\n?\s*搬到上面對應的區塊、拿掉 uilab 前綴，並補上為什麼要改/.test(src));

console.log('\n③ 不複製首頁的程式');
ok('★★★ 直接跑同一支 PAGES.g_dashboard（同一份資料、同一批產生器）',
   /PAGES\.g_uilab=async function\(\)\{[\s\S]{0,400}?await PAGES\.g_dashboard\(\);/.test(src));
ok('★★★ 首頁的產生器只有一份（沒有為了實驗室複製第二份）',
   (src.match(/const kpiRows=`<div class="mc-kpirows">/g)||[]).length===1
   && (src.match(/const quickCard=`<div class="mc-quick3">/g)||[]).length===1
   && (src.match(/const dayBar = `<div class="twk-bar">/g)||[]).length===1
   && (src.match(/PAGES\.g_dashboard=async function\(\)\{/g)||[]).length===1);
ok('★★ 侷限講在前面（只試得動 CSS 表達得出來的改動）',
   /只試得動「用 CSS 表達得出來」的改動/.test(src)
   && /不要為了方便先把門打開/.test(src));

console.log('\n④ 提示條');
ok('★★ 提示條插在 g_dashboard 畫完之後（它是整段 innerHTML 覆寫，先插會被蓋掉）',
   /await PAGES\.g_dashboard\(\);[\s\S]{0,400}?C\.insertAdjacentHTML\('afterbegin',/.test(src)
   && /它是整段 innerHTML 覆寫，先插會被蓋掉/.test(src));
ok('★ 寫明「不會影響櫃檯與營運畫面」，並留一顆回營運首頁',
   /這裡的改動不會影響櫃檯與營運畫面。/.test(src)
   && /onclick="navTo\('g_dashboard'\)">回營運首頁<\/button>/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
