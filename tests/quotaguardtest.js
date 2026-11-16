/* 分期「已開通額度」共用防護（決策 A）：前端訊息／各入口接線 ＋ SQL 檔案靜態驗證。
   真正的資料庫行為由 docs/testdb/p0e/p0e_12_quota_refund_tests.sql 驗證（尚未執行）；併發由 run_concurrency.sh（尚未執行）。 */
const fs=require('fs'), crypto=require('crypto');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const rd=f=>fs.readFileSync(root+f,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i)+b.length);};
const md5=s=>crypto.createHash('md5').update(s).digest('hex')+':'+Buffer.byteLength(s);   // length 以字元數計（資料庫 length(text)）
const md5c=s=>crypto.createHash('md5').update(s).digest('hex')+':'+[...s].length;
const bodyOf=(sql,sig,delim)=>{ const i=sql.indexOf('create or replace function '+sig); const j=sql.indexOf(delim,i)+delim.length; return sql.slice(j, sql.indexOf(delim,j)); };

console.log('前端訊息與接線');
const q=new Function(g('function tkQuotaMsg(raw){','\n}\n')+'\nreturn tkQuotaMsg;')();
ok('★ 額度不足訊息帶出「已開通堂數」並指引下一步（DETAIL 帶數字）', /只開通 8 堂/.test(q({message:'TICKET.INSTALLMENT_LOCKED',details:'used=9 unlocked=8'})) && /開通下一期/.test(q({message:'TICKET.INSTALLMENT_LOCKED',details:'used=9 unlocked=8'})));
ok('★ 沒有數字時（RPC 只回代碼）也有人話，與 benefit_consume 既有的 TICKET.INSTALLMENT_LOCKED 同一個代碼、同一條規則', /尚未繳費的堂數不可預約/.test(q('TICKET.INSTALLMENT_LOCKED')));
ok('　 舊代碼 TICKET.QUOTA_EXCEEDED:9:8 仍可解析（向下相容）', /只開通 8 堂/.test(q('TICKET.QUOTA_EXCEEDED:9:8')));
eq('　 不是這個錯誤 → 空字串', [q('foo'),q(null),q(undefined),q({message:'x'})], ['','','','']);
ok('　 接受 Error／RPC error 物件', /只開通 4 堂/.test(q({message:'ERROR: TICKET.INSTALLMENT_LOCKED',details:'used=5 unlocked=4'})));
const fe=new Function('const DB_LABEL={};const tbl=x=>x;const authExpired=()=>{};const console={error(){}};'+g('function tkQuotaMsg(raw){','\n}\n')+src.slice(src.indexOf('function dbFriendlyError('),src.indexOf('async function dbGet(store,id)'))+';return dbFriendlyError;')();
{ const e=fe({message:'TICKET.INSTALLMENT_LOCKED',details:'used=9 unlocked=8'},'member_tickets','儲存');
  ok('★★ 前端直接寫餘額（dbPut）撞到額度：人話＋保留代碼與原始訊息', /只開通 8 堂/.test(e.message)&&!/TICKET\./.test(e.message)&&e.code==='TICKET.INSTALLMENT_LOCKED'&&/INSTALLMENT_LOCKED/.test(e.rawMessage), e.message); }
ok('★★ 各扣課入口都把額度錯誤翻成人話：櫃檯扣課(RPC)／會員團課報名／團課名單儲存／會員自行預約／建立預約',
   /const _qm=tkQuotaMsg\(error&&error\.message\);/.test(src) && /showToast\(tkQuotaMsg\(error\)\|\|\('連線失敗：'/.test(src)
   && /tkQuotaMsg\(_rpcErr&&_rpcErr\.message\)/.test(src) && /reason:tkQuotaMsg\(error\)\|\|/.test(src)
   && /TICKET\\\.\(INSTALLMENT_LOCKED\|QUOTA_EXCEEDED\)\/\.test\(String\(code\|\|''\)\)\) return tkQuotaMsg\(code\)/.test(src));
ok('★ 前端沒有各按鈕自己加額度判斷（額度只在資料庫把關；前端只翻訊息）', !/unlocked_sessions[^\n]{0,80}(>=|<=|>|<)[^\n]{0,40}(used|sessions_total)/.test(g('async function deductTicket(','\n}\n')));

console.log('\nSQL：額度觸發器');
const m=rd('docs/migrations/20261118_tk_quota_guard.sql'), codeOnly=m.replace(/--[^\n]*/g,'');
ok('★★ 單一把關點：member_tickets 的 BEFORE UPDATE（只在三個欄位變動時才觸發）', /before update of sessions_remaining, sessions_total, unlocked_sessions on public\.member_tickets/.test(m)&&/for each row/.test(m));
ok('★ 只攔「使用量增加且超過已開通額度」（退款／校正回調／補開通一律放行）', /v_used_new > v_used_old and v_used_new > new\.unlocked_sessions/.test(m));
ok('★ unlocked 為空或 ≥ 總堂數不適用', /new\.unlocked_sessions is null/.test(m)&&/new\.unlocked_sessions >= new\.sessions_total/.test(m));
ok('★ 使用量＝總堂數 − 餘額（含已簽到與已預約扣課）', /v_used_new := new\.sessions_total - coalesce\(new\.sessions_remaining, 0\)/.test(m));
ok('★ 沿用既有代碼 TICKET.INSTALLMENT_LOCKED（P0001），使用量與額度放 DETAIL；不再新增第二個代碼', /raise exception 'TICKET\.INSTALLMENT_LOCKED'[\s\S]*errcode = 'P0001'[\s\S]*detail = format\('used=%s unlocked=%s'/.test(m) && !/QUOTA_EXCEEDED/.test(m.replace(/--[^\n]*/g,'')));
ok('★ 校正工具（tkTidyDo）在動任何資料之前先檢查額度（不留半套）', (()=>{ const F=g('async function _tkTidyDo(','\n}\n'); const i=F.indexOf('先檢查、再動任何資料'); return i>0 && i<F.indexOf("await dbPut('bookings',b)") && /showToast\(tkQuotaMsg\(/.test(F) && /校正沒有執行，沒有任何資料被更動/.test(F); })());
ok('★ 不改任何資料列、不新增欄位／資料表（只有函式＋觸發器）', !/\b(insert|delete|alter table|create table)\b/i.test(codeOnly.replace(/create or replace function[\s\S]*?\n\$\$;/,'')) && !/\bupdate\s+member_tickets\b/i.test(codeOnly));
ok('★ 內部函式不對任何 API 角色開放', /revoke all on function public\.trg_tk_quota_guard\(\) from public, anon, authenticated, service_role;/.test(m));
const mv=rd('docs/migrations/20261115_fn_move_booking_ticket.sql'); const mvBody=mv.slice(mv.indexOf('$fn$'), mv.lastIndexOf('$fn$')).replace(/--[^\n]*/g,'');
ok('★★ P0-C fn_move_booking_ticket 不更新 member_tickets／不碰 sessions_remaining → 使用量不變、調課不會繞過也不會被誤擋', !/update\s+member_tickets/i.test(mvBody) && !/sessions_remaining\s*=/.test(mvBody));

console.log('\nSQL：套用／回復檔（指紋由 migration 文字重算）');
const rf=rd('docs/migrations/20261118_fn_refund_ticket.sql'), p0e=rd('docs/migrations/20261116_p0e_checkin_activation.sql');
const ORIG=md5c(bodyOf(p0e,'public.fn_tk_refund_once(','$$')), NEW=md5c(bodyOf(rf,'public.fn_tk_refund_once(','$$')), QFP=md5c(bodyOf(m,'public.trg_tk_quota_guard(','$$')), RFP=md5c(bodyOf(rf,'public.fn_refund_ticket(','$fn$'));
for(const [label,f] of [['測試庫','docs/testdb/p0e/p0e_12_apply_quota_refund_testdb.sql'],['正式庫','docs/prod-release/06_quota_refund_apply_prod.sql']]){
  const a=rd(f);
  ok(`★ ${label}套用檔：原版／新版／RPC 指紋與 migration 重算值一致`, a.includes(ORIG)&&a.includes(NEW)&&a.includes(RFP), [ORIG,NEW,RFP]);
  ok(`　 ${label}套用檔：內嵌的兩份 migration 與獨立檔逐字相同`, a.includes(m.trim())&&a.includes(rf.trim()));
  ok(`　 ${label}套用檔：單一交易＋鎖逾時＋票券雜湊前後比對（含 unlocked_sessions）`, /^begin;/m.test(a)&&/set local lock_timeout/.test(a)&&/commit;\s*$/.test(a)&&/既有票券資料被改動/.test(a)&&/unlocked_sessions/.test(a));
}
const at=rd('docs/testdb/p0e/p0e_12_apply_quota_refund_testdb.sql'), ap=rd('docs/prod-release/06_quota_refund_apply_prod.sql');
ok('★★ 測試庫檔守測試庫識別、正式庫檔守正式庫識別（互相不能誤跑）', /7662742571317219726/.test(at)&&!/7637215626725903220/.test(at)&&/7637215626725903220/.test(ap)&&!/7662742571317219726|kucvxpjatptfckhlxptj/.test(ap)&&/change_log.*is null or not exists/.test(ap.replace(/\n/g,' ')));
// （P0E-12 回復檔的完整檢查在檔尾「P0E-12 回復保護」區塊）
console.log('\nSQL 測試檔與併發腳本');
const t=rd('docs/testdb/p0e/p0e_12_quota_refund_tests.sql');
ok('★ 涵蓋額度 Q1–Q10（第8堂成功、第9堂拒絕、前端絕對值、會員／團課寫法、benefit_consume_ticket、調課、開通下一期、退課後恢復、非分期、歷史超額）', ['Q1 ','Q2 ','Q3 ','Q4 ','Q5 ','Q6 ','Q7 ','Q8 ','Q9 ','Q10 '].every(k=>t.includes("'"+k)));
ok('★ 涵蓋退票 R1–R13（正常、重複、已退款、無扣課、只有調整、只有退款、超額、取消後重約、失敗回滾、餘額已滿、多名額、授權、權限）', ['R1 ','R2 ','R3 ','R4 ','R5 ','R6 ','R7 ','R8 ','R9 ','R10 ','R11 ','R12 ','R13 '].every(k=>t.includes("'"+k)));
ok('★ 併發與端到端入口測試誠實標成 SKIP（未驗證）', /q_skip\('Q11/.test(t)&&/q_skip\('Q12/.test(t)&&/q_skip\('R14/.test(t));
ok('★ SQL 測試必定回滾、有庫識別守門', /raise exception 'QR_TESTS_RESULT/.test(t)&&/7662742571317219726/.test(t));
ok('★ 測試腳本修正 A：Q／R 夾具建立票券時，狀態 CASE 明確轉型 ticket_status（text 不能直接寫入 enum）', /\(case when p_rem > 0 then 'usable' else 'used_up' end\)::ticket_status/.test(t));
const cc5=rd('docs/testdb/p0e/p0e_13_prod_triggers_compat_tests.sql');
ok('★ 測試腳本修正 B：C5 的 fixture 讓該會員沒有任何合格可用票券（只改測試資料，不改 hold 守門的業務規則）', /update member_tickets set sessions_remaining = 0, status = 'used_up' where id = 'PC-D';/.test(cc5)&&cc5.indexOf("update member_tickets set sessions_remaining = 0, status = 'used_up' where id = 'PC-D'")<cc5.indexOf('HOLD.MONTH_LIMIT')&&!/fn_hold_month_guard\s*\(/.test(cc5));
const cc=rd('docs/testdb/concurrency/run_concurrency.sh');
ok('★ 併發腳本：真正多連線（背景獨立 psql＋標準輸入餵語句）、守測試庫、前置檢查、自動清除夾具並驗證殘留為 0', /7662742571317219726/.test(cc)&&/trap cleanup EXIT/.test(cc)&&(cc.match(/\) &/g)||[]).length>=2&&/printf '%s\\n' "begin;"/.test(cc)&&/尚未套用 p0e_12/.test(cc)&&/清理後 CC- 殘留為 0/.test(cc));
ok('★★ 併發腳本用計時證明兩條連線真的重疊（B 必須被擋住 ≥2 秒，否則判 FAIL，避免假性併發）', /waited\(\)/.test(cc)&&/t>=2\.0/.test(cc)&&/B 確實被/.test(cc));
ok('★ 涵蓋 Q11（額度）、R14a（雙退）、R14b（退款×扣課），並把 R14c 誠實標成 SKIP（SKIP 不算通過、不印 ALL PASS）', /Q11/.test(cc)&&/R14a/.test(cc)&&/R14b/.test(cc)&&/skip "R14c/.test(cc)&&!/ALL PASS/.test(cc)&&/SKIP 不算通過/.test(cc));
const hs=rd('docs/testdb/http_role_tests.sh'), hm=rd('docs/testdb/http_role_tests.md');
ok('★★ HTTP 方案：真實 HTTP 與 SQL 身分／角色模擬分開標籤；測試庫與正式庫 ACL 差異只印 INFO、不判 PASS', /SQL 身分模擬/.test(hm)&&/SQL 角色模擬/.test(hm)&&/真實 HTTP/.test(hm)&&/info\(/.test(hs)&&/不判 PASS／FAIL/.test(hs));
ok('★ HTTP 腳本守測試庫網址、不含任何金鑰或 JWT 字面值', /kucvxpjatptfckhlxptj\.supabase\.co/.test(hs)&&!/eyJ[A-Za-z0-9_-]{20,}/.test(hs+hm)&&/\$\{ANON_KEY:\?\}|: "\$\{SB_URL:\?\}"/.test(hs));
const c9=rd('docs/testdb/p0e/p0e_13_c9_move_real_rpc_tests.sql');
ok('★ C9：真實呼叫 fn_move_booking_ticket（cancel／hold 兩種模式），先要求五個正式庫觸發器與部署指紋，必定回滾', /c9_call\(v_uid, 'C9-F-a', 'C9-G-a', 'cancel'\)/.test(c9)&&/c9_call\(v_uid, 'C9-F-b', 'C9-G-b', 'hold'\)/.test(c9)&&/1f78f02623ce16484004b3cf4aec9934:13628/.test(c9)&&/raise exception 'P0E13_C9_RESULT/.test(c9));

console.log('\n操作人員（app.tk_operator）作用域與 p0e_13 安全性（本輪補強）');
{
  const rfs=rd('docs/migrations/20261118_fn_refund_ticket.sql'); const body=rfs.slice(rfs.indexOf('create or replace function public.fn_refund_ticket'));
  ok('★★ fn_refund_ticket：設定前記下呼叫前的值，核心呼叫後「還原成呼叫前的值」（不是寫死空字串）', /v_prev := coalesce\(current_setting\('app\.tk_operator', true\), ''\);/.test(body)&&/perform set_config\('app\.tk_operator', v_prev, true\);/.test(body)&&!/set_config\('app\.tk_operator', '', true\)/.test(body.replace(/--[^\n]*/g,'')));
  ok('★ 操作人員設定是交易區域（is_local=true），且只在核心呼叫前後這一小段', (body.match(/set_config\('app\.tk_operator'[^;]*, true\)/g)||[]).length===2);
  ok('★ 核心 fn_tk_refund_once：沒設定或空字串一律是 system（向下相容）', /coalesce\(nullif\(current_setting\('app\.tk_operator', true\), ''\), 'system'\)/.test(rfs));
  const rt=rd('docs/testdb/p0e/p0e_12_quota_refund_tests.sql');
  ok('★★ 測試涵蓋 R16–R20：同交易連續呼叫＋不同操作人員、設定不外漏、內部核心仍寫 system、例外後再呼叫、外層值還原、拒絕與冪等路徑也還原', ['R16 ','R17 ','R18 ','R19 ','R20 '].every(k=>rt.includes("'"+k)));
  ok('　 R16–R20 都標成「RPC＋操作人員作用域」類型，並有「沒有管理員帳號就 SKIP」的前置處理', (rt.match(/操作人員作用域/g)||[]).length>=8&&/測試庫沒有有登入的管理員帳號/.test(rt));
  const ins=rd('docs/testdb/p0e/p0e_13_prod_triggers_install_testdb.sql'), rb=rd('docs/testdb/p0e/p0e_13_prod_triggers_rollback_testdb.sql');
  const insCode=ins.replace(/--[^\n]*/g,'');
  ok('★★ p0e_13 安裝：前置檢查三個觸發器、**三支函式**、既有標記都不存在，任何一項存在就中止（不覆蓋）', /已有其中的觸發器/.test(ins)&&/已有同名函式（trg_bookings_cancelled_by／trg_bookings_touch／fn_bookings_group_guard），不覆蓋/.test(ins)&&/已有帶 P0E13 標記的物件/.test(ins));
  ok('★★ p0e_13 安裝：函式一律 CREATE FUNCTION（沒有任何 CREATE OR REPLACE），同名存在時會直接失敗而不是覆蓋', (insCode.match(/CREATE FUNCTION public\./g)||[]).length===3&&!/create or replace/i.test(insCode));
  ok('★ p0e_13 安裝：本檔建立的 3 函式＋3 觸發器＋欄位都加標記註解，後置檢查核對標記數量', (ins.match(/IS 'P0E13-installed-for-compat-test'/g)||[]).length===6&&/P0E13-added-for-compat-test/.test(ins)&&/標記不是 3 個函式＋3 個觸發器/.test(ins));
  ok('★★ p0e_13 回復：只刪帶標記的物件（觸發器、函式、欄位）；沒標記的只發 NOTICE 不動；不用 CASCADE', /obj_description\(v_oid, 'pg_trigger'\) = v_mark/.test(rb)&&/obj_description\(v_oid, 'pg_proc'\) = v_mark/.test(rb)&&/沒有 P0E13 標記（不是本次安裝的），不動/.test(rb)&&!/cascade/i.test(rb.replace(/--[^\n]*/g,''))&&/v_col_mark constant text := 'P0E13-added-for-compat-test'/.test(rb)&&/= v_col_mark/.test(rb));
  ok('　 p0e_13 回復：可重複執行（沒有帶標記的物件時什麼都不做），單一交易，測試庫守門', /可重複執行/.test(rb)&&/^begin;/m.test(rb)&&/commit;\s*$/.test(rb)&&/7662742571317219726/.test(rb));
  const sf=rd('docs/testdb/p0e/p0e_13_install_safety_tests.sql');
  const preBlk=ins.match(/do \$pre\$\n([\s\S]*?)\n\$pre\$;/)[1], rbBlk=rb.match(/do \$rb\$\n([\s\S]*?)\n\$rb\$;/)[1];
  ok('★★ 安全性測試檔：前置檢查區塊與回復區塊是從安裝檔／回復檔逐字抽出（每一行都在，而不是手抄一份會漂移的複本）', preBlk.split('\n').filter(l=>l.trim()).every(l=>sf.includes(l.trim()))&&rbBlk.split('\n').filter(l=>l.trim()).every(l=>sf.includes(l.trim())));
  ok('★ 安全性測試檔涵蓋：乾淨通過、同名函式／觸發器／殘留標記時中止、CREATE FUNCTION 不覆蓋、回復不刪無標記物件、回復刪有標記物件、重複回復不報錯、欄位標記', ['S1 ','S2 ','S2b ','S3 ','S4 ','S5 ','S6 ','S7a ','S7b ','S8 ','S9 ','S10 ','S10b ','S10c ','S11a ','S11b ','S12 '].every(k=>sf.includes("'"+k))&&/duplicate_function/.test(sf));
  ok('★ 安全性測試檔：單一 DO、必定回滾、守測試庫、已安裝時中止；並明講它會在交易內做可回滾的 DDL', /raise exception 'P0E13_SAFETY_RESULT/.test(sf)&&/7662742571317219726/.test(sf)&&/S\.PRECONDITION: p0e_13 已安裝/.test(sf)&&/可回滾的 DDL/.test(sf));
}

console.log('\np0e_13 回復補強（指紋核對、相依檢查、先驗證再動手）與 R21');
{
  const ins=rd('docs/testdb/p0e/p0e_13_prod_triggers_install_testdb.sql'), rb=rd('docs/testdb/p0e/p0e_13_prod_triggers_rollback_testdb.sql'), sf=rd('docs/testdb/p0e/p0e_13_install_safety_tests.sql');
  const body=n=>{ const i=ins.indexOf('CREATE FUNCTION public.'+n+'()'); const a=ins.indexOf('$function$',i)+10; return ins.slice(a, ins.indexOf('$function$',a)); };
  const fpOf=b=>crypto.createHash('md5').update(b).digest('hex')+':'+[...b].length;
  { // 防退化：安全測試檔裡每一份「安裝版夾具」函式本體，必須與安裝檔原始本體逐字相同（含縮排、空白），並重算 MD5＋長度
    const fxs=[...sf.matchAll(/CREATE FUNCTION public\.(trg_bookings_cancelled_by|trg_bookings_touch|fn_bookings_group_guard)\(\)[^$]*?AS \$function\$([\s\S]*?)\$function\$;/g)];
    const insBody=n=>{ const i=ins.indexOf('CREATE FUNCTION public.'+n+'()'); const a=ins.indexOf('$function$',i)+10; return ins.slice(a, ins.indexOf('$function$',a)); };
    const bad=fxs.filter(m=>m[2]!==insBody(m[1])||fpOf(m[2])!==fpOf(insBody(m[1])));
    ok('★★ 安全測試檔：每一份安裝版夾具函式本體（共 '+fxs.length+' 份）與安裝檔原始本體逐字相同，MD5＋長度重算一致', fxs.length===18&&bad.length===0, {n:fxs.length,bad:bad.map(m=>m[1]+':'+fpOf(m[2]))});
  }
  const exp={trg_bookings_cancelled_by:fpOf(body('trg_bookings_cancelled_by')), trg_bookings_touch:fpOf(body('trg_bookings_touch')), fn_bookings_group_guard:fpOf(body('fn_bookings_group_guard'))};
  ok('★★ 回復檔的三個函式指紋常數＝安裝檔函式本體重算值（機械核對，不是手抄）', Object.values(exp).every(f=>rb.includes("'"+f+"'")), exp);
  ok('　 旁證（不是證明）：安裝檔函式本體長度與 2026-11-15 唯讀歷史紀錄的長度相符（195／217／685）——長度不能證明正式庫內容相同；「安裝檔＝正式庫現行本體」未驗證', exp.trg_bookings_cancelled_by.endsWith(':195')&&exp.trg_bookings_touch.endsWith(':217')&&exp.fn_bookings_group_guard.endsWith(':685'));
  ok('★ 回復檔與安裝檔都明講來源證據的限制（長度不能證明正式庫內容相同、未驗證），沒有「長度一致所以逐字取自正式庫」的說法', /不能單憑長度證明正式庫內容相同/.test(rb)&&/尚未驗證/.test(ins)&&!/確實逐字取自|因此證明|逐字取自正式庫/.test(rb+ins));
  const code=rb.replace(/--[^\n]*/g,'');
  const iFirstDrop=code.indexOf("execute format('drop trigger"), iPrint=[...code.matchAll(/raise exception 'P0E13\.ROLLBACK_ABORT/g)].map(m=>m.index);
  ok('★★ 回復：標記對但指紋不符就 raise exception 中止、不刪該函式（訊息含實際與預期指紋）', /md5\(prosrc\) \|\| ':' \|\| length\(prosrc\) into v_fp/.test(code)&&/內容與安裝版本不符/.test(code)&&/v_fp is distinct from v_fps\[v_i\]/.test(code));
  ok('★★ 回復：「先全部驗證、再動手」——所有 ROLLBACK_ABORT 的檢查都在第一個 drop 之前', iPrint.length>=3&&iPrint.every(i=>i<iFirstDrop)&&iFirstDrop>0);
  ok('★★ 回復：updated_at 有其他物件相依（pg_depend：檢視、索引、約束、預設值、觸發器欄位清單、政策…）就中止；drop column 不帶 CASCADE', /from pg_depend d where d\.refclassid = 'pg_class'::regclass and d\.refobjid = 'public\.bookings'::regclass and d\.refobjsubid = v_attnum/.test(code)&&/updated_at 有其他物件相依/.test(code)&&/alter table public\.bookings drop column updated_at;/.test(code)&&!/cascade/i.test(code));
  ok('★ 回復：函式仍被其他沒標記的觸發器使用就中止', /t\.tgfoid = v_oid[\s\S]{0,120}is distinct from v_mark/.test(code)&&/仍被其他（沒有標記的）觸發器使用/.test(code));
  ok('★ 回復：保留測試庫守門、單一交易、可重複執行、事後檢查標記物件清空', /7662742571317219726/.test(rb)&&/^begin;/m.test(rb)&&/commit;\s*$/.test(rb)&&/可重複執行/.test(rb)&&/ROLLBACK_INCOMPLETE/.test(rb));
  ok('★★ 安全測試 S9：把安裝檔語句建出的三支函式指紋，與回復檔常數逐一核對', [exp.trg_bookings_cancelled_by,exp.trg_bookings_touch,exp.fn_bookings_group_guard].every(f=>sf.includes("'"+f+"'")));
  ok('★★ 安全測試 S10／S10b：標記正確但函式內容被改→回復拒絕且全部物件仍在；S10c：被其他觸發器使用→拒絕', /S10 標記正確但 trg_bookings_touch 內容被改/.test(sf)&&/S10b 標記正確但 fn_bookings_group_guard 內容被改/.test(sf)&&/S10c 函式仍被其他沒標記的觸發器使用/.test(sf)&&/create or replace function public\.trg_bookings_touch\(\)/.test(sf));
  ok('★★ 安全測試 S11a／S11b：updated_at 被檢視／索引相依→拒絕、欄位與相依物件都還在（不 CASCADE）；S12：回復失敗時整筆不動、無關既有物件不受影響', /S11a updated_at 被檢視相依/.test(sf)&&/S11b updated_at 被索引相依/.test(sf)&&/create view public\.zz_p0e13_dep_view/.test(sf)&&/create index zz_p0e13_dep_idx/.test(sf)&&/S12 回復在驗證階段失敗/.test(sf)&&/zz_other_fn/.test(sf));
  ok('★ 安全測試 S5 夾具改為安裝檔逐字語句（標記對但內容是假的函式本來就該被拒絕＝S10；S5 的意圖「合格的會被刪」保留）；S1–S8 全數保留', /S5 標記與指紋都正確：回復刪除三個觸發器與三支函式/.test(sf)&&['S1 ','S2 ','S2b ','S3 ','S4 ','S6 ','S7a ','S7b ','S8 '].every(k=>sf.includes("'"+k)));
  const r12=rd('docs/testdb/p0e/p0e_12_quota_refund_tests.sql');
}

console.log('\nP0E-12 回復保護（測試庫＋正式庫）、R21 修正、「真正未設定」獨立測試');
{
  const p0e=rd('docs/migrations/20261116_p0e_checkin_activation.sql'), rfm=rd('docs/migrations/20261118_fn_refund_ticket.sql'), qgm=rd('docs/migrations/20261118_tk_quota_guard.sql');
  const fpC=b=>crypto.createHash('md5').update(b).digest('hex')+':'+[...b].length;
  const bodyD=(sql,sig,d)=>{ const i=sql.indexOf('create or replace function '+sig); const a=sql.indexOf(d,i)+d.length; return sql.slice(a, sql.indexOf(d,a)); };
  const C={orig:fpC(bodyD(p0e,'public.fn_tk_refund_once(','$$')), nw:fpC(bodyD(rfm,'public.fn_tk_refund_once(','$$')), rf:fpC(bodyD(rfm,'public.fn_refund_ticket(','$fn$')), qg:fpC(bodyD(qgm,'public.trg_tk_quota_guard(','$$'))};
  const tm=qgm.match(/create trigger (\w+)\s+before update of ([^\n]+?)\s+on (public\.\w+)\s+for each row execute function (public\.\w+\(\));/);
  const expDef=`create trigger ${tm[1]} before update of ${tm[2].replace(/\s+/g,' ').trim()} on ${tm[3]} for each row execute function ${tm[4]}`.replace(/public\./g,'').replace(/\s+/g,' ').toLowerCase();
  const cols=tm[2].split(',').map(x=>x.trim()).sort();
  for(const [label,f] of [['測試庫','docs/testdb/p0e/p0e_12_quota_refund_rollback.sql'],['正式庫','docs/prod-release/06_quota_refund_rollback_prod.sql']]){
    const r=rd(f), code=r.replace(/--[^\n]*/g,'');
    ok(`★★ ${label}回復檔：四個指紋常數與預期觸發器定義、欄位清單，都等於對應安裝檔機械重算值（不是手抄）`, [C.orig,C.nw,C.rf,C.qg].every(x=>r.includes("'"+x+"'"))&&r.includes("'"+expDef+"'")&&r.includes("array['"+cols.join("','")+"']"), {C,expDef});
    const iAbort=code.indexOf("raise exception 'P0E12.ROLLBACK_ABORT"), iDrop=code.indexOf("execute 'drop trigger");
    ok(`★★ ${label}回復檔：在還原或刪除任何物件之前先完整核對——精確簽名（to_regprocedure）、三個函式指紋、觸發器所屬資料表／呼叫函式／事件／停用狀態／WHEN／欄位清單／定義；不符就中止`, iAbort>0&&iAbort<iDrop&&/to_regprocedure\('public\.fn_tk_refund_once\(text,text,text\)'\)/.test(code)&&/to_regprocedure\('public\.fn_refund_ticket\(text,text,text\)'\)/.test(code)&&/to_regprocedure\('public\.trg_tk_quota_guard\(\)'\)/.test(code)&&/v_trg\.tgfoid = v_qg/.test(code)&&/v_trg\.tgenabled = 'O'/.test(code)&&/v_trg\.tgqual is null/.test(code)&&/tgrelid = 'public\.member_tickets'::regclass/.test(code)&&/v_def = v_exp_def/.test(code)&&/tgattr::int2\[\]/.test(code)&&/tgtype & 2\) = 2/.test(code));
    ok(`　 ${label}回復檔：完整已回復狀態（核心原版＋其餘物件皆不存在＋沒有同名觸發器）才允許重跑無動作；半套或混合狀態一律中止`, /v_reverted := v_once is not null and v_once_fp = v_orig_fp and v_rf is null and v_qg is null and v_ntrg = 0;/.test(code)&&/if not v_installed then\s+raise exception 'P0E12\.ROLLBACK_ABORT/.test(code));
    ok(`　 ${label}回復檔：不使用 CASCADE；drop 都在驗證之後；還原核心後事後核對；單一交易、環境識別守門`, !/cascade/i.test(code)&&/^begin;/m.test(r)&&/commit;\s*$/.test(r)&&(label==='測試庫'?/7662742571317219726/.test(r)&&!/7637215626725903220/.test(r):/7637215626725903220/.test(r)&&!/7662742571317219726|kucvxpjatptfckhlxptj/.test(r))&&/ROLLBACK_POSTCHECK_FAILED/.test(code));
  }
  const pt=rd('docs/testdb/p0e/p0e_12_rollback_protection_tests.sql'), rbT=rd('docs/testdb/p0e/p0e_12_quota_refund_rollback.sql');
  const blk=rbT.match(/do \$rb\$\n([\s\S]*?)\n\$rb\$;/)[1];
  { // 防退化：回復檔錯誤訊息的型別轉換、回復保護測試內嵌區塊逐字一致（整段相等，不是逐行包含）、測試庫／正式庫回復核心一致
    const rbP=rd('docs/prod-release/06_quota_refund_rollback_prod.sql');
    const core=s=>s.match(/do \$rb\$\n([\s\S]*?)\n\$rb\$;/)[1];
    const emb=pt.match(/create function pg_temp\.r_rb\(\) returns void language plpgsql as \$rbf\$\n([\s\S]*?)\n\$rbf\$;/)[1];
    ok("★★ 回復檔（測試庫／正式庫）與保護測試的錯誤訊息用 'tgenabled=' || v_trg.tgenabled::text（\"char\" 轉 text，否則拒絕時會因 operator is not unique 丟錯而不是 ROLLBACK_ABORT）；沒有殘留未轉換的寫法", [rbT,rbP,pt].every(s=>!/v_trg\.tgenabled \|\|/.test(s))&&[rbT,rbP,pt].every(s=>s.includes("'tgenabled=' || v_trg.tgenabled::text || ' def='")));
    ok('★★ 回復保護測試的內嵌回復區塊與測試庫回復檔的 $rb$ 區塊整段逐字相同（機械更新，不是第二份手維護）', emb===core(rbT));
    ok('★★ 測試庫與正式庫回復腳本的回復核心（$rb$ 區塊）逐字相同；差異只在環境識別守門', core(rbT)===core(rbP));
    ok("　 回復保護測試 P1 的布林結果以 ::text 傳出（raise 的 % 會把 boolean 印成 t，與 'true' 比對才不會誤判）", /raise exception 'CASE¦¦%¦¦%¦¦%', v_ok::text, v_a,/.test(pt));
  }
  ok('★★ 回復保護測試：回復區塊是從回復檔逐字抽出；涵蓋正常回復、重跑、各物件被改（函式×3、觸發器欄位／停用／WHEN／別的表／AFTER）、缺物件、混合狀態，且每個拒絕案例都比對拒絕前後快照相同', blk.split('\n').filter(l=>l.trim()).every(l=>pt.includes(l.trim()))&&['P1 ','P1b ','P2 ','P3 ','P4 ','P5a ','P5b ','P5c ','P5d ','P5e ','P6 ','P7 ','P8 '].every(k=>pt.includes("p_rec('"+k))&&/r_snap\(\)/.test(pt)&&(pt.match(/v_s1 = v_s2/g)||[]).length>=10&&/raise exception 'P0E12_ROLLBACK_PROTECTION_RESULT/.test(pt)&&/可回滾 DDL/.test(pt)&&pt.includes("'"+C.orig+"'"));
  const r12=rd('docs/testdb/p0e/p0e_12_quota_refund_tests.sql');
  ok('★★ R21 修正：移除假的「未設定」案例（前面的案例已設定過 app.tk_operator）；只保留空字串與 OUTER；明講「真正未設定」改見獨立檔', !/q_scn\('U'/.test(r12)&&/q_scn\('E'/.test(r12)&&/q_scn\('O'/.test(r12)&&/真正未設定」不在這份測試裡驗證/.test(r12));
  ok('★★ R21／R17／R18 改用原始值比較：is not distinct from；沒有用 coalesce 把 NULL 與空字串合併後比較', (r12.match(/v_after is not distinct from v_before/g)||[]).length>=4&&!/coalesce\(current_setting\('app\.tk_operator', true\), ''\) =/.test(r12)&&/current_setting\('app\.tk_operator', true\) = ''/.test(r12));
  for(const [code,slug,expectNull] of [['A','normal',false],['B','balance_full',false],['C','already_refunded',true],['D','exception',null]]){
    const u=rd(`docs/testdb/p0e/p0e_12_operator_unset_${code}_${slug}.sql`), body=u.slice(u.indexOf('do $u$'));
    const firstAct=body.indexOf("if current_setting('app.tk_operator', true) is not null then"), firstSet=body.search(/set_config\(|fn_refund_ticket\(|fn_tk_refund_once\(/);
    ok(`★★ 「真正未設定」路徑 ${code}：第一個動作就檢查 current_setting IS NULL（早於任何 set_config／退款呼叫）；不是 NULL 就以 UNSET.NOT_VERIFIED 中止＝未驗證`, firstAct>0&&firstAct<firstSet&&/UNSET\.NOT_VERIFIED/.test(u)&&/未驗證（不是 PASS）/.test(u));
    ok(`　 路徑 ${code}：要求全新連線、單獨執行；分開記錄 after_is_null／after_is_empty／after_value，不用 coalesce 合併 NULL 與空字串；預期是推論、PostgreSQL 實際行為尚無實測證據；必定回滾`, /全新的資料庫連線/.test(u)&&/after_is_null/.test(u)&&/after_is_empty/.test(u)&&!/coalesce\(current_setting/.test(body)&&/尚無實測證據/.test(u)&&/raise exception 'UNSET_RESULT/.test(u));
  }
  const uc=rd('docs/testdb/p0e/p0e_12_operator_unset_C_already_refunded.sql'), ua=rd('docs/testdb/p0e/p0e_12_operator_unset_A_normal.sql');
  ok('★ 路徑 C 預期「完全沒被動到、仍是 NULL」（ALREADY_REFUNDED）；路徑 A 預期「結束後嚴格等於空字串」；路徑 D 明講 NULL／空字串何者為真未預設', /after IS NULL/.test(uc)&&/v_after is null then 'PASS'/.test(uc)&&/v_after = '' then 'PASS'/.test(ua)&&/不預設/.test(rd('docs/testdb/p0e/p0e_12_operator_unset_D_exception.sql')));
}
console.log(`\n✓ ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
