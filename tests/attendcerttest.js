/* 出席證明書（2026-09-25 使用者：「票券可以列印出席紀錄嗎?
   有些公司補助運動需要出席證明」）

   使用者定的兩件事：**一張票一份**（從票券卡列印）、**不印金額**。

   ⚠⚠ 這張紙會被拿去向公司請補助，所以「算幾堂」必須嚴格：
     請假與取消未退雖然都扣了一堂，人是**沒有到場**的；
     印進去等於幫客人多報幾次。圓點的「已使用」不能直接拿來用。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const mk=over=>{
  const ctx=Object.assign({bkEatenCancel:()=>false, grpSeatAttCount:()=>0,
    bkIsGroup:b=>b&&b.category==='小班肌力', grpSeatMark:()=>null,
    grpSeatLeaveCount:()=>0, bkLeaveRefunded:b=>!!(b&&b._clv)}, over||{});
  return new Function(...Object.keys(ctx),
    grab('tkDoneMarker')+grab('tkAttendedList')+'\nreturn tkAttendedList;')(...Object.values(ctx));
};
const T={id:'TK1',member_id:'M1'};
const D=l=>l.map(b=>b.date).join(',');

console.log('① 只算「人真的有來」的');
{
  const f=mk();
  const BKS=[
   {id:'b1',date:'2026-09-05',start_time:'10:00',status:'checked_in'},
   {id:'b2',date:'2026-09-12',start_time:'19:00',status:'completed'},
   {id:'b3',date:'2026-09-19',start_time:'13:00',status:'booked'},
   {id:'b4',date:'2026-09-20',start_time:'10:00',status:'cancelled'},
   {id:'b5',date:'2026-09-21',start_time:'10:00',status:'checked_in',_clv:1},
   {id:'b6',date:'2026-09-22',start_time:'10:00',coach_leave:true,status:'cancelled'},
  ];
  eq('★★★ 只有已簽到／已完成進來', D(f(T,BKS,'M1')), '2026-09-05,2026-09-12');
  ok('★★★ 已預約未上不算（人還沒去）', !D(f(T,BKS,'M1')).includes('09-19'));
  ok('★★★ 取消不算', !D(f(T,BKS,'M1')).includes('09-20'));
  ok('★★★ 教練請假已結課不算（堂數退了、人也沒來）', !D(f(T,BKS,'M1')).includes('09-21'));
  ok('★★★ 教練請假整堂取消不算', !D(f(T,BKS,'M1')).includes('09-22'));
}

console.log('\n② 取消未退／團課請假：扣了堂數但人沒來');
{
  /* bkEatenCancel＝取消未退（圓點畫成 eaten、佔一格），出席不算 */
  const f=mk({bkEatenCancel:b=>b&&b.id==='x1'});
  eq('★★★ 取消未退不算出席（圓點會佔格，這裡不算）',
     D(f(T,[{id:'x1',date:'2026-09-05',status:'cancelled'},
            {id:'x2',date:'2026-09-06',status:'checked_in'}],'M1')), '2026-09-06');
  /* 團課逐名額：grpSeatMark 回 'leave' 的那一顆不算 */
  const g=mk({grpSeatMark:(b)=>b.id==='g1'?'leave':(b.id==='g2'?'att':null)});
  eq('★★★ 團課請假的名額不算、簽到的算',
     D(g(T,[{id:'g1',date:'2026-09-05',category:'小班肌力'},
            {id:'g2',date:'2026-09-06',category:'小班肌力'}],'M1')), '2026-09-06');
}

console.log('\n③ 自主訓練 120 分鐘：扣 2 點，但只去了一次');
{
  const f=mk();
  eq('★★★ 不做時長展開（圓點是兩顆，出席是一次）',
     f(T,[{id:'s1',date:'2026-09-05',start_time:'10:00',status:'checked_in',duration:120}],'M1').length, 1);
  ok('★★ 理由寫在原地', /出席證明數的是「去了幾次」，不是「扣了幾點」/.test(src));
}

console.log('\n④ 排序與邊界');
{
  const f=mk();
  eq('★★ 依上課日期排（證明書由早到晚）',
     D(f(T,[{id:'a',date:'2026-09-12',start_time:'10:00',status:'checked_in'},
            {id:'b',date:'2026-09-05',start_time:'10:00',status:'checked_in'}],'M1')),
     '2026-09-05,2026-09-12');
  eq('★★ 同一天兩堂用時間決勝',
     f(T,[{id:'a',date:'2026-09-05',start_time:'19:00',status:'checked_in'},
          {id:'b',date:'2026-09-05',start_time:'10:00',status:'checked_in'}],'M1')
       .map(b=>b.start_time).join(','), '10:00,19:00');
  eq('　　空清單不會爆', f(T,[],'M1').length, 0);
  eq('　　null 不會爆', f(T,[null,undefined],'M1').length, 0);
  eq('　　分期待繳費保留不算（那幾堂還沒綁票）',
     f(T,[{id:'p',date:'2026-09-05',status:'checked_in',pending_contract:1}],'M1').length, 0);
}

console.log('\n⑤ 規則與圓點共用同一份（不要兩套）');
{
  ok('★★★ ticketTokens 改吃抽出來的 tkDoneMarker',
     /const _isDoneOcc=tkDoneMarker\(t, memberId\);/.test(src));
  ok('★★★ tkDoneMarker 自帶狀態（團課逐名額要一堂一堂分配）',
     /function tkDoneMarker\(t, memberId\)\{[\s\S]{0,200}?const _grpLeft=\{\};[\s\S]{0,60}?return function\(b\)\{/.test(src));
  ok('★★ 一輪掃描配一顆 marker，不能跨清單共用，寫在原地',
     /也就是說\*\*一輪掃描配一個 marker\*\*，不能跨兩份清單共用同一顆/.test(src));
  ok('★★ 抽出來的理由寫在原地（出席證明要更窄的那一種）',
     /只有 'att' 才算出席 —— 請假與取消未退雖然都佔掉一堂，人是沒有來的/.test(src));
}

console.log('\n⑥ 證明書本體');
{
  const F=grab('tkAttendCert');
  ok('★★★ 只有櫃檯以上能印', /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可列印'\); return; \}/.test(F));
  ok('★★★ 不印金額（使用者定的）',
     !/deal_amount|toLocaleString\(\)/.test(F.replace(/\/\*[\s\S]*?\*\//g,'')));
  ok('★★★ 賣方用公司登記名，不是品牌名（對外文件）',
     /BIZ_INFO\.name/.test(F) && /統一編號 \$\{BIZ_INFO\.ubn\}/.test(F));
  ok('★★★ 堂數來自那份出席清單，不是 sessions_total 或 used',
     /<b>\$\{list\.length\} 堂<\/b>/.test(F)
     && !/sessions_total\}[\s]*堂<\/b>/.test(F));
  /* ⚠⚠ 2026-09-25 使用者連報兩次「按鈕出現了、點下去說沒紀錄」——
     兩版都是讓證明書**自己再查一次**票券夾，而且兩次都查錯地方：
       ① WAL.slots.find(...)      → WAL 沒有 slots（只有 stampsOf／noOf／selfBk）
       ② window.WAL.stampsOf(...) → WAL 是 ppRecordHtml 的區域 const，不在 window 上
     根因不是查錯地方，是**兩邊各查各的**：按鈕用票券卡 scope 裡現成的 bks，
     證明書另外查一次 —— 同一份資料算兩次就有機會不一致。
     定版：畫按鈕時算一次、就地存進 _tkAttCache，證明書直接拿。 */
  const CODE=src.replace(/\/\*[\s\S]*?\*\//g,' ');
  ok('★★★ 證明書直接用畫按鈕時算好的那一份，不自己再查一次',
     /const list=\(\(window\._tkAttCache\|\|\{\}\)\[t\.id\]\)\|\|\[\];/.test(F));
  ok('★★★ 按鈕那一側算完就存（兩張卡都要）',
     (CODE.match(/\(window\._tkAttCache=window\._tkAttCache\|\|\{\}\)\[t\.id\]=_at;/g)||[]).length===2);
  ok('★★★ 證明書裡不准再出現任何一種「自己查票券夾」的寫法',
     !/WAL\.slots/.test(CODE)
     && !/window\.WAL/.test(CODE)
     && !/buildWallet/.test(F.replace(/\/\*[\s\S]*?\*\//g,' ')));
  ok('★★ 拿不到就老實說「請重新整理」，不要再補算第三種答案',
     /showToast\('讀不到出席紀錄，請重新整理這一頁再試'\)/.test(F)
     && /補算就是第三種答案/.test(src));
  ok('★★★ 沒有出席就不印空白證明（按鈕本來就不會出現，這是第二道）',
     /if\(!list\.length\)\{ showToast\(/.test(F));
  ok('★★★ 講清楚「不是發票或收據」（蓋了公司章之後最需要的那一句）',
     /本證明僅記載實際到場上課之紀錄，並非統一發票或收據。/.test(F));
  ok('★★ 沿用消費明細那套列印管道（不會被「收進兩頁」壓縮）',
     /stmtPrintOpen\(/.test(F));
}

console.log('\n⑦ 入口');
{
  ok('★★★ 兩張票券卡都有（持有中＋歷史／已過期）',
     (src.match(/onclick="event\.stopPropagation\(\);tkAttendCert\('\$\{t\.id\}'\)">出席證明<\/button>/g)||[]).length===2);
  ok('★★★ 只在真的有人到場時才長出來（used>0 不夠 —— 那個數字含請假）',
     /const _at=tkAttendedList\(t, bks, PP\.id\);\s*\n\s*if\(!_at\.length\) return '';/.test(src)
     && /used>0 不夠：那個數字含請假與/.test(src));
  ok('★★ 歷史票也能印（公司補助常常事後才申請），理由寫在原地',
     /公司補助常常是事後才申請/.test(src));
  ok('★★ 跨頁時表頭要重複（出席多的客人會跨頁）',
     /\.ac-tb thead\{display:table-header-group;\}/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
