/* 票券校正（畫面上叫「校正」，函式名沿用 tkTidy*；2026-08-25 使用者提問：「像這種調整票券功能的，有辦法讓管理員操作嗎，
   就不用每次都要找你修改」）

   當天的案例：黃喬莉三張同名的「私人教練課 1V2」，舊系統匯入把 1/17～3/26 那七堂
   掛到了較早的兩張票上。系統原本沒有入口 —— 校正堂數只改餘額、更換票券只吃
   「還沒簽到」的未來預約、更換方案只吃沒用過的票，於是每次都要下 SQL。

   這支守住三件會出人命的事：
     ① 團課不能列進來（團課的帳在 ticket_logs，改 ticket_id 沒有作用）
     ② 有扣課紀錄的那一堂不能在這裡搬（會留下指向舊票的扣課，戳記歸錯堂）
     ③ 留痕要用 adjust／delta 0，不能用 deduct／delta 0 —— 後者是票券夾認的
        「連結」，寫下去之後再把這一堂拿掉，舊連結會把它又黏回來 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=(sig)=>{ const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
  return src.slice(i,k+1); };

/* ── 實跑 tkTidyPaint（畫面判斷全在它身上）───────────────────────────── */
const boxes={};
const doc={ getElementById:id=>(boxes[id]=boxes[id]||{innerHTML:''}) };
const escH=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const parseYmd=s=>{ const p=String(s).slice(0,10).split('-'); return new Date(+p[0],+p[1]-1,+p[2]); };
const W={};
const mk=new Function('window','document','escH','parseYmd',
  grab('function tkTidyPaint(){')+'\n'+grab('function tkTidyTap(bid){')+'\nreturn {tkTidyPaint,tkTidyTap};');
const {tkTidyPaint,tkTidyTap}=mk(W,doc,escH,parseYmd);

/* 黃喬莉那張 1/8 的票：8 堂，七堂舊匯入（無帳）＋ 9/03（綁票沒扣）＋ 9/10（有扣課紀錄） */
const rows=[
  {id:'B1',date:'2026-01-17',time:'18:00',coach:'鄭百益',st:'checked_in',pend:false,tk:'TK-A',lock:null},
  {id:'B2',date:'2026-02-05',time:'19:00',coach:'鄭百益',st:'checked_in',pend:false,tk:'TK-A',lock:null},
  {id:'B3',date:'2026-03-26',time:'19:00',coach:'鄭百益',st:'checked_in',pend:false,tk:'TK-B',lock:null},
  {id:'B4',date:'2026-09-03',time:'19:00',coach:'鄭百益',st:'booked',pend:false,tk:'TK-C',lock:null},
  {id:'B5',date:'2026-09-10',time:'19:00',coach:'鄭百益',st:'booked',pend:false,tk:'TK-C',lock:'TK-C'},
  {id:'B6',date:'2026-09-17',time:'19:00',coach:'鄭百益',st:'booked',pend:true,tk:null,lock:null},
  {id:'B7',date:'2026-08-27',time:'19:00',coach:'鄭百益',st:'checked_in',pend:false,tk:'TK-D',lock:'TK-D'},
];
const fresh=()=>{ W._tdy={ tkId:'TK-C', mid:'M1', cat:'私人教練', rows,
  sel:{B4:1,B5:1}, orig:{B4:1,B5:1},
  tkNo:{'TK-A':1,'TK-B':2,'TK-C':3,'TK-D':4},
  tkName:{'TK-A':'私人教練課 1V2','TK-B':'私人教練課 1V2','TK-C':'私人教練課 1V2','TK-D':'私人教練課 1V2'},
  grpN:2, total:8, rem0:0, ttid:'tt-1v2', name:'私人教練課 1V2', mname:'黃喬莉' };
  boxes['tdy-list']={innerHTML:''}; boxes['tdy-sum']={innerHTML:''}; };

console.log('實跑 tkTidyPaint');
fresh(); tkTidyPaint();
const L=()=>boxes['tdy-list'].innerHTML, S=()=>boxes['tdy-sum'].innerHTML;
ok('★ 已經算在這張票上的畫成綠底（tdy-on）',
   /tkTidyTap\('B4'\)/.test(L()) && /tdy-row tdy-on"[^>]*onclick="tkTidyTap\('B4'\)/.test(L()));
ok('★ 掛在別張票的寫得出「目前算在 #1」', /目前算在 #1 私人教練課 1V2/.test(L()));
ok('★ 沒綁票的寫「未綁票券」', /未綁票券/.test(L()));
ok('★ 待簽約的標成待簽約，不是已預約',
   /B6/.test(L()) && L().split("tkTidyTap('B6')")[1].indexOf('待簽約')>=0);
ok('★★ 有扣課紀錄、且扣在別張票的鎖住＋寫原因，不是藏起來',
   /tdy-lock/.test(L()) && /已扣 #4 的課，請用課卡的「更換票券」/.test(L())
   && !/tkTidyTap\('B7'\)/.test(L()));
ok('★★ 有扣課紀錄、扣在這張票的也鎖住（拿不掉）',
   /這一堂有扣課紀錄，拿不掉/.test(L()) && !/tkTidyTap\('B5'\)/.test(L()));
ok('★ 日期帶星期（01/17（六））', /01\/17（六）/.test(L()));
ok('★ 結算列寫出勾選堂數與新餘額', /勾選堂數[\s\S]*?2 \/ 8/.test(S()) && /票面餘額會變成[\s\S]*?6 堂/.test(S()));
ok('★ 團課沒列出來要講一句（不是靜靜消失）', /另有 2 堂團課沒有列出來/.test(S()));

console.log('\n勾選與算術');
fresh(); tkTidyPaint();
['B1','B2','B3'].forEach(id=>tkTidyTap(id));
ok('★★ 補上七堂中的三堂 → 勾 5 堂、餘額 3',
   /5 \/ 8/.test(S()) && /票面餘額會變成[\s\S]*?3 堂/.test(S()));
ok('　　更動筆數會講', /這次會更動 3 堂/.test(S()));
tkTidyTap('B4');
ok('★ 再點一下取消勾選（可來回）', /4 \/ 8/.test(S()) && !/tdy-row tdy-on"[^>]*onclick="tkTidyTap\('B4'\)/.test(L()));

/* 超過總堂數要當場擋住並說清楚 —— 黃喬莉這張正是 9 堂佔 8 格 */
fresh();
W._tdy.sel={B1:1,B2:1,B3:1,B4:1,B5:1,B6:1};
W._tdy.rows=rows.concat([
  {id:'X1',date:'2026-04-02',time:'19:00',coach:'',st:'checked_in',pend:false,tk:'TK-A',lock:null},
  {id:'X2',date:'2026-04-09',time:'19:00',coach:'',st:'checked_in',pend:false,tk:'TK-A',lock:null},
  {id:'X3',date:'2026-04-16',time:'19:00',coach:'',st:'checked_in',pend:false,tk:'TK-A',lock:null}]);
W._tdy.sel.X1=1; W._tdy.sel.X2=1; W._tdy.sel.X3=1;
tkTidyPaint();
ok('★★ 勾超過總堂數：餘額畫成負數紅字並寫出要退掉幾堂',
   /ovd-neg/.test(S()) && /-1 堂/.test(S()) && /多出來的那 1 堂請取消勾選/.test(S()));

console.log('\n護欄（原始碼）');
const OPEN=grab('async function tkTidyOpen(tkId){');
const DO=grab('async function _tkTidyDo(){');
ok('★★ 管理員限定（開窗與寫入兩邊都擋）',
   /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以校正票券'\)/.test(OPEN)
   && /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以校正票券'\)/.test(DO));
ok('★★ 團課排除在候選之外（團課的帳在 ticket_logs）', /if\(bkIsGroup\(b\)\)\{[^}]*return false; \}/.test(OPEN));
ok('★★ 取消的預約不列', /if\(!b \|\| b\.status==='cancelled'\) return false;/.test(OPEN));
ok('★ 已掛在這張票上的一律列出（才拿得掉）',
   /const onMe=String\(b\.ticket_id\|\|''\)===String\(tkId\);/.test(OPEN)
   && /return onMe \|\| \(cat && b\.category===cat\);/.test(OPEN));
ok('★★ 扣課紀錄只認 deduct−refund 的淨值（adjust 不算）',
   /const d=l\.action==='deduct'\?1:\(l\.action==='refund'\?-1:0\); if\(!d\) return;/.test(OPEN));
ok('★★ 留痕用 adjust／delta 0，不可以用 deduct（那是票券夾認的連結）',
   /logTicket\(S\.tkId,'adjust',0,b\.id,/.test(DO) && !/logTicket\(S\.tkId,'deduct'/.test(DO));
ok('　　為什麼不能用 deduct 寫在原地', /票券夾的「連結」認的是 deduct\+delta 0/.test(DO));
ok('★★ 餘額重算＝總堂數 − 勾選數，且寫進票券紀錄',
   /const n=Object\.keys\(S\.sel\)\.length, rem=S\.total-n;/.test(DO)
   && /t\.sessions_remaining=rem;/.test(DO)
   && /logTicket\(S\.tkId,'adjust',rem-was,null,/.test(DO));
ok('★★ 餘額回來了狀態要跟著翻（0810 踩過：餘額 >0 卻掛 used_up 就沒有轉正）',
   /if\(rem>0 && t\.status==='used_up'\) t\.status='usable';/.test(DO)
   && /if\(rem===0 && t\.status==='usable'\) t\.status='used_up';/.test(DO));
ok('★ 退費／作廢／過期的狀態不碰', /退費、作廢、過期的狀態不碰/.test(DO));
ok('★★ 餘額負數要在寫入前擋下來', /if\(rem<0\)\{ showToast\('勾選堂數超過總堂數'\); return; \}/.test(DO));
ok('★★ 寫完要清快取（bookings／member_tickets／ticket_logs 三張都動到了）',
   /dbCacheClear\(\['bookings','member_tickets','ticket_logs'\]\)/.test(DO));
ok('★ 防連點（同一張票只跑一次）', /onceAct\('tktidy:'\+S\.tkId/.test(src));

const CFM=src.slice(src.indexOf('function tkTidyConfirm(){'), src.indexOf('function tkTidyBack(){'));
ok('★ 動之前先跳確認（不是點一下就寫）', /onclick="tkTidyConfirm\(\)"/.test(OPEN) && /onclick="tkTidyDo\(\)"/.test(CFM));
ok('★★ 確認頁要列出「哪幾張票會少掉戳記」，並講明它們的餘額不會自己改',
   /這幾張票會少掉戳記/.test(CFM) && /票面餘額不會自動跟著改/.test(CFM));
ok('★ 確認頁講清楚不會取消預約、不通知會員、不動收款',
   /不會取消任何預約、不會通知會員、也不會動到收款與發票/.test(CFM));
ok('★ 返回會留住剛剛勾的（重開視窗會被資料庫洗掉）',
   /onclick="tkTidyBack\(\)"/.test(CFM) && /重開視窗會從資料庫重讀、把勾選洗掉/.test(src));

console.log('\n入口');
ok('★★ 持有中的票卡有「校正」（管理員限定）',
   /\$\{\(SESSION&&SESSION\.role==='admin'\)\?`<button class="btn btn-ghost btn-sm" style="padding:2px 10px;font-size:11px;" title="這張票蓋了哪幾堂[^"]*" onclick="tkTidyOpen\('\$\{t\.id\}'\)">校正<\/button>`:''\}/.test(src));
ok('★★ 已過期／歷史紀錄的票也要有（黃喬莉那三張全在這一區）',
   /pp-hist-btn" onclick="event\.stopPropagation\(\);tkTidyOpen\('\$\{t\.id\}'\)/.test(src));
ok('★ 案例寫在原地', /黃喬莉/.test(src) && /就不用每次都要找你修改/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
