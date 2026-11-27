'use strict';
/* 抽獎登記（2026-11-26 改版，GPT 驗收 P1×2）：
   資格重驗＋發票＋寫帳＋寫登記搬進資料庫 fn_lottery_award（單一交易、依會員排隊、op_id 冪等）；
   前端只負責：帶一次性 opId、處理回應、讀取失敗就停。資料庫行為見 docs/handoff/lottery-award/01_test_TESTDB_ONLY.sql。
   這裡真的執行 lottoAward／lottoAwardDo／openLottoModal，rpc 用假的、模擬「資料庫端」的排隊與冪等。 */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fn(name){const i=src.indexOf('function '+name+'(');assert(i>=0,name);const st=src.slice(i-6,i)==='async '?i-6:i;let d=0,k=src.indexOf('{',i);for(;;k++){if(src[k]=='{')d++;if(src[k]=='}'&&--d==0)break;}return src.slice(st,k+1);}
const grp=['lottoAward','lottoAwardDo','_lottoAwardDo','onceAct','openLottoModal'].map(fn).join('\n');
const prizes=src.slice(src.indexOf('const LOTTO_PRIZES='),src.indexOf('];',src.indexOf('const LOTTO_PRIZES='))+2);
const errMsg=src.slice(src.indexOf('const LOTTO_ERR_MSG='),src.indexOf('};',src.indexOf('const LOTTO_ERR_MSG='))+2);
let rpcCalls=[],toasts=[],modals=[],opened=0,failRead=false;
let server; // 假資料庫：每位會員資格、已登記 op
const reset=(quota)=>{server={quota,ops:{},tickets:0};rpcCalls=[];toasts=[];modals=[];opened=0;};
const sb={rpc:async(name,args)=>{
  rpcCalls.push([name,args]);
  await new Promise(r=>setTimeout(r,5));                      // 讓兩個呼叫真的交錯
  if(server.netFail){return {data:null,error:{message:'Failed to fetch'}};}
  const s=server; if(s.ops[args.p_op_id]) return {data:{ok:true,replayed:true,purchase_id:args.p_op_id},error:null};
  if(s.quota<=0) return {data:{ok:false,error_code:'LOTTERY.NO_QUOTA'},error:null};
  s.quota--; s.ops[args.p_op_id]=1; s.tickets++; return {data:{ok:true,replayed:false,purchase_id:args.p_op_id},error:null};
}};
const c={ymd:()=>'2026-11-24',TODAY:'x',SESSION:{id:'S'},_actBusy:{},CLOUD:true,sb,uid:p=>p+'-'+Math.random().toString(36).slice(2,10),
 dbGetAll:async t=>{ if(failRead&&t==='purchases') throw new Error('boom'); return []; },dbGet:async()=>({name:'王'}),
 dbCacheClear:()=>{},showToast:m=>toasts.push(m),showModal:h=>modals.push(h),isDeskLike:()=>true,
 lottoStats:()=>{ opened++; return []; },lottoVipSet:()=>new Set(),_lotPuDate:()=>'',escH:x=>x,lottoStats_:0,window:{},setTimeout,console};
vm.createContext(c);
vm.runInContext("const LOTTO_FROM='2026-07';\n"+prizes+'\n'+errMsg+'\n'+grp+'\nthis.F={lottoAward,lottoAwardDo,openLottoModal};',c);
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 // 1 確認視窗帶一次性 opId，且每次開視窗都是新的
 reset(1);
 await c.F.lottoAward('M1','pt'); await c.F.lottoAward('M1','pt');
 const ops=modals.map(h=>(h.match(/lottoAwardDo\('M1','pt','([^']+)'\)/)||[])[1]);
 test('確認視窗的按鈕帶 opId，兩次開視窗不同',()=>{assert(ops[0]&&ops[1]);assert.notEqual(ops[0],ops[1]);});

 // 2 兩個頁面同時（各自開了視窗＝各自 opId）搶最後 1 次 → 只成功一個、只發一次
 reset(1);
 await Promise.all([c.F.lottoAwardDo('M1','pt','LOT-A'),(async()=>{ c._actBusy={}; return c.F.lottoAwardDo('M1','pt','LOT-B'); })()]);
 test('兩頁同時搶最後一次（不同 opId）→ 資料庫只發 1 張，另一邊被擋並提示',()=>{
   assert.equal(server.tickets,1);assert(toasts.some(t=>t.includes('沒有待抽')));assert(toasts.some(t=>t.startsWith('已登記')));});

 // 3 同一視窗連點／重送（同 opId）→ 只發一張
 reset(5); await wait(450);
 await Promise.all([c.F.lottoAwardDo('M1','pt','LOT-X'),c.F.lottoAwardDo('M1','pt','LOT-X'),c.F.lottoAwardDo('M1','pt','LOT-X')]);
 await wait(450); await c.F.lottoAwardDo('M1','pt','LOT-X');   // 網路重送
 test('連點＋重送同一個 opId → 只發 1 張，重送顯示「已經登記過」',()=>{
   assert.equal(server.tickets,1);assert(toasts.some(t=>t.includes('已經登記過')));});

 // 4 呼叫的是 RPC，帶的參數正確
 test('走 fn_lottery_award（會員、獎項、opId）',()=>{
   assert(rpcCalls.every(x=>x[0]==='fn_lottery_award'));
   assert.equal(JSON.stringify(rpcCalls[0][1]),JSON.stringify({p_member_id:'M1',p_prize_key:'pt',p_op_id:'LOT-X'}));});

 // 5 連線失敗：不顯示成功、提示重試，且重試用同一個 opId 不會重複
 reset(1); server.netFail=true; await wait(450);
 await c.F.lottoAwardDo('M1','pt','LOT-N');
 test('RPC 回錯誤 → 不顯示成功、提示可重試',()=>{
   assert(!toasts.some(t=>t.startsWith('已登記')));assert(toasts.some(t=>t.includes('重試')));assert.equal(server.tickets,0);});
 server.netFail=false; await wait(450); await c.F.lottoAwardDo('M1','pt','LOT-N');
 test('重試（同 opId）成功且只發 1 張',()=>assert.equal(server.tickets,1));

 // 6 沒有雲端連線：不登記
 reset(1); c.CLOUD=false; await wait(450); await c.F.lottoAwardDo('M1','pt','LOT-O'); c.CLOUD=true;
 test('沒連雲端：不呼叫 RPC、不登記',()=>{assert.equal(rpcCalls.length,0);});

 // 7 讀取失敗必須停止（不能當成 0 筆登記）
 failRead=true; opened=0; toasts=[]; modals=[];
 await c.F.openLottoModal();
 failRead=false;
 test('purchases 讀取失敗 → 停止、提示、不算名單',()=>{
   assert.equal(opened,0);assert(toasts.some(t=>t.includes('讀取抽獎資料失敗')));assert.equal(modals.length,0);});
 test('原始碼已無「purchases 讀取失敗當空清單」',()=>{
   const a=src.indexOf('async function openLottoModal'),b=src.indexOf('async function lottoFixAsk',a)>0?src.indexOf('async function lottoFixAsk',a):a+4000;
   const body=src.slice(a,a+3000);
   assert(!/dbGetAll\('purchases'\)\.catch\(\(\)=>\[\]\)/.test(body));
   const x=src.indexOf('async function _lottoAwardDo');assert(!/dbGetAll\('purchases'\)/.test(src.slice(x,x+3500)));});
 test('前端不再自己分開寫 member_tickets／ticket_logs／purchases（原子化在資料庫）',()=>{
   const x=src.indexOf('async function _lottoAwardDo');const body=src.slice(x,src.indexOf('// 展開/收合教練列詳情',x));
   assert(!/dbPut\(/.test(body));assert(!/logTicket\(/.test(body));});
 test('錯誤碼有中文提示：VIP 排除、舊頁面阻擋',()=>{
   assert(src.includes("'LOTTERY.VIP_EXCLUDED':'這位會員是 VIP"));assert(src.includes("'LOTTERY.CLIENT_OUTDATED':'抽獎登記已升級"));});
 test('改抽獎項目：前端不再自己刪票／刪帳／發票，改走 fn_lottery_fix，且沒有 lottery_fix 之類的自填放行標記',()=>{
   const i=src.indexOf('async function _lottoFixDo');const body=src.slice(i,src.indexOf('/* 名單就地篩選',i));
   assert(body.includes("sb.rpc('fn_lottery_fix'"));
   assert(!/dbDel\(|dbPut\(|logTicket\(/.test(body));
   assert(!src.includes("source_type:'lottery_fix'"));});
 test('更正確認視窗帶一次性 opId，錯誤碼有中文提示',()=>{
   const i=src.indexOf('async function lottoFixConfirm');const body=src.slice(i,i+2500);
   assert(/lottoFixDo\('\$\{lotId\}','\$\{key\}','\$\{_op\}'\)/.test(body));
   assert(src.includes("'LOTTERY.FIX_TICKET_USED':'這張獎品票券已經被用過"));});
 test('防重送改記在受保護的 lottery_ops（只增不改不刪、回復不移除），不再靠可編輯的 purchases.note',()=>{
   const sql=fs.readFileSync(require('path').join(__dirname,'..','docs','migrations','20261126_fn_lottery_award.sql'),'utf8');
   assert(/create table if not exists public\.lottery_ops/.test(sql));
   assert(/grant select on public\.lottery_ops to authenticated;/.test(sql));
   assert(/trg_lottery_ops_immutable before update or delete/.test(sql) && /trg_lottery_ops_notruncate before truncate/.test(sql));
   assert(!/\[fix:/.test(sql));
   assert(!/drop table[^;]*lottery_ops|drop trigger[^;]*lottery_ops|drop function[^;]*fn_lottery_ops_guard/.test(fs.readFileSync(require('path').join(__dirname,'..','docs','handoff','lottery-award','03_rollback_PROD.sql'),'utf8')));});
 console.log(n+' passed, 0 failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
