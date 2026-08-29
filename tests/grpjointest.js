/* 2026-08-03 使用者指示：「團體課已經開課後，新加入的會員要有重複預約的能力」
   「如果團體課我先開了 10 堂課 10 週，但是新會員只買了 4 堂課，可以重複預約 4 堂」

   之前的名單視窗一次只管一堂 —— 中途加入的新會員要一週一週手動加 10 次。
   現在儲存名單時若有新加入的會員、同系列（同教練＋同星期＋同時段）還有後續場次，
   就追問一次：每位新會員可連續預約 N 堂（預設＝票券剩餘堂數，正是「買 4 堂約 4 堂」）；
   滿員或已在名單的場次自動跳過往後遞補、有票逐堂扣、票不夠停下回報。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

console.log('① 同系列後續場次的判斷（grpSeriesOf 實跑）');
{
  /* 2026-08-07 使用者定案：「如果那一張課卡是獨立建立預約的話，它就不在『連續』預約的
     名單裡面」—— 系列＝開課時用連續預約一次開出來的那批（recurring=true）。 */
  const G=(id,date,t,coach,st,rec)=>({id,date,start_time:t||'19:00',coach_id:coach||'c1',
    category:'小班肌力',status:st||'booked',recurring:rec!==false});
  const all=[G('g0','2026-08-05'),G('g1','2026-08-12'),G('g2','2026-08-19'),G('g3','2026-08-26'),
             G('g4','2026-09-02'),G('g5','2026-09-09',null,null,'cancelled'),
             G('s1','2026-09-16',null,null,null,false),     // 櫃檯單獨補開的一堂 → 不算同系列
             G('x1','2026-08-19','20:00'),                 // 同天不同時段 → 不同系列
             G('x2','2026-08-19',null,'c2'),               // 不同教練 → 不同系列
             G('x3','2026-08-20'),                          // 週四 → 不同系列
             {id:'p1',date:'2026-08-19',start_time:'19:00',coach_id:'c1',category:'私人教練',status:'booked',member_id:'M'}];
  const _mk=tail=>new Function('dbGetAll','bkIsGroup','parseYmd',
    grabFn('grpSeriesMember')+'\n'+grabFn('grpSeriesSplit')+'\nconst _f=async '+grabFn('grpSeriesOf')
    +'\nreturn '+tail+';')(async()=>all, b=>b.category==='小班肌力', parseYmd);
  const fn=_mk('_f'), split=_mk('grpSeriesSplit');
  (async()=>{
    const r=(await fn(G('g1','2026-08-12'))).map(x=>x.id);
    eq('★ 只抓同教練＋同星期＋同時段、在這堂之後的團課（照日期排）', r, ['g2','g3','g4']);
    const r0=(await fn(G('g0','2026-08-05'))).map(x=>x.id);
    eq('　　從第一堂看＝後面整串（取消的那堂不列）', r0, ['g1','g2','g3','g4']);
    ok('★★ 單獨建立的課卡不在連續名單裡（2026-08-07 使用者定案）', !r0.includes('s1'));
    eq('★ 但要另外列出來告訴櫃檯（solo）', split(G('g0','2026-08-05'),all).solo.map(x=>x.id), ['s1']);

    console.log('\n② 使用者的例子：開 10 週、新會員買 4 堂 → 連續預約 4 堂（_grpFollowRun 實跑）');
    const later=['w1','w2','w3','w4','w5','w6'];
    const DB={ w1:{id:'w1',member_ids:['A'],max_heads:5,ticket_type_id:'tt',date:'2026-08-19',start_time:'19:00'},
      w2:{id:'w2',member_ids:['A','NEW'],max_heads:5,ticket_type_id:'tt',date:'2026-08-26',start_time:'19:00'},   // 已在名單 → 跳過
      w3:{id:'w3',member_ids:['A','B','C','D','E'],max_heads:5,ticket_type_id:'tt',date:'2026-09-02',start_time:'19:00'}, // 滿員 → 跳過遞補
      w4:{id:'w4',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-09',start_time:'19:00'},
      w5:{id:'w5',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-16',start_time:'19:00'},
      w6:{id:'w6',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-23',start_time:'19:00'} };
    let tkLeft=4; const deducts=[], puts=[], toasts=[];
    const env={
      window:{_gfPend:{id:'w0',laterIds:later}},
      document:{getElementById:id=>({value: id==='gf-n-0'?'4':'0'}), querySelector:()=>null},
      dbGet:async(t,id)=> t==='bookings'?(DB[id]?{...DB[id],member_ids:DB[id].member_ids.slice()}:null):{id,name:'新會員'},
      dbPut:async(t,x)=>{ DB[x.id]=x; puts.push(x.id); },
      mids:b=>Array.isArray(b.member_ids)?b.member_ids:[],
      findUsableTicket:async()=> tkLeft>0?{id:'tk1'}:null,
      /* 2026-08-29：挑票改成「先看這堂還沒用過的票」，沙箱要補這兩支 */
      listUsableTickets:async()=> tkLeft>0?[{id:'tk1'}]:[],
      tkNeedsConfirm:()=>false,
      /* 2026-08-06：deductTicket 改回傳布林（餘額護欄），替身跟著回 true */
      deductTicket:async(tk,bid)=>{ tkLeft--; deducts.push(bid); return true; },
      dbCacheClear:()=>{}, closeModal:()=>{}, showToast:m=>toasts.push(m), openBookingDetail:()=>{},
      /* 2026-08-29：做完改回課卡（不是已退役的預約明細），沙箱補這一支 */
      grpBackToCard:()=>{},
      SESSION:{id:'desk'},
      /* 2026-08-12 請假釋出名額：補位的 room 改扣掉請假數，_grpFollowRun 用到 grpLeaveSeats
         → 沙箱抽真函式進來（不是 stub，滿員判斷要照實跑） */
      grpLeaveSeats:new Function('return '+grabFn('grpLeaveSeats'))(),
    };
    const run=new Function(...Object.keys(env),'return async '+grabFn('_grpFollowRun'))(...Object.values(env));
    await run(['NEW','OTHER']);
    eq('★ 加入 4 堂：跳過已在名單的 w2、滿員的 w3，往後遞補到 w6', deducts, ['w1','w4','w5','w6']);
    ok('★ 名單真的寫回（每堂多了 NEW）', ['w1','w4','w5','w6'].every(id=>DB[id].member_ids.includes('NEW')));
    ok('★ 票扣好扣滿 4 堂', tkLeft===0);
    ok('★ 結果回報「加入 4/4 堂」', /加入 4\/4 堂/.test(toasts.join('')));
    ok('　　輸入 0 的人不動作（OTHER 沒被加入任何一堂）',
       !Object.values(DB).some(b=>b.member_ids.includes('OTHER')));

    console.log('\n③ 票不夠就停');
    tkLeft=2; deducts.length=0; toasts.length=0;
    ['w1','w4','w5','w6'].forEach(id=>{ DB[id].member_ids=DB[id].member_ids.filter(m=>m!=='NEW'); });
    env.window._gfPend={id:'w0',laterIds:later};
    await run(['NEW']);
    eq('★ 只剩 2 堂票 → 加 2 堂就停（不佔沒票的位）', deducts, ['w1','w4']);
    ok('★ 回報寫明票券不足', /加入 2\/4 堂（票券不足或過期，先停在這）/.test(toasts.join('')));

    console.log('\n③b 一人多名額不能全扣到同一張票（2026-08-29 使用者：「幫我看一下團課的重複預約是不是有問題?」）');
    {
      /* 正式庫（許佳慈，09:30 那一次操作）：9/4 走名單儲存、三個名額正確扣三張票；
         緊接著由這一支接手的 9/11、9/18、9/25、10/02、10/09、10/16 每堂都是
         1 筆 deduct ＋ 2 筆「已阻擋重複扣」—— 每堂兩個名額沒付錢，共 11 個。
         成因：findUsableTicket 永遠回第一張，扣掉 1 堂它還是第一張。 */
      const DB3={ p:{id:'p',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-11',start_time:'20:00'},
                  q:{id:'q',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-18',start_time:'20:00'} };
      const TK=[{id:'t媽'},{id:'t姊'},{id:'t本'}];
      const ded3=[];
      const env3=Object.assign({},env,{
        window:{_gfPend:{id:'w0',laterIds:['p','q'],seats:{NEW:3}}},
        document:{getElementById:id=>({value: id==='gf-n-0'?'2':'0'}), querySelector:()=>null},
        dbGet:async(t,id)=> t==='bookings'?(DB3[id]?{...DB3[id],member_ids:DB3[id].member_ids.slice()}:null):{id,name:'許佳慈'},
        dbPut:async(t,x)=>{ DB3[x.id]=x; },
        listUsableTickets:async()=>TK.slice(),
        findUsableTicket:async()=>TK[0],
        deductTicket:async(tk,bid,op,o)=>{ ded3.push(bid+':'+tk.id+(o&&o.multi?'*':'')); return true; },
        showToast:()=>{},
      });
      const run3=new Function(...Object.keys(env3),'return async '+grabFn('_grpFollowRun'))(...Object.values(env3));
      await run3(['NEW']);
      eq('★★★ 每堂三個名額各扣一張不同的票（不再三格撞同一張）', ded3,
         ['p:t媽','p:t姊','p:t本','q:t媽','q:t姊','q:t本']);
      eq('★★ 名單也真的補到三個名額',
         ['p','q'].map(id=>DB3[id].member_ids.filter(m=>m==='NEW').length), [3,3]);
      eq('★★ seat_tickets 逐名額記到不同張',
         ['p','q'].map(id=>Object.values(DB3[id].seat_tickets||{}).join(',')),
         ['t媽,t姊,t本','t媽,t姊,t本']);
      ok('★★ 一張都沒有帶 multi（三張不同的票，本來就不該重複）',
         !ded3.some(x=>x.endsWith('*')));
      /* 已經有一個名額佔了 t媽 的那堂：新增的名額要跳過 t媽 */
      DB3.p={id:'p',member_ids:['NEW'],max_heads:5,ticket_type_id:'tt',date:'2026-09-11',
             start_time:'20:00',seat_tickets:{NEW:'t媽'}};
      ded3.length=0; env3.window._gfPend={id:'w0',laterIds:['p'],seats:{NEW:2}};
      await run3(['NEW']);
      eq('★★ 既有名額用掉的票（seat_tickets 帶進來的）不會被再挑一次', ded3, ['p:t姊']);
    }

    console.log('\n④ 流程接線');
    ok('★ 儲存名單有新加入才追問（帶名額數，2026-08-05）',
       /if\(_addUniq\.length\)\{ try\{ await grpFollowAsk\(id,_addUniq,_addCnt\); return; \}/.test(src)
       && /const _addCnt=\{\}; added\.forEach\(m=>\{ _addCnt\[m\]=\(_addCnt\[m\]\|\|0\)\+1; \}\);/.test(src));
    ok('★ 預設堂數＝票券剩餘 ÷ 名額數（買 8 堂 2 名額預設 4）',
       /const def=Math\.min\(seats>1\?Math\.floor\(left\/seats\):left, cap\);/.test(src));
    ok('★ 防連點', /async function grpFollowRun\(mids2\)\{ return onceAct\('gfrun', \(\)=>_grpFollowRun\(mids2\)\); \}/.test(src));
    ok('★ 沒後續場次照舊回明細（順便講一聲後面那幾堂是單獨建立的）',
       /const _sp=grpSeriesSplit\(b, await dbGetAll\('bookings'\)\);/.test(src)
       && /if\(solo\.length\) showToast\(`後面 \$\{solo\.length\} 堂是單獨建立的課，不在連續系列裡/.test(src));
    ok('★ 視窗上把單獨建立的那幾堂列出來（金色次要提示）',
       /另有 <b>\$\{solo\.length\}<\/b> 堂/.test(src) && /是<b>單獨建立<\/b>的課，不在這個連續系列裡/.test(src));
    ok('　　使用者的例子寫在程式裡', /「先開了 10 堂 10 週，新會員只買了 4 堂 → 可以重複預約 4 堂」/.test(src));

    console.log('\n⑤ 多名額（2026-08-05 游晴雅案例：買兩份票要約兩個名額）');
    {
      const DB2={ a:{id:'a',member_ids:['NEW'],max_heads:5,ticket_type_id:'tt',date:'2026-08-13',start_time:'19:30'},
        b:{id:'b',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-08-20',start_time:'19:30'},
        c:{id:'c',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-08-27',start_time:'19:30'} };
      let tk2=5; const ded2=[], toasts2=[];
      const env2=Object.assign({},env,{
        window:{_gfPend:{id:'w0',laterIds:['a','b','c'],seats:{NEW:2}}},
        document:{getElementById:id=>({value: id==='gf-n-0'?'3':'0'}), querySelector:()=>null},
        dbGet:async(t,id)=> t==='bookings'?(DB2[id]?{...DB2[id],member_ids:DB2[id].member_ids.slice()}:null):{id,name:'新會員'},
        dbPut:async(t,x)=>{ DB2[x.id]=x; },
        findUsableTicket:async()=> tk2>0?{id:'tkX'}:null,
        listUsableTickets:async()=> tk2>0?[{id:'tkX'}]:[],
        deductTicket:async(tk,bid,op,o)=>{ tk2--; ded2.push(bid+(o&&o.multi?'*':'')); return true; },
        showToast:m=>toasts2.push(m),
      });
      const run2=new Function(...Object.keys(env2),'return async '+grabFn('_grpFollowRun'))(...Object.values(env2));
      await run2(['NEW']);
      /* 只有一張票、每堂要兩個名額 → 第二格只能用同一張，那時一定要帶 multi
         （* 代表帶了 multi:true）。不帶的話重複扣護欄會回 true 但沒真的扣。 */
      eq('★ 已佔 1 個名額的那堂只補 1 個、其餘每堂補 2 個；同票第二格帶 multi',
         ded2, ['a','b','b*','c','c*']);
      eq('★ 每堂名單都補到 2 個名額',
         ['a','b','c'].map(id=>DB2[id].member_ids.filter(m=>m==='NEW').length), [2,2,2]);
      ok('★ 回報標明每堂名額數', /（每堂 2 個名額）/.test(toasts2.join('')));
      ok('　　票 5 堂剛好扣完', tk2===0);
    }

    console.log('\n⑥ 扣不到票的名額要當面警告（2026-08-05 許佳慈案例，使用者指示「不要一直犯這個錯誤」）');
    /* 2026-08-06：「找不到票」與「找到票但餘額護欄擋下沒扣到」都要算進警告 */
    /* 2026-08-29：同一張票扣第二格時要帶 multi:true —— 不帶的話重複扣護欄會回 true
       但沒真的扣，名額就白站在名單上（許佳慈 9/4 三格同票，只扣到 1 堂）。 */
    ok('★ 名單儲存記下扣不到票的名額數（含護欄擋下沒扣到的）',   // 2026-08-20 取消教練招待：扣不到票改為不寫入名單
       /const _ded = tk \? await deductTicket\(tk,b\.id,SESSION\.id,\s*\n\s*_used\.has\(String\(tk\.id\)\)\?\{multi:true\}:undefined\) : false;/.test(src)
       && /if\(!_ded\)\{ \(_noTk\[mid\]=\(_noTk\[mid\]\|\|0\)\+1\); _failed\.add\(String\(mid\)\); continue; \}/.test(src));
    ok('★ 有漏就擋明確視窗（列出誰、幾個名額），不再只 toast 帶過',
       /if\(Object\.keys\(_noTk\)\.length\)\{/.test(src)
       && /⚠ 有名額沒有加入/.test(src)
       && /grpNoTkAck\(\)/.test(src));
    ok('★ 按「知道了」接回原流程（連續預約詢問或回明細）', /async function grpNoTkAck\(\)\{/.test(src));

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
