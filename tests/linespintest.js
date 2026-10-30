/* 會員卡在登入頁轉圈圈（2026-10-12 使用者回報：「有會員反應無法登入 卡在登入頁面轉圈圈」）

   查下來不是資料庫也不是 edge function（都量過：fn_table_sigs 263ms、
   會員身分讀 bookings 69ms、line-member-auth 0.2 秒回應）。
   成因是**一個空 catch**：

     liff.login() 會離開頁面再導回來，回來之後由開機流程自動續跑 lineExchange。
     lineExchange 一進去就把按鈕設成「處理中，請稍候…」，
     中途丟出例外時被 `catch(_){ }` 整個吃掉 → 按鈕永遠轉圈圈、
     沒有錯誤訊息、也按不下去，看起來就是當機。
     而這條路是自動跑的，客人根本沒按過任何東西。

   同一個教訓已經記在「空 catch 會偽裝成沒資料」：讀失敗要留痕跡，不能靜靜吞掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 導回後自動續跑那一段 */
const RESUME=src.slice(src.indexOf('// LINE 登入導向返回後自動續跑'),
                       src.indexOf('// LIFF 預熱（2026-07-27 提速）'));

console.log('① 導回後自動續跑：不能再吞例外');
ok('★★★ 空 catch 已經消失', !/\}catch\(_\)\{ \}/.test(RESUME));
ok('★★★ 失敗時把按鈕放回去（這就是轉圈圈的解法）',
   /setLineBtnBusy\(false\)/.test(RESUME));
ok('★★★ 失敗時把原因寫在畫面上，而且告訴客人下一步',
   /LINE 登入沒有完成/.test(RESUME) && /請再按一次「使用 LINE 登入」/.test(RESUME));
ok('★★ 留一筆 console（查的時候要找得到）', /console\.error\('LINE 登入續跑失敗'/.test(RESUME));
ok('★★ 錯誤訊息有跳脫（訊息可能帶 < >）', /\.replace\(\/<\/g,'&lt;'\)/.test(RESUME));

console.log('\n② lineExchange 自己也保證轉圈圈一定會停');
ok('★★★ 包一層：本體搬到 _lineExchange，外層負責收尾',
   /async function lineExchange\(\)\{\s*\n\s*try\{ return await _lineExchange\(\); \}/.test(src)
   && /async function _lineExchange\(\)\{/.test(src));
ok('★★★ 兩個呼叫端都不必各自接（成因就是其中一個沒接好）',
   /catch\(e\)\{\s*\n\s*console\.error\('LINE 登入失敗', e\);\s*\n\s*try\{ setLineBtnBusy\(false\); \}catch\(_\)\{\}/.test(src));

console.log('\n③ 原本就對的別改壞');
ok('★★ 成功時不用手動關閉忙碌狀態（直接進 App，整頁換掉）',
   /enterApp\(\); return;\s*\n\s*\}\s*\n\s*showLineRegisterPage/.test(src));
ok('★★ 按下按鈕那條路的 try/catch 還在', /\}catch\(e\)\{ showErr\('LINE 登入失敗：'\+\(e\.message\|\|e\)\); setLineBtnBusy\(false\); \}/.test(src));
ok('★★ 忙碌狀態的實作沒動（按鈕文案與還原機制）',
   /if\(btn\.dataset\.orig\) btn\.innerHTML=btn\.dataset\.orig;/.test(src)
   && /處理中，請稍候…/.test(src));

console.log('\n④ 第二現場：回應掉在路上，await 永遠不會 resolve 也不會 reject');
/* 劉韻如 2026-10-12 13:41 —— auth.users.last_sign_in_at **有更新**（伺服器端成功），
   但她手機上還是一直轉圈圈。這種情況沒有例外可以接，
   所以①②那種「把例外接起來」的修法完全無效，一定要有逾時。 */
ok('★★★ 有共用的逾時工具，而且會清掉計時器（不要留一堆待爆的 timer）',
   /function _loTimeout\(p, ms, what\)\{/.test(src)
   && /Promise\.resolve\(p\)\.finally\(\(\)=>clearTimeout\(t\)\)/.test(src));
ok('★★★ fetch 用 AbortController 才真的斷得掉（只 race 的話連線還掛著）',
   /signal:_ac\?_ac\.signal:undefined/.test(src)
   && /setTimeout\(\(\)=>\{ try\{ _ac&&_ac\.abort\(\); \}catch\(_\)\{\} \}, 20000\)/.test(src));
ok('★★★ 登入逾時後**先回頭問 getSession**（那一步多半其實成功了）',
   /\}catch\(_to\)\{[\s\S]{0,260}?sb\.auth\.getSession\(\)[\s\S]{0,120}?if\(!_ok\)\{ showErr/.test(src));
ok('★★★ 讀會員資料那一步也有逾時（量過只要 27ms，卡住一定是網路）',
   /_loTimeout\(sb\.from\('members'\)\.select\('\*'\)\.eq\('auth_id',uid\)\.maybeSingle\(\),15000,'讀取會員資料'\)/.test(src));
ok('★★ 每一種失敗都告訴客人下一步（不是只留一個紅字）',
   /網路不穩時會這樣，請再按一次「使用 LINE 登入」/.test(src));
ok('★★ 錯誤訊息有跳脫', /err\.innerHTML=String\(m\)\.replace\(\/<\/g,'&lt;'\)/.test(src));

console.log('\n⑤ 第三現場：推新版當下，服務工作者在背景抓 880KB 把頻寬吃光');
/* 陳力豪 2026-10-12 20:47（已經是 2033 版）跳出的紅字是「連不上伺服器（LINE 驗證）」，
   也就是登入的第一個請求逾時。那個請求只有幾百 bytes，4G 不該連不上 ——
   同一時間服務工作者正在背景抓新版的 880KB，把頻寬整個吃掉。 */
const SW=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/sw.js','utf8');
/* ⚠ 2026-10-31 縮短成 6 秒：20 秒同時也是「崩潰迴圈中的手機永遠更新不到」的原因
   （Mango 的 iPhone 一載入就被系統砍掉，撐不到 20 秒，Service Worker 跟著被收掉
   → 新版永遠進不了她的快取）。6 秒仍然讓得開登入那幾百 bytes 的請求，
   但短到崩潰中的分頁也有機會把新版抓下來。見 tests/swrescuetest.js。
   ⚠ **不可以直接拿掉等待** —— 0ms 才是 1012 陳力豪登入逾時的成因。 */
ok('★★★ 服務工作者抓新版前先讓路（登入優先）',
   /await new Promise\(r => setTimeout\(r, 6000\)\);\s*\n\s*const res = await fetch\(req, \{ cache: 'reload' \}\);/.test(SW));
ok('★★ 讓路的理由寫在原地（下次有人想把它拿掉時看得到）',
   /把 4G 的頻寬整個吃掉/.test(SW) && /讓路/.test(SW) && /陳力豪/.test(SW));
ok('★★ HEAD 比對仍然立刻做（那只有幾百 bytes，不佔頻寬）',
   /const head = await fetch\(req\.url, \{ method: 'HEAD', cache: 'no-store' \}\);/.test(SW));
ok('★★★ 驗證失敗會自動重試一次（隔 2 秒）',
   /const _authFetch=async\(\)=>\{/.test(src)
   && /await new Promise\(res=>setTimeout\(res,2000\)\);/.test(src)
   && /catch\(e2\)\{[\s\S]{0,120}?showErr\('連不上伺服器（LINE 驗證）'\); return; \}/.test(src));
ok('★★ 逾時拉到 20 秒（4G 上 15 秒不夠）', /\}, 20000\);/.test(src));
ok('★★ 計時器用 finally 清（重試兩次不會留兩個 timer）',
   /\} finally \{ clearTimeout\(_at\); \}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
