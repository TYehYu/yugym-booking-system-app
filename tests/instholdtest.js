/* 2026-08-04 使用者兩連報（徐千晴分期案例）：
   ①「8/20 應該是要繳分期、是有付費的一堂課，不應該紅框，應該要是驚嘆號」
   ②「這種分期的課程為什麼會出現超約的紅圈」

   ①資料面：8/1（第一期內）被取消退回後，後面的保留課不會自動遞補 —— 8/20 明明
     落在已繳的第一期卻掛著待收款紅框。8/20 已在正式庫補綁扣課；程式面補
     promoteHeldBooking：取消退回成功後，自動把同會員同票最早的保留課補綁。
   ②顯示面：分期未繳期的「待繳費保留」課被畫成超約紅虛線 —— 未開通堂數已由
     🔒 表達，保留課不進圓點。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

console.log('① 圓形卡：保留課不畫超約紅圈（實跑 ticketTokens）');
{
  const deps={ tkVisual:()=>({accent:'#1f6f54'}), bkIsSelf:()=>false, bkIsGroup:()=>false,
    grpSeatAttCount:()=>0, parseYmd, bkSelfBooked:()=>false, selfVenueLabel:()=>'' };
  const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));
  // 12 堂分期、開通 4：已上 1、已約 3；另外 7 筆待繳費保留（ticket_id 空）
  const T={id:'tk',sessions_total:12,unlocked_sessions:4,installment:{count:3}};
  const B=(id,d,st,hold)=>({id,date:d,status:st,ticket_id:hold?null:'tk',pending_contract:!!hold});
  const stamps=[B('a','2026-07-29','checked_in'),B('b','2026-08-06','booked'),B('c','2026-08-13','booked'),B('d','2026-08-20','booked'),
    B('h1','2026-08-27','booked',1),B('h2','2026-09-10','booked',1),B('h3','2026-09-17','booked',1),
    B('h4','2026-09-24','booked',1),B('h5','2026-10-01','booked',1),B('h6','2026-10-08','booked',1),B('h7','2026-10-15','booked',1)];
  const h=TT(T,stamps,{},1,'b','M',null);
  eq('★ 沒有任何超約紅圈（保留課不進圓點）', (h.match(/mtk-over/g)||[]).length, 0);
  eq('★ 未開通 8 格全是鎖頭', (h.match(/mtk-lock/g)||[]).length, 8);
  ok('★ 已上 1＋已約 3 照畫', (h.match(/mtk-used/g)||[]).length===1 && (h.match(/mtk-booked/g)||[]).length===3);
  ok('　　真正的超約（無票可對應且非保留）仍畫紅圈',
     /mtk-over/.test(TT({id:'tk2',sessions_total:1},[B('x','2026-08-01','booked'),B('y','2026-08-08','booked')],{},1,null,'M',null)));
}

console.log('\n② 取消退回 → 保留課自動遞補');
ok('★ cancelBooking 退回成功後呼叫 promoteHeldBooking',
   /if\(refundedCount>0 && b\.ticket_id && b\.member_id\)\{\n\s*try\{ await promoteHeldBooking\(b\.member_id, b\.ticket_id\); \}/.test(src));
ok('★ 前提：開通段還有多出的額度（used<unlocked 且 remain>0）',
   /if\(used>=unlocked \|\| remain<=0\) return;   \/\/ 開通段沒有多出的額度/.test(src));
ok('★ 挑同會員同課種最早的保留課、補綁＋扣課＋清旗標',
   /x\.member_id===memberId && x\.pending_contract && !x\.ticket_id/.test(src)
   && /hb\.ticket_id=ticketId; hb\.ticket_type_id=tk\.ticket_type_id\|\|hb\.ticket_type_id\|\|null;\n\s*hb\.pending_contract=false;/.test(src));
ok('　　案例寫在程式裡', /8\/1 取消了，8\/20 明明\n\s*落在已繳的第一期卻繼續掛紅框待收款/.test(src));

console.log('\n③ 預約流程的「待分期」選項（2026-08-04 使用者指示：「後面第五堂同一時間點預約，\n   應該除了待簽約還有待分期的選項，這樣才可以接上原本前面四堂課的票券」）');
ok('★ 會員有未開通的分期票（票種吻合）→ 步驟 2 多一顆「待分期繳費保留」',
   /x\.installment && typeof x\.installment==='object'\n\s*&& \(Number\(x\.sessions_total\)\|\|0\)-\(Number\(x\.unlocked_sessions\)\|\|0\)>0\n\s*&& bkTicketTypeOk\(x, type_id\)/.test(src)
   && /onclick="bkInstHold\(\)">⏳ 待分期繳費保留（接上分期票）<\/button>/.test(src));
ok('★ 建立走 runRecurringBooking 的保留路徑（findTicketFn 回 null → holdOnly）',
   /async function _bkInstHold\(\)\{/.test(src) && /findTicketFn:async\(\)=>null,/.test(src));
ok('★ 防連點', /async function bkInstHold\(\)\{ return onceAct\('bkinsthold', _bkInstHold\); \}/.test(src));
ok('★ 待簽約卡位選項仍在（沒分期票的客人用）', /onclick="openPendingHold\(\)">🕒 待簽約卡位（客人尚未購票）<\/button>/.test(src));
ok('　　說明講清楚收款後自動補綁', /收到下一期款項、在票券卡按「開通下一期」後會自動補綁扣課。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
