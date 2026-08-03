/* 2026-08-03 使用者指示（8/3 首頁截圖，課卡上還掛著 7 月的禮物）：
   「首頁的課卡禮物隔月要重新統計才對」

   分工：右下角「N 位會員可抽獎」名單維持跨月保留（同日稍早「保持提醒直到來抽」
   的定案不變、lottocarrytest 照跑）；課卡上的禮物改走本月版 lottoMapMonth ——
   8/1 歸零、只畫本月簽到掙到的次數。抽獎登記先抵舊帳（與 lottoPendingFrom 同口徑），
   所以本月已抽數＝總已抽 − 之前月份掙到的。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 以假 lottoMapAll 沙箱實跑（介面同正式版：{earned,used,left,months}） */
const mk=all=>new Function('lottoMapAll','return '+grabFn('lottoMapMonth'))(()=>all);

console.log('① 截圖的情境：7 月掙的禮物，8 月的課卡不該再掛著');
{
  const M=mk({ CH:{earned:2, used:0, left:2, months:[{ym:'2026-07',n:2}]} });   // 陳蘭馨型：7 月 2 次沒抽
  eq('★ 8 月課卡不畫（本月還沒掙到）', M(null,null,'2026-08',null), {});
  const M7=mk({ CH:{earned:2, used:0, left:2, months:[{ym:'2026-07',n:2}]} });
  eq('　　7 月當月看仍畫 2 顆', M7(null,null,'2026-07',null).CH, {earned:2,used:0,left:2,monthly:'2026-07'});
}

console.log('\n② 本月掙到的照畫、抽獎先抵舊帳');
{
  const st={earned:3, used:0, left:3, months:[{ym:'2026-07',n:2},{ym:'2026-08',n:1}]};
  eq('★ 8 月掙到 1 次 → 課卡畫 1 顆未拆', mk({CH:{...st}})(null,null,'2026-08',null).CH,
     {earned:1,used:0,left:1,monthly:'2026-08'});
  eq('★ 8 月抽了 1 次 → 先抵 7 月舊帳，本月那顆仍未拆',
     mk({CH:{...st,used:1,left:2}})(null,null,'2026-08',null).CH,
     {earned:1,used:0,left:1,monthly:'2026-08'});
  eq('★ 抽滿 3 次 → 本月那顆變已拆', mk({CH:{...st,used:3,left:0}})(null,null,'2026-08',null).CH,
     {earned:1,used:1,left:0,monthly:'2026-08'});
  eq('　　抽超過（資料異常）也夾在本月 earned 內', mk({CH:{...st,used:9,left:-6}})(null,null,'2026-08',null).CH,
     {earned:1,used:1,left:0,monthly:'2026-08'});
}

console.log('\n③ 接線與名單不動');
ok('★ 首頁課卡改走本月版', /const _lotMap = \(typeof lottoMapMonth==='function'\) \? lottoMapMonth\(bookings, purchases\|\|\[\], ymd\(TODAY\)\.slice\(0,7\), members\) : \{\};/.test(src));
ok('★ 右下角可抽名單仍走累積版（lottoStats 沒動）',
   /function lottoStats\(bookings,purchases,ym,members\)\{\n\s*const _vip=lottoVipSet\(members\);/.test(src));
ok('★ 本月版的圖示提示講清楚（上月未抽的看名單）',
   /本月可抽 \$\{earned\} 次（已抽 \$\{used\}、待抽 \$\{left\}）　·　上月未抽的看右下角名單/.test(src));
ok('　　為什麼分兩套，寫在程式裡',
   /名單維持跨月保留（同日稍早「保持提醒直到來抽」的定案不變）；\n\s*但課卡上的禮物只畫「本月」/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
