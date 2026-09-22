/* 快速預約視窗全螢幕之後的三件事（2026-09-14 使用者附截圖）：
   「時段格子可以再放大點　關閉跟確認可以凍結在視窗底　字體可以再大點」
   ⚠ 全部只吃帶 .qs-mtop 標記的那一支，其他彈窗與桌機不受影響。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const Q='\\.modal-bg:not\\(\\.modal-side\\):has\\(\\.qs-mtop\\)';
const has=p=>new RegExp(p).test(src);

console.log('① 關閉／確認凍結在視窗底');
ok('★★★ 時段區吃掉剩餘高度並自己捲（footer 才會被推到底）',
   has(Q+' \\.cag-slots\\{\\s*\\n?\\s*max-height:none;flex:1 1 auto;min-height:0;overflow-y:auto;\\}'));
ok('★★★ min-height:0 不能省（預設 min-height:auto 會把 footer 推出畫面）',
   /min-height:0 不能省：flex 子項預設 min-height:auto/.test(src));
ok('★★ 標題與日期列不參與伸縮（flex:0 0 auto）', has(Q+' \\.qs-head\\{flex:0 0 auto;\\}'));
ok('★★ footer 補上底色，捲動時時段不會透在按鈕後面',
   has(Q+' \\.modal-foot\\{\\s*\\n?\\s*background:var\\(--card2\\);'));
ok('★★ 成因寫在原地（原本 .cag-slots 自己有 max-height:52vh，footer 才浮在中間）',
   /真正在捲的是 \.cag-slots/.test(src) && /footer 跟在內容流末端浮在中間/.test(src));

console.log('\n② 時段格放大、字放大');
ok('★★★ 格子內距與字級都用 clamp+cqw（不寫死、不加斷點）',
   has(Q+' \\.cag-slots \\.cag-slot\\{[\\s\\S]{0,140}?padding:clamp\\(10px,3cqw,18px\\) 4px;font-size:clamp\\(30px,9\\.5cqw,38px\\);'));
ok('★★★ 容器要先宣告 container-type，cqw 才有意義',
   has(Q+' \\.cag-slots\\{container-type:inline-size;\\}'));
ok('★★ 場地標籤（團課教室／跑步機）跟著放大',
   has(Q+' \\.cag-slot-tag\\{\\s*\\n?\\s*font-size:clamp\\(13px,4cqw,17px\\);'));
ok('★★ 標題、當日摘要、按鈕都升一階',
   has(Q+' \\.modal-title\\{font-size:21px;font-weight:900;\\}')
   && has(Q+' \\.qs-head-t\\{font-size:15px;\\}')
   && has(Q+' \\.modal-foot \\.btn\\{min-height:54px;font-size:17px;'));

console.log('\n③ 範圍控制');
ok('★★★ 全部掛在 .qs-mtop 底下，沒有動到全域 .modal／.cag-slot',
   !/^\.modal \.cag-slots \.cag-slot\{[^}]*font-size:clamp/m.test(src)
   && /^\.cag-slot\{border:none;border-radius:12px;padding:9px 0;font-size:13\.5px;/m.test(src));
ok('★★ 只在手機全螢幕那段裡（桌機維持置中視窗）',
   /@media\(max-width:600px\),\(orientation:portrait\) and \(max-width:1024px\)\{[\s\S]{0,3000}?\.cag-slots \.cag-slot\{/.test(src));

/* 2026-09-21 使用者兩則回報（同一段 CSS 同時處理）：
     「怎麼格子變那麼大　是因為時段變少了嗎」（只剩兩個時段時整格撐成半個畫面）
     「預約自主訓練的時段文字格子可以放大嗎　一個頁面最多放八個時段　剩下往下拉動畫面查看」
   ⚠ 這兩件事是同一個根因的一體兩面：.cag-slots 是「flex:1 吃掉剩餘高度」的 grid，
     grid 的 align-content 預設 stretch，所以列數少就撐大、列數多就擠小 ——
     列高從來不是自己決定的。改成 align-content:start ＋ 固定列高（容器的 1/4）之後，
     少的時候不撐大、多的時候剛好八個一頁。 */
console.log('\n④ 一頁八個時段、時段少也不撐大（2026-09-21）');
ok('★★★ align-content:start —— 只剩一列時不會被撐成整個時段區',
   has(Q+' \\.cag-slots\\.chvqs2\\{\\s*\\n?\\s*align-content:start;'));
ok('★★★ 列高＝容器高度的四分之一 ＝ 一頁四列八格，其餘往下捲',
   has(Q+' \\.cag-slots\\.chvqs2\\{\\s*\\n?\\s*align-content:start;grid-auto-rows:calc\\(\\(100% - 24px\\)/4\\);\\}'));
ok('★★ 24px 要對得上實際的 gap（三道 8px），不然一頁會變成 3.9 列',
   /\.modal \.cag-slots\.chvqs2\{display:grid;grid-template-columns:1fr 1fr;gap:8px;\}/.test(src));
ok('★★ 撐大的成因寫在原地（下次有人想拿掉 align-content 時看得到）',
   /grid 的 align-content 預設就是 stretch/.test(src)
   && /只有一列時，那一列會被撐成整個時段區的高度/.test(src));
ok('★ 退路也寫清楚（百分比解析不到就退回內容高度，所以 padding 不能拿掉）',
   /\.cag-slot 的 padding 就是這條退路的最小高度，所以不能拿掉/.test(src));
ok('★★ 只掛在 .chvqs2（兩欄那一種），沒有動到別處的 .cag-slots',
   !new RegExp(Q+' \\.cag-slots\\{[^}]*align-content').test(src));

/* 2026-09-21 使用者附截圖：「跑步機被斷行了」→「跑步機剩幾台直接放第二列置中」
   →「時間放大一點第一列　場地第二列」→「既然格子已經放大了　應該可以更清楚標示時間」
   ⚠ 原本兩段是同一行的行內文字：「19:00 跑步機 剩 2 台」在 147px 的格子裡一定折行，
     而且折在哪由字數決定，每一格斷點都不同。改成直向兩列就不會再有這個問題。
   ⚠ 實測（375px）：格子 147×122px、時間 30px（「19:00」74.5px／內寬 138px）、
     場地 13px 不折行、內容不溢出、一頁仍是 8 格。 */
console.log('\n⑤ 時間第一列放大、場地第二列置中（2026-09-21）');
ok('★★★ 格子改直向兩列並置中（不再是行內文字，就不會斷在奇怪的地方）',
   has(Q+' \\.cag-slots \\.cag-slot\\{\\s*\\n?\\s*display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;'));
ok('★★★ 場地標籤的 margin-left 要歸零（行內排版的遺留，直向時會讓第二列偏右）',
   has(Q+' \\.cag-slot-tag\\{[\\s\\S]{0,120}?margin-left:0;'));
ok('★★ 第二列置中', has(Q+' \\.cag-slot-tag\\{[\\s\\S]{0,140}?text-align:center;'));
ok('★★★ 時間是這一頁唯一要做的決定 → 最大字級＋最重字重',
   has(Q+' \\.cag-slots \\.cag-slot\\{[\\s\\S]{0,200}?font-weight:800;'));
ok('★★ 手機上生效的是 clamp 的**下限**，理由寫在原地（免得有人以為 cqw 在作用）',
   /clamp 的下限才是手機上實際生效的值/.test(src) && /9\.5cqw 只有 29px，所以下限寫 30px/.test(src));
ok('★★ 只吃 .qs-mtop 這一支，行事曆與 msb-sheet 的時段維持單行',
   /只吃 \.qs-mtop 這一支；行事曆的時段面板、msb-sheet 那兩處維持單行/.test(src)
   && !/^\.cag-slot\{[^}]*flex-direction:column/m.test(src));

/* ══ 2026-09-22 使用者：「該時段團課教室跟跑步機同時顯示　分成兩列」══
   原本 vids[m] 只有「自動分配到的那一個」場地，所以 19:00 明明教室與跑步機都空著，
   畫面只看得到教室。客人挑時段時就該知道兩種都有。
   使用者追問「如果變成兩列　這樣空間會被壓縮嗎」——實測（375px）沒有：
   格子內容可用高 100.3px 是固定的（列高＝時段區的 1/4），
   兩列的內容高 82.5px、上下各剩 8.9px，時間字級維持 30px，一頁仍是 8 格。
   ⚠ 最多兩列：VN.multi 是空字串（多功能是預設場地，刻意不標）。 */
console.log('\n⑥ 一個時段有幾個場地有空就畫幾列（2026-09-22）');
ok('★★★ 探測階段多算一份 vlist（每個時段哪些場地有空）',
   /const vlist=\{\};/.test(src) && /return \{free,vids,tmFree,vlist,bh:_bh\};/.test(src));
ok('★★★ 用的是 msbPickSlot 那三顆場地鈕同一套判準（validateBooking 帶 venue_pref）',
   /venue_pref:vid\};\s*\n\s*return \(await validateBooking\(pb,s\.date,minToTime\(m\),60\)\) \? null : vid;/.test(src));
ok('★★ 不自己數佔用的理由寫在原地（教室還有團課前清場那條規則）',
   /教室還有別的規則（10\/01 起團課前 15 分鐘不排教室），/.test(src));
ok('★★★ 只對已經確定排得進去的時段再探（free 最多 24 個），而且不多送請求',
   /const _fm=\[\.\.\.free\];/.test(src)
   && /這 3 倍的探測\*\*不會多送任何請求\*\*/.test(src));
ok('★★★ 每個有空的場地各一列，沒名字的（多功能）不畫',
   /const nm=VN\[vid\]\|\|''; if\(!nm\) return '';/.test(src)
   && /onclick="memh2SelSlot\('\$\{t\}'\)">\$\{t\}\$\{tags\}<\/button>/.test(src));
ok('★★ 順序固定（多功能→教室→跑步機），不照自動分配的結果排',
   /const _VIDS=\['multi','group','treadmill'\];/.test(src)
   && /同一個時段每次打開看到的順序要一樣/.test(src));
ok('★★★ 退路：探測失敗就退回原本那一個場地，畫面不會空掉',
   /vlist\[m\]=vs\.length\?vs:\(vids\[m\]\?\[vids\[m\]\]:\[\]\);/.test(src)
   && /catch\(_\)\{ \[\.\.\.free\]\.forEach\(m=>\{ vlist\[m\]=vids\[m\]\?\[vids\[m\]\]:\[\]; \}\); \}/.test(src)
   && /const _vs=\(\(r\.vlist\|\|\{\}\)\[m\]\) \|\| \(r\.vids\[m\]\?\[r\.vids\[m\]\]:\[\]\);/.test(src));
ok('★★ 顯示兩列不等於在這裡選場地（按下去仍走 msbPickSlot，那裡才選）',
   /這裡顯示兩列不是「要客人在這裡選」，是讓他知道這個時段有兩種可以選/.test(src)
   && /closeModal\(\); msbPickSlot\(t\);/.test(src));
ok('★★★ 量過的數字寫在原地（回答「會不會被壓縮」），並標明餘裕只剩 9px',
   /兩列的內容高 82\.5px、上下各剩 8\.9px；時間字級維持 30px、一頁仍是 8 格/.test(src)
   && /要再加東西進這一格之前先重量一次，只剩不到 9px 的餘裕/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
