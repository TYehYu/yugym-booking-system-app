/* 團課「一個名額一列」（2026-07-30 使用者指示：黃姸元 7/31 11:00 約兩個名額）
   原本 member_ids 重複同一個 id 時，名單合併成一列標「N 個名額」——
   簽到／請假／取消都只有一個開關，兩個名額沒辦法分開處理。
   改成出席狀態掛「名額鍵」：第 1 個名額用純 member id（向下相容），第 2 個以後 id#2、id#3。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const g=(a,b)=>{const i=src.indexOf(a); return src.slice(i,src.indexOf(b,i)+b.length);};
const code=g('function seatKeys(b){','\n}\n')+'\n'+g('function seatMid(key){','\n')+'\n'
  +g('function seatKeysDisplay(b){','\n}\n')+'\n'
  +g('function seatNo(key){','\n')+'\n'+g('function seatAnyState(b,mid,state){','\n}\n')+'\n'
  +g('function seatReindexAfterRemove(b, idx){','\n}\n')+'\n'+g('function attObj(b){','\n}\n')+'\n'
  +g('function mids(b){','\n}\n');
const api=new Function(code+'\nreturn {seatKeys,seatMid,seatNo,seatAnyState,seatReindexAfterRemove,seatKeysDisplay};')();
const B=(ids,att)=>({member_ids:ids,attendance:att||{}});

console.log('名額鍵');
eq('★ 一人一個名額 → 就是純 member id（舊資料完全不用搬）',
   api.seatKeys(B(['A','B'])), ['A','B']);
eq('★ 同一人兩個名額 → 第 1 個純 id、第 2 個 id#2',
   api.seatKeys(B(['A','A','B'])), ['A','A#2','B']);
eq('　　三個名額 → A / A#2 / A#3', api.seatKeys(B(['A','A','A'])), ['A','A#2','A#3']);
eq('　　不連續出現也照出現順序編號', api.seatKeys(B(['A','B','A'])), ['A','B','A#2']);
eq('　　空名單 → 空陣列', api.seatKeys(B([])), []);
eq('　　member_ids 是 JSON 字串也能解（資料庫回傳相容）',
   api.seatKeys({member_ids:'["A","A"]'}), ['A','A#2']);
eq('★ 名額鍵反解回 member id', [api.seatMid('A'),api.seatMid('A#2'),api.seatMid('MEM-F29#3')], ['A','A','MEM-F29']);
eq('★ 名額序號', [api.seatNo('A'),api.seatNo('A#2'),api.seatNo('A#3')], [1,2,3]);
ok('　　壞掉的鍵不會爆（#後面不是數字 → 當第 1 個）', api.seatNo('A#x')===1);

console.log('\n兩個名額各自獨立');
{
  const b=B(['A','A','B'],{'A':'checked_in','A#2':'booked','B':'booked'});
  eq('★ 第 1 個名額已簽到、第 2 個還沒 → 兩列狀態不同',
     api.seatKeys(b).map(k=>b.attendance[k]), ['checked_in','booked','booked']);
  ok('★ 只有一個名額簽到，整堂仍算「有人簽到」',
     Object.values(b.attendance).some(s=>s==='checked_in'));
  ok('　　seatAnyState：A 有名額已簽到', api.seatAnyState(b,'A','checked_in')===true);
  ok('　　seatAnyState：B 沒有名額已簽到', api.seatAnyState(b,'B','checked_in')===false);
  const b2=B(['A','A'],{'A':'booked','A#2':'leave'});
  ok('　　同一人可以一個名額請假、另一個照上', api.seatAnyState(b2,'A','leave')===true
     && api.seatAnyState(b2,'A','checked_in')===false);
}

console.log('\n取消其中一個名額後重新編號');
{
  const b=B(['A','A','A','B'],{'A':'checked_in','A#2':'leave','A#3':'booked','B':'booked'});
  const att=api.seatReindexAfterRemove(b,1);   // 取消第 2 個名額
  const ids=b.member_ids.slice(); ids.splice(1,1);
  const after={member_ids:ids,attendance:att};
  eq('★ 移除中間那個名額後，鍵重新收斂成 A / A#2（不會留下沒有 A#2 的 A#3）',
     api.seatKeys(after), ['A','A#2','B']);
  eq('★ 剩下兩個名額的狀態順序保持不變（原第1、第3）',
     api.seatKeys(after).map(k=>att[k]), ['checked_in','booked','booked']);
  ok('　　不再有殘留的 A#3 鍵', att['A#3']===undefined);
  const c=B(['A','A'],{'A':'checked_in','A#2':'booked'});
  const cAtt=api.seatReindexAfterRemove(c,0);
  const cIds=c.member_ids.slice(); cIds.splice(0,1);
  eq('　　移除第 1 個名額 → 剩下的接手成純 id，狀態跟著搬',
     [api.seatKeys({member_ids:cIds,attendance:cAtt}), cAtt['A']], [['A'],'booked']);
  const d=B(['A','B'],{'A':'checked_in','B':'booked'});
  const dAtt=api.seatReindexAfterRemove(d,0);
  ok('　　只有一個名額時直接清掉自己的狀態，不動別人', dAtt['A']===undefined && dAtt['B']==='booked');
}

console.log('\n接線');
ok('★ 名單改成逐名額一列', /const rows = _seatKeys\.length \? _seatKeys\.map\(sk=>\{/.test(src)
   && /const _seatKeys=seatKeysDisplay\(b\);/.test(src));
ok('★ 每列的簽到／請假／取消都帶名額鍵',
   /toggleGroupAttend\('\$\{b\.id\}','\$\{sk\}'\)/.test(src)
   && /groupToggleLeave\('\$\{b\.id\}','\$\{sk\}'\)/.test(src)
   && /groupCancelSeat\('\$\{b\.id\}','\$\{sk\}'\)/.test(src));
ok('★ 多名額每列標「第 N 個名額」', /第 \$\{seatNo\(sk\)\} 個名額/.test(src));
/* 2026-07-31 使用者指示改為：兩個名額都要顯示圓形卡 */
ok('★ 每個名額都畫自己的圓形卡（不再只畫第一列）', /const st = _gTk\[mid\];/.test(src)
   && !/seatNo\(sk\)===1 \? _gTk/.test(src));
ok('★ 課卡快捷簽到面板也逐名額（原本合併標 ×N）',
   /rows = seatKeysDisplay\(b\)\.map\(sk=>\{/.test(src) && !/name:nameOf\(mid\)\+\(_rc\[mid\]>1\?`（×\$\{_rc\[mid\]\}）`:''\)/.test(src));
ok('★ 請假／取消收名額鍵，補課券與退票仍認會員本人',
   /async function groupToggleLeave\(bid,seatKey\)\{/.test(src)
   && /const sk=String\(seatKey\), mid=seatMid\(sk\);/.test(src)
   && /async function groupCancelSeat\(bid,seatKey\)\{/.test(src)
   && /async function doGroupCancelSeat\(bid,seatKey\)\{/.test(src));
ok('　　取消前先重編剩餘名額，不留孤兒鍵',
   /const att=seatReindexAfterRemove\(b, i\);/.test(src));
ok('　　傳純 member id 的舊呼叫仍可用（＝第 1 個名額）',
   /傳純 member id 進來也照舊能用（＝第 1 個名額）/.test(src));
// 2026-07-30 二修：圓點改與會員票券頁共用 allocBookingsToTickets，_hist 那套推算退場
ok('★ 圓點的「已上」仍逐名額判定（名額鍵）',
   /const _doneFor=x=>\{/.test(src)
   && /const st=at\[seen\[v\]>1\?v\+'#'\+seen\[v\]:v\];/.test(src));
ok('★ 同一人在某堂佔多個名額 → 那一堂畫多顆圓點',
   /bks=bks\.reduce\(\(arr,x\)=>\{ const n=mids\(x\)\.filter\(v=>v===mid\)\.length\|\|1;/.test(src));
/* 2026-07-31：算式抽成共用的 grpTicketAlloc，名額鍵在那裡組（見 grpalloctest.js） */
ok('★ 票券剩餘推算（grpTicketAlloc）也逐名額',
   /mine\.push\(seen\[id\]>1\?id\+'#'\+seen\[id\]:id\);/.test(src)
   && /if\(at\[k\]==='checked_in'\) return;/.test(src));
ok('　　整堂「有人簽到」的判斷不受影響（仍看 Object.values）',
   /const anyIn=Object\.values\(att\)\.some\(s=>s==='checked_in'\);/.test(src));
ok('★ 存名單時清掉沒有對應名額的孤兒出席鍵',
   /const _att=attObj\(b\), _live=new Set\(seatKeys\(b\)\);\s*\n\s*Object\.keys\(_att\)\.forEach\(k=>\{ if\(!_live\.has\(k\)\) delete _att\[k\]; \}\);/.test(src));
ok('　　孤兒鍵的危害寫在程式裡（會讓「整堂有沒有人簽到」失準）',
   /孤兒鍵會讓判斷失準/.test(src));
ok('　　原因寫在程式裡', /兩個名額不能分開處理/.test(src));

// 實跑：存名單後的孤兒清理
{
  const prune=(b)=>{ const att=api.seatKeys(b).reduce((o,k)=>(o[k]=1,o),{});
    Object.keys(b.attendance).forEach(k=>{ if(!att[k]) delete b.attendance[k]; }); return b.attendance; };
  eq('★ 移出名單的人狀態不留下', prune(B(['A'],{A:'booked',Z:'booked'})), {A:'booked'});
  eq('　　名額從 2 減到 1 → 第 2 個名額的狀態清掉',
     prune(B(['A'],{A:'checked_in','A#2':'booked'})), {A:'checked_in'});
  eq('　　名額還在的狀態一律保留', prune(B(['A','A','B'],{A:'checked_in','A#2':'leave',B:'booked'})),
     {A:'checked_in','A#2':'leave',B:'booked'});
}

console.log('\n同一個人的名額排在一起（2026-07-30 使用者指示）');
eq('★ A、B、A → 顯示順序變成 A、A#2、B（同一人連在一起）',
   api.seatKeysDisplay(B(['A','B','A'])), ['A','A#2','B']);
eq('★ 原本的 seatKeys 不動（它要跟 member_ids 同索引）',
   api.seatKeys(B(['A','B','A'])), ['A','B','A#2']);
eq('　　同一人內維持第 1、第 2 個名額的順序',
   api.seatKeysDisplay(B(['A','B','A','B','A'])), ['A','A#2','A#3','B','B#2']);
eq('　　依「第一次出現的位置」決定人的先後（B 先報名就排前面）',
   api.seatKeysDisplay(B(['B','A','B'])), ['B','B#2','A']);
eq('　　本來就連在一起的不會被打亂', api.seatKeysDisplay(B(['A','A','B'])), ['A','A#2','B']);
eq('　　每人各一個名額 → 順序完全不變', api.seatKeysDisplay(B(['A','B','C'])), ['A','B','C']);
eq('　　空名單不會爆', api.seatKeysDisplay(B([])), []);
ok('★ 名單與課卡快捷簽到面板都改用顯示順序',
   /const _seatKeys=seatKeysDisplay\(b\);   \/\/ 同一個人的名額排在一起/.test(src)
   && /rows = seatKeysDisplay\(b\)\.map\(sk=>\{   \/\/ 同一個人的名額排在一起/.test(src));
ok('★ 取消名額仍用原順序（indexOf 要對得上 member_ids 的索引）',
   /const idx=seatKeys\(b\)\.indexOf\(sk\);/.test(src)
   && /const _att=attObj\(b\), _live=new Set\(seatKeys\(b\)\);/.test(src));
ok('　　為什麼不能直接改 seatKeys，寫在程式裡',
   /seatReindexAfterRemove／doGroupCancelSeat 是用 indexOf 去 splice member_ids 的/.test(src));

console.log('\n團課請假不算銷課名額（2026-07-30 使用者指示）');
ok('★ 抽出共用的人頭計算，請假的名額排除',
   /function grpAttendHeads\(b\)\{[\s\S]{0,180}return keys\.filter\(k=>att\[k\]!=='leave'\)\.length;/.test(src));
ok('★ 三處計薪的人頭加總都改用它（薪資單／月結明細／教練薪資頁）',
   (src.match(/reduce\(\(s,b\)=>s\+grpAttendHeads\(b\),0\)/g)||[]).length===3);
ok('★ 教練端本月統計的人次也排除請假',
   /const groupHeadCount=groupDoneBks\.reduce\(\(a,b\)=>a\+grpAttendHeads\(b\),0\);/.test(src));
ok('　　沒有名單的舊資料維持算 1（行為不變）', /if\(!keys\.length\) return 1;/.test(src));
ok('　　逐名額判斷（同一人可能只請假其中一個名額）', /逐名額判斷（同一人可能佔多個名額，可能只請假其中一個）/.test(src));
ok('　　命名避開既有的同名區域變數', /名稱不用 groupHeadCount —— 教練端本月統計裡已有同名的區域變數（數字），會遮蔽掉這支函式/.test(src));

// 實跑
{
  const i=src.indexOf('function grpAttendHeads(b){'); const j=src.indexOf('\n}\n',i)+2;
  const f=new Function('seatKeys','attObj', src.slice(i,j)+'\nreturn grpAttendHeads;')(api.seatKeys, b=>b.attendance||{});
  eq('★ 3 人都到 → 3', f(B(['A','B','C'],{A:'checked_in',B:'checked_in',C:'booked'})), 3);
  eq('★ 其中 1 人請假 → 2', f(B(['A','B','C'],{A:'checked_in',B:'leave',C:'booked'})), 2);
  eq('★ 同一人兩個名額、只請假一個 → 另一個仍算',
     f(B(['A','A','B'],{A:'checked_in','A#2':'leave',B:'booked'})), 2);
  eq('　　全員請假 → 0', f(B(['A','B'],{A:'leave',B:'leave'})), 0);
  eq('　　沒有名單的舊資料 → 1', f(B([],{})), 1);
  eq('　　未簽到仍算（只排除請假）', f(B(['A','B'],{})), 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
