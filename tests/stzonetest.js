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
  const cols=[...head.matchAll(/<span(?: class="st-zb")?>([^<$]+?)(?:\$\{_mTag\})?<\/span>/g)]
    .map(m=>m[1]).filter(x=>x && !/^\s*$/.test(x));
  eq('★ 姓名 → 總堂數 → 教練課 → 團體課 → 續約 → 工作時數 → 實領薪資 → 工作規則 → 休假日 → 權限開關',
     cols, ['姓名','總堂數','教練課','團體課','續約','工作時數','實領薪資','工作規則','休假日','權限開關']);
  ok('★ 總堂數排在教練課前面', head.indexOf('總堂數')<head.indexOf('教練課'));
  ok('★ 實領薪資排在工作時數後面、工作規則前面',
     head.indexOf('工作時數')<head.indexOf('實領薪資') && head.indexOf('實領薪資')<head.indexOf('工作規則'));
  ok('　　新欄位一樣會跟著月份翻頁', /<span class="st-zb">總堂數\$\{_mTag\}<\/span>/.test(head));
}

console.log('\n總堂數的定義');
ok('★ 不分課種，算這個月實際帶的所有課', /_stat\[c\.id\]=\{ all:done\.length, allAll:mine\.length,/.test(src));
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
ok('★ 分區改由兩條線表達：員工表現從「總堂數」起、權限管理從「工作規則」起',
   /num\(st\.all, [^)]*, 0, 'st-zb'\)/.test(src)
   && /<span class="st-l-tags st-zb">/.test(src)
   && /<span class="st-zb">總堂數\$\{_mTag\}<\/span>/.test(src)
   && /<span class="st-zb">工作規則<\/span>/.test(src));
ok('★ 工作規則／休假日歸在權限管理那一側（不在員工表現裡）',
   /<span>實領薪資\$\{_mTag\}<\/span><span class="st-zb">工作規則<\/span><span>休假日<\/span>/.test(src)
   && /工作規則與休假日屬於權限管理，不是員工表現/.test(src));
ok('★ 分隔線畫在該區第一格的左緣，拉滿列高',
   /\.st-zb\{border-left:1px solid var\(--bd\);align-self:stretch;padding-left:12px;margin-left:-6px;\}/.test(src));
ok('　　窄版（≤900px）換排法，分區線關掉',
   /\.st-zb\{border-left:none;padding-left:0;margin-left:0;align-self:center;\}/.test(src));
ok('　　工作規則那格套上分隔線後仍垂直置中', /\.st-l-tags\{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-items:center;\}/.test(src));

console.log('\n放大');
ok('★ 總堂數～工作時數的數字放大到 21px（原 16px）',
   /\.st-l-n\{display:flex;align-items:baseline;justify-content:center;gap:2px;\s*\n\s*font-size:21px;/.test(src));
ok('★ 實領薪資跟著放大（它現在就排在工作時數旁邊）', /\.st-l-pay\{font-size:17px;/.test(src));
ok('　　「/排定」小字也跟著調', /\.st-l-n u\{text-decoration:none;font-size:11px;/.test(src));
ok('　　兩段窄螢幕的字級同步縮',
   /@media\(max-width:1400px\)\{[\s\S]{0,300}\.st-l-n\{font-size:19px;\}[\s\S]{0,120}\.st-l-pay\{font-size:15px;\}/.test(src)
   && /\.st-l-n\{font-size:17px;\}[\s\S]{0,120}\.st-l-pay\{font-size:13\.5px;\}/.test(src));
ok('　　手機版數字也放大', /\.st-l-n\{grid-column:span 1;position:relative;padding-top:12px;font-size:18px;\}/.test(src));

console.log('\n軌道與其他欄位');
ok('★ 13 欄，姓名欄有上限、剩餘寬度給開關欄',
   /grid-template-columns:10px 34px minmax\(130px,240px\) 62px 62px 62px 48px 58px 100px 92px 78px minmax\(372px,1fr\) 30px;/.test(src));
ok('★ 三個斷點的軌道欄數一致（13 欄）', (()=>{
   const all=[...src.matchAll(/grid-template-columns:10px (?:34|32|28)px minmax\([^)]*\)([^;]*);/g)];
   return all.length===3 && all.every(m=>m[1].trim().split(/\s+/).length===10);
})());
ok('★ 「待接受邀請」橫跨到權限開關之前', /\.st-l-pend\{grid-column:4 \/ 13;justify-self:start;\}/.test(src));
ok('★ 權限開關欄撐滿自己的格子', /\.st-l-sw\{justify-self:stretch;\}/.test(src)
   && /\.st-l-sw \.st-sw\{display:flex;flex-wrap:nowrap;gap:4px;width:auto;margin:0;justify-content:flex-start;\}/.test(src));
ok('　　手機版補上「總堂數」欄名', /\.st-l-n0::before\{content:'總堂數';\}/.test(src));
ok('　　待審申請列不套主表軌道', /\.st-lrow\.st-approw\{grid-template-columns:34px minmax\(160px,1fr\) max-content;\}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
