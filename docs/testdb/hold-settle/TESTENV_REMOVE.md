# 測試庫暫裝環境的拆除與基準核對（跑完執行器、或放棄時使用）
拆除順序（全部在測試庫 kucvxpjatptfckhlxptj）：
1. `phase_remove_hs_zz.sql`（zz_hs_call、zz_hs_fingerprint）
2. drop `fn_hold_settle_new_ticket(text,boolean,text,jsonb)`
3. 階段 11：drop 三個觸發器（trg_bookings_hold_state_guard、trg_contract_window_ins、trg_contract_window_upd）與函式（fn_contract_adopt_holds、trg_contract_window_booking、fn_contract_window_check、fn_hold_state_guard）；`fn_hold_month_guard` 還原成測試庫原版（本體 md5 `9b10b9c5e488b65e7771eb62676883c9`）
4. 階段 08：drop 四支函式＋`fn_booking_rev_of`＋`trg_booking_op_rev`＋兩個觸發器、drop 表 `ticket_deduct_ops`、`booking_op_rev`
5. 階段 06：drop 觸發器 `trg_tk_quota_guard`、函式 `trg_tk_quota_guard`、`fn_refund_ticket`；`fn_tk_refund_once` 還原原定義（`pg_get_functiondef` md5 `6d0f7214b1a8b4ce1d14b4f781723325`）
6. 核對基準（暫裝前＝拆除後必須一致）：函式 60 `46734cf88d702e404332127c784268c4`、policies 70 `1450d8903a3fa15260e40e642e0e07e6`、grants 799 `9c771db5a3c87da43142351da9ac6e3d`、觸發器 21 `ec1249d99b7a0b52efca5734d42d546d`、資料表 29 `b73ccaa06dea56ea8480fecc35d74332`、列數 bookings／member_tickets／ticket_logs／contracts／ticket_grant_requests＝57／26／29／0／0；另核對沒有 ZZ／CC-HS／CC-EMP 殘留（bookings、member_tickets、members、employees、ticket_types）與登入帳號數量。
執行器結束時自己會清掉它建立的資料與登入帳號並比對基準；上面是「函式層」的拆除，由 Claude 在測試庫執行。

## 執行紀錄
- 2026-11-17：已依上列步驟拆除（單一交易腳本 `phase_teardown_testdb.sql`），基準指紋逐項吻合，見 `evidence/SALE_ENTRY_ACCEPTANCE_20261117.md` 第四、五節。觸發器 21 的指紋公式：`md5(string_agg(tgname,'|' order by tgname))`（所有 schema 非 internal 觸發器）。
