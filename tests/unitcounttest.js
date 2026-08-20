/* 2026-08-21 使用者回報（8/21 19:30 嚴晴）：
   「嚴晴這堂自主應該是兩台跑步機 但簡易課卡標題卡沒有顯示幾台
     點進去看編輯也是掛在一台的位子」

   成因：一堂佔兩台跑步機是兩筆 booking（venue_unit 一筆只存得下一台），
   第二台是 sibling_of 指回主預約的影子預約。行事曆走 mergeSiblingUnits 會把
   台數算好掛在 _units 上，但簡易課卡是 dbGet 單筆撈的，身上沒有那個欄位
   → 標題卡看不出台數、bkOrbitVenue 的台數按鈕也停在「1 台」。

   ⚠ 後者不只是顯示錯：停在 1 台的狀態按「確認」，setSelfVenue 會把同行的
     第 2 台當成要收掉而取消，客人的位子就少一台。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 抽真正的原始碼來跑 */
const grab=n=>{ let i=src.indexOf('function '+n+'('); if(i<0) throw new Error('找不到 '+n);
  if(src.slice(i-6,i)==='async ') i-=6; let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} } };

const BK=[
  {id:'R1', category:'自主訓練', date:'2026-08-21', start_time:'19:30', status:'booked', venue_unit:'treadmill_1', sibling_of:null},
  {id:'S1', category:'自主訓練', date:'2026-08-21', start_time:'19:30', status:'booked', venue_unit:'treadmill_2', sibling_of:'R1'},
  {id:'R2', category:'自主訓練', date:'2026-08-21', start_time:'20:30', status:'booked', venue_unit:'treadmill_1', sibling_of:null},
  /* 跨場地的同行（2026-08-18 蘇美帆案例）：兩台跑步機改一台＋訓練架 → 各自成卡，不併台數 */
  {id:'R3', category:'自主訓練', date:'2026-08-21', start_time:'21:30', status:'booked', venue_unit:'treadmill_1', sibling_of:null},
  {id:'S3', category:'自主訓練', date:'2026-08-21', start_time:'21:30', status:'booked', venue_unit:'multi_1', sibling_of:'R3'},
  {id:'R4', category:'自主訓練', date:'2026-08-21', start_time:'22:30', status:'booked', venue_unit:'treadmill_1', sibling_of:null},
  {id:'S4', category:'自主訓練', date:'2026-08-21', start_time:'22:30', status:'cancelled', venue_unit:'treadmill_2', sibling_of:'R4'}
];
const fn=new Function('dbGetAll', grab('bkUnitCount')+';return bkUnitCount;')(async()=>BK.slice());
const get=id=>BK.find(x=>x.id===id);

console.log('bkUnitCount：實際去數同行的 sibling');
(async()=>{
  eq('★ 嚴晴案例：主預約 → 2 台', await fn(get('R1')), 2);
  eq('★ 從影子那一筆點進來也要算成 2 台（先找 root 再數）', await fn(get('S1')), 2);
  eq('★ 單台就是 1', await fn(get('R2')), 1);
  eq('★ 跨場地的同行不併台數（規則同 mergeSiblingUnits）', await fn(get('R3')), 1);
  eq('★ 同行那台已取消 → 回到 1 台', await fn(get('R4')), 1);
  eq('　　行事曆已經算過（_units）就直接用，不重數', await fn({_units:2, id:'X', venue_unit:'treadmill_1'}), 2);
  eq('　　null 不會爆', await fn(null), 1);
  eq('　　沒有場地 → 1', await fn({id:'Z', venue_unit:null}), 1);

  console.log('\n接回兩個出問題的地方');
  ok('★ 標題卡標出台數（兩台以上才標，一台不囉嗦）',
     /const _units = \(typeof bkUnitCount==='function'\) \? await bkUnitCount\(b\) : 1;/.test(src)
     && /const _unitTxt = _units>1 \? ` ×\$\{_units\}` : '';/.test(src)
     && /const _vTxt = \(_v \? '・'\+_v\+_unitTxt : ''\) \+ _seatTxt;/.test(src));
  ok('★ 場地編輯視窗改用實際台數（原本讀 b._units 永遠是 1）',
     /units:await bkUnitCount\(b\)/.test(src)
     && !/units:Math\.max\(1,Number\(b\._units\)\|\|1\)/.test(src));
  ok('　　「會把第 2 台取消掉」這個後果寫在程式裡',
     /setSelfVenue 會把同行的\s*\n\s*第 2 台當成「要收掉」而取消掉/.test(src));
  ok('　　首頁 hero 不受影響（它的 dayBk 有走 mergeSiblingUnits）',
     /const dayBk=mergeSiblingUnits\(bookings\.filter/.test(src));

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
