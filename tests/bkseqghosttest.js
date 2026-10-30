/* 「第幾堂／共幾堂」：用掉了卻沒有課卡的那幾堂（2026-10-31）

   使用者回報：「課表上顯示 40/48 但吳宥伯其實這一堂是 48/48 最後一堂」

   實查（MTK-C79C8B3C07B0，私人教練課 1V2，48 堂，餘額 0）：
     ・綁得到的課卡只有 40 張（2026-01-02 ～ 2026-11-05）
     ・帳本上有一筆 adjust delta 0：
       「票券校正：補登使用日期 2025-10-10、2025-10-24、2025-10-31、2025-11-07、
         2025-11-21、2025-12-05、2025-12-19、2025-12-26（無課卡，僅圓形卡標示）」
       —— 正好 8 堂，48−40＝8。

   那 8 堂是舊系統時代用掉的，bookings 裡根本沒有那幾列，
   所以 _bkSeq 只數得到 40 張卡、從 1 編到 40，最後一堂就變成 40/48。

   修法：用「票上總共用掉幾堂」減「數得到的課卡數」當前置偏移。
   ⚠ 夾在 0 以上 —— 反過來（課卡比扣款多＝「有綁沒扣」）不要變成負的，
     那是另一個問題，不該用編號去掩蓋。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{const i=src.indexOf('function '+n+'(');let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* computeLastBkMarks 後半段還算續課提醒（要 tkRenewGroup／tkOwesMoney…），
   這支測的是前半段的 _bkSeq，所以只把那一段切出來跑 ——
   切點用原始碼裡的兩個固定標記，不是抄一份（抄一份就會跟本體漂掉）。 */
const WHOLE=grab('computeLastBkMarks');
const SEG=WHOLE.slice(WHOLE.indexOf('const _bkByTk={};'), WHOLE.indexOf('const _newestBuy={};'));
const env={ window:{}, bkLeaveRefunded:b=>!!b&&b.coach_leave===true&&(b.status==='checked_in'||b.status==='completed') };
const fn=new Function(...Object.keys(env),
  'return function(allTickets, bookings, typeMap){'+SEG+'\nreturn window._bkSeq;};')(...Object.values(env));

const bk=(id,date,o)=>Object.assign({id,date,start_time:'20:00',ticket_id:'T1',status:'checked_in'},o||{});
const run=(tk,bks)=>fn([tk], bks, {});

console.log('① 吳宥伯那張票（48 堂、40 張卡、8 堂沒卡）');
{
  const bks=[]; for(let i=1;i<=40;i++) bks.push(bk('B'+i,'2026-'+String(Math.ceil(i/4)).padStart(2,'0')+'-'+String((i%28)+1).padStart(2,'0')));
  const seq=run({id:'T1',sessions_total:48,sessions_remaining:0}, bks);
  const sorted=bks.slice().sort((x,y)=>(x.date+x.start_time).localeCompare(y.date+y.start_time));
  eq('★★★ 第一張卡是第 9 堂（前面 8 堂沒有卡）', seq[sorted[0].id], {i:9,n:48});
  eq('★★★ 最後一張卡是 48/48，不是 40/48', seq[sorted[39].id], {i:48,n:48});
}

console.log('\n② 正常的票不受影響');
{
  const bks=[bk('A','2026-03-01'),bk('B','2026-03-08'),bk('C','2026-03-15')];
  const seq=run({id:'T1',sessions_total:8,sessions_remaining:5}, bks);
  eq('★★★ 用掉 3、課卡 3 → 照樣 1、2、3',
     [seq.A.i,seq.B.i,seq.C.i,seq.A.n], [1,2,3,8]);
}

console.log('\n③ 反過來（課卡比扣款多＝「有綁沒扣」）不可以變成負的');
{
  const bks=[bk('A','2026-03-01'),bk('B','2026-03-08'),bk('C','2026-03-15')];
  const seq=run({id:'T1',sessions_total:8,sessions_remaining:7}, bks);   // 用掉 1、卡有 3
  eq('★★★ 夾在 0 以上，編號維持 1、2、3', [seq.A.i,seq.B.i,seq.C.i], [1,2,3]);
}

console.log('\n④ 餘額是空的（舊資料）不要算出 NaN');
{
  const bks=[bk('A','2026-03-01'),bk('B','2026-03-08')];
  const seq=run({id:'T1',sessions_total:8,sessions_remaining:null}, bks);
  eq('★★ 退回原本的 1、2', [seq.A.i,seq.B.i,seq.A.n], [1,2,8]);
}

console.log('\n⑤ 教練請假退堂那一格仍然不算（2026-08-30 定的，別被這次改動弄丟）');
{
  const bks=[bk('A','2026-03-01'),bk('L','2026-03-08',{coach_leave:true}),bk('B','2026-03-15')];
  const seq=run({id:'T1',sessions_total:8,sessions_remaining:6}, bks);
  ok('★★★ 請假退堂的那一筆沒有編號', !seq.L);
  eq('★★★ 後面那堂是第 2 堂，不是第 3 堂', seq.B.i, 2);
}

console.log('\n⑥ 偏移只動顯示，續課提醒是另一套');
ok('★★ 註解寫明不吃這個偏移（兩邊都改會變成同一件事修兩次）',
   /續課提醒（_renewLastBk）是下面另一套算法，\s*\n\s*不吃這個偏移/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
