/* 輪詢不可以整表重抓（2026-08-23 效能事故）——這是「開會員資料 22 秒」的最後一塊。

   行事曆每 10 秒、首頁每輪都會在「簽章變了」時重新取資料。原本用的是
   dbGetAll(t,{fresh:true})，而 fresh 的語意是「跳過簽章與增量補資料，直接整表重下載」。
   健身房整天都有人簽到／預約／取消，簽章幾乎一直在變 → 等於每 10 秒把
   bookings 5.4MB ＋ member_tickets 2.5MB 重抓一次，把線路整天佔滿。

   增量補資料（dbDeltaPatch）本來就是為這個情境做的：只撈 change_log 指出的那幾列。
   守的規則：輪詢一律「dbCacheClear（時間戳歸零、資料與簽章留著）＋ 一般 dbGetAll」，
   不可以再用 fresh。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return'';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 行事曆輪詢（每 10 秒）');
{
  const f=grabFn('startCalPoll');
  ok('★★ 不再用 fresh 整表重抓', !/dbGetAll\(t,\{fresh:true\}\)/.test(f));
  ok('★★ 改成「標記過期＋一般讀取」→ 走簽章校驗與增量補資料',
     /dbCacheClear\(\['bookings','member_tickets'\]\);/.test(f)
     && /\['bookings','member_tickets'\]\.map\(t=>dbGetAll\(t\)\.catch\(\(\)=>null\)\)/.test(f));
  ok('　　簽章沒變仍然直接跳過（省流量那一層沒有被拿掉）',
     /if\(!\(await remoteSigChanged\(\)\)\) return;/.test(f));
  ok('　　理由寫在原地', /等於每 10 秒把 bookings 5\.4MB/.test(f));
}

console.log('\n② 首頁輪詢');
{
  const f=grabFn('dashRevalidate');
  ok('★★ 不再用 fresh 整表重抓', !/dbGetAll\(t,\{fresh:true\}\)/.test(f));
  ok('★★ 改成「標記過期＋一般讀取」',
     /dbCacheClear\(tabs\|\|\[\]\);/.test(f) && /\(tabs\|\|\[\]\)\.map\(t=>dbGetAll\(t\)\.catch\(\(\)=>null\)\)/.test(f));
}

console.log('\n③ dbCacheClear 的語意：只歸零時間戳，資料與簽章要留著');
{
  const f=grabFn('dbCacheClear');
  ok('★★ 有資料就留著、只把 t 歸零（否則就退化成整表重抓了）',
     /if\(e && Array\.isArray\(e\.data\)\) e\.t=0; else _dbCache\.delete\(k\);/.test(f));
}

console.log('\n④ fresh 這條路還在（有些地方真的要整表重來），但輪詢不准用');
{
  ok('★ fresh 仍然存在（例如支出編輯器要確定拿到最新一份）',
     /dbGetAll\('expenses',\{fresh:true\}\)/.test(src));
  /* 全檔只該有兩處提到：資料層說明文件那一行，以及支出編輯器那一個真的呼叫。
     多出第三處就是有人又在別的地方用 fresh 整表重抓了 —— 那正是這次的事故。 */
  ok('★★ 全檔只剩兩處提到 fresh（一處說明、一處真的呼叫）',
     (src.match(/\{fresh:true\}/g)||[]).length===2,
     (src.match(/.{0,40}\{fresh:true\}.{0,20}/g)||[]));
}

console.log('\n⑤ 彈窗不該有橫向捲軸（2026-08-24）');
{
  ok('★★ .modal 明確關掉 x 軸捲動（只寫 overflow-y:auto 時，visible 會被當成 auto）',
     /\.modal\{overflow-x:hidden;\}/.test(src)
     && /visible 會被當成 auto/.test(src));
  ok('★★ 兩欄表單與搜尋列的子項可以縮（grid／flex 預設 min-width:auto 會擋住）',
     /\.form-2col>\*\{min-width:0;\}/.test(src)
     && /\.mem-pick-row\{min-width:0;\}/.test(src)
     && /\.mem-pick-row input,\.mem-pick-row select\{min-width:0;\}/.test(src));
  ok('　　y 軸捲動沒有被關掉（內容過高仍要捲得動）',
     /\.modal\{background:var\(--surface-3\);[^}]*overflow-y:auto;/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
