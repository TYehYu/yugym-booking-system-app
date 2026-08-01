/* 2026-08-01 使用者指示（附首頁截圖，桌機管理員/櫃檯首頁四件事）：
   ①「首頁右上角跟插圖對稱的位子擺健身小知識」
      追加：「健身小知識的圖卡跟左邊插圖的大小要對稱」
   ②「新增會員 銷售 查看合約三個按鈕改到 KPI 的右邊」
   ③「讓版面維持在不用滑動視窗就可以看到所有訊息的大小
      中間教練預約課卡如果當天有很多教練上課 則按比例縮小課卡 不要用卷軸捲動視窗」
   ④「移除『晚安,余東曄』『今天狀況不好』狀況好的那天叫比賽」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 健身小知識移到右上角，與左上插畫對稱');
ok('★ 右欄第一格＝知識卡', /<div class="mc-g5-right">[\s\S]{0,240}<div class="mc-know-top">\$\{knowCardHTML\(\)\}<\/div>/.test(src));
ok('★ 左欄已不再放知識卡', !/<div class="mc-dutyplain">\$\{dutyRingCard\}<\/div>\s*\n\s*\$\{knowCardHTML\(\)\}/.test(src));
/* 2026-08-01 三修（使用者：「健身小知識因為縮得太小了 看不到完整訊息 要放大一點
   （左邊縮圖也放大一點）」）：兩張一起 114 → 150px，仍然對稱。 */
ok('★ 高度與插畫一致（兩張都是 150px）',
   /\.mc-art\{position:relative;width:100%;height:150px;/.test(src)
   && /\.mc-know-top \.know-card\{min-height:150px;height:150px;/.test(src));
ok('★ 說明放到四行、字級回到 12.5px（原本兩行會把話截掉）',
   /-webkit-line-clamp:4;/.test(src) && /\.mc-know-top \.know-s\{font-size:12\.5px;/.test(src));
ok('★ 貼齊頂欄的負上邊距也一致（-10 / 下 16）',
   /\.mc-g5-left>\.mc-art-top\{margin:-10px 0 16px !important;\}/.test(src)
   && /\.mc-g5-right>\.mc-know-top\{margin:-10px 0 16px !important;\}/.test(src));
ok('★ 右欄原本用 padding-top:43px 撐的齊頭留白要拿掉，否則空白跑到知識卡上面',
   /\.mc-g5-right\{flex:0 0 300px;min-width:0;display:flex;flex-direction:column;\s*\n\s*padding-top:0;\}/.test(src));
ok('　　壓成矮卡後內文改緊湊版（不再有 190px 直式卡的 52px 上留白）',
   /\.mc-know-top \.know-body\{margin-top:0;/.test(src));
ok('　　右側留給插圖，字不壓上去', /\.mc-know-top \.know-body\{margin-top:0;padding-right:62px;\}/.test(src));
/* 2026-08-01 使用者指示：「全系統的健身知識卡 背景色幫我參考首頁插圖的背景色套用」 */
ok('★ 知識卡底色與插圖卡一致（--card2 ＋ --bd 細框），不再是三個漸層',
   /\.know-card\{position:relative;min-height:190px;padding:16px 18px;overflow:hidden;cursor:pointer;\s*\n\s*background:var\(--card2,#FAF7F0\);border:1px solid var\(--bd\);/.test(src)
   && !/\.know-kc\{background:linear-gradient/.test(src));
ok('　　課別改由分類標籤的實色與插圖著色承接（資訊沒有少）',
   /\.know-kc\{--kc-acc:#134737;color:#134737;\}/.test(src)
   && /\.know-chip\{[\s\S]{0,120}background:var\(--kc-acc,#134737\);color:#fff;/.test(src));
ok('　　底色變淺後插圖透明度提高，才看得出筆觸', /width:120px;height:120px;opacity:\.5;/.test(src));
ok('　　點一下換下一則仍可用（knowNext 換的是卡本身，外層 .mc-know-top 保留）',
   /el\.outerHTML=knowCardHTML\(\);/.test(src));
ok('　　手機版知識卡不受影響（走另一條分支）',
   /\$\{monthCard\+todoCard\+knowCardHTML\(\)\}/.test(src));

console.log('\n② 三顆按鈕移到 KPI 右邊');
ok('★ quickCard 併進 KPI 條', /\.join\(''\)\}\s*\n\s*\$\{quickCard\}\s*\n\s*<\/div>`;/.test(src));
ok('★ 右欄已不再放 quickCard',
   !/<div class="mc-g5-right">[\s\S]{0,300}\$\{quickCard\}/.test(src));
ok('★ 三顆鈕的內容不變（新增會員／銷售／查看合約）',
   /openBackofficeMember\(\)">\$\{ICONS\.people\}<span>新增會員<\/span>/.test(src)
   && /openSalesModal\(\)">\$\{OPS_TODO_IC\.ticket\}<span>銷售<\/span>/.test(src)
   && /openContractQuickView\(\)"[\s\S]{0,320}<span>查看合約<\/span>/.test(src));
{
  /* quickCard 是 const，被 kpiStrip 的樣板字串引用 → 宣告一定要在前面，否則落在 TDZ 直接爆 */
  const q=src.indexOf('const quickCard=`<div class="mc-quick3">');
  const k=src.indexOf('const kpiStrip=`<div class="mc-kpistrip">');
  ok('★ quickCard 宣告在 kpiStrip 之前（const 的 TDZ）', q>0 && k>0 && q<k, {q,k});
  ok('　　原處只留說明，沒有第二份定義',
     (src.match(/const quickCard=/g)||[]).length===1);
}
/* 2026-08-01 二修（使用者：「三個中間 KPI 要靠右 跟按鈕靠在一起」） */
ok('★ 整條靠右，數字與按鈕成為同一群',
   /\.mc-g5-mid \.mc-kpistrip\{margin-bottom:14px;padding:6px 14px 0;justify-content:flex-end;gap:clamp\(16px,2\.4vw,52px\);\}/.test(src)
   && !/\.mc-g5-mid \.mc-kpistrip \.mc-quick3\{margin-left:auto;\}/.test(src));
ok('　　按鈕群自己的間距比數字之間近', /\.mc-kpistrip \.mc-quick3\{gap:10px;flex:0 0 auto;\}/.test(src));
/* 2026-08-01 二修（使用者：「首頁 KPI 右邊的三個按鈕可以放大一點 改成直式卡片」）——
   原本壓扁的小方塊跟旁邊 44px 的大數字擺一起太小。 */
ok('　　三顆鈕改成直式卡片（加寬加高、圖示放大），寬度可隨螢幕伸縮',
   /\.mc-kpistrip \.mc-quick3 \.mc-q3\{flex:0 0 auto;width:clamp\(76px,6\.4vw,96px\);min-height:96px;/.test(src)
   && /\.mc-kpistrip \.mc-quick3 \.mc-q3 svg\{width:26px;height:26px;\}/.test(src));
/* 2026-08-01 使用者回報：「我用 mac 上方會被切成兩列 用一般桌機就沒有」——
   筆電螢幕窄，固定 52px 間距＋三顆 96px 卡片擠不下，flex-wrap 一換行就變兩列。 */
ok('★ 不換行，空間不夠時先縮間距（clamp）而不是折行',
   /\.mc-kpistrip\{display:flex;align-items:center;justify-content:flex-end;\s*\n\s*gap:clamp\(16px,2\.4vw,52px\);min-width:0;padding-right:14px;flex-wrap:nowrap;\}/.test(src));
ok('　　數字群可壓縮（flex 預設 min-width:auto 會寧可溢出也不縮）',
   /\.mc-kpistrip \.kpi-it\{min-width:0;\}/.test(src));
ok('　　發票拆分那行過長時截斷，不把整條撐開',
   /\.mc-kpistrip \.kpi-sub\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;\}/.test(src));

console.log('\n③ 移除問候與那句話');
ok('★ kpi-greet 整塊不再產出', !/<div class="kpi-greet">/.test(src));
ok('★ greetingMsg 不再在首頁被呼叫', !/const _g5=greetingMsg\('staff', SESSION\.name\);/.test(src));
ok('　　.kg-t／.kg-s 樣式一併退場，不留無主規則',
   !/^\.kg-t\{/m.test(src) && !/^\.kg-s\{/m.test(src));
ok('　　使用者的原話寫在程式裡', /移除『晚安，余東曄』/.test(src));

console.log('\n④ 教練任務卡收進視窗、課卡按比例縮小');
ok('★ 有 fitCoachCards()，且首頁渲染完會呼叫',
   /function fitCoachCards\(\)\{/.test(src) && /try\{ fitCoachCards\(\); \}catch\(_\)\{\}/.test(src));
ok('★ 視窗改變大小要重算', /window\.addEventListener\('resize',\(\)=>\{ if\(document\.querySelector\('\.mc-g5-mid \.mc-coachcenter'\)\) fitCoachCards\(\); \}\);/.test(src));
/* 2026-08-01：全系統等比例縮放上線後，螢幕像素要換算回元素自己的座標（見 uiScale） */
ok('★ 高度量法與行事曆同一套（innerHeight − 元素 top − 留白，再除以縮放比）',
   /const avail=Math\.max\(220, Math\.round\(\(window\.innerHeight - top - 14\)\/uiScale\(\)\)\);/.test(src));
ok('★ 縮放用 zoom（會參與版面計算），不是 transform:scale',
   /\.mc-coachcenter \.tcard-body\{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;\s*\n\s*zoom:var\(--tcz,1\);/.test(src));
ok('　　為什麼不用 transform，寫在程式裡',
   /transform 只改繪製，寬度不變會在右邊留一大塊空白/.test(src));
ok('★ 高度鏈一路傳到課卡群（卡→wrap→card→panel→body）',
   /\.mc-coachcenter\{display:flex;flex-direction:column;overflow:hidden;\}/.test(src)
   && /\.mc-coachcenter>\.mc-timeline-wrap\{flex:1;min-height:0;/.test(src)
   && /\.mc-coachcenter \.mc-timeline-wrap>\.card\{flex:1;min-height:0;/.test(src)
   && /\.mc-coachcenter \.tl-panel\{flex:1;min-height:0;/.test(src));
ok('★ 縮到下限仍放不下 → 保留內捲，不默默切掉整列教練',
   /overflow-y:auto/.test(src) && /寧可捲，也不要把整列教練默默切掉/.test(src));
ok('　　左右兩欄刻意不設 overflow（第一格用負上邊距貼齊頂欄，變捲動容器會被裁掉）',
   /一旦變成捲動容器就會被裁掉/.test(src));
ok('　　手機版不套（走另一套版面）', /if\(isMobileLayout\(\) \|\| !body\)\{ cc\.style\.removeProperty\('max-height'\); return; \}/.test(src));

console.log('\n⑤ 實跑：縮放係數');
{
  const i=src.indexOf('const TCARD_ZOOM_MIN=0.62;');
  const j=src.indexOf("window.addEventListener('resize',()=>{ if(document.querySelector('.mc-g5-mid .mc-coachcenter'))", i);
  const code=src.slice(i,j);

  const run=(winH, ccTop, boxH, needH, mobile)=>{
    let maxH=null, z=null, removed=false;
    const body={ clientHeight:boxH, scrollHeight:needH,
      style:{ setProperty(k,v){ if(k==='--tcz') z=v; } } };
    const cc={ getBoundingClientRect:()=>({top:ccTop}), querySelector:()=>body,
      style:{ set maxHeight(v){ maxH=v; }, removeProperty(){ removed=true; } } };
    const doc={ querySelector:()=>cc };
    /* 2026-08-01：全系統等比例縮放上線後 fitCoachCards 會除以 uiScale()，
       這裡固定注入 1（＝基準寬度 1440 上的行為），驗的是高度計算本身。 */
    new Function('document','window','isMobileLayout','uiScale',code+'\nfitCoachCards();')
      (doc,{innerHeight:winH},()=>!!mobile,()=>1);
    return {maxH,z,removed};
  };

  eq('★ 內容放得下 → 不縮（zoom 1）', run(900,300,586,520).z, '1.000');
  eq('★ 卡片高度＝視窗剩下的高度（900−300−14）', run(900,300,586,520).maxH, '586px');
  eq('★ 內容超出 → 縮到剛好放得下（586/780）',
     run(900,300,586,780).z, '0.751');
  eq('★ 縮放有下限 0.62，再小就看不清楚名字了',
     run(900,300,586,5000).z, '0.620');
  eq('　　只差一點點（1px 內）不動它，避免每次重繪都抖一下',
     run(900,300,586,587).z, '1.000');
  eq('　　視窗很矮時仍給 220px 下限，卡片不會塌成一條',
     run(300,200,586,520).maxH, '220px');
  eq('　　手機版直接還原高度、不套縮放', run(900,300,586,1172,true), {maxH:null,z:null,removed:true});
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
