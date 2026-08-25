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
  grab('function bkActorLabel(id, coachMap){')+'\n'+grab('function bkOpTime(ts){')
  +'\nreturn {bkActorLabel,bkOpTime};')();

console.log('實跑 bkActorLabel：欄位裡四種東西各自要講人話');
const CM={'c-abc':'有肌1','c-xyz':'余東曄'};
ok('★ 員工 id → 名字', bkActorLabel('c-abc',CM)==='有肌1' && bkActorLabel('c-xyz',CM)==='余東曄');
ok('★★ MEM- 開頭 → 會員自己（會員自助預約／取消，這是最需要看出來的一種）',
   bkActorLabel('MEM-A71E46497682',CM)==='會員自己');
ok('★ system → 系統自動（轉正時自動取消那類）', bkActorLabel('system',CM)==='系統自動');
ok('★ manual-fix-* → 後台修正', bkActorLabel('manual-fix-20260729',CM)==='後台修正');
ok('★★ 空的就寫「沒有記錄」，不要猜（0810 之前與舊系統匯入的都是空的）',
   bkActorLabel(null,CM)==='沒有記錄' && bkActorLabel('',CM)==='沒有記錄' && bkActorLabel(undefined,CM)==='沒有記錄');
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
ok('★★ 每一列都寫「建立 誰・什麼時候」', /const _opC=`建立 \$\{bkActorLabel\(b\.created_by,_cm\)\}\$\{bkOpTime\(b\.created_at\)\?'・'\+bkOpTime\(b\.created_at\):''\}`;/.test(PPB));
ok('★★ 取消過的多一段「取消 誰・什麼時候」，用品牌紅（唯一一種「東西不見了」的紀錄）',
   /const _opX=_cx\?`取消 \$\{bkActorLabel\(b\.cancelled_by,_cm\)\}/.test(PPB)
   && /\.pp-bkop-x\{color:var\(--danger/.test(src));
ok('　　沒取消的就不畫那一段', /_opX\?`<span class="pp-bkop-x">\$\{escH\(_opX\)\}<\/span>`:''/.test(PPB));
ok('　　多一行之後列不再垂直置中（不然日期會浮在中間）',
   /\.pp-bkrow\{display:flex;align-items:flex-start;/.test(src));

console.log('\n簡易課卡的會員卡');
ok('★★ 會員卡上多一行操作紀錄', /const _opLine=\(\(\)=>\{/.test(src)
   && /<div class="ash-mop"><i>這一堂<\/i>/.test(src)
   && /\$\{_tk\}\$\{_subLine\}\$\{_opLine\}<\/div>/.test(src));
ok('★★ 寫「這一堂」不是「這個名額」—— created_by 記的是整筆預約，'
   +'團課後來被加進名單的人沒有各自的時間戳，寫成那樣是謊',
   /寫「這一堂」不是「這個名額」/.test(src)
   && /寫成「他是那時候被加進來的」會是謊/.test(src));
ok('★ 取消那一段同樣用紅色', /\.ash-mop b\{color:var\(--danger/.test(src));

console.log('\n欄位撈得到（LEAN_DROP 沒把它們丟掉）');
const LD=src.slice(src.indexOf('const LEAN_DROP={'), src.indexOf('const _leanSel=new Map()'));
ok('★★ created_by 與 cancelled_by 都不在 bookings 的精簡清單裡（丟掉就整排變「沒有記錄」）',
   !/'created_by'/.test(LD) && !/'cancelled_by'/.test(LD));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
