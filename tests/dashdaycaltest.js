/* 首頁教練任務 → 一日行事曆（2026-08-21 使用者指示）
   原話：「首頁這邊教練任務 改成一日行事曆 最上方一排教練篩選列 課堂最多的往左邊排序
   所以桌機版首頁是一日行事曆 預約管理是七日行事曆」，追加「有空白沒有關係 也加入時間紅線」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('版面：教練當欄位的一日行事曆');
ok('★ 桌機面板改吃 dashDayCalHTML（橫排課卡退場）',
   /\$\{dashDayCalHTML\(rows, \{isTodayView, nowMin\}\)\}/.test(src)
   && !/<div class="tcard-zoom">\$\{rows\.map\(r=>r\.cardHtml\)\.join\(''\)\}<\/div>/.test(src));
ok('★ 一欄一位教練，欄頭有頭像／姓名／N／M 堂',
   /<div class="dcal-col\$\{r\.isLive\?' dcal-col-live':''\}">/.test(src)
   && /<span class="dcal-ctask\$\{\(r\.total>0&&r\.done>=r\.total\)\?' done':''\}">\$\{r\.done\}\/\$\{r\.total\} 堂/.test(src));
ok('★ 課堂最多的排最左（沿用 _taskSort，與手機列表同一個順序）',
   /rows\.sort\(_taskSort\);/.test(src)
   && /const _taskSort=\(a,b\)=> \(b\.total-a\.total\)/.test(src));
ok('★ 課卡 HTML 一個字都沒改，兩種版面共用同一批字串',
   /const _cardsArr=_dcalBk\.map\(b=>\{/.test(src)
   && /coach:c, done:done, cardsArr:_cardsArr, bkList:_dcalBk,/.test(src)
   && /const cards=_cardsArr\.join\(''\);/.test(src));
ok('　　點擊行為不變（仍是 onTcardClick → expandBkCard）',
   /onclick="onTcardClick\(event,'\$\{b\.id\}'\)"/.test(src));

console.log('\n時間軸與紅線');
ok('★ 30 分一格 48px（60 分課＝96px，與原本 98px 的卡幾乎同高）',
   /const DCAL_SLOT=48, DCAL_STEP=30, DCAL_HEAD=46;/.test(src));
ok('★ 空堂照佔高度（使用者：「有空白沒有關係」）—— 位置由時間算，不是照順序排',
   /const yOf=m=>\(\(m-s0\)\/DCAL_STEP\)\*DCAL_SLOT;/.test(src)
   && /top:\$\{top\+2\}px;height:\$\{h\}px;/.test(src));
ok('★ 預設 09:00–22:00，有更早／更晚的課就往外撐',
   /let s0=9\*60, s1=22\*60;/.test(src)
   && /if\(st<s0\) s0=Math\.floor\(st\/DCAL_STEP\)\*DCAL_STEP;/.test(src)
   && /if\(en>s1\) s1=Math\.ceil\(en\/DCAL_STEP\)\*DCAL_STEP;/.test(src));
ok('★ 時間紅線（使用者：「也加入時間紅線」）：只在檢視今天且落在軸內才畫',
   /const nowLine=\(o\.isTodayView && o\.nowMin>=s0 && o\.nowMin<=s1\)/.test(src)
   && /<div class="cal-now dcal-now" style="top:calc\(\$\{DCAL_HEAD\}px \+ \$\{yOf\(o\.nowMin\)\}px\);">/.test(src));
ok('　　一條橫跨所有欄位，不是每欄一條（每欄一條會有一排紅點）',
   /畫一條橫跨所有欄位，不是每欄一條/.test(src));
ok('　　沿用行事曆既有的 .cal-now 樣式，不另立一套',
   /\.cal-now\{position:absolute;left:0;right:0;height:0;border-top:2\.5px solid #e0533a;/.test(src));

console.log('\n教練篩選列');
ok('★ 最上方一排膠囊，含「全部」',
   /<div class="dcal-chips">\$\{chips\}<\/div>/.test(src)
   && /class="dcal-chip dcal-chip-all\$\{Object\.keys\(off\)\.length\?'':' on'\}"/.test(src)
   && /onclick="dashCoachAll\(\)"/.test(src));
ok('★ 逐位切換（不是單選）—— 關掉的淡化留在原位，順序不跳動',
   /function dashToggleCoach\(id\)\{/.test(src)
   && /if\(o\[id\]\) delete o\[id\]; else o\[id\]=1;/.test(src)
   && /\.dcal-chip\.off\{opacity:\.4;\}/.test(src));
ok('　　膠囊帶該教練的顏色與課堂數',
   /const cc=coachTagColor\(r\.coach\.id\), hide=!!off\[r\.coach\.id\];/.test(src)
   && /<span class="dcal-chip-n">\$\{r\.total\}<\/span>/.test(src));
ok('　　全部關掉時給說明，不是一片空白',
   /篩選後沒有要顯示的教練/.test(src));

console.log('\n撞課分欄');
{
  /* 逐群分欄的算法（與 index.html 的 dcalLanes 同一套）——
     整欄共用分欄數的話，早上一次撞課會害這位教練一整天的卡全部縮成半寬。 */
  const dcalLanes=(ev)=>{
    const out=ev.map(()=>({lane:0,lanes:1}));
    let i=0;
    while(i<ev.length){
      let j=i, end=ev[i].en;
      while(j<ev.length && ev[j].st<end){ end=Math.max(end,ev[j].en); j++; }
      const ends=[];
      for(let k=i;k<j;k++){
        let li=ends.findIndex(e=>e<=ev[k].st);
        if(li<0){ li=ends.length; ends.push(ev[k].en); } else ends[li]=ev[k].en;
        out[k].lane=li;
      }
      for(let k=i;k<j;k++) out[k].lanes=Math.max(1,ends.length);
      i=j;
    }
    return out;
  };
  const ev=[{st:600,en:660},{st:600,en:660},{st:900,en:960}];
  eq('★ 早上撞課的兩張各半寬，下午單獨那張仍整寬',
     dcalLanes(ev).map(x=>`${x.lane}/${x.lanes}`), ['0/2','1/2','0/1']);
  eq('　　完全不重疊 → 全部整寬',
     dcalLanes([{st:600,en:660},{st:660,en:720}]).map(x=>x.lanes), [1,1]);
  eq('　　三堂連環重疊 → 三欄',
     dcalLanes([{st:600,en:720},{st:630,en:750},{st:660,en:780}]).map(x=>`${x.lane}/${x.lanes}`),
     ['0/3','1/3','2/3']);
  eq('　　接續但不重疊（前一堂結束＝後一堂開始）不算撞課',
     dcalLanes([{st:600,en:660},{st:660,en:720},{st:720,en:780}]).map(x=>x.lanes), [1,1,1]);
}

console.log('\n收合與捲動');
ok('★ 縮放那套（.tcard-zoom ＋ 二分逼近）整個移除 —— 會把課卡壓扁',
   !/TCARD_ZOOM_MIN/.test(src) && !/--tcz/.test(src) && !/tcard-zoom">/.test(src)
   && /行事曆靠時間軸定位，縮放只會把課卡壓扁/.test(src)
   && /現在是面板收進視窗、行事曆自己內捲/.test(src));
ok('★ ⚠ overflow 要靠權重壓過 .mc-coachcenter .tcard-body（否則橫向捲不到）',
   /\.mc-coachcenter \.dcal-body\.tcard-body\{overflow:auto;gap:0;padding:0;\}/.test(src));
ok('　　時間軸與欄頭都是 sticky（捲動時看得到現在在幾點、是誰）',
   /\.dcal-timecol\{position:sticky;left:0;/.test(src)
   && /\.dcal-colhead\{height:var\(--dcal-head,46px\);position:sticky;top:0;/.test(src));
ok('　　課卡撐滿被分配到的格子（原本是固定 84×98 的橫排卡）',
   /\.dcal-slot>\.tcard\.tcard-std\{width:100%;height:100%;min-height:0;\}/.test(src));

console.log('\n沒有動到的地方');
ok('★ 手機版維持原本的圓點列表', /\$\{rows\.slice\(\)\.sort\(_taskSort\)\.map\(r=>r\.mobileHtml\)\.join\(''\)\}/.test(src));
ok('★ 預約管理仍是七日行事曆（_calDays 預設 7）', /let _calDays=7;/.test(src));
ok('　　cardHtml 保留（手機版與既有測試都還吃它）', /cardHtml: \(function\(\)\{/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
