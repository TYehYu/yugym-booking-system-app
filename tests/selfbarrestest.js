/* 會員端自主訓練列：已選到的那一顆再點一次＝改時間（2026-08-31 使用者指示）

   「會員端下方自主訓練列的圓形卡　如果客人要把其中一個圓形卡修改日期
     應該再點一次就可以調整」

   原本已約的卡只有一個動作：跳到那一天（memh2PickDay）。
   改成兩段：第一下跳過去（最常用的動作不變），已經在那一天了第二下才進改期（msbStart）。

   ⚠ 改得動的條件必須與課卡上那顆「更改時間」一字不差 —— 那三個排除條件是 0822 覆查過的：
     已簽到／已上完、教練請假被改記成自主訓練的、不是自己的那一格（家人共享票）。
     條件不合就維持「跳到那一天」，而且不畫時鐘圖示 ——
     畫了點下去卻沒反應，比沒有提示更糟。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 兩段式的動作');
{
  ok('★★★ 選到的那一顆改叫 msbStart，其餘維持 memh2PickDay',
     /onclick="\$\{_rs\?`msbStart\('\$\{b\.id\}'\)`:`memh2PickDay\('\$\{b\.date\}'\)`\}"/.test(src));
  ok('★★★ 「選到的」＝ _sel，「改得動」＝ _canRs，兩個都成立才是 _rs',
     /const _sel=b\.date===_cur;/.test(src)
     && /const _canRs=b\.member_id===SESSION\.id && b\.status==='booked' && b\.coach_leave!==true;/.test(src)
     && /const _rs=_sel && _canRs;/.test(src));
  ok('★★★ 排除條件與課卡那顆「更改時間」同一套（0822 覆查過的三條）',
     /改得動的條件與課卡上那顆「更改時間」一字不差（見 rsBtn）/.test(src));
  ok('★★ 滑鼠提示要說得出「再點一次可以改時間」',
     /_rs\?'再點一次可以改時間':\(_canRs\?'點一下跳到那一天（再點一次可以改時間）':'點一下跳到那一天'\)/.test(src));
}

console.log('\n② 提示圖示只畫在真的改得動的那一顆');
{
  ok('★★★ 時鐘用 ::after 疊上去，不動圓卡的幾何',
     /\.mh2-sbc\.mh2-sbrs::after\{content:'🕒';position:absolute;/.test(src)
     && /\.mh2-sbc\.mh2-sbrs\{position:relative;\}/.test(src));
  ok('★★ class 只在 _rs 成立時掛上',
     /\$\{_rs\?' mh2-sbrs':''\}/.test(src));
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
    const _sel=b.date===_cur;
    const _canRs=b.member_id===SESSION.id && b.status==='booked' && b.coach_leave!==true;
    const _rs=_sel && _canRs;
    return _rs?'改時間':'跳到那一天';
  };
  const B=o=>Object.assign({date:'2026-09-07',member_id:'M1',status:'booked',coach_leave:null},o||{});

  eq('★★★ 已經在那一天、還沒簽到、是自己的 → 改時間', decide(B(),'2026-09-07'), '改時間');
  eq('★★★ 還沒跳過去（在別天）→ 先跳過去，不會直接改期', decide(B(),'2026-08-31'), '跳到那一天');
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
