/* 從 index.html 抽出真正的 allocBookingsToTickets，用正式庫真實資料驗證
   「會員票券卡」與「預約明細」對同一堂課會給出同一個答案。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const i=src.indexOf('function allocBookingsToTickets(');
if(i<0) throw new Error('找不到 allocBookingsToTickets');
const j=src.indexOf('\nasync function refundLegacyBooking',i);
if(j<0) throw new Error('找不到函式終點');
const alloc=new Function(src.slice(i,j)+'\nreturn allocBookingsToTickets;')();

let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(extra?'  → '+extra:''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const typeMap={
  'tt-pt':{id:'tt-pt',name:'教練課'},
  'tt-fr':{id:'tt-fr',name:'友善教練課'},
  'tt-gp':{id:'tt-gp',name:'團體課'},
};

/* ── 案例 1：朱庭箴 MEM-69D90A949008（正式庫真實資料）
   兩張 私人教練課 1V1 各 4 堂（6/01、7/05 啟用），6 筆已上課。
   正解：第一張吃 6/07・6/14・6/28・7/05；第二張吃 7/19・7/26（第 2 堂是 7/26）。 */
const T1=[
  {id:'MTK-0F9833A9A713',ticket_type_id:'tt-pt',format:'1V1',sessions_total:4,sessions_remaining:0,start_date:'2026-06-01',purchase_date:'2026-06-01'},
  {id:'MTK-0DC76C0C50D3',ticket_type_id:'tt-pt',format:'1V1',sessions_total:4,sessions_remaining:0,start_date:'2026-07-05',purchase_date:'2026-07-05'},
];
const B1=[
  {id:'IMP-01038',date:'2026-06-07',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:null},
  {id:'IMP-00888',date:'2026-06-14',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:null},
  {id:'IMP-00623',date:'2026-06-28',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:null},
  {id:'IMP-00474',date:'2026-07-05',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:null},
  {id:'IMP-00219',date:'2026-07-19',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'checked_in',ticket_id:null},
  {id:'IMP-00096',date:'2026-07-26',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'checked_in',ticket_id:null},
];
const a1=alloc(T1,B1,typeMap);
console.log('朱庭箴（正式庫真實資料）');
eq('第一張票吃 6/07・6/14・6/28・7/05', a1.inferred['MTK-0F9833A9A713'].map(x=>x.date), ['2026-06-07','2026-06-14','2026-06-28','2026-07-05']);
eq('第二張票吃 7/19・7/26',             a1.inferred['MTK-0DC76C0C50D3'].map(x=>x.date), ['2026-07-19','2026-07-26']);
ok('7/26 那堂歸第二張票', a1.byBooking['IMP-00096']==='MTK-0DC76C0C50D3', a1.byBooking['IMP-00096']);
// 預約明細顯示的「本堂第 N / total」＝該票券預約序 +1
const win=a1.byTicket[a1.byBooking['IMP-00096']];
ok('本堂第 2 / 4 堂（原本誤顯示 4/4）', win.findIndex(x=>x.id==='IMP-00096')+1===2, '第 '+(win.findIndex(x=>x.id==='IMP-00096')+1));
eq('圓點日期＝7/19・7/26（原本誤顯示 6/28・7/5・7/19・7/26）', win.map(x=>x.date), ['2026-07-19','2026-07-26']);
ok('已用 2 堂', win.filter(x=>x.status==='checked_in'||x.status==='completed').length===2);
// v2 起 byTicket 回傳「直連＋分配」合併後的新陣列，比內容不比物件
ok('兩邊同源：明細取到的清單＝會員卡那張票的清單',
   JSON.stringify(win.map(x=>x.id))===JSON.stringify(a1.inferred['MTK-0DC76C0C50D3'].map(x=>x.id)));

console.log('直連 ticket_id 優先');
const T2=[{id:'TA',ticket_type_id:'tt-pt',format:'1V1',sessions_total:2,start_date:'2026-01-01'}];
const B2=[
  {id:'b1',date:'2026-03-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:'TA'},
  {id:'b2',date:'2026-02-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:'TA'},
  {id:'b3',date:'2026-04-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed',ticket_id:null},
];
const a2=alloc(T2,B2,typeMap);
eq('直連的兩堂依時間排序',       a2.byTicket['TA'].map(x=>x.id), ['b2','b1']);
ok('已直連的票不再參與推估',     a2.inferred['TA']===undefined);
ok('未綁的 b3 沒被硬塞給 TA',    a2.byBooking['b3']===undefined);

console.log('分組：format 與票種不可混');
const T3=[
  {id:'P1',ticket_type_id:'tt-pt',format:'1V1',sessions_total:2,start_date:'2026-01-01'},
  {id:'P2',ticket_type_id:'tt-pt',format:'1V2',sessions_total:2,start_date:'2026-01-01'},
  {id:'F1',ticket_type_id:'tt-fr',format:'1V1',sessions_total:2,start_date:'2026-01-01'},
];
const B3=[
  {id:'x1',date:'2026-02-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed'},
  {id:'x2',date:'2026-02-02',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V2',status:'completed'},
  {id:'x3',date:'2026-02-03',start_time:'09:00',ticket_type_id:'tt-fr',format:'1V1',status:'completed'},
];
const a3=alloc(T3,B3,typeMap);
eq('1V1 教練課只吃 x1', a3.inferred['P1'].map(x=>x.id), ['x1']);
eq('1V2 教練課只吃 x2', a3.inferred['P2'].map(x=>x.id), ['x2']);
eq('友善課只吃 x3',     a3.inferred['F1'].map(x=>x.id), ['x3']);

console.log('取消的課不佔堂數');
const T4=[{id:'C1',ticket_type_id:'tt-pt',format:'1V1',sessions_total:2,start_date:'2026-01-01'}];
const B4=[
  {id:'c1',date:'2026-02-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'cancelled'},
  {id:'c2',date:'2026-02-02',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed'},
  {id:'c3',date:'2026-08-09',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'booked'},
];
const a4=alloc(T4,B4,typeMap);
eq('取消的略過，未來預約仍佔位', a4.inferred['C1'].map(x=>x.id), ['c2','c3']);
ok('未來預約不算已上課', a4.inferred['C1'].filter(x=>x.status==='checked_in'||x.status==='completed').length===1);

console.log('票不夠涵蓋所有堂數時');
const T5=[{id:'S1',ticket_type_id:'tt-pt',format:'1V1',sessions_total:1,start_date:'2026-01-01'}];
const B5=[
  {id:'s1',date:'2026-02-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed'},
  {id:'s2',date:'2026-02-02',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed'},
];
const a5=alloc(T5,B5,typeMap);
eq('票只吃得下第一堂', a5.inferred['S1'].map(x=>x.id), ['s1']);
ok('分配不到的那堂回報 undefined（明細會退回舊推估）', a5.byBooking['s2']===undefined);

console.log('邊界');
ok('空輸入不炸', JSON.stringify(alloc([],[],typeMap))==='{"byTicket":{},"byBooking":{},"inferred":{}}');
ok('typeMap 缺票種仍可分組', alloc(
  [{id:'U1',ticket_type_id:'zz',format:'',sessions_total:1,start_date:'2026-01-01'}],
  [{id:'u1',date:'2026-02-01',start_time:'09:00',ticket_type_id:'zz',format:'',status:'completed'}],
  {}).byBooking['u1']==='U1');
ok('sessions_total 為 0 的票不吃任何堂', alloc(
  [{id:'Z0',ticket_type_id:'tt-pt',format:'1V1',sessions_total:0,start_date:'2026-01-01'},
   {id:'Z1',ticket_type_id:'tt-pt',format:'1V1',sessions_total:1,start_date:'2026-02-01'}],
  [{id:'z1',date:'2026-03-01',start_time:'09:00',ticket_type_id:'tt-pt',format:'1V1',status:'completed'}],
  typeMap).byBooking['z1']==='Z1');

console.log('真實案例：徐子芸（混合票＋無票種的未來預約）');
/* 正式庫真實結構：7/01 票（2堂，剩1）已有直連 7/20 已上；7/20 新票（2堂，剩2）全新。
   7/29 的預約沒綁票也沒票種（匯入常態）——舊系統把它記在還有剩餘的 7/01 票（預約中1）。 */
const typeMap2={'tt-pt':{id:'tt-pt',name:'教練課',category:'私人教練'}};
const T6=[
  {id:'TK-0701',ticket_type_id:'tt-pt',format:'1V1',sessions_total:2,sessions_remaining:1,start_date:'2026-07-01'},
  {id:'TK-0720',ticket_type_id:'tt-pt',format:'1V1',sessions_total:2,sessions_remaining:2,start_date:'2026-07-20'},
];
const B6=[
  {id:'k1',date:'2026-07-20',start_time:'12:00',ticket_type_id:null,format:null,status:'checked_in',ticket_id:'TK-0701'},
  {id:'k2',date:'2026-07-29',start_time:'12:00',ticket_type_id:null,format:null,status:'booked',ticket_id:null,category:'私人教練'},
];
const a6=alloc(T6,B6,typeMap2);
ok('★ 7/29 無票種預約分給還有剩餘的 7/01 票（非 7/20 新票）', a6.byBooking['k2']==='TK-0701', a6.byBooking['k2']);
eq('7/01 票合併清單＝直連 7/20 已上＋分配 7/29 預約', (a6.byTicket['TK-0701']||[]).map(x=>x.id), ['k1','k2']);
ok('7/20 新票保持空白（0/2）', a6.byTicket['TK-0720']===undefined);
ok('容量守恆：7/01 票（2堂）不會被塞第三筆', (a6.byTicket['TK-0701']||[]).length===2);

console.log('真實案例：陳蘭馨限定票（教練課系相容配對）');
/* 她的預約票種＝教練課、票＝限定教練課（陳添泉共享，剩 3）。
   自己的教練課 12 堂票吃掉前 12 堂後，7/27×2、8/3 的預約要落到限定票上。 */
const typeMap3={'tt-pt':{id:'tt-pt',name:'教練課',category:'私人教練'},
  'tt-ltd':{id:'tt-ltd',name:'限定教練課',category:'私人教練'},
  'tt-fr':{id:'tt-fr',name:'友善教練課',category:'私人教練'}};
const T7=[
  {id:'OWN12',ticket_type_id:'tt-pt',format:'1V2',sessions_total:12,sessions_remaining:0,start_date:'2025-08-18'},
  {id:'XU10',ticket_type_id:'tt-ltd',format:'1V2',sessions_total:10,sessions_remaining:0,start_date:'2026-05-18'},
  {id:'TAN10',ticket_type_id:'tt-ltd',format:'1V2',sessions_total:10,sessions_remaining:3,start_date:'2026-06-29'},
];
const B7=[];
const days=['05-04','05-04','05-11','05-11','05-18','05-18','05-25','05-25','05-29','06-01','06-08','06-08',
            '06-15','06-15','06-29','06-29','07-06','07-06','07-13','07-13','07-20','07-20'];
days.forEach((d,i)=>B7.push({id:'a'+i,date:'2026-'+d,start_time:i%2?'11:00':'10:00',ticket_type_id:'tt-pt',format:'1V2',status:'completed'}));
B7.push({id:'m1',date:'2026-07-27',start_time:'09:30',ticket_type_id:'tt-pt',format:'1V2',status:'booked'});
B7.push({id:'m2',date:'2026-07-27',start_time:'10:30',ticket_type_id:'tt-pt',format:'1V2',status:'booked'});
B7.push({id:'m3',date:'2026-08-03',start_time:'10:00',ticket_type_id:'tt-pt',format:'1V2',status:'booked'});
const a7=alloc(T7,B7,typeMap3);
ok('★ 7/27×2、8/3 落到還有剩餘的限定票（陳添泉）',
   a7.byBooking['m1']==='TAN10'&&a7.byBooking['m2']==='TAN10'&&a7.byBooking['m3']==='TAN10',
   [a7.byBooking['m1'],a7.byBooking['m2'],a7.byBooking['m3']].join(','));
eq('限定票（陳添泉）圓點尾端＝7/27・7/27・8/3',
   (a7.byTicket['TAN10']||[]).filter(x=>x.status==='booked').map(x=>x.date),
   ['2026-07-27','2026-07-27','2026-08-03']);
ok('自己的 12 堂票吃前 12 堂', (a7.inferred['OWN12']||[]).length===12);
ok('許朱同限定票（剩 0）吃到相容的已上課、拿不到未來預約',
   (a7.byTicket['XU10']||[]).filter(x=>x.status==='booked').length===0);
ok('友善票種不混入教練課系', alloc(
  [{id:'F24',ticket_type_id:'tt-fr',format:'1V2',sessions_total:24,sessions_remaining:19,start_date:'2026-01-23'}],
  [{id:'p1',date:'2026-07-27',start_time:'09:30',ticket_type_id:'tt-pt',format:'1V2',status:'booked'}],
  typeMap3).byBooking['p1']===undefined);

/* ── 案例 8：楊文華（2026-07-27 真實案例）——未來預約不得分給過期票 ──
   7/8 贈點（過期 7/14、剩 1）＋ 7/22 贈點（效期至 7/28、剩 2），
   7/27 的自主訓練（無票種）必須掛在 7/22 那張，不能被排序在前、還有餘額的過期票吸走。 */
console.log('楊文華（未來預約跳過過期票）');
const typeMap8={'tt-self':{id:'tt-self',name:'自主訓練點數',category:'自主訓練'}};
const a8=alloc(
  [{id:'OLD78',ticket_type_id:'tt-self',sessions_total:2,sessions_remaining:1,start_date:'2026-07-08',expire_date:'2026-07-14'},
   {id:'NEW722',ticket_type_id:'tt-self',sessions_total:2,sessions_remaining:2,start_date:'2026-07-22',expire_date:'2026-07-28'}],
  [{id:'sb1',date:'2026-07-27',start_time:'10:00',category:'自主訓練',status:'booked',ticket_id:null}],
  typeMap8);
ok('★ 7/27 自主訓練掛 7/22 新票（跳過過期的 7/8 票）', a8.byBooking['sb1']==='NEW722', a8.byBooking['sb1']);
ok('過期票沒有吸到未來預約', !(a8.inferred['OLD78']||[]).length);

/* ── 案例 9：李昭賜（2026-07-27）——已上課不得回填到「上課日早於票券起始日」的票 ── */
console.log('李昭賜（起始日守門）');
const a9=alloc(
  [{id:'GRANT727',ticket_type_id:'tt-self',sessions_total:2,sessions_remaining:2,start_date:'2026-07-27',expire_date:'2026-08-02'}],
  [{id:'old523',date:'2026-05-23',start_time:'10:00',category:'自主訓練',status:'completed',ticket_id:null},
   {id:'nb1',date:'2026-08-01',start_time:'11:00',category:'自主訓練',status:'booked',ticket_id:null}],
  {'tt-self':{id:'tt-self',name:'自主訓練點數',category:'自主訓練'}});
ok('★ 5/23 舊課不回填到 7/27 贈點票', !(a9.byTicket['GRANT727']||[]).some(b=>b.id==='old523'));
ok('8/1 未來預約仍掛在贈點票', (a9.byTicket['GRANT727']||[]).some(b=>b.id==='nb1'));

/* ── 案例 10：李昭賜②——效期窗優先：5/4 的課屬於限定方案（5/4–7/19），
   不該被無效期的舊 12 堂票（2024-11 起、還有容量）搶走 ── */
console.log('李昭賜（效期窗優先）');
const tmX={'tt-pt':{id:'tt-pt',name:'教練課'}};
const aX=alloc(
  [{id:'OLD12',ticket_type_id:'tt-pt',format:'1V2',sessions_total:12,sessions_remaining:0,start_date:'2024-11-22'},
   {id:'LTD10',ticket_type_ID:undefined,ticket_type_id:'tt-pt',format:'1V2',sessions_total:10,sessions_remaining:0,start_date:'2026-05-04',expire_date:'2026-07-19'}],
  [{id:'m54',date:'2026-05-04',start_time:'10:00',ticket_type_id:'tt-pt',format:'1V2',status:'completed',ticket_id:null}],
  tmX);
ok('★ 5/4 的課分給效期窗涵蓋的限定票（不是舊 12 堂）', aX.byBooking['m54']==='LTD10', aX.byBooking['m54']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
