/* 兩條 2026-08-29 使用者定案的規則

   「無限卡上限就抓30堂」
   「待簽約排12堂 但實際8堂的情境　預約的時候把後面多的卡位刪除　給訊息提示確認」

   ① 自訂銷售的堂數上限 30 —— 起因是 0828 查到正式庫有一張 9,955 堂的票
      （魚媽劉媽的「無限卡」，就是在自訂銷售那一格打 9999 打出來的）。
      0828 使用者另外定過「所以無限卡只有管理員可以發放」，所以上限對管理員是警語、
      對其他人是硬擋 —— 兩句話要同時成立。
   ② 買了票之後的「補扣」視窗，把超出票券堂數的待簽約卡位一起清掉。
      這就是吳宜玲那種紅虛線超約圓點的來源。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 自訂銷售堂數上限 30');
{
  ok('★★ 上限是 30，寫成常數', /const GT_SESSIONS_MAX=30;/.test(src));
  ok('★★ 兩句話的來龍去脈都寫在原地（9,955 那張票、以及「只有管理員可以發放」）',
     /9,955 堂的票/.test(src) && /所以無限卡只有管理員可以發放/.test(src));

  /* 連常數一起切進來 —— 上限值本身就是規則的一部分，用假的等於沒驗 */
  const seg=src.slice(src.indexOf('const GT_SESSIONS_MAX=30;'), src.indexOf('/* 堂數那一格底下的提示'));
  const mk=role=>new Function('SESSION', seg+'\nreturn {gtSessionsBad, gtSessionsWarn};')({role});
  const desk=mk('front_desk'), admin=mk('admin'), coach=mk('coach');
  eq('★★ 櫃檯 30 堂 → 放行', desk.gtSessionsBad(30), '');
  ok('★★ 櫃檯 31 堂 → 擋，而且說得出「只有管理員能發放」',
     /只有管理員能發放/.test(desk.gtSessionsBad(31)), desk.gtSessionsBad(31));
  ok('★★ 教練也一樣擋', /只有管理員能發放/.test(coach.gtSessionsBad(31)));
  eq('★★ 管理員 31 堂 → 不擋（無限卡由管理員發）', admin.gtSessionsBad(31), '');
  ok('★★ 但管理員要看到警語（別手滑打成 9999）',
     /超過 30 堂（無限卡等級），確定是這個數字嗎？/.test(admin.gtSessionsWarn(9999)));
  eq('★★ 30 以下不警告', admin.gtSessionsWarn(30), '');
  eq('　 空值不當成超過', desk.gtSessionsBad(null), '');
}

console.log('\n② 兩道門都要吃這個上限');
{
  ok('★★ 前門：自訂銷售的「下一步」會被鎖住',
     /const ok=!!\(p && p\.name && p\.ticket_type_id && p\.sessions_base>0\)\s*\n\s*&& !gtSessionsBad\(p&&p\.sessions_base\);/.test(src));
  ok('★★ 後門：更換方案的自訂欄位（_doSwapTicket）也擋',
     /\{ const _sbad=gtSessionsBad\(_sess\); if\(_sbad\)\{ done\(\); showToast\(_sbad, 7000\); return; \} \}/.test(src));
  ok('★★ 理由寫在欄位底下，不是只把按鈕變灰（0823 語彙）',
     /function grantCustomSessionsHint\(p\)\{/.test(src)
     && /el\.innerHTML=\(bad\|\|warn\)\?`<i>\$\{bad\|\|warn\}<\/i>`:'';/.test(src)
     && /<div class="gt-unitbox" id="gt-c-smax" style="display:none;"><\/div>/.test(src));
  ok('★★ 欄位標題直接寫上限（打之前就看得到）',
     /<label>堂數 \*<span class="lb-warn">上限 \$\{GT_SESSIONS_MAX\} 堂<\/span><\/label>/.test(src));
  ok('★★ 不寫 max 屬性 —— 管理員要打得進去（理由寫在原地）',
     /不寫 max —— 管理員可以越線發無限卡（0828 定案），欄位鎖死反而變成/.test(src)
     && !/id="gt-c-sessions" min="1" max=/.test(src));
}

console.log('\n③ 補扣視窗：超出票券堂數的待簽約卡位');
{
  /* 2026-08-31 劉雪珠案例：分期票多切一段「還沒繳到的期數」（_hold）——
     那一段不是「超出堂數」，不能拿去問要不要取消。非分期票的切法完全沒變。 */
  ok('★★ 先把全部算出來，再切成「補得起的」／「還沒繳到的」／「超出的」',
     /const _allUnpaid=await unpaidFutureBookings\(memberId,tk\);/.test(src)
     && /const list=_allUnpaid\.slice\(0,left\);/.test(src)
     && /const _hold=_inst \? _allUnpaid\.slice\(left, _rem\) : \[\];/.test(src)
     && /const over=_allUnpaid\.slice\(_inst\?_rem:left\)\.filter\(b=>b && b\.pending_contract===true\);/.test(src));
  ok('★★★ 只取 pending_contract —— 其餘沒綁票的是教練負責的免費名額，不能一起刪',
     /只挑 pending_contract 的卡位。剩下那些「沒綁票也不是待簽約」的是\s*\n\s*教練負責的免費名額（下面那句「先不補扣」講的就是它們），絕對不能一起刪。/.test(src));
  ok('★★ 會被刪除的日期要列出來（按下去之前先看到）',
     /另外還有 <b>\$\{over\.length\}<\/b> 堂待簽約卡位<b>超出這張票的堂數<\/b>，會一併刪除：/.test(src)
     && /\$\{over\.slice\(0,6\)\.map\(_od\)\.join\('、'\)\}\$\{over\.length>6\?`…等 \$\{over\.length\} 堂`:''\}/.test(src));
  /* 2026-09-01 使用者定案：「教練如果簽約 8 堂　後面的 4 堂要刪除不保留
     教練要自己再去建立待簽約的課卡」＋「不能讓帳面有多於該會員票券的預約」——
     0829 那顆「只補扣、把多的留著」的鈕退場，只剩一條路。 */
  ok('★★★ 「只補扣、留著多的」那條路已退場（帳面不留比票券多的預約）',
     !/doChargeUnpaid\(\)">只補扣 \$\{list\.length\} 堂<\/button>/.test(src)
     && /不能讓帳面有多於該會員票券的預約/.test(src));
  ok('★★★ 超出時只有一顆鈕，而且把兩件事都寫在鈕上',
     /<button class="btn btn-red" onclick="doChargeUnpaid\(1\)">補扣 \$\{list\.length\} 堂並刪除多的 \$\{over\.length\} 堂<\/button>/.test(src));
  ok('★★★ 分期不在此列：未開通的那一段仍然保留（走 _hold，不是 over）',
     /客人買 12 堂分期、有效票券只有 4 堂，\s*\n\s*這時候還是要幫她保留後面 8 堂待簽約的預約/.test(src)
     && /const _hold=_inst \? _allUnpaid\.slice\(left, _rem\) : \[\];/.test(src)
     && /const over=_allUnpaid\.slice\(_inst\?_rem:left\)/.test(src));
  ok('★★ 刪除之後要教練自己重建（畫面講出來，不要讓人以為系統會留著）',
     /之後還要上，請教練重新建立待簽約的課卡/.test(src));
  ok('★★ 沒有超出時畫面一個字都沒變（原本那顆鈕原封不動）',
     /`<button class="btn btn-red" onclick="doChargeUnpaid\(\)">確認補扣 \$\{list\.length\} 堂<\/button>`/.test(src));
  ok('★★ 沒按紅色那顆就什麼都不取消（旗標傳進來才做）',
     /async function doChargeUnpaid\(dropOver\)\{/.test(src) && /if\(dropOver\)\{/.test(src));
  ok('★★ 每一筆都重讀再確認一次狀態（畫出來到按下去之間可能被別人動過）',
     /if\(!b \|\| b\.status!=='booked' \|\| b\.pending_contract!==true \|\| b\.ticket_id\) continue;/.test(src));
  ok('★★ 取消要留下原因（之後查得到這堂是怎麼沒的）',
     /b\.note=\(b\.note\?b\.note\+'｜':''\)\+'超出票券堂數，補扣時自動取消';/.test(src));
  ok('★★ 做了幾筆要講出來，不能默默消失',
     /\+\(dropped\?`，並取消多出的 \$\{dropped\} 堂卡位`:''\)\);/.test(src));
  ok('　 與「整串轉正」那條路同一個語彙（那邊本來就會列出要取消的時段）',
     /超出簽約堂數 → 取消/.test(src) && /簽約堂數不含此堂，轉正時自動取消/.test(src));
}

console.log('\n④ 無限卡整張只畫一顆 ∞');
{
  /* 2026-08-29 使用者附截圖：「這張親友自主訓練 改成無限卡　出現一個圓形卡的圖案就好
     中間給一個無限的符號　只能約自主訓練效期1年」——
     原本畫 60 顆圓點再補一張「不限堂數」的籤（9,955 堂）。 */
  ok('★★ ticketTokens 一進來就先處理無限卡（後面整段算 used／超約對它沒意義）',
     /if\(typeof tkUnlimited==='function' && tkUnlimited\(t\)\)\{\s*\n\s*return `<span class="mtk mtk-inf" style="--tk-acc:\$\{v\.accent\};" title="無限卡・不限堂數">∞<\/span>`;/.test(src));
  ok('★★ 判準用 tkUnlimited，不要在這裡另寫一個門檻',
     /function tkUnlimited\(t\)\{ return \(Number\(t&&t\.sessions_total\)\|\|0\)>=999; \}/.test(src));
  ok('★★ 樣式只多一條（吃課種色的實心圓，字放大）',
     /\.mtk-inf\{font-size:19px;font-weight:700;letter-spacing:0;\}/.test(src));
  ok('　 原因寫在原地', /圓點格子是拿來數「剩幾堂」的，無限卡沒有這件事/.test(src));
  /* 2026-08-29 使用者：「這張無限卡右上角顯示8/9999　這個數字還有意義嗎　
     還是改成使用次數　統計這張無限卡用了幾次」 */
  ok('★★ 票券夾右上角：無限卡寫「已使用 N 次」，不寫 N / 9999',
     /\$\{tkUnlimited\(t\)\s*\n\s*\? `<span style="color:var\(--t3\);font-weight:600;font-size:13px;">已使用 <\/span><b style="color:var\(--green\);">\$\{usedCount\}<\/b><span style="color:var\(--t3\);font-weight:600;font-size:13px;"> 次<\/span>`/.test(src));
  ok('★★ 一般票券那一行一個字都沒動',
     /`<b style="color:var\(--green\);">\$\{usedCount\}<\/b><span style="color:var\(--t3\);font-weight:600;font-size:13px;"> \/ \$\{total\}<\/span>`/.test(src));
  ok('　 9999 是哨兵值不是張數，理由寫在原地',
     /9999 是哨兵值不是張數，寫出來只會讓人以為真的買了 9999 堂/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
