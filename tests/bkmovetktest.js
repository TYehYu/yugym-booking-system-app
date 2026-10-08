/* 調課：把後面那一堂的票搬到這一堂（2026-10-08 使用者指示）。

   使用者：「我發現10/10 14:00這堂是待簽約　可是育筑明明還有可以使用的票券
     只是預先預約在未來的日期了　這時候我點10/10要出現［調課］的圓形按鈕
     把後面的課程調整過來使用」

   正式庫蕭育筑（MEM-919FA1E70BBE）的實況：
     ・TK-mu6o0s7fxdd4 友善優惠1V1  8 堂，效期 2026-11-19，**限平日 18:00 前**
     ・TK-mt41l0a8sjnv 自訂方案      8 堂，效期 2027-08-28，無時段限制
     兩張共 16 堂：已上 7 堂、未來的週五 16:00 那一串綁走 9 堂 → 週六 14:00 那一串
     （10/10～12/05 共 9 堂）全部待簽約。
   ⚠ 10/10 是**週六**，所以友善票那幾堂不能列為候選 —— 這就是候選必須拿
     「這一堂的日期時間」去驗票、而不是看票還剩幾堂的原因。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i));};

/* 真的把 tkOkForSlot 抽出來跑（依賴用最小的替身，行為與正式庫一致） */
const env=
  "const window=globalThis;"
 +"const TK_TIME_END_MIN=1080;"   /* 與 index.html 同值，18:00 */
 +"const parseYmd=s=>{const[a,b,c]=String(s).split('-').map(Number);return new Date(a,b-1,c);};"
 +"const timeToMin=t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);};"
 +"window._ttCache=[{id:'tt-friendly',name:'友善教練課',category:'私人教練',time_restricted:true},"
 +"{id:'tt-pt',name:'教練課',category:'私人教練'}];"
 +"const ticketCategoryOf=t=>{const tt=window._ttCache.find(x=>x.id===t.ticket_type_id)||{};return tt.category||'';};"
 +"const bkTicketTypeOk=(t,id)=>{if(t.ticket_type_id===id)return true;"
 +"const sel=window._ttCache.find(x=>x.id===id),tty=window._ttCache.find(x=>x.id===t.ticket_type_id);"
 +"return !!(sel&&tty&&sel.category==='私人教練'&&/友善/.test(sel.name||'')&&tty.category==='私人教練'&&!/友善/.test(tty.name||''));};";
/* ⚠ 抽函式要用「行首 }」當結尾，不能用下一段註解當結尾 ——
   找不到那段註解時 indexOf 會回 -1，slice(i,-1) 等於把整個檔案都抓進來。 */
const fn=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  const j=src.indexOf('\n}', i); return src.slice(i, j+2); };
const {tkOkForSlot}=new Function(env
  +fn('tkTimeOk')+fn('bkTypeIdOf')+fn('categoryOfTypeId')+fn('tkTypeOkFor')+fn('tkOkForSlot')
  +'\nreturn {tkOkForSlot};')();

const FRIENDLY={id:'TK-mu6o0s7fxdd4', status:'usable', ticket_type_id:'tt-friendly', expire_date:'2026-11-19'};
const CUSTOM  ={id:'TK-mt41l0a8sjnv', status:'usable', ticket_type_id:'tt-pt',       expire_date:'2027-08-28'};
const SAT1400 ={date:'2026-10-10', start_time:'14:00', duration:60, category:'私人教練', ticket_type_id:'tt-pt'};
/* ⚠ 這一堂要用**友善**票種：友善票只能上友善課（反方向才放行，0831 定的） */
const FRI1600 ={date:'2026-10-16', start_time:'16:00', duration:60, category:'私人教練', ticket_type_id:'tt-friendly'};
const FRI1800 ={date:'2026-10-16', start_time:'18:00', duration:60, category:'私人教練', ticket_type_id:'tt-friendly'};

console.log('① 候選要拿「這一堂的時段」驗票');
ok('★★★ 友善票不能用在週六 → 週五那一串不是 10/10 的候選', tkOkForSlot(FRIENDLY, SAT1400)===false);
ok('★★★ 自訂方案（無時段限制）可以用在週六 → 是候選', tkOkForSlot(CUSTOM, SAT1400)===true);
ok('★★ 友善票用在平日 16:00（17:00 下課）可以', tkOkForSlot(FRIENDLY, FRI1600)===true);
ok('★★★ 友善票用在平日 18:00（19:00 下課）不行', tkOkForSlot(FRIENDLY, FRI1800)===false);
ok('★★★ 效期過了就不能調過來',
   tkOkForSlot(Object.assign({},CUSTOM,{expire_date:'2026-10-09'}), SAT1400)===false);
ok('★★★ 還沒到起始日也不行（已開通的票除外）',
   tkOkForSlot(Object.assign({},CUSTOM,{start_date:'2026-11-01'}), SAT1400)===false
   && tkOkForSlot(Object.assign({},CUSTOM,{start_date:'2026-11-01',activated_at:'2026-09-01'}), SAT1400)===true);
ok('★★ 作廢／退費的票不給調', tkOkForSlot(Object.assign({},CUSTOM,{status:'refunded'}), SAT1400)===false);

/* ⚠ 種類判斷不要抄第二份：與 tkFitsBooking 共用 tkTypeOkFor（棘輪 pockettest 也盯著） */
ok('★★★ 種類判斷共用 tkTypeOkFor，沒有在調課這支再抄一份',
   /function tkTypeOkFor\(t,type_id\)\{/.test(src)
   && /return tkTypeOkFor\(t, bkTypeIdOf\(b\)\);/.test(src)
   && /  return tkTypeOkFor\(t,type_id\);\n\}/.test(src));

console.log('\n② 候選清單的條件');
const CAND=g('async function bkMoveCandidates(b){','\nasync function openBkMoveTicket');
ok('★★★ 只收：同一會員、在這一堂之後、booked、有綁票、不是待簽約',
   /String\(x\.member_id\|\|''\)===String\(b\.member_id\|\|''\)/.test(CAND)
   && /_mvKey\(x\)>me/.test(CAND)
   && /x\.status==='booked' && x\.ticket_id/.test(CAND)
   && /!x\.pending_contract/.test(CAND));
ok('★★★ 每一筆都要過 tkOkForSlot（用這一堂的時段驗）', /tkOkForSlot\(tkById\[x\.ticket_id\], b\)/.test(CAND));
ok('★★ 最晚的排最前面（預設挑它，最不影響近期的課）',
   /\.sort\(\(a,c\)=>_mvKey\(c\.bk\)\.localeCompare\(_mvKey\(a\.bk\)\)\)/.test(CAND));

console.log('\n③ 執行：只搬 ticket_id，不重扣');
const DO=(()=>{ const i=src.indexOf('async function _doBkMoveTicket(){');
  return src.slice(i, src.indexOf('\n}', i)+2); })();
ok('★★★ 不動 sessions_remaining（票早就扣過那一次了）',
   !/sessions_remaining/.test(DO) && !/deductTicket\(/.test(DO) && !/refundTicket\(/.test(DO));
ok('★★★ 票搬過來、這一堂不再是待簽約',
   /to\.ticket_id=from\.ticket_id;/.test(DO) && /to\.pending_contract=false;/.test(DO) && /from\.ticket_id=null;/.test(DO));
ok('★★★ 後面那一堂：留著＝變待簽約／取消＝status 改 cancelled（使用者要每次選）',
   /from\.status='cancelled'; from\.cancelled_at=/.test(DO) && /from\.pending_contract=true;/.test(DO));
ok('★★★ 送出前重驗一次（畫面可能是舊的）',
   /if\(to\.status!=='booked'\|\|!to\.pending_contract\)/.test(DO)
   && /if\(from\.status!=='booked'\|\|!from\.ticket_id\)/.test(DO)
   && /if\(!tkOkForSlot\(tk,to\)\)/.test(DO));
ok('★★ 帳本留痕（adjust 0，寫從哪一堂搬到哪一堂）',
   /await logTicket\(tk\.id,'adjust',0,to\.id,SESSION\.id,/.test(DO) && /調課：\$\{from\.date\}/.test(DO));
ok('★★ 防連點＋按鈕變「處理中…」',
   /async function doBkMoveTicket\(\)\{ return onceAct\('bkmove:'\+\(window\._mvBid\|\|''\), _doBkMoveTicket\); \}/.test(src)
   && /_btn\.disabled=true; _btn\.textContent='處理中…';/.test(DO));

console.log('\n④ 按鈕背景補入，不擋住課卡展開');
/* ⚠ 2026-10-08 二修（使用者：「今天點行事曆的課卡跳出都有點慢」）——
   初版在展開前 await bkMoveCandidates（整表 bookings＋member_tickets），
   整組按鈕就慢一拍。這是 0726 抽獎鈕踩過的同一個坑，改成同一套：
   卡片先畫出來，候選在背景算，有才把這一顆補進去。 */
ok('★★★ 展開前不 await 候選（只立一個旗標）',
   /window\._mvProbe=\{id:String\(id\), need:true\};/.test(src)
   && !/let _mv=0; try\{ _mv=\(await bkMoveCandidates\(b\)\)\.length; \}catch\(_\)\{\}/.test(src));
ok('★★★ bkCardPop 之後才在背景算，算完才補按鈕',
   /window\._expandedBkEl = el;[\s\S]{0,400}?const _n=\(await bkMoveCandidates\(b\)\)\.length;/.test(src));
ok('★★★ 補之前確認還是同一張卡（可能已收起或點到別張）',
   /if\(!_n \|\| !orbit \|\| window\._expandedBkEl!==el\) return;/.test(src)
   && /if\(orbit\.querySelector\('\.evo-swap'\)\) return;/.test(src));
ok('★★ 補完要重排圓鈕（與抽獎鈕同一套收尾）',
   /evoFanLayout\(orbit\);\s*\n\s*_bkOrbitNudge\(el\);[\s\S]{0,80}?\}catch\(_\)\{\}\s*\n\s*\}\)\(\);\s*\n\s*\}\s*\n\s*return;/.test(src));

console.log('\n⑤ 按鈕不會卡在「處理中…」');
/* 使用者附截圖「這邊也卡住」：驗證失敗是 early return，按鈕永遠停在處理中。 */
ok('★★★ 用 try/finally 還原，不是只在 catch 還原',
   /\}finally\{\s*\n\s*if\(!_ok && _btn\)\{ _btn\.disabled=false; _btn\.textContent=_tx; \}\s*\n\s*\}/.test(src));
ok('★★★ 成功那條不還原（視窗已關，_ok 擋著）', /let _ok=false;/.test(src) && /_ok=true;\s*\n\s*closeModal\(\);/.test(src));
/* 連續調課時，候選清單是開視窗那一刻算的，第二次很容易挑到剛被搬走的那一堂 */
ok('★★★ 挑到已被搬走的課 → 重算候選並重畫，不是丟一個 toast 就結束',
   /const _re=await bkMoveCandidates\(to\);/.test(src)
   && /window\._mvList=_re; window\._mvTo=to; window\._mvPick=_re\[0\]\.bk\.id; mvRender\(\);/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
