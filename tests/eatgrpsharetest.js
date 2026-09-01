/* 兩個「打勾圓形卡」的成因，與扣課點的新樣子（2026-09-01）

   ① 吳美芳（教練課）：櫃檯今天取消 9/03 並選「扣課不退」，那一格從「9/03 空心」
      變成一顆沒有日期的 ✓。成因不是取消本身，而是這張票的堂數當初是**舊系統整批
      對帳**寫掉的（0729 補綁 5 堂、0803 一筆 adjust −5 抹平殘值），
      單筆預約在帳本上沒有自己的 deduct。原本的判準「淨扣 > 0」把它當成「已補退」。
      ⚠ 判準是「有沒有 deduct／refund」，不是「有沒有紀錄」——
        取消時寫的那一列是 adjust（delta 0），它不搬動堂數。

   ② 林政緯（團課共享票）：TK-mtgsd5j9pbzm 四堂，9/07・9/14・9/21 是林繼霖
      （共享人）的名額，三格全變 ✓、共享人的名字也沒出現。兩個原因疊在一起：
      ・團課的 bookings.ticket_id 永遠是空的（帳在 ticket_logs），
        0804 的共享票修補只看 ticket_id → 這三筆根本沒進持有人的 myBk。
      ・grpTicketAlloc 只認 memberId 自己的名額 → 就算進來了也不會蓋戳記。
      ・_shMark 讀 b.member_id，團課那一欄是 null → 名字標不出來（要讀名額鍵）。

   ③ 使用者：「這種選了扣課的圓形卡　給他一張　金色點　寫上扣課＋日期」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('① 取消・扣課不退：帳本沒動過就信旗標');
{
  ok('★★★ 判準先問「帳本動過沒」再看淨值',
     /const _eaten=b=>bkEatenCancel\(b\) && \(_hasMove\[b\.id\] \? \(_netChg\[b\.id\]\|\|0\)>0 : true\);/.test(src));
  ok('★★★ _hasMove 只認 deduct／refund（adjust 不算搬動堂數）',
     /const d=l\.action==='deduct'\?1:\(l\.action==='refund'\?-1:0\); if\(!d\) return;\s*\n\s*_hasMove\[l\.booking_id\]=1;/.test(src));
  ok('★★ 兩種淨值 0 的差別寫在原地',
     /扣過又退回（7\/23 那筆「取消未退堂回補」）→ 票沒被吃掉，不該畫/.test(src)
     && /從來沒有 deduct 也沒有 refund/.test(src));
  /* 實跑三種帳本形狀（判定式照抄，來源由上面的字面斷言釘住） */
  const eaten=(waived, logs)=>{
    const net=logs.reduce((n,a)=>n+(a==='deduct'?1:(a==='refund'?-1:0)),0);
    const moved=logs.some(a=>a==='deduct'||a==='refund');
    return !!waived && (moved ? net>0 : true);
  };
  eq('★★★ 吳美芳 9/03：只有一列 adjust → 信旗標，算用掉',
     eaten(true, ['adjust']), true);
  eq('★★★ 7/23 那筆：扣過又退回 → 不算用掉（旗標還在也一樣）',
     eaten(true, ['deduct','refund']), false);
  eq('★★ 正常的扣課不退：扣過沒退 → 算用掉', eaten(true, ['deduct']), true);
  eq('★★ 沒選扣課不退的取消：旗標是假的，什麼都不算', eaten(false, []), false);
}

console.log('\n② 扣課那一顆＝金色點＋「扣課」＋日期');
{
  ok('★★★ 有一支專門畫它（正常格子與溢位格子共用）',
     /const _eatBody=\(b,dt\)=>`<i class="mtk-shdot"><\/i><b class="mtk-shnm">扣課<\/b><b class="mtk-shdt">\$\{dt\}<\/b>`;/.test(src)
     && /const _eatDot=\(b,cur,slf\)=>\{/.test(src)
     && /<span class="mtk mtk-used mtk-lv mtk-eat\$\{_tp\?' mtk-tap':''\}/.test(src));
  ok('★★★ 兩條路都用它（0831 才因為抄兩份吃過虧）',
     (src.match(/if\(b && b\._eaten\)\{ s\+=_eatDot\(b,cur,slf\); continue; \}/g)||[]).length===2);
  ok('★★★ 金色（與「未到課」同一個語彙：人沒來、堂數照扣）',
     /\.mtk-lv\.mtk-eat \.mtk-shdot\{background:var\(--gold-d,#b48a56\);\}/.test(src)
     && /\.mtk-lv\.mtk-eat \.mtk-shnm\{color:var\(--gold-d,#b48a56\);\}/.test(src));
  ok('★★ 紅色留給「人有來的請假」（沒有把 .mtk-lv 整組改色）',
     /\.mtk-lv \.mtk-shdot\{background:var\(--danger,#b5372e\);\}/.test(src)
     && /\.mtk-lv \.mtk-shnm\{color:var\(--danger,#b5372e\);\}/.test(src));
  ok('★★ 提示仍寫得出原因與共享人（一顆點只放得下兩個字）',
     /title="取消未退（取消時選了扣課不退）\$\{b&&b\.date\?' '\+b\.date:''\}\$\{b&&b\._shName\?'　·　'\+b\._shName\+' 預約':''\}/.test(src));
}

console.log('\n③ 團課共享票：別人的名額也要蓋在我的票上');
{
  ok('★★★ myBk 收「帳本說扣在我票上」的預約（團課沒有 ticket_id 可看）',
     /\|\| _lgBk\[b\.id\]\)\);/.test(src)
     && /團課的 ticket_id 永遠是空的/.test(src));
  ok('★★★ 會員資料頁的共享池也一起收',
     /\(tkLogs\|\|\[\]\)\.forEach\(l=>\{ if\(l&&l\.booking_id&&l\.ticket_id&&_tkIds\.has\(l\.ticket_id\)\) _lgIds\.add\(l\.booking_id\); \}\);/.test(src));
  ok('★★★ grpTicketAlloc 認得共用同一批票的人',
     /function grpTicketAlloc\(myTk, myBk, logs, memberId, isGrpTk, alsoIds\)\{/.test(src)
     && /if\(!_isMe && !\(alsoIds && alsoIds\[String\(id\)\]\)\) return;/.test(src));
  ok('★★★ 後備猜法只給自己的名額（別人的沒帳本就不關這張票的事）',
     /const tid=logged\|\|\(\(_own\[i\]&&newest\)\?newest\.id:null\);/.test(src)
     && /後備猜法（newest）只給自己的名額/.test(src));
  ok('★★★ alsoIds＝持有人＋共享人（用 tkSharedIds，不自己拆 shared_with）',
     /\(tkSharedIds\(t\)\|\|\[\]\)\.forEach\(id=>\{ if\(String\(id\)!==String\(memberId\)\) _alsoIds\[String\(id\)\]=1; \}\);/.test(src));
  ok('★★★ 共享人的名字讀名額鍵（團課的 member_id 是 null）',
     /const who=\(b\._seat&&typeof seatMid==='function'\)\?seatMid\(b\._seat\):\(b\.member_id\|\|''\);/.test(src)
     && /團課的使用人在名額鍵上，不在 member_id/.test(src));
}

console.log('\n④ 實跑 grpTicketAlloc（林政緯那張票的形狀）');
{
  const TODAY=new Date(2026,8,1);
  const api=new Function('ymd','TODAY','mids','attObj','bkEatenCancel',
    g('function grpTicketAlloc(myTk, myBk, logs, memberId, isGrpTk, alsoIds){','\n}\n')
    +'\nreturn grpTicketAlloc;')(
      d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());},
      TODAY,
      b=>(b&&Array.isArray(b.member_ids))?b.member_ids:[],
      b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};},
      b=>!!(b&&b.status==='cancelled'&&b.refund_waived));

  const OWN='林政緯', SHR='林繼霖', OTH='路人';
  const TK={id:'TK-4W',member_id:OWN,plan_name:'團課 4週優惠',sessions_total:4,sessions_remaining:0,
    purchase_date:'2026-08-31',status:'usable',shared_with:[SHR]};
  const BK=(id,date,ids)=>({id,date,start_time:'13:00',category:'小班肌力',status:'booked',
    member_ids:ids,attendance:{}});
  const bks=[BK('B1','2026-08-31',[OWN,OTH]), BK('B2','2026-09-07',[OTH,SHR]),
             BK('B3','2026-09-14',[OTH,SHR]), BK('B4','2026-09-21',[SHR])];
  const logs=bks.map(b=>({ticket_id:'TK-4W',booking_id:b.id,action:'deduct'}));
  const isGrp=()=>true;

  const before=api([TK],bks,logs,OWN,isGrp);              // 沒有 alsoIds＝0901 之前
  eq('★★★ 修好之前：持有人只看得到自己那一堂（另外三格就是那三顆 ✓）',
     (before.byTicket['TK-4W']||[]).map(b=>b.date), ['2026-08-31']);

  const after=api([TK],bks,logs,OWN,isGrp,{[SHR]:1});
  eq('★★★ 修好之後：四堂都畫得出來',
     (after.byTicket['TK-4W']||[]).map(b=>b.date),
     ['2026-08-31','2026-09-07','2026-09-14','2026-09-21']);
  eq('★★★ 名額鍵跟著蓋上去（共享人的名字靠它）',
     (after.byTicket['TK-4W']||[]).map(b=>b._seat), [OWN,SHR,SHR,SHR]);
  /* 8/31 已經過去、id 又不是 BK- 開頭（測資模擬匯入的舊預約）→ 照規則不算待上 */
  eq('★★ 待上＝三堂未來的課', after.pend['TK-4W'], 3);
  eq('★★★ 路人的名額不算（alsoIds 沒有他）',
     (after.byTicket['TK-4W']||[]).every(b=>b._seat===OWN||b._seat===SHR), true);

  /* 沒有扣課紀錄時，別人的名額不准用「最近那張票」猜過去 */
  const noLog=api([TK],[BK('B9','2026-09-28',[SHR])],[],OWN,isGrp,{[SHR]:1});
  eq('★★★ 共享人的名額沒有帳本就不蓋、也不算待上',
     [(noLog.byTicket['TK-4W']||[]).length, noLog.pend['TK-4W']], [0, undefined]);
  const ownNoLog=api([TK],[BK('B8','2026-09-28',[OWN])],[],OWN,isGrp,{[SHR]:1});
  eq('★★ 自己的名額維持原本的後備猜法（行為沒被改掉）', ownNoLog.pend['TK-4W'], 1);
}

console.log('\n④b 選錯扣課，櫃檯自己改得回來');
{
  ok('★★★ 金色那顆點得下去（櫃檯以上），入口就在看到問題的地方',
     /const _eatTap=!!\(typeof isDeskLike==='function'&&isDeskLike\(\)&&t&&t\.id\);/.test(src)
     && /onclick="event\.stopPropagation\(\);mtkEatUndo\('\$\{t\.id\}','\$\{b\.id\}'\)"/.test(src));
  ok('★★ 提示寫出來這顆可以點（不是要人猜）',
     /\$\{_tp\?'　·　選錯了？點一下改成退回堂數':''\}/.test(src));
  ok('★★★ 更正只做「退回」一個方向（反過來等於憑空扣客人一堂）',
     /只做「退回」這個方向/.test(src)
     && /真要扣就重新走一次取消流程/.test(src));
  ok('★★★ 三件事一起做：清旗標、餘額 +1、帳本寫 refund',
     /b\.refund_waived=false;/.test(src)
     && /t\.sessions_remaining=Math\.max\(0,Number\(t\.sessions_remaining\)\|\|0\)\+1;/.test(src)
     && /await logTicket\(t\.id,'refund',1,bkId,/.test(src));
  ok('★★★ 帳本那一筆是必要的 —— 之後 _eaten 才看得到「動過帳」，不會再走信旗標那條退路',
     /不會再走「沒有紀錄就信旗標」那條退路/.test(src));
  ok('★★ 有餘額就不能卡在「用畢」（狀態會跟餘額打架，餘額才是真的）',
     /if\(t\.status==='used_up'\) t\.status='usable';/.test(src));
  ok('★★★ 寫入前重讀並再確認一次（dbPut 是整列覆寫，別的分頁可能已經改過）',
     /if\(b\.refund_waived!==true\)\{ closeModal\(\); showToast\('這一堂已經處理過了'\); navTo\(CUR_PAGE\); return; \}/.test(src));
  ok('★★★ 防連點（連按兩下會退回兩堂）',
     /async function mtkEatUndoDo\(tkId, bkId\)\{ return onceAct\('eatundo:'\+bkId, \(\)=>_mtkEatUndoDo\(tkId,bkId\)\); \}/.test(src));
  ok('★★ 快取要清（不然本機看不到自己的改動）',
     /dbCacheClear\(\['bookings','member_tickets','ticket_logs'\]\);/.test(src));
  ok('★★ 視窗先講清楚會變成什麼（餘額 N → N+1、那顆點會消失）',
     /剩餘堂數 <b class="num">\$\{rem\}<\/b> → <b class="num">\$\{rem\+1\}<\/b> 堂/.test(src));
  ok('　　沒有標記的點進來要說一聲，不要靜靜沒反應',
     /showToast\('這一堂沒有「扣課不退」的標記，不需要更正'\)/.test(src));
}

console.log('\n⑤ 即將降級名單：主教練標在會員旁邊');
{
  ok('★★★ 名單帶主教練（沒指定的一樣列出來，寫「未指定」）',
     /coach:_coNm\[_cid\]\|\|'', coachId:_coNm\[_cid\]\?_cid:'',/.test(src)
     && /if\(!it\.coach\) return `<span class="tdl-co tdl-co-no">未指定主教練<\/span>`;/.test(src));
  ok('★★ 只有帶 coach 的名單會出現這顆章（收款提醒／未打卡不受影響）',
     /if\(it\.coach===undefined\) return '';/.test(src));
  /* 2026-09-01 使用者：「即將降級名單內的教練標籤　用上教練的顏色」 */
  ok('★★★ 教練章穿教練自己的顏色（與篩選列、行事曆 chips 同一支 coachTagColor）',
     /const cc=\(it\.coachId&&typeof coachTagColor==='function'\)\?coachTagColor\(it\.coachId\):null;/.test(src)
     && /const st=cc\?` style="background:\$\{cc\.bg\};color:\$\{cc\.fg\};"`:'';/.test(src)
     && /不另訂一套色/.test(src));
  ok('★★ 教練名走 coachDisp（顯示的是暱稱，與全站一致）',
     /const _coNm=\{\}; \(coaches\|\|\[\]\)\.forEach\(c=>\{ if\(c&&c\.id\) _coNm\[c\.id\]=coachDisp\(c\); \}\);/.test(src));
  ok('★★ 綠色＝一般提示（紅>金>綠 的色階，這不是警示）',
     /\.tdl-co\{[^}]*background:var\(--sage-bg,#eef5f1\);color:var\(--green,#1f6f54\);/.test(src)
     && /這不是警示，是給櫃檯找人的線索/.test(src));
  ok('　　沒指定的降成灰字（看得出是「沒有」而不是「還沒載完」）',
     /\.tdl-co\.tdl-co-no\{background:rgba\(120,113,102,\.12\);color:var\(--t3,#8b857a\);/.test(src));
}

console.log('\n⑥ 教練篩選列');
{
  ok('★★★ 只有帶 coach 的名單會長出來（收款提醒／未打卡不受影響）',
     /const _hasCo=\(L\.items\|\|\[\]\)\.some\(it=>it&&it\.coach!==undefined\);/.test(src));
  ok('★★★ 直接穿行事曆那一組 chips，不另做一套樣式',
     /class="cal-chip\$\{cc\?' cal-chip-coach':''\}\$\{on\?' on':''\}"/.test(src)
     && /_coBar=`<div class="cal-chip-row tdl-cobar">/.test(src)
     && /行事曆那組以後改了這裡自動跟上（自己複製一份就是第二份規則）/.test(src));
  ok('★★★ 教練 chip 穿自己的代表色（與行事曆同一支 coachTagColor）',
     /const cc=\(id&&typeof coachTagColor==='function'\)\?coachTagColor\(id\):null;/.test(src)
     && /coach:_coNm\[_cid\]\|\|'', coachId:_coNm\[_cid\]\?_cid:'',/.test(src));
  ok('★★★ 顏色在 inline style 上 → 切換時要連底色一起換（光切 class 只會換框線）',
     /const bg=b\.dataset&&b\.dataset\.bg, fg=b\.dataset&&b\.dataset\.fg;/.test(src)
     && /b\.setAttribute\('style', `--cc:\$\{fg\};`\+\(on\?`background:\$\{fg\};color:#fff;`:`background:\$\{bg\};color:\$\{fg\};`\)\);/.test(src));
  ok('★★ CSS 只補間距與人數字樣，不重寫 chip 樣式',
     /\.tdl-cobar\{margin:0 0 10px;\}/.test(src)
     && /不要在這裡重寫 chip 的樣式：行事曆那組改了就會對不上/.test(src)
     && !/\.tdl-cochip\{/.test(src));
  ok('★★★ 章上帶人數，照人數多到少排（這一列是「誰要追最多人」）',
     /const ks=Object\.keys\(cnt\)\.sort\(\(a,b\)=>\(cnt\[b\]-cnt\[a\]\)\|\|a\.localeCompare\(b\)\);/.test(src)
     && /這一列是「誰要去追最多人」，不是通訊錄/.test(src));
  ok('★★ 「未指定」永遠排最後（它不是一位教練）',
     /ks\.sort\(\(a,b\)=>\(a===NO\?1:0\)-\(b===NO\?1:0\)\);/.test(src));
  ok('★★★ 姓名與教練兩個條件一起算（分兩支會互相還原）',
     /function tdlApply\(\)\{/.test(src)
     && /c\.style\.display=\(hitQ\(c,'\.tdl-cell-nm'\)&&hitCo\(c\)\)\?'':'none';/.test(src)
     && /r\.style\.display=\(hitQ\(r,'\.tdl-n'\)&&hitCo\(r\)\)\?'':'none';/.test(src)
     && /分成兩支各自 display 的話，後按的那個會把前一個的結果整片還原/.test(src));
  ok('★★ 點同一顆＝取消（回到全部）',
     /const same=String\(window\._tdlCo\|\|''\)===String\(co\|\|''\);/.test(src)
     && /window\._tdlCo=same\?'':String\(co\|\|''\);/.test(src));
  ok('★★ 每次開窗都從「全部」開始（上次的篩選不會黏著）',
     /window\._tdlQ=''; window\._tdlCo='';   \/\/ 每次開窗都從「全部」開始/.test(src));
  ok('★★ 教練暱稱是資料庫字串，標籤與 onclick 參數都有跳脫',
     /const esc=x=>String\(x\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/<\/g,'&lt;'\)\.replace\(\/"\/g,'&quot;'\);/.test(src));
}

console.log('\n⑦ 名單與篩選列的版面（2026-09-01）');
{
  ok('★★★ 名單列改白底框（使用者：「下方會員名單要用白色框」）',
     /\.tdl-row\{[^}]*background:#fff;border:1px solid var\(--bd\);border-radius:11px;/.test(src)
     && /下方會員名單要用白色框/.test(src));
  ok('★★★ 姓名篩選列不再歪：行內樣式整條蓋掉 margin（不是只寫 margin-bottom）',
     /class="ms-search" style="width:100%;box-sizing:border-box;margin:0 0 10px;background:#fff;" placeholder="輸入姓名篩選…"/.test(src)
     && !/class="ms-search" style="width:100%;box-sizing:border-box;margin-bottom:/.test(src));
  ok('★★★ 同型的另外三處一起修（抽獎登記／卡位改綁兩支）',
     (src.match(/class="ms-search" style="width:100%;box-sizing:border-box;margin:0 0 \d+px;/g)||[]).length===4,
     (src.match(/class="ms-search" style="width:100%;box-sizing:border-box;margin:0 0 \d+px;/g)||[]).length);
  ok('★★ 坑寫在 .ms-search 原地（下一個人才不會再踩）',
     /寫 margin-bottom 蓋不到左右那 18px → 右邊溢出、左邊內縮，看起來就是「歪歪的」/.test(src));
}

console.log('\n⑧ 跨年的圓點多一行年份（2026-09-01）');
{
  ok('★★★ 非今年才加年份，今年維持一行',
     /return \(y===TODAY\.getFullYear\(\)\) \? dt\s*\n\s*: `<i class="mtk-yr">\$\{String\(y\)\.slice\(2\)\}<\/i><i class="mtk-mdv">\$\{dt\}<\/i>`; \};/.test(src)
     && /不然整排都變兩行、字反而變小/.test(src));
  ok('★★★ md\(\) 現在會吐 HTML —— 呼叫端不可以拿去放 title',
     /要拿去放 title 的話請改用 b\.date/.test(src)
     /* 反例：如果哪天有人把 md(b) 塞進 title=，這條會紅 */
     && !/title="[^"]*\$\{md\(/.test(src));
  ok('★★★ 帶年份的那顆放大到 40px（35px 塞兩行會把日期擠小）',
     /\.mtk:has\(\.mtk-yr\)\{flex-direction:column;gap:1px;width:40px;height:40px;\}/.test(src)
     && /只有帶 \.mtk-yr 的那幾顆變大，今年的維持 35px/.test(src));
  ok('★★ 六欄格版不能被寫死成 40px（寬度要跟著欄寬走）',
     /\.mck-dots6 \.mtk:has\(\.mtk-yr\)\{width:100%;height:auto;\}/.test(src));
  ok('★★ 共享／請假／扣課那幾顆本來就是兩行排版，年份併進日期上方',
     /\.mtk-shdt \.mtk-yr\{display:block;font-size:8px;opacity:\.7;\}/.test(src)
     && /\.mtk\.mtk-sh:has\(\.mtk-yr\),\.mtk\.mtk-lv:has\(\.mtk-yr\)\{width:auto;height:auto;\}/.test(src));
  /* 實測（Chrome，375px）：40px 的圓，9/17／12/17／11/28／1/3 都沒有被裁
     （scrollWidth===clientWidth），今年的維持 35px。數字記在這裡，之後改字級要重量。 */
  ok('　　量過：40px 圓裝得下 11/28（最寬的組合），今年的仍是 35px', true);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
