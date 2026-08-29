const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
/* 2026-08-06：取消但「扣課不退」的那一堂仍算用掉（黃品華案例）—— 沙箱補上替身 */
globalThis.bkEatenCancel=b=>!!(b&&b.status==='cancelled'&&b.refund_waived);
/* 2026-08-06 稽核 R4：推算切分日 —— 沙箱測資沒有 created_at，一律視為舊資料（照舊推算） */
globalThis.inferAllowed=()=>true;
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const h=fs.readFileSync('index.html','utf8');
const grabFn=n=>{const i=h.indexOf('function '+n+'(');let d=0;for(let k=h.indexOf('{',i);k<h.length;k++){if(h[k]==='{')d++;else if(h[k]==='}'){d--;if(!d)return h.slice(i,k+1);}}};
// 取出 index.html 內真正的團課名單渲染程式碼
const s=h.indexOf("const _seatKeys=seatKeysDisplay(b);");
const e=h.indexOf("尚未排名單</div>'", s);
const body=h.slice(s, h.indexOf(";", e)+1);
if(s<0||e<0) throw new Error('找不到目標程式碼');

const COURSE_SHAPE={};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const ticketCategoryOf=t=>t.__cat;
const attObj=b=>b.attendance||{};
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const TODAY=new Date(2026,6,27);
/* 2026-07-31：名單圓點改吃 ticket_logs 的扣課紀錄（grpTicketAlloc）
   2026-08-01：整段改由票券夾（walletCtx → buildWallet）供應 —— 使用者回報
   「明細這邊又跟會員票券不一樣了…我們不是從會員票券這邊拉圓形卡過來用的嗎」。
   所以沙箱要注入的是票券夾那一整套，測的才是真的跑的那條路。 */
const TYPES=[{id:'tt-g',name:'團體課',category:'小班肌力',color:'group'}];
const helpers=new Function('COURSE_SHAPE','parseYmd','attObj','ymd','TODAY',[grabFn('tkVisual'),grabFn('bkSelfBooked'),grabFn('ticketTokens'),grabFn('mids'),
  grabFn('seatKeys'),grabFn('seatMid'),grabFn('seatKeysDisplay'),grabFn('seatNo'),
  grabFn('tkSharedIds'),grabFn('tkUsableBy'),grabFn('allocBookingsToTickets'),
  grabFn('grpTicketAlloc'),grabFn('grpMergeAlloc'),grabFn('bkHasMember'),grabFn('tkClass5'),
  grabFn('buildWallet'),grabFn('tkNoTag')].join('\n')+
  '; return {tkVisual,ticketTokens,mids,seatKeys,seatMid,seatKeysDisplay,seatNo,tkUsableBy,allocBookingsToTickets,grpTicketAlloc,grpMergeAlloc,bkHasMember,tkClass5,buildWallet,tkNoTag};')(COURSE_SHAPE,parseYmd,attObj,ymd,TODAY);

async function render({ids,att={},tickets=[],bookings=[],logs=[],names={},thisDate='2026-07-27',thisId='B-NOW'}){
  const dbGetAll=async t=>t==='member_tickets'?tickets:t==='bookings'?bookings:t==='ticket_logs'?logs:t==='ticket_types'?TYPES:[];
  const typeMap=Object.fromEntries(TYPES.map(t=>[t.id,t]));
  const walletCtx=async()=>({tickets,bookings,logs,types:TYPES,typeMap});
  // 名額鍵是從 b.member_ids 推的（2026-07-30），所以 b 也要帶名單
  const b={id:thisId,date:thisDate,attendance:att,member_ids:ids};
  const fn=new Function('gIdsD','b','memMapD','groupCkOK','isPastD','attObj','ticketCategoryOf','dbGetAll','window','mids','ticketTokens','seatKeys','seatMid','seatKeysDisplay','seatNo','tkUsableBy','allocBookingsToTickets','grpTicketAlloc','grpMergeAlloc','walletCtx','buildWallet','tkNoTag','console',
    `return (async()=>{ const att=attObj(b); ${body} return rows; })();`);
  return await fn(ids,b,names,true,false,attObj,ticketCategoryOf,dbGetAll,{_ttCache:TYPES},helpers.mids,helpers.ticketTokens,
    helpers.seatKeys,helpers.seatMid,helpers.seatKeysDisplay,helpers.seatNo,helpers.tkUsableBy,helpers.allocBookingsToTickets,helpers.grpTicketAlloc,helpers.grpMergeAlloc,
    walletCtx,helpers.buildWallet,helpers.tkNoTag,console);
}
const T=(o)=>Object.assign({__cat:'小班肌力',ticket_type_id:'tt-g',source:'purchase'},o);
const BK=(id,date,st,ids)=>({id,date,start_time:'11:00',status:st,category:'小班肌力',member_ids:ids,ticket_type_id:'tt-g'});
let pass=0,fail=0;
const chk=(n,c)=>{c?pass++:fail++;console.log(`  ${c?'✓':'✗'} ${n}`);};
(async()=>{
  /* 鍾明潔情境（2026-07-30 二修）：名單圓點改與「會員票券頁」共用 allocBookingsToTickets
     —— 同一個問題不該有兩套推法（使用者：「會員票券是一切的基礎，預約明細要從這邊調出去」）。
     舊票只有 3 堂容量、且都排在 live 之前 → 5/09 5/17 5/31 落到最早那張，
     7/17 7/25 落到下一張，live（7/01 起、4 堂）承接 7/27 這一堂。
     這與票券頁看到的完全一致，才是「對齊」的意思。 */
  const many=[...Array(16)].map((_,i)=>T({id:'old'+i,member_id:'M',sessions_total:3,sessions_remaining:0,start_date:'2026-0'+(1+i%9)+'-01'}));
  const live=T({id:'live',member_id:'M',sessions_total:4,sessions_remaining:2,start_date:'2026-07-01'});
  const hist=['2026-05-09','2026-05-17','2026-05-31','2026-07-17','2026-07-25']
    .map((d,i)=>BK('h'+i,d,'checked_in',['M']));
  let html=await render({ids:['M'],tickets:[...many,live],bookings:[...hist,BK('B-NOW','2026-07-27','booked',['M'])],names:{M:'鍾明潔'}});
  console.log('挑「目前在用」的那張票：');
  chk('圓點數 = 該票總堂數 4', (html.match(/class="mtk mtk-/g)||[]).length===4);
  chk('★ 舊票還有容量時，舊出席歸舊票（與票券頁同一套分配）',
    !html.includes('>7/17<') && !html.includes('>7/25<'));
  chk('不會取到最早的 5/9', !html.includes('>5/9<'));
  chk('本堂 7/27 標金框', /mtk-booked mtk-cur[^>]*>7\/27</.test(html));
  /* 2026-07-31 使用者回報：「這邊顯示錯誤，但是會員票券那邊是正確」——
     陳暐濰的簽到列少了本堂 8/06 那顆圓點（8/13 8/20 8/27 ＋ 一顆空的）。
     成因：名單這邊靠先進先出「猜」是哪張票，會員票券頁讀的是 ticket_logs 的扣課紀錄。
     改成同一份對照：這堂課當初扣了哪張票，就顯示那張票、那張票的圓點。 */
  console.log('本堂扣的那張票優先（扣課紀錄）：');
  {
    const t4w=T({id:'t4w',member_id:'M',sessions_total:4,sessions_remaining:0,start_date:'2026-08-06',expire_date:'2026-09-03'});
    const tmk=T({id:'tmk',member_id:'M',sessions_total:1,sessions_remaining:1,source:'makeup',start_date:'2026-07-31'});
    const bkG=['2026-08-06','2026-08-13','2026-08-20','2026-08-27'].map((d,i)=>BK('g'+i,d,'booked',['M']));
    bkG[0].id='B-NOW';
    const lg=bkG.map(x=>({ticket_id:'t4w',booking_id:x.id,action:'deduct'}));
    let h2=await render({ids:['M'],tickets:[t4w,tmk],bookings:bkG,logs:lg,names:{M:'陳暐濰'},thisDate:'2026-08-06'});
    chk('★ 顯示扣課的那張四週票（4 格），不是剩 1 堂的補課券', (h2.match(/class="mtk mtk-/g)||[]).length===4);
    chk('★ 本堂 8/6 有圓點且標金框', /mtk-booked mtk-cur[^>]*>8\/6</.test(h2));
    chk('★ 四堂日期都在（沒有多出來的空圈）',
      ['8/6','8/13','8/20','8/27'].every(d=>h2.includes('>'+d+'<')) && !/mtk-free/.test(h2));
    /* 沒有扣課紀錄（舊系統匯入）時退回票券夾的推算。
       2026-08-01：補課券不再參與先進先出推算（游晴雅案例：7/30 請假發的兩張券，
       被推算算成用來扣 7/30 那一堂，於是券顯示已用畢、可約堂數 0），
       所以這裡推算到的是那張四週票，四堂都對得上 —— 比原本挑到剩 1 堂的補課券合理。 */
    h2=await render({ids:['M'],tickets:[t4w,tmk],bookings:bkG,logs:[],names:{M:'陳暐濰'},thisDate:'2026-08-06'});
    chk('　　沒有扣課紀錄時推算到那張四週票（補課券不參與推算）',
      (h2.match(/class="mtk mtk-/g)||[]).length===4 && h2.includes('>8/6<'));
  }

  console.log('不再顯示文字標籤：');
  chk('沒有「建議續約」', !html.includes('建議續約'));
  chk('沒有「需購票」', !html.includes('需購票'));
  chk('沒有「團體課餘 N 堂」', !html.includes('團體課餘'));

  console.log('全部用完的會員：');
  html=await render({ids:['M'],tickets:[T({id:'a',member_id:'M',sessions_total:2,sessions_remaining:0,start_date:'2026-05-01'}),
    T({id:'b',member_id:'M',sessions_total:4,sessions_remaining:0,start_date:'2026-07-01'})],
    bookings:hist.map(x=>({...x,member_ids:['M']})),names:{M:'許建助'}});
  chk('取最近一張（4 格）', (html.match(/class="mtk mtk-/g)||[]).length===4);
  /* 2026-07-30 二修：改用 allocBookingsToTickets 後，5 月的課歸 5/01 那張（2 堂）、
     7 月的兩堂歸 7/01 這張。
     2026-08-01 三修：改由票券夾供應之後，已用堂數不再只數清單裡的出席筆數，
     而是「帳面已用（總 4 − 剩餘 0）」與清單取大者 —— 這張票的餘額是 0，
     帳面就是四堂都用掉了，只是舊系統匯入的預約只留下兩堂的紀錄。
     這正是會員票券頁顯示的樣子，兩邊一致才是重點（使用者：
     「我們不是從會員票券這邊拉圓形卡過來用的嗎」）。 */
  chk('★ 有日期的兩堂是 7 月那兩堂（5 月的歸前一張票）',
    html.includes('>7/17<') && html.includes('>7/25<') && !html.includes('>5/9<'));
  chk('★ 已用堂數跟著票面餘額（剩 0 → 四格都算用掉，與會員票券頁同一個數字）',
    (html.match(/mtk-used/g)||[]).length===4);

  /* 2026-07-30 使用者指示改成「一個名額一列」：原本三個名額合併成一列標「3 個名額」，
     簽到／請假／取消只有一個開關，沒辦法只處理其中一位。 */
  console.log('多名額逐列與補課券：');
  html=await render({ids:['M','M','M'],tickets:[live],bookings:[],names:{M:'許佳慈'}});
  chk('三個名額＝三列', (html.match(/許佳慈/g)||[]).length===3);
  chk('每列標「第 N 個名額」', html.includes('第 1 個名額')&&html.includes('第 2 個名額')&&html.includes('第 3 個名額'));
  chk('三列各有自己的簽到鈕', (html.match(/toggleGroupAttend\(/g)||[]).length===3);
  chk('第 2、3 列帶名額鍵 M#2 / M#3', html.includes("'M#2'")&&html.includes("'M#3'"));
  /* 2026-07-31 使用者指示：同一個會員約兩個名額，兩個名額都要顯示圓形卡
     （原本只畫第一列 —— 第二個位子看不出扣哪張票、剩幾堂）。 */
  chk('★ 每個名額都畫自己的圓形卡（三個名額＝三組）', (html.match(/mck-dots2/g)||[]).length===3);
  /* 2026-08-06 使用者指示：「客人再次用補課券補課，就只要顯示補課的這一張」——
     標籤改成看「這一格用的是不是補課券」，不再是「這個人手上有沒有補課券」
     （李曉娟 8/8 請假那一列本來也被掛上「含補課券」，看起來像原票券混了補課券）。 */
  html=await render({ids:['M'],tickets:[T({id:'mk',member_id:'M',sessions_total:1,sessions_remaining:1,source:'makeup',start_date:'2026-07-24'})],bookings:[],names:{M:'徐翎娟'}});
  chk('★ 這一格用的就是補課券 → 標「補課券」', html.includes('>補課券<'));
  html=await render({ids:['M'],tickets:[
      T({id:'g1',member_id:'M',sessions_total:4,sessions_remaining:2,start_date:'2026-07-01'}),
      T({id:'mk2',member_id:'M',sessions_total:1,sessions_remaining:1,source:'makeup',start_date:'2026-07-24'})],
    bookings:[],names:{M:'徐翎娟'}});
  chk('★ 這一格是一般團體課票 → 不因為手上另有補課券就標', !html.includes('>補課券<'));

  console.log('邊界：');
  html=await render({ids:['M'],tickets:[],bookings:[],names:{M:'無票會員'}});
  chk('完全沒票券不出圓點也不報錯', !html.includes('mck-dots2') && html.includes('無票會員'));
  html=await render({ids:[],tickets:[],bookings:[]});
  chk('空名單提示', html.includes('尚未排名單'));

  console.log('多位子＝多堂（呂宜臻情境）：');
  {
    const tk2=T({id:'t2',member_id:'M',sessions_total:2,sessions_remaining:2,start_date:'2026-07-24'});
    const cls=BK('B-NOW','2026-07-26','booked',['M','M']);   // 同一人佔 2 個位子
    let html=await render({ids:['M','M'],tickets:[tk2],bookings:[cls],names:{M:'呂宜臻'},thisDate:'2026-07-26',thisId:'B-NOW'});
    /* 兩列 × 每列兩顆（這張票共 2 堂，兩個位子各扣一堂）＝ 4 顆 */
    chk('★ 兩列都有圓形卡（2026-07-31）', (html.match(/mck-dots2/g)||[]).length===2);
    chk('每列兩個圓點都顯示 7/26', (html.match(/>7\/26</g)||[]).length===4);
    chk('圓點總數 = 2 顆 × 2 列', (html.match(/class="mtk mtk-/g)||[]).length===4);
    /* 2026-08-03 使用者指示「第一名額跟第二名額圓課卡要分開來圈」：
       原本 4 顆全圈（兩列各兩顆）；現在每列只圈自己的那顆 → 共 2。 */
    chk('本堂金框每列各一顆（分開來圈）', (html.match(/mtk-cur/g)||[]).length===2);
    chk('沒有殘留空心', !html.includes('mtk-free'));
    chk('兩個名額＝兩列，各標第幾個', (html.match(/呂宜臻/g)||[]).length===2
      && html.includes('第 1 個名額') && html.includes('第 2 個名額'));
  }
  {
    // used=0 的票不可把過去所有出席都塞進來（slice(-0) 陷阱）
    const tk3=T({id:'t3',member_id:'M',sessions_total:3,sessions_remaining:3,start_date:'2026-07-20'});
    const past=['2026-05-01','2026-05-08'].map((d,i)=>BK('p'+i,d,'checked_in',['M']));
    let html=await render({ids:['M'],tickets:[tk3],bookings:past,names:{M:'新票會員'}});
    chk('全新票券不顯示舊出席日期', !html.includes('>5/1<') && !html.includes('>5/8<'));
    chk('全新票券三格皆空心', (html.match(/mtk-free/g)||[]).length===3);
  }

  console.log('新制預約（BK-）已預扣，不可再算成已上課：');
  {
    // 黃孟琦情境：4 堂票全約在 8 月、一堂都還沒上 → 餘額 0，但已上課應為 0
    /* 2026-07-30 二修：補上「前一張已用完的票」——現實中 7 月那四堂是上一期的課，
       原本的測資只給一張票，分配演算法沒有別的地方可放，才會把 7/28 算進新票。 */
    const tk4prev=T({id:'g4prev',member_id:'M',sessions_total:4,sessions_remaining:0,start_date:'2026-06-30'});
    const tk4=T({id:'g4',member_id:'M',sessions_total:4,sessions_remaining:0,start_date:'2026-07-28'});
    const past=['2026-07-07','2026-07-16','2026-07-23','2026-07-28'].map((d,i)=>BK('p'+i,d,'checked_in',['M']));
    const future=['2026-08-04','2026-08-11','2026-08-18','2026-08-25']
      .map((d,i)=>({id:'BK-f'+i,date:d,start_time:'16:30',status:'booked',category:'小班肌力',member_ids:['M']}));
    let html=await render({ids:['M'],tickets:[tk4prev,tk4],bookings:[...past,...future],names:{M:'黃孟琦'},
      thisDate:'2026-08-04',thisId:'BK-f0'});
    chk('★ 不會把七月的舊出席畫成這張票的實心', !html.includes('>7/7<')&&!html.includes('>7/28<'));
    chk('★ 四顆都是空心＋八月預約日期', (html.match(/mtk-booked/g)||[]).length===4);
    chk('　　本堂 8/4 標金框', /mtk-booked mtk-cur[^>]*>8\/4</.test(html));
  }

  console.log('請假狀態的名單列：');
  {
    const tk=T({id:'t',member_id:'M',sessions_total:4,sessions_remaining:2,start_date:'2026-07-01'});
    let html=await render({ids:['M'],att:{M:'leave'},tickets:[tk],bookings:[],names:{M:'徐翎娟'}});
    chk('顯示「請假」標籤', html.includes('>請假</span>'));
    chk('不顯示「未簽到」', !html.includes('未簽到'));
    chk('按鈕為「取消請假」', html.includes('>取消請假<'));
    chk('請假時不出現簽到鈕', !html.includes('>簽到<'));

    html=await render({ids:['M'],att:{},tickets:[tk],bookings:[],names:{M:'徐翎娟'}});
    chk('未簽到時同時有請假與簽到鈕', html.includes('>請假<') && html.includes('>簽到<'));
    chk('請假鈕呼叫 groupToggleLeave', html.includes("groupToggleLeave('B-NOW','M')"));

    html=await render({ids:['M'],att:{M:'checked_in'},tickets:[tk],bookings:[],names:{M:'徐翎娟'}});
    chk('已簽到者不顯示請假鈕', !html.includes('>請假<'));
    chk('已簽到者可取消簽到', html.includes('>取消簽到<'));
  }
  /* 2026-07-30 使用者回報：8/1 的團課預約明細，三位會員的圓形卡都沒看到 8/1。
     原因是圓點只畫 sessions_total 顆——票券已用完（剩 0）時就沒有位子放已預約的課。
     票用完或新票還沒買的那幾堂要另外用紅虛線圈標出來，櫃檯才知道要補票。 */
  console.log('\n票券堂數放不下的已預約課程（紅虛線圈）');
  {
    const T={id:'TK',ticket_type_id:'grp',sessions_total:4,sessions_remaining:0};
    const done=['2026-05-23','2026-06-06','2026-06-13','2026-06-20']
      .map((d,i)=>({id:'D'+i,date:d,start_time:'11:00',status:'checked_in',category:'小班肌力'}));
    const soon={id:'B-0801',date:'2026-08-01',start_time:'11:00',status:'booked',category:'小班肌力'};
    const h=helpers.ticketTokens(T,[...done,soon],{},4,'B-0801');
    chk('★ 票券 4 堂全用完，8/1 的預約仍看得到', h.includes('8/1'));
    chk('★ 用紅虛線圈標示（本張票券已無堂數可對應）', /class="mtk mtk-over/.test(h));
    chk('★ 本堂仍會被高亮（mtk-cur）', /mtk-over mtk-cur/.test(h));
    chk('　　原本的 4 顆實心不受影響', (h.match(/mtk-used/g)||[]).length===4);
    chk('　　總共畫 5 顆（4 實心＋1 溢出）', (h.match(/class="mtk /g)||[]).length===5);
    const h2=helpers.ticketTokens({id:'T2',ticket_type_id:'grp',sessions_total:4,sessions_remaining:3},
      [done[0],soon],{},1,'B-0801');
    chk('　　票還有堂數時，已預約的照舊畫在空位（不是紅圈）',
      h2.includes('8/1') && /mtk-booked/.test(h2) && !/mtk-over/.test(h2));
    chk('　　紅虛線圈的樣式有定義', /\.mtk-over\{[^}]*var\(--danger/.test(require('fs').readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8')));
  }


  /* 團課票券可指定要扣哪一張（2026-07-30 使用者指示）——
     會員同時有「12 個月 12 堂」與「四週 4 堂優惠」時，先進先出會把長期方案先吃掉，
     快到期的優惠票反而被留到過期。 */
  console.log('\n團課票券可指定要扣哪一張');
  {
    const src=require('fs').readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
    chk('★ 挑票排序：沒有效期的排最後（不再讓長期方案插到最前面）',
      /String\(a\.expire_date\|\|'9999-12-31'\)\.localeCompare\(String\(b\.expire_date\|\|'9999-12-31'\)\)/.test(src)
      && !/return \(a\.expire_date\|\|''\)\.localeCompare\(b\.expire_date\|\|''\);/.test(src));
    /* 2026-08-05：改逐名額挑票——一個名額一個下拉，名額1用A票、名額2用B票 */
    /* 2026-08-29 二修定案：名單改「一列一位使用人」，挑票＝挑那一列（不再逐名額挑）。
       指定的存法沒變（grpPickTk / grpPickOf 還是同一組，grpRowAdd 會寫進去）。 */
    chk('★ 櫃檯：名單上指定票券（改成一列一位使用人）', /function grpPickTk\(mid,seatIdx,tkid\)\{/.test(src)
      && /function grpPickOf\(mid,seatIdx\)\{/.test(src)
      && /const next=r\.tkIds\.find\(id=>used\.indexOf\(id\)<0\) \|\| r\.tkIds\[0\] \|\| null;/.test(src));
    /* 2026-08-29 使用者：「我在預約團課的時候選擇媽媽這張或姐姐這張」——
       使用人移到最前面（方案名稱三張都一樣，排後面要讀到行尾才分得出來）。 */
    chk('　　列上左邊姓名（使用人）＋手機、右邊可用/總堂數',
      /<span class="grp-nm">\$\{nameHtml\}/.test(src)
      && /m\.phone\?`<span class="grp-ph">\$\{fmtPhone\(m\.phone\)\}<\/span>`:''/.test(src)
      && /const tag=_already\+\(tks\.length\?`可用 \$\{gLeft\} \/ \$\{gTot\|\|gLeft\} 堂`:/.test(src));
    chk('★ 管理名單存檔時照逐名額指定的扣（新名額索引接在既有名額後）',
      /const want=grpPickOf\(mid,_i\);/.test(src)
      && /const _i=\(_seatIdx\[mid\]=\(_seatIdx\[mid\]==null\?\(pc\[mid\]\|\|0\):_seatIdx\[mid\]\+1\)\);/.test(src)
      && /tk=cand\.find\(t=>t\.id===want\)\|\|null;/.test(src));
    // 2026-07-30：各天可不同時間 → 挑票改用那一筆的時間 tW
    chk('★ 新增團體課（含連續數週）也照逐名額指定的扣',
      /if\(want\)\{ const cand=await listUsableTickets\(mid,type_id,dW,tW\); tk=cand\.find\(x=>x\.id===want\)\|\|null; \}/.test(src)
      && /const _i=\(_si\[mid\]=\(_si\[mid\]==null\?0:_si\[mid\]\+1\)\);/.test(src));
    chk('　　指定的票不能用時退回自動挑選，不讓整堂建不起來',
      /if\(!tk\) tk=await findUsableTicket\(mid,type_id,dW,tW\);/.test(src)
      && /指定的票券已不能用，改用最快到期的那張/.test(src));
    /* 三處：兩個視窗各一次，加上 2026-08-29 ［＋新增］的單選（換人時一併清掉舊指定） */
    chk('　　每次開視窗重置指定，不跨堂殘留',
      (src.match(/window\._grpTkPick=\{\};/g)||[]).length===3);
    chk('★ 會員端：多張票時出下拉，預設最快到期',
      /<select id="grp-join-tk" onchange="window\._grpJoinTk=this\.value"/.test(src)
      && /const cand=\(s\.grpTks\|\|\[\]\)\.filter\(t=>!t\.expire_date\|\|t\.expire_date>=c\.date\)/.test(src));
    chk('★ 會員端報名時把指定的票帶給 RPC',
      /sb\.rpc\('fn_member_join_group',\{p_booking_id:bid,p_ticket_id:_pick\}\)/.test(src));
    chk('　　指定失效有看得懂的訊息', /'TICKET\.INVALID_PICK':'選的票券已不能用於這堂課/.test(src));
    chk('　　只有一張時不出下拉、維持原本的一行說明', /cand\.length===1/.test(src));
  }

  /* 2026-08-01 使用者指示（附許佳慈的票券頁截圖）：
   「根據會員的票券編號來看 8/7 的預約明細應該要顯示 #15 #15 #13」
   「所以在預約明細應該要去對應票券編號，而不是快進快出（這個出錯率太高了）」
   —— 同一個人的三個名額可以扣到不同張票，明細每一列要標出自己那張的 #N，
   而且要照「扣課紀錄」對，不是先進先出猜。
   正式庫的 ticket_logs 本來就是這樣記的（8/07 三筆 deduct：#15 #15 #13），
   問題只在明細整堂只問一次 ticketOf，三列都畫成同一張。 */
console.log('逐名額各自對到票（許佳慈 8/07 情境）：');
{
  const mk=(id,start,exp)=>T({id,member_id:'M',sessions_total:4,sessions_remaining:0,
    plan_name:'團課 4週優惠',start_date:start,expire_date:exp,purchase_date:'2026-08-01'});
  const tkA=mk('tkA','2026-08-07','2026-09-04');   // 先建立 → #1
  const tkB=mk('tkB','2026-08-24','2026-09-21');   // 後建立 → #2
  const cls=BK('B-NOW','2026-08-07','booked',['M','M','M']);
  const logs=[
    {id:'L1',ticket_id:'tkB',booking_id:'B-NOW',action:'deduct',created_at:'2026-08-01T04:00:00Z'},
    {id:'L2',ticket_id:'tkB',booking_id:'B-NOW',action:'deduct',created_at:'2026-08-01T04:00:01Z'},
    {id:'L3',ticket_id:'tkA',booking_id:'B-NOW',action:'deduct',created_at:'2026-08-01T04:00:02Z'},
  ];
  const html=await render({ids:['M','M','M'],tickets:[tkA,tkB],bookings:[cls],logs,
    names:{M:'許佳慈'},thisDate:'2026-08-07',thisId:'B-NOW'});
  chk('★ 三個名額＝三列，各有自己的圓形卡', (html.match(/mck-dots2/g)||[]).length===3);
  const nos=[...html.matchAll(/class="tk-no"[^>]*>#(\d+)</g)].map(m=>m[1]);
  chk('★ 每一列標出自己那張票的編號（兩張 #2、一張 #1，與扣課紀錄一致）',
      nos.length===3 && nos.filter(x=>x==='2').length===2 && nos.filter(x=>x==='1').length===1);
  chk('★ 對的是扣課紀錄，不是先進先出 —— tkB 的效期比較晚，先進先出會挑 tkA',
      nos.filter(x=>x==='2').length===2);
  chk('　　方案名也標出來，方便跟票券頁對照', (html.match(/團課 4週優惠/g)||[]).length===3);
  /* 沒有扣課紀錄的那種（舊系統匯入）仍要有東西可看，不能整片空白 */
  const html2=await render({ids:['M','M'],tickets:[tkA],bookings:[BK('B2','2026-08-07','booked',['M','M'])],
    logs:[],names:{M:'許佳慈'},thisDate:'2026-08-07',thisId:'B2'});
  chk('　　沒有扣課紀錄時退回票券夾的推算，兩列都還是有卡',
      (html2.match(/mck-dots2/g)||[]).length===2);
}

console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
