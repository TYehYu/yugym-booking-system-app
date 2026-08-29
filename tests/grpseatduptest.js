/* 團課一人多名額：三格不能全扣到同一張票（2026-08-29 使用者附截圖）

   「這三個會員卡是同一張票券吧?」
   「我要的團體課預約方式是　會員A買了三份團課優惠4堂　使用人給媽媽跟姐姐
     我在預約團課的時候選擇媽媽這張或姐姐這張　該票券就要能辨別並預約」

   正式庫的事實（許佳慈 9/4 20:00，BK-mtb6140efwvy）：
     seat_tickets 三格全是 TK-mte3pejgah8w，
     ticket_logs 只有 1 筆 deduct ＋ 2 筆「⚠ 已阻擋：這一堂在這張票上已經扣過 1 堂」。
   → 兩個名額站在名單上、沒有付錢。她手上明明有媽媽 / 姊姊 / … 好幾張。

   成因鏈：
     ① 那天稍早取消過同一堂 → rebookSameDayTicket 對三格都回同一張（它不知道有幾格）
     ② 挑完票直接 deductTicket，第 2、3 格撞上「同一堂同一張票不重複扣」的護欄
     ③ 護欄回 true（「這一堂確實掛在這張票上」）→ 名額照樣寫進名單

   ⚠ 但「一張票扣多格」本身合法：0827 許佳慈 4 個名額扣同一張 4 堂票就是這樣，
     建立團課那條路一直帶 multi:true。所以修法不是禁止重複，是
     「優先給每格一張沒用過的票；真的只剩同一張才重複，而且要明講 multi」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 挑票四段的順序與「已被這堂用掉」的排除');
{
  ok('★★ _used 由既有名額的 seat_tickets 起算（後來才加的第 3 格不會撿回前兩格的票）',
     /const _used=new Set\(Object\.values\(b\.seat_tickets\|\|\{\}\)\.map\(String\)\);/.test(src)
     && /const _free=arr=>\(arr\|\|\[\]\)\.filter\(t=>t && !_used\.has\(String\(t\.id\)\)\);/.test(src));
  ok('★★ 櫃檯自己指定的那一張不受排除（指定就是指定）',
     /const want=grpPickOf\(mid,_i\);\s*\n\s*if\(want\)\{\s*\n\s*const cand=await listUsableTickets\(mid,b\.ticket_type_id,b\.date,b\.start_time\);\s*\n\s*tk=cand\.find\(t=>t\.id===want\)\|\|null;/.test(src));
  ok('★★ 重約回原票的結果要先過 _used（許佳慈 9/4 就是死在這裡）',
     /if\(!tk\)\{ const _rb=await rebookSameDayTicket\(mid,b\);\s*\n\s*if\(_rb && !_used\.has\(String\(_rb\.id\)\)\) tk=_rb; \}/.test(src));
  ok('★★ 自動挑票只從沒用過的裡面挑，待確認的排最後',
     /const _fc=_free\(await listUsableTickets\(mid,b\.ticket_type_id,b\.date,b\.start_time\)\);\s*\n\s*tk=_fc\.find\(t=>!tkNeedsConfirm\(t\)\) \|\| _fc\[0\] \|\| null;/.test(src));
  ok('★★ 全部都用過了才回頭重複用同一張（一張票扣多格是合法的）',
     /真的沒有別張了 → 回頭用已經扣過的那張/.test(src)
     && src.indexOf('tk=_fc.find(t=>!tkNeedsConfirm(t))')
        < src.indexOf('if(!tk) tk=await findUsableTicket(mid,b.ticket_type_id,b.date,b.start_time);'));
  ok('★★ 成因與使用者原話寫在原地（下一個人不要把 _used 當成多餘的）',
     /這三個會員卡是同一張票券嗎|這三個會員卡是同一張票券/.test(src)
     || /三個名額全指到 TK-mte3pejgah8w/.test(src));
}

console.log('\n② 重複用同一張時一定要帶 multi:true，否則名額會白站在名單上');
{
  ok('★★ 只有「這張已經被這堂用過」才帶 multi',
     /const _ded = tk \? await deductTicket\(tk,b\.id,SESSION\.id,\s*\n\s*_used\.has\(String\(tk\.id\)\)\?\{multi:true\}:undefined\) : false;/.test(src));
  ok('★★ 扣成功才記進 _used（沒扣到的不能佔住那張票）',
     /if\(_ded\) _used\.add\(String\(tk\.id\)\);/.test(src));
  ok('★★ 護欄本身沒被拆掉 —— 沒帶 multi 時仍會擋重複扣',
     /const _multi=!!\(opts&&opts\.multi\);\s*\n\s*if\(!_multi && booking_id && ticket && ticket\.id\)\{/.test(src)
     && /⚠ 已阻擋：這一堂在這張票上已經扣過 /.test(src));
  ok('★★ 扣不到票的名額仍然不寫進名單（0820 取消教練招待那條沒被動到）',
     /if\(!_ded\)\{ \(_noTk\[mid\]=\(_noTk\[mid\]\|\|0\)\+1\); _failed\.add\(String\(mid\)\); continue; \}/.test(src));
}

/* ── 實跑挑票那一段：把 _used／_free 的行為驗出來 ───────────────── */
console.log('\n③ 實跑：三格三張票各自對上，票不夠時才共用');
{
  /* 只重建挑票邏輯的骨架（與上面斷言的原始碼逐行對應），驗的是「配對結果」 */
  const pick=(tickets, seats, seeded)=>{
    const used=new Set(seeded||[]);
    const free=()=>tickets.filter(t=>!used.has(t.id));
    const out=[];
    for(let i=0;i<seats;i++){
      const fc=free();
      const tk=fc.find(t=>!t.needConfirm)||fc[0]||tickets[0]||null;
      out.push(tk?{id:tk.id, fam:tk.fam||null, multi:used.has(tk.id)}:null);
      if(tk) used.add(tk.id);
    }
    return out;
  };
  const T=[{id:'T1',fam:'媽媽'},{id:'T2',fam:'姊姊'},{id:'T3',fam:null}];
  eq('★★ 三格三張 → 各自一張（媽媽 / 姊姊 / 本人），沒有一格是 multi',
     pick(T,3).map(x=>[x.id,x.fam,x.multi]),
     [['T1','媽媽',false],['T2','姊姊',false],['T3',null,false]]);
  eq('★★ 只有一張票、三格 → 三格共用，第 2、3 格明講 multi（0827 許佳慈 4 名額同票）',
     pick([{id:'T1',fam:null}],3).map(x=>[x.id,x.multi]),
     [['T1',false],['T1',true],['T1',true]]);
  eq('★★ 已經有一格用了 T1（seat_tickets 帶進來）→ 新增的那格改用 T2',
     pick(T,1,['T1']).map(x=>x.id), ['T2']);
  eq('★★ 待確認的票排最後（有別張就先用別張）',
     pick([{id:'TC',needConfirm:true},{id:'T9'}],1).map(x=>x.id), ['T9']);
}

console.log('\n④ 名單視窗：一位使用人一列，挑票用圓形卡');
{
  ok('★★ 依票券使用人拆列（許佳慈（媽媽）／許佳慈（姊姊））',
     /const _groupsOf=m=>\{/.test(src)
     && /r\.fam\?`<span style="font-weight:700;color:var\(--t2\);">（\$\{String\(r\.fam\)\.replace\(\/<\/g,'&lt;'\)\}）<\/span>`:''/.test(src));
  ok('★★ 分母也跟著拆 —— 不然「許佳慈（姊姊）」底下會寫著全部 21 堂',
     /const gLeft=tks\.reduce\(\(a,t\)=>a\+Math\.max\(0,Number\(t\.left\)\|\|0\),0\);/.test(src)
     && /const tag=tks\.length\?`可用 \$\{gLeft\} \/ \$\{gTot\|\|gLeft\} 堂`:/.test(src));
  ok('★★ 挑票改成可點的圓形卡（原生 <select> 退場）',
     /<button type="button" class="gtk-card\$\{cur\?' gtk-on':''\}"/.test(src)
     && !/class="grp-tk-sel"/.test(src));
  ok('★★ 圓點語彙沿用課卡（實心＝已用、空心＝還沒用）',
     /h\+=`<i class="gtk-dot\$\{k<used\?' gtk-used':''\}"><\/i>`;/.test(src)
     && /\.gtk-dot\.gtk-used\{background:#1F6F54;border-color:#1F6F54;\}/.test(src));
  ok('★★ 快到期的排最上面而且標出來（使用者 0829 補充）',
     /使用者 0829 補充：「如果本人的票券有不同期限　快到期的擺最上方」/.test(src)
     && /\$\{soon\?'（快到期）':''\}/.test(src));
  ok('★★ 加減名額改走 row 版，_grpTkPick 會跟著 splice（索引不能位移）',
     /function grpSeatDel\(mid, seatIdx\)\{/.test(src)
     && /a\.splice\(seatIdx,1\); p\[mid\]=a;/.test(src)
     && /function grpRowTap\(i\)\{/.test(src));
  ok('★★ 舊的三支退場，不留第二條路',
     !/function toggleGrpMember\(/.test(src) && !/function grpAddOne\(/.test(src)
     && !/function grpRemoveOne\(/.test(src)
     && /toggleGrpMember／grpAddOne／grpRemoveOne 已於 2026-08-29 退場/.test(src));
  ok('★ ＋ 會優先給這位使用人還沒用到的那張（媽媽有兩張時第二格用第二張）',
     /const next=r\.tkIds\.find\(id=>used\.indexOf\(id\)<0\) \|\| r\.tkIds\[0\] \|\| null;/.test(src));
  ok('★★ 說明文字跟著改（拆列、圓形卡挑票、沒票不列）—— 畫面改了字沒改最容易誤導',
     (src.match(/這裡只列<b>有團體課票券<\/b>的會員（沒票的請先儲值）。/g)||[]).length===2
     && /票券設了使用人的會分開一列（例：許佳慈（媽媽）、許佳慈（姊姊））/.test(src)
     && /點下面的圓形卡選要扣哪一張/.test(src)
     && !/帶親友同行可按已選會員的「＋」重複報名/.test(src));
  ok('★ 逐名額的預設仍是「名額 i 用第 i 張」（畫面與實際扣的要同一套）',
     /const _defPkOf=\(m,i\)=>\{ const a=m\.tks\|\|\[\]; return \(a\[Math\.min\(i,a\.length-1\)\]\|\|\{\}\)\.id\|\|''; \};/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
