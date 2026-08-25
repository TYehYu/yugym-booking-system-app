/* 紅虛線圓點：點得開＋校正堂數（2026-08-22 使用者指示：
   「校正堂數放在出現虛線紅色圓形卡上 讓管理員可點取查看是什麼原因」）

   背景：羅秋菊 9/1 那顆第 13 顆紅虛線點。同樣一顆紅點底下有三種完全不同的原因
   （票用完等續約／票還有餘額只是沒綁上去／帳被多退過），處理方式也完全不同，
   櫃檯光看顏色分不出來要做什麼。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('紅虛線圓點可點');
ok('★ 櫃檯以上才給點（會員看到的還是純標示）',
   /const _canTap=!!\(typeof isDeskLike==='function'&&isDeskLike\(\)&&t&&t\.id&&b&&b\.id\);/.test(src));
ok('★ ⚠ 要 stopPropagation —— 這些點畫在課卡／票券卡裡面，不擋住外層會連帶開錯視窗',
   /onclick="event\.stopPropagation\(\);mtkOverAsk\('\$\{t\.id\}','\$\{b\.id\}'\)"/.test(src)
   && /不擋住外層就會連帶開錯視窗/.test(src));
ok('　　看得出來可以按（游標＋hover＋按下回饋）',
   /\.mtk-over\.mtk-tap\{cursor:pointer;\}/.test(src)
   && /\.mtk-over\.mtk-tap:hover\{background:#fbeceb;\}/.test(src));
ok('　　title 也提示點得開', /需補票\$\{_canTap\?'（點一下看原因）':''\}/.test(src));

console.log('\n說明視窗：三種原因分開講');
ok('★ ① 票面還有餘額 → 只是沒綁上去，用「更換票券」一鍵解決',
   /if\(rem>0\)\{[\s\S]{0,200}?這張票<b>還有 \$\{rem\} 堂<\/b>，只是這一堂沒有綁上去/.test(src)
   && /\$\{rem>0\?`<button class="btn btn-ghost" onclick="closeModal\(\);openBkTicketChange\('\$\{bkId\}'\)">更換票券<\/button>`:''\}/.test(src));
ok('★ ② 掛的預約比票的堂數多 → 帳被多退過，要校正',
   /else if\(hold\.length>total\)\{/.test(src) && /帳被多退過/.test(src));
ok('★ ③ 票真的用完了 → 等續約時系統會問補扣，不用現在處理',
   /會員續約時系統會主動問要不要補扣這一堂，<b>不用現在處理<\/b>/.test(src));
ok('★★ 判讀用「票面餘額 vs 實際佔用的預約數」，不是只看帳本淨額'
   +'（匯入票的基線用量沒進帳本，照帳本改會扣錯——林韋綺那張的教訓）',
   /一律用「票面餘額 vs 實際佔用的預約數」對照，帳本只當佐證/.test(src)
   && /林韋綺那張看起來「退兩次」，實際餘額是對的/.test(src));
ok('　　佔用清單：取消的不算；單人課看 ticket_id、團課看帳本淨額',
   /const hold=\(bks\|\|\[\]\)\.filter\(x=>x&&x\.status!=='cancelled'/.test(src)
   && /\(String\(x\.ticket_id\|\|''\)===String\(tkId\) \|\| \(net\[x\.id\]\|\|0\)>0\)/.test(src));
ok('　　清單裡標出「這一堂」是哪一筆', /← 這一堂/.test(src));

console.log('\n改帳的入口（2026-08-25 併進票券卡的「校正」）');
/* 舊的 tkFixSessions（8/22 做的「校正堂數」）已移除 —— 它藏在這個視窗底下、
   而這個視窗又要那張票剛好有紅虛線點才開得出來，上線三天一次都沒被用過。
   使用者：「從沒看到校正堂數這個按鈕，也沒用過，他在哪裡，有存在必要嗎」 */
ok('★★ 舊的 tkFixSessions／doTkFixSessions 已整支退場，沒有殘留呼叫',
   !/function tkFixSessions/.test(src) && !/doTkFixSessions/.test(src)
   && !/tkFixSessions\(/.test(src));
ok('★★ 這顆按鈕改開票券卡上的「校正」（管理員限定，先關掉這個視窗）',
   /\$\{_isAdmin\?`<button class="btn btn-red" onclick="closeModal\(\);tkTidyOpen\('\$\{tkId\}'\)">校正這張票<\/button>`:''\}/.test(src));
ok('　　②「帳被多退過」的建議文字跟著改，指得到現在的按鈕',
   /用下面的「校正這張票」把多出來的收回/.test(src)
   && /請管理員用票券卡上的「校正」處理/.test(src));
ok('　　為什麼併掉寫在原地', /上線三天一次都沒被用過（ticket_logs 裡 0 筆）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
