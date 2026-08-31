/* 會員端自主訓練列：點一下就開快速預約視窗改時間（2026-08-31 使用者指示，兩修）

   一修：「如果客人要把其中一個圓形卡修改日期　應該再點一次就可以調整」
   二修：「不用跳過去那一天了　只要點了就再開一次快速預約視窗但要標示已經預約的時間」
         「或者說這張預約的時間」

   原本已約的卡只有一個動作：跳到那一天（memh2PickDay）。
   一修做成兩段（先跳、再改），二修拿掉「先跳」那一步 —— 客人要的就是換時間，
   跳過去那一下對他沒有用。現在點一下直接開同一個快速預約視窗（memh2SelfSlots），
   並在視窗裡把**這張預約原本的時段**標成「目前」。

   ⚠ 改得動的條件必須與課卡上那顆「更改時間」一字不差 —— 那三個排除條件是 0822 覆查過的：
     已簽到／已上完、教練請假被改記成自主訓練的、不是自己的那一格（家人共享票）。
     條件不合就維持「跳到那一天」，而且不畫時鐘圖示 ——
     畫了點下去卻沒反應，比沒有提示更糟。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 點一下就開改期視窗');
{
  ok('★★★ 改得動的直接開 memh2SelfSlots（帶預約 id），改不動的才跳到那一天',
     /onclick="\$\{_canRs\?`memh2SelfSlots\('\$\{b\.date\}','','\$\{b\.id\}'\)`:`memh2PickDay\('\$\{b\.date\}'\)`\}"/.test(src));
  /* ⚠ 只看底部那條列（memSelfBarSync）—— 課卡上那顆「更改時間」圓鈕本來就叫
     msbStart('${b.id}')，那是另一個入口，不能一起判掉。 */
  const BAR=src.slice(src.indexOf('async function memSelfBarSync()'), src.indexOf('function memSelfBarFit()'));
  ok('★★★ 不再有「先跳過去」那一步（_rs 這個中間狀態拿掉了）',
     !/const _rs=_sel && _canRs;/.test(BAR)
     && !/msbStart\(/.test(BAR));
  ok('★★★ 改得動的條件沒變（0822 覆查過的三條）',
     /const _canRs=b\.member_id===SESSION\.id && b\.status==='booked' && b\.coach_leave!==true;/.test(src)
     && /改不動的（已簽到／教練請假改記的／家人共享票不是自己那格）維持跳到那一天/.test(src));
  ok('★★ 滑鼠提示分兩種說法',
     /_canRs\?'點一下改時間':'點一下跳到那一天'/.test(src));
  ok('★★ 二修的理由寫在原地（跳過去那一步對客人沒有用）',
     /但跳過去那一步對客人沒有用：\s*\n\s*他要的就是換時間。改成一下到位/.test(src));
}

console.log('\n①b 視窗裡要標出這張預約的時間');
{
  ok('★★★ 原時段插一格、標「目前」、不可點',
     /const _origM=\(_rs && _rs\.origDate===date && _rs\.origTime\)\?timeToMin\(_rs\.origTime\):null;/.test(src)
     && /class="cag-slot cag-slot-now" disabled/.test(src)
     && /<span class="cag-slot-tag">目前<\/span>/.test(src));
  ok('★★★ 為什麼要自己插（原時段被自己這筆佔著，不會出現在 free 裡）',
     /它被自己這筆預約佔著，本來就不會出現在 free 裡，/.test(src)
     && /少了它，客人會以為原本那個時間不見了/.test(src));
  ok('★★ 插進去要照時間排序（不能掛在最後一格）',
     /mms\.concat\(\[_origM\]\)\.sort\(\(a,b\)=>a-b\)/.test(src));
  ok('★★★ 視窗上方寫出原時段與去向',
     /<div class="qs-orig">原時段　<b>\$\{String\(_rs\.origDate\)\.slice\(5\)\.replace\('-','\/'\)\}　\$\{String\(_rs\.origTime\)\.slice\(0,5\)\}<\/b>　→　請選新的時段<\/div>/.test(src));
  /* 2026-08-31：提示改成只留四條標籤說明，「改期不另扣點」單獨多加一條 */
  ok('★★ 標題跟著換；改期時多一條「不另扣點」',
     /\$\{_rs\?'更改自主訓練時間':'預約自主訓練'\}/.test(src)
     && /\$\{_rs\?'<li>改期不另外扣點；開課 24 小時前可改<\/li>':''\}/.test(src));
  ok('★★★ 改期要用 reschedId 重起 msbStart（沿用舊狀態會改到別筆）',
     /if\(reschedId\)\{ try\{ await msbStart\(reschedId\); \}catch\(_\)\{\} \}/.test(src)
     && /沿用舊的 _msb 會拿到上一次的狀態，改到別筆去/.test(src));
  ok('★★★ 只有「約新的一點」才清 s.resched',
     /if\(!reschedId\) s\.resched=null;/.test(src));
  ok('★★ 視窗裡換日期要把預約 id 帶著走（不然換一天就掉回新增模式）',
     /onclick="memh2SelfSlots\('\$\{x\}','\$\{_lim\}'\$\{_rs\?`,'\$\{_rs\.id\}'`:''\}\)"/.test(src));
}

console.log('\n② 提示圖示只畫在真的改得動的那一顆');
{
  ok('★★★ 時鐘用 ::after 疊上去，不動圓卡的幾何',
     /\.mh2-sbc\.mh2-sbrs::after\{content:'🕒';position:absolute;/.test(src)
     && /\.mh2-sbc\.mh2-sbrs\{position:relative;\}/.test(src));
  ok('★★ class 只在 _canRs 成立時掛上',
     /\$\{_canRs\?' mh2-sbrs':''\}/.test(src));
  ok('★★★ 「不能用就別畫成能用」寫在原地',
     /畫了圖示反而是騙人（「不能用就寫原因，別藏按鈕」的另一面：不能用就別畫成能用）/.test(src));
  ok('★★ 原本的今天綠底／選中金框沒被動到',
     /\.mh2-sbc\.mh2-sbtoday\{background:var\(--green\);border-color:var\(--green\);\}/.test(src)
     && /\.mh2-sbc\.on\{border-color:var\(--gold,#B48A56\);border-width:3px;\}/.test(src));
}

console.log('\n③ 實跑：哪一顆會進改期');
{
  const SESSION={id:'M1'};
  const decide=(b,_cur)=>{
    const _canRs=b.member_id===SESSION.id && b.status==='booked' && b.coach_leave!==true;
    return _canRs?'改時間':'跳到那一天';
  };
  const B=o=>Object.assign({date:'2026-09-07',member_id:'M1',status:'booked',coach_leave:null},o||{});

  eq('★★★ 還沒簽到、是自己的 → 改時間', decide(B(),'2026-09-07'), '改時間');
  eq('★★★ 在別天看也一樣直接改時間（二修：不再需要先跳過去）', decide(B(),'2026-08-31'), '改時間');
  eq('★★★ 已簽到的不給改（status 不是 booked）',
     decide(B({status:'checked_in'}),'2026-09-07'), '跳到那一天');
  eq('★★★ 教練請假被改記成自主訓練的不給改',
     decide(B({coach_leave:true}),'2026-09-07'), '跳到那一天');
  eq('★★★ 家人共享票：這一格不是我的就不給改',
     decide(B({member_id:'M2'}),'2026-09-07'), '跳到那一天');
  eq('　 已完成的也不給改', decide(B({status:'completed'}),'2026-09-07'), '跳到那一天');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
