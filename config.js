// ── YUGYM 雲端設定範本 ──
// 1. 把這個檔案改名為 config.js，與 yugym-mvp-supabase.html 放同一層
// 2. 填入你的 Supabase 專案 URL 與 anon public key
// 3. 在 yugym-mvp-supabase.html 的 <head> 取消這行註解：
//      <!-- <script src="./config.js"></script> -->
// 設定後即進入「雲端模式」（多人共用同一份資料）；
// 不設定（或刪掉 config.js）則維持「本機 demo 模式」（IndexedDB，單機）。

window.YUGYM_CONFIG = {
  url:     'https://rlpiomzplckzqnqrvrwc.supabase.co',
  anonKey: 'sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX'
};
