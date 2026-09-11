/* 共享票：共享對象已簽到的名額被當成沒上（2026-09-11 使用者附截圖）
   「幫我看一下票券17為什麼跑出超約」「連票券1也被更改了」「看起來像是某些預約被退出來改成打勾」
   林政緯 #17（共享給林繼霖）：帳本淨扣 4 堂＝8/31、9/7、9/14、9/21，畫面卻是
   「沒日期的 ✓ ＋ 8/31 ＋ 9/7 ＋ 9/14 ＋ 9/21 超約」。林繼霖看 #1：四堂全變成 ✓＋紅虛線。
   根因：grpSeatMark 只認「看的人自己」的名額，共享對象的名額回 null，後備又只數自己的 → 0。
   這裡用正式庫的真實資料列（名單、出缺席）跑真正的 grpSeatMark。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };
const S=new Function(fn('seatMid')+fn('attObj')+fn('grpSeatMark')+'return {grpSeatMark};')();
const mark=(b,seat,viewer)=>S.grpSeatMark(Object.assign({},b,{_seat:seat}),viewer);

const ZW='MEM-1325851728CD';   // 林政緯（持有人）
const JL='m19fd086479dc4b8';   // 林繼霖（共享對象）
/* 正式庫 2026-09-11 的資料列（只留判斷用得到的欄位） */
const B0831={id:'BK-msignn1g76rp',status:'checked_in',member_ids:['MEM-9EE06E769258','MEM-D66FAA22232A','MEM-221134F2D49C','m19fabd6078ec81e',ZW],
  attendance:{[ZW]:'checked_in','MEM-221134F2D49C':'checked_in','MEM-9EE06E769258':'checked_in','MEM-D66FAA22232A':'checked_in','m19fabd6078ec81e':'checked_in'}};
const B0907={id:'BK-msigo17gy773',status:'checked_in',member_ids:['MEM-9EE06E769258','MEM-221134F2D49C',JL],
  attendance:{'MEM-221134F2D49C':'checked_in','MEM-9EE06E769258':'checked_in',[JL]:'checked_in'}};
const B0914={id:'BK-msiqsq2znj9i',status:'booked',member_ids:['MEM-9EE06E769258','MEM-221134F2D49C',JL,'m-mtu1x56n7i9t','m19fabd6078ec81e'],attendance:{}};
const B0921={id:'BK-msposoccbv88',status:'booked',member_ids:[JL],attendance:{}};

console.log('① #17 在林政緯的畫面（持有人看共享對象的名額）');
eq('★★★ 林繼霖 9/7 已簽到 → 已上（原本回 null → 被當成沒上 → 生出沒日期的 ✓）', mark(B0907,JL,ZW), 'att');
eq('★★ 自己的 8/31 照舊已上', mark(B0831,ZW,ZW), 'att');
eq('★★ 9/14、9/21 還沒上 → 空字串（一般待上，整堂都沒點名時自己的交給呼叫端）',
   [mark(B0914,JL,ZW), mark(B0921,JL,ZW)], ['','']);

console.log('\n② #17 在林繼霖的畫面（共享對象看持有人的名額）');
eq('★★★ 林政緯 8/31 已簽到 → 已上', mark(B0831,ZW,JL), 'att');
eq('★★ 自己的 9/7 照舊已上', mark(B0907,JL,JL), 'att');

console.log('\n③ #1 在林繼霖的畫面（7/23–8/17 都是林政緯上的）');
const old=[['7/23','BK-mrx6eoydb2wk',['MEM-9EE06E769258',ZW,'m19fabd6078ec81e']],
           ['7/27','IMP-00090',['MEM-1F69912AAECC','MEM-D66FAA22232A','MEM-9EE06E769258',ZW,'MEM-548552CEE2F0','MEM-221134F2D49C']],
           ['8/10','IMPB-B2026072017664854',['MEM-221134F2D49C',ZW,'MEM-9EE06E769258','MEM-D66FAA22232A']],
           ['8/17','IMPB-B2026072317719114',[ZW,'MEM-D66FAA22232A','MEM-9EE06E769258','MEM-CBB90B460C0E','MEM-221134F2D49C']]]
  .map(([d,id,ms])=>[d,{id,status:'checked_in',member_ids:ms,attendance:Object.fromEntries(ms.map(m=>[m,'checked_in']))}]);
eq('★★★ 四堂全部判成已上（原本四顆 ✓＋四個紅虛線）', old.map(([,b])=>mark(b,ZW,JL)), ['att','att','att','att']);

console.log('\n④ 自己的名額行為不變（林紫錡 9/05：兩個名額，第 1 個請假、第 2 個還沒上）');
const LZ={id:'X',status:'booked',member_ids:['L','L'],attendance:{L:'leave'}};
eq('★★★ 第 1 個名額 → 請假', mark(LZ,'L','L'), 'leave');
eq('★★★ 第 2 個名額 → 還沒上（不會因為第 1 個請假就算用掉）', mark(LZ,'L#2','L'), '');
eq('★★ 沒有名額鍵 → null（交給呼叫端）', S.grpSeatMark(LZ,'L'), null);
eq('★★ 整堂都沒點過名、自己的名額 → null（照舊看整筆狀態）', mark({status:'checked_in',member_ids:['A'],attendance:{}},'A','A'), null);

console.log('\n⑤ 整堂都沒點過名的舊資料，共享對象的名額直接看整筆狀態');
eq('★★ 已簽到的舊資料 → 已上', mark({status:'checked_in',member_ids:['A','B'],attendance:{}},'B','A'), 'att');
eq('★★ 還沒上的舊資料 → 空字串', mark({status:'booked',member_ids:['A','B'],attendance:{}},'B','A'), '');

console.log('\n⑥ 接線');
ok('★★ 票券夾與圓形卡都走這一支（兩處呼叫端沒有另寫一份）',
   /const mk=\(typeof grpSeatMark==='function'\)\?grpSeatMark\(b, memberId\):null;/.test(src)
   && /const _mk=\(typeof grpSeatMark==='function'\)\?grpSeatMark\(b, memberId\|\|t\.member_id\):null;/.test(src));
ok('★ 原因寫在原地', /共享對象已簽到的課永遠算成沒上/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
