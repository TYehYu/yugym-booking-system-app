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
   /pending_contract:holdOnly\|\|false,/.test(src));
ok('　　保留課不可走會扣票的 RPC', /&&tk&&!holdOnly\)/.test(src));
ok('★ 收下一期時自動補綁並扣課', /function bindHeldBookings\(/.test(src)
   && /bound=await bindHeldBookings\(t\.id, seg\)/.test(src));
ok('　　補綁時每筆重讀票券，開通堂數用完就停',
   /const tk=await dbGet\('member_tickets',ticket_id\);[\s\S]{0,120}tkUnlockedLeft\(tk\)<=0\) break;/.test(src));
ok('　　卡片與明細看得出是待繳費', /（待繳費）/.test(src) && /分期待繳費保留/.test(src));

console.log('\n資料庫端同一道規則');
ok('前端有對應的錯誤訊息', /'TICKET.INSTALLMENT_LOCKED'/.test(src));

console.log('\n連續取消');
ok('★ 有整批取消入口', /onclick="openSeriesCancel\('\$\{b\.id\}'\)"/.test(src));
ok('★ 系列判定＝同會員＋同課別＋同教練＋同星期＋同時間',
   /async function seriesOf\(b\)\{/.test(src)
   && /\(parseYmd\(x\.date\)\|\|new Date\(\)\)\.getDay\(\)===dow/.test(src));
ok('　　只抓今天以後、仍為已預約的課',
   /x\.status==='booked'[\s\S]{0,80}String\(x\.date\)>=today/.test(src));
ok('★ 可逐筆勾選，不是全有全無', /class="sc-ck"/.test(src) && /function scAll\(/.test(src));
ok('★ 退課／扣課兩種結果都要明講',
   /runSeriesCancel\('none'\)/.test(src) && /runSeriesCancel\('force'\)/.test(src));
ok('　　批次取消用 silent，不逐筆關視窗重繪',
   /cancelBooking\(id, mode, \{silent:true\}\)/.test(src) && /const _silent=!!\(opts&&opts\.silent\);/.test(src));
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

console.log('\n教練手機端行事曆：別人的課卡不吃觸控');
ok('★ 不可點的卡加上 cag-noint', /\$\{canClick\?'':' cag-noint'\}/.test(src));
ok('★ cag-noint 是 pointer-events:none（滑動時觸控直接穿透）',
   /\.cag-std\.cag-noint\{pointer-events:none;\}/.test(src));
ok('　　不再掛 stopPropagation 的空 onclick（那仍會攔截手指）',
   !/onclick="event\.stopPropagation\(\)"`\}>/.test(src));
ok('　　管理員／店長仍可點別人的課卡（canClick 為真就不加 class）',
   /const canClick = layer==='mine' \|\| isAdmin;/.test(src));
ok('　　拖曳只綁自己的卡（data-bid 只給 mine）',
   /\$\{layer==='mine'\?`data-bid=/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
