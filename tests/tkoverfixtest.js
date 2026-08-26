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
ok('★ ② 票面還有餘額（而且沒超約）→ 只是沒綁上去',
   /\}else if\(rem>0\)\{[\s\S]{0,200}?這張票<b>還有 \$\{rem\} 堂<\/b>，只是這一堂沒有綁上去/.test(src));
/* 2026-08-26 使用者：「林韋綺有超約的四堂…可以點選虛線紅圈日期，跳出視窗
   更改到其他票券或取消嗎? 這樣調整比較直接」——
   原本這個視窗只問「**這一張**還有沒有餘額」，答不出「其實還有別張可以用」。 */
ok('★★ ① 超約（掛的筆數 > 總堂數）要排在「還有餘額」前面',
   /if\(hold\.length>total\)\{[\s\S]{0,400}?\}else if\(rem>0\)\{/.test(src)
   && /超約是硬事實（筆數 vs 總堂數），餘額是衍生值，硬事實優先/.test(src));
ok('★★ 會去查「這位會員別張票還有沒有堂數」，講得出剩幾堂、是哪張',
   /_others=\(await listUsableTickets\(b\.member_id,_typeId,b\.date,b\.start_time\)\|\|\[\]\)\.filter\(x=>x\.id!==tkId\);/.test(src)
   && /const _oSum=_others\.reduce\(\(n,x\)=>n\+Math\.max\(0,tkUnlockedLeft\(x\)\),0\);/.test(src)
   && /這位會員<b>還有 \$\{_oSum\} 堂<\/b>可以用/.test(src));
ok('★★ 有別張可以用時就給「更換票券」（不再只看這一張的餘額）',
   /\$\{\(rem>0\|\|_others\.length\)\?`<button class="btn btn-ghost" onclick="closeModal\(\);openBkTicketChange\('\$\{bkId\}','close'\)">更換票券<\/button>`:''\}/.test(src));
ok('★★ 也給「取消預約」（使用者同時提了「或取消」）',
   /\$\{b\.status==='booked'\?`<button class="btn btn-ghost" style="color:var\(--danger,#b5372e\);" onclick="closeModal\(\);confirmCancelBooking\('\$\{bkId\}'\)">取消預約<\/button>`:''\}/.test(src));
ok('　　換票視窗從這裡進去只給「關閉」（沒有上一層可回）',
   /openBkTicketChange\('\$\{bkId\}','close'\)/.test(src));
ok('★ ③ 票真的用完了 → 等續約時系統會問補扣，不用現在處理',
   /會員續約時系統會主動問要不要補扣這一堂，<b>不用現在處理<\/b>/.test(src));
ok('★★ 判讀用「票面餘額 vs 實際佔用的預約數」，不是只看帳本淨額'
   +'（匯入票的基線用量沒進帳本，照帳本改會扣錯——林韋綺那張的教訓）',
   /一律用「票面餘額 vs 實際佔用的預約數」對照，帳本只當佐證/.test(src)
   && /林韋綺那張看起來「退兩次」，實際餘額是對的/.test(src));
/* 2026-08-26 使用者：「林韋綺有兩堂是因為教練請假　所以這兩台不能算進來」——
   教練請假新制（0814）是「請假當下不退、票掛著；到場簽到才退 1 堂，但預約仍掛著
   同一張票」，所以 ticket_id 還在、帳本淨值卻是 0。只看 ticket_id 就會多算兩堂。 */
ok('★★ 帳已退回的不算佔位（判準與超約防線 tkBookedCountMap 同一條）',
   /const _freedOf=x=>!!_hasLg\[x\.id\] && \(net\[x\.id\]\|\|0\)<=0;/.test(src)
   && /const hold=_all\.filter\(x=>!_freedOf\(x\)\);/.test(src)
   && /const freed=_all\.filter\(_freedOf\);/.test(src));
ok('★★ 完全沒有帳本紀錄的照舊算佔用（舊匯入沒有 ticket_logs，放行會拆掉整條防線）',
   /有帳本且淨值 >= 0 才放行/.test(src)
   && /用「查不到帳就當沒扣」會把整條防線拆掉/.test(src));
/* 0826 二修：那幾筆改由圓形卡自己畫（ticketTokens 把 coach_leave 已簽到的畫成
   「課種色填滿＋紅圈」的加值圓點，本來就不佔格），文字清單退場，改用圖例說明。 */
ok('★★ 不算佔位的那幾筆看得到 —— 圓形卡畫成紅圈，圖例寫出堂數',
   /紅圈＝教練請假已退回，不佔位（\$\{freed\.length\} 堂）/.test(src)
   && /\.mtk-lgd-clx\{background:var\(--green\);box-shadow:0 0 0 1\.5px var\(--danger/.test(src));
ok('　　候選：取消的不算；單人課看 ticket_id、團課看帳本淨額',
   /const _all=\(bks\|\|\[\]\)\.filter\(x=>x&&x\.status!=='cancelled'/.test(src)
   && /\(String\(x\.ticket_id\|\|''\)===String\(tkId\) \|\| \(net\[x\.id\]\|\|0\)>0\)/.test(src));
/* 2026-08-26 使用者：「這邊是不是可以用圓形卡展示　比文字直覺一點」——
   一整排日期文字要逐行讀才知道哪一堂是我點的、哪幾堂沒票；圓形卡一眼就看得出來。 */
ok('★★ 佔用清單改用圓形卡，而且與票券卡同源（問票券夾拿戳記與已用堂數）',
   /const _W=await buildWallet\(b\.member_id, await walletCtx\(\)\);/.test(src)
   && /_dotsHtml=ticketTokens\(t,_sl\.stamps,_W\.typeMap\|\|\{\},_sl\.used,bkId,b\.member_id,_W\.selfBk\);/.test(src)
   && /<div class="mck-dots2">\$\{_dotsHtml\}<\/div>/.test(src));
ok('★★ 不自己算戳記（多一種「已用幾堂」的口徑正是 0731 收斂掉的那件事）',
   /這一頁自己算一份戳記，就等於又多一種「已用幾堂」的口徑/.test(src));
ok('★★ 本堂會被圈起來（curId 傳 bkId），而且有圖例說明紅虛線與紅圈',
   /圈起來的就是這一堂/.test(src)
   && /紅色虛線＝沒有票可扣/.test(src)
   && /紅圈＝教練請假已退回，不佔位/.test(src));
ok('　　票券夾拿不到就退回原本的文字清單（不會變成空白）',
   /: `<div style="background:var\(--card2\);border-radius:9px;padding:8px 12px;margin-top:4px;font-size:12\.5px;line-height:1\.9;max-height:180px;overflow:auto;">/.test(src)
   && /← 這一堂/.test(src));

console.log('\n改帳的入口（2026-08-25 併進票券卡的「校正」）');
/* 舊的 tkFixSessions（8/22 做的「校正堂數」）已移除 —— 它藏在這個視窗底下、
   而這個視窗又要那張票剛好有紅虛線點才開得出來，上線三天一次都沒被用過。
   使用者：「從沒看到校正堂數這個按鈕，也沒用過，他在哪裡，有存在必要嗎」 */
ok('★★ 舊的 tkFixSessions／doTkFixSessions 已整支退場，沒有殘留呼叫',
   !/function tkFixSessions/.test(src) && !/doTkFixSessions/.test(src)
   && !/tkFixSessions\(/.test(src));
ok('★★ 這顆按鈕改開票券卡上的「校正」（管理員限定，先關掉這個視窗）',
   /\$\{_isAdmin\?`<button class="btn btn-red" onclick="closeModal\(\);tkTidyOpen\('\$\{tkId\}'\)">校正這張票<\/button>`:''\}/.test(src));
ok('　　沒有別張票可用時才叫人去校正（有別張就直接換過去）',
   /用下面的「校正這張票」把歸屬與餘額整理好/.test(src)
   && /請管理員用票券卡上的「校正」處理/.test(src));
ok('　　為什麼併掉寫在原地', /上線三天一次都沒被用過（ticket_logs 裡 0 筆）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
