/* 課表抽屜：置中、會員資料凍結、三大項兩列（2026-09-11 使用者附截圖）
   「視窗置中　視窗上方的會員資料凍結列　硬舉 深蹲 臥推 歷史紀錄放在會員資料跟訓練動作中間
     用兩列表示紀錄　第一列深蹲 第二列3x10x60」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };
const S=fn('renderTrainingLogSheet');

console.log('① 視窗置中');
ok('★★★ 手機直式：左右留邊、上下置中、四角圓',
   /@media \(max-width:600px\),\(max-width:1024px\) and \(orientation:portrait\)\{\s*\n\s*#tl-sheet \.ms-panel\.tls-panel\{left:12px;right:12px;top:50%;bottom:auto;transform:translateY\(-50%\);/.test(src)
   && /border-radius:16px;max-height:calc\(100% - 24px\);padding-top:0;\}/.test(src));
ok('★★ 橫向平板／桌機那條 .ms-panel 置中規則沒動', /\.ms-panel\{left:50%;right:auto;bottom:auto;top:50%;transform:translate\(-50%,-50%\);width:440px;/.test(src));

console.log('\n② 會員資料凍結、三大項在會員資料與訓練動作中間');
{
  const iHead=S.indexOf('<div class="ms-head">'), iOv=S.indexOf('${overview}'), iScroll=S.indexOf('<div class="tl-scroll">'), iToday=S.indexOf('<div class="tlh-label">今日訓練紀錄');   /* 找畫面標籤，不找字（函式開頭的註解也有這四個字） */
  ok('★★★ 順序：會員資料 → 三大項 → 捲動區（今日訓練紀錄在捲動區裡）', iHead>0 && iHead<iOv && iOv<iScroll && iScroll<iToday, {iHead,iOv,iScroll,iToday});
}
ok('★★★ 只有捲動區會捲（吃掉剩下的高度）', /\.tls-panel \.tl-scroll\{flex:1 1 auto;min-height:0;max-height:none;\}/.test(src));

console.log('\n③ 三大項兩列：第一列項目、第二列 組×次×重量');
ok('★★★ 固定三格，順序照 TL_PR_LIFTS（深蹲・硬舉・臥推）',
   /\$\{TL_PR_LIFTS\.map\(k=>`<div class="tlh-prb-c"><div class="tlh-prb-k">\$\{k\}<\/div><div class="tlh-prb-v">\$\{_prVal\(_prOf\[k\]\)\}<\/div><\/div>`\)\.join\(''\)\}/.test(S));
{
  const i=S.indexOf('const _prVal=r=>{'), j=S.indexOf('\n  };', i)+4;
  const body=S.slice(i,j);
  const V=new Function('tlLogNums','wpWeightHtml', body+'\nreturn _prVal;')(
    l=>({reps:l.reps==null?'':l.reps, sets:l.sets==null?'':l.sets, weight:l.weight==null?'':l.weight, unit:l.weight_unit||'kg'}),
    (w,u)=>(w===''||w==null)?'':`${w}${u}`);
  eq('★★★ 第二列是「組×次×重量」：10 次 3 組 60kg → 3×10×60kg', V({best:{reps:10,sets:3,weight:60,weight_unit:'kg'}}), '3×10×60kg');
  eq('★★ 徒手（沒重量）→ 3×10', V({best:{reps:10,sets:3,weight:null}}), '3×10');
  eq('★★ 舊的逐組紀錄沒有組數欄 → 用逐組明細的組數', V({best:{reps:8,sets:null,weight:80,weight_unit:'kg',sets_detail:'[{"reps":8,"weight":80},{"reps":8,"weight":80}]'}}), '2×8×80kg');
  ok('★★ 還沒有紀錄的那一項 → 「—」', /tlh-prb-none">—</.test(V(null)));
}
ok('★★ 整塊點下去＝全部紀錄（原本那顆「全部紀錄 ›」併進來）', /<div class="tlh-prb" onclick="tlOpenPrHistory\(\)" title="全部紀錄">/.test(S));
ok('★ 按下去有回饋', /\.tlh-prb:active \.tlh-prb-c\{background:#e3efe9;\}/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
