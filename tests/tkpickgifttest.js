/* 2026-08-07 兩件事：

   ① 使用者指示：「加上付費票優先的規則」——
      楊采妮 4/26 同一天建立兩張：24 堂 $38,400 與 3 堂加贈（$0），系統卻先吃了加贈那張，
      害得付費的票留著、加贈的先用完。同一天買的，付費的要先用。

   ② 使用者回報：「9/7 在預約明細用更換票券想換到 #8，出現失敗」——
      08-06 修過同一個案例（鄭超元 9/7），但只修了「開視窗列清單」那一半；
      按下去執行的 _doBkTicketChange 還在用可能是空的 b.ticket_type_id 去比對票種，
      於是清單選得到、按下去卻說「這張票券已不能用於這堂課」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 什麼算「加贈票」（不能只看金額 0）');
{
  const fn=new Function(grabFn('tkIsGift')+'\nreturn tkIsGift;')();
  ok('★★ 金額 0 ＋ 備註寫加贈 → 是加贈', fn({amount_paid:0, note:'隨 私人教練課 1V1 24 堂（$38,400） 加贈'})===true);
  ok('★★ 金額 0 但備註是「舊系統匯入，未帶收款金額」→ 不是加贈（不能延後使用）',
     fn({amount_paid:0, note:'舊系統匯入，未帶收款金額'})===false);
  ok('★★ 金額 0 但「金額待確認」→ 也不是加贈', fn({amount_paid:0, note:'金額待確認（購買當日查無收款紀錄）'})===false);
  ok('　　金額 0 又沒備註 → 不當加贈（寧可照原順序）', fn({amount_paid:0, note:null})===false);
  ok('　　有金額就一定不是加贈（即使備註提到加贈）', fn({amount_paid:38400, note:'含加贈'})===false);
  ok('　　空值不會爆', fn(null)===false && fn({})===false);
  ok('★ 判準與票券卡的「$0・加贈」同一套', /const gift=\/加贈\/\.test\(n\), wait=\/待確認\/\.test\(n\);/.test(src));
}

console.log('\n② 挑票排序：同一天買的，付費先用');
{
  const sortSrc=/\.sort\(\(a,b\)=>\{[\s\S]*?\n    \}\);/.exec(grabFn('listUsableTickets'))[0];
  const box=new Function('tkIsTimeRestricted','tkIsGift','parseYmd','TODAY',
    'return function(list){ return list'+sortSrc+'; };')(
    ()=>false, new Function(grabFn('tkIsGift')+'\nreturn tkIsGift;')(),
    x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
    new Date(2026,7,7));
  const PAID={id:'PAID',purchase_date:'2026-04-26',amount_paid:38400,note:null,created_at:'2026-04-26T01:00:00Z'};
  const GIFT={id:'GIFT',purchase_date:'2026-04-26',amount_paid:0,note:'隨 私人教練課 1V1 24 堂 加贈',created_at:'2026-04-26T00:00:00Z'};
  eq('★★ 同一天買：付費的排前面（即使加贈那張建立時間更早）',
     box([GIFT,PAID]).map(t=>t.id), ['PAID','GIFT']);
  eq('　　反過來放也一樣', box([PAID,GIFT]).map(t=>t.id), ['PAID','GIFT']);

  const OLDGIFT={id:'OLDGIFT',purchase_date:'2026-01-01',amount_paid:0,note:'加贈',created_at:'2026-01-01T00:00:00Z'};
  eq('★ 跨日期仍照購買順序先進先出（不因為是加贈就跳過早買的那張）',
     box([PAID,OLDGIFT]).map(t=>t.id), ['OLDGIFT','PAID']);

  const SOON={id:'SOON',purchase_date:'2026-08-01',expire_date:'2026-08-20',amount_paid:1600,note:null,created_at:'2026-08-01T00:00:00Z'};
  eq('★ 30 天內到期的仍然最優先（加贈規則不會讓快過期的票被放到過期）',
     box([PAID,SOON]).map(t=>t.id), ['SOON','PAID']);
}

console.log('\n③ 更換票券：列清單與執行要用同一個票種');
{
  const run=grabFn('_doBkTicketChange');
  ok('★★ 執行時也退回「目前扣的那張票」的票種（課卡沒記課種時）',
     /const _curTk=b\.ticket_id\?await dbGet\('member_tickets',b\.ticket_id\)\.catch\(\(\)=>null\):null;/.test(run)
     && /const _typeId=b\.ticket_type_id\|\|\(_curTk&&_curTk\.ticket_type_id\)\|\|null;/.test(run)
     && /const cand=await listUsableTickets\(b\.member_id,_typeId,b\.date,b\.start_time\);/.test(run));
  ok('★ 開視窗那一半本來就修過（08-06），兩邊現在一致',
     /const _typeId=b\.ticket_type_id\|\|\(cur&&cur\.ticket_type_id\)\|\|null;/.test(grabFn('openBkTicketChange')));
  ok('★ 換成功會把課種補寫回課卡（下次就不會再空著）',
     /b\.ticket_id=tk\.id; b\.ticket_type_id=tk\.ticket_type_id\|\|b\.ticket_type_id;/.test(run));
  ok('　　新票沒扣到就整筆放棄（既有防線）',
     /if\(!\(await deductTicket\(tk,b\.id,SESSION\.id\)\)\)\{ showToast\('這張票券已無剩餘堂數，未更換'\); return; \}/.test(run));
  ok('　　為什麼會失敗，寫在程式裡', /清單裡選得到 #8，按下去卻說「已不能用」/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
