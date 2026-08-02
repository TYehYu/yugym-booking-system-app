/* 手機端的任何變更 → 櫃檯／管理員桌機右下角跳通知（2026-07-31 使用者新規則）

   「只要從手機端變更的內容，不管會員還是教練，都要在櫃檯跟管理員桌機帳號右下角跳通知」

   實作掛在 dbPut／dbDel（唯一的兩個寫入口），不是逐一改呼叫點 ——
   漏一個就是規則有破洞，而且日後新功能自動被涵蓋。
   寫入靠 security definer RPC fn_mobile_change_alert（notifications 的 RLS
   只讓 is_staff_desk() 寫，教練／會員自己 insert 會被擋）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('掛在資料層，不逐一改呼叫點');
ok('★ dbPut 寫完就通知', /if\(typeof mchgNotify==='function'\) mchgNotify\(store, data\|\|obj, 'save'\);/.test(src));
ok('★ dbDel 刪除也通知', /if\(typeof mchgNotify==='function'\) mchgNotify\(store, _snap\|\|\{id\}, 'delete'\);/.test(src));
ok('★ 刪除前先把內容撈起來（刪完就查不到了）',
   /if\(typeof mchgEnabled==='function' && MCHG_LABEL\[store\] && mchgEnabled\(\)\)\{ try\{ _snap=await dbGet\(store,id\); \}catch\(_\)\{\} \}/.test(src));
ok('　　通知不擋主流程（不 await、RPC 失敗吞掉）',
   /try\{\s*\n\s*await sb\.rpc\('fn_mobile_change_alert'/.test(src) && /\}catch\(_\)\{\}\n\}\nasync function dbPut/.test(src));
ok('　　原因寫在程式裡', /漏掉一個\s*\n\s*就等於這條規則有破洞/.test(src));

console.log('\n誰會觸發');
{
  const fn=g('function mchgEnabled(){','\n}\n');
  const mk=(role,mobile)=>new Function('CLOUD','SESSION','isMobileLayout',fn+'\nreturn mchgEnabled();')
    (true,{role},()=>mobile);
  /* 2026-08-01 使用者回報：「我的手機端更新的課卡 沒有顯示在櫃檯畫面右下角」——
     原本限定 coach/member，理由是「櫃檯／管理員本來就在桌機前」；
     但老闆本人常拿手機在場邊改課卡，那個前提不成立 → 改成不分角色。
     會不會「看到」由 deskFeedEnabled 決定（櫃檯／管理員＋桌機版面），
     所以自己在手機上改不會通知到自己那台手機。 */
  eq('★ 教練用手機 → 會通知', mk('coach',true), true);
  eq('★ 會員用手機 → 會通知', mk('member',true), true);
  eq('★ 管理員用手機 → 也要通知（老闆在場邊改課卡，櫃檯桌機要看得到）', mk('admin',true), true);
  eq('★ 櫃檯用手機 → 也要通知', mk('front_desk',true), true);
  eq('★ 用桌機（在家調課）→ 不通知，規則講的是「手機端」', mk('coach',false), false);
  eq('　　管理員用桌機同樣不通知（他就在桌機前）', mk('admin',false), false);
  eq('　　沒登入不通知', new Function('CLOUD','SESSION','isMobileLayout',fn+'\nreturn mchgEnabled();')(true,null,()=>true), false);
  eq('　　離線／本機模式不通知', new Function('CLOUD','SESSION','isMobileLayout',fn+'\nreturn mchgEnabled();')(false,{role:'coach'},()=>true), false);
}

console.log('\n哪些表要通知');
{
  const lbl=new Function(g('const MCHG_LABEL=','};')+'\nreturn MCHG_LABEL;')();
  eq('★ 預約', lbl.bookings, '預約');
  /* 2026-08-01 使用者指示：「移除右下角手機打卡的提示」——
     教練每天上下班各打一次卡，櫃檯右下角被例行打卡洗版，課卡異動反而被推走。
     補卡申請留著（那是要核准的待辦，不是例行紀錄）。細節見 tests/veruptest.js。 */
  eq('★ 出勤打卡不再通知（2026-08-01）', lbl.attendance, undefined);
  eq('★ 補卡申請', lbl.punch_requests, '補卡申請');
  eq('★ 會員資料', lbl.members, '會員資料');
  ok('★ 不含 member_tickets／ticket_logs —— 簽到一次連寫三張表，會跳三張卡',
     !('member_tickets' in lbl) && !('ticket_logs' in lbl));
  ok('　　原因寫在程式裡', /全都通知就是同一件事跳三張卡/.test(src));
}

/* 2026-07-31 使用者指示：右下角滑出的課卡調整訊息要帶會員姓名，方便閱讀 */
console.log('\n卡片內容（含會員姓名）');
{
  const MEM={'M1':{id:'M1',name:'黃姸元'}};
  const mk=async()=>{
    const fn=g('async function mchgWho(obj){','\n}\n')+'\n'+g('async function mchgDescribe(store, obj){','\n}\n');
    return new Function('MCHG_LABEL','dbGet','bkIsGroup','mids','bkName',fn+'\nreturn mchgDescribe;')
      ({bookings:'預約',attendance:'出勤打卡'},
       async(t,id)=>MEM[id]||null,
       b=>!!(b&&b.category==='小班肌力'),
       b=>(b&&Array.isArray(b.member_ids))?b.member_ids:[],
       (b,nameOf)=>b.trial_name||'—');
  };
  return mk().then(async d=>{
    eq('★ 一般課帶會員姓名',
       await d('bookings',{date:'2026-08-01',start_time:'19:00',category:'私人教練',member_id:'M1',status:'booked'}),
       '08/01 19:00　私人教練　黃姸元　·　已預約');
    eq('★ 團課是一堂多人 → 顯示人數',
       await d('bookings',{date:'2026-07-31',start_time:'11:00',category:'小班肌力',member_ids:['A','B','C'],status:'checked_in'}),
       '07/31 11:00　小班肌力　3 人　·　已簽到');
    eq('★ 體驗沒有會員 → 用客戶名',
       await d('bookings',{date:'2026-08-01',start_time:'19:00',category:'體驗',trial_name:'程凱郁'}),
       '08/01 19:00　體驗　程凱郁');
    eq('　　查不到名字就不寫（不塞破折號）',
       await d('bookings',{date:'2026-08-01',start_time:'19:00',category:'私人教練',member_id:'ZZ',status:'cancelled'}),
       '08/01 19:00　私人教練　·　已取消');
    eq('　　其他表用表名（櫃檯至少知道去哪裡看）', await d('attendance',{id:'A1'}), '出勤打卡');
    ok('　　為什麼要帶名字，寫在程式裡',
       /有名字才知道是誰的課，不然櫃檯得自己去行事曆對時間/.test(src));
    return rest();
  });
}
function rest(){

console.log('\n顏色與去重');
ok('★ 取消／刪除用紅（self_cancel），其餘用金（self_move）',
   /const type = \(action==='delete'\|\|obj&&obj\.status==='cancelled'\) \? 'self_cancel' : 'self_move';/.test(src));
ok('　　綠色（self_book）留給會員自助預約那條，兩種來源看得出差別',
   /self_book 綠留給會員自助預約那條/.test(src));
ok('★ 同一筆短時間重複寫只跳一次（連點、先存時間再存備註）',
   /if\(_mchgSeen\[key\] && now-_mchgSeen\[key\] < 20000\) return;/.test(src));
ok('　　去重的鍵含表名＋id＋動作', /const key=store\+':'\+\(\(obj&&obj\.id\)\|\|''\)\+':'\+action;/.test(src));

console.log('\n桌機那頭：收得到、看得懂');
ok('★ 右下角的 feed 本來就只給櫃檯／管理員／店長的桌機',
   /return CLOUD && SESSION && isDeskLike\(\) && !isMobileLayout\(\);/.test(src));
ok('★ 撈的是同一批（recipient_type=desk、未讀）',
   /\.eq\('recipient_type','desk'\)\.eq\('read',false\)/.test(src));
/* 2026-08-01 使用者指示：拿掉「幾分鐘前」，直接寫他們操作的時刻 */
ok('★ 時間字樣改「手機操作」（來源不再只有會員），並直接寫時刻',
   /return `手機操作 \$\{date\}\$\{hh\}`;/.test(src));
ok('　　「全部確認」的確認語也跟著改', /確認這 \$\{ids\.length\} 則手機端異動通知？/.test(src));
ok('　　會員自助的三支 RPC 不走 dbPut，所以不會重複跳',
   /會員自助預約／改期／取消走的是 RPC（fn_member_self_\*），那邊已經有 desk_alert，/.test(src));

/* 2026-07-31 使用者指示：右下角跳的提示，狀態字樣要給底色才好讀 ——
   已預約＝綠、已取消＝紅、只是調整時間＝黃。 */
console.log('\n狀態字樣上底色');
{
  const i=src.indexOf('const DFEED_CHIPS=');
  const j=src.indexOf('function deskFeedPush(n){', i);
  const dfeedText=new Function(src.slice(i,j)+'\nreturn dfeedText;')();
  /* 2026-08-02 使用者回報：「變更了 這三個文字不用背景色，左邊已經有顯示了」——
     動作那幾個詞改成只上色（dfeed-word），結果狀態才保留色塊（dfeed-chip）。
     顏色分類本身沒變，所以這裡兩種都收。 */
  const cls=t=>{ const m=/dfeed-(?:chip|word)-(\w+)">([^<]+)</.exec(dfeedText(t)); return m?[m[2],m[1]]:null; };
  const kind=t=>{ const m=/dfeed-(chip|word)-/.exec(dfeedText(t)); return m?m[1]:null; };
  eq('★ 已預約 → 綠', cls('08/13 13:00　小班肌力　·　已預約'), ['已預約','ok']);
  eq('★ 結果狀態保留色塊（那是本文才有的資訊）', kind('已預約'), 'chip');
  eq('★ 動作的詞只上色不上底（左邊的色塊已經講過同一件事）', kind('變更了'), 'word');
  eq('　　取消／刪除同理', kind('已取消'), 'word');
  eq('★ 已取消 → 紅', cls('08/13 13:00　小班肌力　·　已取消'), ['已取消','bad']);
  eq('★ 只是調整時間 → 黃', cls('從手機變更了預約'), ['變更了','warn']);
  eq('　　刪除也算取消那一類（紅）', cls('從手機刪除了預約'), ['刪除了','bad']);
  eq('　　改期＝調整時間（黃）', cls('已改期至 8/20 14:00'), ['已改期','warn']);
  eq('　　已簽到／已完成也是綠', cls('08/13 已簽到'), ['已簽到','ok']);
  eq('★ 「取消預約」整組上色，不會被「預約」先吃掉', cls('會員取消預約'), ['取消預約','bad']);
  ok('★ 先跳脫 HTML 再包標籤（通知內容來自使用者輸入）',
     dfeedText('<b>x</b> 已取消').indexOf('&lt;b&gt;')===0);
  ok('　　沒有狀態字樣就不加東西', dfeedText('會員資料變動')==='會員資料變動');
  ok('　　null 不會爆', dfeedText(null)==='');
  ok('★ 三種底色都定義了',
     /\.dfeed-chip-ok\{background:var\(--green,#1f6f54\);color:#fff;\}/.test(src)
     && /\.dfeed-chip-bad\{background:var\(--danger,#b5372e\);color:#fff;\}/.test(src)
     && /\.dfeed-chip-warn\{background:#e6c274;color:#4a2f10;\}/.test(src));
  ok('　　標題與內容都套用', /<span class="dfeed-t">\$\{dfeedText\(n\.title\)\}<\/span>/.test(src)
     && /<span class="dfeed-b">\$\{dfeedText\(n\.body\)\}<\/span>/.test(src));
}

/* 2026-07-31 使用者回報：7/13 13:00 小曾代課，行事曆上方篩選小曾卻看不到這堂 */
console.log('\n行事曆教練篩選要算代課');
ok('★ 篩選比對「實際上課的教練」（有代課就是代課教練）',
   /if\(opts\.coachFilter && filterCoach!=='all' && bkCoachId\(b\)!==filterCoach\) return false;/.test(src));
ok('★ 「實際由誰上」與「跟誰有關係」分成兩支，不會再用錯',
   /function bkCoachId\(b\)\{ return \(b && \(b\.substitute_coach_id \|\| b\.coach_id\)\) \|\| null; \}/.test(src)
   && /function bkIsCoach\(b, cid\)\{/.test(src));
{
  const g2=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const api=new Function(g2('function bkCoachId(b){','\n')+'\n'+g2('function bkIsCoach(b, cid){','\n}\n')
    +'\nreturn {bkCoachId,bkIsCoach};')();
  const B={coach_id:'C-MEI',substitute_coach_id:'C-TSENG'};
  eq('★ 有代課 → 實際上課的是代課教練', api.bkCoachId(B), 'C-TSENG');
  eq('　　沒代課 → 主責', api.bkCoachId({coach_id:'C-MEI'}), 'C-MEI');
  eq('　　都沒有 → null', api.bkCoachId({}), null);
  ok('★ 權限問法：主責交出去了仍算他的課', api.bkIsCoach(B,'C-MEI')===true && api.bkIsCoach(B,'C-TSENG')===true);
  ok('　　不相干的教練 → false', api.bkIsCoach(B,'C-X')===false);
  ok('　　null 不會爆', api.bkIsCoach(null,'C-MEI')===false && api.bkCoachId(null)===null);
}
ok('　　為什麼分兩支，寫在程式裡',
   /兩種問法不一樣，用錯就會出這種漏網的課/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
}
