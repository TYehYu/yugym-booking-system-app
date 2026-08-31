/* 未到課的圓形卡用金色（2026-08-31 使用者指示，附截圖）

   「未到課的圓形卡 要用金色」
   截圖：吳美芳 8/31 14:30 友善自主訓練，卡上已標「未到」，
   但圓點畫的是課種色（自主訓練是灰的），看起來跟正常上完一樣。

   語彙（紅>金>綠）：
     紅 = 請假（本堂照扣、另發補課券）／取消未退（政策決定扣課）—— 要留意
     金 = 未到課（人沒來，堂數照扣）—— 知道就好
   ⚠ 兩者都仍然是「已用掉」：格子照佔，票面不會多出一堂。
   ⚠ 與課卡右下角那顆金色「未」章、教練請假未到場的金點是同一個語彙。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 樣式與判準');
{
  ok('★★★ 未到課的實心點是金色',
     /\.mtk-used\.mtk-ns\{background:var\(--gold-d,#b48a56\);color:#fff;\}/.test(src));
  ok('★★★ 紅色優先：請假／取消未退比「人沒出現」重',
     /\.mtk-used\.mtk-ns\.mtk-leave,\.mtk-used\.mtk-ns\.mtk-eaten\{background:var\(--danger,#b5372e\);\}/.test(src));
  ok('★★ 仍然算「已用掉」，格子照佔（註解講明，避免有人以為要空出來）',
     /這一顆仍然是「已用掉」：人沒來但堂數照扣，格子不會空出來/.test(src));
  ok('★★★ 狀態樣式與說明抽成一支，正常與溢位兩條路共用',
     /const _usedCls=b=>\(b&&b\._leave\)\?' mtk-leave':\(\(b&&b\._eaten\)\?' mtk-eaten':\(\(b&&b\.no_show===true\)\?' mtk-ns':''\)\);/.test(src)
     && (src.match(/const lvc=_usedCls\(b\);/g)||[]).length===2
     && (src.match(/\$\{_usedWhy\(b\)\}/g)||[]).length===2);
  ok('★★ 抄兩份的教訓寫在原地（0830 才因為同一種抄寫吃過虧）',
     /0830 才因為同一種抄寫吃過虧，見 bkLeaveRefunded/.test(src));
  ok('★★ 滑鼠提示說得出是未到課',
     /'未到課（人沒來，堂數照扣）'/.test(src));
  ok('★★ 舊的逐行抄寫已經清乾淨',
     !/const lvc=\(b&&b\._leave\)\?' mtk-leave'/.test(src));
}

console.log('\n② 實跑 _usedCls／_usedWhy');
{
  const i=src.indexOf('const _usedCls=b=>');
  const j=src.indexOf(':'+"'已完成'));", i)+"'已完成'));".length+1;
  const api=new Function(src.slice(i,j)+'\nreturn {_usedCls,_usedWhy};')();
  const b=o=>Object.assign({date:'2026-08-31'},o||{});

  eq('★★★ 未到課 → 金點', api._usedCls(b({no_show:true})), ' mtk-ns');
  eq('★★★ 正常上完 → 課種色（不加狀態 class）', api._usedCls(b({})), '');
  eq('★★ 請假 → 紅（優先於未到課）', api._usedCls(b({_leave:1,no_show:true})), ' mtk-leave');
  eq('★★ 取消未退 → 紅（優先於未到課）', api._usedCls(b({_eaten:1,no_show:true})), ' mtk-eaten');
  eq('　 no_show 不是 true 就不算（null／false／字串都不能誤判）',
     [api._usedCls(b({no_show:null})), api._usedCls(b({no_show:false})), api._usedCls(b({no_show:'true'}))],
     ['','','']);
  eq('★★ 說明文字四種各一句',
     [api._usedWhy(b({})), api._usedWhy(b({no_show:true})),
      api._usedWhy(b({_leave:1})), api._usedWhy(b({_eaten:1}))],
     ['已完成','未到課（人沒來，堂數照扣）','請假（本堂照扣，另發補課券）','取消未退（取消時選了扣課不退）']);
  eq('　 沒有預約物件也不能爆掉', [api._usedCls(null), api._usedWhy(null)], ['','已完成']);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
