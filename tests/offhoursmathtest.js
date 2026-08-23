/* 非營業時間的「邊界實跑」測試（2026-08-23）

   與 offhourstest.js 分工：那一支用正則檢查「程式碼長什麼樣、決定寫在哪裡」，
   這一支把 bizOpenMin／bizCloseMin／bizOffHoursNote／bizOffHoursHardBlock 抽出來**真的執行**，
   驗的是「算出來對不對」——邊界值、分日打烊、爛輸入。

   為什麼要另外一支：0823 這條規則的兩個 bug 都是邊界問題
   （灰格只比開始時間、一週檢視上限寫死 21:00 不分星期），
   正則測試看得到「有沒有寫」，看不到「算得對不對」。

   ⚠ 這裡自備 timeToMin／minToTime／parseYmd／ymd 的最小實作（與 index.html 同語意），
     所以它驗的是那四支「決策函式」的邏輯，不是那些工具函式本身。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('找不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const BH=src.match(/const BUSINESS_HOURS=\{[^}]*\};/)[0];
const G=src.match(/const OFFHOURS_GRACE_MIN=60;/)[0];
const env=`
const TODAY=new Date(2026,7,23);
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parseYmd(s){const m=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(s||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function timeToMin(t){const p=String(t||'').split(':');return (+p[0]||0)*60+(+p[1]||0);}
function minToTime(m){m=Math.round(m);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
let SESSION=null;
${BH}
${G}
${grab('bizCloseMin')}
${grab('bizOpenMin')}
${grab('bizHoursLabel')}
${grab('bizOffHoursNote')}
${grab('bizOffHoursHardBlock')}
module.exports={setS:s=>{SESSION=s},bizOffHoursNote,bizOffHoursHardBlock,bizHoursLabel,bizOpenMin,bizCloseMin};
`;
const M=new module.constructor(); M._compile(env,'oh.js');
const A=M.exports;
let bad=0;
const chk=(name,got,want)=>{const ok=(want==='' ? got==='' : got!==''); 
  console.log((ok?'  ✓ ':'  ✗ ')+name+'  → '+(got||'(放行)')); if(!ok)bad++;};
// 2026-08-24 是週一（平日 09:00-22:00）；08-22 週六 09-21；08-23 週日 09-15
console.log('平日 2026-08-24（09:00–22:00，可排 08:00 起、23:00 前下課）');
chk('21:30 起 60 分 → 22:30 下課：軟提示要有', A.bizOffHoursNote('2026-08-24','21:30',60),'x');
chk('21:30 起 60 分：硬上限要放行', A.bizOffHoursHardBlock('2026-08-24','21:30',60),'');
chk('22:00 起 60 分 → 23:00 下課＝界線上，放行', A.bizOffHoursHardBlock('2026-08-24','22:00',60),'');
chk('22:30 起 60 分 → 23:30 下課，超過 → 要擋', A.bizOffHoursHardBlock('2026-08-24','22:30',60),'x');
chk('08:00 起 60 分＝界線上，放行', A.bizOffHoursHardBlock('2026-08-24','08:00',60),'');
chk('07:30 起 → 早於界線，要擋', A.bizOffHoursHardBlock('2026-08-24','07:30',60),'x');
chk('09:00 起 60 分＝營業內，連軟提示都不要', A.bizOffHoursNote('2026-08-24','09:00',60),'');
chk('21:00 起 60 分 → 22:00 整點下課＝營業內', A.bizOffHoursNote('2026-08-24','21:00',60),'');
chk('22:00 起 120 分 → 00:00 下課，要擋', A.bizOffHoursHardBlock('2026-08-24','22:00',120),'x');
console.log('\n週六 2026-08-22（09:00–21:00，可排 08:00 起、22:00 前下課）');
chk('20:30 起 60 分 → 21:30，軟提示要有', A.bizOffHoursNote('2026-08-22','20:30',60),'x');
chk('20:30 起 60 分：硬上限放行', A.bizOffHoursHardBlock('2026-08-22','20:30',60),'');
chk('21:30 起 60 分 → 22:30，超過 → 要擋', A.bizOffHoursHardBlock('2026-08-22','21:30',60),'x');
console.log('\n週日 2026-08-23（09:00–15:00，可排 08:00 起、16:00 前下課）');
chk('15:30 起 60 分 → 16:30，要擋', A.bizOffHoursHardBlock('2026-08-23','15:30',60),'x');
chk('15:00 起 60 分 → 16:00＝界線上，放行', A.bizOffHoursHardBlock('2026-08-23','15:00',60),'');
chk('14:00 起 60 分＝營業內', A.bizOffHoursNote('2026-08-23','14:00',60),'');
console.log('\n爛輸入不能炸');
[['',60],[null,60],['9:00',60],['21:30',0],['21:30',NaN],['21:30',undefined],['21:30',null]].forEach(([t,d])=>{
  let r1,r2; try{ r1=A.bizOffHoursNote('2026-08-24',t,d); r2=A.bizOffHoursHardBlock('2026-08-24',t,d); }
  catch(e){ console.log('  ✗ 丟例外 time='+JSON.stringify(t)+' dur='+String(d)+' → '+e.message); bad++; return; }
  console.log('  ✓ time='+JSON.stringify(t)+' dur='+String(d)+' → note='+(r1||'(空)')+' ／ hard='+(r2?'擋':'放行'));
});
console.log('\n日期爛掉時（parseYmd 回 null）走 fallback 平日 09–22');
console.log('  label('+JSON.stringify('x')+') = '+A.bizHoursLabel('x'));
console.log('\n'+(bad?('✗ '+bad+' 項不符預期'):'✓ 全部符合預期'));
process.exit(bad?1:0);
