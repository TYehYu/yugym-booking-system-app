/* 1V2 同行會員（2026-09-23）

   使用者 0922 提案：「如果是1V2的方案　可以新增另一位會員進來…
     重點是課表本來是[會員A][會員B]　現在這樣可以帶入兩個會員的名字
     教練紀錄的時候可以知道這張課表是給誰的…
     當然如果沒有新增另一位會員進來　還可以維持[會員A][會員B]的方式」

   ⚠⚠ 這跟「共享設定」**不是同一件事**，使用者明講「跟共享這個按鈕的定義不一樣」：
     ・shared_with：共用同一個堂數池，對方**可以拿這張票去約課、會扣堂數**
     ・partner_id ：只是「這堂課還有這一位一起上」，**不扣他的課、他不能約課**
   使用者確認的收費現況：「只有一位付錢、另一位跟著上」。

   談定的範圍就兩件（別擴張）：
     ① 課表顯示兩個真名   ② 第二位看得到這張票的課程預約
   刻意不做：合約簽名（「紙本簽約的時候只留下其中一個會員的姓名做代表 只有他簽名」）、
            自主訓練（那是另一張票的權益，跟著送等於白送點數）。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 課表的學員頁籤：有設就實名，沒設維持 A／B');
{
  /* 2026-09-23 二修（使用者定版）：「該方案能夠使用的都可以成為同行人
     只是上課只能選擇兩個名額寫課表」——第二位改成**逐堂**指定，
     booking.partner_id 優先、票上的 member_tickets.partner_id 當預設。
     起因是使用者的反例「有可能是兒子買給爸媽1v2使用的呢?」：
     持有人根本不是學員，而且爸媽之外還可能有阿姨輪流。 */
  /* 2026-09-23 定版（使用者重新定義共享與同行）：
       「同行是1v2的方案限定　目的是要讓兩個會員都看得到預約
         以及教練要填寫兩人的訓練紀錄使用」
       「1v2同行 我們一開始就該綁定兩個會員的姓名」
       「本來就不該由第三位會員一起使用該張票券」
     ⚠⚠ 中間一度做成「逐堂挑人」（booking.partner_id ＋ ▾ 選單），
       定了「不該有第三位」之後整組收掉 —— 沒有輪流就沒有挑的必要。
       這幾條反面斷言擋著日後又把選單加回來。 */
  ok('★★★ 兩位在票上就綁好，課表純顯示不給挑',
     !/tlPickSlot|tlPickPartner|tl-slot-ar|_tlPartnerCand/.test(src));
  ok('★★★ 課表的第二位＝票上「上課這位（A）的同行人」',
     /partnerId = b\.partner_id \|\| \(\(typeof tkPartnerOf==='function'\)\?tkPartnerOf\(_tk,b\.member_id\):''\) \|\| '';/.test(src));
  ok('★★★ A 是 booking 綁的那位，不是票持有人（兒子買票時持有人不上課）',
     /A ＝ 這張 booking 綁的會員（抬頭那位，不一定是票持有人/.test(src));
  ok('★★ 同行的候選是全部會員，不限制在票的可用人（媽可能沒共享也沒買票）',
     /const hit=ms\.filter\(m=>m && m\.id!==st\.who && m\.id!==st\.pid/.test(src));
  ok('　 為什麼收掉挑人選單，寫在原地', /沒有輪流，就沒有挑的必要/.test(src));
  ok('　 「沒設就維持 A／B」寫在原地', /如果沒有新增另一位會員進來/.test(src));
}

console.log('①-2 一張票可以有好幾組同行（2026-09-23 定版）');
{
  /* 使用者確認的模型：
       「兒子買了1v2票共享給爸爸　在爸爸的共享票這邊設定同行媽媽
         用爸爸的名字預約的時候就會看到 [爸爸][媽媽]
         如果在兒子設定同行爸爸　用兒子的名字預約就會看到[兒子][爸爸]」
     ⚠ 同日稍早的單一欄位 partner_id 做不到這件事（一張票只有一格），
       改成 partners = { 上課那位: 他的同行人 }。 */
  const F=(src.match(/function tkPartnerOf\(t, mid\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ tkPartnerOf(票, 誰) 讀的是那一位的那一格',
     /const v=m\?m\[String\(mid\)\]:'';/.test(F));
  ok('★★ 舊的單一欄位只當最後退路，而且只對持有人生效',
     /return \(String\(t\.member_id\)===String\(mid\) && t\.partner_id\) \? String\(t\.partner_id\) : '';/.test(F));
  /* 實跑：兩組互不影響 */
  const tkPartnerOf=new Function('t','mid', F.replace(/^function tkPartnerOf\(t, mid\)\{/,'').replace(/\}$/,''));
  const T={member_id:'SON', partners:{'DAD':'MOM','SON':'DAD'}};
  ok('★★★ 實跑・爸爸的同行是媽媽', tkPartnerOf(T,'DAD')==='MOM', tkPartnerOf(T,'DAD'));
  ok('★★★ 實跑・兒子的同行是爸爸', tkPartnerOf(T,'SON')==='DAD', tkPartnerOf(T,'SON'));
  ok('★★ 實跑・沒設過的人沒有同行', tkPartnerOf(T,'AUNT')==='', tkPartnerOf(T,'AUNT'));
  ok('★★ 實跑・退路只給持有人',
     new Function('t','mid', F.replace(/^function tkPartnerOf\(t, mid\)\{/,'').replace(/\}$/,''))(
       {member_id:'SON', partner_id:'DAD'},'DAD')==='');
}

console.log('② 櫃檯的設定入口');
{
  const F=(src.match(/async function openTicketPartner\(ticket_id,for_member\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ 只有櫃檯以上能設', /if\(!\(isDeskLike\(\)\)\)\{ showToast\('只有管理員或櫃台可設定同行會員'\); return; \}/.test(F));
  ok('★★★ 按鈕只給 1V2 的教練課票',
     /const _isV2=String\(t\.format\|\|''\)\.toUpperCase\(\)==='1V2';/.test(src)
     && /const canPartner=canShare && _isV2;/.test(src)
     && /\$\{canPartner\?`<button class="btn btn-ghost btn-sm" onclick="openTicketPartner\(/.test(src));
  ok('★★★ 不能把自己選成同行者（會讓課表兩個頁籤同名）',
     /m\.id!==st\.who && m\.id!==st\.pid/.test(src));
  ok('★★ 視窗裡明講「不扣他的堂數、不能拿這張票約課」',
     /<b>不會<\/b>扣他的堂數，他也<b>不能<\/b>拿這張票去約課 —— 那是「共享設定」在做的事/.test(src));
  const S=(src.match(/async function tkPtSave\(\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ 寫的是「這一位的那一格」，不是整張票',
     /if\(st\.pid\) _map\[String\(st\.who\)\]=String\(st\.pid\); else delete _map\[String\(st\.who\)\];/.test(S)
     && /t\.partners=_map;/.test(S));
  ok('★★★ 持有人與共享者的票卡都設得了（設的是那一位的同行人）',
     /tkUsableBy\(t,PP\.id\):t\.member_id===PP\.id\)/.test(src));
  ok('★★ 視窗標題講清楚是幫誰設（否則櫃檯會以為整張票都變了）',
     /<div class="modal-title">\$\{escH\(st\.whoName\)\} 的同行會員<\/div>/.test(src)
     && /這張票的<b>其他使用人可以各自設自己的同行會員<\/b>，互不影響/.test(src));
  ok('★★★ 留一筆帳本（誰在什麼時候把誰設成同行者），但 delta 0 不動堂數',
     /await logTicket\(t\.id,'adjust',0,null,SESSION\.name,\s*\n\s*`同行會員（\$\{st\.whoName\}）：/.test(S));
  ok('★★ 票名旁標出同行者，而且與共享的綠色標籤分得開',
     /const partnerTag=\(_isV2 && _ptIdM && _ptName\)/.test(src)
     && /background:#faf3e3;color:#8a6a20/.test(src)
     && /\$\{instTag\}\$\{shareTag\}\$\{partnerTag\}<\/div>/.test(src));
  ok('★★★ partnerTag 宣告在 _isV2／_ptName 之後（const 有暫時死區，放前面整頁會白掉）',
     src.indexOf('const _isV2=String(t.format') < src.indexOf('const partnerTag=(_isV2'));
  ok('★★ 同行者的名字查得到（peerName 原本只在有共享票時才撈 members）',
     /const _hasPartner=\(myTickets\|\|\[\]\)\.some\(t=>t&&\(\(t\.partners&&Object\.keys\(t\.partners\)\.length\)\|\|t\.partner_id\)\);/.test(src)
     && /if\(_shrPeers\.size \|\| _hasPartner\)\{/.test(src));
}

console.log('②-2 會員檔案頁那張卡也要有（同一件事有好幾張卡片）');
{
  /* 使用者 0923 附截圖：「我在桌機看到的票券卡長這樣　跟你展示的不一樣」——
     我第一版只掛在 md-tk-item，而他實際在用的是會員檔案頁的 bkd-tkcard。
     見記憶 yugym-card-template-copy：改了一張不等於改好。 */
  ok('★★★ bkd-tkcard（會員檔案頁）也有入口',
     /const _ptOk=isDeskLike\(\)&&t\.status==='usable'&&tab==='pt'/.test(src)
     && /openTicketPartner\('\$\{t\.id\}','\$\{PP\.id\}'\)/.test(src));
  ok('★★★ 兩張卡都有（md-tk-item ＋ bkd-tkcard）',
     (src.match(/openTicketPartner\(/g)||[]).length>=4);
  /* 2026-09-23 二修（使用者：「設定同行可以改在課程名稱右邊」）——
     原本跟共享章擠在右上角。兩組就此分開：
     共享＝「這張票還有誰能用」（右上角，0830 定的），同行＝「這堂課還有誰一起上」（名稱旁）。 */
  ok('★★★ 同行的章與按鈕都在課程名稱那一列（不是右上角）',
     /⚠ 對帳<\/button>`:''; \}\)\(\)\}\$\{[\s\S]{0,1400}?\*\/''\}\$\{ptTag\|\|''\}/.test(src)
     && /\$\{\s*\n?\s*\(_ptOk&&!_ptId\)\?`<button class="btn btn-ghost btn-sm" style="padding:2px 9px;font-size:11px;flex:none;"/.test(src));
  ok('★★★ 共享那一組沒被動到（右上角那一列只剩共享）',
     /<span class="bkd-tkcard-share">\$\{shrTag\|\|''\}\$\{\s*\n\s*\(_canShare&&!_shN\)\?`<button/.test(src)
     && !/<span class="bkd-tkcard-share">[\s\S]{0,120}ptTag/.test(src));
  ok('★★ 章與按鈕放在同一處（設定前後位置不會跳）',
     src.indexOf('${ptTag||\'\'}${') < src.indexOf('openTicketPartner(\'${t.id}\',\'${PP.id}\')">設定同行'));
  ok('　 為什麼共享留在右上角，寫在原地', /共享是「這張票還有誰能用」，同行是「這堂課還有誰一起上」/.test(src));
  ok('　 踩到的坑寫在原地', /跟你展示的不一樣/.test(src));
}

console.log('②-3 自訂方案分不出 1V1／1V2（使用者：「如果是自訂方案　有辦法區分嗎」）');
{
  /* 正式庫：自訂銷售賣出的 1V2 有 461 張 format 是對的，但走「自訂方案」那條路的
     47 張（40 張還有效）format 是空的 —— 自訂銷售把 format 寫死 null。 */
  ok('★★★ 自訂銷售加了「授課類型」欄位',
     /<div class="form-row" id="gt-c-fmt-row" style="display:none;">/.test(src)
     && /ashOptField\('gt-c-fmt', \[\{v:'',label:'不指定'\},\{v:'1V1',label:'1V1　一對一'\},\{v:'1V2',label:'1V2　一對二'\}\]/.test(src));
  ok('★★★ 合成方案把 format 帶出去（原本寫死 null）',
     /format:\(\(v\('gt-c-fmt'\)\|\|\{\}\)\.value\|\|''\)\|\|null,/.test(src));
  ok('★★ 不設成必填（8/26 之前賣的票也都沒有，硬性要求會讓櫃檯卡住）',
     /不設成必填/.test(src));
  ok('★★★ 既有 format 空白的票也給得了同行會員（否則那 40 張救不回來）',
     /&&\(_fmtU==='1V2'\|\|_fmtU===''\);/.test(src));
  const S=(src.match(/async function tkPtSave\(\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ 設同行者時順手把空白的 format 補成 1V2',
     /if\(st\.pid && !String\(t\.format\|\|''\)\.trim\(\)\)\{ t\.format='1V2'; _fmtFixed=true; \}/.test(S));
  ok('★★★ 不覆蓋已經寫了 1V1 的（那是櫃檯明確選過的）',
     /!String\(t\.format\|\|''\)\.trim\(\)/.test(S) && !/t\.format='1V2';\s*\n\s*await dbPut/.test(S));
  ok('★★ 補標了要講出來（吐司與帳本都寫）',
     /（這張票已一併標成 1V2）/.test(S) && /授課類型補標 1V2/.test(S));
  ok('★★ 移除同行者時不動 format（票本來就是 1V2，只是這次沒有第二位）',
     /移除同行者時不動 format/.test(S));
  const R=(src.match(/function grantCustomFmtRow\(p\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ 只有教練課／友善教練課才顯示這一列',
     /const show = nm==='教練課' \|\| nm==='友善教練課';/.test(R));
  ok('★★★ 藏起來時要清值（先選教練課 1V2、再改團體課，值留著就會賣出「團體課・1V2」）',
     /if\(!show\)\{[\s\S]{0,260}f\.value='';/.test(R));
  ok('★★ 清值要連按鈕上的字一起清（值在 hidden input、字在 -btn）',
     /btn\.firstElementChild\.textContent='選擇授課類型'/.test(R));
  ok('★★ 每次驗證都重算顯示', /grantCustomFmtRow\(p\);/.test(src));
}

console.log('②-4 共享與同行是正交的兩件事（2026-09-23 使用者重新定義）');
{
  /* 使用者：「共享是Ａ買票券跟其他人一起使用　可能是1v1可能是1v2
              同行是1v2的方案限定　目的是要讓兩個會員都看得到預約
              以及教練要填寫兩人的訓練紀錄使用」
     ⚠⚠ 我中間提過「1V2 不該用共享」——**那是錯的**，使用者的定義裡
       1V2 照樣可以共享（共享回答堂數、同行回答課表寫誰）。
       這條守著：不可以因為是 1V2 就擋掉共享。 */
  ok('★★★ 1V2 票照樣能共享（共享的條件沒有因為同行而加上 format 限制）',
     /const _canShare=isDeskLike\(\)&&t\.status==='usable'&&\(tab==='pt'\|\|tab==='group'\)&&t\.member_id===PP\.id;/.test(src));
  ok('★★★ 同行是 1V2 限定（1V1 明確標過的不給設）',
     /&&\(_fmtU==='1V2'\|\|_fmtU===''\);/.test(src)
     && /1V1 明確標過的不放行 —— 1V1 沒有第二位/.test(src));
  ok('★★ 兩者各自的目的寫在原地',
     /共享（shared_with）：共用同一個堂數池/.test(src)
     && /同行是1v2的方案限定/.test(src));
}

console.log('③ 不可以變成共享（這是這次最容易做錯的地方）');
{
  const F=(src.match(/async function tkPtSave\(\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ 設定同行者完全不碰 shared_with', !/shared_with/.test(F));
  ok('★★★ 不碰堂數（sessions_remaining／unlocked_sessions）',
     !/sessions_remaining|unlocked_sessions/.test(F));
  ok('★★★ 不建預約、不寫收款', !/bookings|purchases/.test(F));
  ok('　 兩者差別寫在原地', /跟共享這個按鈕的定義不一樣/.test(src));
}

console.log('④ 資料庫那一半');
{
  const m1=root+'docs/migrations/20260923_ticket_partner_id.sql';
  const m2=root+'docs/migrations/20260923_bookings_select_partner.sql';
  const m3=root+'docs/migrations/20260923_booking_partner_id.sql';
  const t3=fs.existsSync(m3)?fs.readFileSync(m3,'utf8'):'';
  ok('★★ 逐堂那一支也進版控', fs.existsSync(m3));
  ok('★★★ 欄位加在 bookings 上', /alter table bookings\s*\n\s*add column if not exists partner_id text;/.test(t3));
  ok('★★★ 同行者看得到自己被指定的那幾堂（票層級那條涵蓋不到）',
     /create policy bookings_select_partner_booking on bookings\s*\n\s*for select\s*\n\s*using \(partner_id is not null and partner_id = \(select current_member_id\(\)\)\);/.test(t3));
  ok('★★ 講明不扣課、不進營收', /不扣第二位的課/.test(t3) && /不進任何扣課／營收邏輯/.test(t3));
  ok('★★ 這個欄位目前沒有 UI 在寫，檔頭要講清楚（免得下一個人以為壞了）',
     /目前\*\*沒有任何 UI 在寫\*\*/.test(t3));
  ok('　 1V1 共享票不受影響寫在原地', /共享票也是1v1有可能是Ａ上課或Ｂ上課/.test(t3));
  ok('★★ 兩支 migration 都進版控', fs.existsSync(m1) && fs.existsSync(m2));
  const t1=fs.existsSync(m1)?fs.readFileSync(m1,'utf8'):'';
  const t2=fs.existsSync(m2)?fs.readFileSync(m2,'utf8'):'';
  ok('★★★ 欄位加在票券上（不是每一堂課上）',
     /alter table member_tickets\s*\n\s*add column if not exists partner_id text;/.test(t1));
  ok('★★ 有索引（會員端要問「有哪些票把我設成同行」）',
     /create index if not exists idx_member_tickets_partner on member_tickets\(partner_id\)/.test(t1));
  ok('★★★ RLS 另開一條，不改既有的 shared_pool（policy 是 OR 的，改它會波及共享票）',
     /create policy bookings_select_partner on bookings/.test(t2)
     && !/alter policy bookings_select_shared_pool|drop policy/.test(t2));
  ok('★★★ 只給 SELECT —— 同行者不能約課、不能改、不能取消',
     /for select/.test(t2) && !/for (insert|update|delete|all)/i.test(t2));
  ok('　 為什麼不開 member_tickets 的讀取，寫在原地', /剩幾堂、買多少錢是持票人的事/.test(t2));
  const m4=root+'docs/migrations/20260923_ticket_partners_map.sql';
  const t4=fs.existsSync(m4)?fs.readFileSync(m4,'utf8'):'';
  ok('★★ 定版那一支進版控', fs.existsSync(m4));
  ok('★★★ partners 是「誰 → 他的同行人」的對應，不是單一欄位',
     /add column if not exists partners jsonb not null default '\{\}'::jsonb;/.test(t4));
  ok('★★★ RLS 認的是「這堂的 A 的同行人是我」',
     /and t\.partners ->> bookings\.member_id = \(select current_member_id\(\)\)/.test(t4));
  ok('★★★ 舊的那條 policy 要先 drop（否則兩條 OR 起來等於沒換）',
     /drop policy if exists bookings_select_partner on bookings;/.test(t4));
  ok('★★ 只給 SELECT', /for select/.test(t4) && !/for (insert|update|delete|all)/i.test(t4));
  ok('　 使用者的那段話寫在檔頭', /在爸爸的共享票這邊設定同行媽媽/.test(t4));
}

console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
