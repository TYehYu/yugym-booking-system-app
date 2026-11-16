#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 真正多連線併發測試 Q11／R14（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需 p0e_12 已套用）
# 需要你在本機自備（不要貼進對話或進版控）：
#   export TESTDB_URL='postgresql://…'            # 測試庫連線字串（腳本先驗證叢集識別 7662742571317219726，不符就中止）
#   export DESK_UID='<測試庫某位櫃檯／管理員的 employees.auth_id>'   # 只用來模擬身分；不建立或刪除任何帳號
# 資料與重複執行：夾具一律用 CC- 前綴；開始前先清一次、結束時（含中途失敗／Ctrl-C）再清一次，並印出殘留數（必須 0）。
#   可重複執行；不可同時有兩個人跑（會共用 CC- 夾具）。只動 CC- 開頭的列，不碰任何既有資料。
# 併發證據：每個情境都量「第二條連線的等待秒數」——第一條連線在交易內 pg_sleep(4) 期間持有鎖，第二條 1 秒後才開始；
#   第二條連線若沒有被擋住至少 2 秒，代表兩條連線根本沒有重疊，該情境判為 FAIL（不是 PASS），避免假性併發。
# 判定：PASS／FAIL／SKIP 分開計數；只有 FAIL＝0 才 exit 0；SKIP 不算通過。
# ═══════════════════════════════════════════════════════════════════════
set -u
: "${TESTDB_URL:?請先 export TESTDB_URL}"; : "${DESK_UID:?請先 export DESK_UID}"
P() { psql "$TESTDB_URL" -v ON_ERROR_STOP=0 -X -q -t -A "$@"; }
now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
PASS=0; FAIL=0; SKIP=0
ok()   { if [ "$2" = "1" ]; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1  → $3"; FAIL=$((FAIL+1)); fi; }
skip() { echo "  - SKIP $1：$2"; SKIP=$((SKIP+1)); }
SYS=$(P -c "select system_identifier::text from pg_control_system()")
[ "$SYS" = "7662742571317219726" ] || { echo "GUARD: 不是測試庫（$SYS），中止"; exit 2; }
[ "$(P -c "select (to_regclass('public.change_log') is not null)::text")" = "false" ] || { echo "GUARD: 看起來像正式庫，中止"; exit 2; }
[ "$(P -c "select (to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null and exists (select 1 from pg_trigger where tgname='trg_tk_quota_guard'))::text")" = "true" ] || { echo "前置：尚未套用 p0e_12（缺 fn_refund_ticket 或 trg_tk_quota_guard），中止"; exit 3; }
[ "$(P -c "select count(*) from employees where auth_id::text='$DESK_UID' and role::text in ('front_desk','admin') and status::text is distinct from 'inactive'")" = "1" ] || { echo "前置：DESK_UID 不是測試庫的啟用中櫃檯／管理員，中止"; exit 3; }
RESID_SQL="select (select count(*) from ticket_logs where ticket_id like 'CC-%' or booking_id like 'CC-%')+(select count(*) from bookings where id like 'CC-%')+(select count(*) from member_tickets where id like 'CC-%')+(select count(*) from members where id like 'CC-%')+(select count(*) from ticket_types where id like 'CC-%')"
cleanup() { P -c "delete from ticket_logs where ticket_id like 'CC-%' or booking_id like 'CC-%'; delete from bookings where id like 'CC-%'; delete from member_tickets where id like 'CC-%'; delete from members where id like 'CC-%'; delete from ticket_types where id like 'CC-%';" >/dev/null; }
trap cleanup EXIT; cleanup
[ "$(P -c "$RESID_SQL")" = "0" ] || { echo "開始前就有 CC- 殘留且清不掉，中止"; exit 3; }
BASE_HASH=$(P -c "select md5(coalesce(string_agg(id||'|'||coalesce(sessions_remaining::text,'')||'|'||coalesce(unlocked_sessions::text,''),',' order by id),'')) from member_tickets where id not like 'CC-%'")
CLAIMS="select set_config('request.jwt.claims', json_build_object('sub','$DESK_UID','role','authenticated')::text, true);"
P -c "insert into ticket_types(id,name,category) values ('CC-T','CC','私人教練'); insert into members(id,name) values ('CC-M','CC會員');" >/dev/null
mkbk() { P -c "insert into bookings(id,member_id,category,ticket_type_id,date,start_time,duration,status,pending_contract,ticket_id,member_ids,attendance) values ('$1','CC-M','私人教練','CC-T',(now() at time zone 'Asia/Taipei')::date+3,'10:00',60,'booked',false,'$2','[]','{}')" >/dev/null; }
led()  { P -c "insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('CC-LG-'||md5(random()::text),'$1','$2',$3,'$4','cc','cc fixture')" >/dev/null; }
# race <名稱> <A 的 SQL> <B 的 SQL>：A 持鎖 4 秒、B 1 秒後開始；輸出 /tmp/cc_<名稱>.a／.b／.bt（B 等待秒數）
race() {
  # 從標準輸入餵入多個語句（比 psql -c 可靠：每個語句的結果與錯誤都會印出，不會只剩最後一個）
  ( printf '%s\n' "begin;" "$CLAIMS" "$2" "select pg_sleep(4);" "commit;" | P >/tmp/cc_$1.a 2>&1 ) &
  sleep 1
  ( s=$(now); printf '%s\n' "begin;" "$CLAIMS" "$3" "commit;" | P >/tmp/cc_$1.b 2>&1; e=$(now); awk -v s="$s" -v e="$e" 'BEGIN{printf "%.2f", e-s}' >/tmp/cc_$1.bt ) &
  wait
}
waited() { awk -v t="$(cat /tmp/cc_$1.bt)" 'BEGIN{print (t>=2.0)?1:0}'; }

echo "Q11 分期額度剩 1，兩條連線同時各扣 1 堂 → 只能一個成功，另一個被擋"
P -c "insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions) values ('CC-Q','CC-M','CC-T','CC',12,5,'usable',8)" >/dev/null
mkbk CC-QB1 CC-Q; mkbk CC-QB2 CC-Q
race q "select public.fn_deduct_ticket('CC-Q','CC-QB1','cc');" "select public.fn_deduct_ticket('CC-Q','CC-QB2','cc');"
REM=$(P -c "select sessions_remaining from member_tickets where id='CC-Q'"); NDED=$(P -c "select count(*) from ticket_logs where ticket_id='CC-Q' and action::text='deduct'")
ok "B 確實被 A 擋住等待 ≥2 秒（兩條連線真的重疊；B 等了 $(cat /tmp/cc_q.bt) 秒）" "$(waited q)" "wait=$(cat /tmp/cc_q.bt)"
ok "最終餘額 4（使用量 8＝額度，沒有超扣）" "$([ "$REM" = "4" ] && echo 1 || echo 0)" "rem=$REM"
ok "只有 1 筆 deduct 帳" "$([ "$NDED" = "1" ] && echo 1 || echo 0)" "deduct=$NDED"
ok "B 拿到 TICKET.INSTALLMENT_LOCKED（額度防護）" "$(grep -q 'TICKET.INSTALLMENT_LOCKED' /tmp/cc_q.b && echo 1 || echo 0)" "$(head -c 160 /tmp/cc_q.b | tr '\n' ' ')"

echo "R14a 同一預約兩條連線同時退款 → 只能退一次"
P -c "insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status) values ('CC-R','CC-M','CC-T','CC',6,3,'usable')" >/dev/null
mkbk CC-RB1 CC-R; led CC-R deduct -1 CC-RB1
race r "select public.fn_refund_ticket('CC-R','CC-RB1');" "select public.fn_refund_ticket('CC-R','CC-RB1');"
REM=$(P -c "select sessions_remaining from member_tickets where id='CC-R'"); NREF=$(P -c "select count(*) from ticket_logs where ticket_id='CC-R' and action::text='refund'")
ok "B 確實被擋住等待 ≥2 秒（B 等了 $(cat /tmp/cc_r.bt) 秒）" "$(waited r)" "wait=$(cat /tmp/cc_r.bt)"
ok "只退 1 堂（餘額 4）" "$([ "$REM" = "4" ] && echo 1 || echo 0)" "rem=$REM"
ok "只有 1 筆 refund 帳" "$([ "$NREF" = "1" ] && echo 1 || echo 0)" "refund=$NREF"
ok "B 回 ALREADY_REFUNDED（不是再退一次）" "$(grep -q 'ALREADY_REFUNDED' /tmp/cc_r.b && echo 1 || echo 0)" "$(head -c 200 /tmp/cc_r.b | tr '\n' ' ')"

echo "R14b 退款與另一筆扣課同時發生 → 兩筆都生效、餘額＝原值（不互相覆蓋）"
P -c "insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status) values ('CC-S','CC-M','CC-T','CC',6,3,'usable')" >/dev/null
mkbk CC-SB1 CC-S; led CC-S deduct -1 CC-SB1; mkbk CC-SB2 CC-S
race s "select public.fn_refund_ticket('CC-S','CC-SB1');" "select public.fn_deduct_ticket('CC-S','CC-SB2','cc');"
REM=$(P -c "select sessions_remaining from member_tickets where id='CC-S'")
ok "B 確實被擋住等待 ≥2 秒（B 等了 $(cat /tmp/cc_s.bt) 秒）" "$(waited s)" "wait=$(cat /tmp/cc_s.bt)"
ok "餘額維持 3（+1 與 −1 都生效，沒有被覆蓋）" "$([ "$REM" = "3" ] && echo 1 || echo 0)" "rem=$REM"

skip "R14c benefit_refund 並行雙退（補鎖版）" "測試庫的 benefit_refund 與正式庫版本不同；需先同步正式庫版並套用 20261118_benefit_refund_lock.sql（需授權）後才能測"

cleanup
RES=$(P -c "$RESID_SQL"); NEWHASH=$(P -c "select md5(coalesce(string_agg(id||'|'||coalesce(sessions_remaining::text,'')||'|'||coalesce(unlocked_sessions::text,''),',' order by id),'')) from member_tickets where id not like 'CC-%'")
echo "清理後殘留：$RES（必須 0）；既有票券餘額／額度雜湊與測試前$([ "$BASE_HASH" = "$NEWHASH" ] && echo ' 相同' || echo ' 不同！')"
ok "清理後 CC- 殘留為 0" "$([ "$RES" = "0" ] && echo 1 || echo 0)" "residue=$RES"
ok "既有票券資料未被改動" "$([ "$BASE_HASH" = "$NEWHASH" ] && echo 1 || echo 0)" "hash changed"
echo "結果：PASS=$PASS FAIL=$FAIL SKIP=$SKIP（SKIP 不算通過）"
[ "$FAIL" = "0" ] && exit 0 || exit 1
