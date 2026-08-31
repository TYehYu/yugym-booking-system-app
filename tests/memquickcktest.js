/* 會員手機課卡：時間＋教練靠左、快速簽到鈕靠右、整張再放大一級（2026-08-31 使用者指示）

   「日期時間＋教練靠左　圓形簽到鈕靠右　然後課卡的大小可以比現在大一點
     因為長輩看會有點吃力」
   「所以在課卡新增一個快速簽到鈕」

   原本時間與教練在右欄靠右對齊，眼睛要在卡片兩端來回跑；而且要點開課卡才簽得到，
   長輩多按一步就容易卡住。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 版型');
{
  ok('★★★ 時間與教練同一行、在左欄（.a2-main 裡）',
     /<div class="a2-when"><span class="a2-time">\$\{b\.start_time\}<\/span>/.test(src));
  ok('★★★ 右欄改成快速簽到鈕',
     /<div class="a2-ck">\$\{memh2CkBtn\(b, st, _lk\)\}<\/div>/.test(src));
  ok('★★ 手勢圖示跟著搬到左邊（它講的是「整張卡可以點」，與簽到是兩件事）',
     /<span class="a2-tapic">\$\{MEMH2_TAPIC\}<\/span>/.test(src)
     && /它說的是「整張卡可以點」，右邊那顆是簽到，兩件事/.test(src));
  ok('★★ 整張放大一級（內距／圓角／字級）',
     /\.memh2 \.admh2-card\{padding:17px 12px 17px 19px;border-radius:18px;\}/.test(src)
     && /\.memh2 \.admh2-card \.a2-l2\{font-size:21px;\}/.test(src)
     && /\.memh2 \.admh2-card \.a2-when \.a2-time\{font-size:19px;flex:none;\}/.test(src));
  ok('★★★ 放大只掛在 .memh2 —— 管理員／教練手機首頁共用 .admh2-card，不能被改到',
     /\.admh2-card\{position:relative;overflow:hidden;background:#fff;border-radius:14px;\s*\n\s*padding:10px 9px 10px 13px;/.test(src));
  ok('★★ 教練名太長由時間列夾（不是自己吃固定封頂 —— 它已經不是 grid item 了）',
     /\.memh2 \.admh2-card \.a2-when \.a2-coach\{min-width:0;overflow:hidden;text-overflow:ellipsis;\}/.test(src));
}

console.log('\n② 簽到鈕的狀態');
{
  ok('★★★ 與點開後那顆圓鈕同一套判斷（不另寫一份）',
     /狀態與點開後那顆圓鈕（見 ckBtn）同一套判斷，不另寫一份/.test(src));
  ok('★★★ 點下去要 stopPropagation（整張卡是「點開課卡」，不能兩件事一起發生）',
     /onclick="event\.stopPropagation\(\);\$\{_fn\}"/.test(src));
  ok('★★ 團課走 memGrpCheckin、單人課走 memCheckin',
     /const _fn=st\.isGrp\?`memGrpCheckin\('\$\{b\.id\}'\)`:`memCheckin\('\$\{b\.id\}'\)`;/.test(src));
  ok('★★ 還沒到時間＝淡化並寫原因，不是藏起來（0823 定案）',
     /a2-ckbtn-off" title="開課前 30 分鐘才開放簽到"/.test(src)
     && /\.memh2 \.admh2-card \.a2-ckbtn-off\{background:var\(--card2\);/.test(src));
  ok('★★★ 未來的日子不畫（每張卡掛一顆按不動的圓鈕是噪音）',
     /if\(String\(b\.date\|\|''\)!==ymd\(TODAY\)\) return '';/.test(src)
     && /未來的課擺一顆灰圓鈕，每張卡都掛一個按不動的東西，/.test(src));

  /* 實跑判斷 */
  const i=src.indexOf('function memh2CkBtn(b, st, locked){');
  const j=src.indexOf('function memh2Acts(b, st){');
  const api=new Function('ymd','TODAY','memh2CkState',
    src.slice(i,j)+'\nreturn memh2CkBtn;')(d=>'2026-08-31', null, b=>b._st);
  const kind=h=>!h?'不畫':(/a2-ckbtn-off/.test(h)?'淡化未開放':'可簽到');
  const B=(o,st)=>Object.assign({id:'B1',date:'2026-08-31',no_show:null,_st:Object.assign({done:false,open:false,ended:false,isGrp:false},st||{})},o||{});

  eq('★★★ 今天、開課前 30 分內、還沒簽 → 可簽到', kind(api(B({},{open:true}),null,false)), '可簽到');
  eq('★★★ 今天但還沒到時間 → 淡化寫原因', kind(api(B(),null,false)), '淡化未開放');
  eq('★★★ 明天的課 → 不畫', kind(api(B({date:'2026-09-01'}),null,false)), '不畫');
  eq('★★★ 已經簽到 → 不畫（左邊那顆出席章就是結論）', kind(api(B({},{done:true}),null,false)), '不畫');
  eq('★★★ 標了未到課 → 不畫', kind(api(B({no_show:true}),null,false)), '不畫');
  eq('★★★ 待付款（待簽約／分期保留）→ 不畫', kind(api(B({},{open:true}),null,true)), '不畫');
  eq('★★ 今天但課已經上完 → 不畫（不是「還沒開放」）', kind(api(B({},{ended:true}),null,false)), '不畫');
  eq('　 沒有預約物件也不能爆掉', kind(api(null,null,false)), '不畫');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
