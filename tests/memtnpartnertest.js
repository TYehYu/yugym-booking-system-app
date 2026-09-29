/* 會員端的 1V2 同行顯示（2026-09-26 第二輪）

   使用者 0924：「會員看不到會員B也沒得切換」
   　　　　　　　「會員Ａ跟Ｂ都要能看到對方的訓練紀錄」

   ⚠⚠ 這一輪推翻了 0915 訂下的「會員端一律濾掉 slot=2」——
     當時第二位沒有身分，slot=2 就是個沒人認領的借掛紀錄，濾掉是對的；
     0923 有了同行會員（partners）之後查得出是誰，所以改成「照樣顯示，但標出是誰的」。
   ⚠ 可見範圍不靠前端那一行 filter，靠 RLS（20260926_1v2_partner_access.sql）。 */
const fs=require('fs');
const P=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(P+'index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const PAGE=(src.match(/PAGES\.mem_training=async function\(\)\{[\s\S]*?\n\};/)||[''])[0];

console.log('① 姓名從哪裡來');
{
  const D=grab('partnerDirectory');
  ok('★★★ 走 fn_partner_names（只回 id＋姓名），不放寬 members 的 RLS',
     /sb\.rpc\('fn_partner_names'\)/.test(D));
  ok('★★★ 只有會員要（員工本來就讀得到 members）',
     /SESSION\.role==='member'/.test(D));
  ok('★★ 整個工作階段共用一份（與 memberDirectory 同一套寫法）',
     /if\(_ptDirCache\) return _ptDirCache;/.test(D) && /if\(_ptDirBusy\) return _ptDirBusy;/.test(D));
  ok('★★ 拿不到就空字典（所有顯示自動退回原樣，不是壞掉）',
     /const map=\{\};/.test(D) && /catch\(_\)\{\}/.test(D));
}

console.log('\n② 這一堂是誰跟誰（tlWhoOf）');
{
  const W=grab('tlWhoOf');
  ok('★★★ booking 不是掛在我名下 → 我就是同行那位',
     /if\(b\.mid && me && b\.mid!==me\) return \{meIsPartner:true, otherId:b\.mid/.test(W));
  /* ⚠ 一位會員可能在不同票上有不同的同行人，所以不能從姓名字典裡隨便挑一個。 */
  ok('★★★ booking 掛在我名下 → 同行是誰要看**票**（tkPartnerOf）',
     /const pid=\(t&&typeof tkPartnerOf==='function'\)\?tkPartnerOf\(t,me\):'';/.test(W));
  ok('★★ booking 對照表要帶 member_id（否則分不出我是哪一邊）',
     /mid:String\(b\.member_id\|\|''\), tk:String\(b\.ticket_id\|\|''\)/.test(grab('tlBkMetaLoad')));
  /* 實跑：沒有同行的一般課要完全照舊（otherId 空、meIsPartner false） */
  const run=(bkMeta, ptNames, tickets, sessionId, bid)=>{
    const g={ window:{ _tlBkMeta:bkMeta, _ptNames:ptNames, _allTkCache:tickets },
              SESSION:{id:sessionId},
              tkPartnerOf:(t,mid)=>{ const m=t&&t.partners; return (m&&m[String(mid)])?String(m[String(mid)]):''; } };
    return new Function('window','SESSION','tkPartnerOf', W+'\nreturn tlWhoOf('+JSON.stringify(bid)+');')
      (g.window,g.SESSION,g.tkPartnerOf);
  };
  const r1=run({B1:{mid:'A',tk:'T1'}}, {}, [{id:'T1'}], 'A', 'B1');
  ok('★★★ 一般課：沒有同行人，畫面完全照舊', r1.meIsPartner===false && !r1.otherId, r1);
  const r2=run({B1:{mid:'A',tk:'T1'}}, {B:'小美'}, [{id:'T1',partners:{A:'B'}}], 'A', 'B1');
  ok('★★★ A 的視角：我是上課那位，同行是小美', r2.meIsPartner===false && r2.otherId==='B' && r2.otherName==='小美', r2);
  const r3=run({B1:{mid:'A',tk:'T1'}}, {A:'阿明'}, [{id:'T1',partners:{A:'B'}}], 'B', 'B1');
  ok('★★★ B 的視角：我是同行那位，對方是阿明', r3.meIsPartner===true && r3.otherId==='A' && r3.otherName==='阿明', r3);
  const r4=run({B1:{mid:'A',tk:'T1'}}, {}, [{id:'T1',partners:{A:'B'}}], 'B', 'B1');
  ok('★★ 名字查不到時不要寫出 id（畫面那一側會退回「同行會員」）', r4.otherName==='', r4);
}

console.log('\n③ 訓練紀錄頁：同一堂分成兩段');
{
  ok('★★★ 不再一律濾掉 slot=2（使用者要兩邊都看得到對方）',
     !/filter\(l=>l&&l\.member_id===SESSION\.id && Number\(l\.slot\)!==2\)/.test(PAGE));
  ok('★★★ slot===2 是同行那位、slot!==2 是上課那位；我是哪一邊看 tlWhoOf',
     /const _isMine=l=>\(Number\(l&&l\.slot\)===2\)===w\.meIsPartner;/.test(PAGE));
  ok('★★★ 分成 mine／other 兩組',
     /mine:_ls\.filter\(_isMine\), other:_ls\.filter\(l=>!_isMine\(l\)\)/.test(PAGE));
  ok('★★★ 內容頁兩段各自標名字，名字查不到時寫「同行會員」',
     /_day\.other\.length \? `<div class="mtl-who">我的訓練<\/div>` : ''/.test(PAGE)
     && /\$\{escH\(_day\.who\.otherName\|\|'同行會員'\)\} 的訓練/.test(PAGE));
  ok('★★★ 一般課（沒有同行）不畫分段標題 —— 畫面完全照舊',
     /_day\.other\.length \?/.test(PAGE) && /x\.other\.length\?/.test(PAGE));
  ok('★★★ 本週統計只算自己的（一起算會讓客人以為自己練了兩倍）',
     /const _wkActs=_wkSess\.reduce\(\(a,x\)=>a\+x\.mine\.length,0\);/.test(PAGE)
     && /_wkSess\.flatMap\(x=>x\.mine\.map\(l=>l\.exercise_name\)\)/.test(PAGE));
  ok('★★ 列表那一列寫「和 ○○○ 一起」',
     /x\.other\.length\?`　·　和 \$\{x\.who\.otherName\|\|'同行會員'\} 一起`:''/.test(PAGE));
  ok('★★ 票要撈（tlWhoOf 要從票上的 partners 找同行人）',
     /dbGetAll\('member_tickets'\)\.catch\(\(\)=>\[\]\)\]\);/.test(PAGE)
     && /window\._allTkCache=_tk\|\|\[\];/.test(PAGE));
}

console.log('\n④ 會員課卡：和誰一起上 ＋ 今日訓練分段');
{
  const T=grab('_memh2Tap');
  ok('★★★ 課卡寫出「和 ○○○ 一起上」',
     /\$\{_ptName\?`<div class="mtp-msub mtp-ptn">和 <b>\$\{escH\(_ptName\)\}<\/b> 一起上<\/div>`:''\}/.test(src));
  ok('★★★ 同行是誰要在「有沒有訓練紀錄」之外算 —— 教練還沒記也要寫得出來',
     /_ptName=_w\.otherName\|\|'';\s*\n\s*if\(_tl\.length\)\{/.test(T));
  ok('★★★ 今日訓練也分兩段（不分的話像自己一堂做了十幾個動作）',
     /\$\{_oth\.length\?'<div class="mtl-who">我的訓練<\/div>':''\}/.test(T)
     && /\$\{escH\(_w\.otherName\|\|'同行會員'\)\} 的訓練/.test(T));
  ok('★★ 動作數只寫自己的', /今日訓練<i>\$\{_mine\.length\} 個動作<\/i>/.test(T));
  /* ⚠ 2026-09-29 使用者：「客戶那邊課表順序有更正了嗎　要跟教練紀錄相同」——
     教練 0925 起可以長按拖移調順序（寫 seq），拖完 created_at 不會變，
     所以只照 created_at 排的話，客戶看到的順序跟教練端不一樣。 */
  ok('★★★ 順序跟教練端一致（吃 seq，不是只照 created_at）',
     /const _tlS=tlSeqSort\(_tl\);/.test(T)
     && !/_tl\.sort\(\(a,c\)=>String\(\(a&&a\.created_at\)/.test(T));
  ok('★★ 分段標題有樣式（金色，與票券那一行分得開）',
     /#mem-task-pop \.mtp-ptn\{color:var\(--gold-d\);\}/.test(src)
     && /\.mtl-who\{font-size:11\.5px;font-weight:800;/.test(src));
}

console.log('\n⑤ 同行的票券卡（別人的票，我只是一起上）');
{
  const PG=(src.match(/PAGES\.mem_tickets=async function\(\)\{[\s\S]*?\n\};/)||[''])[0];
  const R=grab('renderMemTickets');
  /* ⚠⚠ 最重要的一條：同行票**不能**混進票券夾的 mine —— 那份是「能拿去約課、會扣我堂數」的票。 */
  ok('★★★ 同行票另外一份，沒有混進 mine（混進去餘額、可約堂數、等級統計全會多算）',
     /const partnerTks=\(tickets\|\|\[\]\)\.filter\(t=>t && !tkUsableBy\(t,_me2\)/.test(PG)
     && /_memTkData=\{mine,typeMap,logs,WAL,partnerTks,/.test(PG));
  ok('★★★ 判斷是 partners 的**值**＝我（key 是上課那位）',
     /Object\.keys\(t\.partners\)\.some\(k=>String\(t\.partners\[k\]\)===_me2\)/.test(PG));
  ok('★★★ 記住上課那位是誰（一張票可能有好幾組同行）',
     /_ptWho:owner/.test(PG) && /Object\.keys\(t\.partners\)\.find\(k=>String\(t\.partners\[k\]\)===_me2\)/.test(PG));
  ok('★★ 有同行票才去要名字（沒有就不必多打一支 RPC）',
     /if\(partnerTks\.length\)\{ try\{ await partnerDirectory\(\); \}catch\(_\)\{\} \}/.test(PG));
  /* ⚠ 不要寫「不能用這張票預約」（2026-09-26 使用者：「本來會員就不能預約跟取消教練課
     都是統一由教練處理」）—— 會員端根本沒有那個按鈕。 */
  ok('★★★ 卡上寫「不會扣你的堂數」，且不提「不能預約」',
     /不會扣你的堂數/.test(R) && !/不能用這張票預約/.test(R.replace(/\/\*[\s\S]*?\*\//g,' ')));
  ok('★★ 卡下那一行字要留（正常卡看起來就像自己的票，不寫清楚會有人拿去約課）',
     /mck-ptk-note/.test(R));
  /* 2026-09-26 二修（使用者：「這邊還是畫一張正常的課卡　加個右邊浮水印同行」）——
     第一版做成簡版小卡，改回正常票券卡＋右側「同行」浮水印（規格同共享票的 .tkwm）。 */
  ok('★★★ 就是一張正常的票券卡（同一支 card()），只多一枚浮水印',
     /return card\(t,false,\{who\}\)/.test(R)
     && /\$\{pt\?`<span class="tkwm"/.test(src));
  ok('★★★ 浮水印三件事要一起（卡片 relative＋overflow、內容墊 z-index，否則文字被壓住）',
     /\.mck-card\.mck-ptk\{position:relative;overflow:hidden;\}/.test(src)
     && /\.mck-card\.mck-ptk>\*:not\(\.tkwm\)\{position:relative;z-index:1;\}/.test(src));
  ok('★★★ 圓點畫得出來且數字正確：已用＝總堂數−剩餘，讀不到的那幾堂補成無日期實心點',
     /used:Math\.max\(0,\(Number\(t\.sessions_total\)\|\|0\)-\(Number\(t\.sessions_remaining\)\|\|0\)\)/.test(R)
     && /stamps:\(_memTkData\.bookings\|\|\[\]\)\.filter\(b=>b&&b\.ticket_id===t\.id/.test(R));
  ok('★★★ 不要標成共享的「享」章（那是另一回事）',
     /\$\{\(!pt&&t\.member_id!==SESSION\.id\)\?/.test(src)
     && /\$\{pt\?`<span class="mck-badge mck-badge-pt"/.test(src));
  ok('★★ 沒有同行票時整區不畫', /const ptBlock=partnerTks\.length \?/.test(R) && /: '';/.test(R));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
