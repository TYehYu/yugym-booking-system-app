/* 2026-08-14 使用者需求：「學生臨時要加課，但課程已被預先預約排滿，
   要先取消一堂才能安排 —— 能不能在新增預約時直接提供調課的選項」
   —— 單筆預約遇到票券不足 → 開調課視窗：列出之後的已排課，
   點一堂＝取消退回＋原參數重送新預約。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 入口：單筆票券不足才開，不搶分期保留的路');
ok('★★ 送出參數抽成 _rrOpts（調課重送同一包）',
   /const _rrOpts=\{\n    member_id, coach_id, substitute_coach_id:null,/.test(src)
   && /const r=await runRecurringBooking\(_rrOpts\);/.test(src));
ok('★★ 在「結果出爐後」才判斷（分期保留 held>0 就不會進來），限教練課單筆',
   /if\(!results\[0\]\.ok && \/票券不足\/\.test\(results\[0\]\.reason\|\|''\) && t\.category==='私人教練'\)\{/.test(src)
   && /const opened=await bkOfferSwap\(\{member_id, type_id, date, time, opts:_rrOpts\}\);\n\s*if\(opened\) return;/.test(src));

console.log('\n② 候選名單（2026-08-14 二修抽成 bkSwapCandidates，步驟 2 無票畫面共用）');
{
  const F=grabFn('bkSwapCandidates');
  ok('★★ 只列：本人、已排未上、有綁票、非保留、未來時段', /b\.status!=='booked'\|\|!b\.ticket_id\|\|b\.pending_contract/.test(F)
     && /if\(d<today\) return false;/.test(F)
     && /if\(d===today && timeToMin\(b\.start_time\)<=nowMin\) return false;/.test(F));
  ok('★ 讓出來的票要能上這次要約的課（票種比對）', /if\(P\.type_id && !bkTicketTypeOk\(t,P\.type_id\)\) return false;/.test(F));
  ok('★★ 退回後要真的約得進新時段（票有效、效期蓋到新日期、限定時段相符）——取消了約不進去＝白取消',
     /if\(t\.status!=='usable'\) return false;/.test(F)
     && /if\(t\.expire_date && String\(t\.expire_date\)\.slice\(0,10\)<String\(P\.date\)\) return false;/.test(F)
     && /!tkTimeOk\(t,P\.date,P\.time\)/.test(F));
  ok('★ 同一格（同日同時）不列', /if\(d===P\.date && String\(b\.start_time\)\.slice\(0,5\)===String\(P\.time\)\.slice\(0,5\)\) return false;/.test(F));
  ok('★ 最遠的排最上（最可能讓出）', /\.sort\(\(a,b\)=>\(b\.date\+String\(b\.start_time\)\)\.localeCompare\(a\.date\+String\(a\.start_time\)\)\)/.test(F));
  const OF=grabFn('bkOfferSwap');
  ok('★ 沒候選就照舊（回 false 顯示原本的票券不足）', /if\(!cands\.length\) return false;/.test(OF));
  ok('　　視窗講清楚會發生什麼（取消退回 1 堂 → 轉到新時段）', /取消並退回 1 堂<\/b>，馬上轉到這次要約的/.test(OF));
}

console.log('\n②-b 步驟 2 無票畫面的調課入口（2026-08-14 使用者指示）');
{
  const G=grabFn('bkStep2Swap');
  /* 2026-08-25 使用者定案（A 案）：這一頁就是「觸發」，不再是說明文字＋兩顆鈕。
     兩條路改成白底列直接問，調課排在上面 —— 那條不會多花錢。 */
  ok('★★ 有可讓的課就跳出「把後面那一堂的票調過來」那一列，說明講堂數',
     /onclick="bkStep2Swap\(\)">\s*\n\s*<span class="ash-eilb">把後面那一堂的票調過來<\/span>/.test(src)
     && /從他之後已排的 \$\{_swapN\} 堂挑一堂讓出來/.test(src));
  ok('★★ 調課排在「先建立這一堂」上面（不會多花錢的那條先給）',
     src.indexOf('把後面那一堂的票調過來') < src.indexOf('<span class="ash-eilb">先建立這一堂'));
  ok('★★ 入口組單堂參數、開同一個調課視窗', /const opened=await bkOfferSwap\(\{member_id:C\.member_id, type_id:C\.type_id, date:C\.date, time:C\.time, opts\}\);/.test(G));
}

console.log('\n③ 執行：取消退回＋原參數重送');
{
  const G=grabFn('_bkSwapPick');
  ok('★★ 一律退回票券（force；調課不是臨時取消，不套 24 小時扣課）',
     /await cancelBooking\(bkId,'force',\{silent:true\}\);/.test(G));
  ok('★★ 用同一包參數重送新預約', /const r=await runRecurringBooking\(P\.opts\);/.test(G));
  ok('★ 那一堂剛好被動過要擋（先重讀狀態）', /if\(!old\|\|old\.status!=='booked'\)\{ done\(\); showToast\('那一堂剛剛已變動/.test(G));
  ok('★ 新預約失敗也講清楚（堂數已退回，請重新預約）', /原堂已取消退回，但新預約未成立/.test(G));
  ok('　　防連點', /bkSwapPick\(bkId\)\{ return onceAct\('bkswap:'\+bkId/.test(src));
  ok('　　完成後走既有的 bkAfterSubmit 重繪', /try\{ bkAfterSubmit\(\); \}catch\(_\)\{ navTo\(CUR_PAGE\); \}/.test(G));
}
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
