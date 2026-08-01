const fs=require('fs');
/* 2026-07-31：課種判斷抽成共用的 bkIsGroup／bkIsSelf／bkIsMassage（見 TK_POCKETS）——
   沙箱裡給等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const h=fs.readFileSync('index.html','utf8');
const grabFn=n=>{let i=h.indexOf('function '+n+'(');if(h.slice(i-6,i)==='async ')i-=6;let d=0;
  for(let k=h.indexOf('{',i);k<h.length;k++){if(h[k]==='{')d++;else if(h[k]==='}'){d--;if(!d)return h.slice(i,k+1);}}};
// 取出真正的推估區塊
const s=h.indexOf("let tkCircleHtml='';\n  /* 2026-08-01");
const e=h.indexOf("const memMapD=", s);
const body=h.slice(s, e);
const COURSE_SHAPE={}, parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const TODAY=new Date(2026,6,27);
globalThis.window={_ttCache:[{id:'tt-pt',name:'教練課',category:'私人教練'},{id:'tt-fr',name:'友善教練課',category:'私人教練'}]};
/* 2026-08-01 使用者回報「明細這邊又跟會員票券不一樣了」：預約明細的票券卡不再自己推估，
   改直接問票券夾（walletCtx → buildWallet）。沙箱要注入的是票券夾那一整套。 */
const helpers=new Function('COURSE_SHAPE','parseYmd','ymd','TODAY',
  [grabFn('tkVisual'),grabFn('bkSelfBooked'),grabFn('ticketTokens'),grabFn('ticketCategoryOf'),grabFn('ticketMatchesCategory'),
   grabFn('bkIsMergedPT'),grabFn('bkTicketTypeOk'),grabFn('categoryOfTypeId'),grabFn('tkSharedIds'),grabFn('tkUsableBy'),
   grabFn('findRefundTargetTicket'),grabFn('allocBookingsToTickets'),grabFn('mids'),grabFn('bkHasMember'),
   grabFn('tkClass5'),grabFn('grpTicketAlloc'),grabFn('buildWallet')].join('\n')
  +'; return {ticketTokens,findRefundTargetTicket,allocBookingsToTickets,buildWallet};')(COURSE_SHAPE,parseYmd,ymd,TODAY);

async function render({b,tickets,bookings,tk=null}){
  const TT=globalThis.window._ttCache;
  const typeMap=Object.fromEntries(TT.map(t=>[t.id,t]));
  const walletCtx=async()=>({tickets,bookings,logs:[],types:TT,typeMap});
  const win=globalThis.window;
  const fmtExpire=(d)=>d||'永久有效';
  // 2026-07-30：圓形卡下方多了「更換票券」鈕（只給櫃檯），替身回 true
  const isDeskLike=()=>true;
  // 2026-07-30：票券卡多了購買日（tkBuyDateHtml），替身回固定字串
  const tkBuyDateHtml=(t)=>`購買 ${(t&&(t.purchase_date||t.start_date))||'—'}`;
  const fn=new Function('b','tk','window','findRefundTargetTicket','ticketTokens','fmtExpire','_payAlertLine','isDeskLike','tkBuyDateHtml','walletCtx','buildWallet','console',
    `return (async()=>{ ${body} return {tkCircleHtml,_tkCard,_wSlotD}; })();`);
  return await fn(b,tk,win,helpers.findRefundTargetTicket,helpers.ticketTokens,fmtExpire,'',isDeskLike,tkBuyDateHtml,walletCtx,helpers.buildWallet,console);
}
const T=(o)=>Object.assign({ticket_type_id:'tt-pt',member_id:'M',format:'1V1',sessions_total:4,sessions_remaining:1,expire_date:null},o);
const BK=(id,date,st)=>({id,member_id:'M',category:'私人教練',ticket_type_id:'tt-pt',format:'1V1',date,start_time:'19:00',status:st});
let pass=0,fail=0;
const chk=(n,c)=>{c?pass++:fail++;console.log(`  ${c?'✓':'✗'} ${n}`);};
(async()=>{
  const cur=BK('B-NOW','2026-07-21','checked_in');
  const hist=[BK('h1','2026-06-02','completed'),BK('h2','2026-06-16','completed'),
              BK('h3','2026-07-07','completed'),cur,BK('h5','2026-08-04','booked')];
  let r=await render({b:cur,tickets:[T({id:'t1'})],bookings:hist});
  console.log('無綁票券時的推估卡：');
  chk('有產生票券卡', r.tkCircleHtml.length>0);
  chk('票券夾蓋到了這一堂（不是退回挑票法）', !!r._wSlotD);
  chk('圓點數 = 票券總堂數 4', (r.tkCircleHtml.match(/class="mtk/g)||[]).length===4);
  chk('已用 3 堂取最近的 6/16', r.tkCircleHtml.includes('>6/16<'));
  chk('已用 3 堂取最近的 7/7', r.tkCircleHtml.includes('>7/7<'));
  chk('已用 3 堂取最近的 7/21', r.tkCircleHtml.includes('>7/21<'));
  /* 2026-08-01：明細改由票券夾供應後，課比票多時保留「最近的幾堂」——
     這張票帳面剩 1（＝已用 3），所以 3 顆實心（6/16 7/7 7/21）＋ 1 顆已預約（8/4），
     最早的 6/2 歸前一張票。圓點與票面餘額因此對得起來（原本是 4 顆實心＋餘額 1，
     自己就矛盾）。 */
  chk('留最近的四堂：8/4 佔最後一格', r.tkCircleHtml.includes('>8/4<'));
  chk('留最近的四堂：最早的 6/2 歸前一張票', !r.tkCircleHtml.includes('>6/2<'));
  chk('實心數＝票面已用 3（與餘額 1 對得起來）', (r.tkCircleHtml.match(/mtk-used/g)||[]).length===3);
  chk('本堂 7/21 標金框', /mtk-cur[^>]*>7\/21</.test(r.tkCircleHtml));
  // 票面剩 0（用畢）→ 8/4 屬下一張票，不得滑入
  r=await render({b:cur,tickets:[T({id:'t1',sessions_remaining:0})],bookings:hist});
  chk('票面剩 0 → 四格都算用掉，最近四堂上戳記', (r.tkCircleHtml.match(/mtk-used/g)||[]).length===4);
  chk('　　本堂 7/21 仍在圓點裡', r.tkCircleHtml.includes('>7/21<'));

  console.log('票種與 format 隔離：');
  const other=[BK('x1','2026-07-01','completed')]; other[0].format='1V2';
  r=await render({b:cur,tickets:[T({id:'t1'})],bookings:[...hist,...other]});
  chk('1V2 的課不混入 1V1 的卡', !r.tkCircleHtml.includes('>7/1<'));
  r=await render({b:cur,tickets:[T({id:'tf',ticket_type_id:'tt-fr'})],bookings:hist});
  chk('只有友善票時不誤用於教練課', r._tkCard===null || r.tkCircleHtml==='');

  console.log('有綁票券時維持原行為：');
  const bound=Object.assign(BK('B2','2026-07-21','checked_in'),{ticket_id:'t1'});
  const bhist=[Object.assign(BK('p1','2026-07-01','completed'),{ticket_id:'t1'}),bound];
  r=await render({b:bound,tickets:[T({id:'t1'})],bookings:bhist,tk:T({id:'t1'})});
  chk('本堂直接綁在這張票上（票券夾的直連戳記）', !!r._wSlotD);
  chk('仍正常顯示圓點', (r.tkCircleHtml.match(/class="mtk/g)||[]).length===4);

  console.log('邊界：');
  r=await render({b:cur,tickets:[],bookings:hist});
  chk('會員完全沒票券 → 不出卡也不報錯', r.tkCircleHtml==='');
  const trial=Object.assign(BK('B3','2026-07-21','booked'),{category:'體驗'});
  r=await render({b:trial,tickets:[T({id:'t1'})],bookings:[trial]});
  chk('體驗課不出票券卡', r.tkCircleHtml==='');

  console.log('真實案例 ① 楊文華 7/22（已簽到、票券顯示全新剩4）：');
  {
    const ds=['2026-05-25','2026-06-01','2026-06-05','2026-06-11','2026-06-24','2026-07-02','2026-07-08','2026-07-22'];
    const bks=ds.map((d,i)=>BK('a'+i,d,'checked_in'));
    const cur=bks[bks.length-1];
    const r=await render({b:cur,tickets:[T({id:'t',sessions_total:4,sessions_remaining:4})],bookings:bks});
    chk('圓點數 = 4', (r.tkCircleHtml.match(/class="mtk/g)||[]).length===4);
    chk('不再整排空心', !/mtk-free/.test(r.tkCircleHtml));
    chk('本堂 7/22 有出現且有日期', r.tkCircleHtml.includes('>7/22<'));
    chk('本堂標金框', /mtk-cur[^>]*>7\/22</.test(r.tkCircleHtml));
    chk('視窗是最後 4 堂（6/24 起）', r.tkCircleHtml.includes('>6/24<') && !r.tkCircleHtml.includes('>6/11<'));
    chk('本堂序號 = 4（不溢出）', r.tkCircleHtml.includes('第 <b>4</b> / 4 堂'));
  }
  console.log('真實案例 ② 陳蘭馨 7/27（未上課、票券已用完 12/12）：');
  {
    const at=['2026-05-04','2026-05-11','2026-05-18','2026-05-25','2026-06-08','2026-06-08',
              '2026-06-15','2026-06-15','2026-06-29','2026-06-29','2026-07-06','2026-07-06',
              '2026-07-13','2026-07-13','2026-07-20','2026-07-20'].map((d,i)=>BK('c'+i,d,'completed'));
    const bo=[BK('n1','2026-07-27','booked'),BK('n2','2026-07-27','booked')];
    const r=await render({b:bo[0],tickets:[T({id:'t',sessions_total:12,sessions_remaining:0})],bookings:[...at,...bo],thisId:'n1'});
    /* 2026-08-01：票券夾把最近 12 堂（10 個已上 ＋ 兩個 7/27 的名額）蓋在這張票上，
       帳面已用 12（12−0），所以 12 格全滿；放不下的 7/27 那一顆用紅虛線圈標「需補票」，
       不再默默消失（那正是 7/30 加紅圈的用意）。 */
    chk('圓點數 = 12 格全滿 ＋ 兩個 7/27 名額放不下的紅圈',
      (r.tkCircleHtml.match(/class="mtk/g)||[]).length===14
      && (r.tkCircleHtml.match(/mtk-used/g)||[]).length===12
      && (r.tkCircleHtml.match(/mtk-over/g)||[]).length===2);
    chk('★ 本堂 7/27 出現在圓點裡', r.tkCircleHtml.includes('>7/27<'));
    chk('本堂標金框', /mtk-cur[^>]*>7\/27</.test(r.tkCircleHtml));
    chk('　　放不下的那一顆是紅虛線圈（需補票）', /mtk-over/.test(r.tkCircleHtml));
    chk('視窗末端是本堂而非 7/20', r.tkCircleHtml.lastIndexOf('7/27')>r.tkCircleHtml.lastIndexOf('7/20'));
  }

  console.log('真實案例 ③ 陳蘭馨 7/27 10:30（共享票剩 3，8/3 才是最後一堂）：');
  {
    // 正式庫真實序列：22 筆已上課（5/4..7/20 每週兩堂）＋ 7/27×2、8/3 已預約
    const at=['2026-05-04','2026-05-04','2026-05-11','2026-05-11','2026-05-18','2026-05-18',
              '2026-05-25','2026-05-25','2026-05-29','2026-06-01','2026-06-08','2026-06-08',
              '2026-06-15','2026-06-15','2026-06-29','2026-06-29','2026-07-06','2026-07-06',
              '2026-07-13','2026-07-13','2026-07-20','2026-07-20'].map((d,i)=>BK('L'+i,d,'completed'));
    const bo=[BK('m1','2026-07-27','booked'),BK('m2','2026-07-27','booked'),BK('m3','2026-08-03','booked')];
    const r=await render({b:bo[1],tickets:[T({id:'t',sessions_total:10,sessions_remaining:3})],bookings:[...at,...bo]});
    chk('圓點數 = 10', (r.tkCircleHtml.match(/class="mtk/g)||[]).length===10);
    chk('★ 8/3 納入視窗（票面已用 7＜視窗內 8，往後滑 1）', r.tkCircleHtml.includes('>8/3<'));
    chk('本堂 7/27 第 9 / 10 堂（原本誤標 10/10）', r.tkCircleHtml.includes('第 <b>9</b> / 10 堂'));
    chk('已上課恰 7 堂實心', (r.tkCircleHtml.match(/mtk-used/g)||[]).length===7);
    chk('視窗頭端 6/29 只剩一堂（另一堂屬前一張票）', (r.tkCircleHtml.match(/>6\/29</g)||[]).length===1);
    chk('本堂標金框', /mtk-cur[^>]*>7\/27</.test(r.tkCircleHtml));
  }

  console.log('真實案例 ④ 李唯 7/29（帳面已用 3、清單只有 1 筆歷史）：');
  {
    // 票 6/17 起 4 堂剩 1（帳面已用 3，其中 2 堂在舊系統、prod 沒逐筆）；
    // prod 清單只有 7/08 已上＋7/29 預約 → 應顯示 3 實心＋本堂第 4/4，不是第 2/4
    const bks=[BK('L1','2026-07-08','completed'),BK('L2','2026-07-29','booked')];
    const r=await render({b:bks[1],tickets:[T({id:'t',sessions_total:4,sessions_remaining:1})],bookings:bks});
    chk('圓點 4 個', (r.tkCircleHtml.match(/class="mtk/g)||[]).length===4);
    chk('★ 3 顆實心（7/8 有日期＋2 顆 ✓）', (r.tkCircleHtml.match(/mtk-used/g)||[]).length===3);
    chk('★ 本堂第 4 / 4 堂（原本誤標 2/4）', r.tkCircleHtml.includes('第 <b>4</b> / 4 堂'));
    chk('本堂 7/29 空心＋金框', /mtk-booked mtk-cur[^>]*>7\/29</.test(r.tkCircleHtml));
  }

  console.log('未來的課且票券還有空位時，後續預約要顯示：');
  {
    const bks=[BK('p1','2026-07-01','completed'),BK('p2','2026-07-08','completed'),
               BK('f1','2026-07-29','booked'),BK('f2','2026-08-05','booked')];
    const r=await render({b:bks[2],tickets:[T({id:'t',sessions_total:4,sessions_remaining:2})],bookings:bks,thisId:'f1'});
    chk('圓點 4 個', (r.tkCircleHtml.match(/class="mtk/g)||[]).length===4);
    chk('已上的 7/1、7/8 實心', /mtk-used[^>]*>7\/1</.test(r.tkCircleHtml) && /mtk-used[^>]*>7\/8</.test(r.tkCircleHtml));
    chk('本堂 7/29 為已預約且標金框', /mtk-booked mtk-cur[^>]*>7\/29</.test(r.tkCircleHtml));
    chk('後續 8/5 也顯示', r.tkCircleHtml.includes('>8/5<'));
  }
  
/* 重設密碼（2026-07-30 使用者指示）：員工忘記密碼 → 一鍵還原成預設密碼 88888888，
   並強制他下次登入自己重設，櫃檯不用替他想一組新的、也不會有人一直用預設密碼。 */
console.log('\n員工重設密碼');
{
  const src=require('fs').readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  const ok2=(n,c)=>{ if(c){pass++;console.log('  \u2713 '+n);} else {fail++;console.log('  \u2717 '+n);} };
  ok2('\u2605 預設密碼是 88888888', /const STAFF_DEFAULT_PW='88888888';/.test(src));
  ok2('\u2605 不再要櫃檯輸入新密碼（改成一鍵還原）',
     !/id="rsp-pw"/.test(src) && /還原為預設密碼<\/button>/.test(src));
  ok2('\u2605 送出時用預設密碼', /body:JSON\.stringify\(\{action:'reset_password',email,password:STAFF_DEFAULT_PW\}\)/.test(src));
  ok2('\u2605 同時打開 must_setup（下次登入強制自己設定）',
     /\.update\(\{must_setup:true\}\)\.eq\('id',id\)/.test(src));
  ok2('\u2605 must_setup 寫入失敗要講出來，不能默默放過',
     /密碼已還原，但「強制改密碼」設定失敗/.test(src));
  ok2('   首次登入頁不接受沿用預設密碼', /if\(p1===STAFF_DEFAULT_PW\)\{err\.textContent='請勿沿用預設密碼/.test(src));
  ok2('   視窗上直接把預設密碼顯示出來給櫃檯轉告', /letter-spacing:\.14em;text-align:center;font-family:var\(--num\),inherit;">\$\{STAFF_DEFAULT_PW\}/.test(src));
  ok2('\u2605 帶管理員自己的 JWT，不是 anon key（2026-07-30 FORBIDDEN 真因）',
     /'Authorization':'Bearer '\+jwt,'apikey':window\.YUGYM_CONFIG\.anonKey/.test(src)
     && /const s=await sb\.auth\.getSession\(\); if\(s&&s\.data&&s\.data\.session\) jwt=s\.data\.session\.access_token;/.test(src));
  ok2('\u2605 沒有登入 token 就先講，不要送出去被 403',
     /if\(!jwt\)\{showToast\('登入狀態已過期，請重新登入後再試'\);return;\}/.test(src));
  ok2('\u2605 403 給看得懂的訊息（不是丟 FORBIDDEN 給櫃檯看）',
     /res\.status===403\|\|\/FORBIDDEN\/i\.test\(msg\)/.test(src)
     && /重設密碼只有管理員帳號可以操作，請用管理員登入/.test(src));
  ok2('\u2605 非管理員連視窗都不開', /if\(!\(SESSION && SESSION\.role==='admin'\)\)\{showToast\('重設密碼只有管理員帳號可以操作'\);return;\}/.test(src));
  ok2('   按鈕本身也只給管理員看', /const pwBtn = \(!isM && r\.phone && SESSION && SESSION\.role==='admin'\)/.test(src));
  ok2('\u2605 員工明細右上就有「重設密碼」（不用翻到系統資料分頁）',
     /\? `<button class="btn btn-ghost btn-sm" onclick="openResetStaffPw\('\$\{r\.id\}'\)">重設密碼<\/button>` : ''/.test(src));
  ok2('   會員的明細不會出現這顆鈕', /\(!isM && r\.phone &&/.test(src));
  ok2('   編輯模式下讓位給取消／儲存', /PP\.editing[\s\S]{0,200}: \(isM \? '' : pwBtn\+/.test(src));
  ok2('   沒有手機帳號的員工擋掉', /if\(!c\.phone\)\{showToast\('此員工沒有手機帳號，無法重設'\);return;\}/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
