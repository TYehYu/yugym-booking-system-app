/* Ink 視覺層擴到教練與櫃檯（2026-08-27 使用者指示）
   「把教練、櫃檯的桌機頁面設計也全部改成跟管理員一樣，
     但相關權限功能要注意不要打開、保留原來的」

   這一支不驗好不好看 —— 只驗一件事：**外觀換了，權限一個都沒鬆**。
   做法上這是成立的（Ink 只是 body 上的一個 class，沒有任何權限判斷讀它），
   但「成立」要有人守著，不然下一次有人為了對齊版面順手 display:block 一顆按鈕。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* Ink 的所有 CSS 區塊（樣式表裡以 body.ink 開頭的每一條）
   ⚠ 2026-09-04 補洞：原本只 split('}')，於是 @media／@container 區塊裡的
     **第一條**規則會被漏掉 —— 那一塊切出來長這樣：
        "@container (min-width:52px){\n  body.ink … .co-fl{display:inline;"
     取第一個 '{' 之前當選擇器，拿到的是 "@container (min-width:56px)"，
     不含 body.ink，就被濾掉了。第二條之後才正常。
     這支測試守的是「Ink 不會把藏起來的東西掀出來」，漏看等於白守，
     所以先把 at-rule 的前綴整個拿掉再切（多出來的 '}' 只會切出空塊，無害）。 */
const CSS=src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
const INK_RULES=CSS.replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/@[a-zA-Z-]+[^{]*\{/g,'')
  .split('}').filter(b=>b.indexOf('{')>=0 && /body\.ink/.test(b.slice(0,b.indexOf('{'))));

console.log('① Ink 只是一個 class，沒有任何權限判斷讀它');
{
  /* 把 body.ink / inkOn / inkApply 出現的每一處列出來，確認都只在「切樣式」的脈絡 */
  const uses=[...src.matchAll(/inkOn\(\)|inkApply\(\)|classList\.toggle\('ink'/g)].map(m=>m[0]);
  ok('★★ inkOn 只被 inkApply 用，inkApply 只在 navTo／resize／orientationchange 呼叫',
     /function inkApply\(\)\{ try\{ document\.body\.classList\.toggle\('ink', inkOn\(\)\); \}catch\(_\)\{\} \}/.test(src)
     /* 只數程式碼裡的（註解也會提到 inkOn()） */
     && (src.replace(/\/\*[\s\S]*?\*\//g,'').match(/inkOn\(\)/g)||[]).length===2   // 宣告 ＋ inkApply 裡那一次
     && /function navTo\(key, gkey\)\{\s*\n\s*inkApply\(\);/.test(src));
  ok('★★ 沒有任何權限／流程判斷讀 body.ink 或 inkOn',
     !/if\s*\([^)]*inkOn\(\)/.test(src.replace(/document\.body\.classList\.toggle\('ink', inkOn\(\)\)/g,''))
     && !/classList\.contains\('ink'\)/.test(src));
  ok('★★ 理由寫在原地', /這一層\*\*只有 CSS\*\*：body 上多一個 class 而已，沒有任何權限判斷讀它/.test(src));
}

console.log('\n② Ink 的 CSS 不會讓任何東西「從看不到變看得到」');
{
  const shown=INK_RULES.filter(b=>{
    const body=b.slice(b.indexOf('{')+1);
    return /display\s*:\s*(block|flex|inline|inline-block|grid|table)/.test(body)
        || /visibility\s*:\s*visible/.test(body)
        || /pointer-events\s*:\s*auto/.test(body)
        || /opacity\s*:\s*1(?![\d.])/.test(body) && /disabled|readonly|noint|masked|view/.test(b.slice(0,b.indexOf('{')));
  }).map(b=>b.slice(0,b.indexOf('{')).trim().replace(/\s+/g,' ').slice(0,60));
  /* 白名單放的都是「本來就看得到的東西，只是換一種排法」——
     display:inline-flex／flex 在這些選擇器上是為了置中或排欄，不是把藏起來的東西掀出來。
     ⚠ 要往這裡加東西之前，先確認那個元素在沒有 body.ink 時也看得到；
       這支測試守的是權限，不是版面。
     ・cchip-dot／dw-／mc-rs-／mc-rev／lp-：既有項目
     ・mc-cell.mc-sel .mc-d：日期數字（永遠可見），inline-flex 只為了置中在 22px 圓圈裡
       （2026-09-03 選取從方框改圓框）
     ・cal-ev-std 的 co-fl／evc-coach／evc-time／evc-hm（2026-09-04 課卡四列改版）：
       （evc-hm ＝ 第一列裡的時鐘數字，2026-09-04 為了讓 [NEW] 能單獨留下才拆出來的節點）
       這三樣在**沒有 Ink 時也一樣顯示**，Ink 這幾條只是把「窄到什麼程度才收起來」
       的門檻放寬 —— Ink 把教練膠囊的底與 padding 拿掉、時間字級鎖 10px，
       同一張卡在 Ink 底下就是塞得下更多字（量出來：全名 62→52px、時間 64→60px）。
       它們全都是版面門檻，沒有一項是「非 Ink 看不到、Ink 才看得到」的功能。 */
  eq('★★ 沒有一條把元素顯示出來／恢復點擊（display:block、visibility、pointer-events:auto）',
     shown.filter(x=>!/cchip-dot|dw-|mc-rs-|mc-rev|lp-|mc-cell\.mc-sel \.mc-d/.test(x))
          .filter(x=>!/^body\.ink \.cal-ev\.cal-ev-std.*(\.co-fl|\.evc-coach|\.evc-tim|\.evc-hm)/.test(x)), []);
  ok('★★ 完全沒有 pointer-events —— 不可能把「不能點」變成「能點」',
     !INK_RULES.some(b=>/pointer-events/.test(b)));
  /* 三條 display:none 沒有一條是在藏功能：
     ・tcard-co／tcard-done::before：拿掉重複的裝飾（Ink 另有表達方式）
     ・co-ab（2026-09-04）：教練「兩字縮寫」那一份。全名與縮寫本來就是兩份 DOM、
       永遠只顯示其中一份；Ink 藏縮寫，正是因為它同時把**全名**放出來了
       （見上面 co-fl 那條）。藏掉的資訊量是負的 —— 從 RA 變成 RANDY。 */
  ok('★★ 三條 display:none 都是「拿掉重複的那一份」，不是藏功能',
     INK_RULES.filter(b=>/display\s*:\s*none/.test(b)).length===3
     && /\.tcard-row \.tcard-co:not\(\.tcard-leavetag\)\{display:none;\}/.test(src)
     && /\.tcard-std\.tcard-done:not\(\.tcard-live\)::before\{display:none;\}/.test(src)
     /* 縮寫被藏起來時，同一個容器查詢一定要把全名放出來，否則就真的少了東西 */
     && /@container \(min-width:52px\)\{\s*\n\s*body\.ink \.cal-ev\.cal-ev-std \.co-fl\{display:inline;\}\s*\n\s*body\.ink \.cal-ev\.cal-ev-std \.co-ab\{display:none;\}/.test(src));
}

console.log('\n③ 三種角色各自的權限判斷一行都沒動');
{
  const guards=[
    ['桌機行事曆：教練只能動自己的課',
     /if\(SESSION && SESSION\.role==='coach' && !SESSION\.is_manager\s*\n?\s*&& !\(typeof bkIsCoach==='function' && bkIsCoach\(b,SESSION\.id\)\)\) return '只能調整自己的課';/],
    ['教練桌機：別人的課只看不動（maskOthers）',
     /const _isCoachView = SESSION\.role==='coach' && !SESSION\.is_manager;/],
    ['排班表：櫃檯可看不可改', /const canEdit = SESSION\.role==='admin'\|\|!!SESSION\.is_manager;/],
    ['值班時段：同一條線', /if\(!D\.canEdit\)\{ showToast\('僅管理員／店長可調整'\); return; \}/],
    ['抽獎登記：僅管理員／櫃台', /if\(typeof isDeskLike==='function' && !isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可登記抽獎'\); return; \}/],
    ['會員管理：新增會員限櫃檯以上', /const canManage = isDeskLike\(\);/],
    ['票券校正：只有管理員', /這件事只有管理員能改<\/b>，請找管理員處理/],
    ['導覽列：依角色過濾', /function visibleGroups\(\)\{/],
    ['櫃檯是設備帳號（isDeskLike 定義）', /function isDeskLike\(\)/],
  ];
  eq('★★ 九道權限關卡全部還在', guards.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★★ Ink 的 CSS 沒有碰任何一個「權限相關」的 class',
     !INK_RULES.some(b=>/cal-ev-noint|bk-masked|cal-ev-view|readonly|disabled|dw-edit/.test(b.slice(0,b.indexOf('{')))));
}

console.log('\n④ 涵蓋範圍：員工桌機一律套、會員與手機不套');
{
  const fn=(sess,mobile)=>new Function('SESSION','localStorage','isMobileLayout',
    src.slice(src.indexOf('function inkOn(){'), src.indexOf('function inkApply()'))+'\nreturn inkOn;')(
      sess, {getItem:()=>null,setItem:()=>{}}, ()=>!!mobile)();
  eq('★★ 管理員／櫃檯／教練（桌機）都套',
     ['admin','front_desk','coach'].map(r=>fn({role:r},false)), [true,true,true]);
  eq('★★ 會員不套（會員端有自己的 memh2 版面）', fn({role:'member'},false), false);
  eq('★★ 三種角色在手機都不套',
     ['admin','front_desk','coach'].map(r=>fn({role:r},true)), [false,false,false]);
  eq('　 還沒登入不套', [fn(null,false), fn({role:''},false)], [false,false]);
  ok('★ 三種角色的桌機本來就都在 mc-mode（橄欖綠頂欄不必為誰另寫一份）',
     /const isDeskStaff = !isMobileLayout\(\) && isDeskLike\(\);/.test(src)
     && /const isCoachWide = !isMobileLayout\(\) && !!\(SESSION && SESSION\.role==='coach' && !SESSION\.is_manager\);/.test(src)
     && /document\.body\.classList\.toggle\('mc-mode', !!\(isDeskStaff\|\|isCoachWide\)\);/.test(src));
  ok('　 逃生門仍在（yugym_ink=0 當場退回舊版）',
     /if\(v==='0'\) return false; if\(v==='1'\) return true;/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
