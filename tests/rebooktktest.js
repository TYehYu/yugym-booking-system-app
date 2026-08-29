/* 2026-08-06 使用者回報（林紫錡票券截圖）：「為什麼這邊票券又出問題了」

   成因：櫃檯把 8/8 那堂團課整筆取消再重建。取消時退回的是 6/26 的四週票
   （那堂本來就記在它身上，8/01 已與使用者對過帳：7/04 7/18 8/01 8/08），
   但重建加名單時，自動挑票依「先進先出」挑到 5/23 的舊票 ——
   四週票空出一格永遠用不到、舊票被多扣一堂，兩張卡的日期都對不上。

   修法：同一位會員、同一天、同一種課，若剛剛有票被退回（該堂淨退回>0），優先用回那張。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('async function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 林紫錡的實況：8/8 那堂原本扣 6/26 四週票（TK-4W），取消時退回；
   重建時她手上還有 5/23 的舊票（TK-OLD，先進先出排在前面）。 */
const ME='M-LZQ';
const BKS=[
  {id:'B-OLD',date:'2026-08-08',start_time:'11:00',status:'cancelled',category:'小班肌力',member_ids:[ME,'M-2']},
  {id:'B-NEW',date:'2026-08-08',start_time:'11:00',status:'booked',category:'小班肌力',member_ids:[ME,'M-2'],ticket_type_id:'tt-g'},
  {id:'B-ETC',date:'2026-08-15',start_time:'11:00',status:'cancelled',category:'小班肌力',member_ids:[ME]},
];
const LOGS=[
  {id:'l1',ticket_id:'TK-4W',booking_id:'B-OLD',action:'deduct'},
  {id:'l2',ticket_id:'TK-4W',booking_id:'B-OLD',action:'refund'},   // 取消退回 → 淨 0，但曾經扣過
  {id:'l3',ticket_id:'TK-OLD',booking_id:'B-ETC',action:'deduct'},
  {id:'l4',ticket_id:'TK-OLD',booking_id:'B-ETC',action:'refund'},
];
const CAND=[{id:'TK-OLD',purchase_date:'2026-05-23'},{id:'TK-4W',purchase_date:'2026-06-26'}];  // 先進先出：舊票在前

const mk=(logs,cand)=>new Function('dbGetAll','bkHasMember','listUsableTickets',
  grabFn('rebookSameDayTicket')+'\nreturn rebookSameDayTicket;')(
  async t=>(t==='bookings'?BKS:(t==='ticket_logs'?logs:[])),
  (b,mid)=>(b.member_ids||[]).some(x=>String(x)===String(mid)),
  /* 可用票清單本來就依會員過濾（共享票除外）—— 別人的票根本不會出現在他的清單裡 */
  async(mid)=>(String(mid)===ME?cand:[]));

(async()=>{
  console.log('① 取消後重約同一堂 → 回到原本那張票');
  {
    const fn=mk(LOGS,CAND);
    const t=await fn(ME, BKS[1]);
    eq('★ 挑回 8/8 那堂剛被退回的四週票（不是先進先出的舊票）', t&&t.id, 'TK-4W');
  }
  {
    /* 那張票已經不能用（過期／作廢／被別人用光）→ 不硬塞，回到一般自動挑票 */
    const fn=mk(LOGS,[{id:'TK-OLD',purchase_date:'2026-05-23'}]);
    const t=await fn(ME, BKS[1]);
    eq('★ 原本那張已不能用 → 回 null，交給一般自動挑票', t, null);
  }
  {
    /* 那堂沒有任何退回紀錄（不是重約，是全新的一堂）→ 不干預 */
    const fn=mk([{id:'x',ticket_id:'TK-4W',booking_id:'B-OLD',action:'deduct'}],CAND);
    const t=await fn(ME, BKS[1]);
    eq('★ 沒有淨退回（沒退過就不算重約）→ 回 null', t, null);
  }
  {
    /* 別天被退回的票不能拿來充數 */
    const fn=mk([{id:'y',ticket_id:'TK-OLD',booking_id:'B-ETC',action:'deduct'},
                 {id:'z',ticket_id:'TK-OLD',booking_id:'B-ETC',action:'refund'}],CAND);
    const t=await fn(ME, BKS[1]);
    eq('★ 只認同一天的退回（8/15 退的不算 8/8 的）', t, null);
  }
  {
    const fn=mk(LOGS,CAND);
    const t=await fn('M-2', BKS[1]);
    eq('　　別的會員不受影響（可用票清單裡沒有別人的票）', t, null);
  }

  console.log('\n② 接線');
/* 2026-08-29：中間插了一層「名額 i 用第 i 張票」——與名單視窗畫面上的預設一致
   （沒有它，畫面說名額2用姊姊那張、實際卻先進先出扣到媽媽那張）。
   重約回原票仍然排在它前面：那是更明確的意圖。 */
  ok('★ 團課加名單時排在「櫃檯指定」之後、「逐名額預設」之前，最後才是先進先出',
     /if\(!tk\) tk=await rebookSameDayTicket\(mid,b\);/.test(src)
     && /if\(_cand\.length\) tk=_cand\[Math\.min\(_i, _cand\.length-1\)\]\|\|null;/.test(src)
     && src.indexOf('tk=await rebookSameDayTicket(mid,b);') < src.indexOf('if(_cand.length) tk=_cand[Math.min(_i, _cand.length-1)]')
     && src.indexOf('if(_cand.length) tk=_cand[Math.min(_i, _cand.length-1)]') < src.indexOf('if(!tk) tk=await findUsableTicket(mid,b.ticket_type_id,b.date,b.start_time);'));
  ok('　　挑出來的仍要通過 listUsableTickets 的可用性檢查（不硬塞不能用的票）',
     /const cand=await listUsableTickets\(member_id,b\.ticket_type_id,b\.date,b\.start_time\);\n\s*return cand\.find\(t=>back\.indexOf\(t\.id\)>=0\) \|\| null;/.test(src));
  ok('　　整段包 try（讀不到帳本就當作沒有，照常走原本的挑票）',
     /\}catch\(_\)\{ return null; \}\n\}\nasync function findUsableTicket/.test(src));
  ok('　　成因寫在程式裡', /櫃檯把 8\/8 那堂整筆取消再重建/.test(src));

  console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
  process.exit(fail?1:0);
})();
