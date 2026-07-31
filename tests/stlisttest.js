/* 員工列表整合成一張表（2026-07-30 使用者指示）
   ① 分類不要各自切一段、各印一次表頭 → 整份合成一張、共用最上面那列標題，類型只用顏色分
   ② 標題跟內容沒有對齊  ③ 中間空白好～～好～～多  ④ 再加「工作規則」與「休假日」兩欄 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('整合成一張表');
ok('★ 不再每個聘僱類型切一段、各印一次表頭',
   !/\$\{stHead\}<div class="st-list">\$\{secs\[k\]\.map\(stRow\)\.join\(''\)\}<\/div>/.test(src));
ok('★ 整份共用一列表頭、一個 st-list',
   /body = `<div class="st-legend">\$\{legend\}\$\{stMonthBar\(_ym,_isCurMonth\)\}<\/div>\$\{stHead\}<div class="st-list">\$\{allRows\.map\(stRow\)\.join\(''\)\}<\/div>`;/.test(src));
ok('★ 排序仍照聘僱類型（正職→兼職→合作→工讀→未分類）',
   /const allRows=ET_ORDER\.flatMap\(\(\[k\]\)=>secs\[k\]\|\|\[\]\);/.test(src));
ok('★ 類型改用左邊色條區分，上方給色票說明',
   /const legend=ET_ORDER\.filter\(\(\[k\]\)=>secs\[k\]&&secs\[k\]\.length\)/.test(src)
   && /<b style="--lc:\$\{ET_COLOR\[k\]\|\|'#8a8478'\};">\$\{label\}<i>\$\{secs\[k\]\.length\}<\/i><\/b>/.test(src)
   && /\.st-legend b::before\{content:"";width:10px;height:10px;/.test(src));
ok('　　色條本來就依類型上色（沿用 --pc）', /border-left:4px solid var\(--pc,#8a8478\);/.test(src));

console.log('\n表頭對齊');
ok('★ 最後一欄不再用 max-content（表頭字短、資料列有六顆按鈕，兩個 grid 算出不同軌道）',
   !/grid-template-columns:10px 34px minmax\(150px,1\.3fr\) 66px 66px 56px 62px max-content 30px;/.test(src));
/* 2026-07-31 使用者指示改版：教練課前面加「總堂數」、實領薪資移到工作時數後面、整列分三區
   → 軌道從 12 欄變 13 欄。細節見 stzonetest.js。 */
ok('★ 全部欄位改成固定寬或 fr，兩個 grid 才會算出同一組軌道',
   /grid-template-columns:10px 34px minmax\(130px,240px\) 62px 62px 62px 48px 58px 100px 1fr 92px 78px 372px 30px;/.test(src));
ok('★ 表頭補上資料列的邊框寬度（左 4px 色條＋右 1px），並扣掉自己那 1px 邊框',
   /\.st-lhead\{padding:8px 14px 8px 17px;background:var\(--card2,#F2EEE4\);\s*\n\s*border:1px solid var\(--bd\);border-radius:10px;/.test(src));
/* 2026-07-31 定版：區塊標題那一列移除，分區只靠 .st-zb 兩條線表達 */
ok('★ 表頭欄數與資料列欄數一致（14 欄，含中間那格彈性空白）', (()=>{
   const i=src.indexOf('const stHead=`<div class="st-lhead">');
   const h=src.slice(i, src.indexOf('</div>`;',i));
   return (h.match(/<span/g)||[]).length===14 && !/st-hz/.test(h);
})());
ok('★ 權限開關標題對齊第一顆開關「管理員」（2026-07-30 使用者指示）',
   /\.st-lhead span:nth-child\(13\)\{text-align:left;\}/.test(src)
   && /\.st-l-sw\{justify-self:stretch;\}/.test(src)
   && /\.st-l-sw \.st-sw\{display:flex;flex-wrap:nowrap;gap:4px;width:auto;margin:0;justify-content:flex-start;\}/.test(src));
/* 2026-07-31：姓名欄佔太多版面 → 設上限；再指示姓名區靠左、權限管理區靠右
   → 剩餘寬度改由兩區之間那條 1fr 空白吸收 */
ok('　　姓名欄設上限，剩餘寬度落在兩區中間（左組貼左、右組貼右）',
   /minmax\(130px,240px\)/.test(src) && /100px 1fr 92px 78px 372px 30px;/.test(src)
   && /使用者回報「姓名欄佔太多版面」/.test(src)
   && /空白落在兩區中間/.test(src));
ok('　　「待接受邀請」橫跨的欄位範圍跟著改', /\.st-l-pend\{grid-column:4 \/ 14;justify-self:start;\}/.test(src));
ok('　　待審申請列欄位數不同，另給自己的軌道（不套主表）',
   /\.st-lrow\.st-approw\{grid-template-columns:34px minmax\(160px,1fr\) max-content;\}/.test(src));

console.log('\n中間空白');
ok('★ 姓名欄有上限、不再獨佔剩餘寬度',
   /minmax\(130px,240px\) 62px 62px 62px 48px 58px 100px 1fr 92px 78px 372px/.test(src));
ok('　　原因寫在程式裡', /中間那片大空白則是姓名欄吃掉全部剩餘寬度造成的/.test(src));
ok('　　窄螢幕分兩段收緊（≤1400px、≤1150px），開關字級一起縮',
   /@media\(max-width:1400px\)\{[\s\S]{0,400}\.st-l-sw \.st-swb\{padding:5px 6px;font-size:10px;\}/.test(src)
   && /@media\(max-width:1150px\)\{[\s\S]{0,400}\.st-l-sw \.st-swb\{padding:4px 5px;font-size:9\.5px;gap:4px;\}/.test(src));

console.log('\n新增兩欄');
ok('★ 表頭有「工作規則」與「休假日」（2026-07-31 起歸在權限管理區）',
   /<span class="st-zb">工作規則<\/span><span>休假日<\/span>/.test(src));
ok('★ 工作規則只放值班與代課（打卡／開課已在右邊的權限開關，不重複）',
   /if\(c\.need_duty\) _rules\.push\('<i class="wd">值班<\/i>'\);/.test(src)
   && /if\(c\.can_substitute\) _rules\.push\('<i class="ws">代課<\/i>'\);/.test(src)
   && /打卡／開課已經在右邊的權限開關裡，這裡只放值班與代課，不重複/.test(src));
ok('★ 休假日讀 fixed_off_days，顯示成「週一・週四」',
   /const _offDays=String\(c\.fixed_off_days\|\|''\)\.split\(','\)\.filter\(x=>x!==''\)\s*\n\s*\.map\(d=>WD_FULL\[Number\(d\)\]\)\.filter\(Boolean\);/.test(src)
   && /_offDays\.map\(w=>'週'\+w\)\.join\('・'\)/.test(src));
ok('　　空欄顯示破折號而不是空白（工作規則／休假日／未計薪）',
   (src.match(/<i class="st-l-none">—<\/i>/g)||[]).length===3);
ok('　　沒有跟既有的 _off（停用旗標）撞名', /const _off=c\.status==='inactive';/.test(src)
   && !/const _off=String\(c\.fixed_off_days/.test(src));

console.log('\n當月實領薪資');
ok('★ 實領薪資欄會跟著月份翻頁（2026-07-31 起改排在工作時數後面）',
   /<span>實領薪資\$\{_mTag\}<\/span><span><\/span><span class="st-zb">工作規則<\/span><span>休假日<\/span>/.test(src)
   && /\+ `<span class="st-l-pay">\$\{payCell\}<\/span>`/.test(src));
ok('★ 直接用薪資彙總那支 computeMonthlyPayroll，口徑與月結明細一致（不另算一套）',
   /const _pr=await computeMonthlyPayroll\(_ym\);/.test(src)
   && /if\(id && _stat\[id\]\) _stat\[id\]\.net = r\.countSalary \? \(Number\(r\.sal\.netPay\)\|\|0\) : 0;/.test(src));
ok('★ 只有管理員看得到金額', /const _canPay = !!\(SESSION && SESSION\.role==='admin'\);/.test(src)
   && /const payCell = !_canPay \? '<i class="st-l-none">•••<\/i>'/.test(src));
ok('★ 沒納入計薪（離職／待接受邀請）顯示破折號，不是 \$0',
   /st\.net==null \? '<i class="st-l-none">—<\/i>'/.test(src));
ok('　　算薪資失敗不影響整張表（自己包 try/catch）',
   /\}catch\(e\)\{ console\.error\('員工列表實領薪資失敗:',e\); \}/.test(src));
ok('　　金額四捨五入到整數並加千分位', /\$\{Math\.round\(st\.net\)\.toLocaleString\(\)\}/.test(src));
ok('　　非管理員時完全不去算薪資（連查都不查）', /if\(_canPay\)\{\s*\n\s*try\{\s*\n\s*const _pr=await computeMonthlyPayroll/.test(src));
ok('　　用品牌金標示（金額屬次要提示層級）',
   /\.st-l-pay\{display:flex;align-items:baseline;justify-content:flex-end;gap:1px;\s*\n\s*color:var\(--gold-d,#b48a56\);/.test(src));

console.log('\n標題列底色');
ok('★ 標題列有背景與邊框，跟資料列區隔',
   /background:var\(--card2,#F2EEE4\);\s*\n\s*border:1px solid var\(--bd\);border-radius:10px;margin-bottom:2px;\}/.test(src));

console.log('\n順手修掉的舊 bug');
ok('★ 手機版數字欄名改用明確類別（原本用 nth-of-type，從來沒生效）',
   /\.st-l-n1::before\{content:'教練課';\}/.test(src)
   && !/\.st-l-n:nth-of-type\(1\)::before/.test(src));
ok('　　資料列也帶上對應的類別', /const num=\(v,sub,i,cls\)=>`<span class="st-l-n st-l-n\$\{i\}\$\{cls\?' '\+cls:''\}">/.test(src)
   && /num\(Math\.round\(st\.hours\),'h', 4\)/.test(src));
ok('　　原因寫在程式裡', /nth-of-type 只看元素型別（span）/.test(src));
ok('　　手機版工作規則／休假日／實領薪資各自一行、前面補欄名',
   /\.st-l-tags::before\{content:'工作規則';/.test(src) && /\.st-l-off::before\{content:'休假日';/.test(src)
   && /\.st-l-pay::before\{content:'實領薪資';/.test(src));

console.log('\n統計月份翻頁');
ok('★ 統計月份可翻（列表顯示的是「本月表現」）',
   /function stStepMonth\(n\)\{/.test(src) && /function stSetMonth\(v\)\{/.test(src)
   && /const _ym=stMonthCur\(\);          \/\/ 可翻月/.test(src));
ok('★ 月份列在色票同一行右邊（‹ 月份 ›＋回本月）',
   /body = `<div class="st-legend">\$\{legend\}\$\{stMonthBar\(_ym,_isCurMonth\)\}<\/div>/.test(src)
   && /onclick="stStepMonth\(-1\)"/.test(src) && /onclick="stStepMonth\(1\)"/.test(src));
ok('★ 未來月份沒意義 → 「後一月」在本月時停用、日期選擇器也設 max',
   /aria-label="後一月" \$\{isCur\?'disabled':''\}/.test(src)
   && /max="\$\{ymd\(TODAY\)\.slice\(0,7\)\}"/.test(src));
ok('★ 在本月時顯示「本月」標記，翻走才出現「回本月」按鈕',
   /\$\{isCur\?'<span class="st-mnow">本月<\/span>'/.test(src));
ok('★ 翻到別月時，表頭數字欄名補上月份（免得看成本月）',
   /const _mTag=_isCurMonth\?'':`<em class="st-h-m">\$\{_ym\.slice\(5\)\}月<\/em>`;/.test(src)
   && /<span>教練課\$\{_mTag\}<\/span>/.test(src));
ok('　　回到本月會把狀態清成 null（標示才會顯示「本月」）',
   /_stMonth = \(ym===ymd\(TODAY\)\.slice\(0,7\)\) \? null : ym;/.test(src));
ok('　　工作規則／休假日不是月份資料，不加月份標記',
   /<span>實領薪資\$\{_mTag\}<\/span><span><\/span><span class="st-zb">工作規則<\/span><span>休假日<\/span>/.test(src));

// 實跑月份切換
{
  const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const code=g('function stMonthCur(){','\n')+'\n'+g('function stStepMonth(n){','\n}\n')+'\n'+g('function stSetMonth(v){','\n}\n');
  let nav=0;
  const env={ ymd:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
              TODAY:new Date(2026,6,30), CUR_PAGE:'staff', CUR_GROUP:'g_admin', navTo:()=>{nav++;} };
  const api=new Function(...Object.keys(env),'let _stMonth=null;'+code+
    '\nreturn {step:n=>{stStepMonth(n);return [_stMonth,stMonthCur()];}, set:v=>{stSetMonth(v);return [_stMonth,stMonthCur()];}};')(...Object.values(env));
  const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
  eq('★ 從本月往前一月 → 2026-06', api.step(-1), ['2026-06','2026-06']);
  eq('★ 再往前 → 2026-05', api.step(-1), ['2026-05','2026-05']);
  eq('★ 往後兩次回到本月 → 狀態清成 null', [api.step(1)[1], api.step(1)], ['2026-06',[null,'2026-07']]);
  eq('★ 跨年往前（2026-01 → 2025-12）', (api.set('2026-01'), api.step(-1)), ['2025-12','2025-12']);
  eq('　　跨年往後（2025-12 → 2026-01）', api.step(1), ['2026-01','2026-01']);
  eq('　　直接選本月＝清成 null', api.set('2026-07'), [null,'2026-07']);
  eq('　　清空輸入也回本月', (api.set('2026-03'), api.set('')), [null,'2026-07']);
  ok('　　每次切換都重繪頁面', nav>0);
}

console.log('\n管理員次選單的組別配色');
ok('★ 人事＝品牌金、財務＝品牌紅、環境設定＝品牌綠',
   /\.subnav-item\.sng-hr,  \.subnav-grp\.sng-hr \{--sng:var\(--gold-d,#b48a56\);--sng-bg:#F7EFE0;\}/.test(src)
   && /\.subnav-item\.sng-fin, \.subnav-grp\.sng-fin\{--sng:var\(--danger,#b5372e\);--sng-bg:#FBECEB;\}/.test(src)
   && /\.subnav-item\.sng-env, \.subnav-grp\.sng-env\{--sng:var\(--green,#003D32\); --sng-bg:#ECF1E3;\}/.test(src));
ok('★ 按鈕與組別標籤都吃同一組顏色',
   /const grpCls=\{'人事':'sng-hr','財務':'sng-fin','環境設定':'sng-env'\};/.test(src)
   && /\(grpCls\[s\.grp\]\?' '\+grpCls\[s\.grp\]:''\)/.test(src)
   && /<span class="subnav-grp\$\{grpCls\[s\.grp\]\?' '\+grpCls\[s\.grp\]:''\}">/.test(src));
ok('　　底色只做淡淡一層，選中的那顆才用實色底線＋內框',
   /box-shadow:inset 0 1px 0 var\(--sng\),inset 1px 0 0 var\(--sng\),inset -1px 0 0 var\(--sng\);/.test(src));
ok('　　沒分組的群組（預約／會員／班表）維持原樣，不上色',
   /const cls = 'subnav-item'\+\(on\?' active':''\)\+\(s\.soon\?' soon':''\)\+\(grpCls\[s\.grp\]\?' '\+grpCls\[s\.grp\]:''\);/.test(src));
ok('　　「即將推出」的項目淡化，不會看起來可按',
   /\.subnav-item\.sng-hr\.soon,\.subnav-item\.sng-fin\.soon,\.subnav-item\.sng-env\.soon\{opacity:\.62;\}/.test(src));

// 實跑 renderSubnav：確認每顆按鈕帶到對的顏色類別
{
  const i=src.indexOf('function renderSubnav(gkey, activePage){'); const j=src.indexOf('\n}\n',i)+2;
  const gdef={key:'g_admin',sub:[
    {grp:'人事',label:'員工管理',page:'staff',tab:'list'},
    {grp:'人事',label:'教練統計',soon:true},
    {grp:'財務',label:'財務總覽',page:'finance'},
    {grp:'環境設定',label:'課程方案',page:'settings_ticket'},
  ]};
  const fn=new Function('visibleGroups','CUR_TAB', src.slice(i,j)+'\nreturn renderSubnav;')(()=>[gdef],'list');
  const html=fn('g_admin','staff');
  const cls=[...html.matchAll(/<div class="(subnav-item[^"]*)"/g)].map(m=>m[1]);
  const grp=[...html.matchAll(/<span class="(subnav-grp[^"]*)"/g)].map(m=>m[1]);
  const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
  eq('★ 員工管理（人事・選中）帶金色類別', cls[0], 'subnav-item active sng-hr');
  eq('★ 教練統計（人事・即將推出）也帶金色', cls[1], 'subnav-item soon sng-hr');
  eq('★ 財務總覽帶紅色', cls[2], 'subnav-item sng-fin');
  eq('★ 課程方案帶綠色', cls[3], 'subnav-item sng-env');
  eq('　　三個組別標籤各自帶色', grp, ['subnav-grp sng-hr','subnav-grp sng-fin','subnav-grp sng-env']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
