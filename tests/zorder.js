/* 全站圖層順序（2026-09-03）

   使用者：「日期星期列跟左邊的時間列 在我開會員視窗的時候會高過視窗」

   起因：同一天為了修「課卡蓋過日期標題」，把行事曆的三個 sticky 圖層
   從 20／25／40 抬到 450／460／470。當時只看了「課卡 vs 欄頭」的相對關係，
   沒有看整份的高低順序 —— 一抬就翻過了會員資料視窗（當時 200）。

   ⚠ 這種錯誤沒有畫面就看不出來，而且要「剛好開著某個視窗又捲動行事曆」才會遇到。
     所以把整份順序寫成一條**數字必須遞增**的鏈，任何一層被調整都會在這裡爆。
   ⚠ 要改某一層時，改的是這條鏈的定義，不是繞過它。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 從 CSS 讀某一條規則的 z-index。
   ⚠ 同一個選擇器常常出現**很多次**（基本樣式一次、@media 裡再覆寫一次…），
     只取第一個會抓到沒有宣告 z-index 的那條而回傳 null（第一版就是這樣掛的）。
     改成掃過所有出現處，取**最後一個有宣告 z-index 的**（同權重時原始碼順序決勝）。 */
const z=(lit)=>{
  let i=-1, val=null;
  while((i=src.indexOf(lit, i+1))>=0){
    const j=src.indexOf('}', i); if(j<0) break;
    const m=src.slice(i,j).match(/z-index:\s*(\d+)/);
    if(m) val=Number(m[1]);
  }
  return val;
};

/* 由低到高。每一項：[名稱, 規則字面, 為什麼在這個位置] */
const CHAIN=[
  ['行事曆日期列（sticky）', '.cal-daycol-head{',
   '往上捲時要壓過課卡 —— 0903 使用者：「行事曆課卡會蓋過日期標題」'],
  ['行事曆時間軸（sticky）', '.cal-timecol{',
   '左上角與日期列交會，時間軸要在上面'],
  ['5 日檢視的左右箭頭', '.cal-hdr-arrow{',
   '它壓在日期列那一排上'],
  ['課卡 hover', '.cal-ev.cal-ev-std:hover{',
   '滑過的卡要浮到同時段其他卡之上'],
  ['課卡 active', '.cal-ev.cal-ev-std.cal-ev-active{', '點選中的卡再高一階'],
  ['課卡展開', '.cal-ev.cal-ev-std.cal-ev-expanded{', '展開的簡易課卡是行事曆的最高點'],
  ['會員資料視窗', '.pp-sheet{',
   '開了就該蓋住整個行事曆（含所有 sticky 圖層）'],
  ['讀取遮罩', '#ui-busy{', '讀取中要蓋在視窗上，不能被擋'],
  ['一般彈窗', '.modal-bg{', '票券校正／展延要能開在會員視窗之上'],
  /* ⚠ 帳號抽屜（.tb-acct-menu）刻意不列進這條鏈 —— 它桌機是 80、手機媒體查詢裡是 9500，
     兩種裝置各一套，放進「單一遞增鏈」只會逼出一個假的順序。 */
];

console.log('① 每一層都讀得到 z-index');
const vals=CHAIN.map(([n,lit])=>{ const v=z(lit); ok('　 '+n, v!==null, {規則:lit}); return v; });

console.log('\n② 由低到高必須嚴格遞增');
for(let i=1;i<vals.length;i++){
  const [na,,] = CHAIN[i-1], [nb,,why] = CHAIN[i];
  ok(`★★★ ${na}(${vals[i-1]}) ＜ ${nb}(${vals[i]})　—— ${why}`,
     vals[i-1]!==null && vals[i]!==null && vals[i-1] < vals[i]);
}

console.log('\n③ 會員視窗那三個 class 的 z-index 要一致');
/* .pp-sheet-desk／-win 會覆寫 .pp-sheet 的值；三處不同步就會出現
   「桌機蓋得住、手機蓋不住」這種只在一種裝置上重現的 bug。 */
{
  const a=z('.pp-sheet{'), b=z('.pp-sheet.pp-sheet-desk{'), c=z('.pp-sheet.pp-sheet-win{');
  ok('★★★ .pp-sheet／-desk／-win 三處同值', a===b && b===c, {基本:a, 桌機:b, 手機視窗:c});
}

console.log('\n④ 起因與教訓寫在原地');
ok('★★★ 為什麼是 800，整條鏈寫在 .pp-sheet 上方',
   /行事曆整組的最高點是 660（課卡展開），所以視窗訂在 \*\*800\*\*/.test(src));
ok('★★ 記下這次翻車的原因（只看了局部的相對關係）',
   /這次就是只看了「課卡 vs 欄頭」\s*\n?\s*的相對關係，沒有看整份的高低順序/.test(src));
ok('★★ 指回這支測試', /tests\/zorder\.js 會擋下再次翻車/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
