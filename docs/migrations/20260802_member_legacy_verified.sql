/* 新舊系統票券核對（2026-08-02 使用者指示）：
   「在主顧客新增一個完成連動的按鈕，讓櫃檯手動確認，確認新舊資料還可以用的票券是否一樣」
   已套用到正式庫。

   alter table members add column legacy_verified_at timestamptz, legacy_verified_by text;

   ・「主顧客」＝制度起點時從舊系統匯入的那批既有會員（見 TIER_START 起點條款）
   ・匯入的餘額是照舊系統匯出檔設的、逐堂連結多半不存在 → 帳面對不對只能靠人看
   ・這兩欄純記錄「誰、什麼時候按了完成連動」，不影響任何計算
*/
