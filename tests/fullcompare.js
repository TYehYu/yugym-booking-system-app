/* 全會員票券卡顯示值 vs 舊系統已核銷 —— 一次性比對腳本。
   從 index.html 抽出真正的顯示邏輯（alloc/usedMap/usedCount），
   對每位會員模擬會員詳細頁的計算，逐張票與 old_map.json（舊系統已核銷）比對。

   ⚠ 2026-08-20 使用者確認：舊系統的帳已由櫃檯手動對齊，8 月總整理對帳不再進行。
   這支保留當參考（日後若又要跟外部資料對帳，這裡有現成的取值路徑），
   但它需要三個匯出檔，而那是真實會員資料、故意不進版控（見 .gitignore）。
   缺檔時明確「跳過」並正常結束 —— 不要用未攔截的 ENOENT 假裝成測試失敗，
   否則每次跑全套都會多一支紅的，久了就沒人看紅字了。 */
const fs=require('fs');
const NEED=['tickets2.json','bookings2.json','old_map.json'];
{
  const miss=NEED.filter(f=>!fs.existsSync(f));
  if(miss.length){
    console.log('跳過：一次性對帳腳本，需要舊系統匯出檔 '+miss.join('、'));
    console.log('（2026-08-20 起舊系統帳務已由櫃檯手動對齊，此腳本平時不需執行）');
    process.exit(0);
  }
}
const h=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const grabFn=n=>{let i=h.indexOf('function '+n+'(');if(i<0)throw new Error('no '+n);
  if(h.slice(i-6,i)==='async ')i-=6;let d=0;
  for(let k=h.indexOf('{',i);k<h.length;k++){if(h[k]==='{')d++;else if(h[k]==='}'){d--;if(!d)return h.slice(i,k+1);}}};
const lib=new Function([grabFn('tkSharedIds'),grabFn('tkParticipants'),grabFn('tkUsableBy'),
  grabFn('allocBookingsToTickets'),grabFn('usedSessionsMap'),grabFn('usedDatesMap')].join('\n')
  +';return {tkSharedIds,tkParticipants,tkUsableBy,allocBookingsToTickets,usedSessionsMap,usedDatesMap};')();
// usedCount 運算式（與 utest 同一段原始碼）
const a=h.indexOf('    const inf=inferByTk[t.id]||[];');
const b=h.indexOf('const isDim=', a);
const usedSrc=h.slice(a,b);
const calcUsed=new Function('total','dates','t','inferByTk','bkByTk',usedSrc+' return usedCount;');

const T=JSON.parse(fs.readFileSync('tickets2.json'));
const B=JSON.parse(fs.readFileSync('bookings2.json'));
const OLD=JSON.parse(fs.readFileSync('old_map.json'));
const TT={'tt-mqdt435bbizd':{name:'教練課',category:'私人教練'},'tt-mqdt4ijw29ga':{name:'友善教練課',category:'私人教練'},
'tt-mqdt4ubv8e5i':{name:'團體課',category:'小班肌力'},'tt-mrghed5b6ke2':{name:'運動按摩',category:'運動按摩'},
'tt-vip-legacy':{name:'VIP 教練課',category:'私人教練'},'tt-limited-legacy':{name:'限定教練課',category:'私人教練'},
'tt-discount-ms300':{name:'運動按摩折抵300',category:'運動按摩'},'tt-discount-pt300':{name:'教練課折抵300',category:'私人教練'},
'tt-mqdt55uosz5n':{name:'自主訓練',category:'自主訓練'},'tt-mqdt5kbxusgt':{name:'友善自主訓練',category:'自主訓練'},
'self_training':{name:'自主訓練',category:'自主訓練'},'self_friendly':{name:'友善自主訓練',category:'自主訓練'}};
const typeMap={}; Object.keys(TT).forEach(k=>typeMap[k]=Object.assign({id:k},TT[k]));
// 欄位名對齊頁面期待
T.forEach(t=>{ t.sessions_total=t.tot; t.sessions_remaining=t.rem; t.start_date=t.sd; t.purchase_date=t.pd; t.expire_date=t.ed; t.created_at=t.ca||''; t.status=t.st; });
B.forEach(x=>{ x.date=x.d; x.start_time=x.t; x.status=x.st; x.category=x.cat; });

const byOwner={};
T.forEach(t=>{ (byOwner[t.member_id]=byOwner[t.member_id]||[]).push(t); });
const bkByMember={};
B.forEach(x=>{ if(x.member_id) (bkByMember[x.member_id]=bkByMember[x.member_id]||[]).push(x); });

const mism=[];
const evaluated=new Set();
Object.keys(byOwner).forEach(mid=>{
  const tickets=T, bookings=B;
  const myTickets=tickets.filter(t=>lib.tkUsableBy(t,mid));
  const myBookings=(bkByMember[mid]||[]);
  // sharedBookings（同頁面邏輯）
  const _shrKeys=new Set(), _shrPeers=new Set();
  myTickets.forEach(t=>{
    if(!lib.tkSharedIds(t).length) return;
    const ty=typeMap[t.ticket_type_id];
    _shrKeys.add([(ty?ty.name:''), t.format||''].join('|'));
    lib.tkParticipants(t).forEach(x=>{ if(String(x)!==String(mid)) _shrPeers.add(String(x)); });
  });
  const sharedBookings=(_shrKeys.size&&_shrPeers.size)
    ? myBookings.concat(bookings.filter(x=>{
        if(!_shrPeers.has(String(x.member_id))) return false;
        const ty=typeMap[x.ticket_type_id];
        return _shrKeys.has([(ty?ty.name:''), x.format||''].join('|'));
      }))
    : myBookings;
  const usedMap=lib.usedSessionsMap(sharedBookings);
  const usedDates=lib.usedDatesMap(sharedBookings);
  const bkByTk={};
  sharedBookings.forEach(x=>{ if(x.ticket_id&&x.status!=='cancelled'){ (bkByTk[x.ticket_id]=bkByTk[x.ticket_id]||[]).push(x); } });
  const alloc=lib.allocBookingsToTickets(myTickets,sharedBookings,typeMap);
  myTickets.forEach(t=>{
    if(t.member_id!==mid) return;           // 每張票只從持有人視角評一次
    if(evaluated.has(t.id)) return; evaluated.add(t.id);
    const o=OLD[t.id]; if(!o) return;       // 沒有舊系統對照（新系統原生票等）
    const total=t.sessions_total||0;
    const dates=(usedDates[t.id]||[]).slice();
    const usedCount=calcUsed(total,dates,t,alloc.inferred,bkByTk);
    if(usedCount!==Math.min(total,o.used)){
      mism.push({id:t.id,name:t.name,phone:t.phone,ty:(typeMap[t.ticket_type_id]||{}).name||t.ticket_type_id,
        fmt:t.format||'',total,card:usedCount,old:o.used,oldBooked:o.booked,rem:t.sessions_remaining,
        bound:(bkByTk[t.id]||[]).length,inf:(alloc.inferred[t.id]||[]).length,order:o.order});
    }
  });
});
console.log(`比對票券 ${evaluated.size} 張（有舊系統對照 ${Object.keys(OLD).length} 張）`);
console.log(`卡片已用 ≠ 舊系統已核銷：${mism.length} 張`);
mism.sort((a,c)=>(c.card-Math.min(c.total,c.old))-(a.card-Math.min(a.total,a.old)));
mism.forEach(x=>console.log(`  ${x.name} ${x.ty}${x.fmt} 總${x.total}｜卡片已用 ${x.card} vs 舊核銷 ${x.old}（舊預約中${x.oldBooked}／prod剩${x.rem}／直連${x.bound}／推算${x.inf}）${x.id}`));
