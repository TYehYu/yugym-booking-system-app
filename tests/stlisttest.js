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
ok('★ 全部欄位改成固定寬或 fr，兩個 grid 才會算出同一組軌道',
   /grid-template-columns:10px 34px minmax\(160px,1fr\) 58px 58px 46px 54px 92px 78px minmax\(320px,3fr\) 30px;/.test(src));
ok('★ 表頭補上資料列的邊框寬度（左 4px 色條＋右 1px），不然整排差幾像素',
   /\.st-lhead\{padding:2px 15px 7px 18px;\}/.test(src));
ok('★ 表頭欄數與資料列欄數一致（11 欄）', (()=>{
   const i=src.indexOf('const stHead=`<div class="st-lhead">');
   const h=src.slice(i, src.indexOf('</div>`;',i));
   return (h.match(/<span/g)||[]).length===11;
})());
ok('　　權限開關那欄靠右對齊（資料列也是 justify-self:end）',
   /\.st-lhead span:nth-child\(10\)\{text-align:right;\}/.test(src)
   && /\.st-l-sw\{justify-self:end;\}/.test(src));
ok('　　「待接受邀請」橫跨的欄位範圍跟著改', /\.st-l-pend\{grid-column:4 \/ 11;justify-self:start;\}/.test(src));
ok('　　待審申請列欄位數不同，另給自己的軌道（不套主表）',
   /\.st-lrow\.st-approw\{grid-template-columns:34px minmax\(160px,1fr\) max-content;\}/.test(src));

console.log('\n中間空白');
ok('★ 剩餘寬度大部分給右邊的開關欄（3fr）而不是姓名欄（1fr）',
   /minmax\(160px,1fr\) 58px 58px 46px 54px 92px 78px minmax\(320px,3fr\)/.test(src));
ok('　　原因寫在程式裡', /中間那片大空白則是姓名欄吃掉全部剩餘寬度造成的/.test(src));
ok('　　窄螢幕（≤1300px）另給一組較緊的軌道',
   /@media\(max-width:1300px\)\{\s*\n\s*\.st-lhead,\.st-lrow\{grid-template-columns:10px 32px minmax\(130px,1fr\) 52px 52px 42px 50px 84px 70px minmax\(300px,2fr\) 28px;/.test(src));

console.log('\n新增兩欄');
ok('★ 表頭有「工作規則」與「休假日」',
   /<span>工作規則<\/span><span>休假日<\/span>/.test(src));
ok('★ 工作規則只放值班與代課（打卡／開課已在右邊的權限開關，不重複）',
   /if\(c\.need_duty\) _rules\.push\('<i class="wd">值班<\/i>'\);/.test(src)
   && /if\(c\.can_substitute\) _rules\.push\('<i class="ws">代課<\/i>'\);/.test(src)
   && /打卡／開課已經在右邊的權限開關裡，這裡只放值班與代課，不重複/.test(src));
ok('★ 休假日讀 fixed_off_days，顯示成「週一・週四」',
   /const _offDays=String\(c\.fixed_off_days\|\|''\)\.split\(','\)\.filter\(x=>x!==''\)\s*\n\s*\.map\(d=>WD_FULL\[Number\(d\)\]\)\.filter\(Boolean\);/.test(src)
   && /_offDays\.map\(w=>'週'\+w\)\.join\('・'\)/.test(src));
ok('　　兩欄都空的時候顯示破折號，不是空白',
   (src.match(/<i class="st-l-none">—<\/i>/g)||[]).length===2);
ok('　　沒有跟既有的 _off（停用旗標）撞名', /const _off=c\.status==='inactive';/.test(src)
   && !/const _off=String\(c\.fixed_off_days/.test(src));

console.log('\n順手修掉的舊 bug');
ok('★ 手機版數字欄名改用明確類別（原本用 nth-of-type，從來沒生效）',
   /\.st-l-n1::before\{content:'教練課';\}/.test(src)
   && !/\.st-l-n:nth-of-type\(1\)::before/.test(src));
ok('　　資料列也帶上對應的類別', /const num=\(v,sub,i\)=>`<span class="st-l-n st-l-n\$\{i\}">/.test(src)
   && /num\(Math\.round\(st\.hours\),'h', 4\)/.test(src));
ok('　　原因寫在程式裡', /nth-of-type 只看元素型別（span）/.test(src));
ok('　　手機版工作規則與休假日各自一行、前面補欄名',
   /\.st-l-tags::before\{content:'工作規則';/.test(src) && /\.st-l-off::before\{content:'休假日';/.test(src));

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
   /<span>工作規則<\/span><span>休假日<\/span>/.test(src));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
