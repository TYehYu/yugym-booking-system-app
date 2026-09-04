/* 行事曆課卡：四列版面與「窄到什麼程度收起來」的門檻
   （2026-09-03 建立，2026-09-04 大改）

   ── 這一版要守的事（2026-09-04 使用者指示，分三則）──────────────────────
     「行事曆課卡教練名稱不見了　桌機還能看到 RA　mac 就都不見了」
     「但是桌機明明空間還很多　應該可以完整顯示 RANDY」
     「出席章放課卡左上　時間放右上　如果第一列空間不夠 時間就不要顯示了
       因為還有收費提醒的驚嘆號」
     「第二列放會員姓名　第三列場地　第四列教練名稱盡量顯示全名」

   ── 為什麼兩台機器看到不一樣 ────────────────────────────────────────
   不是壞掉，是門檻對 1440 太兇。截圖是 Retina 2 倍圖，換算成 CSS px：
     ・Mac 1440・7 日・3 lane → (1440-80)/7/3 ≒ 65px → 落進 0903 訂的「≤70 隱藏」
     ・櫃檯 1920・同樣條件　 → (1920-80)/7/3 ≒ 87px → 落進「71–90 縮寫」＝ RA
   0903 訂 90 的理由是「教練全名膠囊靠右下排，會壓到左下角那顆 16px 的簽到章」。
   今天章搬到**左上**，底下整條空出來，那個理由就消失了，門檻才能往下放。

   ── 門檻怎麼來的：離線量，不是推算 ──────────────────────────────────
   ⚠ 這裡的每一個數字都要用下面這套方法重量過才准改。字級是 clamp(…cqw…)，
     隨卡寬變，「窄一點只是字小一點」這個直覺在這裡不成立。
   ⚠ 而且要**兩套主題各量一次**：body.ink 把教練膠囊的底色與 padding 整個拿掉、
     時間字級鎖 10px，同一個名字在 Ink 底下窄 12px。只量 Ink 會害關掉 Ink 的人被切字；
     只量非 Ink 會害（預設就是 Ink 的）使用者看不到他要的全名 —— 兩邊都要。

     量法（2026-09-04 實際跑過，1824 張卡 × 2 主題）：
       1. 從 index.html 抽出所有 <style> 寫成 cal.css
       2. 產一頁 harness.html，用 24096 行 _bodyOut 的**真實 DOM**排出
          寬 32…240px × 高 56/112/170 × 有無驚嘆號 × 最長的教練名
          （RANDY／MANGO／BARRY／SANDY 都是 5 個字母）
       3. python3 -m http.server，用瀏覽器量每一張：
          ・被切？ el.scrollWidth > el.clientWidth   ← **只能比寬度**
          ・溢出？ 元素的 rect 超出卡片的 rect
          ・壓到章／驚嘆號？ 用 Range 量**文字**的框，不是元素的框
            （.evc-time 是 align-self:stretch，元素左緣永遠貼齊卡片，量元素一定誤判）
       4. 兩個方向都要驗（這是 2026-08 那次「內容都不見了」換來的）：
          ・有顯示的 → 不能被切、不能溢出
          ・空間夠的 → **必須**顯示。只驗「沒有溢出」是不夠的，
            整個藏起來也不會溢出，畫面卻是空的。

     量出來的下限（低於此值就要退一階）：
                        非 Ink   Ink
       教練全名           68px    56px
       教練兩字縮寫       44px    36px
       時間（無驚嘆號）   64px    60px
       時間（有驚嘆號）   86px    76px

   ⚠ 這些數字改過兩次都是因為**憑感覺訂**：先寫共用的 36 → 量出非 Ink 在 40px 切字；
     再幫 Ink 放寬到 32 → 又量出 Ink 在 32px 也切字。不要再猜了。

   ── 版面改動要跑 A/B 對照，不能只看新版有沒有問題 ──────────────────────
   絕對值會被「不存在的尺寸」汙染：第一版掃描把卡高 56px（30 分鐘課）也算進去，
   跳出一堆「姓名掉出卡外」。查了資料庫才發現**全部 2459 筆預約都是 60 分鐘**，
   而 SLOT_PX=48 ⇒ 60 分鐘課卡固定 94px 高 —— 56px 那種卡根本不存在。
   正確的做法是拿 `git show HEAD:index.html` 的 CSS 當 A、新版當 B，同一份 DOM
   各量一次，只看**差集**：B 有而 A 沒有的才是真的變差。

   2026-09-04 的對照結果（69 種真實寬度 × 有無章 × 有無驚嘆號 × 有無場地
   × 4 種姓名 × 2 主題 ＝ 4416 組）：
     ・新出現的問題：**0**
     ・修掉 552 例「姓名被驚嘆號壓到」與 592 例「姓名被章壓到」

   ⚠ 量姓名要用**元素框**，不能用 Range —— .evc-name 是 -webkit-line-clamp:2，
     Range 會回報「裁切前」的整段文字，於是每一個長名字都被誤判成掉出卡外。
     反過來，量時間**一定要用 Range** —— 它是 align-self:stretch，
     元素左緣永遠貼齊卡片，量元素框會每一張都誤判成壓到章。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 先歸零，再由容器查詢重新分段');
/* 不歸零的話，JS 那個估算估錯方向時（估成 tiny、其實很寬）教練名會平白消失。 */
ok('★★★ 三條歸零：不管 JS 加了什麼 class，都先當寬卡',
   /\.cal-ev\.cal-ev-std \.co-fl\{display:inline;\}\s*\n\s*\.cal-ev\.cal-ev-std \.co-ab\{display:none;\}\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach\{display:inline-flex;\}/.test(src));

console.log('\n② 教練：門檻兩套，Ink 比較鬆');
ok('★★★ 非 Ink：67px 以下換兩字縮寫（量到全名要 68px）',
   /@container \(max-width:67px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.co-fl\{display:none;\}\s*\n\s*\.cal-ev\.cal-ev-std \.co-ab\{display:inline;\}\s*\n\s*\}/.test(src));
ok('★★★ Ink：56px 起就把全名叫回來（膠囊無底無 padding，窄 12px）',
   /@container \(min-width:56px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std \.co-fl\{display:inline;\}\s*\n\s*body\.ink \.cal-ev\.cal-ev-std \.co-ab\{display:none;\}\s*\n\s*\}/.test(src));
/* Ink 那條要贏得過上面的 max-width:67 —— 靠多一個 body.ink（0,4,1 ＞ 0,3,0）。
   ⚠ @container 本身不加權重，只有選擇器算；這是 body.ink 這一整層踩過四次的坑。 */
ok('★★★ Ink 那條的權重高一階（body.ink 多一個 class），否則 56–67 這一段叫不回來',
   /選擇器多一個 body\.ink（0,4,1 ＞ 上面的 0,3,0）/.test(src));
ok('★★★ 非 Ink：43px 以下連縮寫都放不下，整個不顯示',
   /@container \(max-width:43px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach\{display:none;\}\s*\n\s*\}/.test(src));
ok('★★★ Ink：36px 起縮寫還撐得住',
   /@container \(min-width:36px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std \.evc-coach\{display:inline-flex;\}\s*\n\s*\}/.test(src));
/* 門檻只能往「量過的值」改。這幾條擋的是「順手調一下數字」—— 0903→0904 之間
   我自己就憑感覺改壞兩次（36→發現非 Ink 40px 切字；32→發現 Ink 32px 也切字）。 */
ok('★★ 舊的 90／70 已經不在了（改門檻要連註解一起改，不能只換數字）',
   !/@container \(max-width:90px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.co-fl/.test(src)
   && !/@container \(max-width:70px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach\{display:none;\}/.test(src));
ok('★★ 兩台機器為什麼不一樣，算式寫在原地',
   /\(1440-80\)\/7\/3 ≒ 65px/.test(src) && /\(1920-80\)\/7\/3 ≒ 87px/.test(src));
ok('★★ 「憑感覺訂數字」的兩次翻車寫在原地',
   /這三個數字（44／36／上面的 68／56）改過兩次都是因為\*\*憑感覺訂\*\*/.test(src));

console.log('\n③ 第一列＝章（左上）＋時間（右上）＋驚嘆號');
ok('★★★ 章搬到左上（0904 使用者指示）',
   /\.cal-ev\.cal-ev-std \.evc-check\{ position:absolute; left:9px; top:4px; right:auto; bottom:auto;/.test(src));
ok('★★★ 時間靠右，自己讓開章的位置',
   /\.cal-ev\.cal-ev-std \.evc-time\{\s*\n\s*align-self:stretch; display:flex; align-items:center; justify-content:flex-end;\s*\n\s*min-height:16px; padding-left:18px;\}/.test(src));
/* 沒有徽章的卡佔多數，平白少 16px 會讓時間提早消失 —— 所以用 :has 只在有徽章時讓。 */
ok('★★★ 只有真的有驚嘆號時才讓右邊（:has，不是無條件保留）',
   /\.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-time\{padding-right:16px;\}/.test(src));
ok('★★★ 非 Ink：63px 以下（無徽章）／85px 以下（有徽章）不顯示時間',
   /@container \(max-width:63px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:not\(:has\(\.ev-payalert\)\) \.evc-time\{display:none;\}/.test(src)
   && /@container \(max-width:85px\)\{[\s\S]{0,200}?\.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-time\{visibility:hidden;\}/.test(src));
ok('★★★ Ink：60px／76px 起放得下，再叫回來（display 與 visibility 都要還原）',
   /@container \(min-width:60px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std:not\(:has\(\.ev-payalert\)\) \.evc-time\{display:flex;visibility:visible;\}/.test(src)
   && /@container \(min-width:76px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-time\{display:flex;visibility:visible;\}/.test(src));

/* ── 收起時間時，第一列不能塌掉 ─────────────────────────────────────────
   2026-09-04 使用者附截圖：「時間移除的時候 不要讓名字跑到第一列」
   章與驚嘆號是絕對定位、不佔流排版；時間一旦 display:none，第一列整個消失，
   姓名頂上去正好被左上角那顆章壓在第一個字上（截圖是「簽蓉霆」疊在一起）。
   ⚠ 這一條**不能**改回 display:none 來「省一列」—— 省下來的那一列不是空的，
     章或驚嘆號就站在那裡。 */
ok('★★★ 有章時保住第一列（visibility 而不是 display）',
   /\.cal-ev\.cal-ev-std:has\(\.evc-check\):not\(:has\(\.ev-payalert\)\) \.evc-time\{\s*\n\s*display:flex; visibility:hidden;\}/.test(src));
ok('★★★ 有驚嘆號時也保住第一列',
   /\.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-time\{visibility:hidden;\}/.test(src));
/* 第一列真的空無一物（沒章也沒驚嘆號）才收掉 —— 那種卡沒有東西會被壓到。 */
ok('★★★ 第一列空無一物時才 display:none（讓姓名往上補位）',
   /\.cal-ev\.cal-ev-std:not\(:has\(\.ev-payalert\)\) \.evc-time\{display:none;\}/.test(src));
ok('★★ 為什麼是 visibility 不是 display，寫在原地',
   /時間一旦 display:none，第一列整個塌掉，\s*\n\s*姓名就頂上去，正好被左上角那顆章壓在第一個字上/.test(src));
/* A/B 對照的結果記在這裡：改門檻的人要知道原本修掉了什麼，別又踩回去。 */
ok('★★ A/B 對照結果記在這支測試裡',
   /修掉 552 例「姓名被驚嘆號壓到」與 592 例「姓名被章壓到」/.test(fs.readFileSync(__filename,'utf8')));
ok('★★ 讓的是時間，不是章也不是驚嘆號（理由寫在原地）',
   /讓位的是時間，不是章也不是驚嘆號/.test(src));
ok('★★ 關掉 Ink 的人不能被切字（為什麼底線要用嚴的那組）',
   /不能只寫 Ink 那組 —— 有人把 Ink 關掉（localStorage yugym_ink=0）就會被切字/.test(src));

console.log('\n④ 四列的順序（DOM 由上而下：時間 → 姓名 → 場地 → 教練）');
ok('★★★ _bodyOut 的順序沒被動過',
   /<span class="evc-time">\$\{b\.start_time\}<\/span><span class="evc-nmrow">.*?<\/span>\$\{_venueSub\}\$\{_stdTag\}\$\{_abbrOut\}/.test(src));
ok('★★★ 教練不再推到右下角（那是首頁課卡才留著的位置）',
   /\.cal-ev\.cal-ev-std \.evc-coach\{ margin-top:0 !important; align-self:center !important; \}/.test(src)
   && /\.tcard\.tcard-std \.tcard-co\{ margin-top:auto !important; align-self:flex-end !important; \}/.test(src));
ok('★★ 出席章的 DOM 位置沒動（仍在 .evc-nmrow 裡，手機那套靠它）',
   /<span class="evc-nmrow"><span class="evc-name\$\{bkNameBlankCls\(b\)\}">\$\{_stdName\}<\/span>\$\{_stampOut\}<\/span>/.test(src));

console.log('\n⑤ 離線量法要留著（下次改門檻照這個跑）');
ok('★★★ 量法寫在這支測試的開頭', /量法（2026-09-04 實際跑過，1824 張卡 × 2 主題）/.test(
   fs.readFileSync(__filename,'utf8')));
ok('★★★ 「只驗沒有溢出是不夠的」寫在原地', /整個藏起來也不會溢出，畫面卻是空的/.test(
   fs.readFileSync(__filename,'utf8')));
ok('★★ 「只能比寬度」的教訓還在（inline 元素的 scrollHeight 含整個行框）',
   /被切？ el\.scrollWidth > el\.clientWidth\s+← \*\*只能比寬度\*\*/.test(fs.readFileSync(__filename,'utf8')));

console.log('\n⑥ 每拿掉一列，姓名就多准一行（2026-09-04）');
/* 極窄卡上姓名被切成「林尚·」不是寬度不夠，是行數不夠：32px、字級 12px 時
   「林尚美」需要 3 行，而 line-clamp 只准 2 行；卡片有 94px 高、放得下 6 行。 */
ok('★★★ ≤55px 給 3 行',
   /@container \(max-width:55px\)\{\s*\n\s*\.cal-ev\.cal-ev-std\.cal-ev-7d \.evc-name\{-webkit-line-clamp:3;\}\s*\n\s*\}/.test(src));
ok('★★★ ≤43px 給 4 行（量出來的上限，不是 5）',
   /@container \(max-width:43px\)\{\s*\n\s*\.cal-ev\.cal-ev-std\.cal-ev-7d \.evc-name\{-webkit-line-clamp:4;\}\s*\n\s*\}/.test(src));
/* 折兩行那條是 .cal-ev.cal-ev-std.cal-ev-7d .evc-name（0,4,0）；
   只寫 .cal-ev.cal-ev-std .evc-name（0,3,0）蓋不過去，畫面上完全沒反應。 */
ok('★★★ 選擇器帶 .cal-ev-7d（權重要對得上折行那條）',
   /⚠ 選擇器一定要帶 \.cal-ev-7d —— 折兩行那條規則是/.test(src));
ok('★★ 為什麼是 4 不是 5（第一版 5 行跑出 216 例掉出卡外）',
   /第一版寫 5，離線對照跑出\s*\n\s*216 例「姓名掉出卡外」/.test(src));
ok('★★★ 明令不准改用 max-height（0808 那次「內容都不見了」的根因）',
   /不要改成用 max-height 限制高度 —— 2026-08 那次「內容都不見了」就是\s*\n\s*max-height 把姓名壓成 0 高度，而且\*\*不會溢出所以測不出來\*\*/.test(src));
ok('★★ A/B 對照結果記在原地（592 個名字變完整、0 項變差）',
   /改成 4 行：592 個原本被截的名字變完整，0 項變差/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
