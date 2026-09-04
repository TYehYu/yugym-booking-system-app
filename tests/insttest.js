/* 分期票券的「已開通堂數」與連續取消（2026-07-29 使用者回報：
   徐千晴只繳第 1 期 4 堂，連續預約卻拿得到 12 堂而超約）。
   分期票在售出當下 sessions_total 就是整個方案，unlocked_sessions 才是已繳期數對應的堂數。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${a}，預期 ${e}`);

const {tkUnlockedLeft,tkIsInstall}=new Function(
  grabFn('tkUnlockedLeft')+'\n'+grabFn('tkIsInstall')+'\nreturn {tkUnlockedLeft,tkIsInstall};')();

const INST=(o)=>Object.assign({
  sessions_total:12, sessions_remaining:12, unlocked_sessions:4,
  installment:{count:3,segments:[4,4,4],amounts:[6400,6400,6400],paid:[true,false,false],current:1}
},o);

console.log('分期票可約堂數');
eq('★ 剛售出（12 堂／已開通 4）→ 只能約 4 堂', tkUnlockedLeft(INST()), 4);
eq('　　約掉 1 堂後剩 3', tkUnlockedLeft(INST({sessions_remaining:11})), 3);
eq('★ 約滿第 1 期 4 堂後 → 0（不能再約，即使帳面還有 8 堂）',
   tkUnlockedLeft(INST({sessions_remaining:8})), 0);
eq('★ 徐千晴實況（12 堂全被約走）→ 0', tkUnlockedLeft(INST({sessions_remaining:0})), 0);
eq('開通第 2 期後（已開通 8、已用 4）→ 可約 4',
   tkUnlockedLeft(INST({sessions_remaining:8,unlocked_sessions:8,
     installment:{count:3,segments:[4,4,4],amounts:[6400,6400,6400],paid:[true,true,false],current:2}})), 4);
eq('全部開通後 → 等同剩餘堂數',
   tkUnlockedLeft(INST({sessions_remaining:6,unlocked_sessions:12,
     installment:{count:3,segments:[4,4,4],amounts:[6400,6400,6400],paid:[true,true,true],current:3}})), 6);

console.log('\n非分期票不受影響');
eq('一次付清 12 堂 → 12', tkUnlockedLeft({sessions_total:12,sessions_remaining:12}), 12);
eq('沒有 installment 欄位就是剩餘堂數', tkUnlockedLeft({sessions_total:8,sessions_remaining:3}), 3);
eq('null 不炸', tkUnlockedLeft(null), 0);
ok('tkIsInstall 認得分期票', tkIsInstall(INST())===true);
ok('tkIsInstall 對一般票回 false', tkIsInstall({sessions_total:12})===false);

console.log('\n邊界');
eq('unlocked 沒填時視同全開（舊資料相容）',
   tkUnlockedLeft({sessions_total:12,sessions_remaining:5,installment:{count:2}}), 5);
eq('unlocked 比已用還小（資料異常）也不會回負數',
   tkUnlockedLeft(INST({sessions_remaining:2,unlocked_sessions:4})), 0);

console.log('\n預約流程要吃這個限制');
ok('★ listUsableTickets 用 tkUnlockedLeft 過濾',
   /if\(!\(tkUnlockedLeft\(t\)>0\)\) return false;/.test(src));
ok('★ 連續預約的上限改用已開通堂數',
   /c\.reduce\(\(s,t\)=>s\+tkUnlockedLeft\(t\),0\)/.test(src));
ok('★ 票券選擇顯示的是「可約」而非帳面剩餘',
   /可約 <b>\$\{tkUnlockedLeft\(tk\)\}<\/b> 堂/.test(src));

console.log('\n未繳期數改以「待繳費」保留時段');
ok('★ 找不到票且有未繳期數 → 保留而不是跳過', /if\(canHold\) holdOnly=true;/.test(src));
ok('　　保留課不扣票（pending_contract、無 ticket_id）',
   /pending_contract:openHold\|\|holdOnly\|\|false,/.test(src));
ok('　　保留課不可走會扣票的 RPC', /&&tk&&!holdOnly&&!o\.venue_pref&&!bkIsSelf\(bk\)\)/.test(src));   // 2026-08-04 自主訓練也排除
ok('★ 收款開通時自動補綁並扣課（2026-08-14 起堂數改吃畫面輸入 n）', /function bindHeldBookings\(/.test(src)
   && /bound=await bindHeldBookings\(t\.id, n\)/.test(src));
ok('　　補綁時每筆重讀票券，開通堂數用完就停',
   /const tk=await dbGet\('member_tickets',ticket_id\);[\s\S]{0,120}tkUnlockedLeft\(tk\)<=0\) break;/.test(src));
ok('　　卡片與明細看得出是待繳費', /（待繳費）/.test(src) && /分期待繳費保留/.test(src));

console.log('\n資料庫端同一道規則');
ok('前端有對應的錯誤訊息', /'TICKET.INSTALLMENT_LOCKED'/.test(src));

console.log('\n連續取消');
ok('★ 不做獨立的「連續取消」按鈕（2026-07-29 二修）',
   !/openSeriesCancel/.test(src) && !/連續取消…/.test(src));
ok('★ 改成取消時追問：只取消這堂／連同後面',
   /async function askSeriesCancel\(id, mode\)/.test(src)
   && /只取消這堂/.test(src) && /連同後面 \$\{later\.length\} 堂/.test(src));
ok('　　單堂課不會多這一步（沒有後續就直接取消）',
   /if\(!later\.length\) return cancelBooking\(id, mode\);/.test(src));
ok('　　只算「這堂之後」的課，不會回頭取消已上過的',
   /later=\(await seriesOf\(b\)\)\.filter\(x=>x\.id!==id && key\(x\)>key\(b\)\);/.test(src));
ok('　　沿用上一步選的退課／扣課方式', /取消方式沿用上一步的選擇/.test(src));
ok('★ 系列判定＝同會員＋同課別＋同教練＋同星期＋同時間',
   /async function seriesOf\(b\)\{/.test(src)
   && /\(parseYmd\(x\.date\)\|\|new Date\(\)\)\.getDay\(\)===dow/.test(src));
ok('　　只抓今天以後、仍為已預約的課',
   /x\.status==='booked'[\s\S]{0,80}String\(x\.date\)>=today/.test(src));
ok('★ 退課／扣課在前一步就選定並明講',
   /askSeriesCancel\('\$\{id\}','none'\)/.test(src) && /askSeriesCancel\('\$\{id\}','force'\)/.test(src));
ok('　　批次取消用 silent，不逐筆關視窗重繪',
   /cancelBooking\(id, useMode, \{silent:true\}\)/.test(src) && /const _silent=!!\(opts&&opts\.silent\);/.test(src));   /* 2026-08-13 起逐筆算 useMode（>24h 強制退回） */
ok('　　RPC 建立的連續預約會補標 recurring（否則認不出同系列）',
   /update\(\{recurring:true\}\)/.test(src));

console.log('\n班表權限：櫃檯讀得到、不能改');
ok('★ 排班表頁不再把櫃檯擋在門外',
   /SESSION\.role==='admin'\|\|SESSION\.is_manager\|\|SESSION\.role==='front_desk'/.test(src));
ok('★ 教練值班時段的編輯權收回給管理員／店長（原本 isDeskLike 把櫃檯也算進去）',
   /const canEdit = SESSION\.role==='admin'\|\|!!SESSION\.is_manager;/.test(src));
ok('　　標題會標明是檢視模式', /檢視模式 · 排班由店長或管理員編輯/.test(src));
const guarded=['openWeeklyShift','openShiftEdit','saveShift','applyWeeklyToMonth','copyPrevMonthShifts'];
guarded.forEach(fn=>{
  const i=src.indexOf('function '+fn+'(');
  const head=src.slice(i, i+260);
  ok(`　　${fn} 直接呼叫也擋得住`, /if\(!_canEditShifts\)/.test(head));
});

console.log('\n連續預約改用「次數」');
ok('★ 介面改成次數輸入（不再選結束日期）',
   /id="\$\{prefix\}-count" min="1"/.test(src) && !/id="\$\{prefix\}-until"/.test(src));
// 2026-07-30：上限改成 min(可約堂數, 12)，文案由「次」改「堂」
/* 2026-08-01：說明文字抽成 recurCountHint，並在選定票券後由 recurSetMax 依「那張票」再校正
   （見 tests/recurcaptest.js）—— 這裡只確認初始值仍以會員可約堂數帶入。 */
/* 2026-08-20：連續預約的開關搬到步驟 1（使用者指定的欄位順序），步驟 2 只覆述。
   上限沒有消失——步驟 2 把可約堂數交給 bkRecurRecap 記下來，送出時由
   bkReadRecurBk 夾住堂數（見 tests/slotcardtest.js）。 */
ok('★ 次數上限＝min(可約堂數, 12)，送出時夾住',
   /\$\{bkRecurRecap\(preSum\)\}/.test(src)
   && /window\._bkRecurMax = Number\(maxN\)>0 \? Number\(maxN\) : 0;/.test(src)
   && /const m=Number\(maxN\)>0 \? Math\.min\(Number\(maxN\), RECUR_MAX\) : RECUR_MAX;/.test(src)
   && /這張票目前可約 <b>\$\{c\}<\/b> 堂，最多就排 \$\{c\} 堂。/.test(src));
ok('★ 超過上限會被夾回並提示', /function recurClampCount\(/.test(src)
   && /最多只能排 \$\{cap\} 堂（可約堂數上限）/.test(src)
   && /最多只能排 \$\{RECUR_MAX\} 堂（方案上限）/.test(src));
ok('　　讀值時再夾一次（避免直接改 DOM 繞過）',
   /if\(mx>0\) count=Math\.min\(count,mx\);/.test(src));
ok('　　送出改帶 count，不再帶 until',
   /count: recurring \? _rc\.count : 1,/.test(src)
   && /count: isRec \? Math\.min\(Math\.max\(1,Math\.floor\(Number\(f\.count\)\|\|1\)\), RECUR_MAX\) : 1,/.test(src));
ok('　　沒填次數會擋下來', /請填寫預約次數/.test(src));

/* 2026-07-31 使用者指示：教練端課卡「互動開啟，但不要圓形按鈕，只能看明細不能修改」。
   0729 的 cag-noint（整張不吃觸控）退場，改成點一下直接開唯讀明細。 */
console.log('\n教練手機端行事曆：別人的課卡可點開明細（唯讀）');
ok('★ 不可點的卡改標 cag-view（不再是 cag-noint）', /\$\{canClick\?'':' cag-view'\}/.test(src));
/* 2026-08-01 使用者指示定版：改成純顯示，完全不掛點擊（見 tests/coachviewtest.js） */
ok('★ 別人的課卡完全不掛點擊',
   /\$\{canClick\?` onclick="wtlCardClick\('\$\{b\.id\}',this\)"`:''\}>/.test(src));
ok('　　cag-view 只改游標，不關 pointer-events（關了會攔手指、頁面滑不動）',
   /\.cal-ev\.cal-ev-view,\.cag-std\.cag-view\{cursor:default;\}/.test(src));
ok('　　不再掛 stopPropagation 的空 onclick（那仍會攔截手指）',
   !/onclick="event\.stopPropagation\(\)"`\}>/.test(src));
ok('　　管理員／櫃檯仍可點別人的課卡；教練與店長手機回純顯示（0803 再定案）',
   /const canClick = layer==='mine' \|\| mobTouch;/.test(src));
ok('　　拖曳綁在可互動的卡上（0803 起管理身份全卡可拖，教練只有自己的）',
   /\$\{canClick\?`data-bid=/.test(src));


console.log('\n⑨ 分期防呆與帳本（2026-09-04 施佩怡案例）');
{
  const fs=require('fs');
  const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  const grab=n=>{ const m=new RegExp('(?:^|\\n)(?:async )?function '+n+'\\(').exec(src);
    if(!m) return ''; const i=m.index+(m[0][0]==='\n'?1:0); let d=0;
    for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} } };
  const S=grab('submitGrant'), C=grab('_confirmInstallNext');

  /* 起因：櫃檯用＋儲值開了一張自訂方案來收分期第 2 期，原本那張分期票還停在
     1/3 期、剩下的堂數鎖著，帳也記成一般銷售。同一個坑第二次（8/22 也是她）。 */
  ok('★★★ ＋儲值時，同票種還沒繳完的分期票要先問一次',
     /const _instOpen=\(await dbGetAll\('member_tickets'\)\)\.filter\(t=>\{/.test(S)
     && /這位會員有一張還沒繳完的分期票/.test(S));
  ok('★★★ 只比同一種票種（教練課分期票 vs 今天買自主訓練點數是兩件事）',
     /return String\(t\.ticket_type_id\|\|''\)===String\(plan\.ticket_type_id\|\|''\);/.test(S)
     && /那是兩件事，跳出來只會變成雜訊/.test(src));
  ok('★★★ 已經繳完的不算（current < count 才提醒）',
     /if\(!\(\(Number\(i\.current\)\|\|1\) < \(Number\(i\.count\)\|\|1\)\)\) return false;/.test(S));
  ok('★★★ 作廢的票不算', /t\.status==='refunded'\) return false;/.test(S));
  ok('★★★ 是確認不是禁止（分期沒繳完時另外賣一份本來就合法）',
     /確定要另外賣一份新的方案嗎？`\)\) return;/.test(S)
     && /是確認不是禁止/.test(src));
  ok('★★ 指出正確的路（不是只說「不要這樣做」）',
     /改到會員資料的票券卡按/.test(S) && /「開通下一期」——用＋儲值會另外開一張新票/.test(S));
  ok('★★ 檢查自己失敗不擋銷售', /catch\(e\)\{ console\.warn\('分期票檢查失敗（不擋銷售）', e\); \}/.test(S));

  /* ticket_logs.action 的列舉只有 grant/deduct/refund/adjust/expire，
     'installment_unlock' 一律被資料庫退件，而那一行包在 catch(_){} 裡 → 全庫 0 筆。 */
  ok('★★★ 開通下一期的帳本改用合法的 action（原本一直寫不進去）',
     /await logTicket\(t\.id,'adjust',0,null,SESSION\.id,`分期收款開通/.test(C)
     /* ⚠ 不能整份 src 找字串：上面那段解釋 bug 的註解自己就寫著 installment_unlock */
     && !/logTicket\([^)]*'installment_unlock'/.test(src));
  ok('★★★ 寫不進去要出聲，不能再吞掉',
     /catch\(e\)\{ console\.error\('分期開通帳本寫入失敗',e\); showToast\('開通已完成，但帳本紀錄沒寫進去：'/.test(C));
  ok('★★ 為什麼是 delta 0（開通不改餘額，只是把鎖打開）',
     /開通不改變餘額（sessions_remaining 沒動），只是把鎖打開，/.test(src)
     && /要新增動作類型就得改資料庫的 enum，不能只在前端寫一個新字串/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
