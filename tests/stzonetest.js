/* 員工列表改版（2026-07-31 使用者指示）

   ① 教練課前面新增一項「總堂數」
   ② 總堂數～工作時數這個範圍的內容放大
   ③ 實領薪資移到工作時數後面
   ④ 整列分三區：左邊姓名、中間員工表現、右邊權限管理 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const head=g('const stHead=`<div class="st-lhead">','</div>`;');

console.log('欄位順序');
{
  const cols=[...head.matchAll(/<span(?:\s[^>]*)?>([^<$]+?)(?:\$\{_mTag\})?<\/span>/g)]
    .map(m=>m[1]).filter(x=>x && !/^\s*$/.test(x));
  eq('★ 姓名 → 總堂數 → 教練課 → 團體課 → 續約 → 工作時數 → 實領薪資 → 休假日 → 權限開關',
     cols, ['姓名','總堂數','教練課','團課堂數','團課人次','體驗','續約','工作時數','實領薪資','休假日','權限開關']);   /* 2026-08-12 工作規則欄移除 */
  /* 比欄位順序要看解析出來的 cols，不能用 head.indexOf —— 2026-08-26 總堂數那格加了
     title（內文提到「教練課」），raw 字串的 indexOf 會被 tooltip 的字咬到。 */
  ok('★ 總堂數排在教練課前面', cols.indexOf('總堂數')>=0 && cols.indexOf('總堂數')<cols.indexOf('教練課'));
  ok('★ 實領薪資排在工作時數後面、休假日前面',
     head.indexOf('工作時數')<head.indexOf('實領薪資') && head.indexOf('實領薪資')<head.indexOf('休假日'));
  ok('　　新欄位一樣會跟著月份翻頁', /<span class="st-zb"[^>]*>總堂數\$\{_mTag\}<\/span>/.test(head));
}

console.log('\n總堂數的定義');
/* 2026-08-26：體驗退出總堂數 → 分子分母改吃 _tDone/_tAll（mine/done 仍供各分欄用） */
ok('★ 算這個月實際帶的、算堂數的課（體驗不進來）',
   /const inTotal=b=>!isTrial\(b\);/.test(src)
   && /const _tAll=mine\.filter\(inTotal\), _tDone=done\.filter\(inTotal\);/.test(src)
   && /_stat\[c\.id\]=\{ all:_tDone\.length, allAll:_tAll\.length,/.test(src));
ok('★ 與「教練課」的差別寫在程式裡（一個是全部、一個是算薪的）',
   /教練課那欄是「算薪的堂數」，\s*\n\s*兩個數字用途不同，所以分開列/.test(src));
ok('★ 排定堂數不同時一樣補小字（92 /97 那種）',
   /num\(st\.all, st\.allAll>st\.all\?`\/\$\{st\.allAll\}`:'', 0, 'st-zb'\)/.test(src));
ok('　　拿不到統計時的預設值也補上 all', /const st=_stat\[c\.id\]\|\|\{all:0,allAll:0,pt:0,ptAll:0,/.test(src));
{
  const i=src.indexOf('      const num=(v,sub,i,cls)=>');
  const num=new Function('return '+src.slice(i,src.indexOf('\n',i)).replace(/^\s*const num=/,'').replace(/;$/,''))();
  ok('★ 0 仍用灰字', /st-l-z/.test(num(0,'',0)));
  ok('★ 帶 cls 時掛到同一個 span 上', /class="st-l-n st-l-n0 st-zb"/.test(num(5,'',0,'st-zb')));
  ok('　　不帶 cls 不會多出空白 class', /class="st-l-n st-l-n1"/.test(num(5,'',1)));
}

console.log('\n三個區域（只用分隔線表達，不放標題列）');
/* 2026-07-31 定版：使用者指示移除「姓名／員工表現／權限管理」那一列標題 */
ok('★ 區塊標題那一列已移除', !/st-hz/.test(src));
ok('★ 表頭回到單列（沒有第二列的 grid-template-rows）',
   /border:1px solid var\(--bd\);border-radius:10px;margin-bottom:2px;\}/.test(src));
ok('★ 分區改由兩條線表達：員工表現從「總堂數」起、權限管理從「休假日」起（2026-08-12 工作規則欄移除）',
   /num\(st\.all, [^)]*, 0, 'st-zb'\)/.test(src)
   && /<span class="st-l-off st-zb">/.test(src)   /* 2026-08-12 工作規則欄移除，分隔線移到休假日格 */
   && /<span class="st-zb"[^>]*>總堂數\$\{_mTag\}<\/span>/.test(src)
   && /<span class="st-zb">休假日<\/span>/.test(src));
ok('★ 休假日歸在權限管理那一側（不在員工表現裡）',
   /<span>實領薪資\$\{_mTag\}<\/span><span><\/span><span class="st-zb">休假日<\/span>/.test(src)
   && /工作規則與休假日屬於權限管理，不是員工表現/.test(src));
/* 2026-07-31 使用者回報「總堂數的數字比較高」：原本 align-self:stretch 讓那一格被拉成整列高、
   內容從頂端排，只有它偏高 → 改用絕對定位的細線，格子不再 stretch */
ok('★ 分隔線改用絕對定位畫，格子不再 stretch（所有格子一致置中）',
   /\.st-zb\{position:relative;padding-left:12px;margin-left:-6px;\}/.test(src)
   && /\.st-zb::before\{content:'';position:absolute;left:0;top:-10px;bottom:-10px;width:1px;background:var\(--bd\);\}/.test(src)
   && !/\.st-zb\{[^}]*align-self:stretch/.test(src));
ok('　　表頭的上下內距不同（8px），線的長度跟著調',
   /\.st-lhead \.st-zb::before\{top:-8px;bottom:-8px;\}/.test(src));
ok('　　窄版（≤900px）換排法，分區線關掉',
   /\.st-zb::before\{display:none;\}/.test(src));
ok('　　工作規則那格套上分隔線後仍垂直置中', /\.st-l-tags\{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-items:center;min-height:26px;\}/.test(src));

console.log('\n放大與基線對齊');
/* 使用者回報「文字高高低低」：那幾格是 grid 項目、垂直置中，字級不同時行框高度就不同，
   置中後基線自然對不齊 → 整排共用同一個字級與行高 */
ok('★ 數字與實領薪資共用同一個字級與行高（20px / 26px）',
   /\.st-l-n,\.st-l-pay\{font-size:20px;line-height:26px;font-weight:800;font-family:var\(--num\),inherit;\}/.test(src));
ok('★ 原因寫在程式裡', /每格的行框高度就不一樣，置中後基線自然對不齊/.test(src));
ok('　　「/排定」小字也跟著調', /\.st-l-n u\{text-decoration:none;font-size:11px;/.test(src));
ok('　　兩段窄螢幕一起縮，且兩者仍同字級',
   /@media\(max-width:1400px\)\{[\s\S]{0,320}\.st-l-n,\.st-l-pay\{font-size:18px;\}/.test(src)
   && /\.st-l-n,\.st-l-pay\{font-size:16px;\}/.test(src));
ok('　　工作規則／休假日也吃同一個行高，整排一條基線',
   /\.st-l-off\{font-size:11\.5px;line-height:26px;/.test(src)
   && /\.st-l-tags\{[^}]*min-height:26px;\}/.test(src));
ok('　　手機版數字也放大', /\.st-l-n\{grid-column:span 1;position:relative;padding-top:12px;font-size:18px;\}/.test(src));

console.log('\n軌道與其他欄位');
/* 2026-08-12 工作規則欄移除 → 15 欄；權限開關改吃剩餘寬度（minmax 1fr） */
ok('★ 15 欄：姓名欄有上限，權限開關吃剩餘寬度',
   /grid-template-columns:10px 34px minmax\(130px,240px\) 62px 62px 62px 62px 56px 48px 58px 100px 24px 78px minmax\(360px,1fr\) 30px;/.test(src)
   && /空白落在兩區中間/.test(src));
ok('★ 三個斷點的軌道欄數一致（15 欄）', (()=>{
   const all=[...src.matchAll(/grid-template-columns:10px (?:34|32|28)px minmax\([^)]*\)([^;]*);/g)];
   return all.length===3 && all.every(m=>m[1].trim().split(/\s+/).length===12);
})());
ok('★ 「待接受邀請」橫跨到權限開關之前', /\.st-l-pend\{grid-column:4 \/ 16;justify-self:start;\}/.test(src));
ok('★ 權限開關欄撐滿自己的格子', /\.st-l-sw\{justify-self:stretch;\}/.test(src)
   && /\.st-l-sw \.st-sw\{display:flex;flex-wrap:nowrap;gap:4px;width:auto;margin:0;justify-content:flex-start;\}/.test(src));
ok('　　手機版補上「總堂數」欄名', /\.st-l-n0::before\{content:'總堂數';\}/.test(src));
ok('　　待審申請列不套主表軌道', /\.st-lrow\.st-approw\{grid-template-columns:34px minmax\(160px,1fr\) max-content;\}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
