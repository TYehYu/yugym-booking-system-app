/* 教練請假的教練課不能被算成教練課（2026-08-24 使用者回報：
   「管理員手機端右上角 KPI 教練課，今天應該是 12，為什麼顯示 14」）

   教練請假會把課別改記成自主訓練（category 換掉、票仍掛著原本的教練課票）。
   bkCC 的「友善」那一條早就有 bkIsSelf(b) 的保護，「教練課」（color='pt'）那一條卻沒有，
   於是請假堂一路回傳 'pt'，被算進當天的教練課堂數。
   當天正好有兩堂這種（劉韻如 19:00、陳力豪 20:00），12 就變成 14。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const i=src.indexOf('function bkCC(b){');
let d=0,k=src.indexOf('{',i);
for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
const bkCC=new Function('window','bkIsSelf', src.slice(i,k+1)+'\nreturn bkCC;')(
  {_ttCache:[
     {id:'tt-pt',color:'pt',name:'教練課'},
     {id:'tt-fr',color:'friendly',name:'友善教練課'},
     {id:'tt-pt2',category_id:'cat_friendly_pt',name:'友善教練課（無 color）'},
   ],_allTkCache:[]},
  b=>b&&b.category==='自主訓練');

console.log('實跑 bkCC');
ok('★ 一般教練課 → pt', bkCC({ticket_type_id:'tt-pt',category:'私人教練'})==='pt');
ok('★★ 教練請假改記成自主訓練（教練課票）→ self，不是 pt',
   bkCC({ticket_type_id:'tt-pt',category:'自主訓練',coach_leave:true})==='self');
ok('★ 友善教練課 → friendly', bkCC({ticket_type_id:'tt-fr',category:'私人教練'})==='friendly');
ok('★ 教練請假（友善票）→ self（這一條本來就對，別改壞）',
   bkCC({ticket_type_id:'tt-fr',category:'自主訓練',coach_leave:true})==='self');
ok('★★ color 沒設、走 category_id 的也一樣（cat_friendly_pt）',
   bkCC({ticket_type_id:'tt-pt2',category:'私人教練'})==='friendly'
   && bkCC({ticket_type_id:'tt-pt2',category:'自主訓練',coach_leave:true})==='self');

console.log('\n口徑一致');
ok('★★ 兩條的差別只在票種是不是友善，與「這堂現在是不是自主訓練」無關',
   /if\(tt\.color==='pt'\) return bkIsSelf\(b\)\?'self':'pt';/.test(src)
   && /if\(tt\.color==='friendly'\) return bkIsSelf\(b\)\?'self':'friendly';/.test(src)
   && /if\(_cid==='cat_friendly_pt'\) return bkIsSelf\(b\)\?'self':'friendly';/.test(src));
ok('　　案例寫在原地', /今天應該是 12，為什麼顯示 14/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
