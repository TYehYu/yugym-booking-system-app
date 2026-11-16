/* P0-E：票券效期「首次實際簽到才啟用」（2026-11-14 業務定案）
   胡瑜文合約 #2（TK-mu6wk8rqjgr5）：預約時開通、全部取消後效期沒恢復。
   根因：取消走 DB 的 fn_cancel_booking（RPC），那條路不會清效期；而「簽到」本來就沒有任何啟用邏輯。
   修法：預約不再啟用（前端兩處移除），啟用／撤銷／窗口／超期取消全部在資料庫觸發器內完成。
   這支測試守三件事：① 前端預約路徑不再寫效期 ② 錯誤碼與文案 ③ migration／回復／測試腳本的安全不變量（靜態）。
   ⚠ 資料庫行為本身由 docs/testdb/p0e/p0e_05_sql_tests.sql 在測試庫驗證（本檔不能取代）。 */
const fs=require('fs');
const ROOT=process.env.HOME+'/Projects/yugym-booking-system-app';
const src=fs.readFileSync(ROOT+'/index.html','utf8');
const rd=p=>fs.readFileSync(ROOT+'/'+p,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const DED=src.slice(src.indexOf('async function deductTicket('), src.indexOf('// 退一堂'));
const CRE=src.slice(src.indexOf('function rpcBookingErrMsg('), src.indexOf('function rpcBookingErrMsg(')+9000);

console.log('① 前端預約路徑不再啟用效期（規則 3）');
ok('★★★ deductTicket 不再呼叫 activateTicketIfNeeded', !/await activateTicketIfNeeded\(/.test(DED));
ok('★★ deductTicket 的備註不再宣稱「首堂開通」（newExpire 恆為 null）', /const newExpire=null;/.test(DED));
ok('★★★ RPC 建立預約後不再補跑開通（整段已移除）', !/首堂開通（RPC 路徑補跑）/.test(src) && !/const nd=await activateTicketIfNeeded\(fresh, data\.booking_id\)/.test(src));
ok('★ activateTicketIfNeeded 本體保留（舊測試與歷史說明引用）', /async function activateTicketIfNeeded\(/.test(src));
ok('★★ 全檔只剩函式定義本身，沒有任何預約路徑呼叫它', (src.match(/activateTicketIfNeeded\(/g)||[]).length===1, (src.match(/activateTicketIfNeeded\(/g)||[]).length);

console.log('\n② 錯誤碼與文案');
ok('★★★ TKWIN.OUT_OF_WINDOW 有專屬中文訊息並帶最晚日期', /TKWIN\.OUT_OF_WINDOW'\)===0\)\{[\s\S]{0,400}最晚 /.test(CRE));
{ // 實際執行 rpcBookingErrMsg
  const fnSrc=src.slice(src.indexOf('function rpcBookingErrMsg('), src.indexOf('// 呼叫 fn_create_booking'));
  const f=new Function(fnSrc+'; return rpcBookingErrMsg;')();
  const m=f('TKWIN.OUT_OF_WINDOW:2026-11-20:2026-11-26');
  ok('★★ 訊息含日期 2026/11/26 與「首次簽到」', m.includes('2026/11/26') && m.includes('首次簽到'), m);
  ok('★ 其他代碼行為不變', f('TICKET.EMPTY')==='會員無可用票券' && (!/只能預約當月/.test(src) || f('HOLD.MONTH_LIMIT:2026-11-30').includes('只能預約當月')));
}
ok('★★ 票卡顯示改為「未啟用（首次簽到後 N 天）」', /未啟用（首次簽到後 \$\{t\.valid_days\} 天）/.test(src) && !/未開通（首堂課後/.test(src));
ok('★ 會員端說明改為首次實際簽到起算', (src.match(/第一次實際簽到的課程/g)||[]).length>=3 && !/排了第一堂才開始倒數/.test(src));
ok('★ 版本號已更新（YYMMDD.HHmm）', /const APP_VERSION = '\d{6}\.\d{4}';/.test(src));

console.log('\n③ migration 靜態不變量');
const MIG=rd('docs/migrations/20261116_p0e_checkin_activation.sql');
const code=MIG.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
ok('★★★ 不含 DROP／DELETE／TRUNCATE（只新增）', !/\b(drop|delete\s+from|truncate)\b/i.test(code));
ok('★★★ 對既有資料列沒有 UPDATE／INSERT 發生在「函式外」（只有函式本體內有）',
   (()=>{ const out=code.replace(/\$\$[\s\S]*?\$\$/g,''); return !/\b(update\s+\w|insert\s+into)\b/i.test(out.replace(/after (insert|update) on/gi,'')); })());
ok('★★ 欄位只新增、可為空、無預設值、不回填', /add column if not exists activation_mode text;/.test(code) && !/activation_mode[^;]*default/i.test(code));
ok('★★★ 只套用新制未開通票：三欄皆空且 valid_days>0', /coalesce\(t\.valid_days, 0\) > 0 and t\.activated_at is null and t\.start_date is null and t\.expire_date is null/.test(code));
ok('★★★ 啟用是條件式更新（只會成功一次）', /where id = p_ticket and activated_at is null and start_date is null and expire_date is null and coalesce\(valid_days, 0\) > 0;/.test(code));
ok('★★★ 撤銷只動 activation_mode=checkin 的票（舊制不碰）', (code.match(/activation_mode = 'checkin'/g)||[]).length>=3 && /t\.activation_mode is distinct from 'checkin' then return/.test(code));
ok('★★★ 痕跡帳一律 adjust／delta 0（與 P0-C 帳本驗證相容）', (code.match(/'adjust', 0, p_booking/g)||[]).length>=3 && !/'adjust', -?[1-9]/.test(code));
ok('★★★ 超期取消逐筆子交易、NOWAIT、鎖不到只警示', /for update nowait/.test(code) && /exception\s+when lock_not_available then/.test(code) && /when others then/.test(code));
ok('★★★ 團課／1V2／影子卡不自動取消', /b\.category::text = '小班肌力'/.test(code) && /partner_id/.test(code) && /b\.sibling_of is not null/.test(code) && /member_ids/.test(code));
ok('★★ 取消人標 system，不被 trg_bookings_cancelled_by 誤標成簽到者', /cancelled_by = 'system'/.test(code));
ok('★★ 影子卡跟母卡一起取消', /where sibling_of = b\.id and status::text is distinct from 'cancelled'/.test(code));
ok('★★ 補簽久遠的課（到期日已過）不自動取消', /v_exp < public\.fn_tk_today\(\)/.test(code));
ok('★★ 教練請假補償堂不算實際上課', /to_jsonb\(b\)->>'coach_leave'/.test(code));
ok('★★ 團課座位歧義不猜（0 張不動、多張只警示）', /array_length\(v_tks, 1\) > 1/.test(code));
ok('★★ 窗口檢查先鎖票列再查（序列化併發預約）', /for update;\s+-- 之後的查詢是新快照/.test(code));
ok('★★★ 每個 fn_tk_／trg_tk_ 函式都收回 API 角色權限（共 15 個）', (code.match(/^revoke all on function public\./gm)||[]).length===15 && !/grant execute/i.test(code));
ok('★★ 4 個觸發器（ledger 1＋bookings 3）', (code.match(/create or replace trigger/g)||[]).length===4);
ok('★★ 所有 SECURITY DEFINER 函式都鎖 search_path', (code.match(/security definer set search_path to 'public','pg_temp'/g)||[]).length>=11);
ok('★★ P0-C 銜接旗標只略過預約端檢查', /app\.tkwin_skip_booking/.test(code) && /perform public\.fn_tk_window_check\(new\.ticket_id\)/.test(code));

console.log('\n④ 套用／回復／測試腳本');
const APPLY=rd('docs/testdb/p0e/p0e_02_apply_testdb.sql'), ROLL=rd('docs/testdb/p0e/p0e_03_rollback.sql'), TST=rd('docs/testdb/p0e/p0e_05_sql_tests.sql');
ok('★★★ 套用檔內嵌的 migration 與 docs/migrations 逐字相同', APPLY.includes(MIG));
ok('★★★ 套用／回復／測試／前置檢查皆有庫識別守門', [APPLY,ROLL,TST,rd('docs/testdb/p0e/p0e_00_precheck_backup_readonly.sql')].every(f=>f.includes('7662742571317219726')));
ok('★★ 套用檔單一交易＋後置檢查（15 函式、4 觸發器、不得回填、既有票券雜湊不變）', /^begin;/m.test(APPLY) && /^commit;/m.test(APPLY) && /v_fn <> 15/.test(APPLY) && /v_trg <> 4/.test(APPLY) && /不得回填/.test(APPLY) && /既有票券資料被改動/.test(APPLY));
ok('★★ 回復只移除新增物件，欄位僅在帶標記時才刪、且有 activation_mode 資料時中止', /P0E-20261116%/.test(ROLL) && /P0E\.ROLLBACK_ABORT/.test(ROLL) && !/\bdelete\s+from\b|\btruncate\b/i.test(ROLL));
ok('★★ 回復的函式清單與 migration 一致（15 個）', (ROLL.match(/^drop function if exists public\./gm)||[]).length===15);
ok('★★★ SQL 測試單一 DO、結尾必定 raise 回滾、不含 commit', /raise exception 'P0E_TESTS_RESULT: %'/.test(TST) && !/\bcommit\b/i.test(TST.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n').replace(/on commit drop/gi,'')));
ok('★★ SQL 測試涵蓋：規則 3／1／2／6／7／8／4／5、1V2、團課、原子性、補簽、權限',
   ['A1 ','A2 ','R1 ','R2 ','L1 ','L2 ','L3 ','W1 ','W2 ','O1 ','O3 ','O4 ','P1 ','G1 ','G3 ','X1 ','T02 ','T09 ','T12 ','T13 ','T16 ','T20 '].every(k=>TST.includes("'"+k)));


console.log('\n⑤ 守門寫法、精簡輸出、P0-C 銜接修補（獨立 migration）');
const md5=x=>require('crypto').createHash('md5').update(x,'utf8').digest('hex');
const SQLS=['p0e_00_precheck_backup_readonly','p0e_02_apply_testdb','p0e_03_rollback','p0e_05_sql_tests','p0e_08_p0c_regression_tests','p0e_09_apply_tkwin_patch_testdb','p0e_09_tkwin_patch_rollback'].map(n=>[n,rd('docs/testdb/p0e/'+n+'.sql')]);
ok('★★★ 所有 P0-E SQL 都沒有 to_regproc(...)（帶括號會永遠回 NULL：守門漏判、前置條件永遠中止）', SQLS.every(([n,t])=>!/to_regproc\(/.test(t.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n'))), SQLS.filter(([n,t])=>/to_regproc\(/.test(t.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n'))).map(x=>x[0]));
ok('★★★ fn_table_sigs 改為依函式名稱查 pg_proc（不受簽章影響）', SQLS.filter(([n,t])=>t.includes('7662742571317219726')).every(([n,t])=>/proname = 'fn_table_sigs'/.test(t)));
ok('★★ 前置條件改用 to_regprocedure（P0-E 與 P0-C RPC 的存在檢查）', /to_regprocedure\('public\.fn_tk_activate\(text,date,text\)'\)/.test(rd('docs/testdb/p0e/p0e_05_sql_tests.sql')) && /to_regprocedure\('public\.fn_move_booking_ticket\(text,text,text\)'\)/.test(rd('docs/testdb/p0e/p0e_08_p0c_regression_tests.sql')));
ok('★★★ SQL 測試改為精簡輸出（pe_summary／t19_summary：只列 FAIL 與 SKIP、≤ 8000、不整包 JSON）', /pe_summary\(\)/.test(rd('docs/testdb/p0e/p0e_05_sql_tests.sql')) && /t19_summary\(\)/.test(rd('docs/testdb/p0e/p0e_08_p0c_regression_tests.sql'))
   && !/jsonb_agg\(jsonb_build_object\('n', n/.test(rd('docs/testdb/p0e/p0e_05_sql_tests.sql')+rd('docs/testdb/p0e/p0e_08_p0c_regression_tests.sql')) && /v_budget constant integer := 8000/.test(rd('docs/testdb/p0e/p0e_05_sql_tests.sql')) && /INCOMPLETE_SKIPS/.test(rd('docs/testdb/p0e/p0e_05_sql_tests.sql')));
const PATCH=rd('docs/migrations/20261116_p0e_move_ticket_tkwin_patch.sql'), PAPPLY=rd('docs/testdb/p0e/p0e_09_apply_tkwin_patch_testdb.sql'), PROLL=rd('docs/testdb/p0e/p0e_09_tkwin_patch_rollback.sql');
const body=t=>{ const a=t.indexOf('$fn$')+4, b=t.indexOf('$fn$',a); return t.slice(a,b); };
const pb=body(PATCH), rb=body(PROLL);
ok('★★★ 修補版本體的 md5／長度與套用檔後置檢查相同', PAPPLY.includes(md5(pb)+':'+pb.length) && PROLL.includes(md5(pb)+':'+pb.length), md5(pb)+':'+pb.length);
ok('★★★ 回復檔內的原版本體 md5 正是 P0-C 審查版（411549f6…、13276）', md5(rb)==='411549f649f4858215e6e03429bb7ce7' && rb.length===13276, md5(rb)+':'+rb.length);
ok('★★★ 修補版相對原版恰好 3 處差異：放行 TKWIN.%、第一個 UPDATE 前開旗標、成功回傳前還原旗標',
   (()=>{ const A=rb.split('\n'), B=pb.split('\n'); const setA=new Set(A); const added=B.filter(l=>!setA.has(l)); const removed=A.filter(l=>!new Set(B).has(l));
          return removed.length===1 && /sqlerrm like 'CONTRACT\.%' then$/.test(removed[0]) && added.some(l=>/or sqlerrm like 'TKWIN\.%' then/.test(l))
                 && added.filter(l=>/set_config\('app\.tkwin_skip_booking'/.test(l)).length===2 && added.length===6; })());
ok('★★ 旗標順序：先開旗標、才有第一個 UPDATE bookings；還原在成功 return 之前', (()=>{ const i1=pb.indexOf("set_config('app.tkwin_skip_booking', 'on', true)"), i2=pb.indexOf('update bookings'), i3=pb.indexOf("set_config('app.tkwin_skip_booking', '', true)"), i4=pb.lastIndexOf("return jsonb_build_object('ok', true"); return i1>0 && i1<pb.indexOf('update bookings\n     set ticket_id = v_tk.id') && i3>i2 && i3<i4; })());
ok('★★ 套用檔前置條件：P0-C 版本體／ACL 不符就中止；後置：ACL 不變、單一簽章', /411549f649f4858215e6e03429bb7ce7:13276/.test(PAPPLY) && /TKWINPATCH\.ABORT/.test(PAPPLY) && /TKWINPATCH\.POSTCHECK_FAILED: ACL 被改變/.test(PAPPLY) && /{postgres=X\/postgres,authenticated=X\/postgres}/.test(PAPPLY));
ok('★★ 修補 migration 不含 DROP／DELETE／TRUNCATE，也沒有改 ACL（不重複 grant／revoke）', !/\b(drop|delete\s+from|truncate)\b/i.test(PATCH.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n').replace(/\$fn\$[\s\S]*?\$fn\$/,'')) && !/\b(grant|revoke)\b/i.test(PATCH.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n').replace(/\$fn\$[\s\S]*?\$fn\$/,'')));
ok('★★ T19 前置檢查會要求 RPC 已含銜接（tkwin_skip_booking）', /tkwin_skip_booking/.test(rd('docs/testdb/p0e/p0e_08_p0c_regression_tests.sql')));

console.log('\n⑤ 會員自行報名／櫃檯代預約／團課簽到：沒有任何預約路徑自己寫效期（效期只由資料庫簽到觸發器起算）');
{
  const fnBlock=(name)=>{ const i=src.indexOf('async function '+name+'('); if(i<0) return ''; return src.slice(i, src.indexOf('\nasync function ', i+10)); };
  const join=fnBlock('msbGrpJoinDo');
  ok('★★★ 會員自行報名團課只呼叫 fn_member_join_group，沒有啟用／寫票券的動作（效期由簽到觸發器起算）',
     /rpc\('fn_member_join_group'/.test(join) && !/activateTicketIfNeeded|dbPut\('member_tickets'|start_date|expire_date|activated_at/.test(join));
  ok('★★★ 團課名單新增（櫃檯代預約）不在規劃階段啟用效期（p_adds 只照傳票券目前的值）',
     !/await activateTicketIfNeeded\(tk,b\.id\)/.test(src) && /p_adds=_plan\.map/.test(src));
  ok('★★ 團課簽到／撤銷簽到後清票券快取，畫面才看得到資料庫起算的效期',
     /_toggleGroupAttend[\s\S]{0,4000}dbCacheClear\(\[[^\]]*member_tickets/.test(src));
  ok('★ 資料庫端回歸：p0e_11_group_join_activation_tests.sql 涵蓋會員自行報名／櫃檯代預約／座位簽到／撤銷／同堂他人簽到／同會員雙名額',
     fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/testdb/p0e/p0e_11_group_join_activation_tests.sql'));
}


console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);