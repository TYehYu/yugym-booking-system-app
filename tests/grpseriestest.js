/* 團課的連續刪除／連續換教練（2026-09-08 使用者：「團課沒有連續修改功能嗎　目前有連續建立
   課卡的功能　但是連續刪除跟連續修改授課教練　連續修改時間　都要建立」）。

   連續建立早就有，加人也會問後面的場次，但刪除與換教練一直是一堂一堂來 ——
   正式庫週五 20:00 那一串就是改到一半：9/11–10/02 石頭代課、10/09–10/16 石頭主責、
   10/23–11/20 又跳回 Barry、11/27 之後才又是石頭。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 系列的判準沿用既有那一支，不另立一套');
ok('★★ 兩個動作都問 grpSeriesSplit（同教練＋同星期＋同時段＋未來＋連續建立）',
   /async function grpSeriesLater\(b\)\{\s*\n\s*try\{ return grpSeriesSplit\(b, await dbGetAll\('bookings'\)\); \}/.test(src));
ok('★★★ 單獨補開的那幾堂不自動處理，只講一聲（2026-08-07 的規則）',
   (src.match(/不在連續系列裡，要刪請各自處理/)||[]).length===1
   && (src.match(/不在連續系列裡，要換請各自處理/)||[]).length===1
   && /另有 '\+sp\.solo\.length\+' 堂是單獨建立的，不在這次範圍內。/.test(src));

console.log('\n② 先算名單再動手');
const CS=g('async function grpCoachSet(id, cid){','\n}');
ok('★★★ 換教練前先把系列算完 —— 系列的判準之一就是教練，邊改邊算會找不到自己人',
   /const sp=await grpSeriesLater\(b\);\s*\/\* ⚠ 先算完再改：系列的判準之一是教練 \*\//.test(CS));

console.log('\n③ 刪除');
const DA=g('async function grpDelAsk(id){','\n}');
ok('★★ 沒有後續就走原本的單堂流程', /return confirmCancelBooking\(id\);/.test(DA));
ok('★★ 有後續就列出來，並算出總名額數（刪掉會逐一退票）',
   /_heads=sp\.series\.reduce/.test(DA) && /個名額，刪掉會逐一退回票券/.test(DA));
ok('★★ 三顆按鈕：返回／只刪這一堂／連同後面 N 堂',
   /只刪這一堂<\/button>/.test(DA) && /連同後面 '\+sp\.series\.length\+' 堂<\/button>/.test(DA));
const DR=g('async function _grpDelRun(){','\n}');
ok('★★★ 逐堂走既有的 cancelBooking(force)，名額票券照原本的規則退',
   /await cancelBooking\(bid,'force',\{silent:true\}\)/.test(DR));
ok('★★ 有進度、有失敗計數，失敗不會讓整批停住',
   /刪除中…（'\+n\+'\/'\+ids\.length/.test(DR) && /catch\(e\)\{ fail\+\+;/.test(DR));
ok('★★ 做完清掉四張表的快取（票券與帳本都動到了）',
   /dbCacheClear\(\['bookings','member_tickets','ticket_logs','notifications'\]\)/.test(DR));

console.log('\n④ 換教練');
const CR=g('async function _grpCoachRun(id, cid, laterIds){','\n}');
ok('★★★ 改的是主責 coach_id，不是代課', /x\.coach_id=cid;/.test(CR));
ok('★★★ 新主責原本掛著代課就清掉（不然薪資與課表對不上）',
   /if\(String\(x\.substitute_coach_id\|\|''\)===String\(cid\)\) x\.substitute_coach_id=null;/.test(CR));
ok('★★ 視窗要寫明「改的是主責、鐘點費會跟著換人」',
   /改的是<b>主責教練<\/b>（這個班從此由誰帶），不是單堂代課。鐘點費會跟著換人。/.test(src));
ok('★  目前那位不給點（避免空改一輪）', /c\.id===cur\?' ash-ei-off':''/.test(src));
ok('★  只列在職且可授課的教練',
   /c\.status==='active' && c\.can_teach!==false/.test(src));

console.log('\n⑤ 入口與權限');
ok('★★ 團課的「刪除預約」改走 grpDelAsk，單人課維持原本那條',
   /A\.isGroup\?`collapseBkCard\(\);grpDelAsk\('\$\{b\.id\}'\)`:`collapseBkCard\(\);confirmCancelBooking\('\$\{b\.id\}'\)`/.test(src));
ok('★★★ 「更換授課教練」只給團課＋櫃檯以上（一對一的教練是另一回事）',
   /if\(!_leave && A\.isGroup && A\.staff\)/.test(src)
   && /'更換授課教練','改主責（不是代課），可一併套用到後面的場次'/.test(src));
ok('★★★ 已經上完／已簽到的課不給換（會回頭改掉鐘點費歸屬）——借 bkMoveBlockReason 守門',
   /rows \+= _mvBlk\s*\n\s*\? row\('','更換授課教練',_mvBlk,'ash-ei-off'\)/.test(src));
ok('★★★ 自成一條 if，沒有把「教練請假」變成它的 else',
   /if\(!_leave && !A\.isGroup && A\.sub==='sub'\)[\s\S]{0,260}else if\(!_leave && \(A\.subLeave==='leave'/.test(src)
   && !/grpCoachPick[\s\S]{0,80}else if\(!_leave && A\.subLeave/.test(src));
ok('★★ 那一支自己也再擋一次權限（深連結／程式呼叫繞不過去）',
   /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可更換授課教練'\); return; \}/.test(src));
ok('★  兩個動作都有防連點（onceAct）',
   /onceAct\('grpdel', _grpDelRun\)/.test(src) && /onceAct\('grpco:'\+id/.test(src));

console.log('\n⑤-b 連續改時間（2026-09-08 使用者：「連續改時間可以做」）');
{
  const A=g('async function grpTimeAsk(id, later, nt, nv){','\n}');
  const R=g('async function _grpTimeRun(){','\n}');
  ok('★★★ 只有「日期沒動、只改時間」才問（連日期一起改是整串往後挪，另一件事）',
     /if\(bkIsGroup\(b\) && nd===b\.date && nt!==String\(b\.start_time\)\.slice\(0,5\)\)\{/.test(src)
     && /只有「日期沒動、只改時間」才問：連日期一起改是「整串往後挪」/.test(src));
  ok('★★★ 系列要在改動**之前**算完（判準之一就是 start_time）',
     /_grpLater=\(await grpSeriesLater\(b\)\)\.series;/.test(src)
     && src.indexOf('_grpLater=(await grpSeriesLater(b)).series;') < src.indexOf("b.date=nd; b.start_time=nt; await dbPut('bookings',b);"));
  ok('★★★ 每一堂各自驗場地與衝堂（同一個時段這週空、下週未必）',
     /const err=await validateBooking\(vbk, x\.date, p\.t, x\.duration\);/.test(R));
  ok('★★★ 撞到的**不動**，而且要列出來讓櫃檯個別處理',
     /if\(err\)\{ bad\.push\(\{b:x, why:err\}\); paint\(i\+1\); continue; \}/.test(R)
     && /維持原時間沒有更動<\/b>，請個別處理/.test(R));
  ok('★★ 已經是新時間的那幾堂略過，不重複寫入',
     /if\(String\(x\.start_time\)\.slice\(0,5\)===p\.t\)\{ okList\.push\(x\); paint\(i\+1\); continue; \}/.test(R));
  ok('★★ 場地跟著一起帶（同一個班通常同一間教室）',
     /venue_pref:p\.v\|\|venueEffId\(x\)\|\|null/.test(R)
     && /if\(vbk\.venue_unit\) x\.venue_unit=vbk\.venue_unit;/.test(R));
  ok('★★ 有進度、有防連點', /onceAct\('grptime', _grpTimeRun\)/.test(src) && /處理中…（/.test(R));
  ok('★  全部成功才只跳一句吐司，有失敗就攤開清單',
     /if\(!bad\.length\)\{/.test(R) && /有 '\+bad\.length\+' 堂沒有改成/.test(R));
}

console.log('\n⑥ 團課不給「指派代課教練」（2026-09-08）');
ok('★★★ 代課那一列只留給非團課', /if\(!_leave && !A\.isGroup && A\.sub==='sub'\)/.test(src));
ok('★★★ 但團課不能因此失去「教練請假」（0821 把它收進代課那張清單了）',
   /else if\(!_leave && \(A\.subLeave==='leave' \|\| \(A\.isGroup && A\.sub==='sub'\)\)/.test(src));
ok('★★ 原因寫在原地（團課是一個班，換誰上就是這個班換誰帶）',
   /團課是「一個班」，不是「某位會員的課」/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
