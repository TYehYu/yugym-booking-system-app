/* 臨時停課（2026-10-19 使用者：「這個禮拜可能會有颱風假」→「可以　開始寫」）

   颱風、政府宣布停班或臨時停業時，把整天的課一次停掉。管理員與店長可用。

   這支盯四件事：
     ① 哪些課會被停（只有 booked；已簽到／已完成／教練請假／已取消都不碰）
     ② 哪些票會被延（只延那天真的用到的，不是會員手上所有票）
     ③ 取消走既有的 cancelBooking，而且是 force＋silent
     ④ 權限只給管理員／店長 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');
 let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]=='{')d++;else if(src[k]=='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* ⚠ 停班通常中午才宣布，早上有上到課的那幾堂一定要留著 —— b3 已簽到、b5 教練請假 */
const BK=[
 {id:'b1',date:'2026-10-20',status:'booked',category:'私人教練',member_id:'m1',coach_id:'c1',ticket_id:'t1'},
 {id:'b2',date:'2026-10-20',status:'booked',category:'自主訓練',member_id:'m2',ticket_id:'t2'},
 {id:'b3',date:'2026-10-20',status:'checked_in',category:'私人教練',member_id:'m3',coach_id:'c1',ticket_id:'t3'},
 {id:'b4',date:'2026-10-20',status:'cancelled',category:'私人教練',member_id:'m4',ticket_id:'t4'},
 {id:'b5',date:'2026-10-20',status:'coach_leave',category:'小班肌力',coach_id:'c2'},
 {id:'b6',date:'2026-10-20',status:'booked',category:'小班肌力',coach_id:'c2',member_ids:['m5','m6'],seat_tickets:{m5:'t5','m6#2':'t6'}},
 {id:'b7',date:'2026-10-21',status:'booked',category:'私人教練',member_id:'m7',ticket_id:'t7'}];
const TK=[{id:'t1',expire_date:'2026-10-25'},{id:'t2',expire_date:'2027-08-31'},
 {id:'t3',expire_date:'2026-10-25'},{id:'t5',expire_date:'2026-11-01'},
 {id:'t6',expire_date:'2027-01-01'},{id:'t7',expire_date:'2026-10-22'}];
const api=new Function('dbGetAll','parseYmd','ymd','mids','bkCoachId','CDAY_SOON_DAYS',
  grab('cdayTickets')+'\n'+grab('cdayStat')+'\n'+grab('cdayCatLine')+'\nreturn {cdayTickets,cdayStat,cdayCatLine};')(
  async t=>({bookings:BK,member_tickets:TK})[t],
  s=>{const[a,b,c]=String(s).split('-').map(Number);return new Date(a,b-1,c);},
  d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
  b=>b.member_ids||(b.member_id?[b.member_id]:[]),
  b=>b.substitute_coach_id||b.coach_id, 14);

(async()=>{
console.log('① 哪些課會被停');
const st=await api.cdayStat('2026-10-20');
eq('★★★ 只停 booked 的三堂（b1 b2 b6）', st.bs.map(b=>b.id), ['b1','b2','b6']);
ok('★★★ 已簽到的不動（b3）', !st.bs.some(b=>b.id==='b3'));
ok('★★★ 已取消的不重複動（b4）', !st.bs.some(b=>b.id==='b4'));
ok('★★★ 教練請假的不動（b5，那一班本來就沒了）', !st.bs.some(b=>b.id==='b5'));
ok('★★★ 不會動到別天（b7）', !st.bs.some(b=>b.id==='b7'));
eq('★★ 會員數含團課的每一位名額', st.mem, 4);
eq('★★ 教練數去重', st.coach, 2);
eq('★★ 分類明細', api.cdayCatLine(st.cat), '教練課 1　·　自主訓練 1　·　團體課 1');

console.log('\n② 哪些票會被延');
/* ⚠ 只延「那天真的用到的」。實測 10/20：34 位會員手上共 337 張票，
   302 張是自主訓練點數、到期日散到 2027/08 —— 全延等於在帳本灌 300 筆沒意義的紀錄。 */
eq('★★★ 單人課吃 ticket_id、團課吃 seat_tickets', st.tk.map(t=>t.id).sort(), ['t1','t2','t5','t6']);
ok('★★★ 已簽到那堂的票不延（t3）', !st.tk.some(t=>t.id==='t3'));
ok('★★★ 別天的票不延（t7）', !st.tk.some(t=>t.id==='t7'));
eq('★★ 兩週內到期的張數（提醒用）', st.soon, 2);
eq('★★ 團課一個名額一張票', api.cdayTickets(BK[5]).sort(), ['t5','t6']);
eq('★★ 沒有票的課不會吐出 undefined', api.cdayTickets(BK[4]), []);

console.log('\n③ 接線');
/* force 不會進 RPC（RPC 會套 24 小時扣課規則，天災停課一律要退）；
   silent 讓它不要每取消一筆就 navTo 重畫一次。 */
ok('★★★ 取消走既有的 cancelBooking，force＋silent',
   /await cancelBooking\(b\.id,'force',\{silent:true\}\);/.test(src));
ok('★★★ 取消理由先寫進 booking（cancelBooking 會重讀，所以留得住）',
   /cur\.cancel_reason=reasonTxt;\s*\n\s*await dbPut\('bookings',cur\);/.test(src));
ok('★★★ 動手前重算一次（視窗可能開很久）',
   /const st=await cdayStat\(ds\);\s+\/\/ 重新算一次/.test(src));
ok('★★★ 展延有寫進票券帳本', /臨時停課展延：\$\{from\} → \$\{to\}/.test(src));
ok('★★ 做完清掉動到的那幾張表的快取',
   /dbCacheClear\(\['bookings','member_tickets','ticket_logs','notifications'\]\);[\s\S]{0,80}closeModal\(\);/.test(src));
ok('★★ 防連點（onceAct）', /async function cdayGo\(\)\{ return onceAct\('cday', \(\)=>_cdayRun\(\)\); \}/.test(src));

console.log('\n④ 權限與入口');
ok('★★★ 開窗要管理員／主管', /if\(!isManagerUp\(\)\)\{ showToast\('臨時停課只有管理員或主管可以操作'\); return; \}/.test(src));
/* 三支都要擋：開窗、第二關、真正動手那一支。只擋畫面等於沒擋。 */
ok('★★★ 三個入口都擋權限（不能只擋畫面）',
   (src.match(/showToast\('臨時停課只有管理員或主管可以操作'\)/g)||[]).length===3);

console.log('\n⑤ 第二道確認（選錯日期沒有退路，防線只能擺在按下去之前）');
/* ⚠ 選錯日期幾乎都是差一天或差一週 —— 把星期幾寫出來最容易當場發現。 */
ok('★★★ 第二關把日期與星期寫成大字',
   /font-size:44px;font-weight:900;[^"]*">\$\{md\}<span[^>]*>（\$\{wd\}）<\/span>/.test(src));
ok('★★★ 確認鈕上也寫著日期與堂數（不是只有「確定」）',
   /確定停 \$\{md\}（\$\{wd\}）的 \$\{st\.n\} 堂/.test(src));
/* 過去的日期、兩週以後的日期最可能是選錯 */
ok('★★★ 過去或太遠的日期會多一行紅字',
   /const odd = diff<0 \? '這是<b>過去的日期<\/b>（'\+\(-diff\)\+' 天前）'/.test(src)
   && /: diff>14 \? '這是 <b>'\+diff\+' 天後<\/b>的日期'/.test(src));
/* LINE 通知是唯一真正收不回來的東西，要在最後一關講明白 */
/* 2026-10-23：這一句改寫成實話 —— 在那之前它根本不會發 LINE（只寫 App 內通知），
   現在真的會發了，但只有綁過 LINE 的人收得到，所以寫「最多」。語意不變：送出去收不回來。 */
ok('★★★ 第二關明講通知收不回來',
   /位會員會收到 LINE 通知<\/b>（沒綁 LINE 的收不到）—— 送出去就收不回來/.test(src));
ok('★★★ 第二關明講取消沒有一鍵復原',
   /取消<b>沒有一鍵復原<\/b>，要救得一筆一筆重新預約/.test(src));
ok('★★ 可以回上一關改，而且勾選會留著',
   /onclick="openCloseDayModal\(\)">← 回去改<\/button>/.test(src)
   && /const _g=window\._cdayGo\|\|\{\};/.test(src)
   && /\$\{_g\.doNotify===false\?'':' checked'\}/.test(src));
/* ⚠ 第一關只是收集選項，真正動手的是 cdayGo → _cdayRun。
   這一條防的是「哪天有人把 onclick 改回去直接呼叫 _cdayRun，第二關就被跳過了」。 */
ok('★★★ 第一關的按鈕呼叫 cdayRun（收集選項），不是直接動手',
   /onclick="cdayRun\(\)">確認停課<\/button>/.test(src)
   && /window\._cdayGo=\{ds, doExt, days, doNotify, why, free\};/.test(src));
/* ⚠ 0903 量過「三樣擠一列在 1440 一定 wrap」，所以放列 2 不放列 1。 */
ok('★★★ 按鈕在行事曆列 2，且只有管理員／主管看得到',
   /const _cdayBtn=\(typeof isManagerUp==='function' && isManagerUp\(\)\)/.test(src)
   && /const _calNavHtml=`<div class="cal-nav">\$\{_cdayBtn\}/.test(src));
ok('★★ 按鈕有說明用途（這顆會一次取消一整天）',
   /title="颱風、政府宣布停班時，把整天的課一次停掉"/.test(src));


console.log('\n\u2465 2026-10-23 颱風假當天踩到的兩個洞');
{
  /* 使用者截圖：「已停課 0 堂（34 堂失敗，請重按一次），展延 35 張票券」
     ① 取消那一圈每一堂都丟例外 —— 寫的是 bookings 的 cancel_reason，
        但那一欄當初抄錯表（它是 ticket_grant_requests 的），bookings 上根本沒有，
        每圈都卡在 dbPut 的 PGRST204，連 cancelBooking 都沒走到。
     ② 訊息叫人「請重按一次」，他按了第二次 —— 取消照樣全失敗，
        但展延那一圈又跑了一遍：35 張票各 +7 天兩次 ＝ 實際 +14 天（正式庫查到 70 筆）。 */
  /* ⚠ 1023 下午課卡開始顯示停課原因之後，這一欄已經從 LEAN_DROP 拿出來了
     （見⑧）。這裡只要守住「欄位真的被寫進去」。 */
  ok('★★★ 取消前會寫下理由',
     /cur\.cancel_reason=reasonTxt;/.test(src));
  ok('★★★ 展延前先看帳本：這張票這一天延過就跳過',
     /const _mark=`｜\$\{ds\} 全館停課`;/.test(src)
     && /\/\^\(臨時停課\|天災停課\)展延\/\.test\(l\.note\)/.test(src)
     && /_done\[String\(l\.ticket_id\)\]=1;/.test(src)
     && /if\(_done\[String\(st\.tk\[i\]\.id\)\]\)\{ extSkip\+\+; continue; \}/.test(src));
  ok('★★★ 帳本讀不到就整個不展延（寧可不延，也不要重複延）',
     /讀不到展延紀錄，這次先不展延票券（避免重複延）/.test(src)
     && /for\(let i=0;i<st\.tk\.length && _done;i\+\+\)\{/.test(src));
  ok('★★ 同一圈內也不會重複（成功後立刻記起來）',
     /_done\[String\(t\.id\)\]=1;/.test(src));
  ok('★★ 紀錄的尾巴用同一個 _mark，下次才比對得到',
     /臨時停課展延：\$\{from\} → \$\{to\}（\$\{days\} 天）\$\{_mark\}/.test(src));
  ok('★★★ 訊息改成「可以再按一次，已處理的不會重複」',
     /可以再按一次，已處理的不會重複/.test(src)
     && !/堂失敗，請重按一次/.test(src));
  ok('★★ 跳過幾張要講出來（不然會以為沒延到）',
     src.indexOf('(extSkip?')>=0 && /張今天已延過，跳過/.test(src));
  ok('★ 成因寫在原地', /這一欄當初抄錯表/.test(src));
}


console.log('\n⑦ 通知那一圈（2026-10-23 同一天查出來的）');
{
  /* 使用者問「會員通知有發出去嗎」—— 查正式庫：發了，但發錯也發重複。
     31 堂裡只通知到 4 位，而且那 4 位各收到兩封。
     ① mids(b) 只讀 member_ids，那是**團課**放學員的地方；
        私人教練、體驗、自主訓練的會員在 member_id。20 堂教練課一個都沒收到。
     ② 重按會再發一次。 */
  ok('★★★ 名單兩個欄位都要讀（團課用 member_ids、其餘用 member_id）',
     /const ids=\(Array\.isArray\(b\.member_ids\)&&b\.member_ids\.length\)/.test(src)
     && /\? b\.member_ids : \(b\.member_id\?\[b\.member_id\]:\[\]\);/.test(src));
  ok('★★★ 不再用 mids\(b\) 拿通知名單',
     !/for\(const b of st\.bs\) \(mids\(b\)\|\|\[\]\)\.forEach/.test(src));
  ok('★★★ 同一天同一位已經發過就跳過',
     /const _title='課程停課通知', _tag=`\$\{String\(ds\)\.replace\(\/-\/g,'\/'\)\} 的課程已取消`;/.test(src)
     && /if\(_sent\[list\[i\]\]\)\{ notiSkip\+\+; continue; \}/.test(src)
     && /_sent\[String\(n\.recipient_id\)\]=1;/.test(src));
  ok('★★★ 讀不到通知紀錄就整個不發（寧可不發，也不要重複發）',
     /讀不到通知紀錄，這次先不通知會員（避免重複發）/.test(src)
     && /for\(let i=0;i<list\.length && _sent;i\+\+\)\{/.test(src));
  ok('★★ 比對用的尾巴就是寫進內文的那一句（不另記旗標）',
     /`\$\{cdayReasonOf\(why\)\.line\}，\$\{_tag\}，堂數沒有扣。`/.test(src));
  ok('★★ 通知失敗要留痕跡（原本是空 catch）',
     /console\.error\('通知失敗',list\[i\],e\);/.test(src));
  ok('★ 結果訊息講出通知幾位、跳過幾位',
     src.indexOf('(noti?')>=0 && src.indexOf('(notiSkip?')>=0
     && /位今天已通知過/.test(src));
  ok('★ 成因寫在原地', /20 堂教練課的會員一個都沒收到/.test(src));
}


console.log('\n⑧ 行事曆課卡要看得出「停課」（2026-10-23 使用者）');
{
  /* 「行事曆上的課卡顯示停課，滑鼠指上去顯示原因」——
     本來已取消的課行事曆不畫，31 堂停掉之後那一天是空的，
     看不出「本來有課、是停掉的」。 */
  ok('★★★ 判準就是 _cdayRun 寫進去的那句理由',
     /function bkClosedDay\(b\)\{/.test(src)
     && /\/\^\(臨時停課\|天災停課\)\/\.test\(String\(b\.cancel_reason\|\|''\)\)/.test(src)
     && /b\.status==='cancelled' && !b\.card_hidden/.test(src));
  ok('★★★ 行事曆保留這張卡',
     /return bkShowsCancelled\(b\) \|\| bkClosedDay\(b\)/.test(src));
  ok('★★ 而且要暗化（票已退回，這堂不會發生）',
     /if\(bkClosedDay\(b\)\) return true;   \/\* 天災停課/.test(src));
  ok('★★★ 角章改「停」，而且排在全員請假前面',
     /const _stampOut = _closedDay/.test(src)
     && /class="evc-check evc-closed"/.test(src)
     && src.indexOf('const _stampOut = _closedDay') < src.indexOf('evc-check evc-leave'));
  ok('★★ 滑鼠提示把原因放第一行',
     /const _tipClosed = _closedDay \? `⚠ \$\{bkClosedWhy\(b\)\}` : '';/.test(src)
     && /_tipEsc\(\[_tipClosed, `\$\{b\.start_time\}/.test(src));
  ok('★★ 原因有跑跳脫（資料是人寫的）',
     /const _tipEscEarly = x=>String\(x==null\?'':x\)\.replace/.test(src));
  ok('★★★ cancel_reason 已經從 LEAN_DROP 拿掉（列表讀得到它）',
     !/'reward_type','cancel_reason'/.test(src)
     && /要開始用就先從 LEAN_DROP 移除/.test(src));
  ok('★ 停課章用自己的顏色（紅是請假的語意）',
     /\.evc-check\.evc-closed,\.cal-ev\.cal-ev-std \.evc-check\.evc-closed\{background:#3A362F;\}/.test(src));
  ok('★ 堂數不計（status 仍是 cancelled，bkCounts 本來就排除）',
     /function bkCounts\(b\)\{ return !!b && b\.status!=='cancelled'/.test(src));
}


console.log('\n⑨ 真的發 LINE（2026-10-23 使用者：「順便把發line功能完善」）');
{
  /* 勾選寫著「發 LINE 通知會員」、確認視窗還寫「立刻收到 LINE 通知」，
     但 pushNotification 只寫 notifications 表，會發 LINE 的那幾支讀的全是別的表
     —— 兩句都是假的。現在接上 line-closeday。 */
  ok('★★★ 通知那一圈之後會呼叫 line-closeday',
     /sb\.functions\.invoke\('line-closeday',\s*\n?\s*\{body:\{date:ds, extDays:\(doExt\?days:0\), reasonKey:why\}\}\)/.test(src));
  ok('★★★ 不把會員名單或文字傳過去（不把 line-push-test 那個洞開回來）',
     !/invoke\('line-closeday',\{body:\{[^}]*(text|members|list)/.test(src)
     && /外面只能給日期與天數，不能發任意訊息/.test(src));
  ok('★★ LINE 失敗不擋停課本身',
     /推播失敗不擋停課本身/.test(src)
     && /\}catch\(e\)\{ console\.error\('LINE 停課通知失敗',e\);/.test(src));
  ok('★★ 結果訊息要講出 LINE 送了幾位、幾位沒送到',
     src.indexOf('(lineSent?')>=0 && src.indexOf('(lineFail?')>=0 && src.indexOf('(lineErr?')>=0);

  /* 確認視窗的人數也是同一個洞：cdayStat 用 mids(b) 算人，
     10/22 那天 31 堂只算出 4 位，視窗因此少講了 27 位。 */
  ok('★★★ cdayStat 算會員也要看兩個欄位',
     /const _ids=\(Array\.isArray\(b\.member_ids\)&&b\.member_ids\.length\)\s*\n\s*\? b\.member_ids : \(b\.member_id\?\[b\.member_id\]:\[\]\);\s*\n\s*_ids\.forEach/.test(src)
     && !/bs\.forEach\(b=>\{ \(mids\(b\)\|\|\[\]\)\.forEach/.test(src));
  ok('★★ 確認視窗改寫實話（「最多」、沒綁 LINE 的收不到）',
     /最多 <b>\$\{st\.mem\} 位會員會收到 LINE 通知<\/b>（沒綁 LINE 的收不到）/.test(src)
     && !/位會員會立刻收到 LINE 通知<\/b> —— 這個收不回來/.test(src));
  ok('★ 成因寫在原地', /這一句在今天以前是假的/.test(src));
}


/* ══ 2026-10-26 事故：一按〔臨時停課〕就「操作沒有完成：Can't find variable: why」══
   openCloseDayModal 的紅框裡寫 cdayReasonText(why, free, ds)，但 why／free 是
   cdayRun 的區域變數，這支裡面沒有 → ReferenceError，視窗連畫都沒畫出來。
   10/23 加「可以自己填原因」時寫進去的，那天的停課已經做完，所以一直沒被按到。
   ⚠ 這種錯用 regex 抓不到（長得跟正常的字串內插一模一樣），所以這裡**真的把它跑一次**。 */
console.log('\n⑦ 開啟視窗不可以丟錯（實跑）');
(function(){
  const fn=grab('openCloseDayModal');
  let html='', threw=null;
  const el=()=>({value:'', style:{}, textContent:'', checked:true});
  const doc={ getElementById:()=>el() };
  const win={ _cdayDate:'2026-10-26' };
  const api=new Function('isManagerUp','showToast','ymd','TODAY','escH','showModal',
    'CDAY_REASONS','cdayReasonText','CDAY_EXT_DAYS','cdayRefresh','window','document',
    fn+';return openCloseDayModal;')(
      ()=>true, ()=>{}, ()=>'2026-10-26', new Date(), x=>String(x==null?'':x),
      h=>{ html=h; },
      [{key:'typhoon',label:'颱風停課'},{key:'other',label:'其他（自己打）'}],
      (k,f)=>`臨時停課・${k==='other'?(f||''):'颱風停課'}（x）`,
      7, ()=>{}, win, doc);
  /* ⚠ 這支是 async：裡面丟出來的例外是**非同步**的 rejection，try/catch 當場接不到
     （正式環境也是這樣，所以才會變成全域攔截器的那一則 toast）。
     判準因此只能看「有沒有真的把視窗畫出來」—— 丟錯時 showModal 根本沒被呼叫。 */
  try{ const r=api(); if(r&&r.catch) r.catch(e=>{ threw=e; }); }catch(e){ threw=e; }
  ok('★★★ 實跑 openCloseDayModal：視窗真的畫出來了（丟錯的話這裡會是空的）',
     html.indexOf('臨時停課')>=0 && html.indexOf('cday-go')>=0, {threw:threw&&String(threw.message||threw), html:html.slice(0,80)});
  ok('★★ 紅框裡的理由是「目前選的」那個，不是寫死的',
     /id="cday-why-echo"/.test(fn) && /cdayReasonText\(_why0, _free0, ds\)/.test(fn));
})();
console.log('\n　換原因時紅框要跟著變');
ok('★★ 下拉與自己打的字都會重畫那一句',
   /function cdayWhyEcho\(\)\{/.test(src)
   && /cdayReasonPick\(key\)\{[\s\S]{0,220}cdayWhyEcho\(\);/.test(src)
   && /oninput="cdayWhyEcho\(\)"/.test(src));
ok('　　理由寫在原地（紅框正是要人看清楚後果的地方）',
   /選了「設備維修」紅框還寫著「颱風停課」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
