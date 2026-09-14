/* 全螢幕預約視窗補上「票種分頁」（2026-09-14）
   這是**缺口不是重構**：這個視窗一直只做了「沒有一般點就自動切友善」，
   所以同時有一般點與友善點的會員在這裡沒辦法選要用哪一種 ——
   只有正在退場的底部面板（msbSetType）有分頁列。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };
const QS=fnBody('memh2SelfSlots');

console.log('① 什麼時候畫這一列');
ok('★★★ 只有「兩種點數都有」才畫（只有一種時不多一個要理解的東西）',
   /const _bothPts=!_rs && \(s\.groups\.self\|\|\[\]\)\.length>0 && \(s\.groups\.friendly\|\|\[\]\)\.length>0;/.test(QS));
ok('★★★ 改期時不畫（票已經定了）', /const _bothPts=!_rs &&/.test(QS));
ok('★★ 插在原時段提示與日期列之間', /\$\{_typeRow\}\s*\n\s*\$\{_dayRow\}/.test(QS));
ok('★★ 缺口的成因寫在原地', /這是缺口不是重構/.test(src) || /這個視窗一直只做了「沒有一般點就自動切友善」/.test(QS));

console.log('\n② 切換之後要重算');
const ST=fnBody('memh2SetType');
ok('★★★ 換票種＝清掉 free 並重開視窗（不是只改 s.type）',
   /s\.type=t; s\.free=null;/.test(ST) && /memh2SelfSlots\(s\.date, window\._mh2SelfUntil\|\|''\);/.test(ST));
ok('★★★ 為什麼要重探寫在原地（時段是依「目前這一種票」算的）',
   /msbProbeFree 是依「目前這一種票」探的（msbPickTicket→msbGroupTks）/.test(src));
ok('★★ 同一個分頁再點一次不做事（免得白重探一輪）', /if\(s\.type===t\) return;/.test(ST));
ok('★★ 效期參數要帶著走（不然換票種後日期列會變回所有票的聯集）',
   /window\._mh2SelfUntil\|\|''/.test(ST));

console.log('\n③ 友善點的限制要講出來');
ok('★★★ 選到友善點時附一行限制（限平日、18:00 前上完）',
   /s\.type==='friendly'\?'<div class="qs-tnote">友善點限平日使用，而且要在 18:00 前上完<\/div>':''/.test(QS));
ok('★★ 與 tkTimeOk 的實際判準一致（週末不可用、18:00 之後才下課不可用）',
   /if\(dow===0\|\|dow===6\) return false;                 \/\/ 週末不可用/.test(src)
   && /timeToMin\(bookTime\)\+\(Number\(dur\)\|\|60\) > TK_TIME_END_MIN/.test(src));

console.log('\n④ 樣式與範圍');
ok('★★ 分頁與日期列同一組語彙（選中＝品牌綠實心）',
   /\.qs-type\.on\{background:var\(--green\);border-color:var\(--green\);color:#fff;\}/.test(src));
ok('★★ 兩格等寬、不折行', /\.qs-types\{display:grid;grid-template-columns:1fr 1fr;/.test(src)
   && /\.qs-type\{[^}]*white-space:nowrap;/.test(src));
ok('★ 舊面板那支 msbSetType 還在（尚未退場，下一輪才刪）', /function msbSetType\(t\)\{/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
