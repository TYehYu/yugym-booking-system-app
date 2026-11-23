/* 2026-11-21 新票轉正：按上課日期由近到遠保留、超額卡位取消釋放。
   資料庫規則的行為驗證（近的保留／遠的取消／重送不重扣／不動他人／故障不取消）在測試庫回滾式執行，見 docs/testdb/hold-settle/。
   這支測試守「前端」與「migration 檔」：真的跑 holdSettleHandle／holdSettleRun／askChargeUnpaid，只替換資料存取與畫面。 */
const fs = require('fs');
const root = process.env.HOME + '/Projects/yugym-booking-system-app/';
const src = fs.readFileSync(root + 'index.html', 'utf8');
const mig = fs.readFileSync(root + 'docs/migrations/20261121_hold_settle_new_ticket.sql', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const g = (a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('找不到：' + a); return src.slice(i, src.indexOf(b, i) + b.length); };

(async () => {
  const cp = g('async function _doConvertPending(memberId, tkId, mode){', '\n}\n');
  console.log('舊設計已移除（不只改文字）');
  ok('★ 轉正流程沒有「保留原狀」「超出目前票券範圍」「只轉這一堂」「kept++」', !/保留原狀|超出目前票券範圍|只轉這一堂|kept\+\+|mode==='series'|mode==='ask'/.test(cp));
  ok('★ 轉正流程不再逐筆 deductTicket／dbPut 預約（改走資料庫單一交易）', !/deductTicket\(|dbPut\('bookings'/.test(cp) && /holdSettleStart\(memberId, tk\.id, b\.id/.test(cp));
  ok('★ 明細視窗沒有「整串轉正」第二顆按鈕；不再有 mode=one／series 的呼叫', !/>整串轉正</.test(src) && !/doConvertPending\([^)]*'(one|series)'/.test(src));
  const _hs0 = src.indexOf('const HS_ERR={'), _hr0 = src.indexOf('async function holdSettleRun(){');
  const full = src.slice(_hs0, src.indexOf('\n}\n', _hr0) + 3); const helpers = full;
  ok('　　整理流程沒有「保留等下一份合約」的選項或文字（取消那段只說明「不再保留」）', !/等簽下一份合約|等下一份合約處理|保留原狀/.test(helpers.replace('不再保留等下一份合約', '')));
  const ask = g('async function askChargeUnpaidOthers(', '\n}\n');
  ok('★ 新票發放補扣：待簽約卡位不再由這裡取消（over 恆空），也不再列入補扣清單', /const over=\[\];/.test(ask) && /unpaidFutureBookings\(memberId,tk,true\)/.test(ask));
  ok('★ 賣票後與審核發放後兩個入口都呼叫同一支 askChargeUnpaid', (src.match(/await askChargeUnpaid\(/g) || []).length >= 2);

  console.log('\nmigration 檔（規則寫在伺服器、單一交易）');
  ok('★ SECURITY DEFINER、固定 search_path；只 grant authenticated；anon／public／service_role 收回；函式內驗櫃檯', /security definer set search_path to 'public', 'pg_temp'/.test(mig) && /revoke all on function public\.fn_hold_settle_new_ticket\(text, boolean, text, jsonb\) from public, anon, authenticated, service_role/.test(mig) && /grant execute on function public\.fn_hold_settle_new_ticket\(text, boolean, text, jsonb\) to authenticated;/.test(mig) && !/to anon|to service_role|to public/.test(mig.replace(/revoke[^\n]*/g, '')) && /is_staff_desk\(\)/.test(mig));
  ok('★ 穩定排序（日期、開始時間、預約 id）、候選限本人同票種未綁票待簽約且未歸屬合約、未簽到、非分期保留', /order by b\.date, b\.start_time, b\.id/.test(mig) && /b\.pending_contract is true and b\.ticket_id is null and b\.contract_id is null/.test(mig) && /b\.checked_in_at is null/.test(mig) && /b\.ticket_type_id is not distinct from mt\.ticket_type_id/.test(mig) && /not like '%分期待繳費保留%'/.test(mig));
  ok('★ 取消不實體刪除（只改 status／cancelled_*／cancel_reason），整支沒有 delete', !/\bdelete\s+from\b/i.test(mig) && /status = 'cancelled'/.test(mig) && /cancel_reason/.test(mig));
  ok('★ 分期：合約內未開通堂數 → 保留（不扣不取消）；分期保留對不齊又有超額 → INST_AMBIGUOUS 整批停止', /v_locked/.test(mig) && /INST_AMBIGUOUS/.test(mig));
  ok('★ 執行必須帶確認清單（EXPECT_REQUIRED）；清單不符 PLAN_CHANGED；重送回 already；失敗整批復原（SETTLE.FAILED）', /EXPECT_REQUIRED/.test(mig) && /PLAN_CHANGED/.test(mig) && /'already', true/.test(mig) && /SETTLE\.FAILED/.test(mig));
  ok('★ rev3：確認清單含整列雜湊指紋 sig（不只比 id）；sig 不同＝PLAN_CHANGED；缺 sig＝EXPECT_REQUIRED', /to_jsonb\(b\)::text/.test(mig) && /p_expect->>'sig' is distinct from v_sig/.test(mig) && /p_expect->>'sig' is null/.test(mig) && /'sig', v_sig/.test(mig));
  ok('★ rev3：鎖後重找出現沒鎖到的候選 → CANDIDATES_CHANGED（不處理沒鎖住的）；錨點查無 → ANCHOR_NOT_FOUND；錨點整列進 sig', /CANDIDATES_CHANGED/.test(mig) && /not \(x = any \(v_ids0\)\)/.test(mig) && /ANCHOR_NOT_FOUND/.test(mig) && /md5\(to_jsonb\(v_anc\)::text\)/.test(mig));
  ok('★ rev3：尚未啟用票的效期窗口——窗外卡位列為 skip（不轉正、不取消）', /fn_tk_is_unopened\(v_tr\)/.test(mig) && /fn_tk_holding\(p_ticket_id, null\)/.test(mig) && /'skip', to_jsonb\(v_out\)/.test(mig));
  ok('★ rev5：其他票券逐筆分配（狀態、已開通可約堂數、起始日、效期涵蓋上課日、未啟用窗口），堂數逐筆遞減；無法判讀＝UNVERIFIABLE_OTHER；其他票狀態進指紋並與本票一起鎖', /v_o_cap\[j\] := v_o_cap\[j\] - 1/.test(mig) && /v_o_exp\[v_n\] >= bd/.test(mig) && /v_o_st\[v_n\] > bd/.test(mig) && /UNVERIFIABLE_OTHER/.test(mig) && /coalesce\(v_others, ''\)/.test(mig) && /shared_with is not null\)\)\) order by id for update/.test(mig) && !/v_other\b/.test(mig));
  ok('★ 鎖序：advisory → 預約列（依 id）→ 票券列；扣堂前查帳本不重複扣（SETTLE.ALREADY_DEDUCTED）；餘額不足整批回滾', /pg_advisory_xact_lock/.test(mig) && mig.indexOf('order by id for update') < mig.indexOf("shared_with is not null))) order by id for update") && /SETTLE\.ALREADY_DEDUCTED/.test(mig) && /SETTLE\.NO_REMAINING/.test(mig));

  console.log('\n前端行為（真的跑 holdSettleHandle／holdSettleRun／askChargeUnpaid，替換資料存取）');
  const build = (rpcImpl) => {
    const modals = [], toasts = [], rpcs = []; let closed = 0, afterN = 0; const cleared = [];
    const env = {
      sb: { rpc: async (name, args) => { rpcs.push({ name, args }); return rpcImpl(name, args, rpcs.length); } },
      cxBusy: () => () => {}, showToast: (m) => toasts.push(m), showModal: (h) => modals.push(h), closeModal: () => { closed++; },
      dbGet: async (t, id) => (t === 'members' ? { id, name: '測試會員' } : { id, member_id: 'M1' }), dbCacheClear: (a) => cleared.push(a),
      onceAct: async (k, fn) => fn(), PP: undefined, navTo: () => {}, CUR_PAGE: 'x', window: {}, ppLoadCtx: async () => {}, ppRenderBody: () => {},
    };
    const names = Object.keys(env);
    const api = new Function(...names, full + '\nreturn {holdSettleStart,holdSettleHandle,holdSettleRun,holdSettleGo,holdSettleSkip,hsMsg,win:window};')(...names.map(k => env[k]));
    return { api, modals, toasts, rpcs, closed: () => closed, cleared, after: () => { afterN++; }, afterN: () => afterN };
  };
  const rowsOf = (spec) => spec.map(([id, d, t, k]) => ({ id, date: d, start_time: t, category: '私人教練', kind: k }));
  const PLAN = { bind: ['A', 'B'], hold: ['H'], cancel: ['Z'], skip: [], sig: 'sig-abc' };
  const RES = { ok: true, rows: rowsOf([['A', '2026-12-01', '10:00', 'bind'], ['B', '2026-12-02', '10:00', 'bind'], ['H', '2026-12-03', '10:00', 'hold'], ['Z', '2026-12-09', '10:00', 'cancel']]), plan: PLAN, ticket_name: '12堂票' };
  {
    const e = build(async () => ({ data: { ok: true, bound: ['A', 'B'], held: ['H'], cancelled: ['Z'], remaining: 0 }, error: null }));
    await e.api.holdSettleHandle(RES, 'M1', 'TK1', null, { after: e.after });
    const m = e.modals[0] || '';
    ok('★ 確認畫面列出：轉正日期時間、分期保留日期、將取消日期與堂數（12/01 10:00、12/09 10:00、取消 1 堂）', /12\/01 10:00/.test(m) && /12\/02 10:00/.test(m) && /分期待繳費保留/.test(m) && /12\/09 10:00/.test(m) && /取消 1 堂/.test(m), m.slice(0, 200));
    ok('★ 確認畫面只有「先不整理」與「確認整理」，沒有任何「保留原狀／等續約」選項', /先不整理/.test(m) && /確認整理/.test(m) && !/保留原狀|只轉這一堂|整串轉正/.test(m));
    ok('　　尚未按確認前沒有呼叫任何寫入（預覽之外的 rpc＝0）', e.rpcs.length === 0);
    await e.api.holdSettleGo();
    const call = e.rpcs[0];
    ok('★ 按確認 → 只呼叫一次 RPC，p_dry=false 並帶同一份確認清單', e.rpcs.length === 1 && call.name === 'fn_hold_settle_new_ticket' && call.args.p_dry === false && JSON.stringify(call.args.p_expect) === JSON.stringify(PLAN));
    ok('　　成功後清快取、關窗、接續原流程（after）', e.cleared.length === 1 && e.closed() === 1 && e.afterN() === 1);
  }
  {
    const e = build(async () => ({ data: { ok: false, error_code: 'SETTLE.FAILED', detail: 'SETTLE.ALREADY_DEDUCTED:B' }, error: null }));
    await e.api.holdSettleHandle(RES, 'M1', 'TK1', null, {});
    await e.api.holdSettleGo();
    ok('★ 扣堂／轉正失敗 → 只提示「整批已復原、沒有任何扣堂或取消」，前端不再發任何第二個請求（沒有補償取消）', e.rpcs.length === 1 && /整批已復原/.test(e.toasts.join('|')) && e.closed() === 0);
  }
  {
    const e = build(async () => { throw new Error('network down'); });
    await e.api.holdSettleHandle(RES, 'M1', 'TK1', null, {});
    await e.api.holdSettleGo();
    ok('★ 結果不明（網路中斷）→ 視窗保留、提示可安全重送；沒有關窗', /結果不明/.test(e.toasts.join('|')) && /重送不會重複扣堂/.test(e.toasts.join('|')) && e.closed() === 0);
    const e2 = build(async () => ({ data: { ok: true, already: true, plan: PLAN }, error: null }));
    await e2.api.holdSettleHandle(RES, 'M1', 'TK1', null, {});
    await e2.api.holdSettleGo();
    ok('★ 重送：伺服器回 already → 提示「沒有重複扣堂或取消」並關窗', /沒有重複扣堂或取消/.test(e2.toasts.join('|')) && e2.closed() === 1);
  }
  {
    const e = build(async () => ({ data: { ok: true }, error: null }));
    await e.api.holdSettleHandle({ ok: true, rows: rowsOf([['A', '2026-12-01', '10:00', 'bind'], ['S', '2026-12-20', '10:00', 'skip'], ['T', '2026-12-21', '10:00', 'skip']]), plan: { bind: ['A'], hold: [], cancel: [], skip: ['S', 'T'], sig: 'x' } }, 'M1', 'TK1', null, {});
    ok('★ 效期窗口外的卡位在確認畫面標示「不動（不轉正也不取消）」並列出日期', /超出票券使用期間，不動/.test(e.modals[0] || '') && /12\/20 10:00/.test(e.modals[0] || '') && /12\/21 10:00/.test(e.modals[0] || ''));
    const e2 = build(async () => ({ data: null, error: null }));
    await e2.api.holdSettleHandle({ ok: true, rows: rowsOf([['S', '2026-12-20', '10:00', 'skip']]), plan: { bind: [], hold: [], cancel: [], skip: ['S'], sig: 'x' } }, 'M1', 'TK1', null, { after: e2.after });
    ok('　　全部都在窗外 → 只提示、不呼叫任何寫入、仍接續原流程', e2.rpcs.length === 0 && /沒有動它們/.test(e2.toasts.join('|')) && e2.afterN() === 1);
  }
  {
    const e = build(async () => ({ data: { ok: true }, error: null }));
    await e.api.holdSettleHandle({ ok: true, rows: rowsOf([['A', '2026-12-01', '10:00', 'bind'], ['D', '2026-12-05', '10:00', 'defer'], ['Z', '2026-12-09', '10:00', 'cancel']]), plan: { bind: ['A'], hold: [], cancel: ['Z'], skip: [], defer: ['D'], sig: 'x' } }, 'M1', 'TK1', null, {});
    ok('★ 其他票券可承接的卡位標示「先不動（不扣、不取消）」並列日期；取消只剩真正承接不了的', /先保留（不取消，也沒有扣其他票）/.test(e.modals[0] || '') && /不會自動改用另一張票/.test(e.modals[0] || '') && /12\/05 10:00/.test(e.modals[0] || '') && /取消 1 堂/.test(e.modals[0] || ''));
    const e2 = build(async () => ({ data: null, error: null }));
    await e2.api.holdSettleHandle({ ok: true, rows: rowsOf([['D', '2026-12-05', '10:00', 'defer']]), plan: { bind: [], hold: [], cancel: [], skip: [], defer: ['D'], sig: 'x' } }, 'M1', 'TK1', null, { after: e2.after });
    ok('　　全部都可由其他票券承接 → 只提示、不寫入、接續原流程', e2.rpcs.length === 0 && /其他票券/.test(e2.toasts.join('|')) && e2.afterN() === 1);
  }
  {
    let n = 0;
    const NEW = { ok: false, error_code: 'PLAN_CHANGED', plan: { bind: ['N', 'A'], hold: [], cancel: ['B', 'H', 'Z'] }, rows: rowsOf([['N', '2026-11-30', '09:00', 'bind'], ['A', '2026-12-01', '10:00', 'bind'], ['B', '2026-12-02', '10:00', 'cancel'], ['H', '2026-12-03', '10:00', 'cancel'], ['Z', '2026-12-09', '10:00', 'cancel']]) };
    const e = build(async () => ({ data: NEW, error: null }));
    await e.api.holdSettleHandle(RES, 'M1', 'TK1', null, {});
    await e.api.holdSettleGo();
    ok('★ 確認後清單有變（PLAN_CHANGED）→ 不執行、用新清單重畫確認畫面（再確認一次）', e.rpcs.length === 1 && e.modals.length === 2 && /11\/30 09:00/.test(e.modals[1]) && /取消 3 堂/.test(e.modals[1]));
  }
  {
    const e = build(async () => ({ data: { ok: true }, error: null }));
    await e.api.holdSettleHandle({ ok: true, rows: rowsOf([['A', '2026-12-01', '10:00', 'bind']]), plan: { bind: ['A'], hold: [], cancel: [] } }, 'M1', 'TK1', 'A', { anchor: true });
    ok('　　轉正入口：只有一堂可轉正、沒有保留／取消 → 直接執行不多問（行為同過去單堂轉正）', e.rpcs.length === 1 && e.rpcs[0].args.p_dry === false && e.modals.length === 0);
    const e2 = build(async () => ({ data: { ok: true }, error: null }));
    await e2.api.holdSettleHandle({ ok: true, rows: rowsOf([['A', '2026-12-01', '10:00', 'bind'], ['B', '2026-12-02', '10:00', 'bind']]), plan: { bind: ['A', 'B'], hold: [], cancel: [] } }, 'M1', 'TK1', 'A', { anchor: true });
    ok('★ 「只轉這一堂」不能成為退路：同票有兩堂以上要轉 → 一定跳確認畫面，且不是只轉點到的那一堂', e2.rpcs.length === 0 && e2.modals.length === 1 && /2 堂/.test(e2.modals[0]));
    const e3 = build(async () => ({ data: null, error: null }));
    await e3.api.holdSettleHandle({ ok: false, error_code: 'INST_AMBIGUOUS' }, 'M1', 'TK1', null, { after: e3.after });
    ok('　　分期算不準（INST_AMBIGUOUS）→ 全部停止、不取消，並仍接續原流程', /為避免誤取消/.test(e3.toasts.join('|')) && e3.rpcs.length === 0 && e3.afterN() === 1);
  }
  {
    // 兩個入口一致：askChargeUnpaid（新票發放）與 _doConvertPending（轉正）呼叫的是同一支 RPC、同一支確認畫面函式
    const askFn = g('async function askChargeUnpaid(', '\n}\n');
    ok('★ 兩個入口一致：新票發放（askChargeUnpaid）與轉正（_doConvertPending）都走 fn_hold_settle_new_ticket 預覽＋同一個 holdSettleHandle／holdSettleStart 確認畫面', /fn_hold_settle_new_ticket/.test(askFn) && /holdSettleHandle\(/.test(askFn) && /holdSettleStart\(/.test(cp) && /fn_hold_settle_new_ticket/.test(g('async function holdSettleStart(', '\n}\n')));
    ok('　　新票發放入口：整理完（或先不整理）才接原本非待簽約的補扣（after）', /after:\(\)=>askChargeUnpaidOthers\(memberId,ticketId\)/.test(askFn));
  }
  {
    // rev6 共享票：「其他票」不只會員自己名下，也包含別人名下、shared_with 內有這位會員的同票種票（一般預約本來就允許）
    const apply = fs.readFileSync(root + 'docs/prod-release/12_hold_settle_apply_prod.sql', 'utf8');
    const verify = fs.readFileSync(root + 'docs/prod-release/12_hold_settle_verify_readonly.sql', 'utf8');
    const body = mig.slice(mig.indexOf('$fn$'), mig.lastIndexOf('$fn$'));
    ok('★ 共享票：承接判定的迴圈、確認指紋（v_others）都納入「別人名下共享給這位會員」的票（fn_tk_shared_has），不是只看 member_id 相等',
       (body.match(/public\.fn_tk_shared_has\(to_jsonb\(t\.shared_with\), v_t\.member_id\)/g) || []).length === 2 && !/t\.member_id = v_t\.member_id and t\.ticket_type_id is not distinct from v_t\.ticket_type_id and t\.status::text = 'usable' order by/.test(body));
    ok('★ 共享票：鎖票把「別人名下有共享名單的」同票種可用票一起鎖（依 id；先多鎖、不在鎖定階段呼叫判定函式）',
       /member_id = v_t\.member_id or shared_with is not null/.test(body) && /for update;   -- 本票與同票種的其他可用票券一起鎖/.test(body));
    ok('★ 共享票：名單格式讀不懂（不是字串陣列）→ UNVERIFIABLE_OTHER（SHARED_UNREADABLE）整批停止；只掃別人名下、同票種、可用（不是已用完／過期）且有名單的票',
       /'reason', 'SHARED_UNREADABLE'/.test(body) && /t\.member_id is distinct from v_t\.member_id and t\.status::text = 'usable' and t\.shared_with is not null/.test(body));
    ok('★ 共享票：不新增任何寫入——共享票只在承接判定中出現，執行段只更新 p_ticket_id 本票（不扣共享票）',
       !/update member_tickets set sessions_remaining = sessions_remaining - 1 where id = (?!p_ticket_id)/.test(body) && (body.match(/update member_tickets/g) || []).length === 1);
    ok('★ 共享票：套用檔與唯讀驗證檔都釘住依賴函式 fn_tk_shared_has（本體 md5 0d0d61af…）；套用檔與 migration 本體一致（含新指紋 550c28a8…）',
       /fn_tk_shared_has\(jsonb,text\)/.test(apply) && /0d0d61af566726ed67f884d3f733856f/.test(apply) && /fn_tk_shared_has\(jsonb,text\)/.test(verify) && /0d0d61af566726ed67f884d3f733856f/.test(verify)
       && apply.indexOf(mig.slice(mig.indexOf('create function public.fn_hold_settle_new_ticket('), mig.lastIndexOf('$fn$;') + 5)) > 0
       && require('crypto').createHash('md5').update(body.slice(4)).digest('hex') === '550c28a816b6e46f636287d7fa33405a');
    ok('　　前端：UNVERIFIABLE_OTHER 有人話訊息（不是「整理失敗：UNVERIFIABLE_OTHER」），且確認畫面的「先不動」列註明含別人共享的票',
       /UNVERIFIABLE_OTHER:'[^']*為避免誤取消[^']*'/.test(src) && /先保留（不取消，也沒有扣其他票）/.test(src) && /含別人共享給他的票/.test(src));
  }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})();
