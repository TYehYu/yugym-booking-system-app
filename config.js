// ── YUGYM 雲端設定範本 ──
// 1. 把這個檔案改名為 config.js，與 yugym-mvp-supabase.html 放同一層
// 2. 填入你的 Supabase 專案 URL 與 anon public key
// 3. 在 yugym-mvp-supabase.html 的 <head> 取消這行註解：
//      <!-- <script src="./config.js"></script> -->
// 設定後即進入「雲端模式」（多人共用同一份資料）；
// 不設定（或刪掉 config.js）則維持「本機 demo 模式」（IndexedDB，單機）。

window.YUGYM_CONFIG = {
  // 本機開發指向測試庫 yugym-sprint3-test（受 git update-index --skip-worktree 保護，不進版控）
  // 正式庫（Pages 部署用）：https://rlpiomzplckzqnqrvrwc.supabase.co / sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX
  url:     'https://kucvxpjatptfckhlxptj.supabase.co',
  anonKey: 'sb_publishable_cIN7ARSL23vwv8YVJxYIlw_eJVGXT6l',
  // ── LINE 會員入口（feature flag：填了才顯示「用 LINE 登入」按鈕；後端驗 token 只用 Channel ID）──
  // Channel Secret 不放這裡（若需要，存 Supabase Edge Function secret）。這兩個是公開值。
  lineLiffId:          '2010821438-e2Kcw1Ca',
  lineLoginChannelId:  '2010821438'
};
