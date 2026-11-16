/* 教練請假 → 幫會員展延票券效期（2026-07-31 使用者定案）

   「因為我們的課程有使用期限，如果遇到教練請假，應該要幫客人展延期限。」
   定案（2026-11 改版）：同一會員、同一張票、同一個週一～週日自然週最多延 7 天；不同週累加；
   同週全部有效請假撤銷後撤回該週 7 天。寫入一律由資料庫 RPC fn_coach_leave_comp 原子完成，
   前端 extendForCoachLeave 只是 RPC 的包裝（沒有先讀後寫）。

   原本的教練請假流程：課卡保留（status=coach_leave）＋退回 1 堂票＋通知會員。
   這次在退票之後補上展延，順序不能反 —— refundTicket 有可能把效期退回未開通
   （expire_date 變 null），那種情況沒有效期可延。 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 實跑 extendForCoachLeave：把 sb.rpc 換成假的（記下呼叫參數、回傳預先排好的結果）。
   沙箱裡刻意不提供 dbGet／dbPut／logTicket——前端若還在先讀後寫，呼叫就會丟錯、結果變 null。 */
function mk(rpcRes){
  const calls=[]; let cleared=null;
  const sbf={ rpc: async(name,args)=>{ calls.push({name,args}); if(rpcRes instanceof Error) throw rpcRes; return rpcRes; } };
  const fn=new Function('sb','CLOUD','dbCacheClear','parseYmd','ymd','dbGetAll',
    'const COACH_LEAVE_EXTEND_DAYS=7;\n'
    +g('function leaveWeekKey(dstr){','\n}\n')
    +g('function leaveExtNet(logs, ticket_id){','\n}\n')
    +g('async function leaveExtDoneThisWeek(ticket_id, dateStr){','\n}\n')
    +g('const COACH_LEAVE_COMP_MSG={','};\n')
    +g('async function coachLeaveComp(booking, ticketIds){','\n}\n')
    +g('async function extendForCoachLeave(ticket_id, booking, operator){','\n}\n')
    +'\nreturn {extendForCoachLeave, coachLeaveComp, leaveWeekKey, leaveExtNet, leaveExtDoneThisWeek};')(
    sbf, true, t=>{ cleared=t; },
    ds=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(ds||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
    d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());},
    async()=>[]);
  return {fn:fn.extendForCoachLeave, comp:fn.coachLeaveComp, wk:fn.leaveWeekKey, net:fn.leaveExtNet, done:fn.leaveExtDoneThisWeek, calls, cleared:()=>cleared};
}
const R=(...results)=>({data:{ok:true,week:'2026-08-03',results},error:null});

(async()=>{
console.log('展延（走資料庫 RPC，前端不再先讀後寫）');
{
  const a=mk(R({ticket_id:'T1',action:'grant',week:'2026-08-03',from:'2026-09-30',to:'2026-10-07'}));
  const r=await a.fn('T1',{id:'B1',date:'2026-08-05'},'U');
  eq('★ 展延結果：9/30 → 10/07', [r.to,r.from,r.action], ['2026-10-07','2026-09-30','grant']);
  eq('★ 呼叫的是 fn_coach_leave_comp，帶預約 id 與票券清單', a.calls, [{name:'fn_coach_leave_comp',args:{p_booking_id:'B1',p_tickets:['T1']}}]);
  eq('　 RPC 繞過 dbPut → 票券與帳本快取要丟掉', a.cleared(), ['member_tickets','ticket_logs']);
  const body=g('async function extendForCoachLeave(ticket_id, booking, operator){','\n}\n')+g('async function coachLeaveComp(booking, ticketIds){','\n}\n');
  const code=body.replace(/\/\/[^\n]*/g,'');
  ok('★★ 補償路徑沒有 dbPut／dbGet／logTicket（沒有前端先讀後寫）', !/dbPut|dbGet\(|logTicket|expire_date\s*=/.test(code), code.match(/dbPut|dbGet\(|logTicket|expire_date\s*=/));
  ok('★★ 沒有失敗後的備援寫入路徑', !/catch\([^)]*\)\{[^}]*dbPut/.test(code));
  ok('★ 天數常數仍在（顯示用）', /const COACH_LEAVE_EXTEND_DAYS=7;/.test(src));
}

console.log('\n同一週只延一次（資料庫判斷；前端只對應結果）');
{
  const dup=mk(R({ticket_id:'T1',action:'none',week:'2026-08-03',reason:'week_done'}));
  eq('★★★ 同一週第二堂：RPC 回 week_done → {skipped:week}', await dup.fn('T1',{id:'B2',date:'2026-08-07'},'U'), {skipped:'week', week:'2026-08-03'});
  eq('★★ 沒有任何票券寫入呼叫（只打了一次 RPC）', dup.calls.length, 1);
  const nx=mk(R({ticket_id:'T1',action:'grant',from:'2026-10-07',to:'2026-10-14'}));
  eq('★★★ 下一週再請假：RPC 回 grant → +7', (await nx.fn('T1',{id:'B3',date:'2026-08-11'},'U')).to, '2026-10-14');
  const w=mk(R()).wk;
  eq('★★ 週一起算：週二 8/04 與 週五 8/07 是同一週', [w('2026-08-04'), w('2026-08-07')], ['2026-08-03','2026-08-03']);
  eq('★★ 週日算前一週', w('2026-08-09'), '2026-08-03');
  eq('★★ 下週一就換一週', w('2026-08-10'), '2026-08-10');
}

console.log('\n撤銷：RPC 回 revoke');
{
  const rv=mk(R({ticket_id:'T1',action:'revoke',week:'2026-08-03',from:'2026-10-07',to:'2026-09-30'}));
  eq('★ 同週全部有效請假撤銷 → {action:revoke,to}', await rv.fn('T1',{id:'B1',date:'2026-08-05'},'U'), {to:'2026-09-30',action:'revoke'});
}

console.log('\n什麼情況不延／失敗');
{
  eq('★ 沒到期日 → {skipped:noexp}', await mk(R({ticket_id:'T1',action:'none',reason:'noexp'})).fn('T1',{id:'B'},'U'), {skipped:'noexp'});
  eq('　　RPC 結果裡沒有這張票 → null', await mk(R({ticket_id:'X',action:'grant'})).fn('T1',{id:'B'},'U'), null);
  eq('★★ RPC 拋錯 → null，不會爆、也不會改寫票券', await mk(new Error('net')).fn('T1',{id:'B'},'U'), null);
  eq('★★ RPC 回 error → null', await mk({data:null,error:{message:'x'}}).fn('T1',{id:'B'},'U'), null);
  const den=await mk({data:{ok:false,error_code:'COMP.FORBIDDEN'},error:null}).fn('T1',{id:'B'},'U');
  ok('★ 被拒絕：回 skipped:error 並帶中文原因', den&&den.skipped==='error'&&den.error==='COMP.FORBIDDEN'&&/自己課堂/.test(den.message), den);
  eq('　　沒帶預約 id → null（不打 RPC）', await mk(R()).fn('T1',null,'U'), null);
}

console.log('\n帳本淨額（週為單位）：顯示與資料庫同一套規則');
{
  const L=(d,k,extra)=>Object.assign({ticket_id:'T1',action:'adjust',created_at:'2026-08-0'+k,note:d+' 教練請假展延 7 天（x → y）'},extra||{});
  const V=(d,k)=>({ticket_id:'T1',action:'adjust',created_at:'2026-09-0'+k,note:d+' 教練請假展延已收回 7 天（y → x）'});
  const m=mk(R());
  eq('★ 一筆展延 → 1 筆有效', m.net([L('2026-08-04',1)],'T1').length, 1);
  eq('★ 展延＋同週收回 → 0 筆（撤回）', m.net([L('2026-08-04',1),V('2026-08-06',1)],'T1').length, 0);
  eq('★★ 展延、收回、再展延 → 1 筆（同週重請不重複補償）', m.net([L('2026-08-04',1),V('2026-08-04',1),L('2026-08-05',2)],'T1').length, 1);
  eq('★ 不同週累加 → 2 筆', m.net([L('2026-08-04',1),L('2026-08-11',2)],'T1').length, 2);
  eq('★ 收回只抵銷「同一週」那一筆', m.net([L('2026-08-04',1),L('2026-08-11',2),V('2026-08-12',1)],'T1').map(x=>x.note.slice(0,10)), ['2026-08-04']);
  eq('★ 0830 的「校正」舊紀錄不算', m.net([L('2026-08-04',1,{note:'2026-08-04 教練請假展延 7 天（校正：舊紀錄）'})],'T1').length, 0);
  eq('　　別張票的紀錄不算', m.net([L('2026-08-04',1,{ticket_id:'T2'})],'T1').length, 0);
  eq('　　週日屬前一週：週二展延、同週週日收回 → 抵銷', m.net([L('2026-08-04',1),V('2026-08-09',1)],'T1').length, 0);
  const dd=mk(R()); dd.net; // 沙箱的 dbGetAll 回空帳本 → 本週還沒延過
  eq('　　leaveExtDoneThisWeek：空帳本 → false', await dd.done('T1','2026-08-05'), false);
}

console.log('\n櫃檯展延的起點與長度是兩回事（2026-08-30 使用者定版）');
{
  /* 「該課程如果因為教練請假原本就多一週 就要從這一週往後展延」——
       起點＝現在的到期日（含教練請假墊高的部分）
       長度＝原方案天數（valid_days）
     兩者不能混為一談：起點少算 → 會員虧掉補償；長度多算 → 補償被送兩次。 */
  const g3=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const extTo=new Function('parseYmd','ymd','window',
    g3('function tkPlanDays(t){','\n}\n')+g3('function tkExtendTo(t){','\n}\n')
    +'\nreturn tkExtendTo;')(
    ds=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(ds||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
    d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());},
    {_ttCache:[]});
  /* 鄭宇涵的實際形狀 */
  const zyh={id:'T',start_date:'2026-07-06',expire_date:'2026-09-13',valid_days:55,extended_from:null};
  eq('★★★ 起點用「現在的到期日」09/13（含教練請假的 14 天），長度用原方案 55 天 → 11/07',
     extTo(zyh), '2026-11-07');
  eq('★★★ 不是從原到期日 08/30 起算（那樣會把補償吃掉，變 10/24）',
     extTo(zyh)==='2026-10-24', false);
  eq('★★★ 也不是用被墊高的 69 天（那樣會多送 14 天，變 11/21）',
     extTo(zyh)==='2026-11-21', false);
  eq('　 沒被教練請假動過的票照舊：08/30 ＋ 55 → 10/24',
     extTo({id:'T',start_date:'2026-07-06',expire_date:'2026-08-30',valid_days:55}), '2026-10-24');
}

console.log('\n接進教練請假流程（2026-08-14 改版：延後釋出堂數——請假當下不退票，簽到或取消時才退）');
const _CLV=g('async function bkCoachLeave(id){','\n}\n');
ok('★ 請假當下不退堂：整個 bkCoachLeave 裡沒有 refundTicket ／ refundLegacyBooking',
   !!_CLV && !/refundTicket|refundLegacyBooking/.test(_CLV));
ok('★ 有 ticket_id 就延那張（效期展延照舊在請假當下給）',
   /if\(_tkId\)\{ _ext=await extendForCoachLeave\(_tkId,b,SESSION\.id\); \}/.test(src)
   && /const extendTo=\(_ext&&_ext\.to\)\|\|null;/.test(src));
ok('★ 櫃檯的提示講出新的期限與延後釋出規則',
   /效期延至 \$\{extendTo\.replace\(\/-\/g,'\/'\)\}/.test(src)
   && /堂數會在會員簽到或取消這堂時退回/.test(src));
ok('　　展延失敗不會拖垮整個請假流程（整段包 try）', /\}catch\(_\)\{ return null; \}/.test(src));
ok('　　原因寫在程式裡', /教練請假等於白白吃掉會員一週的名額，時間要還給他/.test(src));

console.log('\n這堂課改成會員自主訓練（2026-07-31 定案；2026-08-14 起票繼續掛著）');
ok('★ 課種改成自主訓練', /b\.category='自主訓練';/.test(src));
ok('★ 票券欄位保留（圓點靠它畫紅圈；退堂等簽到或取消）', !!_CLV && !/b\.ticket_id=null/.test(_CLV));
ok('★ ticket_type_id 刻意保留（那是「本來是哪一種課」的唯一線索）',
   !/b\.ticket_type_id=null/.test(src)
   && /ticket_type_id 刻意保留：那是「本來是哪一種課」的唯一線索/.test(src));
ok('★ 預約備註記下原本的課種與釋出規則',
   /教練請假，本堂改為自主訓練（原：\$\{_wasCat\}）（堂數待簽到或取消時退回）/.test(src));
ok('　　課程變動不通知會員（2026-08-14 使用者指示：只留開課前 24h 提醒）',
   !!_CLV && !/notifications|notifyMember|pushLine/.test(_CLV));

console.log('\n到場簽到照發自主訓練點數');
ok('★ grantCheckinReward 補一條：教練請假的課就發（簽到會把 status 蓋掉，旗標才可靠）',
   /if\(b\.status==='coach_leave'\|\|b\.coach_leave===true\)\{ doGrant=true; isFriendly=friendly; \}/.test(src));
ok('★ 排在 coachClass 判斷之後、return false 之前（不然課種改掉就判成不發）',
   src.indexOf("if(coachClass){ doGrant=true; isFriendly=friendly; }")
   < src.indexOf("if(b.status==='coach_leave'||b.coach_leave===true){ doGrant=true; isFriendly=friendly; }")
   && src.indexOf("if(b.status==='coach_leave'||b.coach_leave===true){ doGrant=true; isFriendly=friendly; }")
   < src.indexOf("if(!doGrant) return false;"));
ok('★ 友善與否仍看原本那張票', /友善與否仍看原本那張票（ttName／tkPlanName／ttColor，上面已經算過）/.test(src));
ok('　　重複發放的防線沒動（同一筆 booking 只發一次）',
   /t\.source==='checkin_grant' && t\.source_booking_id===b\.id/.test(src));

/* 2026-08-01 使用者指示：明細裡的教練那一列也要有「教練請假」——
   原本只有課卡圓形按鈕的代課選單裡才有，從明細進來的人找不到。 */
console.log('\n明細的教練列也有教練請假');
/* 2026-08-03：教練課分支補上第三顆（0801 放錯分支，真正適用的教練課反而沒有） */
/* 2026-08-08：三處原本各寫一份兩行三元式，團課加進來之後說明文字會分岔 → 抽成 bkCoachLeaveBtn */
ok('★ 明細裡有按鈕（教練課／團課體驗／通用三個分支都有）',
   (src.match(/\$\{bkCoachLeaveBtn\(b, editable\)\}/g)||[]).length===3);
ok('★★ 三處共用同一支（改一次三處都跟著改）', /function bkCoachLeaveBtn\(b, editable\)\{/.test(src));
ok('★ 走同一支 bkCoachLeave（規則不會再分岔）',
   /class="btn btn-ghost btn-sm bkd-cleave" onclick="bkCoachLeave\('\$\{b\.id\}'\)"/.test(src));
ok('★ 只有可編輯、且這種課適用才出現', /if\(!\(editable && canCoachLeave\(b\)\)\) return '';/.test(src));
ok('★ 已簽到／已完成／已取消的課不給按',
   /if\(b\.status==='cancelled'\|\|b\.status==='checked_in'\|\|b\.status==='completed'\) return '';/.test(src));
ok('★ 已標記過就顯示紅色標籤＋復原鈕，不會重複按（2026-08-14 加復原）',
   /return '<span class="tag" style="background:#fbe9e7;color:#b5372e;">教練請假<\/span>'\+undoBtn;/.test(src)
   && /onclick="bkCoachLeaveUndo\('\$\{b\.id\}'\)"/.test(src));
ok('★★ 團課是整堂取消（status 變 cancelled）→ 靠 coach_leave 旗標才認得出來',
   /function bkIsCoachLeave\(b\)\{ return !!b && \(b\.status==='coach_leave' \|\| b\.coach_leave===true\); \}/.test(src));
ok('　　按鈕做成紅字外框（不可逆的動作，要跟代課下拉區隔）',
   /\.bkd-cleave\{color:var\(--danger,#b5372e\);border-color:var\(--danger,#b5372e\);/.test(src));
ok('　　滑過看得到會發生什麼（兩種做法不同文案）',
   /const tip=bkCoachLeaveMode\(b\)==='cancel'\?'整堂取消、逐名額退票、效期＋7 天':'退票、效期＋7 天、課種改自主訓練';/.test(src));

console.log('\n適用範圍（2026-07-31 定案；2026-08-08 使用者補上團課）');
{
  /* 2026-07-31：canCoachLeave 改問票卡口袋（TK_POCKETS.*.coachLeave），一併抽進來 */
  const _pi2=src.indexOf('const TK_POCKETS={');
  const mode=new Function('window',
    src.slice(_pi2, src.indexOf('\nfunction tkClass5(',_pi2))+'\n'
    +g('function tkClass5(t, typeMap){','\n}\n')+'\n'
    +g('function bkCoachLeaveMode(b){','\n')+'\nreturn bkCoachLeaveMode;')({_ttCache:[]});
  const can=b=>!!b && !!mode(b);
  eq('★ 教練課 → 退票＋展延＋改自主訓練', mode({category:'私人教練'}), 'self');
  eq('★ 友善教練課 → 同上（category 也是私人教練，靠票券區分）', mode({category:'私人教練'}), 'self');
  eq('★★ 團體課 → 整堂取消＋逐名額退票展延（2026-08-08 使用者補充）',
     mode({category:'小班肌力'}), 'cancel');
  eq('★ 自主訓練 → 不適用', mode({category:'自主訓練'}), null);
  eq('　　體驗 → 不適用（本來就不扣票）', mode({category:'體驗'}), null);
  /* 2026-07-31 使用者定案：運動按摩是跟老師另外約時間，直接取消重約就好 */
  eq('★ 運動按摩 → 不適用（直接取消重約，不走這一套）', mode({category:'運動按摩'}), null);
  eq('　　null 不會爆', can(null), false);
  ok('★ 不適用的課根本不畫那顆按鈕', /\+ \(!canCoachLeave\(b\) \? ''/.test(src));
  ok('★ 函式本身也擋一次（深連結／程式呼叫繞不過去；2026-08-14 無票卡位另給引導文案）',
     /if\(!canCoachLeave\(b\)\)\{/.test(src)
     && /這堂沒有綁票券（待簽約或舊匯入），沒有票可退——請改用「取消」釋出時段/.test(src)
     && /\$\{b\.category\|\|'這種課'\}不適用教練請假/.test(src));
  ok('★★ 團課走自己那一套，不會被改成「自主訓練」',
     /if\(bkCoachLeaveMode\(b\)==='cancel'\) return grpCoachLeave\(id\);/.test(src));
  ok('　　為什麼團課不改成自主訓練，原因寫在程式裡',
     /一堂好幾個人，改成「自主訓練」講不通（自主訓練是一個人的事）/.test(src)
     && /按摩是跟老師另外約時間，\s*\n\s*臨時不能來就直接取消重約/.test(src));
}

console.log('\n請假按鈕的位置');
ok('★ 移到代課教練名單「後面」', (()=>{
  const i=src.indexOf('const html = `<div class="evc-roster evr-up"');
  const blk=src.slice(i, src.indexOf('</div>`;',i));
  return blk.indexOf('bkOrbitSubSet') < blk.indexOf('bkCoachLeave');
})());
ok('★ 按鈕講清楚會發生什麼（副標跟著做法換）',
   /找不到代課 → 教練請假<i>\$\{bkCoachLeaveSub\(b\)\}<\/i>/.test(src)
   && /\? '整堂取消・退票・效期＋7 天' : '退票・效期＋7 天・改成自主訓練'/.test(src));
ok('　　已標記過就不能再按', /<button class="evr-row on" disabled>已標記教練請假<\/button>/.test(src)
   && /: !bkIsCoachLeave\(b\)/.test(src));
ok('　　樣式：紅字＋副標', /\.evr-row\.evr-leave\{color:#a8433f;flex-direction:column;/.test(src));
ok('　　原因寫在程式裡', /它也是這個面板裡唯一破壞性的動作，\s*\n\s*放最後比較不會誤點/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
