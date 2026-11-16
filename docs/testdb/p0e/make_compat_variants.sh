#!/usr/bin/env bash
# 產生「以 authenticated 身分重跑」的既有 SQL 測試變體（不改原檔、輸出到指定目錄；變體不進版控）。
# 用法：bash make_compat_variants.sh <輸出目錄>   然後把變體的內容貼到測試庫執行（需授權；測試庫需先裝 p0e_13）。
set -eu
OUT="${1:?請給輸出目錄}"; mkdir -p "$OUT"; HERE="$(cd "$(dirname "$0")" && pwd)"
CLAIMS="  perform set_config('request.jwt.claims', json_build_object('sub',(select auth_id from employees where role::text='front_desk' and auth_id is not null limit 1),'role','authenticated')::text, true);"
for f in p0e_05_sql_tests.sql p0e_08_p0c_regression_tests.sql "$HERE/../p0c/move_ticket_01_sql_tests.sql"; do
  b="$(basename "$f")"; src="$HERE/$b"; [ -f "$src" ] || src="$f"
  # 在庫識別守門（第一個 raise exception 'TESTDB.GUARD…' 的 end if 之後）注入身分
  awk -v c="$CLAIMS" '{print} /TESTDB\.GUARD: 看起來像正式庫/ {g=1} g==1 && /end if;/ {print c; g=2}' "$src" > "$OUT/authenticated_$b"
  echo "寫出 $OUT/authenticated_$b（$(grep -c 'request.jwt.claims' "$OUT/authenticated_$b") 處注入）"
done
