/* 行事曆分欄寬度：每張卡各自算，不再整條重疊鏈共用（2026-09-04）

   使用者：「一個時段有１～６張卡 給我介面建議」

   在此之前，欄數是整條**重疊鏈**的最大同時張數，整群共用。只要有一堂半點開始的課
   把相鄰兩個整點串起來（9% 的課是半點，228/2460 筆），12:00 那三張就被 13:00
   那六張拖著一起變成 1/6 寬。

   ⚠ 效益比我第一次估的小很多，數字寫在這裡免得有人再高估一次：
     第一版用 SQL 估「19%（307 張）」是**錯的** —— 它拿「卡片開始那一瞬間」的
     同時張數來比，但一張 12:00 的課還會跟 12:30 的課重疊，起始瞬間會低估。
     用整段區間對 8/01–9/30 的 1635 張課卡重算：
       ・理論上限 **139 張（9%）**
       ・這個安全版拿到 **46 張**（其餘卡在「空隙破碎」而整群退回等寬）
     試過放寬到非格線擺放，可以拿到 132 張，但會產生 23 處重疊 —— 不採用。

   ⚠ 真正擠的 219 張（5～6 張同時，13%）這裡一張都救不到：它們是真的同時
     有這麼多堂。那要靠資訊取捨或分流，不是分欄算得出來的。

   ── 離線驗證怎麼跑（改這段程式一定要重跑）────────────────────────────
     1. 從 index.html 抓出 assignLanesDay 的函式原始碼，補三個樁：
        timeToMin／CAL_overlap／CAL_isGroupCat
     2. 從資料庫撈一段真實預約（date、start_time、duration、是否團課）
     3. 每天跑一次 assignLanesDay，對每一對**時間重疊**的卡片檢查 x 區間不相交，
        並確認沒有一張比原本的等寬（100/unit）更窄
     2026-09-04 實跑：61 天 1635 張 → 重疊 0、變窄 0、變寬 46。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 每張卡各自的寬度（2026-10-18 改成逐步放大）');
/* ⚠ 2026-09-04 的做法是「寬度＝1÷自己區間內最大同時張數」，破碎就整群退回等寬。
   1018 使用者第五次回報「週一還是很多空白」—— 一天是一條從早串到晚的連鎖重疊，
   中間只要有一個破碎的空隙，整天就退回最窄的等寬，所以畫面上看不出差別。
   改成逐步放大：每張先 1 格、一輪一輪從最窄的開始加，再試幾種擺放順序挑最公平的。
   每張至少 1 格，所以「絕不變窄」這個保證是算法本身給的，不必再靠退回。 */
ok('★★★ 逐步放大：一輪一輪從最窄的開始加',
   /cl\.slice\(\)\.sort\(\(x,y\)=>\(uOf\[x\.b\.id\]-uOf\[y\.b\.id\]\)\|\|\(x\.s-y\.s\)\)/.test(src)
   && /if\(uOf\[o\.b\.id\]<n && canGrow\(o\)\)\{ uOf\[o\.b\.id\]\+\+; moved=true; \}/.test(src));
ok('★★★ 放大上限看「自己區間內」每個時刻的總寬，不是整群',
   /const canGrow=o=>marks\.every\(t=>\(t<o\.s\|\|t>=o\.e\)\|\|loadAt\(t\)\+1<=n\);/.test(src));
ok('★★★ 時段完全相同的幾張，放大目標先平均',
   /const w=S\.reduce\(\(t,o\)=>t\+uOf\[o\.b\.id\],0\)\/S\.length;\s*\n\s*S\.forEach\(o=>\{ uOf\[o\.b\.id\]=w; \}\);/.test(src));
ok('★★★ 由左往右找第一個放得下的位置', /if\(busy\[i\]\[0\]-pos >= u-EPS\) break;/.test(src));
ok('★★★ 試多種擺放順序，挑最公平、再挑最滿',
   /\]\.map\(placeBy\)\.filter\(Boolean\)\s*\n\s*\.sort\(\(m,q\)=>\(m\.unfair-q\.unfair\)\|\|\(q\.area-m\.area\)\)\[0\];/.test(src));

console.log('\n② 絕不變窄，而且絕不重疊');
ok('★★★ 採用前整群掃一遍有沒有重疊',
   /if\(xl<yr-EPS && xr>yl\+EPS\)\{ fit=false; break; \}/.test(src));
ok('★★★ 每一種順序都排不下時，才退回等寬（best 為空就不寫 left/width）',
   /if\(best\) cl\.forEach\(o=>\{\s*\n\s*res\[o\.b\.id\]\.left  = best\.posOf\[o\.b\.id\]\/n\*100;/.test(src));
ok('★★★ 畫的時候兩條路都在（沒有 left/width 就用等寬）',
   /const laneWpct = \(dl\.width!=null\) \? dl\.width : 100\/UNIT;/.test(src)
   && /const leftPct  = \(dl\.left !=null\) \? dl\.left  : dl\.laneIdx\*\(100\/UNIT\);/.test(src));
ok('★★ 退路的理由寫在原地（出事可以只拿掉 assignLanesDay 那段）',
   /兩條路都留著，出事可以只拿掉 assignLanesDay 那段/.test(src));
/* ⚠ 1018 的教訓：舊做法的量測數字要留著當歷史，但要標明它已經被取代，
   不然下一個人會照著一段不存在的程式去 debug。 */
ok('★★★ 舊做法已標明被取代',
   /已在 2026-10-18 被下面那段取代/.test(src));

console.log('\n③ 既有行為不能被動到');
ok('★★★ 團課仍固定排最左（order 仍是團課在前）',
   /const order=\[\.\.\.cl\.filter\(it=>CAL_isGroupCat\(it\.b\)\), \.\.\.cl\.filter\(it=>!CAL_isGroupCat\(it\.b\)\)\];/.test(src));
ok('★★ 團課優先沒被新擺法破壞，理由寫在原地',
   /團課優先佔最左邊這件事沒有變：order 仍是「團課在前」，而由左往右擺的\s*\n\s*第一張自然落在 x=0/.test(src));
ok('★★★ 重疊鏈的切法沒動（與前一群完全斷開才換一群）',
   /if\(cur\.length && it\.s>=curEnd\)\{ clusters\.push\(cur\); cur=\[\]; curEnd=-1; \}/.test(src));
ok('★★★ unit 仍然算出來（退回等寬時要用）', /cl\.forEach\(\(\{b\}\)=>\{ res\[b\.id\]\.unit=n; \}\);/.test(src));

console.log('\n④ 數字與量法要留著');
ok('★★★ 正確的上限與實得寫在程式裡（139／46，不是 307）',
   /理論上可以變寬的只有 \*\*139 張（9%）\*\*/.test(src) && /這個安全版實際拿到 \*\*46 張\*\*/.test(src));
ok('★★★ 第一次估錯的原因寫在原地（免得有人再高估一次）',
   /它拿\s*\n\s*「卡片開始那一瞬間」的同時張數來比/.test(src));
ok('★★★ 「真正擠的那 219 張救不到」寫在原地',
   /真正擠的那 219 張（5～6 張同時，佔 13%）\*\*這裡一張都救不到\*\*/.test(src));
ok('★★ 離線驗證步驟記在這支測試', /每天跑一次 assignLanesDay，對每一對\*\*時間重疊\*\*的卡片檢查 x 區間不相交/.test(
   fs.readFileSync(__filename,'utf8')));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
