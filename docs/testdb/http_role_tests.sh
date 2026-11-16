#!/usr/bin/env bash
# 真實 HTTP（PostgREST）角色權限測試（尚未執行；只能對測試庫）。說明見 http_role_tests.md。
# 需要自備環境變數（不要貼進對話或進版控）：SB_URL（必須是測試庫 https://kucvxpjatptfckhlxptj.supabase.co）、ANON_KEY、
#   JWT_DESK、JWT_MEMBER、JWT_COACH（各角色登入後的 access_token）；有夾具時 FIXTURES=1。
set -u
: "${SB_URL:?}"; : "${ANON_KEY:?}"; : "${JWT_DESK:?}"; : "${JWT_MEMBER:?}"; : "${JWT_COACH:?}"
case "$SB_URL" in *kucvxpjatptfckhlxptj.supabase.co*) ;; *) echo "GUARD: SB_URL 不是測試庫，中止"; exit 2;; esac
PASS=0; FAIL=0; INFO=0
call() { # call <函式> <身分token或anon> <json>  → 設定 CODE／BODY
  local tok="$2"; [ "$tok" = "anon" ] && tok="$ANON_KEY"
  local out; out=$(curl -s -w '\n%{http_code}' -X POST "$SB_URL/rest/v1/rpc/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' -d "$3")
  CODE=$(echo "$out" | tail -1); BODY=$(echo "$out" | sed '$d')
}
expect() { # expect <名稱> <HTTP 碼 regex> <body regex 或空>
  if echo "$CODE" | grep -Eq "^($2)$" && { [ -z "$3" ] || echo "$BODY" | grep -Eq "$3"; }; then echo "  ✓ $1  [HTTP $CODE]"; PASS=$((PASS+1)); else echo "  ✗ $1  → HTTP $CODE  $(echo "$BODY" | head -c 200)"; FAIL=$((FAIL+1)); fi; }
info() { echo "  · INFO $1  → HTTP $CODE  $(echo "$BODY" | head -c 140)（已知測試庫與正式庫 ACL 差異，不判 PASS／FAIL）"; INFO=$((INFO+1)); }
echo "H1 fn_refund_ticket"; call fn_refund_ticket anon '{"p_ticket_id":"x","p_booking_id":"y"}'; expect "anon 不可呼叫" 401 ""
call fn_refund_ticket "$JWT_MEMBER" '{"p_ticket_id":"x","p_booking_id":"y"}'; expect "會員：函式內拒絕" 200 'AUTH.FORBIDDEN'
call fn_refund_ticket "$JWT_DESK" '{"p_ticket_id":"x","p_booking_id":"CC-NOPE"}'; expect "櫃檯＋不存在的預約" 200 'REFUND.NO_BOOKING'
echo "H4/H5 內部函式不對 API 角色開放"
call fn_tk_refund_once "$JWT_DESK" '{"p_ticket":"x","p_booking":"y","p_note":"z"}'; expect "櫃檯不可呼叫 fn_tk_refund_once" 403 ""
call fn_tk_refund_once anon '{"p_ticket":"x","p_booking":"y","p_note":"z"}'; expect "anon 不可呼叫 fn_tk_refund_once" 401 ""
call trg_tk_quota_guard "$JWT_DESK" '{}'; expect "觸發器函式不暴露" '403|404' ""
echo "H6 fn_coach_leave_comp"
call fn_coach_leave_comp anon '{"p_booking_id":"x"}'; expect "anon" 401 ""
call fn_coach_leave_comp "$JWT_MEMBER" '{"p_booking_id":"x"}'; expect "會員" 200 'AUTH.FORBIDDEN'
call fn_coach_leave_comp "$JWT_DESK" '{"p_booking_id":"CC-NOPE"}'; expect "櫃檯＋不存在的預約" 200 'COMP.NOT_FOUND'
echo "H7 fn_move_booking_ticket"
call fn_move_booking_ticket anon '{"p_from_booking":"a","p_to_booking":"b","p_mode":"cancel"}'; expect "anon" 401 ""
call fn_move_booking_ticket "$JWT_MEMBER" '{"p_from_booking":"a","p_to_booking":"b","p_mode":"cancel"}'; expect "會員" 200 'AUTH.FORBIDDEN'
call fn_move_booking_ticket "$JWT_DESK" '{"p_from_booking":"a","p_to_booking":"b","p_mode":"nope"}'; expect "櫃檯＋壞模式" 200 '"ok": ?false'
echo "H10/H11 測試庫與正式庫 ACL 不同（只印觀察值）"
call fn_deduct_ticket anon '{"p_ticket_id":"x","p_booking_id":"y"}'; info "anon 呼叫 fn_deduct_ticket（正式庫預期 401）"
call fn_member_join_group anon '{"p_booking_id":"x","p_ticket_id":"y"}'; info "anon 呼叫 fn_member_join_group（正式庫預期 401）"
if [ "${FIXTURES:-0}" = "1" ]; then
  echo "H8 退票（需要 http_role_tests.md §2 的夾具）"
  call fn_refund_ticket "$JWT_COACH" '{"p_ticket_id":"CC-R","p_booking_id":"CC-RB1"}'; expect "非該堂教練" 200 'REFUND.FORBIDDEN'
  call fn_refund_ticket "$JWT_DESK" '{"p_ticket_id":"CC-R","p_booking_id":"CC-RB1"}'; expect "櫃檯：退 1 堂" 200 '"refunded": ?true'
  call fn_refund_ticket "$JWT_DESK" '{"p_ticket_id":"CC-R","p_booking_id":"CC-RB1"}'; expect "櫃檯再一次：冪等" 200 'ALREADY_REFUNDED'
  echo "H9 額度防護（真實 PATCH）"
  out=$(curl -s -w '\n%{http_code}' -X PATCH "$SB_URL/rest/v1/member_tickets?id=eq.CC-Q" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_DESK" -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d '{"sessions_remaining":3}')
  CODE=$(echo "$out" | tail -1); BODY=$(echo "$out" | sed '$d'); expect "櫃檯直接把餘額 4→3（超過開通額度）被擋" 400 'TICKET.INSTALLMENT_LOCKED'
  out=$(curl -s "$SB_URL/rest/v1/member_tickets?id=eq.CC-Q&select=sessions_remaining" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_DESK"); echo "$out" | grep -q '"sessions_remaining":4' && { echo "  ✓ 被擋後餘額仍為 4"; PASS=$((PASS+1)); } || { echo "  ✗ 被擋後餘額不是 4：$out"; FAIL=$((FAIL+1)); }
else echo "（未設 FIXTURES=1：略過 H8、H9——它們需要夾具）"; fi
echo "結果：PASS=$PASS FAIL=$FAIL INFO=$INFO（INFO 不算通過；請把 FAIL 與 INFO 原樣貼回驗收）"; [ "$FAIL" = "0" ] && exit 0 || exit 1
