/* 2026-08-02 使用者回報：「薪資單的續約數，點了以後跑到薪資單後面了」

   薪資單是滿版彈窗（.sheet-ov，z-index 9700），從裡面點「續約數」會 showModal
   開出續約名單 —— 但一般彈窗 .modal-bg 的 z-index 只有 300，於是被蓋在薪資單後面：
   畫面看起來像沒反應，其實它開在下面。

   這不是薪資單獨有的問題：任何從 sheet-ov 或側欄選單裡叫出來的彈窗都會這樣。
   彈窗是「打斷你、要你回應」的東西，本來就該在最上層，所以修的是層級本身，
   不是替續約名單單獨加一個 class。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 從 CSS 抓某個選擇器的 z-index（只看第一次宣告） */
const zOf=sel=>{
  const i=src.indexOf(sel+'{');
  if(i<0) return null;
  const m=/z-index:(\d+)/.exec(src.slice(i, i+400));
  return m?Number(m[1]):null;
};

console.log('① 彈窗要在滿版視窗之上');
const zModal=zOf('.modal-bg'), zSheet=zOf('.sheet-ov');
eq('★ 薪資單那類滿版彈窗仍是 9700', zSheet, 9700);
ok('★ 一般彈窗高於它（續約名單才不會開在後面）', zModal>zSheet, {zModal, zSheet});
eq('　　實際值', zModal, 9750);
/* 2026-08-04：行內 mpk 選單退場，改成統一挑選視窗 #mpk-sheet（使用者建議：
   「點選後統一跳出視窗輸入姓名或電話產生下拉選單」）—— 一樣要蓋過所有容器。 */
ok('★ 也高於帳號側欄與快捷選單（那些也會叫出彈窗）',
   zModal>zOf('.tb-acct-menu') && zModal>zOf('.dtl-modal'),
   {acct:zOf('.tb-acct-menu'), dtl:zOf('.dtl-modal')});
ok('★ 統一挑選視窗在最上層（10080 > modal-bg 9750／bk-mem-sheet 9999）', zOf('#mpk-sheet')===10080);

console.log('\n② 但不能反過來蓋住彈窗自己叫出來的東西');
ok('★ 彈窗裡的挑選面板（選會員／快速預約／時段）仍在彈窗之上',
   zOf('#bk-mem-sheet,#qb-sheet,#tl-sheet,#tl-add-sheet')>zModal,
   {picker:zOf('#bk-mem-sheet,#qb-sheet,#tl-sheet,#tl-add-sheet'), zModal});
ok('★ 吐司仍在最上面（彈窗裡按下去的提示要看得到）', zOf('#toast')===null || zOf('#toast')>zModal);
ok('　　行事曆的游標提示不被壓掉', zOf('#cal-cursor-tip')>zModal);

console.log('\n③ 修的是層級本身，不是單獨替續約名單加 class');
ok('★ 續約名單走的仍是共用的 showModal', /function openRenewList\(\)\{[\s\S]{0,400}showModal\(/.test(src));
ok('　　沒有替它加特例樣式', !/renew-list-ov|nl-list-ov/.test(src));
ok('★ 原因寫在 CSS 旁邊', /薪資單的續約數，點了以後跑到薪資單後面了/.test(src)
   && /彈窗永遠該在最上層/.test(src));
ok('　　也寫了為什麼不是更高的數字（免得下次有人隨手改成 99999）',
   /但仍低於彈窗裡自己叫出來的挑選面板/.test(src));

console.log('\n④ 從薪資單點得到的其他入口也一起修好了');
ok('　　薪資單本體就是用 sheet-ov', /ov\.id='salary-sheet-ov'; ov\.className='sheet-ov';/.test(src));
/* 2026-08-30：四張 KPI 卡改由 z() 統一產生（0 的淡化＋寫原因），
   可點的條件從內嵌三元式搬到 z() 的 extra 參數。 */
ok('　　續約數那格可點', /attr:' onclick="openRenewList\(\)" title="點看續約名單"'/.test(src)
   && /z\(renewCount,'續約數',renewCount,/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
