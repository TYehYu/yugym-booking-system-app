/* 票券「已用堂數」——真實案例回歸。

   2026-07-26：三訊號取最大（直連已上／FIFO 推算已上／帳面已用−直連預約中）。
   2026-07-29：算式抽成共用的 tkUsedCount（卡片圓點與歷史紀錄判定同一個數字）。
   2026-07-31：算式搬進票券夾（buildWallet），八個畫面都問它 —— 這裡改直接驗票券夾。
               案例維持原樣（陳蘭馨混合票、朱庭箴、全會員比對守則）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const TODAY=new Date(2026,6,26);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const attObj=b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};};
const buildWallet=new Function('ymd','TODAY','parseYmd','attObj',
  [grabFn('mids'),grabFn('tkSharedIds'),grabFn('tkUsableBy'),grabFn('tkClass5'),
   grabFn('allocBookingsToTickets'),grabFn('grpTicketAlloc'),grabFn('buildWallet')].join('\n')
  +'\nreturn buildWallet;')(ymd,TODAY,parseYmd,attObj);

const ME='M';
const TYPES={'tt-pt':{id:'tt-pt',name:'教練課',category:'私人教練'}};
let seq=0;
/* bound＝綁在這張票上的預約（新系統）；loose＝沒綁票的舊預約（靠先進先出推算） */
const calc=(total,t,bound,loose)=>{
  const tk=Object.assign({id:'t',member_id:ME,ticket_type_id:'tt-pt',plan_name:'教練課',
    sessions_total:total,status:'usable',start_date:'2026-01-01'},t);
  const mk=(st,tid)=>({id:'B'+(++seq),date:'2026-0'+(1+(seq%9))+'-10',start_time:'11:00',
    status:st,category:'私人教練',ticket_type_id:'tt-pt',member_id:ME,ticket_id:tid});
  const bks=(bound||[]).map(st=>mk(st,tk.id)).concat((loose||[]).map(st=>mk(st,null)));
  return buildWallet(ME,{tickets:[tk],bookings:bks,logs:[],typeMap:TYPES}).of(tk.id).used;
};

let pass=0,fail=0;
const chk=(n,got,want)=>{const ok=got===want;ok?pass++:fail++;console.log(`  ${ok?'✓':'✗'} ${n}  got=${got} want=${want}`);};

console.log('有綁預約（新系統票券）：');
chk('3 筆已上直連 → 已用 3', calc(4,{sessions_remaining:1},['completed','completed','checked_in']), 3);
chk('綁的數量超過總堂 → 不超過總堂', calc(3,{sessions_remaining:0},['checked_in','checked_in','checked_in','checked_in']), 3);
chk('新系統票約滿未上（預約扣課）→ 已用 0', calc(4,{sessions_remaining:0},['booked','booked','booked','booked']), 0);

console.log('混合票（匯入＋之後才綁到一筆）——陳蘭馨友善 1V2 真實案例：');
// 總 24、剩 19（口徑修正後）、直連只有 7/14 一堂已上 → 已用應為帳面 5，不是 1
chk('★ 直連 1 堂但帳面已用 5 → 顯示 5', calc(24,{sessions_remaining:19},['checked_in']), 5);
chk('帳面已用要扣掉直連仍預約中的扣課', calc(24,{sessions_remaining:18},['checked_in','booked']), 5);

console.log('未綁但推算得到（匯入票券）：');
// 朱庭箴：口徑修正後 剩2（總4、已上2、未來2 不預扣）→ 三訊號一致
chk('朱庭箴（修正後剩 2）：2 已上 + 2 未來 → 已用 2',
    calc(4,{sessions_remaining:2},[],['completed','checked_in','booked','booked']), 2);
chk('全部未來預約（剩＝總）→ 已用 0', calc(4,{sessions_remaining:4},[],['booked','booked']), 0);
chk('全部已上 → 已用 4（整排實心）',
    calc(4,{sessions_remaining:0},[],['completed','completed','completed','completed']), 4);

console.log('推算不到時退回用餘額：');
chk('用完的歷史票券 → 整排實心', calc(12,{sessions_remaining:0}), 12);
chk('全新未用 → 0', calc(4,{sessions_remaining:4}), 0);
chk('餘額缺失 → 0', calc(8,{sessions_remaining:null}), 0);
chk('餘額 > 總堂（髒資料）→ 不變負數', calc(12,{sessions_remaining:16}), 0);

console.log('全會員比對（2026-07-26）新增守則：');
// 有餘額資訊時，FIFO 推算不得抬高已用（歷史「已上課未扣票」會把沒用過的票塞滿）
chk('★ 推算 2 已上但帳面全新（剩=總）→ 顯示 0', calc(2,{sessions_remaining:2},[],['completed','completed']), 0);
chk('餘額缺失時推算仍可當後備', calc(4,{sessions_remaining:null},[],['completed','completed']), 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
