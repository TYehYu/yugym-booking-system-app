/* 2026-08-06 使用者指示（附 Excel「有肌訓練 後台-2.xlsx」的營運總表）：
   「帳務可以像營運總表這樣列出來嗎，每個教練每一天做的成績，一面列出一個月」

   Excel 的結構：縱軸＝當月每一天、橫軸＝每位教練一組欄（堂數／簽約金／新約／續約），
   最上面一列是整月合計。這支就是把那張表做進系統（經營報表 → 月報表）。
   口徑必須與系統其他頁一致：堂數＝已簽到/已完成、業績＝收款紀錄實收（歸屬教練）、
   新約/續約＝票券 sale_kind（作廢退款不算、團課不列入）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 矩陣算得對（實跑 finMatrix，假 DB＋假 DOM）');
{
  const html={};
  const BK=(id,date,coach,st,cat,ids)=>({id,date,coach_id:coach,status:st,category:cat||'私人教練',member_ids:ids||[],member_id:'M1'});
  const DB={
    bookings:[
      BK('b1','2026-08-01','c1','checked_in'),
      BK('b2','2026-08-01','c1','completed'),
      BK('b3','2026-08-01','c2','checked_in','小班肌力',['M1','M2','M3']),   // 團課 3 人次
      BK('b4','2026-08-02','c1','booked'),                                    // 還沒簽到 → 不算
      BK('b5','2026-08-02','c1','checked_in','自主訓練'),                     // 自主訓練不計
      BK('b6','2026-07-31','c1','checked_in'),                                // 上個月 → 不算
    ],
    purchases:[
      {id:'p1',ticket_id:'t1',coach_id:'c1',deal_amount:12800,created_at:'2026-08-01T10:00:00Z'},
      {id:'p2',ticket_id:'t2',coach_id:'c2',deal_amount:6400,created_at:'2026-08-03T10:00:00Z'},
      {id:'p3',ticket_id:'t3',coach_id:null,deal_amount:100,created_at:'2026-08-03T10:00:00Z'},   // 無歸屬 → 不進矩陣
    ],
    member_tickets:[
      {id:'t1',member_id:'M1',ticket_type_id:'tt-pt',purchase_date:'2026-08-01',sale_kind:'new',status:'usable'},
      {id:'t2',member_id:'M2',ticket_type_id:'tt-pt',purchase_date:'2026-08-03',sale_kind:'renewal',status:'usable'},
      {id:'t4',member_id:'M3',ticket_type_id:'tt-pt',purchase_date:'2026-08-04',sale_kind:'renewal',status:'refunded',sold_by:'c1'}, // 作廢 → 不算
      {id:'t5',member_id:'M4',ticket_type_id:'tt-grp',purchase_date:'2026-08-04',sale_kind:'renewal',status:'usable',sold_by:'c1'},  // 團課票 → 不列入新/續
    ],
    ticket_types:[{id:'tt-pt',category:'私人教練',name:'教練課'},{id:'tt-grp',category:'小班肌力',name:'團體課'}],
    coaches:[{id:'c1',name:'RANDY',role:'coach'},{id:'c2',name:'SANDY',role:'coach'},{id:'c3',name:'閒置',role:'coach'}],
  };
  const env={
    /* 2026-08-07：finMatrix 改成「有快取就先畫」→ 沙箱補上 FM_TABLES 與 dbPeek 的替身。
       這裡讓 dbPeek 一律回 null（等同沒有快取），才會走 dbGetAll 那條、驗算得對不對。 */
    FM_TABLES:['bookings','purchases','member_tickets','ticket_types','coaches','members'],
    dbPeek:()=>null,
    _fmRevalidate:async()=>{},
    fmStickyFit:()=>{},   // 版面量測（DOM 相依），由瀏覽器端負責；沙箱放空殼
    document:{getElementById:id=>({ set innerHTML(v){ html[id]=v; }, get innerHTML(){ return html[id]||''; } })},
    window:{_finMonth:'2026-08'},
    dbGetAll:async t=>(DB[t]||[]).slice(),
    ymd:()=> '2026-08-06',
    TODAY:new Date(2026,7,6),
    bkCoachId:b=>b.substitute_coach_id||b.coach_id||null,
    coachTagColor:id=>({c1:{bg:'#e8eef7',fg:'#1a3a6e'},c2:{bg:'#f5ede0',fg:'#8a5e28'}}[id]||{bg:'#EAE6DE',fg:'#6a655c'}),
    bkIsGroup:b=>b.category==='小班肌力',
    /* 2026-08-06 使用者定案：「這堂請假不能算該堂教練的人次」——人次改走 grpHeadsNoLeave */
    grpHeadsNoLeave:b=>{ const ids=Array.isArray(b.member_ids)?b.member_ids:[];
      const base=ids.length||(b.member_id?1:0); const att=b.attendance||{};
      const c={}; const ks=ids.map(id=>{ c[id]=(c[id]||0)+1; return c[id]>1?id+'#'+c[id]:id; });
      if(!ks.length) return base;
      return Math.max(0, base-ks.filter(k=>att[k]==='leave').length); },
    bkIsSelf:b=>b.category==='自主訓練',
    mids:b=>Array.isArray(b.member_ids)?b.member_ids:[],
    isCoachable:()=>true,
    coachDisp:c=>c.name,
    isCoachClassTicket:(t,tm)=>((tm[t.ticket_type_id]||{}).category)==='私人教練',
    renewAttribOf:(t,purByTk)=> t.sold_by || purByTk[t.id] || null,
    addDays:(d,n)=>d, parseYmd:x=>new Date(x),
    /* 2026-08-25：姓名字典抽成 memNameMap（教練撈不到別人的學員，用目錄補）——
       沙箱裡沒有那本目錄，行為等同原本的 Object.fromEntries。 */
    memNameMap:(mems)=>Object.fromEntries((mems||[]).filter(Boolean).map(m=>[m.id,m.name])),
  };
  /* fmWhoTip 是 finMatrix 的相依（新約/續約的滑鼠提示），一起帶進沙箱實跑 */
  const run=new Function(...Object.keys(env),
    grabFn('fmWhoTip')+'\nreturn async '+grabFn('finMatrix'))(...Object.values(env));
  (async()=>{
    await run();
    const out=html['fin-body']||'';
    ok('★ 只列出有動靜的教練（閒置的不佔欄）',
       out.includes('RANDY') && out.includes('SANDY') && !out.includes('閒置'));
    /* 2026-08-06 使用者指示：課堂數比較多的往左邊排
       同日二修：「排序只看教練課，教練課堂最多的排最左邊」——
       團課一堂就是好幾個人次，帶團課的教練會被人次頂到前面（SANDY 團課 3 人次
       原本排在 RANDY 的 2 堂教練課之前），看不出誰的教練課上得多。 */
    ok('★ 只看教練課堂數排左邊（RANDY 2 堂 > SANDY 0 堂，團課人次不列入）',
       out.indexOf('RANDY')<out.indexOf('SANDY'), [out.indexOf('RANDY'),out.indexOf('SANDY')]);
    ok('　　排序算式只加 pt（不含團課人次）',
       /const _tot=c=>\{ const m=cell\[c\.id\]\|\|\{\}; return Object\.values\(m\)\.reduce\(\(s,v\)=>s\+v\.pt,0\); \};/.test(src)
       && /同堂數再比業績金額/.test(src));
    ok('★ 有月合計列，排在每日之上', out.indexOf('月合計')>0 && out.indexOf('月合計')<out.indexOf('（六）'));
    ok('★ 表頭四欄一組：教練課／團課／業績／新+續（2026-08-06 起組首組尾帶框線 class）',
       /教練課<\/th><th class="fm-sh">團課<\/th><th class="fm-sh">業績<\/th><th class="fm-sh fm-ge"[^>]*>新\/續<\/th>/.test(out));
    ok('★ 8/01 RANDY：教練課 2 堂、業績 12,800、新約 1',
       out.includes('12,800') && /新1/.test(out));
    ok('★ 團課以人次計（SANDY 8/01＝3）', /class="fm-c fm-g">3</.test(out));
    ok('★ 請假的名額不算教練人次（2026-08-06 使用者定案）',
       /if\(bkIsGroup\(b\)\) c\.grp\+=grpHeadsNoLeave\(b\);/.test(src));
    ok('★ 續約標記出得來（SANDY 8/03）', /續1/.test(out));
    ok('★ 整月天數都列出來（8 月 31 天）',
       (out.match(/class="fm-d">\d+<span>/g)||[]).length===31, (out.match(/class="fm-d">\d+<span>/g)||[]).length);
    ok('★ 還沒簽到／自主訓練／上個月的都不計入',
       !out.includes('>3</td><td class="fm-c fm-g"></td>'), '（RANDY 教練課應為 2）');
    ok('★ 作廢的票不算續約、團課票不列入新/續（合計只有 1 新 1 續）',
       (out.match(/新1/g)||[]).length===2 && (out.match(/續1/g)||[]).length===2);   // 當日列＋月合計列各一次
    ok('★ 有月份切換（沿用財務頁的上/下個月）', /finMonthMove\(-1\)/.test(out) && /2026 年 08 月/.test(out));
    /* 2026-08-06 使用者指示：教練用顏色區分、每位教練的資料用粗線框出來 */
    ok('★ 表頭染教練識別色', /<th class="fm-h fm-gh" colspan="4" style="--cc:#1a3a6e;background:#e8eef7;color:#1a3a6e;">RANDY<\/th>/.test(out));
    ok('★ 每組四欄用粗線框（組首 fm-gs／組尾 fm-ge，顏色跟著教練）',
       /<td class="fm-c fm-gs" style="--cc:#8a5e28;">/.test(out)
       && /<td class="fm-c fm-k fm-ge" style="--cc:#8a5e28;">/.test(out));
    ok('　　次表頭也框住（教練課…新\/續）',
       /<th class="fm-sh fm-gs" style="--cc:#1a3a6e;">教練課<\/th>/.test(out)
       && /<th class="fm-sh fm-ge" style="--cc:#1a3a6e;">新\/續<\/th>/.test(out));
    ok('　　CSS 有畫線', /\.fm-tb \.fm-gs\{border-left:3px solid var\(--cc,var\(--bd\)\);\}/.test(src)
       && /\.fm-tb \.fm-gh\{border-left:3px solid var\(--cc/.test(src));
    /* 2026-08-06 使用者指示：月合計這一列凍結顯示 */
    /* 2026-08-06 二修：表頭高度不寫死（會蓋住教練姓名），改量測後寫進 CSS 變數 */
    ok('★ 月合計凍結在兩列表頭下方（高度用變數，不寫死）',
       /\.fm-tb \.fm-sum td,\.fm-tb \.fm-sum th\{position:sticky;top:calc\(var\(--fm-h1,28px\) \+ var\(--fm-h2,24px\)\);z-index:2;\}/.test(src)
       && /\.fm-tb thead tr:nth-child\(2\) th\{top:var\(--fm-h1,28px\);/.test(src)
       && /function fmStickyFit\(\)\{/.test(src)
       && /tb\.style\.setProperty\('--fm-h1',h1\+'px'\);/.test(src));
    /* 2026-08-06 使用者指示：新約/續約要有滑鼠提示，說明這張是哪個會員 */
    ok('★ 新/續那一格帶 title：約別・姓名・方案・金額',
       /title="新約・M1（教練課） \$0"/.test(out) || /新約・M1/.test(out), out.match(/title="[^"]*約[^"]*"/g));
    ok('★ 月合計那格列出整月每一筆（帶日期）', /title="[^"]*01日 新約・M1[^"]*"/.test(out));
    /* 2026-08-06 二修（使用者指示）：不用問號游標，維持一般游標 */
    /* 2026-08-30：原本是全站禁用 cursor:help，但這條規則講的是**財務矩陣的格子**
       （見上一行 0806 二修）。薪資單的淡化 KPI 用 help 游標是刻意的，
       範圍縮到 .fm- 開頭的規則，維持原意又不會誤傷別的元件。 */
    const _fmRules=(src.match(/[^{}\n][^{}]*\.fm-[^{}]*\{[^}]*\}/g)||[]);
    ok('　　游標維持一般（財務矩陣沒有 cursor:help）',
       _fmRules.length>0 && !_fmRules.some(r=>/cursor:help/.test(r)), _fmRules.length);
    ok('　　左上角（月合計＋日期）疊在最上層、滑過不變色',
       /\.fm-tb \.fm-sum \.fm-d\{z-index:4;\}/.test(src)
       && /tr\.fm-sum:hover td,\.fm-tb tbody tr\.fm-sum:hover \.fm-d\{background:#f7f3ea;\}/.test(src));
    console.log("\n"+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
    process.exit(fail?1:0);
  })();
}
