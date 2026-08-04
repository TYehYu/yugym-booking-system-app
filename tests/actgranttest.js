/* 2026-08-04 三件一起驗：
   ① 使用者回報（蕭育筑友善優惠1V1）：7/31 已上第一堂，效期卻顯示「未開通」——
     預約走 RPC 路徑時 DB 端扣課，前端 deductTicket 的首堂開通從沒跑到
   ② 使用者回報：票券卡加了「使用人」後右邊四顆按鈕被擠成直條
   ③ 使用者指示：「共享的票券，課程贈送的自主訓練也要歸屬於上課的那一方」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① RPC 路徑的首堂開通');
{
  const f=grabFn('createBookingViaRpc');
  ok('★ 建立成功後補跑 activateTicketIfNeeded',
     /if\(tk && tk\.valid_days && !tk\.activated_at\)\{/.test(f)
     && /const nd=await activateTicketIfNeeded\(fresh, data\.booking_id\);/.test(f));
  ok('★★ 先重讀票券再開通（RPC 已改過餘額，用舊物件會把餘額寫回舊值）',
     /const fresh=await dbGet\('member_tickets', tk\.id\);\n\s*if\(fresh && fresh\.valid_days && !fresh\.activated_at\)\{/.test(f));
  ok('★ 開通有留帳（ticket_logs adjust）', /首堂開通（RPC 路徑補跑），效期至 \$\{nd\}/.test(f));
  ok('　　開通失敗不擋預約（包 try）', /catch\(_\)\{\}\n\s*\}\n\s*return \{ ok:true, booking_id:data\.booking_id \};/.test(f));
  ok('　　原本的 deductTicket 開通路徑不變（非 RPC 用）',
     /const newExpire=await activateTicketIfNeeded\(ticket,booking_id\);/.test(src));
}

console.log('\n② 票券卡底列不再擠壓');
{
  ok('★ 整列允許換行', /flex-wrap:wrap;gap:6px 10px;">\n\s*<span style="min-width:0;">\$\{tkBuyDateHtml\(t\)\}/.test(src));
  ok('★ 按鈕列不縮不折字', /style="display:flex;gap:6px;flex:none;margin-left:auto;white-space:nowrap;">/.test(src));
}

console.log('\n③ 贈點歸屬上課的那一方');
{
  const seg=src.slice(src.indexOf('let _grantTo=b.member_id;'), src.indexOf('ticket_type_id:rewardTypeId,'));
  ok('★ 前端：使用人對得上票券持有人/共享者 → 發給那位',
     /const _cands=\[_t&&_t\.member_id\]\.concat\(_t\?tkSharedIds\(_t\):\[\]\)\.filter\(Boolean\);/.test(seg)
     && /_cands\.includes\(m\.id\)&&String\(m\.name\|\|''\)\.trim\(\)===String\(b\.trial_name\)\.trim\(\)/.test(seg));
  ok('★ 發放的票掛在歸屬者名下', /member_id:_grantTo,/.test(src));
  ok('　　對不上（家庭成員稱呼）維持發給帳號本人', /let _grantTo=b\.member_id;/.test(src));
  ok('　　DB 端同一規則的 migration 留檔',
     fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260804_reward_grant_to_named_attendee.sql'));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
