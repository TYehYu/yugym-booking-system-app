/* 2026-08-06 使用者提問：「團課的預約沒有地方可以紀錄，不能新增一個地方給他紀錄嗎？」

   一堂團課多人共用同一筆 bookings，只有一個 ticket_id 欄位塞不下每個人的票，
   所以團課的扣課一直只存在 ticket_logs，票券夾對舊資料只能靠先進先出「推算」。
   新增 bookings.seat_tickets（jsonb）：名額鍵 → 票券 id，逐名額記錄，
   同一人佔多個名額也分得開。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const ME='M-1';
const attObj=b=>b.attendance||{};
const env={
  attObj,
  mids:b=>Array.isArray(b.member_ids)?b.member_ids:[],
  seatKeys:b=>{const c={};return (b.member_ids||[]).map(id=>{c[id]=(c[id]||0)+1;return c[id]>1?id+'#'+c[id]:id;});},
  seatMid:k=>{const s=String(k),i=s.indexOf('#');return i<0?s:s.slice(0,i);},
  bkIsGroup:b=>b.category==='小班肌力',
  ymd:()=> '2026-08-06',
  TODAY:new Date(2026,7,6),
};

console.log('① 名額鍵重編（移掉中間那個名額，後面的往前遞補）');
{
  const fn=new Function(...Object.keys(env), grabFn('seatTkReindexAfterRemove')+'\nreturn seatTkReindexAfterRemove;')(...Object.values(env));
  const b={member_ids:[ME,'M-2',ME,ME],
    seat_tickets:{[ME]:'T1','M-2':'T9',[ME+'#2']:'T2',[ME+'#3']:'T3'}};
  eq('★ 移掉第 2 個名額（索引 2）→ T1 留著、T3 遞補成 #2',
     fn(b,2), {'M-2':'T9',[ME]:'T1',[ME+'#2']:'T3'});
  eq('　　移掉第 1 個名額 → 後面兩張往前遞補',
     fn(b,0), {'M-2':'T9',[ME]:'T2',[ME+'#2']:'T3'});
  eq('　　別人的名額不受影響', fn(b,1)['M-2'], undefined);
  eq('　　沒有 seat_tickets 的舊資料回 null（欄位維持空的）',
     fn({member_ids:[ME]},0), null);
}

console.log('\n② 票券夾優先採用這個事實');
{
  const deps={
    mids:env.mids, seatKeys:env.seatKeys, seatMid:env.seatMid, attObj,
    ymd:env.ymd, TODAY:env.TODAY,
  };
  const fn=new Function(...Object.keys(deps), grabFn('grpTicketAlloc')+'\nreturn grpTicketAlloc;')(...Object.values(deps));
  const TKS=[{id:'T-A',purchase_date:'2026-01-01',status:'usable'},
             {id:'T-B',purchase_date:'2026-07-01',status:'usable'}];
  /* 同一個人兩個名額，分別扣在兩張票上；近似法（依購買日排序）會把兩張反過來配 */
  const b={id:'B1',category:'小班肌力',member_ids:[ME,ME],attendance:{},date:'2026-08-20',
    seat_tickets:{[ME]:'T-A',[ME+'#2']:'T-B'}};
  const LOGS=[{ticket_id:'T-A',booking_id:'B1',action:'deduct'},
              {ticket_id:'T-B',booking_id:'B1',action:'deduct'}];
  const r=fn(TKS,[b],LOGS,ME,()=>true);
  eq('★ 兩張票各蓋一個戳記（照課卡上記的名額歸屬）',
     Object.keys(r.byTicket).sort().map(k=>k+':'+r.byTicket[k].length), ['T-A:1','T-B:1']);

  /* 沒有 seat_tickets 的舊資料 → 照原本的近似法，不能壞掉 */
  const b2={id:'B2',category:'小班肌力',member_ids:[ME,ME],attendance:{},date:'2026-08-20'};
  const r2=fn(TKS,[b2],[{ticket_id:'T-A',booking_id:'B2',action:'deduct'},
                        {ticket_id:'T-B',booking_id:'B2',action:'deduct'}],ME,()=>true);
  eq('　　舊資料照舊（兩個名額仍各蓋一格）',
     Object.keys(r2.byTicket).sort().map(k=>k+':'+r2.byTicket[k].length), ['T-A:1','T-B:1']);
}

console.log('\n③ 接線');
ok('★ 加名單扣課成功才記歸屬（逐名額鍵）',
   /if\(_ded\)\{ const _sk=\(_i>0\)\?\(mid\+'#'\+\(_i\+1\)\):mid;\n\s*b\.seat_tickets=Object\.assign\(\{\}, b\.seat_tickets\|\|\{\}, \{\[_sk\]:tk\.id\}\); \}/.test(src));
ok('★ 移除名額時歸屬跟著移除／重編',
   /b\.seat_tickets=seatTkReindexAfterRemove\(b, i\);/.test(src)
   && /const _ks=Object\.keys\(_st\)\.filter\(k=>seatMid\(k\)===String\(mid\)\);/.test(src));
ok('★ 分配時先看事實、沒有才用近似法（2026-08-07 改兩段式，見 ⑤）',
   /const w=_seatTk && _seatTk\[k\];\n\s*if\(w && \(_left\[w\]\|\|0\)>0\)\{ _fix\[i\]=w; _left\[w\]--; \}/.test(src)
   && /const logged=_fix\[i\]\|\|slots\[_si\+\+\]\|\|null;/.test(src));
ok('★ 欄位不在精簡清單裡（列表讀取會帶回來）',
   !/LEAN_DROP[\s\S]{0,200}seat_tickets/.test(src));
ok('　　為什麼需要這個欄位，寫在程式裡',
   /團課的預約沒有地方可以紀錄，\n\s*不能新增一個地方給他紀錄嗎？/.test(src));

console.log('\n④ 票券管理頁補回導覽入口');
/* 2026-08-06 補回入口；2026-08-08 使用者定案再移除 —— 內容併進經營報表
   （會員票券＝「票券」分頁、對帳巡檢＝待處理那一排），見 tkmovetest。 */
ok('★ 票券管理的導覽入口已移除，內容併進經營報表',
   !/\{grp:'財務', label:'票券管理', page:'ticketing'\},/.test(src)
   && /\{key:'tickets',    label:'票券'\},/.test(src));
ok('　　頁面本身與路由保留（櫃檯入口、賣票流程與舊深連結仍會用到）',
   /PAGES\.ticketing=async function\(\)\{/.test(src));

console.log('\n⑤ 兩段式分配：明寫的名額先配、剩下的才近似（2026-08-07 許佳慈案例）');
{
  /* 8/07 那堂她佔 4 個名額，扣課紀錄是「A 兩堂、B 一堂、C（當天買的 $400 體驗）一堂」，
     課卡上只明寫了第 4 個名額用 C。
     舊寫法：第 1 個名額沒明寫 → 拿 slots[0]＝C（購買日最新排最前），
             第 4 個名額明寫 → 又指到 C ⇒ C 被畫兩顆、B 一顆都沒有。 */
  const deps={ mids:env.mids, seatKeys:env.seatKeys, seatMid:env.seatMid, attObj,
    ymd:env.ymd, TODAY:env.TODAY };
  const fn=new Function(...Object.keys(deps), grabFn('grpTicketAlloc')+'\nreturn grpTicketAlloc;')(...Object.values(deps));
  const TKS=[{id:'A',purchase_date:'2026-08-01',status:'usable'},
             {id:'B',purchase_date:'2026-08-01',status:'usable'},
             {id:'C',purchase_date:'2026-08-07',status:'usable'}];
  const b={id:'B7',category:'小班肌力',member_ids:[ME,ME,ME,ME],attendance:{},date:'2026-08-07',
    seat_tickets:{[ME+'#4']:'C'}};
  const L=[{ticket_id:'A',booking_id:'B7',action:'deduct'},{ticket_id:'A',booking_id:'B7',action:'deduct'},
           {ticket_id:'B',booking_id:'B7',action:'deduct'},{ticket_id:'C',booking_id:'B7',action:'deduct'}];
  const r=fn(TKS,[b],L,ME,()=>true);
  const cnt=k=>(r.byTicket[k]||[]).length;
  eq('★★ 每張票拿到的圓點數＝它真正扣了幾堂（A2・B1・C1）', [cnt('A'),cnt('B'),cnt('C')], [2,1,1]);
  eq('★ 課卡明寫的第 4 個名額確實落在 C', (r.byTicket['C']||[]).map(x=>x._seat), [ME+'#4']);
  ok('★ C 只被用一次（不會又被近似法配走一格）', cnt('C')===1);
  ok('　　沒有任何一格落空（四個名額都配到票）', cnt('A')+cnt('B')+cnt('C')===4);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
