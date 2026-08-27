/* 教練值班時段：固定格位矩陣（2026-08-27 使用者指示，附參考圖）

   核心情境（使用者原話）：「櫃檯知道會員想約某一天＋某個時段後，
   可以一眼判斷有哪些教練可以上課」。
   最重要的改動：「每位教練的位置必須永久固定」——
   RANDY 是第 1 位，沒值班時第一格仍然保留、只顯示淡灰色空位，
   不可以讓後面的人往前補位。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 顯示順序：duty_order 小的在前，沒排過的排最後');
{
  const fn=new Function('coachDisp', grabFn('dwOrder')+'\nreturn dwOrder;')(c=>c.nm);
  const L=[{id:'e',nm:'ERIC',duty_order:11},{id:'r',nm:'RANDY',duty_order:1},
           {id:'z',nm:'ZOE',duty_order:5},{id:'x',nm:'新人乙'},{id:'w',nm:'新人甲'}];
  eq('★★ 有 duty_order 的照它排', fn(L).slice(0,3).map(c=>c.nm), ['RANDY','ZOE','ERIC']);
  eq('★★ 沒有 duty_order 的排在後面，彼此再依名字',
     fn(L).slice(3).map(c=>c.nm), ['新人乙','新人甲'].sort((a,b)=>a.localeCompare(b)));
  eq('　 不會改動原陣列（slice 過）', L[0].nm, 'ERIC');
}

console.log('\n② 固定格位：沒值班要留同高的空位，後面的人不准往前補');
{
  const seg=src.slice(src.indexOf('  const cell=(wd,seg)=>{'), src.indexOf('  const header=`<div class="dw-h dw-h-c">'));
  const D={fixed:['R','S','B','M','Z'], canEdit:false,
    cMap:{R:'RANDY',S:'SANDY',B:'BARRY',M:'MANGO',Z:'ZOE',A:'ANN'},
    byKey:{'1|am':{ids:['B','Z']}, '2|am':{ids:['R','S','B','M','Z']}, '3|am':{ids:[]},
           '4|am':{ids:['S','A']}}};
  const cell=new Function('D','coachTagColor','chip','todayWd', seg+'\nreturn cell;')(
    D, ()=>({fg:'#123',bg:'#eee'}),
    (id)=>`<span class="dw-slot dw-on">${D.cMap[id]}</span>`, 9);
  const slotsOf=h=>[...h.matchAll(/<span class="dw-slot ([a-z-]+)"[^>]*>([^<]*)<\/span>/g)].map(m=>[m[1],m[2]]);

  eq('★★ 只有 BARRY 與 ZOE 值班 → 五個位置都在，RANDY/SANDY/MANGO 是空位',
     slotsOf(cell(1,'am')),
     [['dw-empty','—'],['dw-empty','—'],['dw-on','BARRY'],['dw-empty','—'],['dw-on','ZOE']]);
  eq('★★ BARRY 永遠在第 3 位 —— 沒有往前補位',
     slotsOf(cell(1,'am'))[2][1], 'BARRY');
  eq('★ 全員都在 → 五個都是標籤，順序不變',
     slotsOf(cell(2,'am')).map(x=>x[1]), ['RANDY','SANDY','BARRY','MANGO','ZOE']);
  eq('★ 完全沒排班 → 仍然畫五個空位（格子高度不會塌）',
     slotsOf(cell(3,'am')).map(x=>x[0]), ['dw-empty','dw-empty','dw-empty','dw-empty','dw-empty']);
  eq('★★ 不在矩陣裡但有排班的人接在固定格位後面（資料不能消失）',
     slotsOf(cell(4,'am')).map(x=>x[1]), ['—','SANDY','—','—','—','ANN']);
  ok('★★ 「空位一定要畫、而且同高」的理由寫在原地',
     /空位一定要畫，而且高度與有值班的一模一樣，否則下一位就往上補/.test(src)
     && /「第 N 列永遠是同一個人」這件事就破了（這正是這次要解決的問題）/.test(src));
}

console.log('\n③ 空位與標籤同高（不是只有邏輯上同高）');
ok('★★ .dw-slot 統一 27px，空位只差在底色與邊框',
   /\.dw-slot\{height:27px;/.test(src)
   && /\.dw-slot\.dw-empty\{background:#F5F3EE;color:#C9C3B8;justify-content:center;font-weight:500;\s*\n\s*border-left:3px solid transparent;\}/.test(src));
ok('★ 有值班的左側 3px 識別色條、圓角 4px、名字 13.5px semibold',
   /\.dw-slot\.dw-on\{border-left:3px solid var\(--sc,var\(--bd\)\);/.test(src)
   && /border-radius:4px;padding:0 9px;\s*\n\s*font-size:13\.5px;font-weight:600;/.test(src));
ok('★ 格子上下 padding 10px、slot 間距 3px、星期表頭 52px',
   /\.dw-cell\{display:flex;flex-direction:column;gap:3px;padding:10px 8px;/.test(src)
   && /\.dw-h\{min-height:52px;/.test(src));

console.log('\n④ 左欄：時段名＋時間區間＋人數區間');
{
  ok('★★ 三個時段的時間區間寫死成一份 DW_SEGS（畫面與說明不會各寫一套）',
     /const DW_SEGS=\[\['am','早班','09:00 – 12:00'\],\['pm','午班','12:00 – 18:00'\],\['eve','晚班','18:00 – 22:00'\]\];/.test(src));
  const seg=src.slice(src.indexOf('  const rows=DW_SEGS.map'), src.indexOf('  host.innerHTML=`${header}${rows}`;'));
  const mk=(byKey)=>new Function('DW_SEGS','WDS','D','cell', seg+'\nreturn rows;')(
    [['am','早班','09:00 – 12:00']], [[1],[2],[3],[4],[5],[6],[7]], {byKey}, ()=>'');
  ok('★★ 有多有少 → 顯示區間（2–5 位）',
     /2–5 位/.test(mk({'1|am':{ids:[1,2]},'2|am':{ids:[1,2,3,4,5]},'3|am':{ids:[1,2,3]},
       '4|am':{ids:[1,2,3]},'5|am':{ids:[1,2,3]},'6|am':{ids:[1,2,3]},'7|am':{ids:[1,2,3]}})));
  ok('★ 每天一樣多 → 只顯示一個數字', /3 位/.test(mk({'1|am':{ids:[1,2,3]},'2|am':{ids:[1,2,3]},
       '3|am':{ids:[1,2,3]},'4|am':{ids:[1,2,3]},'5|am':{ids:[1,2,3]},'6|am':{ids:[1,2,3]},'7|am':{ids:[1,2,3]}})));
  ok('★★ 整週都沒排 → 寫「尚未排班」，不要印「0–0 位」', /尚未排班/.test(mk({})));
}

console.log('\n⑤ 上方教練列＝同一個順序、同時是圖例與拖曳來源');
{
  ok('★★ 用同一份 list（已經 dwOrder 過），不是另外排一次',
     /const list=dwOrder\(coaches\.filter\(/.test(src)
     && /\$\{list\.map\(c=>\{const cl=coachTagColor\(c\.id\); const inm=c\.duty_matrix!==false;/.test(src));
  ok('★★ 不佔格位的淡化並寫出原因（滑過去看得到）',
     /class="dw-chip dw-chip-c\$\{inm\?'':' dw-off'\}"/.test(src)
     && /title="不佔固定格位（仍可排班，排在格位後面）"/.test(src)
     && /\.dw-chip-c\.dw-off\{opacity:\.42;\}/.test(src));
  ok('★ 右上有「管理教練順序」（只有可編輯的人看得到）',
     /<button class="btn btn-ghost btn-sm dw-ordbtn" onclick="dwOrderOpen\(\)">⚙ 管理教練順序<\/button>/.test(src));
  ok('★ 拖曳來源照舊（dwDragStart）', /ondragstart="dwDragStart\(event,'\$\{c\.id\}',0,''\)"/.test(src));
}

console.log('\n⑥ 管理教練順序：存在 employees，不是另開一份設定');
{
  ok('★★ 存 duty_order 與 duty_matrix（兩邊不會不同步）',
     /c\.duty_order=i\+1; c\.duty_matrix=!!L\[i\]\.inm;/.test(src)
     && /await dbPut\('coaches',c\);/.test(src));
  ok('★★ 「這位教練排第幾」是這位教練的屬性 —— 理由寫在原地',
     /順序與「要不要佔格位」存在 employees\.duty_order \/ duty_matrix/.test(src)
     && /「這位教練排第幾」本來就是這位教練的屬性/.test(src));
  ok('★ 上下移動 ＋ 佔不佔格位的勾選',
     /function dwOrdMove\(i,d\)\{/.test(src) && /function dwOrdToggle\(i,v\)\{/.test(src));
  ok('★ 存檔走 onceAct（連點兩下不會寫兩輪）', /async function dwOrdSave\(\)\{ return onceAct\('dwordsave', _dwOrdSave\); \}/.test(src));
  ok('　 只有管理員／店長能開', /if\(!D\.canEdit\)\{ showToast\('僅管理員／店長可調整'\); return; \}/.test(src));
}

console.log('\n⑦ 排班資料與既有操作一行都沒動');
{
  const keep=[['duty_slots 讀取', /dbGetAll\('duty_slots'\)/],
              ['weekday\\|segment 當鍵', /byKey\[s\.weekday\+'\|'\+s\.segment\]/],
              ['拖進格子', /ondrop="dwDrop\(event,\$\{wd\},'\$\{seg\}'\)"/],
              ['點格勾選', /onclick="dwEditCell\(\$\{wd\},'\$\{seg\}'\)"/],
              ['拖出移除', /function dwDragEnd\(/],
              ['編輯權＝管理員或店長', /const canEdit = SESSION\.role==='admin'\|\|!!SESSION\.is_manager;/]];
  eq('★★ 六項全在', keep.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★★ 「排班資料一行都沒動」寫在原地',
     /排班資料一行都沒動：仍是 duty_slots 的 weekday\|segment → coach_ids，\s*\n\s*拖曳、點格勾選、儲存全部走原本那幾支/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
