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
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
