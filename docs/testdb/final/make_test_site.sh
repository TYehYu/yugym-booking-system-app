#!/bin/sh
# 建立「只指向測試庫」的兩個本機站：新前端（本分支）與舊前端（origin/master），不改正式 config.js、不進版控、不印出金鑰。
# 用法：sh docs/testdb/final/make_test_site.sh <本機 .env.test 路徑> [輸出目錄]
# .env.test（repo 之外、權限 600）：SB_URL=https://kucvxpjatptfckhlxptj.supabase.co ／ ANON_KEY=<測試庫 publishable key>
# 之後：cd <輸出目錄>/new && python3 -m http.server 8101 ；另一個終端機 cd <輸出目錄>/old && python3 -m http.server 8102
set -eu
ENV_FILE="${1:?缺 .env.test 路徑}"; OUT="${2:-${TMPDIR:-/tmp}/yugym-test-site}"
set -a; . "$ENV_FILE"; set +a
case "$SB_URL" in *kucvxpjatptfckhlxptj.supabase.co*) ;; *) echo "SB_URL 不是測試庫，停止" >&2; exit 2;; esac
mkdir -p "$OUT/new" "$OUT/old"
REPO="$(git rev-parse --show-toplevel)"
cp "$REPO/index.html" "$REPO/manifest.json" "$REPO/icon-192.png" "$REPO/icon-512.png" "$OUT/new/" 2>/dev/null || cp "$REPO/index.html" "$OUT/new/"
git -C "$REPO" show origin/master:index.html > "$OUT/old/index.html"
for d in new old; do
  cat > "$OUT/$d/config.js" <<CFG
window.YUGYM_CONFIG = { url: '$SB_URL', anonKey: '$ANON_KEY', lineLiffId: '', lineLoginChannelId: '' };
CFG
  : > "$OUT/$d/sw.js"   # 不註冊 service worker 快取，避免測試時吃到舊檔
  chmod 600 "$OUT/$d/config.js"
done
echo "已建立：$OUT/new（新前端）、$OUT/old（舊前端；兩者都只指向測試庫）。config.js 權限 600，內含公開 key，請勿提交。"
