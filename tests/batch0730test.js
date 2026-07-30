/* 2026-07-30 預約系統更新需求（7 項）
   ① 教練桌機版行事曆共用同一頁，但只能動自己的課卡
   ③ 取消預約 → 贈送的自主訓練點數一併刪除；已拿去排課的自主訓練也一併取消
   ④ 教練端取消要看得到票券結果與 24 小時提示
   ⑤ 待簽約卡位也要能連續預約
   ⑥ 超約防線（蔡佳音 8/12：8 堂票被排了 9 堂課）
   ⑦ 合約：補課券規則移除、贈送堂數移除、加教練簽名、每期有堂數與客戶簽名、會員端內容補齊 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 教練桌機版行事曆');
ok('★ 教練導覽列加「預約行事曆」（導覽仍在上方，不走左側 Sidebar）',
   /\{key:'calendar',label:'預約行事曆'\},\s*\n\s*\{key:'coach_salary',label:'薪資紀錄'\},/.test(src));
ok('★ 只能動自己的課卡：own＝主責或代課是自己',
   /const own = SESSION\.role!=='coach' \|\| b\.coach_id===SESSION\.id \|\| b\.substitute_coach_id===SESSION\.id;/.test(src));
ok('★ 「取消」補上 own 判定（原本只看 canCancel，教練點別人的課也能取消）',
   /\/\/ 上右：取消（教練只能取消自己的課）\s*\n\s*if\(canCancel && own\)\{/.test(src));
ok('★ 簽到開放給教練自己的課（口徑同 openBookingDetail 的 staffCanCheckin）',
   /const coachCk = SESSION\.role==='coach' && own;/.test(src)
   && /if\(\(staff\|\|coachCk\) && !closed\)\{/.test(src));
ok('　　團課名單管理仍只給櫃檯／管理員', /if\(staff\) btns \+= evoBtn\('evo-b2'/.test(src));
ok('　　整頁不鎖死（_coachReadonly 維持 false），逐張卡判權限',
   /教練仍要能操作「自己的」課（簽到／取消／備註），逐張卡的權限由 own 判定/.test(src));
ok('　　手機端維持 agenda，不把桌機週曆塞進小螢幕', /手機端維持原本的 agenda（MOBILE_COACH_NAV）/.test(src));

console.log('\n③ 取消預約要收回贈點');
ok('★ 有專門一支處理（與取消簽到的 revokeCheckinReward 分開）',
   /async function revokeRewardOnCancel\(b\)\{/.test(src));
ok('★ 只收「這堂課發的」（source_booking_id 精準比對，不誤收別堂的點數）',
   /const tks=\(all\|\|\[\]\)\.filter\(t=>t\.source==='checkin_grant' && t\.source_booking_id===b\.id\);/.test(src));
ok('★ 贈點已拿去排的自主訓練課一併取消，並在備註寫明原因',
   /const used=\(allBk\|\|\[\]\)\.filter\(x=>x\.ticket_id===t\.id && x\.status!=='cancelled'\);/.test(src)
   && /隨 \$\{b\.date\} \$\{String\(b\.start_time\|\|''\)\.slice\(0,5\)\} \$\{b\.category\|\|'課程'\}取消一併取消（贈點回收）/.test(src));
ok('★ 前端取消路徑與 RPC 取消路徑都會收回',
   (src.match(/revokeRewardOnCancel\(/g)||[]).length>=3);
ok('　　會員通知與櫃檯 Toast 都講清楚收回幾點、連帶取消幾堂',
   /function rewardNoteText\(rv\)\{/.test(src) && /function rewardToastText\(rv\)\{/.test(src)
   && /本堂贈送的自主訓練點數（\$\{rv\.points\} 點）已一併收回/.test(src));
ok('　　刪券失敗記在 kept，不會假裝成功', /catch\(e\)\{ console\.error\('刪贈點券失敗',t\.id,e\); out\.kept\+\+; \}/.test(src));
ok('　　收回後清掉 reward_issued，之後重新簽到能再發',
   /if\(out\.removed\)\{\s*\n\s*b\.reward_issued=false;/.test(src));

console.log('\n④ 教練端取消的提示');
ok('★ 明講會動到哪一張票、剩幾堂、取消後幾堂',
   /目前 <b class="num">\$\{Number\(_tk\.sessions_remaining\)\|\|0\}<\/b>\/\$\{Number\(_tk\.sessions_total\)\|\|0\} 堂/.test(src)
   && /（<b>退回 1 堂<\/b>）/.test(src));
ok('★ 24 小時內用紅框標明是臨時取消',
   /⚠ <b>距離開課不到 24 小時<\/b>（約 \$\{Math\.max\(0,Math\.floor\(hrs\)\)\} 小時），\s*\n\s*屬<b>臨時取消<\/b>。/.test(src));
ok('★ 修掉「畫面說不退、程式卻退」的矛盾（auto 目前一律退課）',
   /目前政策仍會退回票券，但請務必先向會員說明；若要改成扣課不退，請由櫃檯操作。/.test(src)
   && !/⚠ 距離開課不到 24 小時，取消後<b>視同使用、不退回票券<\/b>。/.test(src));
ok('★ 贈點會被收回也先講（教練端與櫃檯端都有）',
   /async function cancelRewardWarnHtml\(b\)\{/.test(src)
   && /\$\{await cancelRewardWarnHtml\(b\)\}/.test(src)
   && /這堂課發過 <b>\$\{_pt\} 點<\/b>自主訓練贈點，取消後會<b>一併收回<\/b>/.test(src));

console.log('\n⑤ 待簽約卡位的連續預約');
ok('★ 卡位視窗加上連續預約區塊', /<div style="margin-top:4px;">\$\{recurBoxHtml\('ph'\)\}<\/div>/.test(src));
ok('★ 沿用正式預約同一套 readRecur／buildRecurringDates',
   /const rc=readRecur\('ph'\);/.test(src)
   && /const dates=rc\.on\?buildRecurringDates\(date,rc\.dows,rc\.count,ymd\(addDays\(parseYmd\(date\),370\)\)\):\[date\];/.test(src));
ok('★ 每一堂各自驗證，衝堂跳過不中斷',
   /const verr=await validateBooking\(vbk,d,time,60\);\s*\n\s*if\(verr\)\{ skipped\.push/.test(src));
ok('　　沒有票券所以不設次數上限（recurBoxHtml 不傳 maxN）', /recurBoxHtml\('ph'\)/.test(src));
ok('　　防連點（長串卡位無回饋會被連按）', /if\(window\._phSubmitting\)\{ showToast\('建立中，請稍候…'\); return; \}/.test(src));
ok('　　建立中顯示進度、結果講清楚成功幾堂跳過幾堂',
   /已卡位 \$\{made\} 堂（待簽約）/.test(src) && /跳過 \$\{skipped\.length\} 堂/.test(src));

console.log('\n⑥ 超約防線');
ok('★ 判定改用口徑無關的硬條件：綁到的未取消預約數 < 總堂數',
   /function tkOverBooked\(t, bkCntByTicket\)\{/.test(src)
   && /return \(Number\(bkCntByTicket\[t\.id\]\)\|\|0\) >= total;/.test(src));
ok('★ 併入共用的 tkFitsBooking（三個呼叫點一次生效）',
   /if\(tkOverBooked\(t,bkCntByTicket\)\) return false;   \/\/ 已排滿總堂數 → 不能再排（超約防線）/.test(src));
ok('★ listUsableTickets 與預約精靈步驟 2（單人／團課）都帶入計數',
   /const cnt=await tkBookedCountMap\(\);/.test(src)
   && /tkFitsBooking\(tt,m\.id,type_id,date,time,_bkCnt\)/.test(src)
   && /tkFitsBooking\(tt,m\.id,type_id,date,time,_bkCntG\)/.test(src));
ok('　　已取消的預約不算（不然取消再約就永遠卡住）',
   /if\(!b \|\| !b\.ticket_id \|\| b\.status==='cancelled'\) return;/.test(src));
ok('　　沒帶計數時維持原行為，不倒退', /if\(!t \|\| !bkCntByTicket\) return false;/.test(src));
ok('　　原因寫在程式裡', /8 堂的票被排了 9 堂課/.test(src));

// 實跑超約判定
{
  const i=src.indexOf('function tkOverBooked(t, bkCntByTicket){'); const j=src.indexOf('\n}\n',i)+2;
  const f=new Function(src.slice(i,j)+'\nreturn tkOverBooked;')();
  ok('★ 8 堂票已排 8 堂 → 不能再排', f({id:'T',sessions_total:8},{T:8})===true);
  ok('★ 8 堂票已排 7 堂 → 還能排', f({id:'T',sessions_total:8},{T:7})===false);
  ok('★ 蔡佳音那張（已排 9 堂）→ 擋下', f({id:'T',sessions_total:8},{T:9})===true);
  ok('　　沒有總堂數的票不套這條（避免誤擋）', f({id:'T',sessions_total:0},{T:99})===false);
  ok('　　沒排過任何課 → 可用', f({id:'T',sessions_total:8},{})===false);
}

console.log('\n⑦ 合約');
ok('★ 補課券規則整段從合約移除（團課不簽合約）',
   !/三、補課券規則（限團體課優惠方案會員）/.test(src)
   && !/每期最多請假 1 次，請假後發放補課券/.test(src));
ok('　　條號重編後沒有跳號', (()=>{
   const i=src.indexOf('const CONTRACT_TEXT'); const t=src.slice(i, i+4000);
   const got=[...t.matchAll(/\n([一二三四五六七八九十])、/g)].map(m=>m[1]);
   return JSON.stringify(got)===JSON.stringify(['一','二','三','四','五','六','七','八','九']);
})());
// 那句「遇第七條…」本來就在補課券段裡，整段移除後不留任何錯誤的交互參照
ok('　　沒有殘留指錯條號的交互參照', !/第七條/.test(src) && !/第八條/.test(src));
ok('★ 購買內容表移除「贈送堂數」欄',
   !/\$\{td\(`贈送堂數：\$\{v\(d\.bonus\|\|0\)\}`\)\}/.test(src)
   && !/\$\{td\('贈送堂數：'\)\}/.test(src));
ok('★ 每一期有金額／開通堂數／收款日／客戶簽名',
   /\$\{td\('期別','width="10%"'\)\}\$\{td\('金額','width="20%"'\)\}\$\{td\('本期開通堂數','width="18%"'\)\}\$\{td\('收款日','width="20%"'\)\}\$\{td\('客戶簽名','width="32%"'\)\}/.test(src));
ok('★ 分期各期的開通堂數會帶進合約（與方案平分同一套 splitAmount）',
   /instSess:_instN>1\?splitAmount\(total,_instN\):null \};/.test(src));
ok('★ 簽名區加「教練簽名」（空白版與已簽版都有）',
   (src.match(/教練簽名：＿＿＿＿＿＿＿＿＿＿＿＿/g)||[]).length>=3);
ok('★ 會員端合約補上「購買內容」快照（原本只存條文）',
   /fill_snapshot:\(window\._ctFill\?contractFillBlockHTML\(window\._ctFill\):null\),/.test(src)
   && /\$\{c\.fill_snapshot\?`<div class="ct-fill-view">\$\{c\.fill_snapshot\}<\/div>`:''\}/.test(src));
ok('　　列印已簽合約也帶購買內容', /\$\{c\.fill_snapshot\|\|''\}\s*\n\s*<div class="ct-text">/.test(src));
ok('　　窄畫面表格自己捲，頁面不橫向捲',
   /\.ct-fill-view\{overflow-x:auto;/.test(src) && /\.ct-fill-view table\{min-width:520px;\}/.test(src));
ok('　　舊合約沒有快照也不會壞（有值才顯示）', /c\.fill_snapshot\?/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
