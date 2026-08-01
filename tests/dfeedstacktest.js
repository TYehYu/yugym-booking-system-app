/* 2026-08-01 使用者指示（右下角滑出的通知卡，兩件事）：
   ①「右下角跳出的課卡 可以連動到畫面去嗎 例如 8/8 11:00 調整到 8/20 11:00
      點這張卡片會跳到 8/20 卡片這頁預約行事曆」
   ②「右下角滑出的卡片用重疊顯示 避免畫面一整排被遮住」

   ① 的難處：notifications 只有 title/body 兩個字串，沒有 booking id 也沒有日期欄，
      而且寫入來源有三處（前端 mchgNotify、DB desk_alert、會員自助那三支 RPC）。
      共通點是 body 一律以「MM/DD HH:MM」開頭 → 從文字讀，舊通知也直接生效。
   ② 的難處：疊卡要絕對定位，但 #dfeed-list 原本是 flex 欄；換過去之後
      「另有 N 則」那一行會被壓在卡片底下，所以搬到 list 外面。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 從通知文字讀出日期時間');
{
  const i=src.indexOf('function dfeedRefOf(n){');
  const body=src.slice(i, src.indexOf('\n}\n', i)+3);
  const dfeedRefOf=new Function(body+'\nreturn dfeedRefOf;')();

  eq('★ 手機變更預約：08/20 11:00 → 2026-08-20 11:00',
     dfeedRefOf({body:'08/20 11:00　私人教練　鄭阿玲　·　已預約',created_at:'2026-08-01T10:38:40Z'}),
     {date:'2026-08-20',time:'11:00'});
  eq('★ 會員自助預約（desk_alert 寫的）也讀得到',
     dfeedRefOf({body:'08/03 21:00　自主訓練',created_at:'2026-08-01T11:05:44Z'}),
     {date:'2026-08-03',time:'21:00'});
  eq('★ 團課那種後面帶括號的也讀得到',
     dfeedRefOf({body:'08/04 16:30　團體課（名單 3/5）',created_at:'2026-08-01T10:49:01Z'}),
     {date:'2026-08-04',time:'16:30'});
  eq('★ 取消通知（後面帶說明）一樣讀得到',
     dfeedRefOf({body:'08/02 13:00　自主訓練（24 小時內取消，未退堂）',created_at:'2026-08-01T10:02:30Z'}),
     {date:'2026-08-02',time:'13:00'});
  eq('★ 一位數時刻要補零，才對得上課卡的 data-time',
     dfeedRefOf({body:'08/20 9:00　私人教練',created_at:'2026-08-01T10:00:00Z'}),
     {date:'2026-08-20',time:'09:00'});

  console.log('\n　跨年：body 只有月／日，年份要從 created_at 推');
  eq('★ 12 月底送出、課在 01/05 → 算明年',
     dfeedRefOf({body:'01/05 11:00　私人教練',created_at:'2026-12-28T10:00:00Z'}).date, '2027-01-05');
  eq('★ 1 月初送出、課在 12/28（補登舊課）→ 算去年',
     dfeedRefOf({body:'12/28 11:00　私人教練',created_at:'2027-01-02T10:00:00Z'}).date, '2026-12-28');
  eq('　　同年份的正常情況不受影響（相差 5 個月以內）',
     dfeedRefOf({body:'12/28 11:00　私人教練',created_at:'2026-08-01T10:00:00Z'}).date, '2026-12-28');
  eq('　　台灣時區：UTC 12/31 16:30 已經是台灣 1/1',
     dfeedRefOf({body:'01/05 11:00　私人教練',created_at:'2026-12-31T16:30:00Z'}).date, '2027-01-05');

  console.log('\n　讀不出來就不要亂猜（寧可不可點，也不要跳到錯的日期）');
  eq('★ 新會員通知沒有日期 → null', dfeedRefOf({body:'0912345678　自行完成申辦'}), null);
  eq('　　完全沒有 body → null', dfeedRefOf({}), null);
  eq('　　月份不合理（13/40）→ null', dfeedRefOf({body:'13/40 11:00'}), null);
  eq('　　只有日期沒有時間 → null', dfeedRefOf({body:'08/20　私人教練'}), null);
}

console.log('\n② 點卡片跳到行事曆那一天');
ok('★ 讀得出日期的卡才掛 onclick（左下角新會員卡不掛）',
   /const ref=left\?null:dfeedRefOf\(n\);/.test(src)
   && /el\.setAttribute\('onclick',`dfeedGo\('\$\{n\.id\}'\)`\);/.test(src));
ok('★ 日期時間存在卡片上（data-date／data-time）',
   /el\.setAttribute\('data-date',ref\.date\); el\.setAttribute\('data-time',ref\.time\);/.test(src));
ok('★ 有可點的樣式，右邊提示「移動 ›」', /el\.classList\.add\('dfeed-tap'\);/.test(src)
   && /'<span class="dfeed-goto">移動 ›<\/span>'/.test(src));
/* 2026-08-01 使用者指示：「左邊增加一個明顯的提示區域 新增/取消/變更
   顏色綠色/紅色/黃色　移除[確認]　因為點選卡片以後要移動到課卡的位子
   改成提示在旁邊 移動>」 */
ok('★ 左邊有動作色塊：新增／取消／變更',
   /const kindLb=\{book:'新增',cancel:'取消',move:'變更',newmem:'新會員'\}\[kind\]\|\|'變更';/.test(src)
   && /<span class="dfeed-kind dfeed-kind-\$\{kind\}">\$\{kindLb\}<\/span>/.test(src));
ok('★ 三個顏色：新增綠、取消紅、變更黃',
   /\.dfeed-kind-book\{background:var\(--green,#1f6f54\);color:#fff;\}/.test(src)
   && /\.dfeed-kind-cancel\{background:var\(--danger,#b5372e\);color:#fff;\}/.test(src)
   && /\.dfeed-kind-move\{background:#e6c274;color:#4a2f10;\}/.test(src));
ok('★「✓ 確認」鈕移除 —— 點卡片＝處理過，順手標已讀',
   /try\{ deskFeedAck\(id\); \}catch\(_\)\{\}/.test(src)
   && /點過就等於處理過（2026-08-01 使用者指示：移除「✓ 確認」）/.test(src));
ok('　　讀不出日期、沒有地方可去的才留確認鈕（否則收不掉）',
   /const rightTag = ref\s*\n\s*\? '<span class="dfeed-goto">移動 ›<\/span>'\s*\n\s*: `<button class="dfeed-ok"/.test(src));
ok('　　左下角的新會員卡維持原本的圖示與確認鈕（那邊沒有課可以跳）',
   /const kindTag = left\s*\n\s*\? `<span class="dfeed-ic">/.test(src));
ok('　　有色塊時左緣那條 4px 粗邊收回一般邊框（兩塊同色黏在一起像破圖）',
   /\.dfeed-card\.dfeed-has-kind\{border-left:1px solid var\(--bd\);padding-left:10px;\}/.test(src));
ok('★「✓ 確認」不能順便觸發跳頁',
   /onclick="event\.stopPropagation\(\);deskFeedAck\('\$\{n\.id\}'\)"/.test(src));
ok('★ 跳週的算法跟「跳至日期」同一套（7／5 日檢視跳到那週週一）',
   /if\(nDays===7\|\|nDays===5\)\{ const dow=d\.getDay\(\); calWeekStart=addDays\(d,-\(\(dow\+6\)%7\)\); \}\s*\n\s*else calWeekStart=d;/.test(src));
ok('★ 走 navTo(\'calendar\')，並帶 _calStepping（沿用既有的快取路徑）',
   /window\._calStepping=true;\s*\n\s*window\._dfeedFocus=\{date,time\};\s*\n\s*navTo\('calendar'\);/.test(src));
ok('★ 到站後把那個時段的課卡閃起來', /function dfeedFlashSoon\(tries\)\{/.test(src)
   && /const col=document\.querySelector\(`\.cal-daycol\[data-date="\$\{f\.date\}"\]`\);/.test(src)
   && /col\.querySelectorAll\(`\.cal-ev\[data-time="\$\{f\.time\}"\]`\)/.test(src));
ok('★ 行事曆是非同步渲染 → 用重試等它畫出來，不是賭一個 setTimeout',
   /if\(t>0\) setTimeout\(\(\)=>dfeedFlashSoon\(t-1\),160\);/.test(src));
ok('　　等不到就放棄並清掉焦點，不會一直重試', /else window\._dfeedFocus=null;/.test(src));
ok('　　閃完會自己清掉 class', /setTimeout\(\(\)=>hits\.forEach\(e=>e\.classList\.remove\('cal-ev-flash'\)\),3200\);/.test(src));
ok('　　閃爍樣式存在，且尊重「減少動態效果」',
   /\.cal-ev\.cal-ev-flash,\.cag-std\.cal-ev-flash/.test(src)
   && /@media \(prefers-reduced-motion:reduce\)\{ \.cal-ev\.cal-ev-flash\{animation:none;\} \}/.test(src));
/* 2026-08-01 使用者指示：「圓形卡旁邊提示的黃色閃爍改成綠色 比較明顯」——
   金色在暖色系的課卡與褐金色圓點上都不夠跳。 */
ok('　　閃爍改綠色（金色在暖色系的課卡上不夠跳）',
   /outline:2px solid var\(--green,#1f6f54\);outline-offset:1px;\}/.test(src)
   && /@keyframes calEvFlash\{0%,100%\{box-shadow:0 0 0 0 rgba\(31,111,84,0\);\}50%\{box-shadow:0 0 0 7px rgba\(31,111,84,\.38\);\}\}/.test(src));
ok('　　為什麼從文字讀而不是改三處寫入，寫在程式裡',
   /而且對已經躺在畫面上的舊通知也直接生效/.test(src));

console.log('\n③ 疊卡排版');
ok('★ #dfeed-list 改成相對定位容器（不再是 flex 欄）',
   /#dfeed-list\{position:relative;display:block;width:100%;height:0;/.test(src));
/* 2026-08-01 使用者回報「右下角訊息是不是被折疊到不見了」：卡片改成絕對定位之後，
   list 裡沒有任何在流內的東西 → 內容寬度 0 → 靠內容撐寬的外層縮成 0 寬，整條看不見。 */
ok('★ 外層容器的寬度要給死，不能只給 max-width（絕對定位撐不出寬度）',
   /#desk-feed\{position:fixed;right:18px;bottom:18px;z-index:250;display:flex;flex-direction:column;\s*\n\s*gap:10px;align-items:flex-end;pointer-events:none;width:min\(380px,90vw\);max-width:min\(380px,90vw\);\}/.test(src));
ok('　　原因寫在程式裡（下次不會又把 width 拿掉）',
   /內容寬度就是 0；這個容器又是靠內容撐寬的/.test(src));
ok('★ 卡片絕對定位、從上緣縮放（露出的是上緣）',
   /#dfeed-list \.dfeed-card\{position:absolute;left:0;right:0;width:auto;transform-origin:50% 0;/.test(src));
ok('★ 左下角的新會員通知不受影響（選擇器只鎖 #dfeed-list）',
   /#dfeed-left-list\{display:flex;flex-direction:column;gap:10px;align-items:flex-start;width:100%;\}/.test(src));
ok('★ 進場動畫的關鍵影格帶上 scale(var(--dfs))，結束時才不會彈一下',
   /@keyframes dfeedIn\{from\{opacity:0;transform:translateX\(28px\) scale\(var\(--dfs,1\)\);\}to\{opacity:1;transform:scale\(var\(--dfs,1\)\);\}\}/.test(src));
ok('★ 滑進來展開、滑開延遲收合', /el\.addEventListener\('mouseover',\(\)=>dfeedSetOpen\(true\)\);/.test(src)
   && /_dfeedCloseT=setTimeout\(\(\)=>\{ _dfeedCloseT=null; dfeedSetOpen\(false\); \},300\);/.test(src));
ok('　　為什麼要延遲，寫在程式裡（卡片間有空隙，容器 pointer-events:none）',
   /游標經過空隙時 mouseout 的 relatedTarget 會是底下的頁面/.test(src));
ok('　　容器不改成可點是刻意的（攤開時很高，不能擋住整個畫面）',
   /攤開時它可以有 600px 高，不能把底下的畫面全擋住/.test(src));
ok('★「另有 N 則」搬出 #dfeed-list（留在裡面會被疊卡壓住）',
   /box\.insertBefore\(more, list\);/.test(src)
   && !/more\.textContent=`另有 \$\{total-shown\} 則，確認後會接著顯示`;\s*\n\s*list\.appendChild\(more\);/.test(src));
ok('★ 新增／確認／輪詢移除後都重新排版',
   /host\.appendChild\(el\);\s*\n\s*if\(!left\) dfeedLayout\(\);/.test(src)
   && /el\.classList\.add\('out'\); dfeedLayout\(\);/.test(src)
   && /dfeedLayout\(\);   \/\/ 別台確認掉的卡移除後要補位/.test(src));
ok('　　視窗改變大小要重排（卡片會換行、高度變了）',
   /window\.addEventListener\('resize',\(\)=>\{ try\{ dfeedLayout\(\); \}catch\(_\)\{\} \}\);/.test(src));
ok('　　攤開後捲到底，最新的一張要看得到', /if\(box\) setTimeout\(\(\)=>\{ box\.scrollTop=box\.scrollHeight; \},300\); \}/.test(src));

console.log('\n④ 實跑排版計算');
{
  /* 用假 DOM 跑 dfeedLayout：只需要 offsetHeight／style／classList／querySelectorAll */
  const mkCard=(h,out)=>({ offsetHeight:h, _h:h, classList:{ _s:new Set(out?['out']:[]),
      contains(c){return this._s.has(c);}, add(c){this._s.add(c);}, remove(c){this._s.delete(c);} },
    style:{ _p:{}, setProperty(k,v){this._p[k]=v;},
      set height(v){ this._hv=v; }, get height(){ return this._hv||''; } } });
  const i=src.indexOf('const DFEED_PEEK=9,');
  const body=src.slice(i, src.indexOf('\n/* ── 通知卡 → 行事曆', i));
  let LIST, CARDS=[], HINT=null;
  const doc={
    getElementById(id){
      if(id==='dfeed-list') return LIST;
      if(id==='dfeed-hint') return HINT;
      if(id==='desk-feed') return {scrollTop:0,scrollHeight:0};
      return null;
    },
    createElement(){ HINT={id:'',className:'',textContent:'',remove(){HINT=null;}}; return HINT; },
  };
  LIST={ style:{}, querySelectorAll(){ return CARDS; }, appendChild(){} };
  const mk=new Function('document','setTimeout',
    body+'\nreturn {dfeedLayout,dfeedSetOpen,setOpen:v=>{_dfeedOpen=v;},cards:dfeedCards};')
    (doc, (f)=>f());

  // 收合：三張（60 / 80 / 70，最新的是 70）
  CARDS=[mkCard(60),mkCard(80),mkCard(70)];
  mk.setOpen(false); mk.dfeedLayout();
  eq('★ 收合：最新那張貼底（hint 22 + 露出 2 張 × 9 = 40）', CARDS[2].style.top, '40px');
  eq('★ 收合：往回一張各露 9px', [CARDS[1].style.top,CARDS[0].style.top], ['31px','22px']);
  eq('★ 收合：後面的卡高度鎖成跟最前面那張一樣（不然會從下緣露出來）',
     [CARDS[0].style.height,CARDS[1].style.height,CARDS[2].style.height], ['70px','70px','']);
  eq('★ 收合：層級由前往後遞減', CARDS.map(c=>c.style.zIndex), ['98','99','100']);
  eq('★ 收合：越後面縮得越小', CARDS.map(c=>c.style._p['--dfs']), ['0.944','0.972','1.000']);
  eq('★ 收合：整疊高度＝提示 22 + 2×9 + 最前面那張 70', LIST.style.height, '110px');
  ok('★ 收合：顯示張數提示', !!HINT && /^3 則/.test(HINT.textContent), HINT&&HINT.textContent);

  // 展開：同三張
  mk.setOpen(true); mk.dfeedLayout();
  eq('★ 展開：由上而下依實際高度排（gap 10）',
     CARDS.map(c=>c.style.top), ['0px','70px','160px']);
  eq('★ 展開：不縮放、都可點', [CARDS.map(c=>c.style._p['--dfs']).join(','),CARDS[0].style.pointerEvents],
     ['1,1,1','auto']);
  eq('★ 展開：整疊高度＝60+80+70+2×10', LIST.style.height, '230px');
  eq('★ 展開：鎖住的高度要放掉，卡片才回到原本大小',
     CARDS.map(c=>c.style.height), ['','','']);
  ok('★ 展開後不再顯示張數提示', HINT===null);

  // 超過 4 張：第 5 張以後只計入數字，不佔位
  CARDS=[mkCard(50),mkCard(50),mkCard(50),mkCard(50),mkCard(60)];
  mk.setOpen(false); mk.dfeedLayout();
  eq('★ 露出上限 3 張：更後面的隱形且不可點',
     [CARDS[0].style.opacity,CARDS[1].style.opacity,CARDS[4].style.opacity], ['0','1','1']);
  eq('　　隱形的那張跟最後一張露出的疊在同一位置，不會再往上長',
     [CARDS[0].style.top,CARDS[1].style.top], ['22px','22px']);
  eq('　　高度仍只算 3 張露出（22 + 27 + 60）', LIST.style.height, '109px');
  ok('　　張數提示講的是全部 5 則，不是露出的 4 則', /^5 則/.test(HINT.textContent), HINT.textContent);

  // 單張：不疊、不顯示提示
  CARDS=[mkCard(64)];
  mk.setOpen(false); mk.dfeedLayout();
  eq('★ 只有一張時維持原樣（不縮放、貼齊 0）',
     [CARDS[0].style.top,CARDS[0].style._p['--dfs'],LIST.style.height], ['0px','1','64px']);
  ok('　　單張不顯示張數提示', HINT===null);

  // 正在播移除動畫的卡不佔位
  CARDS=[mkCard(50,true),mkCard(70)];
  mk.setOpen(false); mk.dfeedLayout();
  eq('★ .out（正在淡出）的卡不算進排版，剩下的立刻補位', LIST.style.height, '70px');

  CARDS=[];
  mk.dfeedLayout();
  eq('★ 全部確認完，整疊收成 0（不留空白區塊）', LIST.style.height, '0px');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
