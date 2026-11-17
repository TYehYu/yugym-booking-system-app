/* 課卡右下（場地＋教練）／左下（分期、續約）靜態檢查（2026-11-17）。實際畫面與尺寸量測見 PR／交接說明（真實瀏覽器截圖）。 */
const fs = require('fs');
const root = require('path').resolve(__dirname, '..') + '/';
const src = fs.readFileSync(root + 'index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const css = src.slice(src.indexOf('課卡右下＝場地＋教練、左下＝分期／續約'), src.indexOf('</style>', src.indexOf('課卡右下＝場地＋教練、左下＝分期／續約')));
ok('右下 .evc-br 場地在上、教練在下（br-v 先於 br-c）；沒有「教／跑」寫法了（只剩一排時只留場地）', /class="evc-br">\$\{_brVn\?`<i class="br-v">/.test(src) && /<i class="br-c">/.test(src) && !/br-t/.test(src.slice(src.indexOf('const _brVn'), src.indexOf('const _blKind'))) && !/br-t/.test(css));
ok('左下文字與驚嘆號同位置，縮小時沿用同一徽章', /class="bl-x">！/.test(src) && !src.includes('_blTop'));
ok('A 面白字金底／紅底，與 B 面共用狀態配色', /evc-bl\{color:#fff/.test(css) &&
   /bl-in\{background:var\(--cal-installment-badge\)/.test(css) &&
   /bl-rn\{background:var\(--cal-renew-badge\)/.test(css) &&
   /bk-pay\{[^}]*background:var\(--cal-renew-badge\)/.test(src) &&
   /bk-pay-inst\{background:var\(--cal-installment-badge\)/.test(src));
ok('尺寸階梯：教練 全名→縮寫(≤79)→隱藏(≤59 或矮 ≤63)，場地一直保留（≤59 縮成單字）；左下放不下(≤69 或矮 ≤53)改左下「！」', /max-width:79px[\s\S]*?c-ab/.test(css) && /max-width:59px[\s\S]*?br-c\{display:none/.test(css) && /max-height:53px[\s\S]*?bl-x\{display:block/.test(css) && /max-width:69px[\s\S]*?bl-x\{display:block/.test(css));
ok('又窄又矮：場地縮寫右緣直書；再窄到 33px 以下又矮 → 不畫（寧可少標示、不壓姓名）', /max-height:63px\) and \(max-width:89px\)[\s\S]*?vertical-rl/.test(css) && /max-height:63px\) and \(max-width:33px\)[\s\S]*?evc-br\{display:none/.test(css));
ok('右上角只留 已續約 ✓／不續約 ✕；請假卡與遮蔽卡不畫新標示；.cag-std 週曆不受影響', /bkRenewBadge\(\{done:_renewDone,no:_renewNo\}\)/.test(src) && /hideMember \|\| bkIsCoachLeave\(b\)/.test(src) && !/\.cag-std\) \.evc-br/.test(css.replace(/:not\(\.cag-std\)/g, '')));
ok('右下跟隨課卡字色，桌機已簽到不強制白字', /evc-br\{right:5px;[^}]*color:inherit/.test(css) && !/color:rgba\(255,255,255,\.92\)/.test(css));
ok('訓練架從右下標籤省略，跑步機和教室保留', /const _brVn = _vnShort\.trim\(\)\.replace\(\/\^訓練架\$\//.test(src));
console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
