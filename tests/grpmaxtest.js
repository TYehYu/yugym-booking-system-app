/* 2026-08-07 使用者指示：「團課明細要新增更改人數的功能，
   有時候當天教練可以接受更多人一起上課。」

   在此之前只能從「管理名單」視窗裡順便調上限 —— 那個視窗一進去就要重挑名單、
   按儲存才生效（而且會跑一遍扣票流程）。教練當場說「今天可以多收一個」時，
   要的只是把上限 +1。獨立做一個入口：不動名單、不動票券，只寫 max_heads。
   順便修掉明細那行寫死的「（N/5）」—— 上限改了也看不出來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 明細顯示真正的上限（不再寫死 5）');
/* 2026-08-12 使用者定案「請假要釋出名額」：分子改成有效人數 grpLiveHeads(b)（總名額−請假） */
ok('★ 分母改用課卡的 max_heads', /const _gmaxD=Math\.max\(1,Number\(b\.max_heads\)\|\|5\);/.test(src)
   && /const _liveD=grpLiveHeads\(b\);/.test(src)
   && /（\$\{_liveD\}\/\$\{_gmaxD\}/.test(src));
/* 2026-08-12：滿員判斷也改看有效人數（請假不佔位） */
ok('★ 滿員時數字標紅並寫「已滿」', /const _gfullD=_liveD>=_gmaxD;/.test(src)
   && /\$\{_gfullD\?'・已滿':''\}/.test(src)
   && /color:\$\{_gfullD\?'var\(--danger,#b5372e\)':'var\(--t3\)'\}/.test(src));
ok('★ 明細上有「改人數」入口（可編輯時才出現）',
   /onclick="openGrpMaxEdit\('\$\{b\.id\}'\)" title="場地有餘裕時可放寬本堂人數"/.test(src));
ok('　　「管理名單」照舊在旁邊', /onclick="openGroupMembers\('\$\{b\.id\}'\)">管理名單<\/button>/.test(src));

console.log('\n② 改人數的視窗');
{
  const m=grabFn('openGrpMaxEdit');
  ok('★ 講清楚目前名單幾人、上限幾人', /目前名單 <b>\$\{now\}<\/b> 人、上限 <b>\$\{cur\}<\/b> 人/.test(m));
  ok('★ 明講不會動到名單與票券（教練最擔心的）', /<b>不會動到名單與票券<\/b>/.test(m));
  ok('★ 輸入框下限＝目前名單人數、上限 12',
     /min="\$\{Math\.max\(1,now\)\}" max="12"/.test(m));
  ok('　　也標出這堂是哪一天哪個時段', /\$\{String\(b\.date\)\.replace\(\/-\/g,'\/'\)\}/.test(m) && /\$\{String\(b\.start_time\)\.slice\(0,5\)\}/.test(m));
}

console.log('\n③ 存檔的把關');
{
  const s=grabFn('_saveGrpMax');
  ok('★ 只收 1–12', /if\(!\(n>=1&&n<=12\)\)\{ show\('請填 1–12 之間的人數'\); return false; \}/.test(s));
  ok('★★ 不能低於名單人數（否則會出現「6 人擠在上限 4」的課）',
     /if\(n<now\)\{ show\(`名單上已經有 \$\{now\} 人，上限不能低於這個數字（要先移除名額）`\); return false; \}/.test(s));
  ok('　　沒改就直接關掉，不寫入', /if\(n===cur\)\{ closeModal\(\); openBookingDetail\(id\); return true; \}/.test(s));
  ok('★ 只動 max_heads（名單、票券一律不碰）',
     /b\.max_heads=n;\n\s*await dbPut\('bookings',b\);/.test(s)
     && !/deductTicket|refundTicket|member_ids=/.test(s));
  ok('★ 存檔時有讀取中（不像當機）', /const _clr=cxBusy\('儲存中…'\);/.test(s));
  ok('★ 防連點', /async function saveGrpMax\(id\)\{ return onceAct\('grpmax:'\+id, \(\)=>_saveGrpMax\(id\)\); \}/.test(src));
  ok('★ 存完回明細，底下的行事曆也跟著更新',
     /await openBookingDetail\(id\);/.test(s)
     && /try\{ window\._calStepping=true; navTo\(CUR_PAGE, CUR_GROUP\); \}catch\(_\)\{\}/.test(s));
  ok('　　改了多少講清楚', /本堂人數上限已改為 \$\{n\} 人（原 \$\{cur\} 人）/.test(s));
  ok('　　失敗時把按鈕還回去', /catch\(e\)\{ _clr\(\); show\('儲存失敗：'/.test(s));
}

console.log('\n④ 與既有規則相容');
ok('★ 名單視窗的上限欄位照舊（兩邊寫的是同一個欄位）',
   /本堂人數上限<\/label><input type="number" id="grp-max"/.test(src)
   && /b\.max_heads=gmax;   \/\/ 名單視窗可調整本堂上限，一併保存/.test(src));
/* 2026-08-12：補位的剩餘名額也扣掉請假數（請假不佔位） */
ok('★ 連續預約補位仍看 max_heads 判斷滿員',
   /const room=Math\.max\(1,Number\(x\.max_heads\)\|\|5\)-\(cur\.length-grpLeaveSeats\(x\)\);/.test(src));
ok('　　使用者的原話寫在程式裡',
   /有時候當天教練可以接受更多人一起上課/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
