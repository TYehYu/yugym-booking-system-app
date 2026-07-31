/* 教練請假 → 幫會員展延票券效期（2026-07-31 使用者定案）

   「因為我們的課程有使用期限，如果遇到教練請假，應該要幫客人展延期限。」
   定案：每被請假一堂，效期往後推 7 天（一週一堂的節奏，對得上實際損失）。

   原本的教練請假流程：課卡保留（status=coach_leave）＋退回 1 堂票＋通知會員。
   這次在退票之後補上展延，順序不能反 —— refundTicket 有可能把效期退回未開通
   （expire_date 變 null），那種情況沒有效期可延。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 實跑 extendForCoachLeave：把 dbGet/dbPut/logTicket 換成假的 */
function mk(tk){
  const saved=[], logs=[];
  const fn=new Function('dbGet','dbPut','logTicket','parseYmd','ymd','TODAY',
    'const COACH_LEAVE_EXTEND_DAYS=7;\n'+g('async function extendForCoachLeave(ticket_id, booking, operator){','\n}\n')
    +'\nreturn extendForCoachLeave;')(
    async()=>tk?Object.assign({},tk):null,
    async(_t,o)=>{ saved.push(o); },
    async(...a)=>{ logs.push(a); },
    ds=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(ds||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
    d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());},
    new Date(2026,6,31));   // TODAY：沒帶 booking.date 時備註會用今天
  return {fn, saved, logs};
}

(async()=>{
console.log('展延天數');
{
  const a=mk({id:'T1',expire_date:'2026-09-30'});
  eq('★ 9/30 ＋7 天 → 10/07', await a.fn('T1',{id:'B1',date:'2026-08-05'},'U'), '2026-10-07');
  eq('　　票券真的被寫回去', a.saved[0].expire_date, '2026-10-07');

  const b=mk({id:'T1',expire_date:'2026-10-07'});
  eq('★ 再請假一堂就再 ＋7（連續請假會累加）', await b.fn('T1',{id:'B2',date:'2026-08-12'},'U'), '2026-10-14');

  const c=mk({id:'T1',expire_date:'2026-12-28'});
  eq('　　跨月、跨年都算得對', await c.fn('T1',{},'U'), '2027-01-04');
  const d=mk({id:'T1',expire_date:'2026-02-25'});
  eq('　　二月也算得對', await d.fn('T1',{},'U'), '2026-03-04');
  ok('★ 天數是常數，日後要改只改一個地方', /const COACH_LEAVE_EXTEND_DAYS=7;/.test(src));
}

console.log('\n什麼情況不延');
{
  eq('★ 永久有效（沒有到期日）→ 不延', await mk({id:'T1',expire_date:null}).fn('T1',{},'U'), null);
  eq('★ 退票時效期被退回未開通（expire_date 變 null）→ 不延',
     await mk({id:'T1',expire_date:''}).fn('T1',{},'U'), null);
  eq('　　找不到票 → 不延，也不會爆', await mk(null).fn('T1',{},'U'), null);
  eq('　　到期日格式壞掉 → 不延', await mk({id:'T1',expire_date:'—'}).fn('T1',{},'U'), null);
}

console.log('\n留下紀錄');
{
  const a=mk({id:'T1',expire_date:'2026-09-30',note:'舊備註'});
  await a.fn('T1',{id:'B1',date:'2026-08-05'},'EMP1');
  ok('★ 票券備註寫一行，原本的備註不覆蓋',
     /^舊備註\n2026-08-05 教練請假展延 7 天（2026\/09\/30 → 2026\/10\/07）$/.test(a.saved[0].note), a.saved[0].note);
  const b=mk({id:'T1',expire_date:'2026-09-30'});
  await b.fn('T1',{id:'B1',date:'2026-08-05'},'EMP1');
  ok('　　原本沒備註時不會多一個空行', !/^\n/.test(b.saved[0].note));
  const L=b.logs[0];
  ok('★ 帳本記一筆 adjust、delta 0（不動堂數，只記效期）', L[1]==='adjust' && L[2]===0);
  ok('★ 帳本帶得到是哪一筆預約、誰做的', L[3]==='B1' && L[4]==='EMP1');
  ok('　　帳本說明與票券備註同一句', L[5]===b.saved[0].note);
  ok('　　用 adjust（ticket_log_action 既有的值，不必動 enum）', /logTicket\(ticket_id,'adjust',0,/.test(src));
}

console.log('\n接進教練請假流程');
ok('★ 排在退票之後（退票可能把效期退回未開通）',
   src.indexOf('leaveRefunded = (await refundLegacyBooking(b,SESSION.id))>0;')
   < src.indexOf('for(const tid of ids){ const to=await extendForCoachLeave(tid,b,SESSION.id); if(to) extendTo=to; }'));
ok('★ 沒退成票就不延', /if\(leaveRefunded\)\{\s*\n\s*let ids=b\.ticket_id\?\[b\.ticket_id\]:\[\];/.test(src));
ok('★ 有 ticket_id 就延那張', /let ids=b\.ticket_id\?\[b\.ticket_id\]:\[\];/.test(src));
ok('★ 舊預約走 fallback 退的，從剛寫進去的 refund 帳本回查（團課可能一次退好幾人）',
   /sb\.from\('ticket_logs'\)\.select\('ticket_id'\)\.eq\('booking_id',b\.id\)\.eq\('action','refund'\)/.test(src)
   && /ids=\[\.\.\.new Set\(\(q\.data\|\|\[\]\)\.map\(r=>r\.ticket_id\)\.filter\(Boolean\)\)\]/.test(src));
ok('★ 通知會員時講出新的期限', /，使用期限延長至 \$\{extendTo\.replace\(\/-\/g,'\/'\)\}/.test(src));
ok('★ 櫃檯的提示也講出新的期限', /效期延至 \$\{extendTo\.replace\(\/-\/g,'\/'\)\}/.test(src));
ok('　　展延失敗不會拖垮整個請假流程（整段包 try）', /\}catch\(_\)\{ return null; \}/.test(src));
ok('　　原因寫在程式裡', /教練請假等於白白吃掉會員一週的名額，時間要還給他/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
