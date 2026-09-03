/* 團課一人多名額：三格不能全扣到同一張票（2026-08-29 使用者附截圖）

   「這三個會員卡是同一張票券吧?」
   「我要的團體課預約方式是　會員A買了三份團課優惠4堂　使用人給媽媽跟姐姐
     我在預約團課的時候選擇媽媽這張或姐姐這張　該票券就要能辨別並預約」

   正式庫的事實（許佳慈 9/4 20:00，BK-mtb6140efwvy）：
     seat_tickets 三格全是 TK-mte3pejgah8w，
     ticket_logs 只有 1 筆 deduct ＋ 2 筆「⚠ 已阻擋：這一堂在這張票上已經扣過 1 堂」。
   → 兩個名額站在名單上、沒有付錢。她手上明明有媽媽 / 姊姊 / … 好幾張。

   成因鏈：
     ① 那天稍早取消過同一堂 → rebookSameDayTicket 對三格都回同一張（它不知道有幾格）
     ② 挑完票直接 deductTicket，第 2、3 格撞上「同一堂同一張票不重複扣」的護欄
     ③ 護欄回 true（「這一堂確實掛在這張票上」）→ 名額照樣寫進名單

   ⚠ 但「一張票扣多格」本身合法：0827 許佳慈 4 個名額扣同一張 4 堂票就是這樣，
     建立團課那條路一直帶 multi:true。所以修法不是禁止重複，是
     「優先給每格一張沒用過的票；真的只剩同一張才重複，而且要明講 multi」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 挑票四段的順序與「已被這堂用掉」的排除');
{
  ok('★★ _used 由既有名額的 seat_tickets 起算（後來才加的第 3 格不會撿回前兩格的票）',
     /const _used=new Set\(Object\.values\(b\.seat_tickets\|\|\{\}\)\.map\(String\)\);/.test(src)
     && /const _free=arr=>\(arr\|\|\[\]\)\.filter\(t=>t && !_used\.has\(String\(t\.id\)\)\);/.test(src));
  ok('★★ 櫃檯自己指定的那一張不受排除（指定就是指定）',
     /const want=grpPickOf\(mid,_i\);\s*\n\s*if\(want\)\{\s*\n\s*const cand=await listUsableTickets\(mid,b\.ticket_type_id,b\.date,b\.start_time\);\s*\n\s*tk=cand\.find\(t=>t\.id===want\)\|\|null;/.test(src));
  ok('★★ 重約回原票的結果要先過 _used（許佳慈 9/4 就是死在這裡）',
     /if\(!tk\)\{ const _rb=await rebookSameDayTicket\(mid,b\);\s*\n\s*if\(_rb && !_used\.has\(String\(_rb\.id\)\)\) tk=_rb; \}/.test(src));
  ok('★★ 自動挑票只從沒用過的裡面挑，待確認的排最後',
     /const _fc=_free\(await listUsableTickets\(mid,b\.ticket_type_id,b\.date,b\.start_time\)\);\s*\n\s*tk=_fc\.find\(t=>!tkNeedsConfirm\(t\)\) \|\| _fc\[0\] \|\| null;/.test(src));
  ok('★★ 全部都用過了才回頭重複用同一張（一張票扣多格是合法的）',
     /真的沒有別張了 → 回頭用已經扣過的那張/.test(src)
     && src.indexOf('tk=_fc.find(t=>!tkNeedsConfirm(t))')
        < src.indexOf('if(!tk) tk=await findUsableTicket(mid,b.ticket_type_id,b.date,b.start_time);'));
  ok('★★ 成因與使用者原話寫在原地（下一個人不要把 _used 當成多餘的）',
     /這三個會員卡是同一張票券嗎|這三個會員卡是同一張票券/.test(src)
     || /三個名額全指到 TK-mte3pejgah8w/.test(src));
}

console.log('\n② 重複用同一張時一定要帶 multi:true，否則名額會白站在名單上');
{
  ok('★★ 只有「這張已經被這堂用過」才帶 multi',
     /const _ded = tk \? await deductTicket\(tk,b\.id,SESSION\.id,\s*\n\s*_used\.has\(String\(tk\.id\)\)\?\{multi:true\}:undefined\) : false;/.test(src));
  ok('★★ 扣成功才記進 _used（沒扣到的不能佔住那張票）',
     /if\(_ded\) _used\.add\(String\(tk\.id\)\);/.test(src));
  ok('★★ 護欄本身沒被拆掉 —— 沒帶 multi 時仍會擋重複扣',
     /const _multi=!!\(opts&&opts\.multi\);\s*\n\s*if\(!_multi && booking_id && ticket && ticket\.id\)\{/.test(src)
     && /⚠ 已阻擋：這一堂在這張票上已經扣過 /.test(src));
  ok('★★ 扣不到票的名額仍然不寫進名單（0820 取消教練招待那條沒被動到）',
     /if\(!_ded\)\{ \(_noTk\[mid\]=\(_noTk\[mid\]\|\|0\)\+1\); _failed\.add\(String\(mid\)\); continue; \}/.test(src));
}

/* ── 實跑挑票那一段：把 _used／_free 的行為驗出來 ───────────────── */
console.log('\n③ 實跑：三格三張票各自對上，票不夠時才共用');
{
  /* 只重建挑票邏輯的骨架（與上面斷言的原始碼逐行對應），驗的是「配對結果」 */
  const pick=(tickets, seats, seeded)=>{
    const used=new Set(seeded||[]);
    const free=()=>tickets.filter(t=>!used.has(t.id));
    const out=[];
    for(let i=0;i<seats;i++){
      const fc=free();
      const tk=fc.find(t=>!t.needConfirm)||fc[0]||tickets[0]||null;
      out.push(tk?{id:tk.id, fam:tk.fam||null, multi:used.has(tk.id)}:null);
      if(tk) used.add(tk.id);
    }
    return out;
  };
  const T=[{id:'T1',fam:'媽媽'},{id:'T2',fam:'姊姊'},{id:'T3',fam:null}];
  eq('★★ 三格三張 → 各自一張（媽媽 / 姊姊 / 本人），沒有一格是 multi',
     pick(T,3).map(x=>[x.id,x.fam,x.multi]),
     [['T1','媽媽',false],['T2','姊姊',false],['T3',null,false]]);
  eq('★★ 只有一張票、三格 → 三格共用，第 2、3 格明講 multi（0827 許佳慈 4 名額同票）',
     pick([{id:'T1',fam:null}],3).map(x=>[x.id,x.multi]),
     [['T1',false],['T1',true],['T1',true]]);
  eq('★★ 已經有一格用了 T1（seat_tickets 帶進來）→ 新增的那格改用 T2',
     pick(T,1,['T1']).map(x=>x.id), ['T2']);
  eq('★★ 待確認的票排最後（有別張就先用別張）',
     pick([{id:'TC',needConfirm:true},{id:'T9'}],1).map(x=>x.id), ['T9']);
}

console.log('\n③e 建立團課那條路也一樣（2026-08-29 定案：「一個人購買票券　分享給家庭成員　都要分開來看」）');
{
  /* 第六處。這一條走 bkAddMemberDo 的逐週迴圈，本來就帶 multi:true
     （一張票扣多格是合法的），所以三個名額全扣同一張時連「已阻擋」都不會留下 ——
     媽媽與姊姊的票原封不動、本人那張一次少三堂，帳面上還是「扣了三堂」，
     只有翻 ticket_logs 才看得出來。 */
  ok('★★★ 建立團課時也先挑「這一堂還沒用過的票」',
     /const _wUsed=new Set\(\);   \/\/ 這一堂已經被某個名額用掉的票/.test(src)
     && /const _f=\(_c\|\|\[\]\)\.filter\(t=>t && !_wUsed\.has\(String\(t\.id\)\)\);/.test(src)
     && /tk=_f\.find\(t=>!tkNeedsConfirm\(t\)\) \|\| _f\[0\] \|\| null;/.test(src));
  ok('★★ 扣成功才記進 _wUsed', /_wUsed\.add\(String\(tk\.id\)\);/.test(src));
  ok('★★ 櫃檯指定的那一張仍然優先（指定就是指定）',
     /const want=grpPickOf\(mid,_i\);\s*\n\s*if\(want\)\{ const cand=await listUsableTickets\(mid,type_id,dW,tW\); tk=cand\.find\(x=>x\.id===want\)\|\|null; \}/.test(src));
  ok('★★ 真的只剩同一張時照舊重複扣（multi:true 沒被拿掉）',
     /if\(tk && await deductTicket\(tk,bk\.id,SESSION\.id,\{multi:true\}\)\)\{ charged\+\+;/.test(src));
}

console.log('\n④ 名單視窗：一位使用人一列，挑票用圓形卡');
{
  ok('★★ 依票券使用人拆列（許佳慈（媽媽）／許佳慈（姊姊））',
     /const _groupsOf=m=>\{/.test(src)
     && /r\.fam\?`<span class="grp-fam">（\$\{String\(r\.fam\)\.replace\(\/<\/g,'&lt;'\)\}）<\/span>`:''/.test(src));
  ok('★★ 分母也跟著拆 —— 不然「許佳慈（姊姊）」底下會寫著全部 21 堂',
     /const gLeft=tks\.reduce\(\(a,t\)=>a\+Math\.max\(0,Number\(t\.left\)\|\|0\),0\);/.test(src)
     && /const tag=tks\.length\?`可用 \$\{gLeft\} \/ \$\{gTot\|\|gLeft\} 堂`:/.test(src));
  /* 2026-08-29 定案（使用者：「改成跟教練課一樣　搜尋姓名　然後選該會員就好」
     「列表呈現　左邊是會員姓名　右邊是還可預約票券/總票券」）——
     列裡攤開圓形卡挑票那一版退場：挑票已經被「一列一位使用人」解決掉了。 */
  ok('★★ 名單列＝左名右堂數，列裡不再攤開圓形卡',
     /<button type="button" class="ms-item grp-item grp-2c\$\{on\?' grp-on':''\}"/.test(src)
     && /<span class="grp-rem" style="color:\$\{gLeft>0\?'var\(--green\)':'var\(--t3\)'\};">\$\{tag\}<\/span>/.test(src)
     && !/class="grp-tk-sel"/.test(src)
     && !/function grpSeatPick\(/.test(src));
  ok('★★ 姓名或手機都能搜（與教練課那份同一套）',
     /\|\| \(_nq && String\(m\.phone\|\|''\)\.replace\(\/\[\^0-9\]\/g,''\)\.includes\(_nq\)\)/.test(src)
     && (src.match(/placeholder="搜尋姓名或手機…" oninput="renderGrpPick\(\)"/g)||[]).length===2);
  ok('★★ 圓形卡沒有整組刪掉 —— 課卡上的「其他方案 ›」還在用（.gtk-card）',
     /<button type="button" class="gtk-card"\s*\n\s*onclick="event\.stopPropagation\(\);ashSwapGo/.test(src)
     && /\.gtk-dot\.gtk-used\{background:#1F6F54;border-color:#1F6F54;\}/.test(src));
  ok('★★ 加減名額改走 row 版，_grpTkPick 會跟著 splice（索引不能位移）',
     /function grpSeatDel\(mid, seatIdx\)\{/.test(src)
     && /a\.splice\(seatIdx,1\); p\[mid\]=a;/.test(src)
     && /function grpRowTap\(i\)\{/.test(src));
  ok('★★ 舊的三支退場，不留第二條路',
     !/function toggleGrpMember\(/.test(src) && !/function grpAddOne\(/.test(src)
     && !/function grpRemoveOne\(/.test(src)
     && /toggleGrpMember／grpAddOne／grpRemoveOne 已於 2026-08-29 退場/.test(src));
  ok('★ ＋ 會優先給這位使用人還沒用到的那張（媽媽有兩張時第二格用第二張）',
     /const next=r\.tkIds\.find\(id=>used\.indexOf\(id\)<0\) \|\| r\.tkIds\[0\] \|\| null;/.test(src));
  /* 2026-09-03 使用者指示：「有些視窗會有很多文字的規則　幫我整理段落　減少閱讀壓力」——
     這兩張視窗的說明原本各是一整段，改成一條一行（.rulelist）。規則本身沒有改。 */
  ok('★★ 說明文字跟著改（拆列、圓形卡挑票、沒票不列）—— 畫面改了字沒改最容易誤導',
     (src.match(/<li>只列<b>有團體課票券<\/b>的會員；沒票的請先儲值<\/li>/g)||[]).length===2
     && (src.match(/票券設了使用人會<b>分開一列<\/b>（例：許佳慈（媽媽）、許佳慈（姊姊））/g)||[]).length===2
     && /點下面的圓形卡選要扣哪一張/.test(src)
     && !/帶親友同行可按已選會員的「＋」重複報名/.test(src));
  ok('★★ 兩張名單視窗同一套風格（2026-08-29：「這個團體課名單的視窗　是不是舊視窗?」）',
     /<div class="ash-sheetmk"><\/div><div class="modal-title">\$\{addMode\?'加入會員':'團體課名單'\}<\/div>/.test(src)
     && /<div class="ash-sheetmk"><\/div><div class="modal-title">新增團體課 · 步驟 2 \/ 2<\/div>/.test(src));
  /* 2026-08-29 使用者：「因為是新增　所以不用把其他正在上這堂課的會員也列出來
     只要出現一個搜尋視窗就好」—— 同一支視窗兩種用途，資料與存檔完全共用。 */
  /* 2026-08-29 三修（使用者：「為什麼又出線已經在名單上的兩個會員」「給我單純一點的
     頁面　搜尋只要出現有票券的會員名單　不要出現已經在課堂內的名單」）——
     第一版只在沒打字時收起來、搜尋放行，結果搜尋出來的兩列都是已在名單的、還打著勾。
     改成一律不列。 */
  ok('★★★ ［＋新增］一律不列已經在這堂的使用人（搜尋也一樣）',
     /if\(_addMode\)\{\s*\n\s*const _pk=window\._grpPick\|\|\{\};/.test(src)
     && /if\(_taken\[String\(r\.m\.id\)\+'\|'\+String\(r\.fam\|\|''\)\] && !isPicked\) ROWS\.splice\(i,1\);/.test(src));
  /* 2026-08-29 二修（使用者：「但是我在28單獨搜媽媽也找不到」）——
     9/28 打「許」整份清單是空的：那一格用的是本人那張（已扣到 0 堂），
     0 堂的票不在候選清單裡，「名額 i 用第 i 張票」的推算就退回候選清單的第 i 張
     ＝媽媽那張，於是媽媽被判成「已經在名單上」整列藏掉。 */
  ok('★★★ 「已經在這堂」直接從課卡記的票反查使用人，不用候選清單推',
     /window\._grpTaken=\(function\(\)\{/.test(src)
     && /out\[String\(seatMid\(k\)\)\+'\|'\+String\(t\.family_user\|\|''\)\]=1;/.test(src)
     && /不要用 r\.seats 判斷 —— 那是從候選清單推回去的，用完的票不在清單裡就會推錯人。/.test(src));
  ok('★★ 查不到票的名額不列進來（寧可多列一位，也不要把人藏掉）',
     /const t=tid\?map\[tid\]:null; if\(!t\) return;/.test(src)
     && /寧可多列一位，也不要把人藏掉。/.test(src));
  ok('★★★ 濾的單位是「列」＝一位使用人，不是「會員」（不然補不了第三格）',
     /濾的單位是「列」＝一位使用人，不是「會員」：許佳慈已用媽媽與姊姊各一格時，/.test(src)
     && /用會員濾會把整個人藏掉，就補不了第三格。/.test(src));
  ok('★★ 這一輪剛點選的那一列一定留著（按下去立刻消失會以為沒加到）',
     /window\._grpPick=\{mid:r\.mid, fam:r\.fam\};/.test(src)
     && /const isPicked=\(String\(_pk\.mid\|\|''\)===String\(r\.m\.id\) && String\(_pk\.fam\|\|''\)===String\(r\.fam\|\|''\)\);/.test(src));
  ok('★★★ 既有名額的使用人讀課卡上真正記的票（不是用票券排序猜的）',
     /const _seatRec=\(mid,i\)=>\{ const k=\(i>0\)\?\(mid\+'#'\+\(i\+1\)\):mid;/.test(src)
     && /const _seatFam=\(m,i\)=>\{ const pk=grpPickOf\(m\.id,i\)\|\|_seatRec\(m\.id,i\)\|\|_defPkOf\(m,i\);/.test(src)
     && /9\/25 兩格明明是媽媽與姊姊，畫面卻標成本人與媽媽（而且兩列都打勾）。/.test(src));
  ok('★ 計數列只留一句「可加入 N 位」（使用者：「給我單純一點的頁面」）',
     /c2\.textContent=`可加入 \$\{ROWS\.length\} 位`;/.test(src));
  /* 2026-08-29 四修（使用者：「不要下面的名單視窗　只要在上面搜尋列點選列出」
     「點搜尋列　要跟建立預約2/2 會員這邊的搜尋列用一樣的」）——
     欄位改成定版的挑選視窗入口（.mem-pick-row → mpkScan → #mpk-sheet）。 */
  ok('★★★ ［＋新增］的會員欄＝定版的跳視窗挑選器（與建立預約 2/2 同一套）',
     /<div class="mem-pick-row">\s*\n\s*<input class="gt-search" id="grp-search"/.test(src)
     && /<select id="grp-pick" onchange="grpPickSel\(this\.value\)"><\/select>/.test(src)
     && /if\(addMode\)\{ try\{ mpkScan\(\); \}catch\(_\)\{\} \}/.test(src));
  ok('★★ 清單畫在挑選視窗裡（右邊靠 data-sub 顯示可用堂數，那是 mpkRender 支援的）',
     /data-sub="可用 \$\{gl\} \/ \$\{gt\|\|gl\} 堂"/.test(src));
  ok('★★★ 選定的人用「是誰」對回去，不能用索引（每次重畫都會重排）',
     /const _at=ROWS\.findIndex\(r=>String\(r\.m\.id\)===String\(_pk\.mid\|\|''\) && String\(r\.fam\|\|''\)===String\(_pk\.fam\|\|''\)\);/.test(src)
     && /索引會漂，欄位上就會顯示成別人。/.test(src));
  ok('★★ addMode 不吃欄位的字當搜尋（欄位顯示的是已選的人，搜尋在視窗裡）',
     /欄位顯示的是「已選的人」，拿它當搜尋字會把清單濾成只剩那一位。/.test(src));
  /* 2026-08-29 二修（使用者逐列指定版面 ＋「文字太多了」）：
     第一列標題／第二列 課堂·教練（靠左）／第三列 目前報名人數（靠右）／
     第四列 搜尋／第五列 重複預約開關。原本那四行說明整段退場。 */
  ok('★★ ［＋新增］版面照使用者指定的五列',
     /* 2026-08-29：「在第二列教練名稱前面新增一個日期及時間」 */
     /<div class="gadd-sub">\$\{escH\(_cls\)\}　·　\$\{String\(b\.date\)\.slice\(5\)\.replace\('-','\/'\)\}（\$\{WD\[\(parseYmd\(b\.date\)\|\|new Date\(\)\)\.getDay\(\)\]\}）\$\{String\(b\.start_time\|\|''\)\.slice\(0,5\)\}\$\{_cName\?`　·　\$\{escH\(_cName\)\}`:''\}<\/div>/.test(src)
     && /<div class="gadd-cnt">目前 <b>\$\{_seatsNow\} \/ \$\{_cap\}<\/b> 人<\/div>/.test(src)
     && /\.gadd-cnt\{[^}]*text-align:right;/.test(src)
     && /<button type="button" class="gadd-rep" onclick="grpRepToggle\(\)">/.test(src));
  ok('★ addMode 不顯示人數上限那一列（改人數已改成標題卡上就地加減）',
     /onclick="grpMaxStep\('\$\{b\.id\}',1\)"/.test(src));
  /* 「之前會做成這樣是因為要一次新增多名會員嗎? 不要這個功能了　一次新增一名會員就好」 */
  ok('★★★ ［＋新增］是單選：點另一列就換人，不會愈選愈多',
     /if\(window\._grpAdd\)\{\s*\n\s*const already=r\.seats\.length>0;\s*\n\s*window\._grpSel=\(window\._grpBase\|\|\[\]\)\.slice\(\);/.test(src)
     && /管理名單那條路維持複選（要一次排一整班）。/.test(src));
  ok('★★ 單選模式不出 ＋／−（要再加一位就再按一次［＋新增］）',
     /\$\{\(on&&!_addMode\)\?`<span class="grp-step" onclick="event\.stopPropagation\(\);grpRowAdd/.test(src));
  ok('★★ 重複預約開關：關掉就不問後續場次；管理名單那條路不受影響',
     /function grpRepToggle\(\)\{/.test(src)
     && /const _askRep=\(!window\._grpAdd\) \|\| !!window\._grpRep;/.test(src)
     && /window\._grpRep 是 undefined，維持原本一律詢問的行為。/.test(src));
  ok('★ 開關預設開（櫃檯多半是替客人把整期排掉，關掉才是例外）',
     /if\(addMode\) window\._grpRep=\(window\._grpRep==null\)\?true:!!window\._grpRep;/.test(src));
  ok('★ 逐名額的預設仍是「名額 i 用第 i 張」（畫面與實際扣的要同一套）',
     /const _defPkOf=\(m,i\)=>\{ const a=m\.tks\|\|\[\]; return \(a\[Math\.min\(i,a\.length-1\)\]\|\|\{\}\)\.id\|\|''; \};/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
