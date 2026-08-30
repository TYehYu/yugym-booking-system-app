/* 2026-08-04 使用者兩連報（徐千晴分期案例）：
   ①「8/20 應該是要繳分期、是有付費的一堂課，不應該紅框，應該要是驚嘆號」
   ②「這種分期的課程為什麼會出現超約的紅圈」

   ①資料面：8/1（第一期內）被取消退回後，後面的保留課不會自動遞補 —— 8/20 明明
     落在已繳的第一期卻掛著待收款紅框。8/20 已在正式庫補綁扣課；程式面補
     promoteHeldBooking：取消退回成功後，自動把同會員同票最早的保留課補綁。
   ②顯示面：分期未繳期的「待繳費保留」課被畫成超約紅虛線 —— 未開通堂數已由
     🔒 表達，保留課不進圓點。 */
const fs=require('fs');
require('./_bkenv.js');   // 教練請假退堂那條判準（0830 收斂成一支，見 _bkenv.js）
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

console.log('① 圓形卡：保留課不畫超約紅圈（實跑 ticketTokens）');
{
  const deps={ tkVisual:()=>({accent:'#1f6f54'}), bkIsSelf:()=>false, bkIsGroup:()=>false,
    grpSeatAttCount:()=>0, parseYmd, bkSelfBooked:()=>false, selfVenueLabel:()=>'' };
  const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));
  // 12 堂分期、開通 4：已上 1、已約 3；另外 7 筆待繳費保留（ticket_id 空）
  const T={id:'tk',sessions_total:12,unlocked_sessions:4,installment:{count:3}};
  const B=(id,d,st,hold)=>({id,date:d,status:st,ticket_id:hold?null:'tk',pending_contract:!!hold});
  const stamps=[B('a','2026-07-29','checked_in'),B('b','2026-08-06','booked'),B('c','2026-08-13','booked'),B('d','2026-08-20','booked'),
    B('h1','2026-08-27','booked',1),B('h2','2026-09-10','booked',1),B('h3','2026-09-17','booked',1),
    B('h4','2026-09-24','booked',1),B('h5','2026-10-01','booked',1),B('h6','2026-10-08','booked',1),B('h7','2026-10-15','booked',1)];
  const h=TT(T,stamps,{},1,'b','M',null);
  eq('★ 沒有任何超約紅圈（保留課不進圓點）', (h.match(/mtk-over/g)||[]).length, 0);
  eq('★ 未開通 8 格全是鎖頭', (h.match(/mtk-lock/g)||[]).length, 8);
  ok('★ 已上 1＋已約 3 照畫', (h.match(/mtk-used/g)||[]).length===1 && (h.match(/mtk-booked/g)||[]).length===3);
  ok('　　真正的超約（無票可對應且非保留）仍畫紅圈',
     /mtk-over/.test(TT({id:'tk2',sessions_total:1},[B('x','2026-08-01','booked'),B('y','2026-08-08','booked')],{},1,null,'M',null)));
}

console.log('\n② 取消退回 → 保留課自動遞補');
ok('★ cancelBooking 退回成功後呼叫 promoteHeldBooking',
   /if\(refundedCount>0 && b\.ticket_id && b\.member_id\)\{\n\s*try\{ await promoteHeldBooking\(b\.member_id, b\.ticket_id\); \}/.test(src));
ok('★ 前提：開通段還有多出的額度（used<unlocked 且 remain>0）',
   /if\(used>=unlocked \|\| remain<=0\) return;   \/\/ 開通段沒有多出的額度/.test(src));
ok('★ 挑同會員同課種最早的保留課、補綁＋扣課＋清旗標',
   /x\.member_id===memberId && bkIsInstHold\(x\)/.test(src)   // 2026-08-04 純綁定的卡位不遞補，只認分期標記
   && /hb\.ticket_id=ticketId; hb\.ticket_type_id=tk\.ticket_type_id\|\|hb\.ticket_type_id\|\|null;\n\s*hb\.pending_contract=false;/.test(src));
ok('　　案例寫在程式裡', /8\/1 取消了，8\/20 明明\n\s*落在已繳的第一期卻繼續掛紅框待收款/.test(src));

console.log('\n③ 預約流程的「待分期」選項（2026-08-04 使用者指示：「後面第五堂同一時間點預約，\n   應該除了待簽約還有待分期的選項，這樣才可以接上原本前面四堂課的票券」）');
/* 2026-08-24 使用者定案：「待簽約跟分期，應該留到＋新增這邊」——
   兩顆按鈕從**建立預約的步驟 2** 搬到**課卡的［＋新增］**。
   理由：原本要在還沒建立這一堂的時候就先決定付款方式；現在時段與場地先佔下來，
   人與付款方式一起在課卡上決定。判斷分期票的那一段完全沿用，只是換了地方跑。 */
ok('★★ 「待分期」搬到課卡的［＋新增］（判準與原本那顆鈕一字不差）',
   /if\(!x \|\| x\.status!=='usable' \|\| !tkIsInstall\(x\)\) return;/.test(src)
   && /if\(!bkTicketTypeOk\(x, b\.ticket_type_id\)\) return;/.test(src)
   && /if\(\(Number\(x\.sessions_total\)\|\|0\) - \(Number\(x\.unlocked_sessions\)\|\|0\) <= 0\) return;/.test(src)
   && /onclick="closeModal\(\);bamHoldDo\('\$\{mid\}','inst'\)">/.test(src));
ok('★★ 步驟 2 不再有那兩顆（同一件事只留一個入口）',
   !/⏳ 待分期繳費保留<\/button>/.test(src)
   && !/🕒 待簽約卡位<\/button>/.test(src)
/* 2026-08-24 二修：按鈕的字跟著「有沒有選會員」變 ——
   選了人就是「（待簽約）」（整串掛他名下），沒選才是「（空堂）」。 */
   && /onclick="bkOpenHoldCreate\(\)">\s*\n\s*<span class="ash-eilb">先建立這一堂\$\{preMid\?'（待簽約）':'（空堂）'\}<\/span>/.test(src));
ok('★★ 空堂不可以寫 note —— bkIsInstHold 靠 note 認人，寫了會被當成分期保留自動綁票',
   /note:\(!openHold&&holdOnly\)\?'分期待繳費保留（收款後自動補扣）':null,/.test(src)
   && /不可以寫 note —— bkIsInstHold 靠 note 裡的「分期待繳費保留」認人/.test(src));
ok('★★ ［＋新增］寫的分期保留 note 與建立引擎那份一字不差（差一個字就補不到這一堂）',
   /b\.note=bkNoteJoin\(mode==='inst'\?'分期待繳費保留（收款後自動補扣）':'', _n\.user\|\|''\);/.test(src));
ok('★ 保留不扣票、pending_contract 維持 true（錢還沒到就不能進統計）',
   /b\.ticket_id=null;\n\s*b\.pending_contract=true;/.test(src));
ok('★ 綁人之前再驗一次（同一個人同時段不該有兩堂）',
   /const verr=await validateBooking\(vbk, b\.date, b\.start_time, Number\(b\.duration\)\|\|60\);\n\s*if\(verr\)\{ showToast\(verr, 6000\); return; \}\n\s*b\.member_id=mid;/.test(src));
ok('★ 還沒建檔的客人仍然打得了姓名（搬家不能把這個能力弄丟）',
   /function bamGuestHold\(\)\{/.test(src)
   && /不在名單上？直接建立待簽約<\/span>/.test(src)
   && /bkAddHoldDo\(b\.id, null, 'sign', nm, ph\)/.test(src));
ok('　　只有一種選項時不多問一層（沒有分期票就直接待簽約）',
   /if\(!r\.inst\) return bamHoldDo\(mid,'sign'\);/.test(src));
/* 2026-08-04 追加：「最多只能約剩下的堂數」 */
ok('★ 連續保留夾上限＝未開通堂數（超過自動縮並提示）',
   /window\._bkInstMax=_instMax;/.test(src)
   && /if\(cnt>maxN\)\{ showToast\(`分期票未開通的堂數只剩 \$\{maxN\} 堂，已依上限保留`\); cnt=maxN; \}/.test(src));
ok('★ 建立走 runRecurringBooking 的保留路徑（findTicketFn 回 null → holdOnly）',
   /async function _bkInstHold\(\)\{/.test(src) && /findTicketFn:async\(\)=>null,/.test(src));
ok('★ 防連點', /async function bkInstHold\(\)\{ return onceAct\('bkinsthold', _bkInstHold\); \}/.test(src));
ok('★ 待簽約選項仍在，只是換到［＋新增］', /onclick="closeModal\(\);bamHoldDo\('\$\{mid\}','sign'\)">/.test(src));
/* 2026-08-04 使用者指示：「待分期跟待簽約改成兩個明顯的按鈕一左一右；如果該會員本身
   有分期的票券才顯示待分期，不然待分期的按鈕應該要淡化且不能按」（並排與停用細節見 stafflinetest） */
ok('　　說明講清楚收款後自動補綁', /收到下一期款項、在票券卡按「開通下一期」後，會自動補綁票券並扣課。/.test(src));
/* 2026-08-04 追加：「這種待分期繳費的也要能重複預約」 */
/* 2026-08-20：開關搬到步驟 1，步驟 2 只覆述；上限仍是分期票未開通的堂數，
   改由 bkReadRecurBk(window._bkInstMax) 在送出時夾住。 */
/* 2026-08-24：連續預約現在發生在「建立空堂」那一步（一次建 N 堂空堂，再逐堂補人），
   所以上限不再是分期票的未開通堂數 —— 空堂沒有票要看。_bkInstHold 仍在（沒有呼叫端了，
   但整段留著，日後要退回不必重寫），它的夾上限邏輯也還在。 */
ok('★ 一次建立多堂空堂（連續預約沿用視窗二的設定，上限 RECUR_MAX）',
   /const rc=bkReadRecurBk\(\);\n\s*if\(rc\.on\)\{/.test(src)
   && /openHold:true,/.test(src)
   && /const cap = \(noDeduct\|\|canHold\|\|openHold\) \? reqCount : Math\.min\(reqCount, remainTotal\|\|0\);/.test(src));
ok('　　_bkInstHold 整段留著（日後要退回不必重寫）',
   /async function _bkInstHold\(\)\{/.test(src)
   && /const rc=bkReadRecurBk\(window\._bkInstMax\);/.test(src));
ok('★ 回報建立堂數（含跳過）', /已建立 \$\{ok\} 堂分期保留/.test(src));

console.log('\n④ 待簽約整串轉正（2026-08-04 使用者指示）：「先約 12 堂先繳 4 堂 → 後面 8 堂\n   直接轉分期繳費保留」「只簽約 8 堂 → 直接取消後面佔位子的 4 堂」');
ok('★ 同名同手機同票種的未來卡位視為同一串、照日期序處理',
   /x\.pending_contract && !x\.member_id && x\.status==='booked'\n\s*&& String\(x\.trial_name\|\|''\)===String\(b\.trial_name\|\|''\)/.test(src));
ok('★ 三段式：開通額度內扣課 → 分期未開通轉保留 → 超過總堂數取消',
   /if\(avail>0\)\{/.test(src)
   && /\}else if\(lockedLeft>0\)\{/.test(src)
   && /hb\.note='分期待繳費保留（收款後自動補扣）';/.test(src)
   && /hb\.note=\(hb\.note\?hb\.note\+'｜':''\)\+'簽約堂數不含此堂，轉正時自動取消';/.test(src));
ok('★ 結果回報三個數字（扣課/轉保留/取消）',
   /已轉正式預約：扣課 \$\{bound\} 堂/.test(src) && /轉分期保留 \$\{held\} 堂/.test(src) && /取消多出的 \$\{dropped\} 堂/.test(src));
ok('　　非分期票 lockedLeft＝0 → 超出的直接取消（只簽 8 堂的情境）',
   /let lockedLeft=isInst\?Math\.max\(0,\(Number\(tk\.sessions_total\)\|\|0\)-\(Number\(tk\.unlocked_sessions\)\|\|0\)\):0;/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
