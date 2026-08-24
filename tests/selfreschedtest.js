/* 2026-08-09 使用者回報：「會員說他不能自己修改預約的時間，想把今天早上的自主訓練
   改到晚上 —— 是沒有這個功能、還是客人不會操作、還是操作不夠人性化呢」

   查下來三個都沾一點，但真正的問題是規則自己在打架：

   ① 功能一直都有（msbStart(bookingId) → fn_member_self_reschedule），
      但入口只出現在「點數用完」的那個空面板裡 ——
      還有點數的人根本看不到，「我的預約」清單與課卡視窗都只有「取消」。
   ② 就算找得到也用不了：改期綁著「開課前 24 小時」，今天早上的課早就過了。
   ③ 但他其實做得到 —— 自主訓練的「取消」隨時可以而且一定退點
      （2026-08-01 江俊輝案例定案：不佔教練時間，取消不扣點），
      取消再重約就成了，只是要兩步、而且中間那個時段可能被別人搶走。

   → 同樣的結果，寬鬆的路（取消重約）開著，嚴格的路（改期）擋著，而且還藏起來。
   使用者補充規則後定案：自主訓練改期與取消同一條界線（還沒開始就可以），入口放出來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 入口放到會員真的會點的地方');
ok('★★ 我的預約・當日清單：自主訓練有「改時間」，與「取消」並排',
   /else if\(isSelf\) actionBtn=`<button class="btn btn-ghost btn-sm" onclick="event\.stopPropagation\(\);msbStart\('\$\{b\.id\}'\)">改時間<\/button>`/.test(src)
   && /\+`<button class="btn btn-ghost btn-sm" style="margin-left:6px;" onclick="event\.stopPropagation\(\);memCancelSelf\('\$\{b\.id\}'\)">取消<\/button>`/.test(src));
ok('★ 點按鈕不會順便觸發整列的動作', (src.match(/event\.stopPropagation\(\);msbStart/g)||[]).length>=1);
ok('★★ 課卡彈窗：多一顆「改時間」圓鈕',
   /let rsBtn=\(!done && !past && bkIsSelf\(b\) && b\.member_id===SESSION\.id\)\n\s*\? orb\('go','🕒','改時間',`memTaskClose\(\);msbStart\('\$\{b\.id\}'\)`\) : '';/.test(src));
/* 2026-08-24：三顆鈕改成 let —— 預覽用的範例課卡要把它們換成「點了只吐司」的版本
   （見 PAGES.mem_bookings 的 _memDemoBk），值本身的算法一個字都沒動。 */
ok('★ 範例卡把三顆鈕換掉，不動資料',
   /if\(_demo\)\{/.test(src)
   && /這是預覽用的範例課卡，真的會員在這裡按下去才會真的動作/.test(src));
ok('★ 圓鈕排在簽到與取消之間', /<div class="mtp-orbs">\$\{ckBtn\}\$\{rsBtn\}\$\{cxBtn\}<\/div>/.test(src));
ok('★ 已上完／已過時的課不出現改時間（與取消同一條）',
   /let rsBtn=\(!done && !past && bkIsSelf\(b\)/.test(src));
ok('★ 只有自己的自主訓練才給改（別人的、教練課的都不出現）',
   /bkIsSelf\(b\) && b\.member_id===SESSION\.id/.test(src));
ok('　　為什麼原本找不到，寫在原地',
   /功能一直都有（msbStart），但入口只出現在「點數用完」的空面板裡，\s*\n\s*還有點數的人根本看不到，只看得到「取消」。/.test(src));

console.log('\n② 規則：改期與取消同一條界線');
{
  const mig=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260809_self_reschedule_no_24h.sql';
  ok('★ migration 有進版控', fs.existsSync(mig));
  const sql=fs.readFileSync(mig,'utf8');
  ok('★★ 24 小時那條改成「原時段還沒開始」',
     /'if \(\(b\.date \|\| '' '' \|\| b\.start_time\)::timestamp at time zone ''Asia\/Taipei''\) <= now\(\) then'\);/.test(sql));
  ok('★★ 改法是把現有函式定義取出、只替換那一行再寫回（不手寫整支）',
     /select pg_get_functiondef\(p\.oid\) into d/.test(sql)
     && /d := replace\(d,/.test(sql));
  ok('★ 找不到預期的那一行就中止，不會亂改',
     /raise exception 'fn_member_self_reschedule 的時間限制已不是預期的樣子，請人工確認';/.test(sql));
  ok('★★ 為什麼 24 小時對自主訓練沒有道理，寫在 migration 裡',
     /那條規則本來是保護教練的時間，\n-- 自主訓練不佔教練（2026-08-01 就是為了這個理由把「取消」的 24 小時拿掉的）。/.test(sql));
  ok('★ 也寫下「改期其實比取消重約更好」的理由',
     /改期其實更好（時段直接換過去，\n-- 不會在取消到重約之間被別人搶走）。/.test(sql));
  ok('★ 使用者說明的規則全文記下來',
     /「會員只能自己修改團體課跟自主訓練。自主訓練取消不扣課，反正使用期限只有七天。\n--     團體課 24 小時前可以取消跟請假，24 小時內只能選擇請假（補課券）。」/.test(sql));
}

console.log('\n③ 既有的自助規則沒被動到');
ok('　　自主訓練取消仍是「一律退點」（2026-08-01 定案）',
   /24 小時規則是為了保護「教練的時間」，自主訓練不佔教練，套那條沒有道理。/.test(src)
   && /<b>會退回 1 點<\/b>　自主訓練不佔教練時間，取消不扣點。/.test(src));
ok('　　改期仍走 RPC（本人驗證與時段檢查都在 DB 端）',
   /sb\.rpc\('fn_member_self_reschedule',\{p_booking_id:bid,p_date:s\.date,p_start_time:t,p_venue_unit:vbk\.venue_unit\|\|null\}\)/.test(src));
ok('　　改期不扣不退（點數已經扣在原本那筆上）',
   /改期沿用跑步機/.test(src) && /不扣不退/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
