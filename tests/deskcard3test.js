/* 桌機首頁課卡改成三欄（2026-08-22 使用者指示）：
   「第一欄出席章，第二欄分三列 課程名稱・使用場地／會員名稱（粗體）／第幾堂/總課堂，
     課卡右上角時間，右下角教練標籤」——與手機雙欄版 .admh2-card 同一種資訊順序。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('三欄結構');
ok('★ 第一欄＝出席章（假／未／簽三種照舊）',
   /<span class="t3-stamp">\$\{\(\(\)=>\{const k=bkStampKind\(b\);/.test(src)
   && /return k==='leave'\?'<span class="tcard-chk tcard-chk-leave">假<\/span>'/.test(src));
/* 0822 更正：場地從「跟課程名擠同一列」改成自己一列（第二列）——
   「教練課・多功能訓練架」這種長度一定會被截掉，兩個都看不全。 */
ok('★ 第二欄四列：課程／使用場地／會員姓名（粗體）／第幾堂',
   /<span class="t3-l1">\$\{catName\[cc\]\|\|'課程'\}<\/span>\s*\n\s*<span class="t3-l1 t3-venue">\$\{\(typeof venueDisplay==='function'\)\?\(venueDisplay\(b\)\|\|''\):''\}<\/span>/.test(src)
   && /<span class="t3-l2 tcard-mem">\$\{nm\}<\/span>/.test(src)
   && /<span class="t3-l3">/.test(src)
   && /\.tcard-3c \.t3-l2\{font-size:14\.5px;font-weight:800;/.test(src));
ok('★ 右上時間、右下教練標籤（含待簽約等課別標）',
   /<span class="t3-side"><span class="tcard-time">\$\{b\.start_time\}<\/span><span class="t3-co">\$\{_tagOut\}\$\{coTag\}<\/span><\/span>/.test(src)
   && /\.tcard-3c \.t3-side\{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;/.test(src));
ok('★★ ⚠ 舊規則把時間釘在左上（.tcard-std .tcard-time{align-self:flex-start}），三欄版要覆蓋掉',
   /\.tcard-3c \.tcard-time\{align-self:flex-end !important;\}/.test(src)
   && /三欄版要靠右，否則時間會停在右欄的左緣、跟教練標籤對不齊/.test(src));
/* 120→190（0822 三欄排法）→165（0823 使用者要求再窄一點）。
   收窄的底線：中欄要留 ~76px 給場地「多功能訓練架」，再窄就會先切到那一列。 */
ok('★ 卡片 165px（120 放不下章＋三列＋時間／教練；190 是使用者嫌太寬的那一版）',
   /\.tcard\.tcard-std\{width:165px;min-height:98px;\}/.test(src)
   && /190px 是「課程名不必馬上截斷、一列仍放得下 4～5 張」的折衷/.test(src)
   && /再往下收就會先切到場地那一列/.test(src));
ok('　　長文字截斷而不是撐爆卡片',
   /\.tcard-3c \.t3-l1\{[^}]*text-overflow:ellipsis;\}/.test(src)
   && /\.tcard-3c \.t3-l2\{[^}]*text-overflow:ellipsis;\}/.test(src));
ok('　　自成一套 class（不共用 .admh2-card 那組，兩邊不互相牽動）',
   /但那組 class 綁在\s*\n?\s*\.admh2-card 底下，這裡自成一套/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
