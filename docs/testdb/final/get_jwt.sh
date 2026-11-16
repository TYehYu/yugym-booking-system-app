#!/bin/sh
# 用「測試庫專屬測試帳號」的 email＋密碼換登入 JWT，只存進指定的環境檔（權限 600），不印出。
# 用法：sh docs/testdb/final/get_jwt.sh <本機 .env.test> <角色名 DESK|COACH|MEMBER> <email>   （密碼會在終端機隱藏輸入，不會進命令列或對話）
set -eu
ENV_FILE="${1:?}"; ROLE="${2:?}"; EMAIL="${3:?}"
set -a; . "$ENV_FILE"; set +a
case "$SB_URL" in *kucvxpjatptfckhlxptj.supabase.co*) ;; *) echo "SB_URL 不是測試庫，停止" >&2; exit 2;; esac
printf '密碼（輸入不顯示）: '; stty -echo; read -r PW; stty echo; printf '\n'
RES=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data-binary "$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PW")")
TOKEN=$(printf '%s' "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')
[ -n "$TOKEN" ] || { echo "登入失敗（帳號或密碼不對）" >&2; exit 1; }
sed -i.bak "/^JWT_$ROLE=/d" "$ENV_FILE" && rm -f "$ENV_FILE.bak"; umask 077; printf 'JWT_%s=%s\n' "$ROLE" "$TOKEN" >> "$ENV_FILE"; chmod 600 "$ENV_FILE"
echo "已把 JWT_$ROLE 存進 $ENV_FILE（未印出）。JWT 約 1 小時過期，過期請重跑。"
