# 階段 12 rev7 發布前驗證（2026-11-17，測試庫 `kucvxpjatptfckhlxptj`；正式庫只做唯讀）

本體 md5：rev5 `cdae07ef…` → rev6 `0637e6b6…`（共享票）→ **rev7 `550c28a816b6e46f636287d7fa33405a`**（已不可用的票名單異常不擋）。rev6／rev5 的證據對 rev7 以下面的重跑為準。

## 1. 用 rev7 的套用／唯讀驗證／回復檔完整演練
暫裝 06／08／11（指紋：階段 11 adopt `05c51530…`／state `22edb0f9…`／month `e7152b65…`；06 trigger `999c8ef0…:753`）→ 唯讀驗證 PRE 全 true（含 `fn_tk_shared_has` md5 `0d0d61af…`）→ **rev7 演練版套用檔**（`rehearsal/12_hold_settle_apply_TESTDB_REHEARSAL.sql`，只差叢集識別）：交易內後置核對全過（security definer＋search_path、本體 md5 `550c28a8…`、ACL＝`{postgres=X/postgres,authenticated=X/postgres}`、其餘函式／policies／grants／觸發器／資料表指紋不變）→ 觀測函式 `zz_hs_fingerprint` 回 settle md5／ACL 吻合。
回復演練：①未設定任何閘 → `HS.RB: 未宣告前端已退版`，函式仍在；②只設前端已退版 → 缺授權紀錄而停（此項用縮短版守門區塊，只示範兩個設定缺一不可）；③第一次完整執行被「有其他函式引用它」擋下——引用者是測試用 `zz_hs_*`（正式庫沒有），移除後重做；④兩個設定都帶 → 函式移除，**其餘函式簽章前後相同 `c9601c76…`**。回復檔明寫設定不是授權。
註：演練用的授權字串是「TESTDB-REHEARSAL（測試庫演練，非正式授權）」。

## 2. CC1–CC6 真並行（`hold_settle_conc_report_rev7_CC1-CC6.json`）
`HS_CONC_COMPLETE`，**51 通過／0 失敗**；清除後基準比對乾淨。第一次重跑在 CC6 夾具建立時因卡位代號 `G` 與 CC4b 重複而中止（我的筆誤，非函式問題；該次報告 43/1，CC1–CC5 全過），改代號 `SHR` 後重跑。
CC6（共享票並行）：預覽 1 轉正／2 defer／0 取消 → 另一個交易鎖住共享票並用到 0 堂 → 整理端等票券列鎖（持鎖者在交易內看到對手被擋、等的是持鎖者的 txid，pid 不同、整理端在持鎖者結束後才完成）→ 回 `PLAN_CHANGED`、整批停止；沒有轉正／取消／扣課、新票餘額仍 1、共享票 0、帳本無新紀錄；重新預覽才變成 1 轉正／2 取消。

## 3. 已不可用的票、共享名單異常（SH13／SH14，`hold_settle_tests_shared.sql` 現 15 案例）
- **rev6 的實際影響**（把已裝函式反向還原成 rev6、核對 md5 `0637e6b6…` 後跑）：別人名下一張 `used_up` 的票名單寫成 `abc`／`[bad`，整批整理回 `UNVERIFIABLE_OTHER`（`SHARED_UNREADABLE`），連正常的最近一堂轉正都做不了＝過度擋（安全方向，但沒必要）。
- **結論與修正（rev7）**：已不可用的票本來就不會被拿來承接 → 名單異常**不擋**；名單判讀與確認指紋只看「可用（usable）」的共享票。**可用**的票名單壞掉（含轉型會丟錯的 `[bad`）→ 仍擋整批，回 `UNVERIFIABLE_OTHER`（不是 `SETTLE.FAILED`），一筆不動（SH14）。
- rev7：15／15 通過（SH1–SH14 加 SH13）。
- 補記一個我寫 rev7 時的筆誤：sig 查詢多了一個右括號，在裝進測試庫之前就被我自己的核對抓到並修正（md5 因此是 `550c28a8…` 而不是先前的 `9d154345…`）。

## 4. 櫃檯畫面：共享票能承接
夾具 S4：會員 3 堂待簽約卡位，別人名下共享給他的同票種票 5 堂。櫃檯從會員明細「＋儲值」賣單堂教練課 → 不開發票 → 業績歸屬 → 確認收到 → 跳出「卡位整理」：轉正 11/18；「可由其他票券（含別人共享給他的票）承接，先不動（不扣、不取消）：11/19、11/20」。確認前資料不動；按確認後：11/18 綁新票（新票 0/1、deduct 1 筆）、11/19 與 11/20 仍 `booked`／待簽約／未綁票、無取消；**共享票 5/5、帳本 0 筆**。先前 A／B 發票入口的點擊證據保留（`SALE_ENTRY_ACCEPTANCE_20261117.md`）。
夾具腳本這次報告 `FAILED`（`sale_seed_report_S4_shared_FAILED_baseline_artifact.json`，原樣保留）：基準是在暫補方案／欄位存在時拍的，我先移除它們才按 Enter，比對看到「course_plans 少 1 筆、member_tickets／purchases 列雜湊變」——是暫補物件造成的假差異，不是殘留。獨立查證：CC-HS／CC-EMP 殘留各表 0、`booking_op_rev` 57（清除順序修正有效）、方案回原狀。

## 5. 拆除與基準（測試庫）
`phase_teardown_testdb.sql`（階段 12 的 drop 改 `if exists`）：階段 06／08／11 全拆、month guard／refund_once 還原為原版。核對：函式 60 `46734cf8…`、policies `1450d890…`、grants 799 `9c771db5…`、觸發器 21 名稱指紋 `ec1249d9…`、**觸發器定義指紋 `226110be…`（與上一輪拆除後值相同）**、資料表 `b73ccaa0…`、列數 57／26／29／0／0、course_plans 3、各類殘留 0、暫補欄位 0、Auth 6、`fn_hold_month_guard` `9b10b9c5…`、`fn_tk_refund_once` `cc6de55f…:1156`。

## 沒有做的
rev7 沒有重跑：手動轉正 D1–D7 與發票入口 A／B 的畫面點擊（改動只在「其他票」判定，轉正／扣堂／取消寫入段與前端流程沒動；入口 A／B 證據是 rev5）、06／08／11 組合整套 32 案（只重跑 CC1–CC6 與共享票 15 案）。請 Codex 複審決定。
