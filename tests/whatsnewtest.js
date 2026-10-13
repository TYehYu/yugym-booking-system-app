/* 更新公告（2026-10-13 使用者：「像這種功能更新或新增功能的情況 有辦法跳公告嗎？
   尤其是在員工使用的介面」；追問後定案「只給員工」「兩個都要（跳視窗＋頂欄紅點）」
   ＋「送出公告之前 要先讓我看公告內容」）

   員工端本來就會偵測新版並跳「系統已更新 → 重新整理」（verUpCheck），
   缺的只是**改了什麼**。所以不另做一套通知系統，只在 WHATS_NEW 維護一份清單。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 把清單與三支小函式抽出來實跑 */
const i=src.indexOf('const WHATS_NEW=[');
const j=src.indexOf('function wnUnseen(){');
let d=0,end=-1;
for(let k=src.indexOf('{',j);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){end=k+1;break;} } }
let store='';
const api=new Function('localStorage','APP_VERSION',
  src.slice(i,end)+'\nreturn {WHATS_NEW,wnSeen,wnMarkSeen,wnUnseen,WN_SEEN_KEY};')(
  {getItem:()=>store, setItem:(k,v)=>{store=v;}}, '261013.2237');

console.log('① 清單本身（公告是給櫃檯／教練看的，不是給工程師看的）');
ok('★★★ 每一筆都有版本、標題、至少一句內容',
   api.WHATS_NEW.every(x=>x && /^\d{6}\.\d{4}$/.test(x.ver) && x.title && Array.isArray(x.items) && x.items.length));
ok('★★★ 新的排在最前面（wnUnseen 靠字典序比，順序錯會漏標）',
   api.WHATS_NEW.every((x,k)=>k===0 || api.WHATS_NEW[k-1].ver > x.ver));
ok('★★ 一筆最多四句（落落長就沒有人會看）',
   api.WHATS_NEW.every(x=>x.items.length<=4), api.WHATS_NEW.map(x=>x.items.length));
ok('★★★ 不要寫程式用語（櫃檯看不懂）',
   !/rvpAct|allocateVenue|validateBooking|dbGetAll|venue_unit|catBlock|forceVid/.test(
     api.WHATS_NEW.map(x=>x.title+x.items.join('')).join('')));
ok('★★ 有需要注意的事就用 ⚠ 標出來（例如補開發票的日期）',
   api.WHATS_NEW.some(x=>x.items.some(t=>t.indexOf('⚠')===0)));

console.log('\n② 看過就不再跳');
{
  store='';
  eq('★★★ 第一次：全部都沒看過', api.wnUnseen().length, api.WHATS_NEW.length);
  api.wnMarkSeen();
  eq('★★★ 按了「知道了」之後：一筆都不剩', api.wnUnseen().length, 0);
  eq('★★ 記的是最新那一版', store, api.WHATS_NEW[0].ver);
  store='261012.1441';
  eq('★★★ 只回「比看過的更新」的那幾筆', api.wnUnseen().map(x=>x.ver),
     api.WHATS_NEW.filter(x=>x.ver>'261012.1441').map(x=>x.ver));
  store='999999.9999';
  eq('★★ 存了比全部都新的值也不會壞（回空）', api.wnUnseen().length, 0);
}

console.log('\n③ 只給員工，而且不要每一版都打擾');
ok('★★★ 會員看不到（沿用 verUpEnabled，不另寫一套判斷）',
   /const n=verUpEnabled\(\)\?wnUnseen\(\)\.length:0;/.test(src)
   && /if\(!verUpEnabled\(\)\) return;/.test(src));
ok('★★★ 只有標了 big 的才跳視窗，其餘只留紅點',
   /if\(!un\.some\(x=>x&&x\.big\)\)\{ return; \}/.test(src));
ok('★★ 等畫面長出來再跳（enterApp 還在組 DOM 時開彈窗會被蓋掉）',
   /setTimeout\(\(\)=>\{ try\{ openWhatsNew\(\{only:'unseen'\}\); \}catch\(_\)\{\} \}, 600\);/.test(src));
ok('★★★ 進系統時掛上（enterApp 裡）', /try\{ wnBootShow\(\); \}catch\(_\)\{\}/.test(src));

console.log('\n④ 入口要擺在看得到的地方');
/* ⚠⚠ 2026-10-13 二修（使用者看過預覽後：「這個紅點要改在更清楚的地方」）——
   第一版掛在頂欄版本號旁，但 `body.mc-mode .tb-left{display:none}`：
   桌機櫃檯／管理員那一區整個是隱藏的，等於對主要觀眾永遠看不見。
   0904「沒看到申辦待確認」是同一個坑，#alert-dock 正是為此而生。 */
ok('★★★ 提示掛在 #alert-dock（position:fixed，每一頁都在）',
   /<span id="tb-whatsnew-pill" style="display:none;"><\/span>/.test(src)
   && /const host=document\.getElementById\('tb-whatsnew-pill'\);/.test(src));
ok('★★★ 成因寫在原地（不要有人又把它搬回頂欄）',
   /桌機櫃檯／管理員那一區整個是隱藏的/.test(src));
ok('★★ 沿用會員申辦那顆膠囊的做法（同一個座、同一套樣式）',
   /class="tb-review tb-whatsnew"/.test(src) && /alertDockSync\(\)/.test(src));
ok('★★ 用品牌金不用紅：公告只是「有新東西可以看」，不是待辦',
   /\.tb-review\.tb-whatsnew\{background:#fbf3e4;border-color:#e0c79a;color:#8a5e28;\}/.test(src));
ok('★★ 版本號仍可點（第二入口）',
   /if\(el && verUpEnabled\(\)\)\{ el\.title='看更新公告'; el\.onclick=\(\)=>openWhatsNew\(\); \}/.test(src));
ok('★★ 看過就整顆消失（它是公告不是待辦，不該一直佔位子）',
   /if\(!n\)\{ host\.innerHTML=''; host\.style\.display='none'; \}/.test(src));
ok('★★ 按「知道了」會同時更新那顆提示', /onclick="wnMarkSeen\(\);wnDotSync\(\);closeModal\(\)"/.test(src));

console.log('\n⑤ 寫公告的規矩要留在原地');
ok('★★★ 註明只寫櫃檯看得懂的話、技術細節留 git',
   /只寫櫃檯／教練看得懂的話/.test(src) && /技術細節留在 git commit 裡/.test(src));
ok('★★ 註明新的放最前面、不加也不會壞', /新的放最前面/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
