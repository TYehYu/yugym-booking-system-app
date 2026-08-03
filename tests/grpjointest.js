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
  const G=(id,date,t,coach,st)=>({id,date,start_time:t||'19:00',coach_id:coach||'c1',category:'小班肌力',status:st||'booked'});
  // 8/5 起每週三 19:00 開 10 週；b＝8/12 那堂（開課後第二週）
  const wk=n=>`2026-08-${String(5+n*7).padStart(2,'0')}`;   // 8/5,12,19,26 → 之後跨月手動列
  const all=[G('g0','2026-08-05'),G('g1','2026-08-12'),G('g2','2026-08-19'),G('g3','2026-08-26'),
             G('g4','2026-09-02'),G('g5','2026-09-09',null,null,'cancelled'),
             G('x1','2026-08-19','20:00'),                 // 同天不同時段 → 不同系列
             G('x2','2026-08-19',null,'c2'),               // 不同教練 → 不同系列
             G('x3','2026-08-20'),                          // 週四 → 不同系列
             {id:'p1',date:'2026-08-19',start_time:'19:00',coach_id:'c1',category:'私人教練',status:'booked',member_id:'M'}];
  const fn=new Function('dbGetAll','bkIsGroup','parseYmd',
    'return async '+grabFn('grpSeriesOf'))(async()=>all, b=>b.category==='小班肌力', parseYmd);
  (async()=>{
    const r=(await fn(G('g1','2026-08-12'))).map(x=>x.id);
    eq('★ 只抓同教練＋同星期＋同時段、在這堂之後的團課（照日期排）', r, ['g2','g3','g4']);
    const r0=(await fn(G('g0','2026-08-05'))).map(x=>x.id);
    eq('　　從第一堂看＝後面整串（取消的那堂不列）', r0, ['g1','g2','g3','g4']);

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
      deductTicket:async(tk,bid)=>{ tkLeft--; deducts.push(bid); },
      dbCacheClear:()=>{}, closeModal:()=>{}, showToast:m=>toasts.push(m), openBookingDetail:()=>{},
      SESSION:{id:'desk'},
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

    console.log('\n④ 流程接線');
    ok('★ 儲存名單有新加入才追問（只移除不問）',
       /const _addUniq=\[\.\.\.new Set\(added\)\];\n\s*if\(_addUniq\.length\)\{ try\{ await grpFollowAsk\(id,_addUniq\); return; \}/.test(src));
    ok('★ 預設堂數＝票券剩餘（買 4 堂預設 4）', /const def=Math\.min\(left, cap\);/.test(src));
    ok('★ 防連點', /async function grpFollowRun\(mids2\)\{ return onceAct\('gfrun', \(\)=>_grpFollowRun\(mids2\)\); \}/.test(src));
    ok('★ 沒後續場次照舊回明細', /const later=await grpSeriesOf\(b\);\n\s*if\(!later\.length\)\{ openBookingDetail\(id\); return; \}/.test(src));
    ok('　　使用者的例子寫在程式裡', /「先開了 10 堂 10 週，新會員只買了 4 堂 → 可以重複預約 4 堂」/.test(src));

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
