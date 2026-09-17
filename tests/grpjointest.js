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

    /* 2026-09-16 使用者：「團體課 就算當初建立的時候不是用連續預約建立的，
       只要每週同一個時段的開課 是不是可以判斷為連續預約」——
       第三個參數 loose=true：不再看 recurring，同教練＋同星期＋同時段＋未來就算同一串。
       ⚠⚠ 只有「加人」那條路傳 true（使用者定案）。整串取消與整串換教練維持嚴格判準：
         放寬的話整串刪除會把櫃檯單獨補開的那一堂也刪掉 ——
         多扣的票可以退，誤刪的課卡很難救，兩邊代價不對等。
       ⚠ 使用者另外問「如果其中一週是 13:30 會不會被當成同一串」：不會。
         loose 只放寬「是不是同一批開出來的」，時間比對（start_time.slice(0,5)）沒有動。 */
    eq('★★★ loose：櫃檯單獨補開的那一堂也算進連續名單',
       split(G('g0','2026-08-05'),all,true).series.map(x=>x.id), ['g1','g2','g3','g4','s1']);
    eq('★★★ loose 之下 solo 是空的（「另有 N 堂是單獨建立」那句提示自然不再出現）',
       split(G('g0','2026-08-05'),all,true).solo.map(x=>x.id), []);
    eq('★★★ loose 不放寬其他條件：不同時段（x1）／不同教練（x2）／不同星期（x3）／非團課（p1）仍排除',
       split(G('g0','2026-08-05'),all,true).series.map(x=>x.id).filter(id=>['x1','x2','x3','p1'].includes(id)), []);
    eq('★★★ 不傳 loose 時維持 0807 的嚴格判準（整串取消／整串換教練走這條）',
       split(G('g0','2026-08-05'),all).series.map(x=>x.id), ['g1','g2','g3','g4']);
    ok('★★ 只有加人那條路傳 loose', /const _sp=grpSeriesSplit\(b, await dbGetAll\('bookings'\), true\);/.test(src)
       && /grpSeriesSplit\(b,all\)\.series/.test(src));

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

    console.log('\n③c 連續預約要照「這次選的那位使用人」算，不是整個帳號（2026-08-29）');
    {
      /* 使用者附截圖：「我用了許佳慈(姐姐) 這邊卻跑出11票 可是姐姐應該只有四張」——
         視窗寫「票剩 19 堂」、預設連約 11 堂，那 19 堂是整個帳號（媽媽＋姊姊＋本人）的。
         照整帳號算會把媽媽與本人的票花在姊姊那一格上。 */
      const DB4={ u:{id:'u',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-11',start_time:'20:00'},
                  v:{id:'v',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-18',start_time:'20:00'} };
      const ALL=[{id:'t姊',family_user:'姊姊'},{id:'t媽',family_user:'媽媽'},{id:'t本',family_user:null}];
      const ded4=[];
      const env4=Object.assign({},env,{
        window:{_gfPend:{id:'w0',laterIds:['u','v'],seats:{NEW:1},fam:{NEW:'姊姊'}}},
        document:{getElementById:id=>({value: id==='gf-n-0'?'2':'0'}), querySelector:()=>null},
        dbGet:async(t,id)=> t==='bookings'?(DB4[id]?{...DB4[id],member_ids:DB4[id].member_ids.slice()}:null):{id,name:'許佳慈'},
        dbPut:async(t,x)=>{ DB4[x.id]=x; },
        listUsableTickets:async()=>ALL.slice(),
        findUsableTicket:async()=>ALL[1],          // 先進先出會挑到媽媽那張
        deductTicket:async(tk,bid)=>{ ded4.push(bid+':'+tk.id); return true; },
        showToast:()=>{},
      });
      const run4=new Function(...Object.keys(env4),'return async '+grabFn('_grpFollowRun'))(...Object.values(env4));
      await run4(['NEW']);
      eq('★★★ 選了姊姊 → 後面幾堂只扣姊姊那張，不會花到媽媽／本人的票',
         ded4, ['u:t姊','v:t姊']);

      /* 沒指定使用人（管理名單那條路）→ 維持原本先進先出 */
      const DB5={ u:{id:'u',member_ids:[],max_heads:5,ticket_type_id:'tt',date:'2026-09-11',start_time:'20:00'} };
      const ded5=[];
      const env5=Object.assign({},env4,{
        window:{_gfPend:{id:'w0',laterIds:['u'],seats:{NEW:1}}},
        document:{getElementById:id=>({value: id==='gf-n-0'?'1':'0'}), querySelector:()=>null},
        dbGet:async(t,id)=> t==='bookings'?(DB5[id]?{...DB5[id],member_ids:DB5[id].member_ids.slice()}:null):{id,name:'許佳慈'},
        dbPut:async(t,x)=>{ DB5[x.id]=x; },
        deductTicket:async(tk,bid)=>{ ded5.push(bid+':'+tk.id); return true; },
      });
      const run5=new Function(...Object.keys(env5),'return async '+grabFn('_grpFollowRun'))(...Object.values(env5));
      await run5(['NEW']);
      eq('　 沒指定使用人時維持原本行為（挑第一張可用的）', ded5, ['u:t姊']);
    }

    console.log('\n③d 開著重複預約時「按下去才建檔」（2026-08-29）');
    {
      /* 使用者附截圖：「應該要點這個連續預約才開始建檔　這邊先直接約了一堂」——
         原本是先存這一堂、再問後面要不要一起約，所以視窗跳出來時第一堂已經扣好票，
         按「不用」也已經約掉一堂。 */
      ok('★★★ ［＋新增］＋重複預約開著 → 先問再寫（不先存這一堂）',
         /if\(window\._grpAdd && window\._grpRep && \(window\._grpPick\|\|\{\}\)\.mid\)\{/.test(src)
         && /return onceAct\('grpmem:'\+id, \(\)=>grpFollowPre\(id\)\);/.test(src)
         && /await grpFollowAsk\(id, \[pk\.mid\], \{\[pk\.mid\]:1\}, \{\[pk\.mid\]:pk\.fam\|\|''\}, true, \{\[pk\.mid\]:_tk\}\);/.test(src));
      ok('★★ 「連續預約」按下去才把這一堂也建起來',
         /if\(p\.pending\)\{\s*\n\s*const _r=window\._grpRep; window\._grpRep=false;\s*\n\s*try\{ await _saveGroupMembers\(p\.id\); \}/.test(src));
      ok('★★ 暫時關掉旗標，免得 _saveGroupMembers 又把同一張視窗叫出來',
         /免得 _saveGroupMembers 又把這張視窗叫出來一次。/.test(src));
      ok('★★ 「不用」改成「只加這一堂」，而且是按下去才寫',
         /onclick="\$\{pending\?`grpFollowOnce\('\$\{id\}'\)`:`grpBackToCard\('\$\{id\}'\)`\}">\$\{pending\?'只加這一堂':'不用'\}/.test(src)
         && /async function grpFollowOnce\(id\)\{/.test(src));
      ok('★★ 視窗上要講明「這一堂也還沒建立」',
         /這一堂（<b>\$\{String\(b\.date\)\.slice\(5\)\.replace\('-','\/'\)\}<\/b>）也還沒建立/.test(src));
      /* 2026-08-29：「許佳慈本人有三個團課方案 #18補課 #25優惠團課 #26優惠團課
         所以點許佳慈的時候要跳出選擇使用方案」 */
      ok('★★ 選到的人有兩張以上票 → 出方案挑選（只有一張就不出現）',
         /if\(!r \|\| tks\.length<2\)\{ tkBox\.innerHTML=''; \}/.test(src)
         && /<div class="gadd-tktitle">用哪一個方案？<\/div>/.test(src)
         && /onclick="grpAddPickTk\('\$\{r\.m\.id\}',\$\{_si\},'\$\{t\.id\}'\)"/.test(src));
      ok('★★ 挑的是「這一格」的指定，名額索引接在既有名額之後',
         /const _si=\(window\._grpBase\|\|\[\]\)\.filter\(x=>String\(x\)===String\(r\.m\.id\)\)\.length;/.test(src)
         && /function grpAddPickTk\(mid, seatIdx, tkid\)\{ grpPickTk\(mid, seatIdx, tkid\); renderGrpPick\(\); \}/.test(src));
      /* 2026-08-29：「連續預約的這個視窗　要顯示預約的日期跟時間」 */
      /* 2026-09-16 使用者：「連續預約的視窗太多文字 內容雜亂」——
         13 顆日期膠囊佔掉近半個視窗，把真正要決定的「約幾堂」擠到畫面外。
         ⚠ 日期**不是拿掉**：0829 使用者要求「要顯示預約的日期跟時間」，櫃檯要核對排到哪裡。
           改成前 3 堂常駐、其餘收進 <details>，要核對的人點得開。
         ⚠ 原本超過 12 筆才寫「還有 N 堂」，那條 .gfa-day-more 的路現在由 details 取代。 */
      ok('★★ 多人時：日期前 3 堂常駐，其餘收進可展開的 details（不是不顯示）',
         /<div class="gfa-days">/.test(src)
         && /later\.slice\(0,3\)\.map\(x=>`<span class="gfa-day">/.test(src)
         && /<details class="gfa-more"><summary>還有 \$\{later\.length-3\} 堂，點開核對<\/summary>/.test(src)
         && /later\.slice\(3\)\.map\(x=>`<span class="gfa-day">/.test(src));

      /* ══ 單人時只列「這位實際會約到的那幾堂」（2026-09-17）══════════════════
         使用者：「可以顯示該會員會預約的時間就好 例如這個客人是11張票
                   所以就出現11個日期(帶編號)」
         ⚠⚠ **不可以把清單截成前 N 筆**：真正跑的時候會「滿員或已足額就跳過、往後遞補」，
           第 11 堂未必落在第 11 個日期。截前 N 筆會顯示一組不會發生的日期，
           而每個日期看起來都很合理 —— 這種錯幾乎不可能被發現，所以下面用實跑驗證。
         ⚠⚠ gfPickDates 的判準必須與 _grpFollowRun 逐條對應（先算 need、再看 room），
           那邊改了這裡要一起改，否則畫面講的和實際做的會分岔。 */
      {
        const B=(id,date,ids,max,att)=>({id,date,start_time:'11:00',member_ids:ids||[],
          max_heads:max||5,attendance:att||{},seat_tickets:{}});
        const later2=[
          B('w1','2026-09-26',['M']),                                  // 已足額 → 跳過
          B('w2','2026-10-03',['A','B','C','D','E']),                  // 滿員 → 跳過
          B('w3','2026-10-10',[]),
          B('w4','2026-10-17',[]),
          B('w5','2026-10-24',['A','B','C','D','E'],5,{A:'leave'}),    // 一人請假 → 空出一位
        ];
        const W={_gfPend:{later:later2, tkAll:[], seats:{M:1}, fam:{}, tk:{}, soloMid:'M'}};
        const pick=new Function('window','mids','grpLeaveSeats',
          grabFn('gfPickDates')+'\nreturn gfPickDates;')(W,
            b=>Array.isArray(b&&b.member_ids)?b.member_ids:[],
            b=>Object.values((b&&b.attendance)||{}).filter(v=>v==='leave').length);
        eq('★★★ 跳過「已足額」與「滿員」，往後遞補', pick('M',2).map(x=>x.id), ['w3','w4']);
        eq('★★★ 要 3 堂 → 請假空出位子的那一堂也算得進來', pick('M',3).map(x=>x.id), ['w3','w4','w5']);
        eq('★★ 要 1 堂就只給 1 堂', pick('M',1).map(x=>x.id), ['w3']);
        eq('★★ 要 0 堂 → 空的（不是整串）', pick('M',0).map(x=>x.id), []);
        eq('★★ 想要的比可約的多 → 有幾堂給幾堂，不會憑空生出日期',
           pick('M',99).map(x=>x.id), ['w3','w4','w5']);
        /* 反面對照：這就是「偷懶截前 N 筆」會顯示出來的東西 —— 兩堂都不會約到 */
        eq('★★★ 反面對照：截前 2 筆得到的是完全不同、而且錯誤的兩堂',
           later2.slice(0,2).map(x=>x.id), ['w1','w2']);
      }
      ok('★★★ 單人走 gfDaysHtml；多人維持整串場次的列法（每人堂數不同，一份清單會誤導）',
         /rows\.length===1\s*\n\s*\? `<div id="gfa-days-box">\$\{gfDaysHtml\(rows\[0\]\.mid, rows\[0\]\.def\)\}<\/div>`/.test(src));
      ok('★★★ 改堂數就即時重畫日期（不連動的話那份清單會是錯的，而且看起來很合理）',
         /oninput="gfSyncDays\(\)"/.test(src)
         && /function gfSyncDays\(\)\{/.test(src)
         && /box\.innerHTML=gfDaysHtml\(p\.soloMid, \(document\.getElementById\('gf-n-0'\)\|\|\{\}\)\.value\);/.test(src));
      /* 2026-09-17 二改：編號改由 cell() 產生（本堂要當第 1 堂），所以不再是 ${i+1}。
         ⚠ 這一條守的本意沒變：編號用 <b> 不用 <i> —— .gfa-day i 已被「本堂」那個
           標記佔走（它是 margin-left 靠右），編號在左邊，共用會打架。
         ⚠ 別再把序號的算式抄進正則：它會隨排法改動，釘住它等於每次調版面都誤觸。 */
      ok('★★ 日期帶編號，用 <b> 不用 <i>（.gfa-day i 已被「本堂」那個標記佔走，位置相反）',
         /<b class="gfa-no">\$\{no\}<\/b>/.test(src)
         && /\.gfa-no\{font-weight:800;/.test(src));
      ok('★★★ 原地標明「兩邊的判準要一起改」（這份模擬與 _grpFollowRun 分岔就會騙人）',
         /判準與 _grpFollowRun 逐條對應/.test(src)
         && /那邊改了這裡要一起改/.test(src));
      ok('★★ later 與 tkAll 留在 _gfPend（改數字要能就地重算，不再讀一次 DB）',
         /later, tkAll:allTk, soloMid:\(rows\.length===1\?rows\[0\]\.mid:null\),/.test(src));

      /* ══ 本堂也會吃票（2026-09-17 使用者回報）══════════════════════════════
         「這個會員只有 11 張票 但加本堂卻是 12」「卻有 12 個日期」「所以本堂就要給編號1」
         ⚠⚠ pending＝本堂還沒建立，按下去時 _saveGroupMembers 會先建本堂並扣 seats 堂，
           **然後**才跑後續。原本 def 只看票餘額與後續場次數，沒扣掉本堂那一堂，
           於是 11 張票被排成「本堂 1 ＋ 後續 11」＝ 12 堂 ——
           要跑到最後一堂才會因為票不夠停下來，櫃檯當下看不出來。
         ⚠ 正式庫實例：林柏辰團體課票 MTK-6BC0CB212E3F 剩 11 堂（總數也是 11）。 */
      ok('★★★ 預設堂數要扣掉本堂會吃的那幾堂（pending 時）',
         /const _selfUse=pending\?seats:0;/.test(src)
         && /const _forLater=Math\.max\(0,left-_selfUse\);/.test(src)
         && /const def=Math\.min\(seats>1\?Math\.floor\(_forLater\/seats\):_forLater, cap\);/.test(src));
      {
        /* 照抄修好後的算式，驗「11 張票 ＋ 本堂未建」這個實際案例 */
        const defOf=(left,cap,seats,pending)=>{
          const selfUse=pending?seats:0;
          const forLater=Math.max(0,left-selfUse);
          return Math.min(seats>1?Math.floor(forLater/seats):forLater, cap);
        };
        eq('★★★ 林柏辰案例：票剩 11、後續 12 場、本堂未建 → 預設後續 10（本堂 1 ＋ 10 ＝ 11）',
           defOf(11,12,1,true), 10);
        eq('★★ 本堂已經建好（不吃票）→ 維持原本的 11', defOf(11,12,1,false), 11);
        eq('★★ 兩個名額：本堂吃 2，剩 9 堂只夠再約 4 場（9÷2 無條件捨去）',
           defOf(11,12,2,true), 4);
        eq('★★ 票只夠本堂 → 後續 0（不會排出負數或多排一堂）', defOf(1,12,1,true), 0);
        eq('★★ 一張票都沒有 → 0', defOf(0,12,1,true), 0);
        eq('★★ 後續場次比票少時以場次為準（不會排到不存在的場次）', defOf(50,3,1,true), 3);
      }
      ok('★★★ 本堂編號 1、後續從 2 開始；沒有本堂時從 1 開始',
         /const self=p\.selfCard;/.test(src)
         && /\$\{self\?cell\(self,1,true\):''\}/.test(src)
         && /list\.map\(\(x,i\)=>cell\(x,i\+\(self\?2:1\),false\)\)/.test(src));
      ok('★★ 單人時本堂由 gfDaysHtml 畫（留在外面就會落在編號清單之外，看起來不算一堂）',
         /\$\{\(pending && rows\.length!==1\)\?`<div class="gfa-days">/.test(src)
         && /selfCard:\(pending\?\{date:b\.date,start_time:b\.start_time\}:null\)\}/.test(src));
      ok('★★ 票剩那一格要寫出本堂會用掉幾堂（否則「票剩 11」與輸入框的 10 看起來矛盾）',
         /票剩 \$\{r\.left\} 堂\$\{pending\?`（本堂用 \$\{r\.seats\}）`:''\}/.test(src));
      /* ⚠⚠ 反面斷言的範圍要限縮到這一支函式，不可以掃全檔 ——
         「後面還有 <b>${later.length}</b> 堂」在**另一張視窗**（改時間那支，36950 附近）
         合法地存在著，掃全檔永遠是紅的。
         ⚠ 同時仍要剝註解：原地留的說明也會寫出被改掉的舊句子。
         今天在這兩件事上各踩過好幾次，這裡兩道一起做。 */
      ok('★★ 標題與副標不再重複（副標只講「週幾幾點・共 N 堂」）',
         (()=>{ const GFA=grabFn('grpFollowAsk')||'';
           const body=GFA.replace(/\/\*[\s\S]*?\*\//g,'');
           return /<b>週\$\{dowLbl\} \$\{String\(b\.start_time\)\.slice\(0,5\)\}<\/b>　·　共 <b>\$\{later\.length\}<\/b> 堂/.test(body)
               && !/後面還有 <b>\$\{later\.length\}<\/b> 堂/.test(body); })());
      /* 2026-09-17：票剩那一格後面多了「（本堂用 N）」，所以不再比對到收尾的 </span>。
         這一條守的本意沒變：餘額自成一格、靠 margin-left:auto 貼到輸入框那一行的右端。 */
      ok('★★ 會員那列改成上下兩行，餘額緊貼輸入框',
         /<div class="gfa-row">/.test(src)
         && /<span class="gfa-left">票剩 \$\{r\.left\} 堂/.test(src)
         && /\.gfa-left\{[^}]*margin-left:auto;/.test(src));
      ok('★★★ 兩條常駐說明收成一行；條件式那兩條仍留在條列，且兩條都沒有時整個 ul 不畫',
         /<div class="gfa-auto">滿員或已在名單的場次會自動跳過、往後遞補；有票逐堂扣，不夠會停下來告訴你。<\/div>/.test(src)
         && /\$\{\(solo\.length\|\|pending\)\?`<ul class="mk-pts">/.test(src));
      ok('★ 還沒建的那一堂也列出來並標「本堂」',
         /<span class="gfa-day gfa-day-now">/.test(src) && /<i>本堂<\/i>/.test(src));
      /* 2026-08-29：「我在前一步選了其中一份票券而已　這邊應該只要顯示該票券的4堂」 */
      ok('★★★ 前一步挑過方案 → 餘額只算那一張（本人那組是 1＋4＋4，不能寫 9 堂）',
         /const _one=\(addedTk\|\|\{\}\)\[mid\];/.test(src)
         && /const _famOk=t=>_one \? String\(t\.id\)===String\(_one\)/.test(src)
         && /本人那一組是補課券 1 ＋ 優惠團課 4 ＋ 4，/.test(src));
      ok('★★ 後續場次也只用那一張（挑過就不會退回先進先出）',
         /const _famOk=t=>_wtk \? String\(t\.id\)===String\(_wtk\)/.test(src)
         && /\|\| \(\(!_wtk&&\(_wf===undefined\|\|_wf===null\)\)\?await findUsableTicket\(/.test(src));
      /* 2026-09-16：會員那一列改成上下兩行，方案名與餘額各自有了 class，
         不再是擠在 label 裡的兩段純文字。這一條守的本意沒變：看得出算的是哪一張票。 */
      /* 2026-09-17：同上，票剩那一格後面多了「（本堂用 N）」，收尾的 </span> 不再緊接著。 */
      ok('★ 視窗上標出方案名（看得出來算的是哪一張）',
         /\$\{r\.plan\?`<span class="gfa-plan">\$\{escH\(r\.plan\)\}<\/span>`:''\}/.test(src)
         && /<span class="gfa-left">票剩 \$\{r\.left\} 堂/.test(src));
      /* 2026-08-29：「然後這邊沒有上一步可以退回」 */
      ok('★★ 還沒寫入的那條路要能退回去改，而且挑好的人與方案要留著',
         /function grpFollowBack\(id\)\{ window\._gfPend=null; try\{ closeModal\(\); \}catch\(_\)\{\} openGroupMembers\(id, true, true\); \}/.test(src)
         && /\$\{pending\?`<button class="btn btn-ghost" onclick="grpFollowBack\('\$\{id\}'\)">‹ 上一步<\/button>`:''\}/.test(src)
         && /if\(!keepSel\) window\._grpPick=null;/.test(src));
      ok('★ 管理名單那條路不受影響（沒有這個開關，維持先存再問）',
         /「管理名單」那條路不受影響（它本來就是複選、而且沒有這個開關）。/.test(src));
    }

    console.log('\n③f 同一帳號的不同使用人要各佔各的名額（2026-08-29「為什麼姐姐跟媽媽的票券不能連續約」）');
    {
      /* 正式庫：許佳慈先用本人那張連續約了 9/11、9/18、9/25，之後再替姊姊約同一串，
         每一堂都被算成「他已經有 1 個名額」→ need=0 → 整串跳過，姊姊只剩 9/4 那一格。
         「已佔幾個」要用這次指定的那張票／那位使用人去數，不能用會員數。 */
      const DB6={ a:{id:'a',member_ids:['NEW'],seat_tickets:{NEW:'t本'},max_heads:5,
                     ticket_type_id:'tt',date:'2026-09-11',start_time:'20:00'},
                  b:{id:'b',member_ids:['NEW'],seat_tickets:{NEW:'t本'},max_heads:5,
                     ticket_type_id:'tt',date:'2026-09-18',start_time:'20:00'} };
      const TK6=[{id:'t姊',family_user:'姊姊'},{id:'t本',family_user:null}];
      const ded6=[];
      const env6=Object.assign({},env,{
        window:{_gfPend:{id:'w0',laterIds:['a','b'],seats:{NEW:1},fam:{NEW:'姊姊'},tk:{NEW:'t姊'}}},
        document:{getElementById:id=>({value: id==='gf-n-0'?'2':'0'}), querySelector:()=>null},
        dbGet:async(t,id)=> t==='bookings'?(DB6[id]?{...DB6[id],member_ids:DB6[id].member_ids.slice()}:null):{id,name:'許佳慈'},
        dbGetAll:async(t)=> t==='member_tickets'?TK6.slice():[],
        dbPut:async(t,x)=>{ DB6[x.id]=x; },
        listUsableTickets:async()=>TK6.slice(),
        findUsableTicket:async()=>TK6[1],
        deductTicket:async(tk,bid)=>{ ded6.push(bid+':'+tk.id); return true; },
        showToast:()=>{},
      });
      const run6=new Function(...Object.keys(env6),'return async '+grabFn('_grpFollowRun'))(...Object.values(env6));
      await run6(['NEW']);
      eq('★★★ 本人已佔一格的那幾堂，姊姊照樣約得進去（不再整串跳過）',
         ded6, ['a:t姊','b:t姊']);
      eq('★★ 兩位使用人各佔一格',
         ['a','b'].map(id=>DB6[id].member_ids.filter(m=>m==='NEW').length), [2,2]);
      eq('★★ seat_tickets 兩格分別記本人與姊姊',
         ['a','b'].map(id=>Object.values(DB6[id].seat_tickets||{}).join(',')),
         ['t本,t姊','t本,t姊']);

      /* 同一張票已經佔過的那一堂仍然跳過（不要重複塞第二格） */
      const DB7={ c:{id:'c',member_ids:['NEW'],seat_tickets:{NEW:'t姊'},max_heads:5,
                     ticket_type_id:'tt',date:'2026-09-11',start_time:'20:00'} };
      const ded7=[];
      const env7=Object.assign({},env6,{
        window:{_gfPend:{id:'w0',laterIds:['c'],seats:{NEW:1},fam:{NEW:'姊姊'},tk:{NEW:'t姊'}}},
        document:{getElementById:id=>({value: id==='gf-n-0'?'1':'0'}), querySelector:()=>null},
        dbGet:async(t,id)=> t==='bookings'?(DB7[id]?{...DB7[id],member_ids:DB7[id].member_ids.slice()}:null):{id,name:'許佳慈'},
        dbPut:async(t,x)=>{ DB7[x.id]=x; },
        deductTicket:async(tk,bid)=>{ ded7.push(bid+':'+tk.id); return true; },
      });
      const run7=new Function(...Object.keys(env7),'return async '+grabFn('_grpFollowRun'))(...Object.values(env7));
      await run7(['NEW']);
      eq('★★ 姊姊那一格已經在了 → 這一堂跳過，不會重複塞', ded7, []);
    }

    console.log('\n④ 流程接線');
    /* 2026-08-29：［＋新增］那張多了「重複預約」開關，關掉就不問後續場次。
       「管理名單」沒有這個開關（_grpAdd 是 false）→ 維持原本一律詢問。 */
    ok('★ 儲存名單有新加入才追問（帶名額數，2026-08-05；重複預約關著時不問）',
       /if\(_askRep && _addUniq\.length\)\{ try\{ await grpFollowAsk\(id,_addUniq,_addCnt,_addFam,false,_addTk\); return; \}/.test(src)
       && /const _askRep=\(!window\._grpAdd\) \|\| !!window\._grpRep;/.test(src)
       && /const _addCnt=\{\}; added\.forEach\(m=>\{ _addCnt\[m\]=\(_addCnt\[m\]\|\|0\)\+1; \}\);/.test(src));
    /* 2026-09-17：算式改吃 _forLater（＝票餘額扣掉本堂會用掉的那幾堂），不再直接吃 left。
       ⚠ 這一條守的本意沒變：「÷ 名額數、無條件捨去，並以場次數封頂」。
         本堂要不要扣由上面那條「預設堂數要扣掉本堂會吃的那幾堂」專門守。 */
    ok('★ 預設堂數＝可用堂數 ÷ 名額數（買 8 堂 2 名額預設 4）',
       /const def=Math\.min\(seats>1\?Math\.floor\(_forLater\/seats\):_forLater, cap\);/.test(src));
    ok('★ 防連點', /async function grpFollowRun\(mids2\)\{ return onceAct\('gfrun', \(\)=>_grpFollowRun\(mids2\)\); \}/.test(src));
    /* 2026-09-16：加人改採寬鬆判準（第三參數 true）之後，這條路上的 solo 恆為空陣列，
       原本那句「後面 N 堂是單獨建立的課，不在連續系列裡」永遠不會觸發 ——
       那是我的改動造成的死碼，已經清掉，不是漏改。
       ⚠ 這一條守的本意還在：沒有後續場次時要安靜地回明細，不要卡在半路。
       ⚠ 反面斷言先剝註解：原地留的〔已移除〕說明會寫出被拿掉的那句話。 */
    ok('★ 沒後續場次就直接回明細（solo 恆空，不再提示「單獨建立」）',
       /const _sp=grpSeriesSplit\(b, await dbGetAll\('bookings'\), true\);/.test(src)
       && !/if\(solo\.length\) showToast\(/.test(src.replace(/\/\*[\s\S]*?\*\//g,''))
       && /if\(!later\.length\)\{[\s\S]{0,900}?grpBackToCard\(id\); return;/.test(src));
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
