/* 首頁教練課程區做減法（2026-08-27 使用者指示）
   「目前視覺太厚重，請做減法，不要改變功能…核心原則：減少背（景／框／陰影）」

   使用者列的七點：
     ① 整列米色圓角底 → 白／極淡，改用細分隔線區隔教練
     ② 左側大型圓形教練 badge → 固定寬度 coach column，只有名字＋堂數，名字用識別色、無底
     ③ 課卡去陰影、降低框線對比與圓角，垂直高度縮 15–20%
     ④ 課程類型顏色保留，但只用左側 3–4px accent ＋ 極淡 tint
     ⑤ 每列已代表一位教練 → 卡片右下角不再重複教練名
     ⑥ 更像 modern scheduling dashboard，不是一層層的 card UI
     ⑦ 不可為了簡化而移除會員姓名、時間、課程類型、方案進度 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const B=(()=>{const m='/* ══ Ink · 首頁教練課程區做減法';const a=src.indexOf(m);
  const nxt=src.indexOf('\n/* ══', a+40), cap=src.indexOf('</style>');
  return src.slice(a, (nxt>=0&&nxt<cap)?nxt:cap);})();
const R=B.replace(/\/\*[\s\S]*?\*\//g,'');

console.log('① 整列的米色圓角底退場');
{
  ok('★★ 改成透明底＋細分隔線',
     /body\.ink \.tl-3col \.tcard-row\{background:transparent;border-radius:0;padding-left:0;\s*\n\s*border-bottom:1px solid rgba\(45,36,28,\.08\);\}/.test(src));
  ok('　 最後一列不畫線（不然底部出現雙線）',
     /body\.ink \.tl-3col \.tcard-rows \.tcard-row:last-child\{border-bottom:none;\}/.test(src));
  ok('　 sticky 的教練欄底色跟著換白（不然橫捲時它還是米色）',
     /body\.ink \.tl-3col \.tcard-row \.tcard-coach\{background:var\(--card\);\}/.test(src));
  ok('★★ 「上課中」那層綠漸層換成左緣細線（漸層不在這一版的語彙裡）',
     /body\.ink \.tcard-row-live\{background:transparent;border-radius:0;\s*\n\s*box-shadow:inset 3px 0 0 var\(--course-pt-accent,#1F6F54\);\}/.test(src));
  ok('　 原本那條漸層沒被刪（關掉 Ink 就回去）',
     /\.tcard-row-live\{background:linear-gradient\(90deg,rgba\(31,111,84,0\.05\),transparent\);border-radius:10px;\}/.test(src));
}

console.log('\n② 圓形 badge → 教練欄');
{
  ok('★★ 底色拿掉、不再是 72px 圓',
     /body\.ink \.tcard-cball\{background:transparent !important;border-radius:0;/.test(src)
     && /\.tcard-cball\{width:72px;height:72px;border-radius:50%;/.test(src));
  ok('★★ 名字直接吃教練識別色（inline color 帶進來的），Ink 沒有自己訂教練色',
     /style="background:\$\{_cc\.bg\};color:\$\{_cc\.fg\};"/.test(src)
     && !/_cc\.fg/.test(R));
  ok('★★ 名字放大成主角、堂數退成次要（原本是數字大、名字小）',
     /body\.ink \.tcard-cball \.tcard-cbn\{font-size:13px;font-weight:700;opacity:1;/.test(src)
     && /body\.ink \.tcard-cball \.tcard-cbt\{font-size:15px;font-weight:700;color:var\(--t2\);/.test(src)
     && /\.tcard-cball \.tcard-cbt\{font-family:var\(--num\);font-size:17px;font-weight:800;/.test(src));
  ok('　 長名字（中文全名）仍有縮字規則', /body\.ink \.tcard-cball \.tcard-cbn\.long\{font-size:12px;\}/.test(src));
  /* 2026-08-27 二修：「教練名字下方的數字放大一些」12 → 15px。
     名字仍靠「顏色＋字重」領先，不是靠字級 —— 所以數字比名字大一點是可以的。 */
  ok('★★ 數字放大到 15px，但顏色與字重仍讓名字領先',
     /font-size:15px;font-weight:700;color:var\(--t2\);/.test(R)
     && /\.tcard-cbn\{font-size:13px;font-weight:700;opacity:1;/.test(R)
     && /名字是這一欄的識別，\s*\n\s*顏色與字重都在它身上；數字只是放大到看得清楚，不搶主角/.test(src));
  ok('　 堂數用等寬數字（一欄數字才對得齊）', /font-variant-numeric:tabular-nums;/.test(R));
  ok('★ 教練欄與課卡之間留一條細線（固定寬度的 coach column 語彙）',
     /body\.ink \.tl-3col \.tcard-coach\{border-right:1px solid rgba\(45,36,28,\.08\);\}/.test(src));
}

console.log('\n③④ 課卡：去陰影、降對比、縮高度，但課程色留著');
{
  ok('★★ 去陰影、圓角降到 2px、框線對比降到 14%',
     /body\.ink \.tcard\.tcard-std\{min-height:82px;box-shadow:none;\}/.test(src)
     && /border-color:color-mix\(in srgb, var\(--course-accent,#3D7039\) 14%, transparent\) !important;\s*\n\s*border-radius:2px;box-shadow:none;/.test(src));
  ok('★★ 高度縮約 16%（98 → 82px），內層 txt 一起縮（不然外縮內不縮等於沒縮）',
     /\.tcard\.tcard-std\{width:165px;min-height:98px;\}/.test(src)
     && /body\.ink \.tcard-std \.tcard-txt\{min-height:82px;\}/.test(src)
     && Math.round((98-82)/98*100)===16);
  ok('★★ 課程類型仍看得出來：左側 3px 色條 ＋ 極淡同色底',
     /body\.ink \.tcard\.tcard-std \.tcard-body::before\{width:3px;\}/.test(src)
     && /body\.ink \.tcard\.tcard-std \.tcard-body\{\s*\n\s*background:color-mix\(in srgb, var\(--course-soft,#EAF3EF\) 30%, #FFFDF8\) !important;/.test(src));
  ok('　 色條的顏色仍是課程色 token（沒有另訂一份）',
     /background:var\(--course-accent,#3D7039\);/.test(src));
}

console.log('\n⑤ 卡片右下角不再重複教練名');
{
  ok('★★ 只收教練名那一顆',
     /body\.ink \.tcard-row \.tcard-co:not\(\.tcard-leavetag\)\{display:none;\}/.test(src));
  ok('★★ 請假標籤留著 —— 它講的不是誰上課，而是「這一堂請假了」',
     /它講的不是誰上課，\s*\n\s*而是「這一堂請假了」/.test(src)
     && /<span class="tcard-co tcard-leavetag" style="background:#7A2E28;color:#F4F1E8;">請假<\/span>/.test(src));
  ok('　 只在教練列裡收（.tcard-row 底下）—— 別處的 tcard 還在用同一個 class',
     /\.tcard-row \.tcard-co:not/.test(R) && !/^body\.ink \.tcard-co\{display:none/m.test(R));
}

console.log('\n⑦ 資訊一個都沒少');
{
  /* 逐一指名卡片上那四樣資訊的實際元素（0822 定版的三欄排法）：
     t3-l1 課程類型／t3-venue 場地／t3-l2 會員姓名／t3-l3 第幾堂／tcard-time 時間 */
  const keep=[['課程類型', /<span class="t3-l1">\$\{catName\[cc\]\|\|'課程'\}<\/span>/],
              ['場地',     /<span class="t3-l1 t3-venue">/],
              ['會員姓名', /<span class="t3-l2 tcard-mem\$\{bkNameBlankCls\(b\)\}">\$\{nm\}<\/span>/],
              ['方案進度', /<span class="t3-l3">/],
              ['時間',     /<span class="tcard-time">\$\{b\.start_time\}<\/span>/],
              ['出席章',   /<span class="t3-stamp">/]];
  eq('★★ 卡片上的資訊一個都沒少（只是拿掉盛裝它們的容器）',
     keep.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★★ Ink 層沒有把其中任何一個藏起來',
     !/t3-l1|t3-l2|t3-l3|t3-venue|tcard-time|t3-stamp|tcard-mem/.test(R));
  ok('★★ 沒有一條規則碰版面（排序、橫捲、翻頁鈕都照舊）',
     !/(^|[;{\s])(position|top|left|right|bottom|flex-direction)\s*:/.test(R));
  ok('　 只有教練欄的寬度被放開（原本 72px 的圓要撐開成文字欄）',
     (R.match(/width:/g)||[]).length===2 && /width:auto;align-items:flex-start;/.test(R));
  ok('　 display:none 只出現在「收掉重複的教練名」那一條',
     (R.match(/display:none/g)||[]).length===1);
  ok('★ 使用者的核心原則寫在原地',
     /核心原則：減少背（景／框／陰影）/.test(src)
     && /資訊一個都沒少（使用者第 7 點）/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
