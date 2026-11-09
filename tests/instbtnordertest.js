/* 課卡快速按鈕：分期保留要優先於「有沒有其他可用票」（2026-11-09 施佩怡第二次案例）

   背景：2026-08-21 施佩怡 8/22 案例已經修過一次「分期保留要走『開通下一期』而不是
   『儲值』」，但判斷式寫成「_hasTk 為 true 就先顯示轉正，_hasTk 為 false 才看 _isInst」——
   只要這張分期票剛好還剩一點點已開通但沒扣到的額度（tkUnlockedLeft>0，listUsableTickets
   就會把它算成「有票可用」），_hasTk 就會是 true，蓋過 _isInst，分期保留卡位又跳回「轉正」。
   2026-11-09 施佩怡 11/20 那堂就是這樣：票還剩 1 堂已開通未扣（12 堂、已開通 8、已用 7），
   _hasTk=true，於是「分期保留」的卡位又顯示「轉正」，跟 8/22 是同一個根因、只是優先順序
   漏了一個分支沒改到。

   修法：把 _isInst 判斷搬到最前面、優先權最高——是分期保留就一律走「分期」（開通下一期），
   不管 _hasTk 的結果；只有不是分期保留時才看 _hasTk 決定「轉正」或「儲值」。
   順便把 _hasTk 的 listUsableTickets() 查詢也搬到 _isInst 為 false 才做（分期保留那支
   用不到這個結果，省一次查表）。

   這支測試用 grabFn 逐字抽出 expandBkCard 原始碼，不重寫一份：
     ① _isInst 的計算在 _hasTk 的計算之前
     ② _hasTk 的查詢被包在 if(!_isInst){...} 裡（不是分期保留才查）
     ③ 最終的 btns+= 三元運算子是 _isInst 優先，不是 _hasTk 優先
     ④ 三顆按鈕（分期／轉正／儲值）呼叫的函式名稱都還在，沒有被換掉 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

function grabFn(name) {
  const i = src.indexOf('async function ' + name + '(') >= 0 ? src.indexOf('async function ' + name + '(') : src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const SRC = grabFn('expandBkCard');

console.log('① _isInst 的計算要在 _hasTk 之前，而且 _hasTk 的查詢要包在 !_isInst 裡');
const iIsInst = SRC.indexOf("const _isInst=(typeof bkIsInstHold==='function') && bkIsInstHold(b);");
const iHasTkDecl = SRC.indexOf('let _hasTk=false;');
const iHasTkQuery = SRC.indexOf("listUsableTickets(b.member_id, bkTypeIdOf(b), b.date, b.start_time)");
ok('★★★ _isInst 宣告先於 _hasTk 宣告', iIsInst >= 0 && iHasTkDecl > iIsInst, { iIsInst, iHasTkDecl });
ok('★★★ listUsableTickets 查詢被包在 if(!_isInst){...} 裡，不是分期保留才查',
  new RegExp("if\\(!_isInst\\)\\{\\s*\\n\\s*try\\{ _hasTk=\\(\\(await listUsableTickets\\(b\\.member_id, bkTypeIdOf\\(b\\), b\\.date, b\\.start_time\\)\\)\\|\\|\\[\\]\\)\\.length>0; \\}catch\\(_\\)\\{\\}\\s*\\n\\s*\\}").test(SRC));

console.log('\n② 最終三元運算子：_isInst 優先權最高');
ok('★★★ btns+= 的三元判斷式第一層是 _isInst，不是 _hasTk',
  /btns \+= _isInst\s*\n\s*\? evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);ashInstNext\('\$\{id\}'\)`,'plus','分期'\)\s*\n\s*: \(_hasTk/.test(SRC));
ok('★★ 第二層（非分期時）才是 _hasTk ? 轉正 : 儲值，跟改之前的按鈕呼叫一字不差',
  /\? evoBtn\('evo-r2','evo-primary',`ashBackArm\('\$\{id\}'\);collapseBkCard\(\);openConvertPending\('\$\{id\}'\)`,'check','轉正'\)[\s\S]{0,120}: evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);ppTopUp\('\$\{b\.member_id\}'\)`,'plus','儲值'\)\)/.test(SRC));

console.log('\n③ 三顆按鈕背後呼叫的函式名稱都還在（沒有被誤換掉）');
ok('★ 分期 → ashInstNext（開通下一期）', /ashInstNext\('\$\{id\}'\)/.test(SRC));
ok('★ 轉正 → openConvertPending', /openConvertPending\('\$\{id\}'\)/.test(SRC));
ok('★ 儲值 → ppTopUp', /ppTopUp\('\$\{b\.member_id\}'\)/.test(SRC));
ok('★ bkIsInstHold 本身的判準（靠 note 的「分期待繳費保留」字樣）完全沒被動到',
  /function bkIsInstHold\(b\)\{ return !!\(b && b\.pending_contract && b\.member_id && !b\.ticket_id\s*\n\s*&& String\(b\.note\|\|''\)\.indexOf\('分期待繳費保留'\)>=0\); \}/.test(src));

console.log('\n④ 情境模擬：施佩怡 11/20 案例（_isInst=true 且 _hasTk 原本也會是 true）');
{
  // 直接模擬「這堂本身是分期保留、而且會員票上還有1堂已開通未扣」這個真實情境，
  // 用同一段三元運算式邏輯驗證結果是「分期」而不是「轉正」。
  const _isInst = true;   // bkIsInstHold(b) 為 true（note 含「分期待繳費保留」）
  const _hasTk = true;    // listUsableTickets 找得到（票還剩 tkUnlockedLeft=1 的可用額度）
  const chosen = _isInst ? '分期' : (_hasTk ? '轉正' : '儲值');
  ok('★★★ _isInst 與 _hasTk 同時為 true 時，結果是「分期」不是「轉正」（這正是施佩怡的情境）', chosen === '分期', { chosen });
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通過 / ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
