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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
