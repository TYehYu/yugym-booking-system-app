const fs=require('fs');
const h=fs.readFileSync('index.html','utf8');
const grabFn=n=>{const i=h.indexOf('function '+n+'(');let d=0;for(let k=h.indexOf('{',i);k<h.length;k++){if(h[k]==='{')d++;else if(h[k]==='}'){d--;if(!d)return h.slice(i,k+1);}}};
// 取出 index.html 內真正的團課名單渲染程式碼
const s=h.indexOf("const _seat={}; gIdsD.forEach");
const e=h.indexOf("尚未排名單</div>'", s);
const body=h.slice(s, h.indexOf(";", e)+1);
if(s<0||e<0) throw new Error('找不到目標程式碼');

const COURSE_SHAPE={};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const helpers=new Function('COURSE_SHAPE','parseYmd',[grabFn('tkVisual'),grabFn('ticketTokens'),grabFn('mids')].join('\n')+
  '; return {tkVisual,ticketTokens,mids};')(COURSE_SHAPE,parseYmd);
const ticketCategoryOf=t=>t.__cat;
const attObj=b=>b.attendance||{};

async function render({ids,att={},tickets=[],bookings=[],names={},thisDate='2026-07-27',thisId='B-NOW'}){
  const dbGetAll=async t=>t==='member_tickets'?tickets:t==='bookings'?bookings:[];
  const b={id:thisId,date:thisDate,attendance:att};
  const fn=new Function('gIdsD','b','memMapD','groupCkOK','isPastD','attObj','ticketCategoryOf','dbGetAll','window','mids','ticketTokens',
    `return (async()=>{ const att=attObj(b); ${body} return rows; })();`);
  return await fn(ids,b,names,true,false,attObj,ticketCategoryOf,dbGetAll,{_ttCache:[]},helpers.mids,helpers.ticketTokens);
}
const T=(o)=>Object.assign({__cat:'小班肌力',ticket_type_id:'tt-g',source:'purchase'},o);
const BK=(id,date,st,ids)=>({id,date,start_time:'11:00',status:st,category:'小班肌力',member_ids:ids});
let pass=0,fail=0;
const chk=(n,c)=>{c?pass++:fail++;console.log(`  ${c?'✓':'✗'} ${n}`);};
(async()=>{
  // 鍾明潔情境：17 張票，只有一張 2/4 還有餘額；出席 5 堂 → 該票用掉 2 堂，日期取最近 2 堂
  const many=[...Array(16)].map((_,i)=>T({id:'old'+i,member_id:'M',sessions_total:3,sessions_remaining:0,start_date:'2026-0'+(1+i%9)+'-01'}));
  const live=T({id:'live',member_id:'M',sessions_total:4,sessions_remaining:2,start_date:'2026-07-01'});
  const hist=['2026-05-09','2026-05-17','2026-05-31','2026-07-17','2026-07-25']
    .map((d,i)=>BK('h'+i,d,'checked_in',['M']));
  let html=await render({ids:['M'],tickets:[...many,live],bookings:[...hist,BK('B-NOW','2026-07-27','booked',['M'])],names:{M:'鍾明潔'}});
  console.log('挑「目前在用」的那張票：');
  chk('圓點數 = 該票總堂數 4', (html.match(/class="mtk/g)||[]).length===4);
  chk('已用 2 堂取最近的 7/17', html.includes('>7/17<'));
  chk('已用 2 堂取最近的 7/25', html.includes('>7/25<'));
  chk('不會取到最早的 5/9', !html.includes('>5/9<'));
  chk('本堂 7/27 標金框', /mtk-booked mtk-cur[^>]*>7\/27</.test(html));
  console.log('不再顯示文字標籤：');
  chk('沒有「建議續約」', !html.includes('建議續約'));
  chk('沒有「需購票」', !html.includes('需購票'));
  chk('沒有「團體課餘 N 堂」', !html.includes('團體課餘'));

  console.log('全部用完的會員：');
  html=await render({ids:['M'],tickets:[T({id:'a',member_id:'M',sessions_total:2,sessions_remaining:0,start_date:'2026-05-01'}),
    T({id:'b',member_id:'M',sessions_total:4,sessions_remaining:0,start_date:'2026-07-01'})],
    bookings:hist.map(x=>({...x,member_ids:['M']})),names:{M:'許建助'}});
  chk('取最近一張（4 格）', (html.match(/class="mtk/g)||[]).length===4);
  chk('整排實心＝已用畢', (html.match(/mtk-used/g)||[]).length===4 && !html.includes('mtk-free'));

  console.log('多位子合併與補課券：');
  html=await render({ids:['M','M','M'],tickets:[live],bookings:[],names:{M:'許佳慈'}});
  chk('同一人只一列', (html.match(/許佳慈/g)||[]).length===1);
  chk('標「3 個名額」（2026-07-29 使用者指示：不用 ×N）', html.includes('3 個名額'));
  html=await render({ids:['M'],tickets:[T({id:'mk',member_id:'M',sessions_total:1,sessions_remaining:1,source:'makeup',start_date:'2026-07-24'})],bookings:[],names:{M:'徐翎娟'}});
  chk('顯示「含補課券」', html.includes('含補課券'));

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
    chk('兩個圓點都顯示 7/26', (html.match(/>7\/26</g)||[]).length===2);
    chk('圓點總數 = 2', (html.match(/class="mtk/g)||[]).length===2);
    chk('兩個都標本堂金框', (html.match(/mtk-cur/g)||[]).length===2);
    chk('沒有殘留空心', !html.includes('mtk-free'));
    chk('名字仍合併成一列、標「2 個名額」', (html.match(/呂宜臻/g)||[]).length===1 && html.includes('2 個名額'));
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
    const tk4=T({id:'g4',member_id:'M',sessions_total:4,sessions_remaining:0,start_date:'2026-07-28'});
    const past=['2026-07-07','2026-07-16','2026-07-23','2026-07-28'].map((d,i)=>BK('p'+i,d,'checked_in',['M']));
    const future=['2026-08-04','2026-08-11','2026-08-18','2026-08-25']
      .map((d,i)=>({id:'BK-f'+i,date:d,start_time:'16:30',status:'booked',category:'小班肌力',member_ids:['M']}));
    let html=await render({ids:['M'],tickets:[tk4],bookings:[...past,...future],names:{M:'黃孟琦'},
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
    chk('★ 櫃檯：名單上每人可下拉指定票券', /function grpPickTk\(mid,tkid\)\{/.test(src)
      && /onchange="grpPickTk\('\$\{m\.id\}',this\.value\)"/.test(src));
    chk('　　只有選了、且有兩張以上才出現下拉', /const pick=\(on&&tks\.length>1\)/.test(src));
    chk('　　下拉標明剩餘堂數與效期', /扣：\$\{String\(t\.name\)\.replace\(\/<\/g,'&lt;'\)\}　剩 \$\{t\.left\} 堂/.test(src));
    chk('★ 管理名單存檔時照指定的扣', /const want=\(window\._grpTkPick\|\|\{\}\)\[mid\];/.test(src)
      && /tk=cand\.find\(t=>t\.id===want\)\|\|null;/.test(src));
    chk('★ 新增團體課（含連續數週）也照指定的扣',
      /if\(want\)\{ const cand=await listUsableTickets\(mid,type_id,dW,time\); tk=cand\.find\(x=>x\.id===want\)\|\|null; \}/.test(src));
    chk('　　指定的票不能用時退回自動挑選，不讓整堂建不起來',
      /if\(!tk\) tk=await findUsableTicket\(mid,type_id,dW,time\);/.test(src)
      && /指定的票券已不能用，改用最快到期的那張/.test(src));
    chk('　　每次開視窗重置指定，不跨堂殘留',
      (src.match(/window\._grpTkPick=\{\};/g)||[]).length===2);
    chk('★ 會員端：多張票時出下拉，預設最快到期',
      /<select id="grp-join-tk" onchange="window\._grpJoinTk=this\.value"/.test(src)
      && /const cand=\(s\.grpTks\|\|\[\]\)\.filter\(t=>!t\.expire_date\|\|t\.expire_date>=c\.date\)/.test(src));
    chk('★ 會員端報名時把指定的票帶給 RPC',
      /sb\.rpc\('fn_member_join_group',\{p_booking_id:bid,p_ticket_id:_pick\}\)/.test(src));
    chk('　　指定失效有看得懂的訊息', /'TICKET\.INVALID_PICK':'選的票券已不能用於這堂課/.test(src));
    chk('　　只有一張時不出下拉、維持原本的一行說明', /cand\.length===1/.test(src));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
