/* 批次寫入一律要防連點（2026-08-31 定案）

   使用者：「那幾條也加上防連點鎖」

   為什麼：0827 施佳靜（11 筆預約跑出 18 筆扣課）與 0831 劉雪珠（帳本出現 6 筆
   「⚠ 已阻擋：這一堂在這張票上已經扣過 1 堂」）都是**同一支流程被跑了兩次**。
   deductTicket 的冪等防線接住了、沒有真的扣爆 —— 但那是最後一道網，
   不該常態性地靠它（網接住的次數多了，就代表上游一直在漏）。

   這一支盯的是：所有「一按下去跑一整串扣課／退課／建課」的入口都有鎖。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 0831 補上的三支');
{
  ok('★★★ 補扣未付款預約（劉雪珠那條路）',
     /async function doChargeUnpaid\(dropOver\)\{[\s\S]{0,120}?return onceAct\('chgunpaid:'\+\(p\.tid\|\|''\), \(\)=>_doChargeUnpaid\(dropOver\)\);/.test(src)
     && /async function _doChargeUnpaid\(dropOver\)\{/.test(src));
  ok('★★★ 團課教練請假（整堂取消＋逐名額退票展延）',
     /async function grpCoachLeave\(id\)\{ return onceAct\('grpclv:'\+id, \(\)=>_grpCoachLeave\(id\)\); \}/.test(src)
     && /async function _grpCoachLeave\(id\)\{/.test(src));
  ok('★★ 手機端調課（勾了連續預約就會建一整串）',
     /async function admhMoveDo\(id\)\{ return onceAct\('admhmove:'\+id, \(\)=>_admhMoveDo\(id\)\); \}/.test(src)
     && /async function _admhMoveDo\(id\)\{/.test(src));
  ok('★★ 鎖的鍵要帶得出「是哪一筆」（全域一把鎖會擋掉不同會員的正常操作）',
     /onceAct\('chgunpaid:'\+\(p\.tid\|\|''\)/.test(src)
     && /onceAct\('grpclv:'\+id/.test(src) && /onceAct\('admhmove:'\+id/.test(src));
  ok('★★★ 為什麼要鎖，寫在原地（含兩個真實案例）',
     /0827 施佳靜（11 筆預約\s*\n\s*跑出 18 筆扣課）與 0831 劉雪珠（帳本出現 6 筆「⚠ 已阻擋」）都是同一支流程被跑了/.test(src)
     && /那是\*\*最後一道網\*\*，/.test(src));
}

console.log('\n② 本來就有鎖的那幾條沒被弄壞');
{
  const has=(re)=>re.test(src);
  eq('★★★ 既有的鎖全都還在', [
    has(/window\._bkSubmitting=true;/),                                    // 建立預約
    has(/return onceAct\('convert:'\+\(window\._cpBid\|\|''\)/),           // 整串轉正
    has(/async function confirmInstallNext\(ticket_id\)\{ return onceAct\('instnext:'\+ticket_id/), // 開通下一期
    has(/async function bkOpenHoldCreate\(\)\{ return onceAct\('bkopenhold'/),  // 建空堂
    has(/async function bkInstHold\(\)\{ return onceAct\('bkinsthold'/),        // 分期保留
    has(/async function bkSwapPick\(bkId\)\{ return onceAct\('bkswap:'\+bkId/), // 調課
    has(/async function qbSubmitForm\(\)\{ return onceAct\('qbform'/),          // 快速預約
  ], [true,true,true,true,true,true,true]);
}

console.log('\n③ 冪等防線仍然是最後一道網（不能因為加了鎖就拆掉）');
{
  ok('★★★ deductTicket 的「同一票×同一預約不得超過 allow」還在',
     /同一張票 × 同一筆預約，淨扣課不得超過 allow（預設 1）。/.test(src)
     && /async function tkNetDeductOn\(ticket_id, booking_id\)\{/.test(src));
  ok('★★ 合法的重複扣課仍要能走（團課多名額、自主訓練 120 分鐘）',
     /有兩種\*\*合法的重複扣課\*\*，它們必須自己說明白（opts\.multi）/.test(src));
}

console.log('\n④ 實跑 onceAct：真的擋得住連點嗎');
{
  const i=src.indexOf('async function onceAct(');   // 是 async，別從 'function' 切（會掉 async）
  if(i<0) throw new Error('切不到 onceAct');
  const j=src.indexOf('\n}\n', i)+2;
  /* _actBusy 是模組層的鎖表，沙箱要自己給一個 */
  const onceAct=new Function('_actBusy', 'return '+src.slice(i,j)+';')({});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  (async()=>{
    let runs=0;
    const slow=()=>new Promise(r=>setTimeout(()=>{runs++;r('done');},20));

    await Promise.all([onceAct('k1', slow), onceAct('k1', slow)]);   // 同一把鎖連按兩次
    eq('★★★ 同一個鍵連按兩次，只跑一次', runs, 1);

    await Promise.all([onceAct('k2', slow), onceAct('k3', slow)]);   // 不同筆不能互相擋
    eq('★★★ 不同鍵各自跑（不能一把鎖擋掉別人的操作）', runs, 3);

    /* 鎖是延後 400ms 才放的 —— 連點防護要涵蓋「跑完之後手還在抖」那一下 */
    await onceAct('k1', slow);
    eq('★★★ 跑完後 400ms 內再按，仍然擋著（防的就是手抖那一下）', runs, 3);
    await sleep(450);
    await onceAct('k1', slow);
    eq('★★ 400ms 過後可以正常再操作一次', runs, 4);

    let threw=0;
    try{ await onceAct('k4', async()=>{ throw new Error('boom'); }); }catch(_){ threw++; }
    await sleep(450);
    await onceAct('k4', slow);
    eq('★★★ 失敗也要放鎖（不然一次錯誤就永遠按不動）', [threw, runs], [1,5]);

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
