/* 課卡快速按鈕順序：轉正 → 分期 → 儲值（2026-11-10 Phase 2A，負責人確認）

   歷史：
   ・2026-08-21：順序是「轉正 → 分期（靠備註標記）→ 儲值」。
   ・2026-11-09 施佩怡案例：改成「分期保留優先於轉正」（本檔舊版就是在釘那個順序）。
   ・2026-11-10 負責人確認新規則，**取代 11-09 的優先順序**：
       ① 有符合預約、已開通且可用的堂數 →「轉正」（已標記的分期保留課也一樣）；
       ② 沒有可用堂數，但同票種（含相容）的原分期票尚有未開通堂數 →「分期」／「分期（待確認）」；
       ③ 兩者都沒有才「儲值」。
     所以這支測試現在釘的是新順序；施佩怡 11/20 的情境（標記的保留課＋票還剩已開通額度）依新規則顯示「轉正」。

   ⚠ 這支測試讀的是**本檔所在 repo 的 index.html**（__dirname/..），不是 $HOME 下的原專案。
   本檔逐字抽出 expandBkCard 與 bkCardPayKind 原始碼，不重寫一份。 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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

console.log('① 判斷資料的取得：_hasTk 一律先算（不再被 _isInst 包住），分期候選只在沒有可用堂數時才算');
const iIsInst = SRC.indexOf("const _isInst=(typeof bkIsInstHold==='function') && bkIsInstHold(b);");
const iHasTk = SRC.indexOf('let _hasTk=false, _tkErr=false;');
const iCls = SRC.indexOf('let _instCls=null;');
const iKind = SRC.indexOf('const _pk=bkCardPayKind(_hasTk, _isInst, _instCls);');
ok('★★★ 宣告順序：_isInst → _hasTk → _instCls → _pk', iIsInst >= 0 && iHasTk > iIsInst && iCls > iHasTk && iKind > iCls, { iIsInst, iHasTk, iCls, iKind });
ok('★★★ listUsableTickets 查詢不再被 if(!_isInst) 包住（已標記的保留課也要先看有沒有可用堂數）',
  /try\{ _hasTk=\(\(await listUsableTickets\(b\.member_id, bkTypeIdOf\(b\), b\.date, b\.start_time\)\)\|\|\[\]\)\.length>0; \}catch\(_\)\{ _tkErr=true; \}/.test(SRC)
  && !/if\(!_isInst\)\{\s*\n\s*try\{ _hasTk=/.test(SRC));
ok('★★ 分期候選只在沒有可用堂數時才算，算不出來（含票種資料載入失敗）就當作 error，不給儲值',
  /if\(!_hasTk\)\{\s*\n\s*try\{\s*\n\s*if\(_tkErr \|\| !\(await bkEnsureTtCache\(\)\)\) _instCls=\{strict:\[\],review:\[\],error:true\};\s*\n\s*else _instCls=bkInstCandidates\(b, \(await dbGetAll\('member_tickets'\)\)\|\|\[\], ymd\(TODAY\)\);\s*\n\s*\}catch\(_\)\{ _instCls=\{strict:\[\],review:\[\],error:true\}; \}/.test(SRC));

console.log('\n② 最終三元運算子：轉正 → 分期 → 儲值');
ok('★★★ btns+= 第一層是轉正（_pk.kind===\'convert\'），第二層才是分期，最後才是儲值',
  /btns \+= _pk\.kind==='convert'\s*\n\s*\? evoBtn\('evo-r2','evo-primary',`ashBackArm\('\$\{id\}'\);collapseBkCard\(\);openConvertPending\('\$\{id\}'\)`,'check','轉正'\)[\s\S]{0,80}: \(_pk\.kind==='inst'\s*\n\s*\? evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);ashInstNext\('\$\{id\}'\)`,'plus',_pk\.label\)\s*\n\s*: evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);bkTopUpFromCard\('\$\{id\}'\)`,'plus','儲值'\)\);/.test(SRC));
ok('★★★ 預約卡上沒有任何一顆按鈕直接呼叫 ppTopUp（一律經 bkTopUpFromCard 再檢查）', !/collapseBkCard\(\);ppTopUp\(/.test(SRC));

console.log('\n③ 三顆按鈕背後的函式都還在，bkIsInstHold 沒被動到');
ok('★ 分期 → ashInstNext', /ashInstNext\('\$\{id\}'\)/.test(SRC) && /async function ashInstNext\(bid\)\{/.test(src));
ok('★ 轉正 → openConvertPending', /openConvertPending\('\$\{id\}'\)/.test(SRC));
ok('★ 儲值 → bkTopUpFromCard → ppTopUp（檢查通過才開銷售視窗）', /bkTopUpFromCard\('\$\{id\}'\)/.test(SRC) && /return ppTopUp\(L\.b\.member_id\);/.test(src));
ok('★ bkIsInstHold 本身的判準（靠 note 的「分期待繳費保留」字樣）完全沒被動到',
  /function bkIsInstHold\(b\)\{ return !!\(b && b\.pending_contract && b\.member_id && !b\.ticket_id\s*\n\s*&& String\(b\.note\|\|''\)\.indexOf\('分期待繳費保留'\)>=0\); \}/.test(src));

console.log('\n④ bkCardPayKind 真值表（實際執行原始碼裡的函式）');
{
  const bkCardPayKind = new Function('return ' + grabFn('bkCardPayKind'))();
  const t = id => ({ id });
  const strict1 = { strict: [t('A')], review: [] };
  const strict2 = { strict: [t('A'), t('B')], review: [] };
  const reviewOnly = { strict: [], review: [{ t: t('S'), reasons: ['shared'] }] };
  const strict1Review = { strict: [t('A')], review: [{ t: t('S'), reasons: ['expired'] }] };
  const none = { strict: [], review: [] };
  const err = { strict: [], review: [], error: true };
  const k = (h, i, c) => bkCardPayKind(h, i, c);
  ok('★★★ 有可用堂數 → 轉正，不管有沒有標記、有沒有分期候選',
     k(true, false, none).kind === 'convert' && k(true, true, none).kind === 'convert' && k(true, true, strict1).kind === 'convert' && k(true, false, null).kind === 'convert');
  ok('★★★ 施佩怡 11/20 的情境（標記的保留課＋票還剩已開通額度）依新規則 → 轉正', k(true, true, strict1).label === '轉正');
  ok('★★ 沒有可用堂數＋已標記＋唯一嚴格符合＋沒有其他疑點 → 「分期」', k(false, true, strict1).kind === 'inst' && k(false, true, strict1).label === '分期');
  ok('★★ 未標記＋唯一嚴格符合 → 「分期」（文字一律「分期」，kind 仍是 inst）', k(false, false, strict1).kind === 'inst' && k(false, false, strict1).label === '分期');
  ok('★★ 多張嚴格符合 → 「分期」（已標記也一樣；擋收款在點擊後的查核畫面）', k(false, false, strict2).label === '分期' && k(false, true, strict2).label === '分期' && k(false, true, strict2).kind === 'inst');
  ok('★★ 只有需要查核的候選（共享／過期…）→ 「分期」，不是儲值', k(false, true, reviewOnly).kind === 'inst' && k(false, false, reviewOnly).label === '分期');
  ok('★★ 已標記＋唯一嚴格符合，但還有需要查核的候選 → 「分期」（kind 仍是 inst，不是儲值）', k(false, true, strict1Review).label === '分期' && k(false, true, strict1Review).kind === 'inst');
  ok('★★★ 候選算不出來（error 或沒有資料）→ 絕不給「儲值」', k(false, false, err).kind === 'inst' && k(false, true, null).kind === 'inst' && k(false, false, undefined).kind === 'inst');
  ok('★★★ 沒有可用堂數、也沒有任何分期候選 → 儲值（一般新客）', k(false, false, none).kind === 'topup' && k(false, true, none).kind === 'topup');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通過 / ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
