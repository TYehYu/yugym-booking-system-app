/* 場租被歸類成運動按摩（2026-10-08 使用者：「今天這一筆場租　為什麼歸類在運動按摩」）。

   正式庫 ticket_types 的 tt-venue-rental，color 欄位是 'massage'。
   1006 之前場租預約不帶 ticket_type_id，顏色判斷一路落到最後的
   「category==='場租' → self」，看起來沒事；1006 為了讓它比對得到場租票而一律寫上票種
   （見 frconverttest），這個設定就浮出來：卡片標成「運動按摩」，bkCC 連 KPI 也算錯類。

   「場租不佔課程色、一律中性灰」是 0721 就定的規則 —— 規則不該被一個後台欄位推翻，
   所以兩支都把場租擺到「讀 color」之前。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i));};

const EV=g('function evColorClass(b,typeMap,mt){','\nconst CAL_LEGEND');
const CC=g('function bkCC(b){','\n// 依 booking 實際資料回傳課程類型顯示名稱');

console.log('① 場租在「讀票種 color」之前就判掉');
ok('★★★ evColorClass：場租 → ev-self，排在 color 之前',
   /if\(b && b\.category==='場租'\) return 'ev-self';/.test(EV)
   && EV.indexOf("category==='場租'") < EV.indexOf("if(color==='massage')return 'ev-massage';"));
ok('★★★ bkCC：場租 → self，排在 color 之前',
   /if\(b\.category==='場租'\) return 'self';/.test(CC)
   && CC.indexOf("b.category==='場租'") < CC.indexOf("if(tt.color==='massage') return 'massage';"));

console.log('\n② 實跑：tt-venue-rental 的 color 是 massage 也不會被帶走');
const bkCC=new Function(
  "const window=globalThis;"
  +"const bkIsSelf=b=>b&&b.category==='自主訓練';"
  +"const bkIsMassage=b=>b&&b.category==='運動按摩';"
  +"const colorClass=x=>x; const typeOfCat=c=>({'私人教練':'pt','小班肌力':'group','自主訓練':'self_training','體驗':'trial','運動按摩':'massage'})[c]||'pt';"
  +"window._ttCache=[{id:'tt-venue-rental',name:'場地租借',category:'場租',color:'massage'},"
  +"{id:'tt-mrghed5b6ke2',name:'運動按摩',category:'運動按摩',color:'massage'}];"
  +"window._allTkCache=[];"
  +CC+'\nreturn bkCC;')();
ok('★★★ 場租（有帶票種，color=massage）→ self',
   bkCC({category:'場租', ticket_type_id:'tt-venue-rental'})==='self',
   bkCC({category:'場租', ticket_type_id:'tt-venue-rental'}));
ok('★★★ 場租（舊資料沒帶票種）→ self 不變',
   bkCC({category:'場租', ticket_type_id:null})==='self');
/* 真的運動按摩不能被這次改動波及 */
ok('★★★ 真的運動按摩照舊 → massage',
   bkCC({category:'運動按摩', ticket_type_id:'tt-mrghed5b6ke2'})==='massage');

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
