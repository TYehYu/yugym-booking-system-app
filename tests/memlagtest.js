/* 2026-08-07 使用者回報：「現在重新開預約系統，點進會員管理會有好幾秒的讀取中」

   會員管理要六張表，其中 bookings／member_tickets／ticket_logs 都是大表。
   跨工作階段快取（IndexedDB）雖然會把資料載回來，但一律標成「待校驗」（t=0），
   原本這一頁是 await 六張表 → 每次重開都要乾等一輪校驗＋補資料才畫得出來。

   改成先畫再說（SWR，與首頁、行事曆、月報表同一套）：
   有資料就立刻畫，背景校驗完有變才重畫一次；真的一筆快取都沒有才走等待。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i,src.indexOf('\n',i));};

console.log('① 六張表都列進來了（漏一張就會退回等待）');
{
  const T=new Function(grabConst('MEM_TABLES')+'\nreturn MEM_TABLES;')();
  eq('★ members・coaches・bookings・member_tickets・ticket_types・ticket_logs',
     T, ['members','coaches','bookings','member_tickets','ticket_types','ticket_logs']);
  ok('　　三張大表都在裡面（它們才是等待的來源）',
     ['bookings','member_tickets','ticket_logs'].every(x=>T.includes(x)));
}

console.log('\n② 有快取就立刻畫、沒有才等');
{
  const body=src.slice(src.indexOf('PAGES.members=async function()'), src.indexOf('PAGES.members=async function()')+1200);
  ok('★ 先問 dbPeek（同步、不打網路）', /const _pk=MEM_TABLES\.map\(t=>dbPeek\(t\)\);/.test(body));
  ok('★ 六張都有資料 → 直接用，不 await', /if\(_pk\.every\(Boolean\)\)\{\n\s*\[members,coaches,allBk,allTk,types,allLg\]=_pk\.map\(p=>p\.data\);/.test(body));
  ok('★ 其中有過期的才在背景校驗', /if\(_pk\.some\(p=>p\.stale\)\) _memRevalidate\(\);/.test(body));
  ok('★ 真的沒有快取（第一次登入）才走原本的 await',
     /\}else\{\n\s*\[members,coaches,allBk,allTk,types,allLg\]=await Promise\.all\(\[dbGetAll\('members'\)/.test(body));
  ok('　　票券夾要用的扣課紀錄仍然抓（不能省）', /dbGetAll\('ticket_logs'\)\.catch\(\(\)=>\[\]\)/.test(body));
}

console.log('\n③ 背景校驗的分寸（不要亂重畫）');
{
  const rv=grabFn('_memRevalidate');
  ok('★ 同時只跑一輪', /if\(window\._memRevalidating\) return;/.test(rv) && /finally\{ window\._memRevalidating=false; \}/.test(rv));
  ok('★ 內容沒變就不重畫（避免畫面閃一下）', /if\(before===sig\(\)\) return;/.test(rv));
  ok('★ 已經離開會員管理就不重畫', /if\(CUR_PAGE!=='members'\) return;/.test(rv));
  ok('★ 有視窗開著不重畫（不要抽掉底下的畫面）', /if\(document\.getElementById\('modal-bg'\)\) return;/.test(rv));
  ok('　　重畫走同一支（不另外寫一套渲染）', /await PAGES\.members\(\);/.test(rv));
  ok('　　背景失敗不影響畫面', /catch\(_\)\{\}/.test(rv));
}

console.log('\n④ 不會無限重畫');
{
  /* 重畫時 peek 已經是新鮮的 → _pk.some(stale) 為 false → 不會再叫一次 _memRevalidate */
  const body=src.slice(src.indexOf('PAGES.members=async function()'), src.indexOf('PAGES.members=async function()')+1200);
  ok('★ 只有 stale 才觸發背景校驗（校驗完就不新鮮不起來）',
     /_pk\.some\(p=>p\.stale\)/.test(body) && !/_memRevalidate\(\);\s*\n\s*_memRevalidate/.test(body));
  ok('　　為什麼要這樣做，寫在程式裡',
     /重新開預約系統，點進會員管理會有好幾秒的讀取中/.test(src));
}


console.log('\n⑧ 慢的時候要講得出「慢在哪」（2026-09-04：使用者回報 33 秒）');
{
  const fs=require('fs');
  const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  /* 那一則吐司寫「八張表 32.9s」，但逐表統計只有 fn_table_sigs 1.4s＋0.4s、傳輸 0KB。
     剩下 31 秒沒有任何線索 —— 因為①階段名稱把「抓」和「算」混在一起，
     ②卡頓比例算出來卻沒印。兩個都補上，下次一發生就自己講得出答案。 */
  ok('★★★ 抓資料與算分開量（原本整段叫「八張表」）',
     /window\._ppFetchMs=Date\.now\(\)-_f0;/.test(src)
     && /_mark\['抓資料'\]=_fe; _mark\['算'\]=Math\.max\(0,_all-_fe\);/.test(src)
     && !/_mark\['八張表'\]/.test(src));
  ok('★★★ 量不到時要退回單一數字，不能顯示錯的拆分',
     /else _mark\['讀取'\]=_all;/.test(src));
  ok('★★★ 卡頓比例真的印出來（算了六百行卻丟掉的那個數字）',
     /const _lagTxt=`　卡頓 \$\{_lagPct\}%（最久一次 \$\{_lagMax\}ms）`;/.test(src)
     && /\$\{_brk\}\$\{_lagTxt\}\$\{_top\}/.test(src));
  ok('★★ 它為什麼是關鍵，寫在原地',
     /接近 100% → 瓶頸在瀏覽器（主執行緒被佔住），不是網路也不是伺服器。/.test(src)
     && /算了就要印/.test(src));
  ok('★★ 心跳偵測還在（超過 250ms 沒跳到就是被卡住）',
     /const _hb=setInterval\(\(\)=>\{ const n=Date\.now\(\), d=n-_hbLast-100; _hbLast=n;/.test(src)
     && /if\(d>150\)\{ _lagMs\+=d; if\(d>_lagMax\) _lagMax=d; \}/.test(src));
}


console.log('\n⑨ 5.6 秒那一輪：純網路往返，兩個往返可以省掉（2026-09-04）');
{
  const fs=require('fs');
  const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  /* 補上量測之後拿到的第二筆數據：
       讀取 5.6s：基本資料 0.9s・抓資料 4.7s・算 0.0s・繪製 0.0s　卡頓 0%
       → fn_table_sigs 1.6s/0KB、fn_table_sigs 0.8s/0KB
     算 0.0s ＋ 卡頓 0% ＝ 不是 CPU、也不是主執行緒被佔住（推翻先前兩個猜測）。
     DB 端量到 fn_table_sigs 只花 106ms，所以 1.6s 裡有 1.5s 是往返。 */
  ok('★★★ 簽章的共用視窗從「回來那一刻」起算（原本從送出算，回來只剩 1.4 秒可用）',
     /_sigAt=Date\.now\(\);\s*\n\s*try\{ window\._dbStat\.push\(\{表:'fn_table_sigs'/.test(src)
     && /共用視窗要「從回來那一刻」起算，不是從送出那一刻/.test(src));
  ok('★★ 只延長共用、不放寬正確性（簽章仍先於資料，寫入照樣 dbCacheClear）',
     /只是延長共用，不放寬正確性：簽章仍然先於資料取得，/.test(src));

  ok('★★★ 單筆與整批同時開跑（原本一個等完才開始另一個）',
     /if\(kind==='member'\) ppWarmMember\(\);\s*\n\s*const rec = await dbGet\(table, id\);/.test(src)
     && /function ppWarmMember\(\)\{/.test(src));
  ok('★★★ 預熱不重複實作抓取（靠 dbGetAll 的 in-flight 合併）',
     /const inflight=_dbInflight\.get\(key\);/.test(src)
     && /ppLoadCtx 稍後要同一張表時會直接沿用同一份，不會抓兩次/.test(src));

  /* 兩份清單不同步的話，預熱會漏表 —— 不會出錯，但省不到。這裡直接比對。 */
  const warm=(src.match(/const PP_MEMBER_TABLES=\[([\s\S]*?)\];/)||[])[1]||'';
  const warmList=[...warm.matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
  const body=(src.match(/const \[coaches,tickets,bookings,purchases,ttypes,contractsAll,tkLogs,membersAll,grPend\]=await Promise\.all\(\[([\s\S]*?)\]\);/)||[])[1]||'';
  const useList=[...body.matchAll(/dbGetAll\('([^']+)'\)/g)].map(m=>m[1]).sort();
  eq('★★★ 預熱清單與 ppLoadCtx 實際抓的表一致', warmList, useList);
  ok('★★ 漏掉某張表只會少省一點、不會出錯（理由寫在原地）',
     /清單漏掉某張表只會少預熱一點（退回原本的速度），/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
