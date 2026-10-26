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
/* 1026 再加一項：狀態標籤（體驗／待簽約…）插在友善後面、警示前面。 */
ok('★★★ 第一列：章 → 友善 → 狀態標籤 → 警示 → NEW',
   /<span class="evc-r1">\$\{_wmOut\}\$\{_friOut\}\$\{_stdTag\}\$\{_alertOut\}\$\{_newOut\}<\/span>/.test(src));
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
/* ══ 2026-10-26 二修：改成「兩個變數，一條算式」═══════════════════════
   --nmw   寬度的固定開銷（內距 18px，有時間再 +38px）
   --nmcap 字級上限（一般 28px；底下那一行有東西時 20px）
   第一版把條件乘在一起寫成九組 font-size，加一個「90px 以上顯示教練縮寫」
   就要再乘一輪，而且實際上漏了一格（112px 的三字名字掉到下限 12px）。 */
ok('★★★ 算式整份只寫一次（五條，吃變數）',
   /nm-s3\{font-size:clamp\(12px,min\(45cqh,calc\(\(100cqw - var\(--nmw\)\)\/3\)\),var\(--nmcap\)\) !important;\}/.test(css)
   && (css.match(/\.evc-name\.nm-s3\{font-size:/g)||[]).length===1);
ok('★★★ 預設 56px（內距 18 ＋ 時間 38）—— 時間先留位子',
   /\.cal-ev\.cal-ev-std \.evc-name\{--nmw:56px;--nmcap:28px;\}/.test(css)
   && /先留給時間，剩下的才給名字/.test(css));
ok('★★★ 時間收起來的那幾種改成 18px，與時間門檻完全互補',
   /@container \(max-width:83px\)\{ \.cal-ev\.cal-ev-std \.evc-name\{--nmw:18px;\} \}/.test(css)
   && /@container \(min-width:84px\) and \(max-width:97px\)\{[\s\S]{0,260}--nmw:18px;\}/.test(css)
   && /@container \(min-width:98px\) and \(max-width:111px\)\{[\s\S]{0,220}--nmw:18px;\}/.test(css));
/* ══ 2026-10-26 四修：門檻 90px → 56px ═════════════════════════════════
   使用者附七日檢視截圖問「這個大小的卡片可以放得下教練名嗎」（同時段三張，約 62px）。
   查下去發現我一直算錯一件事：**課卡不是 62px 高，是 94px**
   （SLOT_PX=48、30 分一格，60 分鐘課＝兩格 96−2）。
   之前「90px 以下沒有空著這回事」是拿 62px 算的，不成立。
   寬度也夠：MANGO 約 32px，62px 的卡可用寬 44px。56px 是下限（50px 只剩 32px）。 */
ok('★★★ 第三行被佔走就把上限壓到 20px（有場地、或 56px 以上有教練名）',
   /\.cal-ev\.cal-ev-std:has\(\.evc-vsub\) \.evc-name\{--nmcap:20px;\}/.test(css)
   && /@container \(min-width:56px\)\{ \.cal-ev\.cal-ev-std \.evc-name\{--nmcap:20px;\} \}/.test(css));
ok('　　為什麼要改寫法（寫在原地）',
   /加一個「90px 以上顯示教練縮寫」\s*\n?\s*就要再乘一輪，而且很容易漏掉某一格/.test(css));
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
/* ══ 標籤不可以被切掉（2026-10-26 使用者：「這一堂分期沒有顯示」）══════════
   原本進度與標籤同在一個 .bk-v 裡，而 .bk-v 是 nowrap + ellipsis ——
   放不下時被切的是排在後面的標籤，正好是最重要的那一項。
   改成 flex：標籤 flex:none 永遠完整，要縮的是前面的進度文字；
   再窄一點就把進度換成壓縮版「4/12」（量過 112px：完整版 62＋標籤 28 ＝ 95 > 94）。 */
ok('★★★ 進度與標籤分成兩個元素（標籤 flex:none 不會被 ellipsis 吃掉）',
   /<span class="bk-pv">/.test(src)
   && /\.evc-back \.bk-pv\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}/.test(css)
   && /\.evc-back \.bk-pay\{display:inline-block;flex:none;/.test(css));
ok('★★★ 有標籤的窄卡換成壓縮版的進度（沒有標籤的照樣寫完整句）',
   /@container \(max-width:150px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-back \.bk-r:has\(\.bk-pay\) \.pv-fl\{display:none;\}/.test(css)
   && /\.bk-r:has\(\.bk-pay\) \.pv-ab\{display:inline;\}/.test(css));
ok('　　量到的數字寫在原地', /完整版「第 4 \/ 12 堂」62px ＋ 標籤 28px ＝ 95px，可用寬只有 94px/.test(src));
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
/* ══ 2026-10-26 三修：窄卡那一版從「縮寫＋場地」改成「全名＋n/n＋場地」三行 ══
   使用者：「這個大小是不是也可以完整顯示教練名稱　另外補上 n/n」。
   量過 45／56／70／79px 配九個真實教練名（含 SANDY／MANGO／余東翰／曾邦宏），
   一個都沒被切、也沒有超出卡片高度。 */
ok('★★★ 窄卡寫教練全名，不是縮寫',
   /_tipEscEarly\(_coFull\|\|_coAbbr\|\|'—'\)/.test(src));
ok('★★★ 窄卡補上壓縮版的 n/n（完整的「第 2 / 12 堂」放不下）',
   /const _nnShort = \(!_grpCard && _seq\)\s*\n?\s*\? \(_seq\.n>=999 \? String\(_seq\.i\) : `\$\{_seq\.i\}\/\$\{_seq\.n\}`\) : '';/.test(src)
   && /class="bk-v bk-nn"/.test(src)
   && /\.evc-back \.bk-nn\{font-size:9\.5px/.test(css));
ok('★★ 團課不給 n/n（A 面主行本來就是人數）',
   /團課不給 n\/n —— A 面的主行本來就是人數/.test(src));
ok('★★★ 79px 以下才走窄卡版（80px 起三列全給）',
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
/* 2026-10-26 二修：90–149px 也放得下教練，用縮寫（使用者：「是不是有些卡片右下角
   還是可以擺下教練名稱　太窄的還是可以用縮寫」）。90px 以下不給 —— 那裡姓名要吃 3–4 行。 */
/* ══ 2026-10-26 三修：縮寫那一段拿掉，90px 起一律全名 ═══════════════════
   使用者看線上畫面：「這個教練名應該不用縮寫吧」—— 量過他是對的：
   最長的顯示名是五個拉丁字母（約 32px）＋右緣 5px ＝ 37px，
   90px 的卡可用寬 72px，就算左邊還有場地短名（28px）也只佔 65px。 */
ok('★★★ 56px 起一律寫全名（沒有縮寫那一段了）',
   !/@container \(min-width:90px\) and \(max-width:149px\)/.test(css)
   && /90px 起就寫教練\*\*全名\*\*/.test(css));
ok('★★★ 代課標記分兩種寫法（150px 以下寫「代」）',
   /b\.substitute_coach_id\?'<i class="cs-fl">（代）<\/i><i class="cs-ab">代<\/i>':''/.test(src)
   && /@container \(max-width:149px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach \.cs-fl\{display:none;\}/.test(css));
ok('★★★ 場地短名的門檻跟著放大到 149px（兩者同一行，不然會疊到）',
   /@container \(max-width:149px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.vs-fl\{display:none;\}/.test(css)
   && /「史密斯訓練架」63px ＋「MANGO代」42px/.test(css));
ok('★★★ 教練名從 56px 起就畫（門檻只剩這一個）',
   /@container \(min-width:56px\)\{[\s\S]{0,1200}\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach:not\(\.evc-leavetag\)\{display:inline-flex;position:absolute;/.test(css)
   && /\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach\{display:none;\}/.test(css));
/* ══ 2026-10-26 三修：A 面的教練名改成黑字、不要膠囊（使用者：「A面的教練名稱
   也用黑色文字就好」，跟首頁同一個講法）。深底的那兩位拿掉底色會變白字看不見，
   所以底色與字色一起改：背景透明＋墨色字。教練色留在左色條與 B 面底色上。 */
ok('★★★ A 面教練名是黑字、沒有膠囊底色',
   /background:transparent !important;color:var\(--text,#1D1813\) !important;\}/.test(css)
   && !/background:var\(--co-bg,#EAE6DE\) !important/.test(css)
   && /`<span class="evc-coach"><span class="co-fl">\$\{_coFull\}/.test(src));
ok('　　教練色沒有消失（在左色條與 B 面底色上）',
   /教練色沒有消失 —— 它在\*\*左邊那條色條\*\*與 B 面底色上/.test(css));
/* ⚠ 教練工作台週曆用的是同一組 class（.cal-ev.cal-ev-std.cag-std），但它的膠囊顏色
   寫在 inline、沒有 --co-bg。上面那條要是沒排除它，那一頁的膠囊會全部變灰底。 */
ok('★★★ 排除教練工作台週曆（.cag-std）',
   /\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach:not\(\.evc-leavetag\)\{display:inline-flex;position:absolute;/.test(css)
   && /\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach\{display:none;\}/.test(css));
ok('　　那個坑寫在原地', /會把 inline 的 background／color 整個洗掉/.test(css));
ok('★★★ 教練色換成使用者的 Excel 配色（MANGO／BARRY 是深底白字）',
   /'c-mqueqc9uxp3k':\{bg:'#2452A2',fg:'#FFFFFF'\}/.test(src)
   && /'c-mqk98n91x2tf':\{bg:'#35714E',fg:'#FFFFFF'\}/.test(src));
/* 石頭（翁立安）原本不在表裡 → 落到雜湊備援的淡紫，跟 Rocky 幾乎一樣
   （使用者 1026：「石頭跟 Rocky 顏色相撞了」）。補成「深紫底白字」，與 Rocky 對調。 */
ok('★★★ 石頭補進固定配色表（深紫底白字，與 Rocky 對調）',
   /'c-mrt6u1iy5wxh':\{bg:'#553481',fg:'#FFFFFF'\}/.test(src));
ok('★★★ 十位教練沒有任何兩位同一組 bg/fg', (()=>{
  const m=src.slice(src.indexOf('const COACH_TAG_COLORS={'), src.indexOf('const _COACH_TAG_PALETTE'));
  const pairs=[...m.matchAll(/bg:'(#[0-9A-Fa-f]{6})',fg:'(#[0-9A-Fa-f]{6})'/g)].map(x=>x[1]+'/'+x[2]);
  const dup=pairs.filter((v,i)=>pairs.indexOf(v)!==i);
  return dup.length===0 ? true : dup;
})(), 'dup');
ok('★★★ 同色相的兩對靠深淺分，所以色條吃 bg',
   /RANDY 與 MANGO 共用同一個藍（#2452A2）/.test(src)
   && /--coach-bar:\$\{_cc\.bg\}/.test(src));

console.log('\n⑥b 1026 線上回報的三件');
/* ⚠ Ink 有一條 `@container(min-width:30px){body.ink .cal-ev.cal-ev-std .evc-coach{display:inline-flex}}`
   是 (0,4,1)，比新的 150px 門檻 (0,4,0) 高一階 —— 不退場的話門檻完全沒作用，
   56px 的卡照樣冒出「SA」而且折行成「SA ／（代）」。見 yugym-ink-override-trap。 */
ok('★★★ Ink 的「30px 以上一律顯示教練」已退場',
   !/@container \(min-width:30px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std \.evc-coach\{display:inline-flex;\}/.test(css)
   && /〔已退場，2026-10-26〕上面那兩段（41px 以下不顯示／Ink 在 30px 以上一律顯示）/.test(css));
ok('　　退場理由寫在原地（改樣式前先 grep body.ink）',
   /改樣式前先 grep body\.ink/.test(css));
/* A 面的場地在窄卡上被切成「跑步…」（使用者附圖）。兩種寫法由寬度挑，短名是砍台數與前綴。 */
ok('★★★ A 面場地有完整／短名兩種寫法（門檻見上，1026 三修放大到 149px）',
   /<i class="vs-fl">\$\{_selfVenue\}<\/i><i class="vs-ab">\$\{_venueShortA\}<\/i>/.test(src));
/* 窄卡的 B 面原本只有 全名／n-n／場地，最需要被看到的繳費標籤反而沒有。 */
ok('★★★ 窄卡 B 面也給繳費標籤（自己一行）',
   /_payTag\?`<span class="bk-v bk-pw">\$\{_payTag\}<\/span>`:''/.test(src)
   && /\.evc-back \.bk-pw\{display:block;line-height:1\.25;\}/.test(css));
ok('　　為什麼自己一行（併排放不下的數字寫在原地）',
   /45px 可用寬 35px，「4\/12」24 ＋標籤 28 ＝ 56/.test(css));

console.log('\n⑥c 狀態標籤搬進第一列');
/* 使用者 1026：「體驗可以改成標籤跟友善　這樣才不會跟場地相撞　因為體驗跟友善
   不會同時出現　但是體驗跟其他場地有機會」。 */
ok('★★★ 體驗／待簽約那一組搬進第一列，跟〔友善〕同一個位子',
   /<span class="evc-r1">\$\{_wmOut\}\$\{_friOut\}\$\{_stdTag\}\$\{_alertOut\}\$\{_newOut\}<\/span>/.test(src)
   && !/<\/span>\$\{_stdTag\}\$\{_venueSub\}/.test(src));
ok('★★★ 換成自己的 class（.evc-sub 還有場地在用）',
   /<span class="evc-stag">\$\{_nameTag\}<\/span>/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-stag\{flex:none;/.test(css));
ok('★★ 比友善晚一階退場（67px 以下才收）',
   /@container \(max-width:67px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-stag\{display:none;\}/.test(css));
ok('　　共用位子的理由寫在原地', /友善是票券的限制、\s*\n?\s*體驗是課別，同一堂不可能兩者皆是/.test(src));
/* ⚠ 寬度預算的分段一定要跟「時間門檻」一致。第一版（九組 font-size 那版）
   漏了一格：84px 的兩字名字用到「沒有時間」的算式，被放大到剛好多 1px，
   overflow-wrap:anywhere 就從兩個字中間折行，場地被推出卡外。
   改成變數之後，分段只有 --nmw 那三條，不可能再漏。 */
ok('★★★ 分段只剩 --nmw 那三條（不會再漏）',
   (css.match(/--nmw:18px;/g)||[]).length===3
   && !/:has\(\.evc-vsub\) \.evc-name\.nm-s3\{font-size:/.test(css));
ok('★★ 61px 以下連場地都不畫（姓名要吃 3–4 行）',
   /@container \(max-width:61px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-vsub\{display:none;\}/.test(css));

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
/* 1027 又抓到一處：行事曆的教練篩選 chip。色點畫在白底上，
   直接吃 fg 的話 MANGO／BARRY／石頭 三顆是白的，整顆看不見。 */
ok('★★★ 教練篩選 chip 的色點也走 coachInkColor',
   /const ink = coachInkColor\(c\.id\);/.test(src)
   && /const st = `--cc:\$\{ink\};` \+ \(on \? `background:\$\{ink\};color:#fff;`/.test(src));
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
