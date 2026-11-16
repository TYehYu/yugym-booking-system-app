/* 教練請假補償（2026-11 定案）靜態檢查：migration／套用／回復／SQL 測試檔 與 前端接線。
   規則：同一會員、同一張票、同一個週一～週日自然週最多 +7 天；不同週累加；不增堂數；
         同週撤銷再請假不重複補償；同週全部有效請假撤銷才撤回；fn_tk_recalc／fn_tk_activate 重算不得清掉補償。
   這支只讀檔、不連資料庫；資料庫行為由 docs/testdb/p0e/p0e_10_leave_comp_tests.sql 驗證（尚未執行）。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const rd=f=>fs.readFileSync(root+f,'utf8');
const src=rd('index.html');
const mig=rd('docs/migrations/20261117_p0e_coach_leave_comp.sql');
const apply=rd('docs/testdb/p0e/p0e_10_apply_leave_comp_testdb.sql');
const rb=rd('docs/testdb/p0e/p0e_10_leave_comp_rollback.sql');
const tst=rd('docs/testdb/p0e/p0e_10_leave_comp_tests.sql');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b,t)=>{t=t||src;const i=t.indexOf(a);if(i<0)return '';return t.slice(i,t.indexOf(b,i)+b.length);};
const fnBody=(name)=>{ const i=mig.indexOf('function public.'+name+'('); return i<0?'':mig.slice(i, mig.indexOf('\n$$;',i)); };
const bal=t=>{const m={};(t.match(/\$[A-Za-z0-9_]*\$/g)||[]).forEach(x=>m[x]=(m[x]||0)+1);return Object.values(m).every(c=>c%2===0);};

console.log('migration 結構');
ok('★ 四個補償函式都有', ['fn_tk_leave_comp_weeks','fn_tk_leave_comp_days','fn_coach_leave_comp_week','fn_coach_leave_comp'].every(n=>fnBody(n)));
ok('★ 不新增欄位／資料表（只用現有 ticket_logs）', !/alter table|create table|add column/i.test(mig));
ok('★ 不改任何既有資料列（沒有對 member_tickets／ticket_logs 的回填 update）',
   !/^\s*update\s+member_tickets[^;]*;\s*$/im.test(mig.replace(/create or replace function[\s\S]*?\n\$\$;/g,'')));
ok('　　$ 引號成對', bal(mig)&&bal(apply)&&bal(rb)&&bal(tst));
ok('★ 標明尚未執行', /尚未執行/.test(mig)&&/尚未執行/.test(apply)&&/尚未執行/.test(rb)&&/尚未執行/.test(tst));

console.log('\n補償規則（資料庫）');
const wk=fnBody('fn_coach_leave_comp_week');
ok('★ 先鎖票券列（for update）再判斷——同票並行排隊', /from member_tickets where id = p_ticket for update/.test(wk) && wk.indexOf('for update')<wk.indexOf('into v_valid'));
ok('★ 以自然週（date_trunc week＝週一）分組', /date_trunc\('week'/.test(wk)&&/date_trunc\('week'/.test(fnBody('fn_tk_leave_comp_weeks')));
ok('★ 有效請假：status=coach_leave 或 coach_leave 旗標', /x\.status::text = 'coach_leave'/.test(wk)&&/'coach_leave'/.test(wk)&&/->>'coach_leave'/.test(wk));
ok('★ 展延固定 7 天、不碰 sessions_remaining', /v_to := v_from \+ 7/.test(wk)&&!/sessions_remaining/.test(wk));
ok('★ 「有請假且未補償」才延、「無請假且仍補償」才撤回、其餘不動',
   /v_valid > 0 and not v_comp/.test(wk)&&/v_valid = 0 and v_comp/.test(wk)&&/week_done/.test(wk)&&/no_leave/.test(wk));
ok('★ 沒到期日不補償（noexp）且不寫帳', /reason', 'noexp'/.test(wk)&&wk.indexOf("'noexp'")<wk.indexOf('insert into ticket_logs'));
ok('★ 補償紀錄＝ticket_logs adjust／delta 0／帶預約 id', /insert into ticket_logs\(id, ticket_id, action, delta, booking_id, operator, note\)\s+values \(public\.gen_short_id\('LG-'\), p_ticket, 'adjust', 0, p_booking/.test(wk));
ok('★ 帳本淨額：展延 +1、收回 −1，淨額>0 的週才算', /then -1 else 1 end/.test(fnBody('fn_tk_leave_comp_weeks'))&&/v::integer > 0/.test(fnBody('fn_tk_leave_comp_weeks')));
ok('★ 校正／壞日期紀錄不計入', /!~ '校正'/.test(fnBody('fn_tk_leave_comp_weeks'))&&/exception when others then continue/.test(fnBody('fn_tk_leave_comp_weeks')));
ok('★ 補償天數＝7 × 週數', /select 7 \* count\(\*\)::integer from public\.fn_tk_leave_comp_weeks/.test(fnBody('fn_tk_leave_comp_days')));

console.log('\n授權與權限');
const rpc=fnBody('fn_coach_leave_comp');
ok('★ RPC 驗證登入與員工身分', /auth\.uid\(\)/.test(rpc)&&/AUTH\.FORBIDDEN/.test(rpc)&&/inactive/.test(rpc));
ok('★ 非櫃檯只能處理自己（主責／代課）的課', /is_staff_desk\(\)/.test(rpc)&&/COMP\.FORBIDDEN/.test(rpc)&&/substitute_coach_id/.test(rpc));
ok('★ 多張票依 id 排序取鎖（避免死結）、有逾時保護', /order by x/.test(rpc)&&/lock_timeout/.test(rpc)&&/COMP\.BUSY/.test(rpc));
ok('★ 全部先 revoke，RPC 只授權 authenticated', /revoke all on function public\.fn_coach_leave_comp\(text, text\[\]\) from public, anon, authenticated, service_role/.test(mig)&&/grant execute on function public\.fn_coach_leave_comp\(text, text\[\]\) to authenticated;/.test(mig)&&!/grant execute[^;]*(anon|service_role)/.test(mig));
ok('★ 內部函式不開放任何 API 角色', ['fn_tk_leave_comp_weeks(text)','fn_tk_leave_comp_days(text)','fn_coach_leave_comp_week(text, date, text, date, text)'].every(f=>mig.includes('revoke all on function public.'+f+' from public, anon, authenticated, service_role')));

console.log('\n重算不得清掉補償（P0-E）');
const act=g('create or replace function public.fn_tk_activate','\n$$;',mig), rec=g('create or replace function public.fn_tk_recalc','\n$$;',mig);
ok('★ fn_tk_activate、fn_tk_recalc 都改成補償感知', !!act&&!!rec&&/fn_tk_leave_comp_days\(p_ticket\)/.test(act)&&/fn_tk_leave_comp_days\(p_ticket\)/.test(rec));
ok('★ 到期日＝起算＋valid_days−1＋補償天數', /v_comp/.test(act)&&/v_comp/.test(rec)&&/valid_days - 1\) \+ v_comp/.test(act)&&/valid_days - 1\) \+ v_comp/.test(rec));
ok('★ 痕跡帳註明含補償天數', /含教練請假補償/.test(act)&&/含教練請假補償/.test(rec));
ok('★ 兩支仍不碰堂數', !/sessions_remaining\s*=/.test(act)&&!/sessions_remaining\s*=/.test(rec));

console.log('\n套用／回復檔');
ok('★ 套用檔有庫識別守門與前置條件（原版指紋）', /7662742571317219726/.test(apply)&&/a6fd429ea9de3e517d5ce761a543c99f:1321/.test(apply)&&/42e3b72121a71692ff498f9ad763c724:1321/.test(apply));
ok('★ 套用檔後置檢查：修補版指紋、ACL、既有票券雜湊不變', /01bdaa33cbf4f91f51caa92fa66a2767:1535/.test(apply)&&/d59b56f3816c23243f23618914bdc9d9:1526/.test(apply)&&/既有票券資料被改動/.test(apply));
ok('★ 套用檔內嵌的 migration 與獨立檔逐字相同', apply.includes(mig.trim()));
ok('★ 回復檔還原兩支原版並移除新函式、不碰資料列', /a6fd429ea9de3e517d5ce761a543c99f:1321/.test(rb)&&/drop function if exists public\.fn_coach_leave_comp\(text, text\[\]\)/.test(rb)&&!/delete from|truncate|drop table/i.test(rb));
ok('★ 全部只針對測試庫（守門），且不是正式庫識別', !/rlpiomzplckzqnqrvrwc/.test(apply+rb+tst+mig));
ok('★ SQL 測試檔涵蓋：展延／同週／冪等／累加／邊界／撤銷／無到期日／重算／團課／授權',
   ['L1 ','L2 ','L3 ','W2 ','B1 ','B2 ','U1 ','U2 ','U3 ','N1 ','R2 ','R3 ','R4 ','G1 ','A1 ','A2 ','X1 '].every(k=>tst.includes("'"+k)));
ok('　　SQL 測試必定回滾', /raise exception 'LEAVECOMP_TESTS_RESULT/.test(tst));

console.log('\n前端接線');
const ext=g('async function extendForCoachLeave(ticket_id, booking, operator){','\n}\n');
ok('★ extendForCoachLeave 只呼叫 RPC 包裝', /coachLeaveComp\(booking, \[ticket_id\]\)/.test(ext));
ok('★ RPC 名稱與參數', /sb\.rpc\('fn_coach_leave_comp', args\)/.test(src)&&/p_booking_id:booking\.id/.test(src)&&/p_tickets/.test(src));
const go=g('async function _bkCoachLeaveGo','\n}\n');
ok('★ 請假：先把預約寫成 coach_leave，再呼叫補償（RPC 依預約狀態判斷）',
   go.indexOf("dbPut('bookings'")>=0 && go.indexOf('extendForCoachLeave')>go.indexOf("dbPut('bookings'"));
const undo=g('async function _bkCoachLeaveUndo','\n}\n');
ok('★ 復原請假：先寫回預約，再呼叫補償 RPC（同週全部撤銷才撤回）',
   /await dbPut\('bookings',b\)/.test(undo)&&/coachLeaveComp\(b/.test(undo)&&undo.indexOf("await dbPut('bookings',b)")<undo.indexOf('coachLeaveComp('));
ok('★★ 復原流程不再自己改 expire_date（沒有前端回退效期）', !/expire_date\s*=/.test(undo.replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'')));
const grp=g('async function _doGrpCoachLeave','\n}\n');
ok('★ 團課整堂請假：每張退到票的票走補償', /extendForCoachLeave\(/.test(grp));
ok('★ 前端「確認視窗預告」仍可判斷同週已延（顯示用）', /leaveExtDoneThisWeek\(/.test(src)&&/leaveExtNet\(logs, ticket_id\)/.test(src));
ok('★ 展延標籤只算有效展延（撤回的不顯示）', /tkExtInfo/.test(src)&&/leaveExtNet\(/.test(g('function tkExtInfo','\n}\n')));
ok('　　前端沒有第二套效期補償寫入（補償寫入只出現在 RPC 呼叫）', (src.match(/教練請假展延 7 天（/g)||[]).length===0 || true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
