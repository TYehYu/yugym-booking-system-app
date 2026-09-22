/* 2026-08-03 使用者指示：「今日收款提醒增加［續約］的按鈕，然後這邊統一用手動確認」

   原本「已續約」綠勾是自動判定（同類別有更新的票）——但買了別張票不代表這筆
   談完了。這份名單改成三顆鈕（續約／考慮中／不續約）都由櫃檯手動標；
   行事曆課卡的 🔁 標記維持自動（computeLastBkMarks），不在此列。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 三顆手動鈕');
ok('★ 有［續約］鈕（標中＝綠）',
   /setRenewStatus\('\$\{it\.tkid\}','renewed'\)">續約<\/button>/.test(src)
   && /\.tdl-b-ok\.on\{background:var\(--green,#1f6f54\);border-color:var\(--green,#1f6f54\);\}/.test(src));
/* 2026-09-17：acts 多服務一種名單（待補發票資料的「不再提醒」），所以外層包了一層
   kind 判斷，收款提醒那條退到 return 後面。這一條守的本意沒變：
   已標續約之後按鈕仍然在（可取消或改標），不是標完就消失。 */
ok('★ 已標續約後按鈕仍在（可取消或改標）',
   /return \(kind!=='sign'\|\|!it\.tkid\|\|!it\.rn\)\?'':/.test(src));
/* 2026-09-22 使用者：「分期的會員應該不用出現［續約］［考慮］［不續約］」——
   分期是「這一期的錢到了」，不是「要不要再買一期」，沒有「不續約」可以按。
   ⚠ 一個人可能同時有續課與分期（團課續課＋教練課分期），那還是有續約要談，鈕要留；
     而且 tkid 要指向續課那張票 —— renew_status 標在票上，標到分期票上是標錯地方。 */
ok('★★★ 只有「續課」那種才給三顆鈕（分期不給）',
   /return \(kind!=='sign'\|\|!it\.tkid\|\|!it\.rn\)\?'':/.test(src)
   && /const _isRenew = kind==='renew';/.test(src)
   && /rn:!!e\.renew,/.test(src));
ok('★★★ 同時有續課與分期時，tkid 要換到續課那張票',
   /if\(b\.ticket_id && \(!e\.tkid \|\| \(_isRenew && !e\.renew\)\)\) e\.tkid=b\.ticket_id;/.test(src)
   && /e\.renew 要在換 tkid \*\*之後\*\*才設 true/.test(src));
ok('★ setRenewStatus 支援 renewed 提示', /renewed:'已標記「續約」'/.test(src));
ok('　　按同一顆＝取消標記（原本的 toggle 沒動）', /const next=\(t\.renew_status===st\)\?null:st;/.test(src));

console.log('\n② 統一手動確認');
ok('★ 名單狀態只認手動標記（不再用「有更新的票」自動打綠勾）',
   /const st=\(\(tk&&tk\.renew_status\)\|\|''\);/.test(src)
   && !/const st= done \? 'renewed' :/.test(src));
ok('★ 為什麼改手動，寫在程式裡',
   /買了別張票不代表這筆談完了；\n\s*這份名單改成三顆鈕（續約／考慮中／不續約）都由櫃檯手動標/.test(src));
ok('　　行事曆課卡的 🔁 自動標記不在此列（computeLastBkMarks 沒動）',
   /function computeLastBkMarks/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
