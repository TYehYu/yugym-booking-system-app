/* 2026-08-08 使用者指示：「我要管理員有能力可以刪除註冊錯誤或輸入錯誤的會員，
   包含用 line 申請錯誤的」

   ⚠「用 LINE 申請錯誤」是重點：光刪 members 那一列不夠 ——
     LINE 登入是靠 auth.users 裡的 line_{uid}@line.yugym.local 對上來的，
     Auth 帳號還在的話，那個人重新用 LINE 登入只會回到同一個空殼帳號，
     永遠申請不了新的。所以要連 Auth 帳號一起刪，那需要 service_role 權限
     → 走 security definer 的 fn_admin_delete_member。

   ⚠ 只刪「乾淨的」：名下有票券／預約／收款／合約／購買申請／訓練紀錄一律擋下並列出來。
     刪掉那些會讓報表與帳目對不起來，而且回不來。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 資料庫端：誰能刪、什麼情況不能刪');
{
  const mig=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260808_fn_admin_delete_member.sql';
  ok('★ migration 有進版控', fs.existsSync(mig));
  const sql=fs.readFileSync(mig,'utf8');
  ok('★★ 只有管理員（櫃檯不行 —— 刪錯人沒有回頭路）',
     /if coalesce\(current_staff_role\(\), ''\) <> 'admin' then\n\s*return jsonb_build_object\('ok', false, 'error_code', 'AUTH\.FORBIDDEN'\);/.test(sql));
  ok('★★ 名下有任何一種資料就擋下，並回報各有幾筆',
     /if \(n_bookings \+ n_tickets \+ n_purchases \+ n_contracts \+ n_apps \+ n_logs\) > 0 then/.test(sql)
     && /'error_code', 'MEMBER\.HAS_DATA',/.test(sql));
  ok('★ 六種資料都算進去（票券／預約／收款／合約／購買申請／訓練紀錄）',
     /from bookings/.test(sql) && /from member_tickets/.test(sql) && /from purchases/.test(sql)
     && /from contracts/.test(sql) && /from purchase_applications/.test(sql) && /from training_logs/.test(sql));
  ok('★ 團課的名額也算（member_ids 不是 member_id）',
     /or member_ids @> to_jsonb\(array\[p_member_id\]\)/.test(sql));
  ok('★★ 連 Auth 帳號一起刪 —— 不然 LINE 重新申請只會回到同一個空殼',
     /delete from auth\.users where id = v_auth;/.test(sql)
     && /Auth 帳號還在的話，\n-- 那個人重新用 LINE 登入只會回到同一個空殼帳號，永遠申請不了新的。/.test(sql));
  ok('★ 附屬品跟著走（通知、綁定申請），不算歷史',
     /delete from notifications where recipient_type = 'member' and recipient_id = p_member_id;/.test(sql)
     && /delete from member_link_requests/.test(sql));
  ok('★ 綁定申請也用 auth_id 清一次（不然那個 Auth 會變成待審名單裡的孤兒）',
     /or \(v_auth is not null and auth_id = v_auth::text\)/.test(sql));
  ok('★ auth_id 不是合法 uuid（舊資料）不會讓整支炸掉',
     /exception when others then\n\s*v_auth := null;/.test(sql));
  ok('★ security definer＋只給登入者執行',
     /security definer/.test(sql)
     && /revoke all on function public\.fn_admin_delete_member\(text\) from public;/.test(sql)
     && /grant execute on function public\.fn_admin_delete_member\(text\) to authenticated;/.test(sql));
}

console.log('\n② 入口只有管理員看得到');
ok('★★ 按鈕只在會員資料、且只給管理員',
   /const delBtn = \(isM && SESSION && SESSION\.role==='admin'\)/.test(src)
   && /onclick="openDeleteMember\('\$\{r\.id\}'\)">刪除會員<\/button>/.test(src));
ok('★ 掛在表頭右上（與核對按鈕並排）', /\(isM \? lvBtn\+delBtn :/.test(src));
{
  const F=grabFn('openDeleteMember');
  ok('★ 函式本身也擋一次（深連結／主控台繞不過去）',
     /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以刪除會員'\); return; \}/.test(F));
  ok('★★ 事前講清楚：不能復原、會連登入帳號一起刪',
     /這是給<b>註冊錯誤／輸入錯誤<\/b>的資料用的，<b>不能復原<\/b>/.test(F)
     && /會一併刪掉這個人的<b>登入帳號<\/b> —— 這樣他才能重新用 LINE 申請一次。/.test(F));
  ok('★★ 要打對姓名才放行', /<label>請輸入這位會員的姓名以確認<\/label>/.test(F));
}
{
  const F=grabFn('_doDeleteMember');
  ok('★★ 姓名不符就擋下，並說明為什麼要這一關',
     /if\(typed!==String\(m\.name\|\|''\)\.trim\(\)\)\{ done\(\); showToast\('姓名不符，請再確認一次是不是這一位'\); return; \}/.test(F)
     && /清單上上下相鄰的名字常常很像\s*\n\s*（這次就有「陳瀚竣」與「陳瀚俊」）/.test(F));
  ok('★ 走 RPC（前端沒有能力刪 Auth 帳號）',
     /await sb\.rpc\('fn_admin_delete_member',\{p_member_id:mid\}\)/.test(F));
  ok('★★ 刪不掉時列出「卡在哪幾種資料、各幾筆」',
     /const items=Object\.keys\(DEL_MEM_LB\)\.filter\(k=>Number\(data\[k\]\)>0\)/.test(F)
     && /`\$\{DEL_MEM_LB\[k\]\} \$\{Number\(data\[k\]\)\} 筆`/.test(F));
  ok('★★ 並且告訴櫃檯那種情況該怎麼辦（不是只說不行）',
     /・買錯／打錯的票券 → 30 分鐘內可在首頁今日營收整筆退回，超過就走退費/.test(F)
     && /・排錯的課 → 先取消預約/.test(F)
     && /・只是資料填錯 → 直接改就好，不必刪除/.test(F));
  ok('★ 各種錯誤碼都有對應的話',
     /if\(code==='AUTH\.FORBIDDEN'\)/.test(F) && /if\(code==='MEMBER\.NOT_FOUND'\)/.test(F));
  ok('★ 刪完關掉覆層再回列表（人已經不在了，留在原頁會是空的）',
     /try\{ ppClose\(\); \}catch\(_\)\{\}/.test(F) && /navTo\('members','g_members'\);/.test(F));
  ok('★ 成功訊息講明「登入帳號一併刪除，可重新申請」',
     /\$\{data\.auth_deleted\?'（登入帳號一併刪除，可重新申請）':''\}/.test(F));
  ok('　　離線模式擋下', /if\(!\(CLOUD&&sb\)\)\{ done\(\); showToast\('離線模式無法刪除會員'\); return; \}/.test(F));
  ok('　　防連點', /async function doDeleteMember\(mid\)\{ return onceAct\('delmem:'\+mid, \(\)=>_doDeleteMember\(mid\)\); \}/.test(src));
  ok('　　寫入後清快取', /dbCacheClear\(\['members','notifications','member_link_requests'\]\);/.test(F));
}
ok('　　使用者的原話寫在程式裡',
   /「我要管理員有能力可以刪除註冊錯誤或輸入錯誤的會員，包含用 line 申請錯誤的」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
