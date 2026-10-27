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
/* ══ 2026-10-27 定版：第一列＝左半標籤、右半狀態 ═══════════════════════
   使用者兩句話把這一列定了下來：
     「警示三角形可以改到左下角嗎？右上角讓給時間」
     「出席章改到卡片右上角　時間的右邊　卡片左上角就只剩下標籤　友善＋體驗＋團課(新增）」
   所以順序是：友善／狀態標籤 → NEW ──（推到最右）── 時間 → 章。
   警示不在這一列了（絕對定位的左下角）。 */
ok('★★★ 第一列：友善 → 狀態標籤 → NEW → 時間 → 章（警示已不在這一列）',
   /<span class="evc-r1">\$\{_friOut\}\$\{_stdTag\}\$\{_newOut\}<span class="evc-rr"><b class="evc-hm">\$\{b\.start_time\}<\/b>\$\{_wmOut\}<\/span><\/span>/.test(src));
ok('★★★ 警示改成絕對定位的左下角（不再參與第一列的寬度）',
   /\.cal-ev\.cal-ev-std \.ev-payalert\{top:auto;right:auto;left:5px;bottom:3px;\}/.test(css)
   && !/\.cal-ev\.cal-ev-std \.evc-r1 \.ev-payalert\{margin-left:auto;\}/.test(css));
/* ⚠ 1027 二修：右半（時間＋章）包成 .evc-rr 一起靠右。
   原本是時間自己帶 margin-left:auto，但時間在窄卡會被 display:none 收起來，
   那個 auto 跟著消失，章就掉回最左邊（使用者附圖：窄卡的「簽」跑到左上角）。 */
ok('★★ 右半包成 .evc-rr 一起靠右（不是讓時間自己帶 margin-left:auto）',
   /\.cal-ev\.cal-ev-std \.evc-r1 \.evc-rr\{margin-left:auto;flex:none;display:flex;/.test(css)
   && /\.cal-ev\.cal-ev-std \.evc-r1 \.evc-hm\{flex:none;font-size:10px;/.test(css)
   && !/\.evc-r1 \.evc-hm\{flex:none;margin-left:auto;/.test(css));
ok('　　那個坑寫在原地（時間收起來章會掉回最左邊）',
   /章就掉回最左邊（1027 使用者附圖：窄卡的「簽」跑到左上角）/.test(css));
ok('　　為什麼用絕對定位而不是排進第三列（寫在原地）',
   /排進流裡會跟場地搶那一行|排進第三列會跟場地搶那一行/.test(css));
ok('★★★ 第二列 flex:none —— 不讓它長到卡底壓住教練膠囊',
   /\.cal-ev\.cal-ev-std \.evc-r2\{display:flex;align-items:center;gap:6px;width:100%;min-width:0;\s*\n\s*flex:none;\}/.test(css));
ok('　　那個坑寫在原地（量到重疊 1px）', /量到重疊 1px，使用者回報「太擠」/.test(css));
ok('★★★ 場地那一行不可壓縮，而且高度一律保留（1027：姓名下方留個副標空間）',
   /\.cal-ev\.cal-ev-std \.evc-vsub\{flex:none;min-height:12px;\}/.test(css)
   && /: `<span class="evc-sub evc-vsub evc-vsub-ph"><\/span>`/.test(src));
ok('　　為什麼空的也要畫（同一橫排的姓名要對齊）',
   /同一橫排看過去\*\*姓名對不齊\*\*/.test(src));
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
/* 1027：時間搬去第一列，第二列整列都是姓名 → --nmw 變成常數 18px，
   原本那三條「時間收起來就放寬」的 @container 全部收掉。 */
ok('★★★ --nmw 固定 18px（第二列整列都給姓名）',
   /\.cal-ev\.cal-ev-std \.evc-name\{--nmw:18px;\}/.test(css)
   && !/--nmw:56px/.test(css)
   && (css.match(/--nmw:18px;/g)||[]).length===1);
ok('　　三條舊分段整組收掉（不會再有「時間收了但名字沒變大」）',
   !/@container \(max-width:83px\)\{ \.cal-ev\.cal-ev-std \.evc-name\{--nmw:18px;\} \}/.test(css));
/* ══ 2026-10-26 四修：門檻 90px → 56px ═════════════════════════════════
   使用者附七日檢視截圖問「這個大小的卡片可以放得下教練名嗎」（同時段三張，約 62px）。
   查下去發現我一直算錯一件事：**課卡不是 62px 高，是 94px**
   （SLOT_PX=48、30 分一格，60 分鐘課＝兩格 96−2）。
   之前「90px 以下沒有空著這回事」是拿 62px 算的，不成立。
   寬度也夠：MANGO 約 32px，62px 的卡可用寬 44px。56px 是下限（50px 只剩 32px）。 */
/* 1027：使用者「希望姓名能大一點」。原本的 20px 是拿 62px 的卡算的，
   卡其實 94px（9/1 以後 3042 筆全是 60 分鐘課）。重算後上限 26px。 */
ok('★★★ 字級上限 26px，而且不再分「有沒有場地／有沒有教練」',
   /\.cal-ev\.cal-ev-std \.evc-name\{--nmcap:26px;\}/.test(css)
   && (css.match(/--nmcap:\d/g)||[]).length===1);
ok('　　重算過程寫在原地（內容總高 ≤64px 才不會壓到教練）',
   /內容總高要 ≤ 64px 才不會壓到教練/.test(css));
ok('　　為什麼要改寫法（寫在原地）',
   /加一個「90px 以上顯示教練縮寫」\s*\n?\s*就要再乘一輪，而且很容易漏掉某一格/.test(css));
ok('　　成因寫在原地（每堂課都是 60 分鐘，所以高度綁死了字級）',
   /而\*\*每一堂課都是 60 分鐘＝62px 高\*\*/.test(css));

console.log('\n③ 時間門檻三段，與字級三段互補');
/* 1027：門檻不再跟姓名長度有關（它們不同列了），改成量第一列同排的那幾項。
   每一個數字都是在瀏覽器裡量的（Playwright getBoundingClientRect）。 */
ok('★★★ 時間門檻改成量第一列（43／62／76／78／88／97／107／111／121）',
   /@container \(max-width:42px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-hm\{display:none;\}/.test(css)
   && /@container \(max-width:61px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:has\(\.evc-r1 \.evc-check\) \.evc-hm/.test(css)
   && /@container \(max-width:96px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:has\(\.evc-r1 \.evc-check\):has\(\.evc-fri\) \.evc-hm/.test(css)
   && /@container \(max-width:120px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:has\(\.evc-new\):has\(\.evc-stag\) \.evc-hm/.test(css));
ok('★★★ 依名字長度的那三段已經整組退場',
   !/nm-s2\) \.evc-hm\{display:inline;\}/.test(css)
   && !/nm-s3\) \.evc-hm\{display:inline;\}/.test(css));
ok('★★ 數字是量的不是算的（寫在原地）',
   /都是\*\*在瀏覽器裡量的\*\*（Playwright 量 getBoundingClientRect/.test(css));

console.log('\n④ B 面');
/* ══ 2026-10-28：點開的卡停在 B 面 ═══════════════════════════════════
   使用者：「課卡翻到Ｂ面的時候　我點選課卡它又會翻回Ａ面又翻回Ｂ面
            其實翻到Ｂ面點課卡就不用在翻回去了　因為游標也還在這張卡片上」。
   成因：點下去插入圓鈕面板 → 游標被蓋住 → :hover 掉了翻回 A →
   面板定位完游標又回到卡上 → 0.15 秒後再翻回 B。一來一回＝閃兩下。 */
ok('★★★ 展開狀態固定停在 B 面，不看 :hover',
   /\.cal-ev\.cal-ev-std\.evc-hold:has\(\.evc-back\) \.evc-flip,\s*\n\s*\.cal-ev\.cal-ev-std\.cal-ev-active:has\(\.evc-back\) \.evc-flip\{\s*\n\s*transform:rotateX\(180deg\);transition-delay:0s;\}/.test(css));
/* ══ 1028 二修：使用者「課卡點一下還是會閃跳一下Ａ面」════════════════════
   一修綁在 .cal-ev-active 上，但那個 class 要等 `await dbGet` 回來才掛得上 ——
   中間隔著一次網路往返，那段空窗期 :hover 一掉就翻回 A。
   改成在 expandBkCard 的**第一個 await 之前**同步掛 .evc-hold。 */
ok('★★★ .evc-hold 在第一個 await 之前就掛上（這才是不閃的關鍵）',
   /collapseBkCard\(\);[\s\S]{0,1200}if\(el\) el\.classList\.add\('evc-hold'\);\s*\n\s*const b = await dbGet\('bookings', id\);/.test(src));
ok('★★★ 掛在 collapseBkCard() 之後（那一支會把 .evc-hold 清掉）',
   src.indexOf("collapseBkCard();\n  /* ══ 翻面定住") >= 0
   || /collapseBkCard\(\);\s*\n\s*\/\* ══ 翻面定住要在\*\*第一個 await 之前\*\*/.test(src));
ok('★★★ 收起來要清掉（不然卡片會一直停在 B 面）',
   /\.cal-ev-expanded, \.cal-ev-active, \.cal-ev-editing, \.evc-hold'\)/.test(src)
   && /el\.classList\.remove\('evc-hold'\);/.test(src));
ok('★★ 讀不到預約而提早 return 的那條路也要清掉',
   /if\(!b\)\{ if\(el\) el\.classList\.remove\('evc-hold'\); openBookingDetail\(id\); return; \}/.test(src));
/* ⚠ 權重跟 :hover 那條完全一樣（都是 0,5,0），只能靠寫在後面取勝。 */
ok('★★★ 必須排在 :hover 那條**之後**（同權重，後面的才贏）',
   css.indexOf(':has(.evc-back):hover .evc-flip') < css.indexOf('.evc-hold:has(.evc-back) .evc-flip'));
ok('　　順序的坑寫在原地', /搬到前面就會被 :hover 的「沒 hover 就轉回 0deg」蓋掉/.test(css));
ok('★★ 展開當下立刻定住（不能再等 0.15 秒）',
   /transform:rotateX\(180deg\);transition-delay:0s;\}/.test(css));

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
/* 1027 五修：使用者指著 10/26 11:00 那排四連卡（約 45px、姓名已轉直書）說
   「這種直卡片教練名稱擺不下的話可以用縮寫顯示」。門檻 56px → 38px，55px 以下用縮寫。 */
ok('★★★ 教練名從 38px 起就畫，55px 以下用縮寫',
   /@container \(min-width:38px\)\{[\s\S]{0,1400}\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach:not\(\.evc-leavetag\)\{display:inline-flex;position:absolute;/.test(css)
   && /@container \(max-width:55px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach \.co-fl\{display:none;\}/.test(css)
   && /\.cal-ev\.cal-ev-std:not\(\.cag-std\) \.evc-coach\{display:none;\}/.test(css));
ok('★★★ 縮寫那一段寫在 min-width:38px **之後**（同權重，後面的才贏）',
   css.indexOf('@container (min-width:38px){\n    /* ══ 2026-10-26 三修')
     < css.indexOf('@container (max-width:55px){\n    .cal-ev.cal-ev-std:not(.cag-std) .evc-coach .co-fl'));
ok('　　順序的坑寫在原地（1027 第一版就是寫反了）',
   /45px 的卡就會出現完整的「MANGO」而不是「MA」/.test(css));
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
ok('★★★ 體驗／待簽約那一組在第一列，跟〔友善〕同一個位子',
   /<span class="evc-r1">\$\{_friOut\}\$\{_stdTag\}/.test(src)
   && !/<\/span>\$\{_stdTag\}\$\{_venueSub\}/.test(src));
ok('★★★ 團課也有標籤了（1027 使用者：「友善＋體驗＋團課(新增）」）',
   /_grpCard \? '團課'/.test(src));
ok('★★★ 換成自己的 class，而且有一字版（st-fl／st-ab）',
   /<span class="evc-stag"><i class="st-fl">\$\{_stagTx\}<\/i><i class="st-ab">\$\{bkTagAbbr\(_stagTx\)\}<\/i><\/span>/.test(src)
   && /const BK_TAG_AB=\{'體驗':'體','待簽約':'約','待繳費':'費','場租':'租','待安排':'排','團課':'團'\}/.test(src));
ok('★★ 標籤的三階（全字 76px↑／一字 56–75／55px↓ 收起來）',
   /@container \(max-width:75px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.st-fl\{display:none;\}/.test(css)
   && /@container \(max-width:55px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-stag\{display:none;\}/.test(css));
ok('★★ 友善的三階一起往下搬（66px↑ 友善／56–65 友／55↓ 收）',
   /@container \(max-width:65px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.fri-fl\{display:none;\}/.test(css)
   && /@container \(max-width:55px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-fri\{display:none;\}/.test(css));
ok('　　使用者那一句寫在原地（95px 的卡不需要縮寫）',
   /這個大小的卡片左上角的友善標籤\s*\n?\s*有需要縮寫嗎/.test(css));
ok('　　共用位子的理由寫在原地', /友善是票券的限制、\s*\n?\s*體驗是課別，同一堂不可能兩者皆是/.test(src));
/* ⚠ 寬度預算的分段一定要跟「時間門檻」一致。第一版（九組 font-size 那版）
   漏了一格：84px 的兩字名字用到「沒有時間」的算式，被放大到剛好多 1px，
   overflow-wrap:anywhere 就從兩個字中間折行，場地被推出卡外。
   改成變數之後，分段只有 --nmw 那三條，不可能再漏。 */
ok('★★★ 分段已經整組消失（--nmw 只有一個值，不可能再漏）',
   (css.match(/--nmw:18px;/g)||[]).length===1
   && !/:has\(\.evc-vsub\) \.evc-name\.nm-s3\{font-size:/.test(css));
/* 1027：下限 61px → 45px → 33px。使用者連附三張窄卡圖：
   「會員姓名下方的跑步機不見了」「這個大小也放不下了嗎」
   「陳苓汶是跑步機　黃景楷是教室　Ａ面擺不下了嗎？」
   61px 那個數字是拿錯的卡高（62px）算的；再往下靠「兩字版」續命。 */
ok('★★ 場地三級：三字 45px↑、兩字 33–44px、32px↓ 才不畫',
   /@container \(max-width:44px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.vs-ab\{display:none;\}\s*\n\s*\.cal-ev\.cal-ev-std \.vs-s2\{display:inline;\}/.test(css)
   && /@container \(max-width:32px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-vsub\{display:none;\}/.test(css)
   && !/@container \(max-width:61px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-vsub\{display:none;\}/.test(css));
ok('★★ 兩字版是砍尾字，不是另建對照表（只有「跑步機」需要砍）',
   /const _venueShortB = _venueShortA\.length>2 \? _venueShortA\.slice\(0,2\) : _venueShortA;/.test(src));
/* 1027：B 面窄版的教練名也要縮寫（使用者附圖：「卡片太小Ｂ面的教練名稱就用縮寫」）。
   1026 那句「最長的教練名約 32px」量錯了 —— MANGO 實測 43.1px。 */
ok('★★ B 面窄版 53px 以下改教練縮寫',
   /<i class="ba-fl">/.test(src) && /<i class="ba-ab">/.test(src)
   && /@container \(max-width:53px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-back \.ba-fl\{display:none;\}/.test(css));
ok('　　理由寫在原地（50px 以下姓名已轉直書，底下空得很）',
   /50px 以下姓名已經轉直書/.test(css));

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
