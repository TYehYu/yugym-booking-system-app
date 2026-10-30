/* Service Worker：遠端救援與背景更新（2026-10-31）

   使用者問：「有辦法從我們這邊拯救 mango 的情況嗎 她那邊不用自己操作」

   她的 iPhone 卡在崩潰迴圈裡，而**她永遠拿不到修好的新版**：
     ・fetch 一律先回快取裡那份會崩潰的舊 index.html
     ・freshen 要「換版後先等 20 秒再抓」，但分頁撐不到 20 秒就被系統砍掉，
       Service Worker 也跟著被收掉 → 新版永遠進不了快取 → 下次開啟還是舊的

   兩道救援：
     ① 換快取名字：瀏覽器每次導覽都會比對 sw.js，檔案變了就安裝新的；
        新的 activate 會刪掉所有「不是現在這個名字」的快取 → 舊 index.html 消失
        → 下次載入只能走網路 → 拿到修好的版本。使用者完全不用操作。
     ② 讓路的等待從 20 秒縮到 6 秒 —— 崩潰中的分頁才有機會把新版抓下來。 */
const fs=require('fs');
const sw=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/sw.js','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 換名字＝遠端救援');
ok('★★★ 快取名字已經換過（v1 的舊 index.html 會被刪掉）',
   /const CACHE = 'yugym-v2';/.test(sw) && !/const CACHE = 'yugym-v1';/.test(sw));
ok('★★★ activate 會刪掉所有「不是現在這個名字」的快取 —— 救援靠的就是這一句',
   /caches\.keys\(\)\.then\(keys => Promise\.all\(keys\.filter\(k => k !== CACHE\)\.map\(k => caches\.delete\(k\)\)\)\)/.test(sw));
ok('★★★ install 立刻接管（不等舊的 SW 放手），否則救援要等下一次才生效',
   /self\.skipWaiting\(\);/.test(sw) && /self\.clients\.claim\(\)/.test(sw));
ok('★★  名字不可以綁 APP_VERSION（那會變成每推一次版全店重抓）',
   !/const CACHE = [`'"].*APP_VERSION/.test(sw));
ok('　　為什麼換名字就能救，寫在原地',
   /換掉這個名字就是遠端救援/.test(sw) && /使用者端完全不用做任何事/.test(sw));

console.log('\n② 讓路的等待縮短');
ok('★★★ 20 秒 → 6 秒（分頁撐不到 20 秒就被砍，等於永遠更新不到）',
   /setTimeout\(r, 6000\)/.test(sw) && !/setTimeout\(r, 20000\)/.test(sw));
ok('★★  不可以直接拿掉等待 —— 那是 1012 陳力豪登入逾時的成因',
   /讓路/.test(sw) && /陳力豪/.test(sw));

console.log('\n③ 原本那幾道保險沒有被順手改掉');
ok('★★★ 只快取真的成功的回應（2026-08-29 曾邦紅：壞回應存進去就清不掉）',
   /if \(res && res\.ok && res\.status === 200\)/.test(sw));
ok('★★  帶查詢字串的不攔截（版本探針與「重新整理」要繞過快取）',
   /if \(url\.search\) return;/.test(sw));
ok('★★  跨網域（含 Supabase）不攔截',
   /if \(url\.origin !== self\.location\.origin\) return;/.test(sw));
ok('　　離線小頁回 503，不會被誤存成 index.html 的快取',
   /status: 503/.test(sw));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
