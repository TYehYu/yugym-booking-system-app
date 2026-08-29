/* 今日收款提醒：還有課可以上就不要叫櫃檯收款（2026-08-29 使用者回報，附截圖）

   「這個收款提醒不夠謹慎　游昌憲還有其他教練課方案可以使用　今日不應該跳收款提醒」

   正式庫的形狀（游昌憲 8/29 11:00）：
     ・七張「私人教練課 1V2」，sessions_remaining **全部都是 0**
     ・但 9/05、9/12 還掛在 MTK-18140AA9A761（2 堂）上，都還沒上
     ・9/19 之後那幾堂 ticket_id 是空的 —— 那才是真的還沒收到錢的

   關鍵：sessions_remaining 是**預約當下**就扣的，不是上完才扣。
   所以「還有沒有課可以上」不能只看餘額，要看「之後還有沒有已付款的課」。
   （團課那條 0730 就有這個條件了 —— _futGrpByMem；教練課一直沒接上。） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 規則寫在原地');
{
  ok('★★ 教練課也有「之後還有已付款的課」這個索引（原本只有團課有）',
     /const _futPtByMem=\{\};/.test(src)
     && /if\(b\.category!=='私人教練' \|\| b\.status==='cancelled' \|\| !b\.ticket_id\) return;/.test(src));
  ok('★★★ 只認有 ticket_id 的未來預約 —— 沒扣到票的那幾堂正是要收款的理由',
     /只認有 ticket_id 的未來預約：他 9\/19 之後那幾堂 ticket_id 是空的（還沒扣到票），\s*\n\s*那種正是要收款的理由，不能反過來當成「不用收款」。/.test(src));
  ok('★★ 續課才擋，分期繳費不擋（那筆錢本來就到期了）',
     /if\(kind==='renew'\)\{\s*\n\s*const _left=\(\(_memGrpLeft\[mid\]\|\|\{\}\)\[g\]\)\|\|0;\s*\n\s*const _fut=isGrp\?\(_futGrpByMem\[mid\]\|\|0\):\(_futPtByMem\[mid\]\|\|0\);\s*\n\s*if\(_left>0 \|\| _fut>0\) return;\s*\n\s*\}/.test(src));
  ok('★★ 「餘額是預約當下就扣的」寫在原地（下次不要又只看 sessions_remaining）',
     /sessions_remaining 是\*\*預約當下\*\*就扣的、不是上完才扣/.test(src));
  ok('★ 會員層的剩餘改吃 tkUnlockedLeft（分期沒開通的那幾堂今天用不到）',
     /const rem=Math\.max\(0,tkUnlockedLeft\(tk\)\);/.test(src));
}

console.log('\n② 實跑：把游昌憲那一天的形狀丟進去');
{
  /* 只切「決定誰進名單」那一段：從 _futPtByMem 到 _signBy 的 forEach 結束 */
  const i=src.indexOf('  const _futPtByMem={};');
  const j=src.indexOf('  /* 續約狀態：已續約＝這筆預約已被標為「已續約」', i);
  if(i<0||j<0) throw new Error('切不到收款提醒那一段');
  const body=src.slice(i,j);
  const run=(bookings, opts)=>new Function('bookings','date','memMap','_lastBk','_memGrpLeft',
      '_futGrpByMem','bkIsGroup', body+'\nreturn Object.values(_signBy).map(e=>e.name);')(
    bookings, opts.date, opts.memMap, opts._lastBk||{}, opts._memGrpLeft||{},
    opts._futGrpByMem||{}, b=>b.category==='小班肌力');

  const D='2026-08-29';
  const MM={M1:{name:'游昌憲'}, M2:{name:'真的最後一堂'}};
  const today=(mid,o)=>Object.assign({id:'bk-today-'+mid, date:D, start_time:'11:00',
    status:'checked_in', category:'私人教練', member_id:mid, ticket_id:'TK-a'},o||{});
  const fut=(mid,d,tk)=>({id:'bk-'+mid+'-'+d, date:d, start_time:'11:00', status:'booked',
    category:'私人教練', member_id:mid, ticket_id:tk||null});

  eq('★★★ 游昌憲：今天是某張票的最後一堂，但 9/05、9/12 已付款 → 不進名單',
     run([today('M1'), fut('M1','2026-09-05','TK-b'), fut('M1','2026-09-12','TK-b'),
          fut('M1','2026-09-19',null), fut('M1','2026-09-26',null)],
         {date:D, memMap:MM, _lastBk:{'bk-today-M1':'renew'}}),
     []);
  eq('★★★ 真的沒有下一堂 → 照樣提醒（不能因為修這個 bug 把該收的錢也擋掉）',
     run([today('M2')], {date:D, memMap:MM, _lastBk:{'bk-today-M2':'renew'}}),
     ['真的最後一堂']);
  eq('★★★ 之後那幾堂都沒扣到票（ticket_id 空）→ 照樣提醒',
     run([today('M2'), fut('M2','2026-09-05',null), fut('M2','2026-09-12',null)],
         {date:D, memMap:MM, _lastBk:{'bk-today-M2':'renew'}}),
     ['真的最後一堂']);
  eq('★★ 取消掉的未來預約不算數',
     run([today('M2'), Object.assign(fut('M2','2026-09-05','TK-b'),{status:'cancelled'})],
         {date:D, memMap:MM, _lastBk:{'bk-today-M2':'renew'}}),
     ['真的最後一堂']);
  eq('★★ 手上還有沒排的堂數（_memGrpLeft）也算「還有課可以上」',
     run([today('M2')], {date:D, memMap:MM, _lastBk:{'bk-today-M2':'renew'},
         _memGrpLeft:{M2:{pt:3}}}),
     []);
  eq('★★★ 分期繳費不受影響 —— 那筆錢到期了，手上有沒有別的堂數是另一回事',
     run([today('M1'), fut('M1','2026-09-05','TK-b')],
         {date:D, memMap:MM, _lastBk:{'bk-today-M1':'install'}}),
     ['游昌憲']);
  eq('　 今天以前／以後的課不會被當成「今天」',
     run([Object.assign(today('M2'),{date:'2026-08-28'})],
         {date:D, memMap:MM, _lastBk:{'bk-today-M2':'renew'}}),
     []);
}

console.log('\n③ 團課那條沒被動到');
{
  ok('★★ 團課仍用「餘額 0 且今天之後沒有團課預約」判定',
     /const left=\(\(_memGrpLeft\[mid\]\|\|\{\}\)\.grp\)\|\|0;\s*\n\s*if\(left===0 && !\(_futGrpByMem\[mid\]>0\)\) kind='renew';/.test(src));
  ok('★★ 團課的未來預約不看 ticket_id（團課本來就不寫）',
     /團課那條（_futGrpByMem）維持原樣不加這個條件：團課預約本來就不寫 ticket_id。/.test(src)
     && /if\(b\.category!=='小班肌力' \|\| b\.status==='cancelled'\) return;/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
