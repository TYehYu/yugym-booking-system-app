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
     && /const _eatDot=\(b,cur,slf\)=>`<span class="mtk mtk-used mtk-lv mtk-eat/.test(src));
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

console.log('\n⑤ 即將降級名單：主教練標在會員旁邊');
{
  ok('★★★ 名單帶主教練（沒指定的一樣列出來，寫「未指定」）',
     /coach:_coNm\[memMap\[id\]\.default_coach_id\]\|\|'',/.test(src)
     && /const co=\(it\)=>\(it\.coach===undefined\)\?'':`<span class="tdl-co\$\{it\.coach\?'':' tdl-co-no'\}">\$\{it\.coach\|\|'未指定主教練'\}<\/span>`;/.test(src));
  ok('★★ 只有帶 coach 的名單會出現這顆章（收款提醒／未打卡不受影響）',
     /\(it\.coach===undefined\)\?''/.test(src));
  ok('★★ 教練名走 coachDisp（顯示的是暱稱，與全站一致）',
     /const _coNm=\{\}; \(coaches\|\|\[\]\)\.forEach\(c=>\{ if\(c&&c\.id\) _coNm\[c\.id\]=coachDisp\(c\); \}\);/.test(src));
  ok('★★ 綠色＝一般提示（紅>金>綠 的色階，這不是警示）',
     /\.tdl-co\{[^}]*background:var\(--sage-bg,#eef5f1\);color:var\(--green,#1f6f54\);/.test(src)
     && /這不是警示，是給櫃檯找人的線索/.test(src));
  ok('　　沒指定的降成灰字（看得出是「沒有」而不是「還沒載完」）',
     /\.tdl-co\.tdl-co-no\{background:rgba\(120,113,102,\.12\);color:var\(--t3,#8b857a\);/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
