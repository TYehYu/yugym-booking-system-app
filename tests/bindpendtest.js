/* 2026-08-04 使用者指示：「（沒有會員資料的卡位）綁定由櫃檯跟教練手動確認，
   只是要有這一條路徑」

   新路徑「綁定會員」：把待簽約卡位掛到會員身上 —— 不扣課、不轉正、狀態仍是待簽約，
   只寫 member_id。掛上後會員端看得到課、LINE 提醒會發、轉正不用再比對身分。

   最大的風險：系統裡有兩條「自動扣課」路徑把 pending＋member＋無票 當成分期保留 ——
   ①取消退回的遞補 promoteHeldBooking ②開通下一期的 bindHeldBookings。
   純綁定的卡位「還沒簽約」，絕不能被它們自動扣課 → 用 bkIsInstHold（備註標記）隔開。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① bkIsInstHold：分期保留與純綁定的分界線（實跑）');
{
  const f=new Function('return '+grabFn('bkIsInstHold'))();
  ok('★ 分期保留（有標記）→ true',
     f({pending_contract:true,member_id:'M1',ticket_id:null,note:'分期待繳費保留（收款後自動補扣）'})===true);
  ok('★★ 純綁定（無標記）→ false（不會被自動扣課）',
     f({pending_contract:true,member_id:'M1',ticket_id:null,note:null})===false);
  ok('　　沒會員的卡位 → false', f({pending_contract:true,member_id:null,ticket_id:null,note:'分期待繳費保留'})===false);
  ok('　　已綁票的正式課 → false', f({pending_contract:false,member_id:'M1',ticket_id:'TK1'})===false);
  ok('　　員工在備註後面加字仍認得（indexOf 不是全等）',
     f({pending_contract:true,member_id:'M1',ticket_id:null,note:'分期待繳費保留（收款後自動補扣）｜客人週三不行'})===true);
}

console.log('\n② 兩條自動扣課路徑都只認分期保留');
{
  ok('★★ 取消退回的遞補（promoteHeldBooking）只撿分期保留',
     /\.filter\(x=>x\.member_id===memberId && bkIsInstHold\(x\)/.test(grabFn('promoteHeldBooking')));
  ok('★★ 開通下一期的補綁（bindHeldBookings）只撿分期保留',
     /all\.filter\(b=>b && bkIsInstHold\(b\) && b\.status==='booked'/.test(grabFn('bindHeldBookings')));
}

console.log('\n③ 綁定流程本體');
{
  const g=grabFn('_bpGo');
  ok('★ 只寫 member_id，不動 pending_contract、不扣課',
     /hb\.member_id=memberId;/.test(g) && !/pending_contract=false/.test(g) && !/deductTicket/.test(g));
  ok('★ trial 資料保留（身分軌跡＋轉正比對用）', /trial_name \/ trial_phone 保留/.test(g));
  ok('★ 整串一起綁（同名同手機同票種的未來卡位）',
     /String\(x\.trial_name\|\|''\)===String\(b\.trial_name\|\|''\)/.test(grabFn('bpSeriesOf')));
  ok('★ 已處理過的卡位不重複綁', /這筆卡位已被處理過/.test(g));
  ok('★ 防連點', /onceAct\('bindpend:'/.test(src));
  ok('　　確認視窗講清楚「不扣課、不收款、仍是待簽約」', /不扣課、不收款，狀態仍是「待簽約」/.test(src));
  ok('　　綁定前先看到堂數與起訖', /確認綁定 \$\{series\.length\} 堂/.test(src));
}

console.log('\n④ 入口與權限');
{
/* 2026-08-24 使用者回報：「點了安排會員的按鈕，跑到舊視窗了」——
   空堂走的是「待簽約」那條早退分支，一般分支裡的［＋新增］從來沒被接上，
   按鈕一直指到舊的 openBindPending。空堂改指 bkAddMemberOpen（那邊才問得出
   「用票券／待簽約／待分期」，也才找得到還沒建檔的客人）；
   散客卡（有 trial_name）維持 openBindPending —— 那是「把卡上的姓名對到一筆
   真的會員資料」，不是「加一個人進來」。 */
  ok('★ 明細那顆鈕：空堂→安排會員（新的［＋新增］）、散客→綁定會員（舊的對身分）',
     /isDeskLike\(\)\|\|\(SESSION&&SESSION\.role==='coach'&&\(bkCoachId\(b\)\)===SESSION\.id\)/.test(src)
     && /\$\{bkIsOpenHold\(b\)\?`closeModal\(\);bkAddMemberOpen\('\$\{b\.id\}'\)`:`openBindPending\('\$\{b\.id\}'\)`\}/.test(src)
     && /\$\{bkIsOpenHold\(b\)\?'安排會員':'綁定會員'\}/.test(src));
  ok('★ 扣課的「轉正簽約」仍限櫃檯、且已綁定的卡位也按得到',
     /b\.pending_contract&&!b\.ticket_id&&b\.status==='booked'&&\(isDeskLike\(\)\)&&!bkIsInstHold\(b\)/.test(src));
  ok('★ 已綁定的卡位轉正 → 直接用綁好的會員，不再比對',
     /if\(b\.member_id\)\{\n\s*window\._cpMembers=await dbGetAll\('members'\); window\._cpBid=id;\n\s*doConvertPending\(b\.member_id\); return;\n\s*\}/.test(grabFn('openConvertPending')));
  ok('★ 轉正的同一串包含已綁定的卡位（分期保留不算）',
     /\(x\.member_id===memberId && !bkIsInstHold\(x\)\)/.test(grabFn('_doConvertPending')));
}

console.log('\n⑤ 顯示：純綁定不能被標成「待繳費」');
{
  ok('★ 標籤：有分期標記才是待繳費，純綁定仍是待簽約',
     /if\(b\.pending_contract\) return bkIsInstHold\(b\) \? '待繳費' : '待簽約';/.test(src));
  ok('★ 明細說明分兩種：🔒分期保留／👤已綁定未簽約',
     /👤 <b>已綁定會員、尚未簽約<\/b>/.test(src) && /🔒 <b>分期待繳費保留<\/b>/.test(src));
  ok('　　名字後綴也分開', /bkIsInstHold\(b\)\?'（待繳費）':'（待簽約）'/.test(src));
}

/* ═══ 2026-08-21：轉正視窗的「返回」不要回到已退役的預約明細 ═══
   使用者回報：「這裡的返回又會回到預約明細視窗」（劉忠緯 14 堂卡位那張）。
   做法沿用 0820 ashSeatAct 那套一次性旗標：從簡易課卡按轉正時先 ashBackArm，
   收尾的 openBookingDetail 會被 ashBackTake 接走、把課卡重新展開。 */
console.log('\n轉正視窗的返回');
ok('★ 課卡的「轉正」先 ashBackArm 再 collapseBkCard（順序不能反：collapse 之後就抓不到那張卡）',
   /ashBackArm\('\$\{id\}'\);collapseBkCard\(\);openConvertPending\('\$\{id\}'\)/.test(src));
ok('　　順序的理由寫在原地', /ashBackArm 要在 collapseBkCard 之前/.test(src));
ok('★ 旗標由 openBookingDetail 消化 → 回課卡（既有機制，沒有另立一套）',
   /const _back=\(typeof ashBackTake==='function'\)\?ashBackTake\(id\):null;/.test(src)
   && /await expandBkCard\(_back\.el, id\); return;/.test(src));
ok('　　「整串卡位要怎麼轉」那一顆返回仍走 openBookingDetail（被旗標接走）',
   /<button class="btn btn-ghost" onclick="openBookingDetail\('\$\{id\}'\)">返回<\/button>/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
