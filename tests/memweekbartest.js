/* 會員「我的預約」改版（2026-08-27 使用者回報，附 LINE 內建瀏覽器實機截圖）

   「因為上方會有一列 line 自己的瀏覽器標題　所以左邊日期列被嚴重壓縮
     第二個是目前這種頁面無法直接看到我的自主訓練預約的時間　都要點到該日期才看得到
     我的想法是把日期列改到上方課程篩選列這邊　因為會員應該也用不到篩選列
     就可以把課卡加寬　然後在下方導覽列新增一個浮動列　顯示自主訓練預約的圓形卡
     有約才出現　沒有約就不要顯示」

   三件事，這一支各守一件；外加兩條「不要順手改壞」的護欄：
     ⓐ s.filter 從此固定 'all' —— 被切走的話「可報名的團體課」會整片消失
     ⓑ 新樣式一律掛 .memh2 —— .admh2-card／.admh2-body 是跟管理員、教練手機首頁共用的 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const HTML=src.slice(src.indexOf('function memh2HTML(o){'), src.indexOf('function memh2MonthHTML('));
const CSS=src.slice(src.indexOf('<style>'), src.indexOf('</style>'));

console.log('① 日期列從左欄搬到上方，取代篩選列');
{
  ok('★★ 左欄（.admh2-rail）已經不在會員頁的 HTML 裡',
     !/class="admh2-rail"/.test(HTML) && !/class="a2-railin"/.test(HTML));
  ok('★★ 篩選列也不在（會員用不到）', !/class="mh2-chips"/.test(HTML));
  /* 2026-08-27 二修：日期列樣式從 .memh2 提升成共用的 .a2-w*（教練首頁也要用） */
  ok('★★ 上方是七格橫排日期列，接在分隔線之後、課卡欄之前',
     /<div class="admh-div"><\/div>\s*\n\s*<div class="a2-week">[\s\S]{0,400}<\/div>\s*\n\s*<div class="admh2-body">/.test(HTML));
  ok('★★ 一樣是週一～週日（節奏不變，只是換了方向）',
     /const base=heroWeekMonday\(s\.date\);/.test(HTML)
     && /for\(let i=0;i<7;i\+\+\)\{/.test(HTML));
  ok('★★ 每一格都能點，行為與原本一樣（memh2PickDay）',
     /onclick="memh2PickDay\('\$\{ds\}'\)"/.test(HTML));
  ok('★ 有課的那幾天標小圓點（左欄版沒有這個資訊）',
     /const _n=mine\.filter\(b=>b\.date===ds\)\.length;/.test(HTML)
     && /<em class="a2-wdot\$\{_n\?'':' z'\}"><\/em>/.test(HTML));
  ok('★★ 起因寫在原地（LINE 標題列 → 左欄七格瓜分高度）',
     /LINE 自己的標題列＋Android 狀態列吃掉視窗上緣，\s*\n\s*左欄七格被壓到只剩十幾 px，日期數字被裁掉一半、只看得到「8 月」/.test(src));
  ok('　 也寫了「換橫排就沒有這個前提」——不是再加第四段收斂',
     /那是在\s*\n\s*「高度本來就不夠」的前提下省字，換成橫排就沒有這個前提了/.test(src));
}

console.log('\n② 課卡吃到整個寬度');
{
  ok('★★ 課卡欄是 .admh2-body 裡唯一的一欄',
     /<div class="admh2-body">\s*\n\s*<div class="admh2-cards">\$\{cardsAll\}\$\{addBtn\}<\/div>\s*\n\s*<\/div>/.test(HTML));
  ok('★ 兩欄之間的 gap 收掉（原本要留給 62px 的左欄）—— 會員端與教練端逐頁列名',
     /\.memh2 \.admh2-body,\.chv2 \.admh2-body\{gap:0;\}/.test(CSS));
  ok('★★ 管理員手機首頁的左欄geometry還在（那 8px 是留給它的）',
     /\.admh2-body\{display:flex;gap:8px;/.test(CSS)
     && /\.admh2-rail\{flex:0 0 62px;/.test(CSS));
}

console.log('\n③ 底部浮動列：接下來的自主訓練');
{
  ok('★★ 有約才畫，沒約整條不出現（不是畫一條空的）',
     /const selfBar=selfUp\.length\s*\n\s*\? `<div class="mh2-selfbar">/.test(HTML)
     && /: '';/.test(HTML.slice(HTML.indexOf('const selfBar='))));
  ok('★★ 只列今天起、還沒過去的自主訓練',
     /const selfUp=mine\.filter\(b=>bkIsSelf\(b\) && String\(b\.date\|\|''\)>=today\)/.test(HTML));
  ok('★★ 照日期＋時間排（最近的在左邊）',
     /\.sort\(\(a,b\)=>String\(a\.date\+a\.start_time\)\.localeCompare\(String\(b\.date\+b\.start_time\)\)\)/.test(HTML));
  ok('★★ 圓形卡上下兩行：日期在上、時間在下 —— 這正是使用者說「看不到時間」的那個資訊',
     /<b>\$\{_d\.getMonth\(\)\+1\}\/\$\{_d\.getDate\(\)\}<\/b>\s*\n\s*<span>\$\{String\(b\.start_time\|\|''\)\.slice\(0,5\)\}<\/span>/.test(HTML));
  ok('★★ 點圓形卡＝跳到那一天（與月曆點日期同一個行為）',
     /class="mh2-sbc[\s\S]{0,120}onclick="memh2PickDay\('\$\{b\.date\}'\)"/.test(HTML));
  /* 2026-08-27 二修（使用者：「自主訓練的這一列可以再大個一倍」）：54 → 84px */
  ok('★ 圓的（border-radius:50%），不是膠囊，而且夠大（84px）',
     /\.memh2 \.mh2-sbc\{flex:none;width:84px;height:84px;border-radius:50%;/.test(CSS));
  ok('　 很窄的機型收一級，三顆仍排得下',
     /@media\(max-width:360px\)\{\s*\n\s*\.memh2 \.mh2-sbc\{width:72px;height:72px;\}/.test(CSS));
  ok('★★ 列變高不用另外算 —— admh2Mount 每次實測 barH 再從可用高度扣掉',
     /barH=Math\.round\(_sb\.getBoundingClientRect\(\)\.height\);/.test(src)
     && /高度變了課卡欄要跟著讓/.test(src));
  ok('　 用 bkIsSelf 判斷自主訓練（不自己比對課別字串）',
     /bkIsSelf\(b\) && String\(b\.date/.test(HTML));
  ok('　 封頂 12 張（一路排下去也不會變成無限長的橫捲）',
     /\.slice\(0,12\);/.test(HTML));
}

console.log('\n④ 浮動列是 fixed —— 高度要自己扣，不然最後一張課卡躲在它底下');
{
  ok('★★ 依實測的導覽列高度把自己墊上去（導覽列在會員端是靜態排在 flex 欄底）',
     /if\(_sb\)\{ _sb\.style\.bottom=navH\+'px'; barH=Math\.round\(_sb\.getBoundingClientRect\(\)\.height\); \}/.test(src));
  ok('★★ 兩條路（外殼／整頁）都扣掉 barH',
     /_sc\.clientHeight-top-16-barH/.test(src)
     && /window\.innerHeight - docTop - navH - 16 - barH/.test(src));
  ok('★★ navH 移到分岔之前量（兩條路共用）',
     src.indexOf("let navH=0;") < src.indexOf("const _sc=document.body.classList.contains('memh2-shell')"));
  ok('★★ 也不能蓋住下方月曆 —— 月曆排在 .admh2-body 之後，屬於外層捲動內容',
     /const _pad=barH\?\(16\+barH\)\+'px':'';/.test(src)
     && /if\(_sc\) _sc\.style\.paddingBottom=_pad;/.test(src)
     && /else \{ const _rt=body\.closest\('\.memh2'\); if\(_rt\) _rt\.style\.paddingBottom=_pad; \}/.test(src));
  ok('　 沒約的人要把留白清掉（交還給 CSS 的 16px），底下不會多一塊空白',
     /沒有浮動列時要把留白清掉（style 設回空字串，交還給 CSS 的 16px）/.test(src));
  ok('　 踩過的坑寫在原地（0822 導覽列擋住週日是同一個成因）',
     /浮動列不佔文件高度，所以要自己從可用高度裡扣掉，否則最後一張課卡躲在它底下/.test(src));
}

console.log('\n⑤ 護欄：s.filter 固定 all，樣式一律掛 .memh2');
{
  ok('★★ selfMode 釘死 false（原本 = s.filter===\'self\'）', /const selfMode=false;/.test(HTML));
  ok('★★ memh2SelfSlots 不再切 filter', !/_s\.filter='self'/.test(src));
  ok('★★ 「可報名的團體課」那條判斷還在（filter 被切走就會整片消失）',
     /const grpOpen=\(s\.filter==='all'\)/.test(HTML));
  ok('★★ 警語寫在兩個地方（宣告處與 memh2SelfSlots）',
     /日後若又把 filter 切走，團課報名卡會整片消失/.test(src)
     && /客人從［＋］回來之後團課報名卡會整片不見/.test(src));
  /* 新增的 class 一條都不能漏掛 .memh2 —— .admh2-* 是三個角色共用的 */
  /* 日期列那組已提升成共用（.a2-w*，教練首頁也用），所以只檢查會員專屬的浮動列 */
  const NEW=['mh2-selfbar','mh2-sbl','mh2-sbrow','mh2-sbc','mh2-sbtoday'];
  const naked=[];
  CSS.replace(/\/\*[\s\S]*?\*\//g,'').split('}').forEach(blk=>{
    const i=blk.indexOf('{'); if(i<0) return;
    const sel=blk.slice(0,i);
    if(NEW.some(c=>new RegExp('\\.'+c+'(?![\\w-])').test(sel)) && !/\.memh2/.test(sel))
      naked.push(sel.trim().replace(/\s+/g,' ').slice(0,60));
  });
  eq('★★ 新樣式沒有一條漏掛 .memh2', naked, []);
  ok('★★ 舊的左欄樣式整組留著（管理員／教練還在用，也是退回的路）',
     /\.admh2-rail\.a2-tight \.a2-dm\{display:none;\}/.test(CSS)
     && /\.a2-day\.a2-today\{background:var\(--green\);border-color:var\(--green\);\}/.test(CSS));
}

console.log('\n⑥ 沒有拿掉任何既有功能');
{
  ok('★★ ［＋］快速預約還在', /class="mh2-selfadd"[\s\S]{0,80}memh2SelfSlots/.test(HTML));
  ok('★★ 「不能用就寫原因」：效期外不藏鈕，改寫下面那一行',
     /const _selfBad=\(pk\.self>0\) && !selfOk\(s\.date\);/.test(HTML)
     && /這一天不在點數效期內，請往後選日期/.test(HTML));
  /* 2026-08-27（使用者：「日期列的回到今日按鈕不見了」「會員端的沒看到」）——
     .admh-todaybk 是 position:fixed 貼在頂欄左側；會員端是外殼模式（頂欄 position:static、
     真正在捲的是 .content），fixed 的定位基準與層級都跟原本設想的不一樣。
     改成日期列裡的一顆「今」，跟日期列一起流動、一起重繪。 */
  ok('★★ 三格票券 KPI、下方月曆都還在',
     /class="admh-kpis">\$\{kpis\}/.test(HTML)
     && /\$\{memh2MonthHTML\(mine\)\}/.test(HTML));
  ok('★★ 回到今天改做進日期列，只在「看的不是今天」時出現',
     /\$\{s\.date!==today\?`<button class="a2-wback" title="回到今天" onclick="memh2PickDay\('\$\{today\}'\)">今<\/button>`:''\}/.test(HTML)
     && !/admh-todaybk/.test(HTML));
  ok('　 用品牌綠不用紅（紅是警示色階，回到今天不是警示；綠也對上這一列的「今天」）',
     /\.a2-wback\{[\s\S]{0,200}?background:var\(--green\);/.test(CSS)
     && /用品牌綠不用紅：紅是警示色階（紅>金>綠），而「回到今天」不是警示/.test(src));
  ok('★★ 團體課報名卡、簽到手勢圖示都還在',
     /class="admh2-card mh2-grpopen/.test(HTML) && /mh2-tapic/.test(src));
  ok('★ 換週還有兩條路：左右箭頭 ＋ 下方月曆點日期',
     /onclick="memh2WeekShift\(-1\)"/.test(HTML) && /onclick="memh2WeekShift\(1\)"/.test(HTML));
}

console.log('\n⑦ 左右拖曳換週（2026-08-27 使用者：「日期列換頁左右拖曳 要補上　會員端 教練端 管理員端 都要」）');
{
  const SW=src.slice(src.indexOf('function a2WeekSwipe(shift){'),
                     src.indexOf('/* ══ 底部導覽列：自己校正回視窗底部'));
  ok('★★ 有這一支，而且三頁共用（掛在 admh2Mount 裡，換週函式用參數帶進來）',
     SW.length>600 && /try\{ a2WeekSwipe\(_shift\); \}catch\(_\)\{\}/.test(src));
  ok('★★ 換週函式不是寫死的 —— 三頁的選日狀態不同，共用一支會跳到別頁那一週',
     /function a2WeekSwipe\(shift\)\{/.test(SW)
     && /if\(d\)\{ try\{ shift\(d\); \}catch\(_\)\{\} \}/.test(SW)
     && !/admWeekShift|coachWeekShift|memh2WeekShift/.test(SW));
  ok('★★ 軸鎖：垂直手勢讓給頁面捲動（左欄版不需要，它自己 overflow:hidden）',
     /let x0=null, y0=null, dir=0, lock=0;/.test(SW)
     && /if\(!lock\)\{ if\(Math\.abs\(dx\)<6 && Math\.abs\(dy\)<6\) return; lock=\(Math\.abs\(dx\)>Math\.abs\(dy\)\)\?1:-1; \}/.test(SW)
     && /if\(lock<0\) return;/.test(SW));
  ok('　 軸鎖只判一次（斜著拉不會抖）', /軸鎖只判一次：先動哪個方向就歸哪個方向/.test(SW));
  ok('★★ 放開才換週（0823 定案：拉著還沒放就不要換頁），touchcancel 視同取消',
     /wk\.addEventListener\('touchend',\(\)=>end\(true\),\{passive:true\}\);/.test(SW)
     && /wk\.addEventListener\('touchcancel',\(\)=>end\(false\),\{passive:true\}\);/.test(SW)
     && /const end=\(commit\)=>\{\s*\n\s*const d=commit\?dir:0;/.test(SW));
  ok('★★ 手感與左欄版同一組數值（門檻 44、位移封頂 26、打四五折）',
     /const TH=44, MAXOFF=26;/.test(SW)
     && /days\.style\.transform='translateX\('\+Math\.max\(-MAXOFF,Math\.min\(MAXOFF, dx\*0\.45\)\)\+'px\)';/.test(SW));
  ok('★★ 往右拉＝上一週、往左推＝下一週（跟月曆一樣，往回拉就是往回看）',
     /const d=\(dx<=-TH\)\?1:\(\(dx>=TH\)\?-1:0\);/.test(SW)
     && /wk\.classList\.add\(d>0\?'a2-armnext':'a2-armprev'\);/.test(SW));
  ok('★ 待命時亮起「會換到哪一週」那一顆箭頭',
     /\.a2-week\.a2-armprev \.a2-wnav:first-child,\s*\n\.a2-week\.a2-armnext \.a2-wnav:last-child\{color:var\(--green\);transform:scale\(1\.5\);\}/.test(CSS));
  ok('★ 放開一律彈回原位（不論有沒有換週）',
     /const snap=\(\)=>\{ days\.style\.transition='transform \.18s'; days\.style\.transform='';/.test(SW)
     && /clearArm\(\); snap\(\);/.test(SW));
  ok('★★ 每個 .a2-week 元素只綁一次（每次重繪都是新元素，所以旗標掛在元素上）',
     /if\(!wk \|\| wk\._a2ws\) return;/.test(SW) && /wk\._a2ws=true;/.test(SW));
  ok('　 起因寫在原地（日期列搬上來之後，原本綁在 .admh2-rail 的手勢就跟著沒了）',
     /0827 把日期列從左欄搬到上方之後，原本綁在 \.admh2-rail 上的「上下拖曳換週」就跟著沒了/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
