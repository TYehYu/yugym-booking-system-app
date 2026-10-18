/* 課卡往右撐滿空的欄（2026-10-18 使用者回報：「行事曆上的預約卡片　這一天有好多空白區」）

   原本 assignLanes 把「連鎖重疊」算成一整組，整組共用 total。
   10:00–15:00 只要一路有人接力重疊，中間某個時刻其實只有一張卡，
   它還是只佔 1/3 寬，右邊兩格空著 —— 那就是使用者看到的空白。

   改法：欄位分配不動，每張卡另外算 span（往右數到第一張真的跟我重疊的卡為止）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const F=new Function('timeToMin', grab('assignLanes')+'\nreturn assignLanes;')(
  t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);});
const ev=(id,st,dur)=>({id,start_time:st,duration:dur});
const lay=evs=>{const r=F(evs);const o={};evs.forEach(e=>{const x=r[e.id];
  o[e.id]=[x.idx,x.span,x.total,(x.left==null?x.idx:x.left)];});return o;};
/* 兩張卡在畫面上會不會疊到：時間有重疊、而且橫向區間也有重疊 */
const t2m=t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);};
const collide=(evs)=>{const r=F(evs);const bad=[];
  for(let i=0;i<evs.length;i++)for(let j=i+1;j<evs.length;j++){
    const a=evs[i],b=evs[j];
    const as=t2m(a.start_time),ae=as+(a.duration||60);
    const bs=t2m(b.start_time),be=bs+(b.duration||60);
    if(!(as<be&&ae>bs)) continue;            // 時間沒重疊就不會疊到
    const ra=r[a.id],rb=r[b.id];
    const al=(ra.left==null?ra.idx:ra.left), ar=al+ra.span;
    const bl=(rb.left==null?rb.idx:rb.left), br=bl+rb.span;
    if(al<br-1e-9 && ar>bl+1e-9) bad.push(a.id+'×'+b.id);
  } return bad;};

console.log('① 使用者那一天的情境');
/* 10/19：10:00 起一路接力重疊到 15:00，但 12:00 那個時刻其實只有兩張 */
{
  const r=lay([
    ev('陳蘭馨','10:00',120),   // 10:00–12:00
    ev('蕭育筑','10:00',60),    // 10:00–11:00
    ev('劉宸君','10:20',70),    // 10:20–11:30
    ev('黃怡琳','11:00',60),    // 11:00–12:00
    ev('吳宜玲','11:20',60),    // 11:20–12:20
    ev('鄭阿玲','12:00',60),    // 12:00–13:00  ← 只有它跟吳宜玲重疊 20 分
  ]);
  ok('★★★ 全部還在同一組（total 一致）',
     new Set(Object.values(r).map(x=>x[2])).size===1, r);
  /* 鄭阿玲 12:00–13:00 只跟吳宜玲（12:20 結束）重疊。
     ⚠ 這一條前後改過三次，說明為什麼最後是「撐滿」而不是「1÷同時張數」：
       1018 使用者對 18:00 那兩張的指示是「右邊還有空間可以放大，這兩張就平均這個空間」——
       也就是**用不到的額度要讓給用得到的人**。吳宜玲被前面的尖峰壓在 1 格、
       右邊三格整小時空著，那三格就該給鄭阿玲，不然就是使用者抱怨的「好多空白區」。 */
  ok('★★★ 鄭阿玲撐滿右邊沒人用的空間', Math.abs(r['鄭阿玲'][1]/r['鄭阿玲'][2]-3/4)<0.02,
     {鄭阿玲:r['鄭阿玲']});
  eq('★★★ 這一組也不會互相壓住', collide([
    ev('陳蘭馨','10:00',120), ev('蕭育筑','10:00',60), ev('劉宸君','10:20',70),
    ev('黃怡琳','11:00',60), ev('吳宜玲','11:20',60), ev('鄭阿玲','12:00',60)]), []);
  /* 陳蘭馨 10:00–12:00 整段都跟別人擠著 → 只能 1 格。
     蕭育筑 10:00–11:00 旁邊的兩張都被壓在 1 格，剩下的那格歸它 → 2 格（同上一條的理由）。 */
  ok('★★ 整段都跟人擠著的那張維持 1 格', r['陳蘭馨'][1]===1, r);
}

console.log('\n② 基本行為');
{
  /* 完全不重疊：每一張都獨佔整欄 */
  const r=lay([ev('a','10:00',60), ev('b','11:00',60)]);
  eq('★★★ 不重疊＝各自一組、各自滿版', [r.a,r.b], [[0,1,1,0],[0,1,1,0]]);
}
{
  /* 兩張完全重疊：各半 */
  const r=lay([ev('a','10:00',60), ev('b','10:00',60)]);
  eq('★★★ 兩張同時段＝各半，不會有人撐滿', [r.a,r.b], [[0,1,2,0],[1,1,2,1]]);
}
{
  /* 一張長的把大家串成同一組，但後段只剩兩張 —— 這就是使用者看到的情境。
     ⚠ 前兩版測試都寫錯：隨手挑的時間其實有重疊（或剛好貼著結束＝不重疊被分成兩組）。
       要測「撐開」，得讓那張卡右邊的欄在它那段時間真的沒人。 */
  /* long 被 10:00 的四張壓在 1 格，11:30–12:30 右邊三格都空著 → 整段給 d。
     （1018 使用者：用不到的額度讓給用得到的人） */
  const r=lay([
    ev('long','10:00',240),  // 10:00–14:00 把整段串成一組
    ev('b','10:00',60), ev('c','10:00',60), ev('e','10:00',60),   // 湊成 4 欄
    ev('d','11:30',60),      // 11:30–12:30 只跟 long 重疊
  ]);
  ok('★★★ 五張都在同一組（total=4）',
     [r.long,r.b,r.c,r.e,r.d].every(x=>x[2]===4), r);
  ok('★★★ d 撐滿 long 用不到的三格', Math.abs(r.d[1]/r.d[2]-3/4)<0.02, {d:r.d});
  ok('★★ long 整段最多 4 張同時 → 維持 1/4', Math.abs(r.long[1]/r.long[2]-1/4)<0.02, {long:r.long});
}
{
  /* 貼著結束不算重疊：10:00–11:00 與 11:00–12:00 */
  const r=lay([ev('a','10:00',60), ev('b','11:00',60)]);
  ok('★★★ 一個結束另一個才開始＝不重疊', r.a[2]===1 && r.b[2]===1, r);
}

console.log('\n②b 平分，不要讓最右邊那張獨吞（1018 使用者第二次回報）');
/* 使用者原話：「沒被影響的卡片像是18:00的曾俐萍跟胡瑜文右邊還有空間可以放大，
   這兩張就平均這個空間」。第一版是往右吃到被擋為止 —— 胡瑜文會獨吞，
   曾俐萍被它擋住還是細的。 */
{
  const day=[
    ev('蔡佳音','16:40',70), ev('李淑萍','16:40',70),
    ev('張靜雯','17:00',50), ev('王慧穎','17:00',50), ev('林孟玉','17:00',50),
    ev('4人','17:40',70), ev('曾俐萍','18:00',60), ev('胡瑜文','18:00',60)];
  const r=lay(day);
  ok('★★★ 17:00 那六張擠在一起，每張 1 欄（本來就該這樣）',
     ['蔡佳音','李淑萍','張靜雯','王慧穎','林孟玉'].every(k=>r[k][1]===1), r);
  ok('★★★ 曾俐萍與胡瑜文平分（兩張一樣寬）',
     Math.abs(r['曾俐萍'][1]-r['胡瑜文'][1])<1e-9, {曾:r['曾俐萍'],胡:r['胡瑜文']});
  ok('★★★ 而且真的變寬了（不是各自 1 欄）', r['曾俐萍'][1]>1, {曾:r['曾俐萍']});
  ok('★★★ 兩張接在一起不留縫', Math.abs((r['曾俐萍'][3]+r['曾俐萍'][1])-r['胡瑜文'][3])<1e-9,
     {曾:r['曾俐萍'],胡:r['胡瑜文']});
  eq('★★★ 這一天沒有任何兩張卡會疊到', collide(day), []);
}

console.log('\n②d 使用者指的 14:00–16:30 那一段（1018 第三次回報）');
/* 使用者原話：「陳蘭燕 林德如 吳昆弦 葉政義 因為右邊空間都沒有被其他卡片佔用
   所以要平均放大卡片」。第二版在這裡還是葉政義獨吞 67%（因為林德如與吳昆弦
   在同一欄的不同時段，「互相重疊」條件不成立）—— 那就是方向錯了，
   第三版改成直接用「1 ÷ 自己那段時間的最多同時張數」。 */
{
  const day=[ev('林尚美素','13:55',65),ev('林德如','14:20',65),ev('葉政義','14:55',60),
    ev('陳蘭燕','15:00',60),ev('吳昆弦','15:25',65),ev('蘇月華','16:00',60),
    ev('蔡佳音','16:40',70),ev('李淑萍','16:40',70),
    ev('張靜雯','17:00',50),ev('王慧穎','17:00',50),ev('林孟玉','17:00',50),
    ev('4人','17:40',70),ev('曾俐萍','18:00',60),ev('胡瑜文','18:00',60)];
  const r=lay(day);
  const pct=k=>r[k][1]/r[k][2];
  ['陳蘭燕','林德如','吳昆弦','葉政義','林尚美素','蘇月華'].forEach(k=>
    ok('★★★ '+k+' 拿到 1/3（原本只有 1/6）', Math.abs(pct(k)-1/3)<0.02, {[k]:r[k]}));
  ok('★★★ 沒有人獨吞（那一段六張一樣寬）',
     new Set(['陳蘭燕','林德如','吳昆弦','葉政義','林尚美素','蘇月華'].map(k=>pct(k).toFixed(4))).size===1);
  ['蔡佳音','李淑萍','張靜雯','王慧穎','林孟玉','4人'].forEach(k=>
    ok('★★ '+k+' 維持 1/6（17:00 真的擠了六張）', Math.abs(pct(k)-1/6)<0.02, {[k]:r[k]}));
  eq('★★★ 整天沒有任何兩張會疊到', collide(day), []);
}

console.log('\n②e 整天一起跑（1018 第四次回報：單獨跑會平分，整天跑卻不會）');
/* ⚠ 單獨拿一段來測會過、整天一起跑卻不過 —— 這就是第四次被退回的原因。
   整天是一條連鎖重疊，17:40 的 4人 擺在正中間，就把 18:00 右邊那段切成 3 格和 2 格。
   所以這一條一定要用**完整的一天**，不能只截那幾張出來測。 */
{
  const day=[
    ev('陳蘭馨','10:00',60), ev('蕭育筑','10:00',75), ev('劉宸君','10:20',75),
    ev('陳蘭馨2','11:00',60), ev('黃怡琳','11:00',60), ev('吳宜玲','11:20',60),
    ev('鄭阿玲','12:00',60), ev('李書嫻','12:25',60),
    ev('翁香蘭','13:00',50), ev('楊采妮','13:25',60),
    ev('林尚美素','13:55',65), ev('林德如','14:20',65), ev('葉政義','14:55',60),
    ev('陳蘭燕','15:00',60), ev('吳昆弦','15:25',65), ev('蘇月華','16:00',60),
    ev('蔡佳音','16:40',70), ev('李淑萍','16:40',70),
    ev('張靜雯','17:00',50), ev('王慧穎','17:00',50), ev('林孟玉','17:00',50),
    ev('4人','17:40',70), ev('曾俐萍','18:00',60), ev('胡瑜文','18:00',60)];
  const r=lay(day);
  const pct=k=>r[k][1]/r[k][2];
  ok('★★★ 曾俐萍與胡瑜文一樣寬（整天一起跑也要成立）',
     Math.abs(r['曾俐萍'][1]-r['胡瑜文'][1])<1e-9, {曾:r['曾俐萍'],胡:r['胡瑜文']});
  ok('★★★ 而且兩張都比 1 欄寬', r['曾俐萍'][1]>1 && r['胡瑜文'][1]>1,
     {曾:r['曾俐萍'],胡:r['胡瑜文']});
  ok('★★★ 曾俐萍在胡瑜文左邊（同時開始的卡不可以對調）',
     r['曾俐萍'][3]<r['胡瑜文'][3], {曾:r['曾俐萍'],胡:r['胡瑜文']});
  ok('★★★ 10:00 那三張平均', new Set(['陳蘭馨','蕭育筑','劉宸君'].map(k=>pct(k).toFixed(4))).size===1,
     {陳:r['陳蘭馨'],蕭:r['蕭育筑'],劉:r['劉宸君']});
  ok('★★★ 下午那四張平均（使用者點名的）',
     new Set(['陳蘭燕','林德如','吳昆弦','葉政義'].map(k=>pct(k).toFixed(4))).size===1,
     {燕:r['陳蘭燕'],德:r['林德如'],昆:r['吳昆弦'],政:r['葉政義']});
  ok('★★ 17:00 那六張仍是 1 欄（那個時刻真的滿了）',
     ['張靜雯','王慧穎','林孟玉','蔡佳音','李淑萍','4人'].every(k=>r[k][1]===1), r);
  eq('★★★ 整天沒有任何兩張會疊到', collide(day), []);
}

console.log('\n②c 不可以製造重疊（最重要的一條）');
/* 平分一旦算錯就是卡片互相壓住，比空白難看一百倍。
   拿幾組容易出事的排法掃一遍。 */
{
  const sets=[
    [ev('a','10:00',180), ev('b','10:00',60), ev('c','10:00',60), ev('d','11:30',60)],
    [ev('a','10:00',60), ev('b','10:30',60), ev('c','11:15',60), ev('d','11:20',90)],
    [ev('a','12:00',60), ev('b','11:20',60), ev('c','12:25',60), ev('d','10:00',200)],
    [ev('a','09:00',30), ev('b','09:00',30), ev('c','09:15',90), ev('d','10:00',30), ev('e','10:00',30)],
  ];
  sets.forEach((st,i)=>eq('★★★ 排法 '+(i+1)+' 沒有卡片互相壓住', collide(st), []));
}

console.log('\n③ 只往右長，不往左');
{
  /* b 在第 1 欄，前半段第 0 欄有 a 擋著；b 不可以往左跑 */
  const r=lay([ev('a','10:00',30), ev('b','10:00',90), ev('c','10:00',30)]);
  ok('★★★ 欄位索引不變（左緣對齊不會亂）',
     r.a[0]===0 && r.b[0]===1 && r.c[0]===2, r);
  ok('★★ b 右邊的 c 只佔前 30 分，之後空著 —— 但 b 仍只能算到整段',
     r.b[1]===1, {b:r.b});
}

console.log('\n③b 週／日檢視真正用的是 assignLanesDay（1018 第五次回報的根因）');
/* ⚠⚠ 這一段是整支測試最重要的部分。
   1018 我把撐開的邏輯寫進 assignLanes，測試也全綠，推上線 —— 使用者回報
   「週一還是很多空白」。原因是 renderCalendar 的 useFixedLane 在
   **1／3／5／7 天檢視都是 true**，那些檢視吃的是 assignLanesDay，
   assignLanes 只在其他天數才用得到。測試驗了一支畫面根本沒在呼叫的函式。
   所以這裡同時釘兩件事：① 接線（哪個檢視吃哪一支）② assignLanesDay 的行為。 */
ok('★★★ 1/3/5/7 天檢視都走 assignLanesDay（改另一支不會影響畫面）',
   /const useFixedLane = \(nDays===1 \|\| nDays===7 \|\| nDays===5 \|\| nDays===3\);/.test(src)
   && /const lanes= useFixedLane \? assignLanesDay\(dayEvs\) : assignLanes\(dayEvs\);/.test(src));
ok('★★★ 固定 Lane 的寬度吃 dl.width／dl.left（不是只吃 laneIdx 等分）',
   /const laneWpct = \(dl\.width!=null\) \? dl\.width : 100\/UNIT;/.test(src)
   && /const leftPct  = \(dl\.left !=null\) \? dl\.left  : dl\.laneIdx\*\(100\/UNIT\);/.test(src));
{
  const T=x=>{const[a,b]=String(x).split(':').map(Number);return a*60+(b||0);};
  const dayFn=new Function('timeToMin','CAL_isGroupCat','CAL_overlap',
    grab('assignLanesDay')+'\nreturn assignLanesDay;')(
    T, b=>b.category==='小班肌力', (s,e,s2,e2)=>s<e2&&e>s2);
  const ev2=(id,st,cat)=>({id,start_time:st,duration:60,category:cat||'自主訓練'});
  /* 正式庫 2026-10-19（使用者截圖那一天）的真實時段 */
  const mon=[ev2('09:00','09:00'),
    ev2('a','10:00','私人教練'),ev2('b','10:00'),ev2('c','10:30'),
    ev2('d','11:00'),ev2('e','11:00','私人教練'),ev2('f','11:30'),
    ev2('g','12:00','私人教練'),ev2('h','12:30'),
    ev2('i','13:00','小班肌力'),ev2('j','13:00','私人教練'),ev2('k','13:30'),
    ev2('l','14:00'),ev2('m','14:30'),ev2('n','15:00'),ev2('o','15:00','私人教練'),
    ev2('p','15:30'),ev2('q','16:00','私人教練'),
    ev2('r','16:30','私人教練'),ev2('s','16:30'),
    ev2('t','17:00'),ev2('u','17:00'),ev2('v','17:00'),
    ev2('w','17:45','小班肌力'),ev2('x','18:00'),ev2('y','18:00')];
  const rd=dayFn(mon);
  const W=k=>{const o=rd[k]; return o.width!=null?o.width:100/(o.unit||1);};
  const L=k=>{const o=rd[k]; return o.left!=null?o.left:o.laneIdx*(100/(o.unit||1));};
  /* 改之前整天都是 1/6＝16.7%；10:00–16:00 這一段應該要撐到 1/3。 */
  ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p']
    .forEach(k=>ok('★★★ '+k+' 撐到 1/3（原本 1/6）', Math.abs(W(k)-100/3)<0.5, {k:W(k)}));
  ok('★★ 17:00 那三張維持 1/6（那個時刻真的擠）',
     ['t','u','v'].every(k=>Math.abs(W(k)-100/6)<0.5), ['t','u','v'].map(W));
  ok('★★★ 團課排最左邊（2026-07-23 使用者指示）', L('i')===0 && L('w')===0, [L('i'),L('w')]);
  ok('★★★ 沒有一張比等分還窄（逐步放大保證每張至少 1 格）',
     mon.every(e=>W(e.id) >= 100/(rd[e.id].unit||1) - 0.01));
  let bad=0;
  for(let i=0;i<mon.length;i++) for(let j=i+1;j<mon.length;j++){
    const A=mon[i],B=mon[j];
    const a1=T(A.start_time),b1=a1+60,a2=T(B.start_time),b2=a2+60;
    if(!(a1<b2&&b1>a2)) continue;
    if(L(A.id)<L(B.id)+W(B.id)-1e-6 && L(A.id)+W(A.id)>L(B.id)+1e-6) bad++;
  }
  eq('★★★ 整天沒有任何兩張會疊到', bad, 0);
}

console.log('\n④ 接線');
ok('★★★ 寬度有乘上 span', /const wpct=\(100\/lane\.total\)\*\(lane\.span\|\|1\);/.test(src));
/* ⚠ 寬度算得出來不代表位置排得進去 —— 最後一定要整份驗算，有問題就退回等分。
   卡片互相壓住比留白難看一百倍。 */
ok('★★★ 有「每一種順序都排不下就退回等分」的保險',
   /if\(best\)\{ res\[x\.id\]\.left=best\.posOf\[x\.id\]; res\[x\.id\]\.span=best\.wOf\[x\.id\]; \}/.test(src)
   && /else    \{ res\[x\.id\]\.left=res\[x\.id\]\.idx;    res\[x\.id\]\.span=1; \}/.test(src));
ok('★★★ 採用前會自己掃一遍有沒有重疊', /if\(xl<yr-EPS && xr>yl\+EPS\)\{ ok=false; break; \}/.test(src));
/* ⚠ 一張窄卡卡在正中間，會把後面那段連續空間切成兩半（18:00 那兩張就是這樣
   被分成 3 格和 2 格）。所以要試幾種擺放順序，挑最公平的那一種。 */
ok('★★★ 試過多種擺放順序才挑一個', /\]\.map\(placeBy\)\.filter\(Boolean\)/.test(src)
   && /\.sort\(\(m,n\)=>\(m\.unfair-n\.unfair\)\|\|\(n\.area-m\.area\)\)\[0\]/.test(src));
ok('★★★ 公平度要算「重疊且額度相同」的兩張，不是只算時段完全相同的',
   /if\(!hit\(x,y\) \|\| Math\.abs\(uOf\[x\.id\]-uOf\[y\.id\]\)>EPS\) continue;/.test(src));
/* ⚠ left 不能再用 idx*wpct —— wpct 已經含 span，會把卡片推到右邊去 */
/* ⚠ left 不能用 idx*wpct（wpct 已含 span），也不能只用 idx —— 平分之後
   left 會是小數（例如第 2.5 欄），要吃 res.left。 */
ok('★★★ left 吃 lane.left（平分後會是小數），不是 idx*wpct',
   /left:calc\(\$\{\(lane\.left!=null\?lane\.left:lane\.idx\)\*\(100\/lane\.total\)\}% \+ 3px\)/.test(src)
   && !/left:calc\(\$\{lane\.idx\*wpct\}%/.test(src));
ok('★★ 字級分級也吃 span（撐寬了就不該再縮字）',
   /const cardW = colW \/ lane\.total \* \(lane\.span\|\|1\);/.test(src));
ok('★★ 讀不到 span／left 時有預設值（不會爆）',
   /\{idx:0,total:1,span:1,left:0\}/.test(src) && /\(lane\.span\|\|1\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
