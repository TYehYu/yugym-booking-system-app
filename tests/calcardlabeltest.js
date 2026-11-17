/* 課卡右下（場地＋教練）／左下（分期、續約）靜態檢查（2026-11-17）。實際畫面與尺寸量測見 PR／交接說明（真實瀏覽器截圖）。 */
const fs = require('fs');
const root = process.env.HOME + '/Projects/yugym-booking-system-app/';
const src = fs.readFileSync(root + 'index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const css = src.slice(src.indexOf('課卡右下＝場地＋教練、左下＝分期／續約'), src.indexOf('</style>', src.indexOf('課卡右下＝場地＋教練、左下＝分期／續約')));
ok('右下 .evc-br 場地在上、教練在下（br-v 先於 br-c）；沒有「教／跑」寫法了（只剩一排時只留場地）', /class="evc-br">\$\{_brVn\?`<i class="br-v">/.test(src) && /<i class="br-c">/.test(src) && !/br-t/.test(src.slice(src.indexOf('const _brVn'), src.indexOf('const _blKind'))) && !/br-t/.test(css));
ok('左下 .evc-bl：續約（紅 bl-rn）優先於分期（金 bl-in）；第一列備援 .evc-bang 同色', /_renewAlert \? 'rn' : \(_payAlert \? 'in' : ''\)/.test(src) && /class="evc-bang /.test(src) && /bl-in\{color:var\(--gold-d/.test(css) && /bl-rn\{color:var\(--danger/.test(css));
ok('對比不足才加淡底：calNeedLabelBack 算 WCAG 對比（< 3.5）、只加 .bl-bk 小塊淡底，不改卡片底色', /function calNeedLabelBack/.test(src) && /< 3\.5/.test(src) && /bl-bk b[\s\S]{0,80}rgba\(255,255,255,\.84\)/.test(css));
const a = require('vm').runInNewContext(src.slice(src.indexOf('function calHexLum'), src.indexOf('// 卡片用教練縮寫')) + ';({calHexLum,calNeedLabelBack})');
ok('對比判斷：淺米色底＋金字不需墊底？深色底＋紅字需要墊底', a.calNeedLabelBack('#1d1813', 'rn') === true && a.calNeedLabelBack('#9a6a1e', 'in') === true && a.calNeedLabelBack('#ffffff', 'rn') === false);
ok('尺寸階梯：教練 全名→縮寫(≤79)→隱藏(≤59 或矮 ≤63)，場地一直保留（≤59 縮成單字）；左下放不下(≤69 或矮 ≤53)改第一列「！」', /max-width:79px[\s\S]*?c-ab/.test(css) && /max-width:59px[\s\S]*?br-c\{display:none/.test(css) && /max-height:53px[\s\S]*?evc-bang\{display:inline-block/.test(css) && /max-width:69px[\s\S]*?evc-bang\{display:inline-block/.test(css));
ok('又窄又矮：場地縮寫右緣直書；再窄到 33px 以下又矮 → 不畫（寧可少標示、不壓姓名）', /max-height:63px\) and \(max-width:89px\)[\s\S]*?vertical-rl/.test(css) && /max-height:63px\) and \(max-width:33px\)[\s\S]*?evc-br\{display:none/.test(css));
ok('右上角只留 已續約 ✓／不續約 ✕；請假卡與遮蔽卡不畫新標示；.cag-std 週曆不受影響', /bkRenewBadge\(\{done:_renewDone,no:_renewNo\}\)/.test(src) && /hideMember \|\| bkIsCoachLeave\(b\)/.test(src) && !/\.cag-std\) \.evc-br/.test(css.replace(/:not\(\.cag-std\)/g, '')));
console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
