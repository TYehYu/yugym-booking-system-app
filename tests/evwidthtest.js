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
     再幫 Ink 放寬到 32 → 又量出 Ink 在 32px 也切字。不要再猜了。 */
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
   && /@container \(max-width:85px\)\{\s*\n\s*\.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-time\{display:none;\}/.test(src));
ok('★★★ Ink：60px／76px 起放得下，再叫回來',
   /@container \(min-width:60px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std:not\(:has\(\.ev-payalert\)\) \.evc-time\{display:flex;\}/.test(src)
   && /@container \(min-width:76px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std:has\(\.ev-payalert\) \.evc-time\{display:flex;\}/.test(src));
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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
