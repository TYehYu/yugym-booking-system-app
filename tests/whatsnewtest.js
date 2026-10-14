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
/* 2026-10-14：鍵名改成逐帳號（yugym_whatsnew_seen_<員工 id>），所以沙箱的
   localStorage 要真的分鍵存 —— 用一個物件模擬，才測得出「早班看過、晚班還看得到」。 */
let bag={};
const mkApi=(uid)=>new Function('localStorage','APP_VERSION','window',
  src.slice(i,end)+'\nreturn {WHATS_NEW,wnSeen,wnMarkSeen,wnUnseen,wnSeenKey};')(
  {getItem:k=>(k in bag?bag[k]:null), setItem:(k,v)=>{bag[k]=v;}}, '261013.2237',
  {SESSION:{id:uid}});
const api=mkApi('c-staff-A');

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
  bag={};
  eq('★★★ 第一次：全部都沒看過', api.wnUnseen().length, api.WHATS_NEW.length);
  api.wnMarkSeen();
  eq('★★★ 按了「知道了」之後：一筆都不剩', api.wnUnseen().length, 0);
  eq('★★ 記的是最新那一版', bag[api.wnSeenKey()], api.WHATS_NEW[0].ver);
  bag={}; bag[api.wnSeenKey()]='261012.1441';
  eq('★★★ 只回「比看過的更新」的那幾筆', api.wnUnseen().map(x=>x.ver),
     api.WHATS_NEW.filter(x=>x.ver>'261012.1441').map(x=>x.ver));
  bag={}; bag[api.wnSeenKey()]='999999.9999';
  eq('★★ 存了比全部都新的值也不會壞（回空）', api.wnUnseen().length, 0);
}

console.log('\n②-b 早班看過，晚班還看得到（2026-10-14 使用者回報的那件事）');
{
  /* 櫃檯是同一台電腦輪班用。原本整台共用一個鍵，早班按了「知道了」，
     晚班換帳號登入也不會再跳 —— 等於晚班永遠不知道系統改了什麼。 */
  bag={};
  const 早=mkApi('c-staff-早'), 晚=mkApi('c-staff-晚');
  早.wnMarkSeen();
  eq('★★★ 早班看過之後自己不再跳', 早.wnUnseen().length, 0);
  eq('★★★ 晚班（同一台電腦、不同帳號）照樣看得到', 晚.wnUnseen().length, api.WHATS_NEW.length);
  eq('★★ 兩個人各存各的鍵', Object.keys(bag), ['yugym_whatsnew_seen_c-staff-早']);
  /* 0到14 之前存的是整台共用的舊鍵，改版後不要讓全員又被跳一次 */
  bag={'yugym_whatsnew_seen':'999999.9999'};
  eq('★★ 舊鍵沿用一次（改版當下不會全員重跳）', mkApi('c-new').wnUnseen().length, 0);
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

console.log('\n⑥ 常駐入口（2026-10-14 使用者：「可以多加一個在導覽列嗎」）');
/* 浮動座那顆是**提示**（看過就消失），所以需要一個永遠在的入口 ——
   否則晚班同事想回頭看早班看過的公告會找不到。 */
ok('★★★ 帳號選單有一顆「系統更新公告」',
   /<button class="tb-acct-item" id="acct-whatsnew" onclick="closeAcctMenu\(\);openWhatsNew\(\)"/.test(src));
ok('★★★ 只給員工看得到（與浮動座同一個判斷）',
   /const _on=\(typeof verUpEnabled==='function'\)&&verUpEnabled\(\);\s*\n\s*_wn\.style\.display=_on\?'':'none';/.test(src));
ok('★★ 右邊那顆小點只代表「這個帳號還沒看過」',
   /_d\.style\.display=\(_on && typeof wnUnseen==='function' && wnUnseen\(\)\.length\)\?'':'none';/.test(src));
ok('★★ 打開的是同一張清單（不是只看沒看過的那幾筆）',
   /onclick="closeAcctMenu\(\);openWhatsNew\(\)"/.test(src));
ok('★★ 成因寫在原地（早班看過，晚班就看不到了）',
   /早班同事\s*\n?\s*上班看過公告後　晚班同事就看不到了/.test(src) || /晚班同事就看不到了/.test(src));

console.log('\n⑦ 頂欄的公告圖示（2026-10-14 使用者：「可以在導覽列上面新增一個公告圖示」）');
ok('★★★ 頂欄有這顆鈕，點了開公告',
   /<button type="button" class="rf-btn wn-btn" id="tb-whatsnew"[\s\S]{0,200}?onclick="openWhatsNew\(\)"/.test(src));
/* ⚠ 用位置先後判斷，不要用「相隔幾個字」—— 註解很長，距離窗一開大就會兩邊都命中。 */
ok('★★★ 放在 .tb-right（.tb-left 在 body.mc-mode 是 display:none，桌機櫃檯看不到）',
   (()=>{ const L=src.indexOf('<div class="tb-left">'), R=src.indexOf('<div class="tb-right">'),
            B=src.indexOf('id="tb-whatsnew"'), F=src.indexOf('id="tb-refresh"');
          return L>=0 && R>L && B>R && F>B; })());
ok('★★★ 沿用〔更新畫面〕那顆的外觀，不另做尺寸（使用者：「不會佔用太大空間」）',
   /class="rf-btn wn-btn"/.test(src) && /\.rf-btn\.wn-btn\{position:relative;\}/.test(src));
ok('★★ 未讀點用金色，不跟真正的待辦搶（紅>金>綠）',
   /\.wn-btn-dot\{position:absolute[^}]*background:var\(--gold,#b48a56\)/.test(src));
ok('★★ 深色頂欄（mc-mode）下未讀點的外圈跟著換色，不會糊成一片',
   /body\.mc-mode \.tb-right \.wn-btn-dot\{box-shadow:0 0 0 2px #0b4a3c;\}/.test(src));
ok('★★★ 鈕永遠在、只有未讀點會收（與浮動座那顆的差別寫在原地）',
   /那顆看過就消失（提示），這顆\*\*永遠在\*\*（入口），只有未讀點會收起來/.test(src));
ok('★★★ 只給員工', /const _wnOn=verUpEnabled\(\), _wnDot=_wnOn && wnUnseen\(\)\.length>0;/.test(src));
/* ⚠⚠ 2026-10-14 二修（使用者：「我這邊沒看到公告的按鈕」）——
   頂欄有**兩套 DOM**：靜態 HTML 的 .tb-right 服務教練／手機，
   而桌機櫃檯／管理員（mc-mode）**整條 .tb-right 是 display:none**，
   看的是 renderLeftSidebar 自己畫的那一列。只做一顆＝一半的人看不到，
   而且剛好是最常用的那一半。這已經是第三次踩到同一類坑
   （0904 的 .tb-left、1013 的版本號、這次的 .tb-right）。 */
ok('★★★ 兩套頂欄各放一顆，而且由同一支一起管',
   /id="mc-whatsnew"/.test(src) && /id="tb-whatsnew"/.test(src)
   && /\[\['tb-whatsnew','tb-whatsnew-dot'\],\['mc-whatsnew','mc-whatsnew-dot'\]\]\.forEach/.test(src));
ok('★★★ mc 那一列每次換頁都重畫 → 重畫完要補叫一次',
   /try\{ acctAvatarRefresh\(\); \}catch\(_\)\{\}[\s\S]{0,260}?try\{ wnDotSync\(\); \}catch\(_\)\{\}/.test(src));
ok('★★ 成因寫在原地（下一個人才不會又只做一顆）',
   /桌機管理版（mc-mode）\*\*整條 \.tb-right 都是\s*\n?\s*display:none\*\*/.test(src)
   || /整條 \.tb-right 都是/.test(src));
ok('★★ 換頁／換帳號時會重算（掛在 syncAcctMenuItems 裡）',
   /try\{ wnDotSync\(\); \}catch\(_\)\{\}   \/\* 頂欄那顆公告鈕/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
