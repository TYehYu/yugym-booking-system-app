/* 2026-08-06 票券規則稽核的第 1、4 項（docs/票券規則稽核-20260806.md）：

   R4 推算每次重算 → 加「推算切分日」：切分日之後建立的預約不再參與先進先出推算，
      一律要有事實可讀（單人課綁 ticket_id、團課寫扣課紀錄），猜不到就明白顯示需補票。
   R2 帳面與戳記兩套口徑並存 → 加對帳巡檢：四個數字對不上就在票券卡掛 ⚠、
      並在票券管理頁的巡檢視窗列出來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i,src.indexOf('\n',i));};

console.log('① 推算切分日（R4）');
{
  /* 2026-08-06：inferAllowed 多了總開關與探針 → 沙箱補上（都關著＝照舊推算） */
  const fn=new Function('let INFER_OFF=false; const window={};\n'+grabConst('INFER_CUTOFF_UTC')+'\n'+grabFn('inferAllowed')+'\nreturn inferAllowed;')();
  /* 2026-08-07：總開關已經關掉（③ 退場）。上面的沙箱把它設回 false 是為了驗切分日的邏輯本身；
     下面這一項驗的是「線上真的關了」。 */
  ok('★★ 推算已正式關閉（INFER_OFF=true）',
     /let INFER_OFF=true;/.test(src)
     && /③ 先進先出推算正式退場/.test(src));
  ok('　　關閉前的三道前置作業寫在程式裡（固化／補讀／比對）',
     /① 固化：把當時推算出來的歸屬寫成 532 筆連結/.test(src)
     && /② 補讀：非團課的預約也改從 ticket_logs 讀歸屬/.test(src)
     && /③ 比對：對 461 位會員各算兩次票券夾/.test(src));
  ok('　　要退回舊行為的方法也寫著', /要臨時退回舊行為就把這裡改回 false/.test(src));
  ok('★ 切分日以前建立的（7 月匯入的未來課）仍照舊推算',
     fn({created_at:'2026-07-26T08:44:21.969059+00:00'})===true);
  ok('★ 切分日之後建立的不再推算（猜不到就顯示需補票）',
     fn({created_at:'2026-08-07T02:00:00+00:00'})===false);
  ok('★ 沒有建立時間的舊資料一律當舊資料（照舊推算）', fn({})===true);
  ok('　　切分線是台北時間 8/07 00:00（＝UTC 8/06 16:00）',
     fn({created_at:'2026-08-06T15:59:00'})===true && fn({created_at:'2026-08-06T16:00:01'})===false);
  ok('★ 比的是 created_at 不是上課日（否則 7 月匯入的 8 月課會整片變成需補票）',
     /const c=b&&b\.created_at;/.test(src) && /比的是 created_at（資料進系統的時間）不是 date（上課日）/.test(src));
  ok('★ 接在③先進先出那一段（①直連②扣課紀錄不受影響）',
     /const rest=live\.filter\(b=>!byBooking\[b\.id\] && inferAllowed\(b\)\);/.test(src));
  ok('　　設成空字串可退回舊行為（緊急開關）', /設成空字串＝退回舊行為（全部都猜）/.test(src));
}

console.log('\n② 對帳旗標（R2）');
{
  const fn=new Function(grabConst('TK_AUDIT_SINCE')+'\n'+grabFn('tkLedgerAuditable')+'\n'+grabFn('tkAuditFlags')
    +'\nreturn tkAuditFlags;')();
  const NEW={id:'T1',purchase_date:'2026-08-05',sessions_total:4,sessions_remaining:1,status:'usable'};
  const OLD={id:'T2',purchase_date:'2026-05-23',sessions_total:4,sessions_remaining:1,status:'usable'};
  eq('★ 帳面已用 3、帳目也是 3 → 沒事', fn(NEW,{net:3}).length, 0);
  eq('★ 帳面已用 3、帳目卻是 2 → 標出來',
     fn(NEW,{net:2}).map(x=>x.k), ['ledger']);
  eq('★ 基準日之前的舊匯入票不做這種軟性比對（全庫 152 張，標了只是雜訊）',
     fn(OLD,{net:2}).length, 0);
  eq('★ 餘額負數 → 所有票都標（數字本身不可能）',
     fn({id:'T3',purchase_date:'2026-01-01',sessions_total:4,sessions_remaining:-1}).map(x=>x.k), ['neg']);
  eq('★ 餘額大於總堂數 → 所有票都標',
     fn({id:'T4',purchase_date:'2026-01-01',sessions_total:4,sessions_remaining:6}).map(x=>x.k), ['over']);
  eq('★ 排的課比堂數多 → 所有票都標',
     fn({id:'T5',purchase_date:'2026-01-01',sessions_total:4,sessions_remaining:4},{cnt:5}).map(x=>x.k), ['overbook']);
  eq('　　作廢的票不比（本來就歸零）', fn({id:'T6',status:'refunded',sessions_total:4,sessions_remaining:0},{net:9}).length, 0);
  eq('　　沒有總堂數的舊票只做餘額檢查', fn({id:'T7',purchase_date:'2026-08-05',sessions_total:0,sessions_remaining:2},{net:9}).length, 0);
}

console.log('\n③ 接線');
ok('★ 票券卡掛 ⚠ 對帳徽章（規則與巡檢同一支）',
   /const f=tkAuditFlags\(t,\{net:_netTk\[t\.id\], used\}\);/.test(src)
   && /return f\.length\?`<span class="tk-audit" title="對帳不一致：/.test(src)
   && /\.tk-audit\{display:inline-flex;/.test(src));
ok('★ 巡檢視窗的 ②③④ 也走同一支（不再自己算一遍）',
   /tkAuditFlags\(t,\{net:netTk\[t\.id\], cnt:_cnt\[t\.id\]\}\)\.forEach\(x=>\{/.test(src));
ok('★ 巡檢改名「票券對帳巡檢」（不只團課）',
   /onclick="openGrpAudit\(\)">🔍 票券對帳巡檢<\/button>/.test(src)
   && /<div class="modal-title">票券對帳巡檢<\/div>/.test(src));
ok('　　四段標題都在', /① 名額與扣課對不上/.test(src) && /② 票面餘額與帳目對不上/.test(src)
   && /③ 餘額數字本身不合理/.test(src) && /④ 排的課比票的堂數多/.test(src));
ok('　　全部對齊時給明確的綠字',
   /✓ 全部對齊：名額、扣課、票面餘額與排課數都一致。/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
