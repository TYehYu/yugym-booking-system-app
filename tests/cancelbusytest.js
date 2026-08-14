/* 2026-08-02 使用者回報：「剛剛因為學生腳受傷要臨時取消，點了不退課，畫面又卡住了」
   「連讀取的小動畫都沒出現」

   兩個問題，都不是「取消」本身的邏輯：
   ① 沒有畫面回饋。「扣課不退」不走 RPC，是前端一連串 dbGetAll（ticket_logs /
      member_tickets / bookings 都是大表）＋逐筆寫回，網路一慢就是好幾秒；
      這段完全沒有 busy 狀態，也沒有防連點，按下去看起來就是當掉。
   ② 錯誤沒有出口。原本用 inline onclick 直接呼叫 async 函式，中途丟例外沒有人接 ——
      畫面就真的停在那裡，連錯誤訊息都沒有，事後也查不到是什麼壞了。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 按下去立刻有反應');
{
  const f=new Function('document', grabFn('cxBusy')+'\nreturn cxBusy;');
  const mk=()=>{
    const btns=[{disabled:false},{disabled:false}];
    const foot={ innerHTML:'<button>返回</button><button>取消</button>', appended:'',
      querySelectorAll:()=>btns,
      insertAdjacentHTML(pos,html){ this.appended=html; } };
    return {foot, btns};
  };
  const {foot,btns}=mk();
  const undo=f({querySelector:()=>foot})();
  ok('★ 按鈕會被鎖住（避免連點成兩次取消）', btns.every(b=>b.disabled), btns);
  ok('★ 出現轉圈與「處理中…」（使用者說「連讀取的小動畫都沒出現」）',
     /<span class="cx-spin"><\/span>處理中…/.test(foot.appended), foot.appended);
  ok('　　可以自訂訊息', /上傳中/.test((()=>{const m=mk();f({querySelector:()=>m.foot})('上傳中');return m.foot.appended;})()));
  ok('　　回傳還原函式（失敗時把按鈕放回去，讓人可以再試）', typeof undo==='function');
  ok('　　沒有 modal-foot 時不會爆（回一個空函式）',
     typeof f({querySelector:()=>null})()==='function');
  ok('★ 有轉圈的樣式，不是只有文字',
     /\.cx-spin\{width:15px;height:15px;border:2px solid var\(--bd\);border-top-color:var\(--green\);/.test(src)
     && /animation:qbspin \.8s linear infinite/.test(src));
}

console.log('\n② 失敗要看得到，而不是停在那裡');
ok('★ 取消的入口整段包在 try/catch 裡',
   /async function _askSeriesCancel\(id, mode\)\{\n\s*const undo=cxBusy\(\);\n\s*try\{ return await __askSeriesCancel\(id, mode\); \}/.test(src));
ok('★ 失敗時把按鈕放回去，並說出是什麼錯',
   /undo\(\);\n\s*showToast\('取消失敗：'\+\(\(e&&e\.message\)\|\|e\)\+'　·　請再試一次'\);/.test(src));
ok('　　同時留在 console，方便事後查', /console\.error\('取消預約失敗', id, mode, e\);/.test(src));
ok('★ 全域接住沒人管的 promise 錯誤（這次查不到原因就是因為沒有這個）',
   /window\.addEventListener\('unhandledrejection', e=>\{/.test(src)
   && /showToast\('操作沒有完成：'\+String\(m\)\.slice\(0,80\)\);/.test(src));
ok('　　只掛一次（首頁會重繪很多次）', /if\(!window\._errHooked\)\{/.test(src));
ok('　　原因寫在程式裡',
   /丟出來的例外只進 console，畫面完全沒有反應。全域接一次，至少讓操作的人知道/.test(src));

console.log('\n③ 防連點');
ok('★ 取消的兩個入口都上鎖',
   /async function askSeriesCancel\(id, mode\)\{ return onceAct\('cxask:'\+id\+':'\+mode, \(\)=>_askSeriesCancel\(id,mode\)\); \}/.test(src)
   && /async function runSeriesCancel\(withLater\)\{ return onceAct\('cxrun', \(\)=>_runSeriesCancel\(withLater\)\); \}/.test(src));
ok('　　鎖的 key 帶上預約與模式（不同的取消互不影響）', /'cxask:'\+id\+':'\+mode/.test(src));
ok('　　原本的實作改名成 _ / __，沒有留下兩份',
   src.split('async function askSeriesCancel(').length===2
   && src.split('async function runSeriesCancel(').length===2);

console.log('\n④ 取消本身的行為沒有被改到');
ok('　　扣課不退仍然不退票券', /else if\(refundMode==='none'\) doRefund=false;/.test(src));
ok('　　仍會記錄「扣課不退」供補課券判斷', /b\.refund_waived = !doRefund;/.test(src));
ok('　　取消通知已退場（2026-08-14 使用者指示：課程變動不通知會員）',
   !/pushNotification\(b\.member_id,'cancel','預約已取消'/.test(src));
ok('　　連續取消仍逐筆顯示進度', /取消中…（'\+\(done\+fail\)\+'\//.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
