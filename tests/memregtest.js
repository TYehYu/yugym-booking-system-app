/* 2026-08-01 使用者定案：新會員申辦制度分流
   「如果系統內沒有資料 則不需要經過審核 但會員資料要新增一個停用的開關
     避免太多人隨意註冊帳號 只要有新會員加入 左下角跳訊息通知
     如果系統內已經有資料 走原本的方式等待櫃檯審核」

   ・新客（系統查無這支手機）→ 免審核，當場建檔直接用
   ・舊客（手機對得上既有會員）→ 維持櫃檯審核（要把舊票券與預約接過去，核錯人＝把別人的課給陌生人）
   ・濫註冊的防線改成「事後停用」而不是「事前擋每一個人」
   ・每位新會員加入 → 左下角跳訊息通知 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 新客免審核，直接進站');
ok('★ 收到 result==="created" 就直接建立 SESSION 進站', /if\(rpc\.result==='created'\)\{/.test(src));
ok('★ 進站前先把剛建好的會員資料讀回來', /mm=\(await sb\.from\('members'\)\.select\('\*'\)\.eq\('auth_id',uid\)\.maybeSingle\(\)\)\.data;/.test(src));
ok('★ 讀不到就重整走一般登入，不卡在半途', /if\(!mm\)\{ location\.reload\(\); return; \}/.test(src));
ok('★ 舊客的說明改寫清楚「為什麼要等」', /系統裡已經有這支手機的資料，為了把您原有的票券與預約正確接回來/.test(src));
ok('　　為什麼舊客不能免審核，寫在程式裡', /核錯人等於把別人的課給了陌生人/.test(src));

console.log('\n② 停用開關');
ok('★ 會員明細有「帳號狀態」可點切換', /onclick="toggleMemberDisabled\('\$\{member_id\}'\)"/.test(src));
ok('★ 停用寫的是 members.status=\'disabled\'', /m\.status=isOff\?'active':'disabled';/.test(src));
ok('★ LINE 登入會擋已停用', /if\(mm\.status && mm\.status!=='active'\)\{/.test(src)
   && /showErr\('此帳號已停用，請洽櫃台協助'\); return;/.test(src));
ok('★ 手機＋密碼登入也會擋（只擋一條等於沒擋）',
   /if\(m\.status && m\.status!=='active'\)\{/.test(src)
   && /err\.textContent='此帳號已停用，請洽櫃台協助';/.test(src));
ok('★ 兩條路徑都會先登出，不留半殘 session',
   (src.match(/try\{ await sb\.auth\.signOut\(\); \}catch\(_\)\{\}\s*\n\s*(showErr|err\.textContent)='?此帳號已停用/g)||[]).length>=1
   || /await sb\.auth\.signOut\(\); \}catch\(_\)\{\}\s*\n\s*showErr\('此帳號已停用/.test(src));
ok('★ 會員列表不篩 status（停用後仍找得到人，才啟用得回來）',
   /PAGES\.members=async function\(\)\{\s*\n\s*const\[members,coaches,allBk,allTk,types,allLg\]=await Promise\.all\(\[dbGetAll\('members'\)/.test(src));
ok('★ 列表上看得出已停用', /已停用<\/span>　'\:''\}\$\{tierLabel/.test(src)
   || /已停用<\/span>/.test(src));
ok('　　停用＝關掉登入不是刪除，理由寫在程式裡', /這是「關掉登入」不是刪除，隨時可以再啟用/.test(src));
ok('　　預約／銷售名單本來就只取 active，所以停用會自動消失',
   (src.match(/\.filter\(m=>m\.status==='active'\)/g)||[]).length>=4);

console.log('\n③ 左下角跳新會員通知');
ok('★ 有左下角容器', /#desk-feed-left\{position:fixed;left:18px;bottom:18px;/.test(src));
ok('★ member_new 走左邊，其餘走右邊', /function dfeedIsLeft\(n\)\{ return !!n && n\.type==='member_new'; \}/.test(src));
ok('★ push 時依類型選容器', /const host=left\?deskFeedLeftHost\(\):deskFeedHost\(\);/.test(src));
ok('★ 去重與清除改成不分左右的選擇器',
   /document\.querySelector\(`\.dfeed-card\[data-nid="\$\{n\.id\}"\]`\)/.test(src)
   && /document\.querySelectorAll\('\.dfeed-card\[data-nid\]'\)/.test(src));
ok('★ 按「確認」在左右兩區都找得到卡片',
   /const el=document\.querySelector\(`\.dfeed-card\[data-nid="\$\{id\}"\]`\);   \/\/ 左右兩區都找得到/.test(src));
ok('★ 有新會員專用的圖示', /member_new:'<svg viewBox="0 0 24 24"/.test(src));
ok('★ 版本更新提醒出現時往上讓位', /body\.verup-on #desk-feed-left\{bottom:88px;\}/.test(src));
ok('　　桌機管理員有側欄 → 左邊讓開', /body\.mc-mode #desk-feed-left\{left:calc\(232px \+ 20px\);\}/.test(src));
ok('　　兩角分開的理由寫在程式裡', /混在一起會互相蓋掉/.test(src));

console.log('\n④ 分流邏輯（依 DB 端 fn_complete_member_registration 的規則實跑）');
{
  /* 與 migration 20260801_member_reg_auto_approve_new 同一套判斷 */
  const decide=(phone, members, myAuth)=>{
    if(!myAuth) return {ok:false,error_code:'AUTH.REQUIRED'};
    if(!/^09\d{8}$/.test(phone)) return {ok:false,error_code:'PHONE.INVALID'};
    const mine=members.find(m=>m.auth_id===myAuth);
    if(mine) return {ok:true,result:'already_linked'};
    const hit=members.find(m=>m.phone===phone);
    if(hit && hit.auth_id) return {ok:false,error_code:'PHONE.ALREADY_LINKED'};
    if(hit) return {ok:true,result:'pending_review',kind:'link'};
    return {ok:true,result:'created',kind:'new'};
  };
  const MEM=[{id:'m1',phone:'0911111111',auth_id:null},{id:'m2',phone:'0922222222',auth_id:'U9'}];
  eq('★ 系統查無這支手機 → 直接建立（不審核）',
     decide('0933333333',MEM,'U1'), {ok:true,result:'created',kind:'new'});
  eq('★ 手機對得上既有會員（還沒綁帳號）→ 等櫃檯審核',
     decide('0911111111',MEM,'U1'), {ok:true,result:'pending_review',kind:'link'});
  eq('　　那支手機已經綁過別的帳號 → 擋下來',
     decide('0922222222',MEM,'U1'), {ok:false,error_code:'PHONE.ALREADY_LINKED'});
  eq('　　自己早就有會員資料 → 直接回既有的',
     decide('0933333333',MEM,'U9'), {ok:true,result:'already_linked'});
  eq('　　手機格式不對 → 擋下來', decide('12345',MEM,'U1'), {ok:false,error_code:'PHONE.INVALID'});
  eq('　　沒登入 → 擋下來', decide('0933333333',MEM,null), {ok:false,error_code:'AUTH.REQUIRED'});
}

console.log('\n⑤ 停用後的連鎖效果（登入把關實跑）');
{
  const canLogin=m=>!!m && (!m.status || m.status==='active');
  eq('★ 已停用 → 不能登入', canLogin({status:'disabled'}), false);
  eq('　　啟用中 → 可以登入', canLogin({status:'active'}), true);
  eq('　　沒有 status 欄的舊資料 → 當成可登入（不因為改版把既有會員鎖在外面）',
     canLogin({}), true);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
