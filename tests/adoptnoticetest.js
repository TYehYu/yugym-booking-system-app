/* 未歸屬卡位提示與「納入既有卡位」視窗（2026-11-23，只改前端顯示；額度與資料庫規則不變）

   歸屬規則：只有 contract_id 明確指向某份合約的卡位才計入那份合約的占用；同會員同票種不代表歸屬。
   ・清單／提示都來自同一支 adoptUnassigned（與新票轉正整理的候選條件同一套）
   ・不預設勾選；沒有選取就不能送出；顯示「本次納入 k 堂、合約尚可排 X 堂」
   ・讀取失敗要明講，不可顯示成 0 筆
   ・提示不預測結果（結果以發放後「卡位整理」畫面的 dry-run 為準） */
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const TODAY=new Date(2026,10,23);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const ctx={TODAY,ymd,bkIsGroup:b=>!!(b&&b.category==='小班肌力')};
vm.createContext(ctx);
vm.runInContext(grabFn('adoptUnassigned')+'\nconst _adMd=b=>String(b.date).slice(5,10).replace("-","/");\n'+grabFn('adoptNoticeHtml'),ctx);
const B=(id,date,o)=>Object.assign({id,member_id:'M1',category:'私人教練',date,start_time:'10:00',status:'booked',pending_contract:true,ticket_id:null,contract_id:null,ticket_type_id:'tt_pt',sibling_of:null},o||{});

console.log('① 什麼算「未歸屬」');
{
  const bks=[B('U1','2026-12-01'),B('U2','2026-12-03'),
    B('E1','2026-11-20'),                                   // 日期已過（過期卡位）
    B('X1','2026-12-05',{status:'cancelled'}),B('L1','2026-12-06',{status:'coach_leave'}),
    B('O1','2026-12-07',{contract_id:'CT2'}),               // 已屬其他合約
    B('A1','2026-12-08',{contract_id:'CT1'}),               // 已歸屬這份合約（算占用，不算未歸屬）
    B('S1','2026-12-09',{sibling_of:'U1'}),B('G1','2026-12-10',{category:'小班肌力'}),
    B('T1','2026-12-11',{ticket_type_id:'tt_other'}),B('T2','2026-12-12',{ticket_id:'TK9',pending_contract:false}),
    B('M2','2026-12-13',{member_id:'M2'})];
  eq('★ 只有「同會員、同票種、待簽約、已預約、今天以後、沒綁任何合約」才算', ctx.adoptUnassigned(bks,'M1','tt_pt').map(b=>b.id), ['U1','U2']);
  ok('　　過期（日期已過）、取消、請假、已屬其他合約、已歸屬本合約、影子卡、團課、他種票、已轉正、別人的，全都不算',
     !ctx.adoptUnassigned(bks,'M1','tt_pt').some(b=>['E1','X1','L1','O1','A1','S1','G1','T1','T2','M2'].includes(b.id)));
  eq('　　沒指定票種時不限票種（建立合約後的詢問用合約的票種）', ctx.adoptUnassigned(bks,'M1',null).map(b=>b.id), ['U1','U2','T1']);
}

console.log('\n② 提示文字');
{
  const fail=ctx.adoptNoticeHtml({ok:false});
  ok('★ 讀取失敗：明講失敗、寫「不是 0 筆」，不顯示成沒有', /讀取失敗/.test(fail) && /不是 0 筆/.test(fail));
  eq('　　真的沒有未歸屬卡位 → 不顯示任何提示', ctx.adoptNoticeHtml({ok:true,cap:8,used:0,free:[]}), '');
  const free=[B('U1','2026-12-01'),B('U2','2026-12-03'),B('U3','2026-12-05')];
  const h=ctx.adoptNoticeHtml({ok:true,cap:8,used:2,free});
  ok('★ 8 堂合約已納入 2 筆 → 尚可排 6 堂', /合約 8 堂，已納入 2 堂，尚可排 6 堂/.test(h), h);
  ok('★ 寫出未歸屬筆數與日期，並說明不計入合約額度', /另有 3 筆未歸屬卡位/.test(h) && /12\/01、12\/03、12\/05/.test(h) && /不計入合約額度/.test(h));
  ok('★ 分行寫（不是塞成一段）：至少四行', (h.match(/<div>/g)||[]).length>=4, (h.match(/<div>/g)||[]).length);
  ok('★ 不預測結果：不寫「自動改用另一張票」，結果留給發放後的卡位整理畫面逐筆列出', !/自動改用/.test(h) && /卡位整理/.test(h) && /轉正／分期保留／先保留／取消／不動/.test(h));
  const many=Array.from({length:9},(_,i)=>B('Q'+i,'2026-12-'+String(10+i).padStart(2,'0')));
  ok('　　筆數多時日期只列前 6 個並寫總數', /等 9 筆/.test(ctx.adoptNoticeHtml({ok:true,cap:8,used:0,free:many})));
  ok('　　已納入超過合約堂數也不會出現負數', /尚可排 0 堂/.test(ctx.adoptNoticeHtml({ok:true,cap:8,used:9,free})));
}

console.log('\n③ 納入既有卡位視窗');
{
  const op=grabFn('_openAdoptHolds'), rc=grabFn('adoptRecheck'), sk=grabFn('adoptSkip');
  ok('★ 不預設勾選：只有已納入這份合約的列才勾（且 disabled），沒有「依額度自動勾前幾筆」', /\$\{mine\?'checked disabled':''\}/.test(op) && !/left-->0/.test(op) && !/checked \$\{on/.test(op));
  ok('★ 送出鈕一開始就是 disabled（沒選取不能送出）', /<button id="ad-go" class="btn btn-green" onclick="adoptRun\(\)" disabled>納入這份合約<\/button>/.test(op));
  ok('★ 尚未選取時顯示「本次納入 0 堂、合約尚可排 X 堂」', /尚未選取：本次納入 0 堂、合約尚可排 \$\{left\} 堂/.test(op) && /尚未選取：本次納入 0 堂、合約尚可排 '\+A\.left\+' 堂/.test(rc));
  ok('★ 選取後用 dry-run 結果：本次納入 k 堂、合約尚可排 X 堂（X＝伺服器算的 left_after）', /本次納入 <b>\$\{\(res\.would_adopt\|\|\[\]\)\.length\}<\/b> 堂、合約尚可排 <b>\$\{res\.left_after\}<\/b> 堂/.test(rc));
  ok('★ dry-run 讀取失敗：寫「檢查失敗」且按鈕不亮（不顯示成 0）', /檢查失敗（連線不穩）/.test(rc) && /if\(go\) go\.disabled=true;/.test(rc));
  ok('★ 快速連續勾選：只採用最新一次的檢查結果（舊的結果回來也不蓋掉）', /const my=\(A\._seq=\(A\._seq\|\|0\)\+1\);/.test(rc) && /A\._seq!==my\) return;/.test(rc));
  ok('★ 讀取合約或卡位失敗：明講「不是沒有卡位」，不開空視窗', /讀取合約或卡位失敗（不是「沒有卡位」）/.test(op) && /!Array\.isArray\(bks\)\|\|!\(cap>0\)/.test(op));
  ok('★ 「先不納入」：寫明這些卡位仍未歸屬、不計入額度，發放後在卡位整理逐筆確認', /仍未歸屬：不計入這份合約額度/.test(sk) && /onclick="adoptSkip\(\)"/.test(op));
  ok('　　建立合約後的詢問：讀取失敗不當成 0 筆', /讀取卡位失敗，無法確認有沒有未歸屬卡位（不是 0 筆）/.test(grabFn('adoptOfferAfterCreate')));
}

console.log('\n④ 三個地方的提示');
{
  ok('★ 收款／發放視窗有提示位，畫好後才讀', /<div id="ad-unassigned"><\/div>/.test(src) && /setTimeout\(\(\)=>\{ adoptNoticeFill\(r\); \},0\);/.test(src));
  ok('★ 建立預約表單（選了合約）：合約尚可排 X 堂＋另有 N 筆未歸屬卡位不計入', /'｜合約尚可排 '\+s\.contract\.left\+' 堂'/.test(src) && /'｜另有 '\+s\.contract\.unassigned\+' 筆未歸屬卡位，不計入這份合約'/.test(src));
  ok('★ 預約表單的額度來源不變：只扣已綁這份合約的預約（未歸屬的不被偷偷算進去）', /const used=allB\.filter\(x=>x\.contract_id===q\.cid&&x\.status!=='cancelled'\);/.test(src) && /const left=Math\.max\(0,Number\(c\.sessions\)-used\.length\);/.test(src));
  ok('★ 卡位整理確認畫面：「先保留（不取消，也沒有扣其他票）」與「不動」「分期保留」「取消」各自分列', /其他票券可承接 → 先保留（不取消，也沒有扣其他票）/.test(src) && /超出票券使用期間 → 不動/.test(src) && /合約內尚未繳費開通 → 分期待繳費保留/.test(src) && /超出票券總堂數 → 取消/.test(src));
  ok('★ 不寫成「自動改用另一張票」', /不會自動改用另一張票/.test(src) && !/自動改用另一張票[^，。]*承接/.test(src.replace(/不會自動改用另一張票/g,'')));
}
console.log('\n⑤ 合約占用與讀取失敗（Codex 補測 2026-11-23：占用與「可選清單」分開、讀不到合約不退回備用值）');
(async()=>{
  const D=n=>ymd(new Date(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate()+n));
  const mk=(fx)=>{
    const els={'ad-unassigned':{innerHTML:''}}, toasts=[], modals=[];
    const c2={TODAY,ymd,parseYmd:x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
      bkIsGroup:b=>!!(b&&b.category==='小班肌力'),isDeskLike:()=>true,window:{},
      document:{getElementById:id=>els[id]||null},
      dbGet:async(t,id)=>{ if(fx.contractThrows&&t==='contracts') throw new Error('x'); if(t==='contracts') return fx.contract===null?null:(fx.contract||null); return (fx[t]||[]).find(x=>x.id===id)||null; },
      dbGetAll:async(t)=>fx[t]||[], showToast:m=>toasts.push(String(m)), showModal:h=>modals.push(String(h)), adoptRecheck:()=>{}, escH:x=>String(x==null?'':x), onceAct:(k,f)=>f()};
    vm.createContext(c2);
    vm.runInContext(grabFn('adoptUnassigned')+'\nconst _adMd=b=>String(b.date).slice(5,10).replace("-","/");\n'+grabFn('adoptNoticeHtml')+'\nasync '+grabFn('adoptNoticeFill')+'\nasync '+grabFn('_openAdoptHolds'),c2);
    return {c2,els,toasts,modals};
  };
  const GR={id:'GR1',status:'pending',contract_id:'CT1',member_id:'M1',member_name:'甲',plan_name:'教練課 8 堂',sessions:8,payload:{plan:{ticket_type_id:'tt_pt'}}};
  const mkB=(id,n,o)=>B(id,D(n),o);
  // (1) 日期已過、未取消、仍綁合約的 2 筆：占用要算（尚可排 6），不能因為清單列不出來就算成 8
  {
    const fx={ticket_grant_requests:[GR],coaches:[],contract:{id:'CT1',member_id:'M1',sessions:8,ticket_type_id:'tt_pt'},
      bookings:[mkB('U1',3),mkB('U2',5),mkB('U3',7),mkB('P1',-5,{contract_id:'CT1'}),mkB('P2',-2,{contract_id:'CT1'})]};
    const t=mk(fx); await t.c2._openAdoptHolds('GR1');
    ok('★ 2 筆「日期已過、未取消、仍綁合約」：納入視窗初始顯示尚可排 6 堂（不是 8）', /尚未選取：本次納入 0 堂、合約尚可排 6 堂/.test(t.modals[0]||''), (t.modals[0]||'').slice(0,300));
    ok('　　清單只列選得到的（3 筆未歸屬）；日期已過的 2 筆不在清單，但視窗明講它們仍計入占用', (t.modals[0].match(/class="ad-ck"/g)||[]).length===3 && /已占用 <b>2<\/b> 堂，其中 2 堂不在下方清單（例如日期已過）/.test(t.modals[0]), t.modals[0].match(/class="ad-ck"/g));
    ok('　　window._adopt.left 與視窗一致（供後續檢查與送出使用）', t.c2.window._adopt && t.c2.window._adopt.left===6);
    const t2=mk(fx); await t2.c2.adoptNoticeFill(GR);
    ok('★ 收款視窗的提示與納入視窗同一個數字：尚可排 6 堂', /合約 8 堂，已納入 2 堂，尚可排 6 堂/.test(t2.els['ad-unassigned'].innerHTML), t2.els['ad-unassigned'].innerHTML.slice(0,200));
  }
  // (2) 取消的不占用；已轉正（有票）但仍綁合約的算占用（與伺服器相同）
  {
    const fx={ticket_grant_requests:[GR],coaches:[],contract:{id:'CT1',member_id:'M1',sessions:8,ticket_type_id:'tt_pt'},
      bookings:[mkB('U1',3),mkB('C1',9,{contract_id:'CT1',status:'cancelled'}),mkB('V1',10,{contract_id:'CT1',ticket_id:'TK9',pending_contract:false}),mkB('A1',12,{contract_id:'CT1'})]};
    const t=mk(fx); await t.c2._openAdoptHolds('GR1');
    ok('★ 取消的不占用、其餘（含已轉正）都占用：8 堂合約占 2 堂 → 尚可排 6 堂', /尚未選取：本次納入 0 堂、合約尚可排 6 堂/.test(t.modals[0]||''), (t.modals[0]||'').slice(0,200));
  }
  // (3) 合約讀不到（null／丟錯）：不得退回申請單的 sessions；兩個地方都明講失敗
  for (const [label,patch] of [['合約不存在（回 null）',{contract:null}],['讀取合約丟錯',{contractThrows:true}]]) {
    const fx=Object.assign({ticket_grant_requests:[GR],coaches:[],bookings:[mkB('U1',3),mkB('U2',5)]},patch);
    const t=mk(fx); await t.c2._openAdoptHolds('GR1');
    ok(`★ ${label}：納入視窗不開、提示讀取失敗（不是沒有卡位），沒有任何「尚可排」數字`, t.modals.length===0 && /讀取合約或卡位失敗/.test(t.toasts.join('|')) && !/尚可排/.test(t.toasts.join('|')), t.toasts);
    const t2=mk(fx); await t2.c2.adoptNoticeFill(GR); const h=t2.els['ad-unassigned'].innerHTML;
    ok(`★ ${label}：收款視窗提示改成「讀取失敗」，不用申請單的 8 堂當備用值、不顯示尚可排`, /讀取失敗/.test(h) && /不是 0 筆/.test(h) && !/尚可排/.test(h) && !/合約 8 堂/.test(h), h.slice(0,160));
  }
  // (4) 合約堂數為 0 或非數字也算讀不到
  {
    const fx={ticket_grant_requests:[GR],coaches:[],contract:{id:'CT1',member_id:'M1',sessions:null},bookings:[mkB('U1',3)]};
    const t2=mk(fx); await t2.c2.adoptNoticeFill(GR);
    ok('　　合約堂數是空值也當作讀不到（不退回申請單堂數）', /讀取失敗/.test(t2.els['ad-unassigned'].innerHTML) && !/尚可排/.test(t2.els['ad-unassigned'].innerHTML));
  }
  ok('　　程式碼裡納入視窗與提示都不再有「申請單 sessions 當備用」的寫法', !/const cap=\(c&&Number\(c\.sessions\)\)\|\|Number\(r\.sessions\)\|\|0;/.test(src) && (src.match(/const cap=c\?Number\(c\.sessions\):0;/g)||[]).length===2);
  console.log(fail?`\n✗ ${pass} 通過 / ${fail} 失敗`:`\n✓ ${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
