/* 2026-08-07 使用者回報：「今天 20:00 的團課，昨天系統沒有通知耶」

   查下來推播排程正常（每 30 分鐘、鎖定 24 小時後那個時段）、兩位會員也都綁了 LINE、
   提醒也開著 —— 問題在 LINE 的 push 對「登入過但沒把官方帳號加為好友」的人會直接被拒，
   而失敗只在回應裡回一個數字 failed:N，櫃檯與會員都不會知道。

   使用者定案「都改」：
     ① 同一人只發一則（團課同一個人佔 2–3 個名額時原本會收到 2–3 則一樣的提醒）
     ② 失敗要留下紀錄：寫櫃檯通知＋記在會員身上
     ③ 會員資料頁標紅「⚠ 提醒送不到」

   ①② 在 Edge Function line-push-daily v8（Supabase 端，不在本檔）；
   本測試顧的是前端這一段：會員資料頁的標記與欄位相容性。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 會員資料頁：綁了 LINE 但送不到要看得出來');
{
  const i=src.indexOf('const lineItem = (()=>{');
  const box=src.slice(i, src.indexOf('})();', i)+5);
  ok('★ 沒綁 LINE → 照舊顯示未綁定', /if\(!r\.line_user_id\) return .*未綁定/.test(box));
  ok('★ 綁了 → 通知開關照舊', /onchange="ppToggleLineNotify\('\$\{r\.id\}'\)"/.test(box));
  ok('★★ 有失敗紀錄 → 紅色「⚠ 提醒送不到」', /⚠ 提醒送不到/.test(box)
     && /color:var\(--danger,#b5372e\)/.test(box));
  ok('★ 滑過去看得到原因與日期（title）',
     /title="\$\{String\(r\.line_push_error\|\|'推播失敗'\)\.replace\(\/"\/g,'&quot;'\)\}（\$\{_pf\}）"/.test(box));
  ok('★ 沒失敗就完全不顯示（不要每個人都掛一個標）',
     /const failTag = _pf\n\s*\? `<span class="tag"/.test(box) && /: '';/.test(box));
  ok('　　日期只留月/日（表頭空間有限）', /String\(r\.line_push_failed_at\)\.slice\(5,10\)\.replace\('-','\/'\)/.test(box));
}

console.log('\n② 欄位相容性');
{
  /* members 不在 LEAN_DROP 裡（只有 bookings 有），所以新欄位會照常帶回列表。
     這一項是防呆：哪天有人把 members 加進 LEAN_DROP，要記得別把這兩欄丟掉。 */
  const i=src.indexOf('const LEAN_DROP={');
  const box=src.slice(i, src.indexOf('};', i)+2);
  ok('★ members 沒有被精簡（line_push_failed_at 讀得到）', !/members:/.test(box));
  ok('　　萬一日後加了 members，這兩欄不能在丟棄清單裡',
     !/line_push_failed_at/.test(box) && !/line_push_error/.test(box));
}

console.log('\n③ 這件事的來龍去脈要留在程式裡');
ok('★ 寫清楚「綁了 LINE 不等於收得到」',
   /綁了 LINE 不等於收得到：LINE 的推播對「沒有把官方帳號加為好友」的人會直接被拒/.test(src));
ok('★ 寫清楚旗標由誰寫、何時清',
   /推播失敗時 line-push-daily 會把時間與原因寫回會員身上（成功一次就自己清掉）/.test(src));
ok('　　使用者的原話寫在程式裡', /今天 20:00 的團課，昨天系統沒有通知/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
