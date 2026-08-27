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
const mk=new Function('window','document','escH','parseYmd','TK_AUDIT_SINCE','ashDateField',
  [grab('function tkTidyPaint(){'), grab('function tkTidyTap(bid){'),
   grab('function tkTidyUsedN(){'), grab('function tkTidyRemAuto(){'), grab('function tkTidyRemNow(){'),
   grab('function tkTidyRemMode(mode){'), grab('function tkTidyManual(){'),
   grab('function tkTidyMu(i, v){'), grab('function tkTidyMuClear(i){'),
   grab('function tkTidyCheck(){')].join('\n')
  +'\nreturn {tkTidyPaint,tkTidyTap,tkTidyRemNow,tkTidyRemMode,tkTidyManual,tkTidyMu,tkTidyMuClear,tkTidyCheck};');
const {tkTidyPaint,tkTidyTap,tkTidyRemNow,tkTidyRemMode,tkTidyManual,tkTidyMu,tkTidyMuClear,tkTidyCheck}
  =mk(W,doc,escH,parseYmd,'2026-07-30',
      (id,v)=>`<button class="adp-field" id="${id}-btn">${v||'選擇日期'}</button>`);

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
  grpN:2, total:8, rem0:0, ttid:'tt-1v2', name:'私人教練課 1V2', mname:'黃喬莉',
  remMode:'auto', remManual:null, remWhy:'', auditable:true,
  mu:[], mu0:'', muN:-1, dots:'' };
  ['tdy-list','tdy-sum','tdy-rembar','tdy-remnote','tdy-manual','tdy-mubox']
    .forEach(k=>{ boxes[k]={innerHTML:'',style:{display:''}}; }); };

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
/* 2026-08-26 使用者問「為什麼『已上』的可以點、7/30 又不能點，差別在哪裡」——
   差別是有沒有扣課紀錄，不是已上／未上。原本只寫在右邊副標，掃一排看不出來。 */
ok('★★ 鎖住的原因拉到日期旁邊（一排掃下來看得出差別）',
   /<span class="tdy-lockchip">已扣課・不能在這裡搬<\/span>/.test(L())
   && /<span class="tdy-lockchip">已扣課・拿不掉<\/span>/.test(L()));
ok('★★ 有扣課紀錄、扣在這張票的也鎖住（拿不掉）',
   /這一堂有扣課紀錄，拿不掉/.test(L()) && !/tkTidyTap\('B5'\)/.test(L()));
ok('★ 日期帶星期（01/17（六））', /01\/17（六）/.test(L()));
ok('★ 結算列寫出佔堂數與「現在 → 之後」', /佔堂數[\s\S]*?2 \/ 8/.test(S()) && /票面餘額[\s\S]*?0 → 6 堂/.test(S()));

/* 2026-08-26 使用者：「票面餘額 -2？」——林韋綺 #16 掛著 10 堂，其中兩堂是教練請假
   （扣了又退、帳本淨值 0）。一律算進去就變成 10/8、餘額 −2，還沒動就先嚇人。
   勾選＝歸屬；佔堂數＝歸屬**而且**帳上真的扣著。 */
(()=>{
  fresh();
  W._tdy.rows=W._tdy.rows.concat([
    {id:'F1',date:'2026-08-20',time:'19:30',coach:'',st:'checked_in',pend:false,tk:'TK-C',lock:null,freed:true,lv:true},
    {id:'F2',date:'2026-08-23',time:'12:00',coach:'',st:'checked_in',pend:false,tk:'TK-C',lock:null,freed:true,lv:true}]);
  W._tdy.sel.F1=1; W._tdy.sel.F2=1; W._tdy.orig.F1=1; W._tdy.orig.F2=1; W._tdy.muN=-1;
  tkTidyPaint();
  ok('★★ 已退回的（教練請假）不算佔堂數：勾了 4 筆但只有 2 筆佔堂',
     /佔堂數[\s\S]*?2 \/ 8/.test(S()) && /另有 2 堂已退回，不佔堂數/.test(S()));
  ok('★★ 餘額因此不會變成負數（8 − 2 = 6，不是 8 − 4 = 4）',
     /票面餘額[\s\S]*?0 → 6 堂/.test(S()));
  ok('★ 清單上標得出來是哪一種', /教練請假已退回/.test(L()));
})();
ok('★ 團課沒列出來要講一句（不是靜靜消失）', /另有 2 堂團課沒有列出來/.test(S()));

console.log('\n勾選與算術');
fresh(); tkTidyPaint();
['B1','B2','B3'].forEach(id=>tkTidyTap(id));
ok('★★ 補上七堂中的三堂 → 佔 5 堂、餘額 3',
   /5 \/ 8/.test(S()) && /票面餘額[\s\S]*?0 → 3 堂/.test(S()));
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

console.log('\n餘額三選一（併進來的舊「校正堂數」）');
const BAR=()=>boxes['tdy-rembar'].innerHTML, NOTE=()=>boxes['tdy-remnote'].innerHTML;
fresh(); tkTidyPaint();
ok('★ 三顆都畫出來，數字在上面（依戳記重算／維持原本／自己填）',
   /依戳記重算/.test(BAR()) && /維持原本/.test(BAR()) && /自己填/.test(BAR())
   && /<b>6<\/b><i>依戳記重算<\/i>/.test(BAR()) && /<b>0<\/b><i>維持原本<\/i>/.test(BAR()));
ok('★ 帳目可信的票預設選「依戳記重算」',
   /tdy-chip on"\s*\n?\s*onclick="tkTidyRemMode\('auto'\)/.test(BAR()) && tkTidyRemNow()===6);
ok('★ 結算列寫「現在 → 之後」', /0 → 6 堂/.test(S()));
tkTidyRemMode('keep');
ok('★★ 按「維持原本」→ 餘額回到原本的 0（舊匯入票就靠這顆）',
   tkTidyRemNow()===0 && /tdy-chip on"\s*\n?\s*onclick="tkTidyRemMode\('keep'\)/.test(BAR()));
tkTidyRemMode('manual');
ok('★★ 按「自己填」會帶出手填欄（預設帶自動算的數字）',
   W._tdy.remMode==='manual' && W._tdy.remManual===6 && boxes['tdy-manual'].style.display==='');
boxes['tdy-remn']={value:'3'}; tkTidyManual();
ok('★ 手填 3 → 餘額 3', tkTidyRemNow()===3 && /0 → 3 堂/.test(S()));

/* 舊票：預設不能是「依戳記重算」，否則黃喬莉 2025/09/15 那張 8 堂 2 戳記會憑空多 6 堂 */
fresh(); W._tdy.auditable=false; W._tdy.remMode='keep'; tkTidyPaint();
ok('★★ 舊票（對帳基準日之前）預設「維持原本」，並寫出為什麼',
   tkTidyRemNow()===0
   && /tdy-chip on"\s*\n?\s*onclick="tkTidyRemMode\('keep'\)/.test(BAR())
   && /那時候上過的課沒有全部進系統/.test(NOTE()) && /2026\/07\/30/.test(NOTE()));
fresh(); tkTidyPaint();
ok('　　帳目可信的票就直說紀錄是完整的', /扣課紀錄是完整的/.test(NOTE()));

console.log('\n補登使用日期（沒有課卡的格子）');
const MU=()=>boxes['tdy-mubox'].innerHTML;
/* 舊系統匯入只做到 2025-12-01，在那之前上過的課全庫有 9,034 格根本沒有 bookings。
   「勾選哪一堂」對它們無效 —— 只能手動把日期寫上去。 */
fresh(); W._tdy.rem0=6; W._tdy.sel={}; W._tdy.orig={}; W._tdy.remMode='keep'; W._tdy.muN=-1;
tkTidyPaint();
ok('★★ 帳面已用 2 堂、一堂課卡都沒綁 → 開出 2 格補登欄',
   /補登使用日期（2 格沒有課卡）/.test(MU())
   && (MU().match(/id="tdy-mu-\d-btn"/g)||[]).length===2);
/* 2026-08-25 使用者指示：「這邊要用我們自己設計的日期」——
   原本是 input[type=date]（瀏覽器原生日曆，每台裝置長得都不一樣、iOS 沒有確定鈕）。 */
ok('★★ 用系統自己的日期挑選（ashDateField），不是瀏覽器原生的',
   !/type="date"/.test(MU()) && /class="adp-field"/.test(MU())
   && /ashDateField\('tdy-mu-'\+i, S\.mu\[i\]\|\|'', '', `tkTidyMu\(\$\{i\},this\.value\)`\)/.test(src));
ok('★ 講明是純標示，不會變成預約／不進統計',
   /不會建立預約、不進銷課金額、也不算教練堂數/.test(MU()));
tkTidyMu(0,'2025-10-03'); tkTidyMu(1,'2025-10-10');
ok('★★ 填了日期就算有更動，送得出去', tkTidyCheck().ok===true
   && tkTidyCheck().mu.join(',')==='2025-10-03,2025-10-10' && tkTidyCheck().muChanged===true);
ok('★ 日期格式擋得住', (tkTidyMu(1,'10/10'), !tkTidyCheck().ok && /格式不對/.test(tkTidyCheck().msg)));
tkTidyMu(1,'2025-10-10');
ok('★★ 滾輪一定會回一個日期，所以要另外給「✕ 清掉」才留得了白',
   /class="tdy-mu-x"[^>]*onclick="tkTidyMuClear\(\$\{i\}\)"/.test(src)
   && (tkTidyMuClear(1), W._tdy.mu[1]==='' && tkTidyCheck().mu.join(',')==='2025-10-03'));
tkTidyMu(1,'2025-10-10');
/* 勾了課＝那一格有課卡了，補登欄要跟著少 */
tkTidyTap('B1');
ok('★★ 勾一堂課回來 → 補登欄少一格（有課卡的不用手填）',
   /補登使用日期（1 格沒有課卡）/.test(MU())
   && (MU().match(/id="tdy-mu-\d-btn"/g)||[]).length===1);
ok('　　只取還需要的那幾格，多打的不會被寫進去', tkTidyCheck().mu.join(',')==='2025-10-03');
/* 已經有補登日期、又原封不動送出 → 不算更動 */
fresh(); W._tdy.rem0=6; W._tdy.sel={}; W._tdy.orig={}; W._tdy.remMode='keep'; W._tdy.muN=-1;
W._tdy.mu=['2025-10-03','2025-10-10']; W._tdy.mu0='2025-10-03,2025-10-10';
tkTidyPaint();
ok('★ 沒改就是沒改（不會寫一筆看不出改了什麼的紀錄）',
   !tkTidyCheck().ok && tkTidyCheck().msg==='沒有任何更動');
ok('★ 清空也算更動（可以改回沒有日期）',
   (tkTidyMu(0,''), tkTidyMu(1,''), tkTidyCheck().ok===true && tkTidyCheck().mu.length===0));
/* 沒有 ghost 的票（戳記補齊了）就不該出現這一區 */
fresh(); tkTidyPaint();
ok('★ 戳記補得齊的票不出現補登區（餘額 6＋勾 2＝總 8）', MU()==='');

/* 2026-08-25 二修：日期挑選從滾輪改回月曆（使用者：「用月曆選擇比較直覺」）——
   翻年鈕沒有上下限，補登 2024 年的課也選得到。 */
ok('★ 補登可以選到舊系統時代的日期（月曆的翻年鈕沒有上下限）',
   /onclick="ashDateMove\(-12\)"/.test(src) && !/for\(let y=y0-3;y<=y0\+2;y\+\+\)/.test(src));

console.log('\n送出把關 tkTidyCheck');
fresh();
ok('★ 什麼都沒改就擋（餘額也一樣）',
   (W._tdy.remMode='keep', !tkTidyCheck().ok && tkTidyCheck().msg==='沒有任何更動'));
fresh(); W._tdy.remMode='auto';
ok('★★ 只改餘額、沒改歸屬也能送（這就是舊「校正堂數」的用法）', tkTidyCheck().ok===true);
fresh(); W._tdy.remMode='manual'; W._tdy.remManual=3; W._tdy.remWhy='';
ok('★★ 自己填一定要寫原因', !tkTidyCheck().ok && tkTidyCheck().msg==='自己填餘額要寫原因');
W._tdy.remWhy='舊系統匯入，2025 年的課沒進系統';
ok('　　寫了就放行，原因帶得出去', tkTidyCheck().ok===true && tkTidyCheck().why.indexOf('舊系統匯入')===0);
fresh(); W._tdy.remMode='manual'; W._tdy.remManual=99; W._tdy.remWhy='x';
ok('★ 只收 0–總堂數的整數', !tkTidyCheck().ok && /0–8 的整數/.test(tkTidyCheck().msg));
fresh(); W._tdy.remMode='manual'; W._tdy.remManual=null; W._tdy.remWhy='x';
ok('　　空白也擋（NaN 不能寫進資料庫）', !tkTidyCheck().ok);
fresh(); ['B1','B2','B3'].forEach(id=>tkTidyTap(id));
W._tdy.rows=W._tdy.rows.concat([{id:'Y1',date:'2026-05-01',time:'19:00',coach:'',st:'checked_in',pend:false,tk:null,lock:null},
  {id:'Y2',date:'2026-05-08',time:'19:00',coach:'',st:'checked_in',pend:false,tk:null,lock:null},
  {id:'Y3',date:'2026-05-15',time:'19:00',coach:'',st:'checked_in',pend:false,tk:null,lock:null},
  {id:'Y4',date:'2026-05-22',time:'19:00',coach:'',st:'checked_in',pend:false,tk:null,lock:null}]);
['Y1','Y2','Y3','Y4'].forEach(id=>tkTidyTap(id));
ok('★★ 勾超過總堂數：不管餘額選哪一種都擋', !tkTidyCheck().ok && /超過總堂數 8/.test(tkTidyCheck().msg));

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
ok('★★ 確認頁與寫入用同一支把關（不會只擋前面那一關）',
   /const C=tkTidyCheck\(\);\s*\n\s*if\(!C\.ok\)\{ showToast\(C\.msg\); return; \}/.test(DO)
   && /const C=tkTidyCheck\(\);\s*\n\s*if\(!C\.ok\)\{ showToast\(C\.msg\); return; \}/.test(src.slice(src.indexOf('function tkTidyConfirm(){'))));
ok('★★ 餘額與票券紀錄成對寫入，紀錄要寫得出用的是哪一種口徑',
   /t\.sessions_remaining=rem;/.test(DO)
   && /logTicket\(S\.tkId,'adjust',rem-was,null,/.test(DO)
   && /票券校正：餘額 \$\{was\} → \$\{rem\}（\$\{_how\}）/.test(DO));
ok('★★ 餘額回來了狀態要跟著翻（0810 踩過：餘額 >0 卻掛 used_up 就沒有轉正）',
   /if\(rem>0 && t\.status==='used_up'\) t\.status='usable';/.test(DO)
   && /if\(rem===0 && t\.status==='usable'\) t\.status='used_up';/.test(DO));
ok('★ 退費／作廢／過期的狀態不碰', /退費、作廢、過期的狀態不碰/.test(DO));
ok('★★ 舊票預設不吃「依戳記重算」（戳記補不齊，會憑空多給堂數）',
   /remMode:_auditable\?'auto':'keep'/.test(OPEN)
   && /tkLedgerAuditable/.test(OPEN)
   && /照戳記重算會憑空多給她 6 堂/.test(src));
ok('★ 舊票卻硬選「依戳記重算」時，確認頁要紅字再問一次',
   /\(!S\.auditable&&S\.remMode==='auto'\)\?`<br><b style="color:var\(--danger/.test(src));
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

console.log('\n圓形卡與寫入（原始碼）');
ok('★★ 圓形卡畫在視窗最上面當定位（使用者：「直接在該方案圓形卡下方顯示」）',
   /const _sl=_W\.of\(tkId\)\|\|\{stamps:\[\],used:0\};/.test(OPEN)
   && /_dots=ticketTokens\(t, _sl\.stamps, _W\.typeMap\|\|\{\}, _sl\.used, null, mid, _W\.selfBk\);/.test(OPEN)
   && /\$\{S\.dots\?`<div class="tdy-dots">/.test(src));
ok('★★ 補登日期存在 member_tickets.manual_uses，空了就寫回 null',
   /t\.manual_uses=mu\.length\?mu:null;/.test(DO));
ok('★★ 只改補登日期（餘額沒變）時也要存回去',
   /else if\(C\.muChanged\) await dbPut\('member_tickets',t\);/.test(DO));
ok('★ 補登要留痕（寫得出補了哪些日期）',
   /票券校正：補登使用日期 \$\{mu\.join\('、'\)\}（無課卡，僅圓形卡標示）/.test(DO)
   && /票券校正：清掉補登的使用日期/.test(DO));

console.log('\n圓形卡吃補登日期（ticketTokens）');
const TT=grab('function ticketTokens(t,bks,typeMap,usedCount,curId,memberId,selfSet,seatN,opts){');
ok('★★ 沒有課卡的格子（_ghost）依序吃 manual_uses 的日期',
   /const _mu=Array\.isArray\(t\.manual_uses\)\?t\.manual_uses\.filter\(Boolean\)\.slice\(\)\.sort\(\):\[\];/.test(TT)
   && /const _it=\(gi<_ghost\) \? \{b:null,st:'used',g:gi\+\+\}/.test(TT)
   && /const _md=\(!b && _it\.g!=null\) \? \(_mu\[_it\.g\]\|\|''\) : '';/.test(TT));
ok('★ 沒補的還是畫 ✓（不能因為多了這個功能就變空白）',
   /\$\{_shBody\(b, b\?md\(b\):\(_md\?md\(\{date:_md\}\):'✓'\)\)\}/.test(TT)
   /* _shBody 沒有共享時原封不動回傳（2026-08-27） */
   && /: dt;/.test(TT));
ok('★ 補登的格子看得出來（細虛線＋title 寫明沒有課卡）',
   /mtk-manual/.test(TT) && /舊系統補登（沒有對應課卡）/.test(TT)
   && /\.mtk\.mtk-manual\{outline:1px dashed/.test(src));

console.log('\n入口');
ok('★★ 持有中的票卡有「校正」（管理員限定）',
   /\$\{\(SESSION&&SESSION\.role==='admin'\)\?`<button class="btn btn-ghost btn-sm" style="padding:2px 10px;font-size:11px;" title="這張票蓋了哪幾堂[^"]*" onclick="tkTidyOpen\('\$\{t\.id\}'\)">校正<\/button>`:''\}/.test(src));
ok('★★ 已過期／歷史紀錄的票也要有（黃喬莉那三張全在這一區）',
   /pp-hist-btn" onclick="event\.stopPropagation\(\);tkTidyOpen\('\$\{t\.id\}'\)/.test(src));
ok('★ 案例寫在原地', /黃喬莉/.test(src) && /就不用每次都要找你修改/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
