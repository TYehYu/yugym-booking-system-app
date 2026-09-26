/* 1V2 同行會員：教練能設定（2026-09-26）

   使用者 0924 回報兩個洞：「教練的桌機看不到同行的按鈕」「會員看不到會員B也沒得切換」。
   這一支守第一件（教練端）；會員端那一半另外做。

   ⚠⚠ 這件事的重點不在「把按鈕畫出來」，而在**寫入走哪一條路**：
     教練對 member_tickets 只有讀的權限（mt_coach_read），原本的 dbPut 會被 RLS 擋；
     而 dbPut 是整列 upsert —— 真要讓教練走那條，等於把金額、堂數、效期整張票交給他改。
     所以改走 fn_ticket_set_partner（只改 partners 一欄，資料庫端自己檢查身分）。 */
const fs=require('fs');
const P=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(P+'index.html','utf8');
const mig=fs.readFileSync(P+'docs/migrations/20260926_1v2_partner_access.sql','utf8');
/* ⚠ 驗「某句已經不在了」之前先剝註解 —— 說明文字裡一定會再提到那句話（已踩四次） */
const code=src.replace(/\/\*[\s\S]*?\*\//g,' ');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 權限判準自己一支，不要散在各處');
ok('★★★ canSetPartner＝櫃檯以上 ＋ 教練',
   /function canSetPartner\(\)\{ return !!\(isDeskLike\(\) \|\| \(SESSION && SESSION\.role==='coach'\)\); \}/.test(src));
ok('★★★ 開窗那一道換成 canSetPartner（原本是 isDeskLike）',
   /if\(!canSetPartner\(\)\)\{ showToast\('只有管理員、櫃台或教練可設定同行會員'\); return; \}/.test(src)
   && !/只有管理員或櫃台可設定同行會員/.test(code));
ok('★★★ 會員票券卡那顆按鈕吃 canSetPartner',
   /const canPartner=canSetPartner\(\) && tkCategoryOf\(t\)==='course' && _isV2;/.test(src));
ok('★★ PP 票券卡那一側也換（兩處判準一致）',
   /const _ptOk=canSetPartner\(\)&&t\.status==='usable'&&tab==='pt'/.test(src));
/* ⚠ 共享**不能**跟著放行：共享會動到堂數池（對方拿這張票去約課會扣堂數），那是錢的事。 */
ok('★★★ 共享仍然只有櫃檯以上 —— 同行放行不等於共享放行',
   /const canShare=\(isDeskLike\(\)\)&&tkCategoryOf\(t\)==='course';/.test(src)
   && /if\(!\(isDeskLike\(\)\)\)\{ showToast\('只有管理員或櫃台可設定共享'\); return; \}/.test(src));

console.log('\n② 寫入走 RPC，不走 dbPut');
{
  const S=grab('tkPtSave');
  ok('★★★ 呼叫 fn_ticket_set_partner，四個參數都給',
     /sb\.rpc\('fn_ticket_set_partner',\{/.test(S)
     && /p_ticket_id:st\.ticket_id/.test(S) && /p_who:String\(st\.who\)/.test(S)
     && /p_partner_id:st\.pid\?String\(st\.pid\):null/.test(S)
     && /p_operator:\(SESSION&&SESSION\.name\)\|\|''/.test(S));
  ok('★★★ 不再 dbPut 整張票（那會把金額堂數效期一起交出去）',
     !/dbPut\('member_tickets'/.test(S.replace(/\/\*[\s\S]*?\*\//g,' ')));
  ok('★★★ RPC 失敗要往外丟（原本 dbPut 的錯有 catch 接，改了路不能變成靜默成功）',
     /if\(_e\) throw new Error\(_e\.message\|\|_e\);/.test(S));
  ok('★★★ 繞過 dbPut 就要自己清快取（CLAUDE.md 的規矩），票與帳本兩張都清',
     /dbCacheClear\(\['member_tickets','ticket_logs'\]\)/.test(S));
  ok('★★ 帳本改由函式那邊寫（同一個交易，不會有「票改了卻沒留痕」）',
     !/logTicket\(/.test(S.replace(/\/\*[\s\S]*?\*\//g,' '))
     && /insert into public\.ticket_logs/.test(mig));
}

console.log('\n③ 教練搜尋得到人（他讀得到的 members 只有自己帶過的）');
{
  const O=grab('openTicketPartner');
  ok('★★★ 非櫃檯以上時用 memberDirectory 補名字（只回 id＋姓名的那條窄路）',
     /if\(!isDeskLike\(\)\)\{/.test(O) && /await memberDirectory\(\)/.test(O));
  ok('★★ 已經撈得到的那幾位不重複塞',
     /const have=new Set\(members\.map\(m=>m&&m\.id\)\);/.test(O)
     && /if\(!have\.has\(id\)\) members\.push\(\{id, name:dir\[id\]\}\);/.test(O));
}

console.log('\n④ format 空白的自訂方案票也能設（兩側判準一致）');
ok('★★★ 會員票券卡：1V2 或空白都放行，1V1 不放行',
   /const _fmtU2=String\(t\.format\|\|''\)\.toUpperCase\(\);/.test(src)
   && /const _isV2=\(_fmtU2==='1V2'\|\|_fmtU2===''\);/.test(src));
ok('★★ PP 那一側本來就是這樣判的', /&&\(_fmtU==='1V2'\|\|_fmtU===''\);/.test(src));

console.log('\n⑤ migration：資料庫這一側的四件事');
ok('★★★ 函式只改 partners 一欄（外加 format 空白補標），不碰金額堂數效期',
   /set partners = _map,\s*\n\s*format\s*= case when _fmt_fix then '1V2' else format end/.test(mig)
   && !/set\s+(list_price|deal_amount|total_sessions|expire_date)/.test(mig));
ok('★★★ 教練要「帶過這位會員」才放行（can_coach_see_member）',
   /\(\(select is_coach\(\)\) and can_coach_see_member\(p_who\)\)/.test(mig));
ok('★★★ p_who 必須是這張票的可用人（持有人或共享者）—— 扣的是他的堂數',
   /jsonb_exists\(coalesce\(t\.shared_with,'\[\]'::jsonb\), p_who\)/.test(mig));
/* ⚠ 第一版把「同行人也必須在票上」寫進去，會把正式庫既有的一組鎖死
   （TK-mseo3fkypm63：shared_with 為 null、同行人不在票上）。 */
ok('★★★ 同行人**不**檢查在不在票上（同行不扣課、也不能拿票約課，本來就不必在票上）',
   /raise exception '找不到這位同行會員'/.test(mig)
   && !/同行會員必須是這張票的持有人或共享者/.test(mig.replace(/\/\*[\s\S]*?\*\//g,' ')));
ok('★★★ 參數先擋 null（plpgsql 裡 null 比較一律不成立，會靜默放行）',
   /if p_ticket_id is null or btrim\(p_ticket_id\) = '' then/.test(mig)
   && /if p_who is null or btrim\(p_who\) = '' then/.test(mig));
ok('★★★ 兩支函式都要 grant execute 給 authenticated 與 service_role',
   (mig.match(/grant execute on function public\.fn_ticket_set_partner\(text,text,text,text\) to authenticated;/g)||[]).length===1
   && (mig.match(/grant execute on function public\.fn_ticket_set_partner\(text,text,text,text\) to service_role;/g)||[]).length===1
   && /grant execute on function public\.fn_partner_names\(\) to authenticated;/.test(mig)
   && /grant execute on function public\.fn_partner_names\(\) to service_role;/.test(mig));
ok('★★★ 兩支都 security definer ＋ 釘 search_path（SECURITY DEFINER 不釘就是提權漏洞）',
   (mig.match(/security definer/g)||[]).length===2
   && (mig.match(/set search_path to 'public', 'pg_temp'/g)||[]).length===2);
ok('★★ 同行那位看得到票（新增一條 select policy，不動既有的三條）',
   /create policy mt_select_partner on public\.member_tickets/.test(mig)
   && /kv\.value = \(select current_member_id\(\)\)/.test(mig)
   && !/drop policy if exists mt_select_member/.test(mig)
   && !/drop policy if exists mt_all_staff/.test(mig));
ok('★★★ 同行那位只看得到「有同行關係的那幾堂」的訓練紀錄，不是對方的全部紀錄',
   /create policy tlog_select_partner on public\.training_logs/.test(mig)
   && /where b\.id = training_logs\.booking_id/.test(mig)
   && /\(t\.partners ->> b\.member_id\) = \(select current_member_id\(\)\)/.test(mig));
ok('★★ 姓名走只回 id＋name 的函式，不放寬 members 的 RLS',
   /returns table\(id text, name text\)/.test(mig)
   && !/alter policy members_select/.test(mig) && !/create policy .* on public\.members/.test(mig));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
