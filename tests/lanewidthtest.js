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

console.log('① 每張卡各自的寬度');
ok('★★★ 用「自己區間內」的最大同時張數，不是整群的',
   /const localMax=\(it\)=>\{ let m=1;\s*\n\s*pts\.forEach\(t=>\{ if\(t>=it\.s && t<it\.e\)\{ const c=concAt\(t\); if\(c>m\) m=c; \} \}\); return m; \};/.test(src));
ok('★★★ 由左往右找第一個放得下的空隙', /if\(g>=w-1e-9\)\{ x=cursor; break; \}/.test(src));
/* busy 裡的卡片彼此不一定重疊（A 在 12:00、B 在 13:00 可以都站在 x=0），
   不夾 0 會算出負的空隙，進而把卡片疊上去。 */
ok('★★★ 空隙要夾 0（busy 彼此不一定重疊）', /const g=Math\.max\(0, a-cursor\);/.test(src));
ok('★★ 為什麼不會重疊，證明寫在原地',
   /某時刻 t 有 k 張同時，每張的 L 都 ≥ k[\s\S]{0,120}?總寬永遠不超過一欄/.test(src));

console.log('\n② 絕不變窄：整群退回等寬');
ok('★★★ 有任何一張比原本窄就整群放棄', /if\(ww < 1\/n - 1e-9\) degraded=true;/.test(src));
ok('★★★ 只有沒退化才採用', /if\(!degraded\) cl\.forEach\(\(\{b\}\)=>\{ if\(out\[b\.id\]\)\{ res\[b\.id\]\.left=out\[b\.id\]\.left;/.test(src));
ok('★★★ 畫的時候兩條路都在（沒有 left/width 就用等寬）',
   /const laneWpct = \(dl\.width!=null\) \? dl\.width : 100\/UNIT;/.test(src)
   && /const leftPct  = \(dl\.left !=null\) \? dl\.left  : dl\.laneIdx\*\(100\/UNIT\);/.test(src));
ok('★★ 退路的理由寫在原地（出事可以只拿掉 assignLanesDay 那段）',
   /兩條路都留著，出事可以只拿掉 assignLanesDay 那段/.test(src));

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
