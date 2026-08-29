/* 防連點：所有會動到票券／預約的入口都上鎖（2026-08-01）

   起因是巫雅雯那筆：同一筆預約在 51 毫秒內被扣了兩次。彈窗裡的按鈕是 inline onclick，
   手機上偶爾會收到兩次事件（touchend 之後補發的 click、或手指微移造成的第二次點）。
   逐顆按鈕加 disabled 容易漏，改在動作層擋：同一個 key 還在跑就不重跑。

   二修：原本擋掉的那一次直接回傳 undefined，但有幾個入口的回傳值是有人在看的
   （checkInBooking 的 ok、saveBookingTime 的 ok），undefined 會被當成「失敗」而跳錯誤訊息。
   改成讓重複的那一次「跟著等同一個結果」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 鎖本身');
{
  const i=src.indexOf('const _actBusy={};');
  const code=src.slice(i, src.indexOf('\n}\n', i)+3);
  const mk=()=>new Function(code+'\nreturn onceAct;')();

  (async()=>{
    // 同時兩次 → 只跑一次，兩邊拿到同一個結果
    let runs=0;
    const onceAct=mk();
    const fn=async()=>{ runs++; await new Promise(r=>setTimeout(r,10)); return 'A'+runs; };
    const [r1,r2]=await Promise.all([onceAct('k',fn), onceAct('k',fn)]);
    eq('★ 同一個 key 同時觸發 → 動作只跑一次', runs, 1);
    eq('★ 兩次都拿到同一個結果（不是 undefined）', [r1,r2], ['A1','A1']);

    // 不同 key 互不影響
    let runs2=0;
    const f2=async()=>{ runs2++; return 'B'; };
    await Promise.all([onceAct('x',f2), onceAct('y',f2)]);
    eq('★ 不同 key（不同筆預約）互不影響', runs2, 2);

    // 400ms 之後才放行
    let runs3=0;
    const f3=async()=>{ runs3++; return runs3; };
    await onceAct('z',f3);
    await onceAct('z',f3);                       // 還在 400ms 寬限內 → 不重跑
    eq('★ 完成後 400ms 內再點一次 → 仍不重跑（吃掉補發的那一下）', runs3, 1);
    await new Promise(r=>setTimeout(r,450));
    await onceAct('z',f3);
    eq('★ 過了寬限期是真的可以再做一次（不是永久鎖死）', runs3, 2);

    // 失敗不會把 key 永久卡住
    let runs4=0;
    const f4=async()=>{ runs4++; throw new Error('boom'); };
    try{ await mkRun(); }catch(_){}
    async function mkRun(){ return onceAct('e',f4); }
    await new Promise(r=>setTimeout(r,450));
    try{ await onceAct('e',f4); }catch(_){}
    eq('★ 動作丟例外也會解鎖，下次還能再試', runs4, 2);

    console.log('\n② 每個會動到票券／預約的入口都上鎖');
    /* 這一份就是「還有哪些入口沒鎖」的清單本身 —— 少一個就會被這個測試抓到。 */
    const ENTRIES=[
      ['submitFacilityBooking','(){',"'facility:'+((_bkWizard&&_bkWizard.date)||'')+((_bkWizard&&_bkWizard.time)||'')"],   // 場地租借收款（會扣場租票）
      ['saveBookingTime','(id){',"'bktime:'+id"],              // 改時間／改人數（差額補扣或退）
      /* 2026-08-29：saveGroupMembers 多了一個分岔（［＋新增］開著重複預約時先問再寫），
         兩條路都用同一把 'grpmem:'+id 的鎖，所以改成單獨驗、不套用共用樣板。 */
      ['qbSubmitForm','(){',"'qbform'"],                       // 教練端快速預約
      ['checkInBooking','(id, opts){',"'checkin:'+id"],        // 簽到（發點）
      ['undoCheckin','(id){',"'uncheckin:'+id"],               // 取消簽到（收回點）
      ['groupToggleLeave','(bid,seatKey){',"'grpleave:'+bid+':'+seatKey"],   // 請假（發補課券）
      ['groupCancelSeat','(bid,seatKey){',"'grpcancel:'+bid+':'+seatKey"],   // 取消名額（退票）
      ['toggleGroupAttend','(bid,mid){',"'grpatt:'+bid+':'+mid"],            // 逐名額簽到
      ['bkToggleVenueUnit','(id, unit){',"'venunit:'+id+':'+unit"],          // 跑步機開／關第 2 台
      ['confirmInstallNext','(ticket_id){',"'instnext:'+ticket_id"],         // 分期收款開通（會補扣保留課）
    ];
    ENTRIES.forEach(([fn,sig,key])=>{
      const wrap=`async function ${fn}${sig} return onceAct(${key}, ()=>_${fn}(`;
      ok('★ '+fn, src.indexOf(wrap)>=0, wrap);
    });
    ok('★ saveGroupMembers（兩條路共用同一把鎖）',
       /async function saveGroupMembers\(id\)\{\s*\n\s*if\(window\._grpAdd && window\._grpRep && \(window\._grpPick\|\|\{\}\)\.mid\)\{\s*\n\s*return onceAct\('grpmem:'\+id, \(\)=>grpFollowPre\(id\)\);\s*\n\s*\}\s*\n\s*return onceAct\('grpmem:'\+id, \(\)=>_saveGroupMembers\(id\)\);/.test(src));
    ok('　　「只加這一堂」也有自己的鎖（它會真的扣票）',
       /async function grpFollowOnce\(id\)\{ return onceAct\('grpmem1:'\+id, async\(\)=>\{/.test(src));
    ok('　　原本的實作都改名成 _xxx（沒有留下兩份）',
       ENTRIES.every(([fn])=>src.indexOf(`async function _${fn}(`)>=0
         && src.split('async function '+fn+'(').length===2));
    /* 早先已經鎖住的三個入口不要退化 */
    ok('　　既有的三把鎖仍在（換票券／轉正式預約／新增預約）',
       /async function doBkTicketChange\(id,newTkId\)\{ return onceAct\('tkchg:'\+id/.test(src)
       && /return onceAct\('convert:'/.test(src)
       && /if\(window\._bkSubmitting\)\{ showToast\('建立中，請稍候…'\); return; \}/.test(src));

    console.log('\n③ 不會互鎖');
    /* 包起來的入口如果彼此呼叫、又剛好同一個 key，會等一個永遠不會完成的 promise。
       實際檢查：每個 _xxx 的函式本體裡不得再呼叫這一組的公開版。 */
    {
      const names=ENTRIES.map(e=>e[0]);
      const bad=[];
      names.forEach(n=>{
        const i=src.indexOf(`async function _${n}(`);
        let j=src.length;
        const m=/\n(?:async )?function [A-Za-z_]/.exec(src.slice(i+10));
        if(m) j=i+10+m.index;
        const body=src.slice(i,j);
        names.forEach(x=>{ if(new RegExp('(?<![_\\w])'+x+'\\(').test(body)) bad.push(n+'→'+x); });
      });
      eq('★ 沒有任何一個包起來的入口會再去呼叫另一個（不會互等）', bad, []);
    }

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
