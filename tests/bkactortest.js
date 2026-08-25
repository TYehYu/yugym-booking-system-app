/* 「這一筆是誰、什麼時候動的」（2026-08-25 使用者指示）
   ・「還是在會員資料預約明細這邊留下紀錄　紀錄每一筆是由哪邊操作的」「跟什麼時候操作的」
   ・「行事曆點課卡跳出的簡易課卡　會員卡上面新增顯示操作時間跟由誰操作的」

   起因：黃淨萍 8/25 19:00 那一堂是她自己在手機上取消的（8/18 18:59），櫃檯只收到
   一則會滑掉的通知，事後只能靠票券帳本的 operator 反推。而且會員資料的預約紀錄
   **把取消的整個濾掉**，所以那一堂在她的資料裡根本看不到，空了一週才被發現。

   建立端本來就有記錄（bookings.created_by）；取消端 0825 補上 cancelled_by，
   由 DB 觸發器 trg_bookings_cancelled_by 填 —— 取消有五條路，逐條改一定會漏。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=(sig)=>{ const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
  return src.slice(i,k+1); };

const {bkActorLabel,bkOpTime}=new Function(
  grab('const BK_ACTOR_SINCE={created:')+'\n'+grab('function bkActorLabel(id, coachMap, memMap, when, kind){')+'\n'+grab('function bkOpTime(ts){')
  +'\nreturn {bkActorLabel,bkOpTime};')();

console.log('實跑 bkActorLabel：欄位裡四種東西各自要講人話');
const CM={'c-abc':'有肌1','c-xyz':'余東曄'};
ok('★ 員工 id → 名字', bkActorLabel('c-abc',CM)==='有肌1' && bkActorLabel('c-xyz',CM)==='余東曄');
/* 2026-08-25 二修使用者指示：「會員自己建立的改用會員的名字顯示」——
   同一個帳號可能幫家人約，寫名字才看得出是誰動的。 */
const MM={'MEM-1':'黃淨萍','MEM-2':{name:'陳世勳'}};
ok('★★ MEM- 開頭 → 寫會員的名字', bkActorLabel('MEM-1',CM,MM)==='黃淨萍');
ok('　　有些頁的 memMap 存的是整個物件，也要吃得下', bkActorLabel('MEM-2',CM,MM)==='陳世勳');
ok('★ 查不到名字才退回「會員自己」（不要把 MEM-xxxx 印給人看）',
   bkActorLabel('MEM-9',CM,MM)==='會員自己' && bkActorLabel('MEM-9',CM)==='會員自己');
ok('★ system → 系統自動（轉正時自動取消那類）', bkActorLabel('system',CM)==='系統自動');
ok('★ manual-fix-* → 後台修正', bkActorLabel('manual-fix-20260729',CM)==='後台修正');
ok('★★ 空的就寫「沒有記錄」，不要猜（0810 之前與舊系統匯入的都是空的）',
   bkActorLabel(null,CM)==='沒有記錄' && bkActorLabel('',CM)==='沒有記錄' && bkActorLabel(undefined,CM)==='沒有記錄');
/* 2026-08-25 使用者：「這邊都是沒有紀錄　是什麼原因呢」——
   羅秋菊那幾筆是 8/21 取消的，而 cancelled_by 這個欄位 8/25 才存在。
   「系統當時還沒在記」跟「這一筆漏掉了」對櫃檯的意義完全不同：前者不用查，後者要查。 */
ok('★★ 欄位還不存在的那段時間 → 「當時未記錄」，不要跟真的漏掉混在一起',
   bkActorLabel(null,CM,null,'2026-08-21T13:28:00Z','cancelled')==='當時未記錄'
   && bkActorLabel(null,CM,null,'2026-08-01T00:00:00Z','created')==='當時未記錄');
ok('★★ 欄位上線之後還是空的 → 「沒有記錄」（那就是真的該查）',
   bkActorLabel(null,CM,null,'2026-08-26T00:00:00Z','cancelled')==='沒有記錄'
   && bkActorLabel(null,CM,null,'2026-08-20T00:00:00Z','created')==='沒有記錄');
ok('　　兩個欄位各有各的起算日（created 0811、cancelled 0825）',
   /const BK_ACTOR_SINCE=\{created:'2026-08-11', cancelled:'2026-08-25'\};/.test(src));
ok('　　沒帶時間或種類就維持原本的「沒有記錄」（不會亂猜）',
   bkActorLabel(null,CM,null,'2026-08-01T00:00:00Z')==='沒有記錄'
   && bkActorLabel(null,CM,null,null,'cancelled')==='沒有記錄');
ok('　　查不到名字的員工 id 也不留原始 id 給人看', bkActorLabel('c-unknown',CM)==='員工'
   && bkActorLabel('c-unknown',null)==='員工');

console.log('\n實跑 bkOpTime：資料庫存 UTC，畫面要台北時間');
ok('★★ 黃淨萍那一筆：UTC 10:59 → 台北 18:59',
   bkOpTime('2026-08-18T10:59:18.676Z')==='8/18 18:59', bkOpTime('2026-08-18T10:59:18.676Z'));
ok('★ 跨日也要對（UTC 16:30 → 隔天 00:30）',
   bkOpTime('2026-08-24T16:30:00Z')==='8/25 00:30', bkOpTime('2026-08-24T16:30:00Z'));
ok('★ 沒有時間就給空字串（不要印 NaN 或 Invalid Date）',
   bkOpTime(null)==='' && bkOpTime('')==='' && bkOpTime(undefined)==='');
ok('　　壞字串也不會炸', bkOpTime('not-a-date')==='');

console.log('\n會員資料的預約紀錄');
const PPB=src.slice(src.indexOf("if(PP.recView==='bookings'){"), src.indexOf("if(PP.recView==='pay'){"));
ok('★★ 取消的也要列出來 —— 原本一律濾掉，「會員自己把課取消了」在會員資料裡完全看不到',
   /const _bk=\(c\.myBk\|\|\[\]\)\.slice\(\)/.test(PPB) && !/filter\(b=>b\.status!=='cancelled'\)\s*\n\s*\.slice\(\)/.test(PPB));
ok('　　黃淨萍那一堂就是這樣消失一週的（寫在原地）', /黃淨萍 8\/25 那一堂就是這樣消失一週的/.test(PPB));
ok('★ 已取消要標出來並淡化、名稱畫刪除線',
   /\['已取消','pp-bk-cx'\]/.test(PPB)
   && /\.pp-bkrow\.pp-bkrow-cx\{opacity:\.62;\}/.test(src)
   && /\.pp-bkrow\.pp-bkrow-cx \.pp-bkname\{text-decoration:line-through/.test(src));
ok('★★ 每一列都寫「建立／開課 誰・什麼時候」，會員自己約的寫名字',
   /const _opC=`\$\{_lb\} \$\{bkActorLabel\(b\.created_by,_cm,_mmn,b\.created_at,'created'\)\}/.test(PPB)
   && /const _lb=bkIsGroup\(b\)\?'開課':'建立';/.test(PPB));
ok('★★ 取消過的多一段「取消 誰・什麼時候」，用品牌紅（唯一一種「東西不見了」的紀錄）',
   /const _opX=_cx\?`取消 \$\{bkActorLabel\(b\.cancelled_by,_cm,_mmn,b\.cancelled_at,'cancelled'\)\}/.test(PPB)
   && /\.pp-bkop-x\{color:var\(--danger/.test(src));
ok('　　沒取消的就不畫那一段', /_opX\?`<span class="pp-bkop-x">\$\{escH\(_opX\)\}<\/span>`:''/.test(PPB));
ok('　　多一行之後列不再垂直置中（不然日期會浮在中間）',
   /\.pp-bkrow\{display:flex;align-items:flex-start;/.test(src));

console.log('\n簡易課卡：單人課畫在會員卡、團課畫在標題卡');
/* 使用者看到團課四張會員卡都寫「建立 RANDY」，問「這一堂是 Randy 建立的?」——
   RANDY 是余東曄的對外名稱，時間也對，但那是「他 7/28 開了這堂課」，
   不是「他把郭祐竹加進來」。重複四次就一定被讀成後者。 */
ok('★★ 單人課才畫在會員卡上', /const _opLine=bkIsGroup\(b\)\?'':\(\(\)=>\{/.test(src)
   && /\$\{_tk\}\$\{_subLine\}\$\{_opLine\}<\/div>/.test(src));
ok('★★ 團課改畫在標題卡，而且改口說「開課」（那是整堂的事實）',
   /\$\{bkIsGroup\(b\)\?`<div class="ash-mop ash-crsop">\$\{escH\(`開課 \$\{bkActorLabel\(b\.created_by,cm,mm,b\.created_at,'created'\)\}/.test(src));
ok('　　為什麼不能畫在會員卡上寫在原地',
   /不是「這個人是誰加進來的」/.test(src)
   && /讀起來就變成\s*\n\s*「Randy 把郭祐竹加進來」/.test(src));
ok('★ 會員名字與時間都帶得進去',
   /bkActorLabel\(b\.created_by,cm,mm,b\.created_at,'created'\)/.test(src)
   && /bkActorLabel\(b\.cancelled_by,cm,mm,b\.cancelled_at,'cancelled'\)/.test(src));
ok('★ 取消那一段同樣用紅色', /\.ash-mop b\{color:var\(--danger/.test(src));

console.log('\n取消人留得住（0825 使用者回報「顯示沒有紀錄」）');
/* 成因：前端備援取消路徑對同一筆連寫兩次 ——
   ① status+cancelled_at（觸發器填上取消人）② 再補 refund_waived，送的是取消前讀的
   那份 b（沒有 cancelled_by），第二次 old.status 已是 cancelled、觸發器跳過 → 被蓋回 null。 */
const CB=src.slice(src.indexOf('async function cancelBooking(id, refundMode, opts){'),
                   src.indexOf('let refundedCount=0, refundMissed=false;'));
ok('★★ 取消只寫一次（status／cancelled_at／refund_waived 一起送）',
   (CB.match(/await dbPut\('bookings',b\);/g)||[]).length===1
   && /b\.status='cancelled';\s*\n\s*b\.cancelled_at=new Date\(\)\.toISOString\(\);\s*\n\s*b\.refund_waived = !doRefund;/.test(CB));
ok('★★ 退不退要在寫回之前算完（不然沒辦法併成一次）',
   CB.indexOf('let doRefund;') < CB.indexOf("b.status='cancelled';"));
ok('　　為什麼併成一次寫在原地', /少一整類「用舊物件覆蓋新欄位」的坑/.test(CB));

console.log('\n欄位撈得到（LEAN_DROP 沒把它們丟掉）');
const LD=src.slice(src.indexOf('const LEAN_DROP={'), src.indexOf('const _leanSel=new Map()'));
ok('★★ created_by 與 cancelled_by 都不在 bookings 的精簡清單裡（丟掉就整排變「沒有記錄」）',
   !/'created_by'/.test(LD) && !/'cancelled_by'/.test(LD));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
