/* 課卡 A／B 面（2026-10-26 定版）

   使用者 1025：「可以把課卡做成ＡＢ面　Ａ面就是我們平常看到的資訊　Ｂ面是滑鼠滑上去
   的時候顯示」。1026 一條一條談完：

     A 面　底色＝課程色、左色條＝教練色
           第一列　出席章（最左）・〔友善〕・〔警示〕（最右）
           第二列　姓名 ＋ 時間（字級跟著卡片長大）
           第三列　場地（只有非預設場地才有）・右下角教練膠囊（150px 以上）
     B 面　底色＝教練色、左色條＝課程色　←—— 跟 A 面對調
           教練／進度（後接繳費標籤）／場地；團課把「進度」換成會員
           窄卡（<112px）只寫「教練縮寫＋場地」兩行置中
     翻牌　rotateX（上下翻）、延遲 0.15 秒、離開立刻翻回來、桌機限定

   這支盯五件事：
     ① 版面順序與章的位置
     ② 字級算法（高度上限 vs 寬度÷字數，而且先留給時間）
     ③ 時間門檻依名字長度分三段，與字級的三段互補
     ④ B 面的內容與顏色對調
     ⑤ 翻牌的軸、延遲、桌機限定 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const css=(src.match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join('\n');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 版面');
ok('★★★ 內容包在 .evc-flip 裡（翻的是內容層，不是整張卡）',
   /const _bodyOut = `<div class="evc-flip"><div class="evc-body"><\/div>/.test(src));
ok('★★★ 轉內容層的理由寫在原地（.cal-ev 要留著當 container）',
   /這樣 \.cal-ev 仍然是 container（container-type:size 掛在它身上）/.test(css));
ok('★★★ 第一列：章 → 友善 → 警示 → NEW',
   /<span class="evc-r1">\$\{_wmOut\}\$\{_friOut\}\$\{_alertOut\}\$\{_newOut\}<\/span>/.test(src));
ok('★★ 第一列靠左排、警示用 margin-left:auto 推到最右',
   /\.cal-ev\.cal-ev-std \.evc-r1\{display:flex;align-items:center;justify-content:flex-start;/.test(css)
   && /\.cal-ev\.cal-ev-std \.evc-r1 \.ev-payalert\{margin-left:auto;\}/.test(css));
ok('★★★ 第二列 flex:none —— 不讓它長到卡底壓住教練膠囊',
   /\.cal-ev\.cal-ev-std \.evc-r2\{display:flex;align-items:center;gap:6px;width:100%;min-width:0;\s*\n\s*flex:none;\}/.test(css));
ok('　　那個坑寫在原地（量到重疊 1px）', /量到重疊 1px，使用者回報「太擠」/.test(css));
ok('★★★ 場地那一行不可壓縮（flex:none）',
   /\.cal-ev\.cal-ev-std \.evc-vsub\{flex:none;\}/.test(css));
ok('　　為什麼要 flex:none —— 壓扁不會觸發溢出警告',
   /壓扁不會觸發任何溢出警告/.test(css));

console.log('\n② 字級：高度上限 vs 寬度÷字數');
ok('★★★ JS 把字數掛成 nm-s2…nm-s6', /const _nmSCls = ` nm-s\$\{Math\.min\(Math\.max\(_nmLen,2\),6\)\}`;/.test(src));
ok('★★★ 與直書用的 nm-v2／nm-v3 分開（團課與遮蔽卡也要有字級）',
   /字級則連團課與遮蔽卡都要套，不然那兩種永遠停在最小級/.test(src));
ok('★★★ 算法＝min(高度上限, (寬度 − 固定開銷) ÷ 字數)',
   /nm-s3\{font-size:clamp\(12px,min\(45cqh,calc\(\(100cqw - 56px\)\/3\)\),28px\) !important;\}/.test(css));
ok('★★★ 時間先留位子（扣 56px＝內距 18 ＋ 時間 38）',
   /先留給時間，剩下的才給名字/.test(css));
ok('★★ 時間收起來的窄卡只扣 18px', /nm-s3\{font-size:clamp\(12px,min\(45cqh,calc\(\(100cqw - 18px\)\/3\)\),28px\) !important;\}/.test(css));
ok('★★ 有教練膠囊時再扣 42px', /nm-s3\{font-size:clamp\(12px,min\(32cqh,calc\(\(100cqw - 98px\)\/3\)\),20px\) !important;\}/.test(css));
ok('★★ 有場地時名字上限壓到 20px（把第三列的位子留出來）',
   /:has\(\.evc-vsub\) \.evc-name\.nm-s3\{font-size:clamp\(12px,min\(32cqh,calc\(\(100cqw - 56px\)\/3\)\),20px\) !important;\}/.test(css));
ok('　　成因寫在原地（每堂課都是 60 分鐘，所以高度綁死了字級）',
   /而\*\*每一堂課都是 60 分鐘＝62px 高\*\*/.test(css));

console.log('\n③ 時間門檻三段，與字級三段互補');
ok('★★★ 2 字 84px 起、3 字 98px 起、4 字以上 112px 起',
   /@container \(min-width:98px\) and \(max-width:111px\)\{[\s\S]{0,220}nm-s3\) \.evc-hm\{display:inline;\}/.test(css)
   && /@container \(min-width:84px\) and \(max-width:97px\)\{[\s\S]{0,180}nm-s2\) \.evc-hm\{display:inline;\}/.test(css));
ok('★★★ 字級那邊有完全對應的三段（83↓／84–97／98–111）',
   /@container \(max-width:83px\)\{/.test(css)
   && /@container \(min-width:84px\) and \(max-width:97px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-name\.nm-s3/.test(css)
   && /@container \(min-width:98px\) and \(max-width:111px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-name\.nm-s4/.test(css));
ok('★★ 互補關係寫在原地（改門檻要兩邊一起改）',
   /改門檻要兩邊一起改，\s*\n?\s*否則會出現「時間收了但名字沒跟著變大」/.test(css));

console.log('\n④ B 面');
ok('★★★ 固定三列：教練／進度／場地',
   /_bkRow\('教練', _tipEscEarly\(_coFull\|\|'—'\)\)/.test(src)
   && /_bkRow\(_grpCard\?'會員':'進度'/.test(src)
   && /_bkRow\('場地', _tipEscEarly\(_venueFull\)\)/.test(src));
ok('★★★ 進度吃 _bkSeq（不另外查資料庫）',
   /const _seq = \(window\._bkSeq\|\|\{\}\)\[b\.id\];/.test(src)
   && /第 \$\{_seq\.i\} \/ \$\{_seq\.n\} 堂/.test(src));
ok('★★★ 團課換成會員縮寫（完整名單點卡片看）',
   /const _grpBrief = \(\)=>\{/.test(src)
   && /\$\{ns\[0\]\}・\$\{ns\[1\]\}＋\$\{ns\.length-2\}/.test(src));
ok('★★★ 繳費是標籤不是字色：紅〔最後一堂〕／金〔分期〕',
   /'<span class="bk-pay">最後一堂<\/span>'/.test(src)
   && /'<span class="bk-pay bk-pay-inst">分期<\/span>'/.test(src)
   && /\.evc-back \.bk-pay\{display:inline-block;flex:none;\s*\n?\s*background:#B3261E;color:#fff;/.test(css)
   && /\.evc-back \.bk-pay\.bk-pay-inst\{background:#9A6A1E;\}/.test(css));
ok('　　為什麼要標籤不是改字色（深底教練上紅字會變白字）',
   /標籤自己帶底色，所以淡底深底都讀得到/.test(css));
ok('★★★ 底色＝教練色、字色成對（深底的兩位要白字）',
   /background:var\(--co-bg,var\(--course-soft\)\);color:var\(--co-fg,var\(--text\)\);/.test(css));
ok('★★★ 左色條＝課程色（跟 A 面對調）',
   /\.cal-ev\.cal-ev-std \.evc-back::before\{content:'';position:absolute;left:0;top:0;bottom:0;\s*\n?\s*width:3px;background:var\(--course-accent,#3D7039\);\}/.test(css));
ok('★★ 圓角跟著卡片（border-radius:inherit）',
   /\.cal-ev\.cal-ev-std \.evc-back\{[\s\S]{0,200}border-radius:inherit;/.test(css));
ok('★★ 180px 以下收欄位名、150px 以下縮字',
   /@container \(max-width:180px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-back \.bk-k\{display:none;\}/.test(css));
/* ══ 門檻 1026 從 111px 下修到 80px（使用者看線上畫面：「這張卡的Ｂ面是不是其實
   塞得下課堂 n/n 跟繳費資訊」）—— 量出來 80px 剛好放得下最長的那兩串。 */
ok('★★★ 79px 以下才走兩行版（80px 起三列全給）',
   /<div class="bk-r bk-only"><span class="bk-v bk-ab">/.test(src)
   && /@container \(max-width:79px\)\{[\s\S]{0,420}\.bk-r:not\(\.bk-only\)\{display:none;\}/.test(css));
ok('★★★ 舊的 111px 門檻不在了', !/@container \(max-width:111px\)\{[\s\S]{0,200}bk-only/.test(css));
ok('★★ 量出來的三個寬度寫在原地（84 可以／70 被切／56 只能兩行）',
   /70px　可用寬 56px　「史密斯訓練架」被切/.test(css));
/* 窄卡那一行的場地要縮：venueDisplay 回的是完整名稱「史密斯訓練架」（0903 定版），
   56px 的卡可用寬只有 42px 一定被切。縮法是砍前綴，不是截字串。 */
ok('★★★ 窄卡的場地用短名（砍前綴，不是截字串）',
   /const _vnShort = String\(_venueFull\)\.split\('・'\)\[0\]\.replace\(\/\^史密斯\/,''\)\.replace\(\/\^團課\/,''\);/.test(src)
   && /截出來的「史密斯訓」沒有意義/.test(src));
ok('★★ 寬一點的卡仍然寫完整名稱（0903 定版沒被推翻）',
   /只有窄卡那一行縮：寬一點的卡仍然寫完整名稱/.test(src));

console.log('\n⑤b 自主訓練不做 B 面');
/* 使用者 1026：「自主訓練Ａ面就足夠顯示資訊　就不用使用Ｂ面了」——
   它沒有教練，場地本來就在 A 面第三列，翻過去只會看到「教練 —」加一行重複的場地。 */
ok('★★★ 自主訓練與遮蔽卡不畫 B 面',
   /const _noBack = hideMember \|\| bkIsSelf\(b\);/.test(src)
   && /const _backOut = _noBack \? '' :/.test(src));
ok('★★★ 沒有 B 面就不翻（:has(.evc-back) 擋住）',
   /\.cal-ev\.cal-ev-std:has\(\.evc-back\):hover \.evc-flip\{transform:rotateX\(180deg\)/.test(css));
ok('　　理由寫在原地（不然會翻到一張空白的背面）',
   /會翻到一張空白的背面/.test(css) || /翻到一張空白的背面/.test(src));

console.log('\n⑤ 翻牌');
ok('★★★ 軸是 rotateX（上下翻），不是 rotateY',
   /:hover \.evc-flip\{transform:rotateX\(180deg\);/.test(css)
   && !/\.evc-flip\{transform:rotateY/.test(css));
ok('★★★ 延遲 0.15 秒只加在翻過去，離開立刻回來',
   /transition:transform \.34s cubic-bezier\(\.2,\.7,\.3,1\);transition-delay:0s;/.test(css)
   && /transform:rotateX\(180deg\);transition-delay:\.15s;/.test(css));
ok('★★ 為什麼是上下翻，寫在原地', /課卡又矮又寬（62px × 最寬 290px），上下翻位移小/.test(css));
ok('★★★ 桌機限定（整段在 @media(min-width:601px) 內）', (()=>{
  const i=css.indexOf('.cal-ev.cal-ev-std .evc-flip{position:absolute');
  const j=css.lastIndexOf('@media(min-width:601px)', i);
  const k=css.lastIndexOf('@media (max-width:600px)', i);
  return i>0 && j>0 && j>k;
})());
ok('★★ 尊重「減少動態效果」的系統設定',
   /@media \(prefers-reduced-motion:reduce\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-flip\{transition:none;\}/.test(css));

console.log('\n⑥ 教練膠囊與顏色');
ok('★★★ 150px 以上才顯示（跟 B 面收欄位名同一條線）',
   /@container \(min-width:150px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach:not\(\.evc-leavetag\)\{display:inline-flex;position:absolute;/.test(css));
ok('★★★ 顏色走 CSS 變數（inline 會被 !important 洗掉）',
   /background:var\(--co-bg,#EAE6DE\) !important;color:var\(--co-fg,#6a655c\) !important;/.test(css)
   && /`<span class="evc-coach"><span class="co-fl">\$\{_coFull\}/.test(src));
/* ⚠ 教練工作台週曆用的是同一組 class（.cal-ev.cal-ev-std.cag-std），但它的膠囊顏色
   寫在 inline、沒有 --co-bg。上面那條要是沒排除它，那一頁的膠囊會全部變灰底。 */
ok('★★★ 排除教練工作台週曆（.cag-std）',
   /\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach:not\(\.evc-leavetag\)\{display:inline-flex;position:absolute;/.test(css)
   && /\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach\{display:none;\}/.test(css));
ok('　　那個坑寫在原地', /會把 inline 的 background／color 整個洗掉/.test(css));
ok('★★★ 教練色換成使用者的 Excel 配色（MANGO／BARRY 是深底白字）',
   /'c-mqueqc9uxp3k':\{bg:'#2452A2',fg:'#FFFFFF'\}/.test(src)
   && /'c-mqk98n91x2tf':\{bg:'#35714E',fg:'#FFFFFF'\}/.test(src));
ok('★★★ 同色相的兩對靠深淺分，所以色條吃 bg',
   /RANDY 與 MANGO 共用同一個藍（#2452A2）/.test(src)
   && /--coach-bar:\$\{_cc\.bg\}/.test(src));

console.log('\n⑦ 白底上的教練色（1026 使用者回報 MANGO／BARRY 變白字）');
/* 教練色是**一對**：bg 是填色、fg 是「配上那個填色」時的字色。
   MANGO 與 BARRY 是深底白字，把 fg 單獨拿去當白底上的文字就是白的。 */
ok('★★★ 首頁的教練名統一黑色（使用者指定）',
   /body\.ink \.tcard-co:not\(\.tcard-leavetag\)\{[\s\S]{0,200}color:var\(--text,#1D1813\) !important;\}/.test(css)
   && /body\.ink \.tcard-cball \.tcard-cbn\{[\s\S]{0,120}color:var\(--text,#1D1813\) !important;\}/.test(css));
ok('★★★ 其他「沒有自己底色」的地方走 coachInkColor（挑比較深的那個）',
   /function coachInkColor\(id\)\{/.test(src)
   && /_fmCol\[c\.id\]=coachInkColor\(c\.id\);/.test(src)
   && /--sc:\$\{coachInkColor\(x\.id\)\}/.test(src));
/* ⚠ 掃整份原始碼：每一處插值用到 `.fg}` 的，同一行必須也有 `.bg}` ——
   也就是「成對使用」。單獨出現就是把白字放到白底上的那種錯。 */
ok('★★★ 每一處用到 fg 的地方都成對帶著 bg（沒有落單的）', (()=>{
  const bad=src.split('\n')
    .map((l,i)=>({l,i:i+1}))
    .filter(x=>/\.fg\}/.test(x.l) && !/\.bg\}/.test(x.l))
    .map(x=>x.i+': '+x.l.trim().slice(0,70));
  return bad.length===0 ? true : bad;
})(), 'see above');
ok('　　理由寫在原地（fg 不是拿來放在白底上的）',
   /fg 是「配上自己那個底色」時的字色，本來就不是\s*\n?\s*拿來放在白底上的/.test(css));

console.log('\n⑧ 白框（跟著游標的提示）');
ok('★★★ 固定三項：會員／教練／場地（時間區間與進度都上卡了）',
   /const _tipStr = _tipEsc\(\[_tipClosed, _tipMem, _tipCoach, _tipVenue\]/.test(src));
ok('★★★ 不再用「名字有沒有被切」當觸發條件（那個比法不可靠）',
   /scrollHeight 本來就會比 clientHeight 大，\s*\n?\s*196px 的卡因此誤跳出來/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
