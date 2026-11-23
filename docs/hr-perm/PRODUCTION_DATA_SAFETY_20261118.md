# 正式更新前資料安全檢查 2026-11-18

正式庫 rlpiomzplckzqnqrvrwc 全程唯讀；未發布、未 commit/push。測試庫演練整段 rollback，目前仍是 BASE_B，無人事新物件或夾具。

## 結論

目前驗證未發現 migration 會改寫或刪除既有員工、出勤、薪資歷史或其他業務資料。這是測試庫實測結果，不能等同正式庫更新零風險保證；正式版仍需有交易、前置指紋、更新順序與回復保護。

## 正式庫唯讀檢查

- 員工 14、出勤 489、補卡申請 6（全部 approved）、薪資歷史 205。
- 出勤同員工同日重複 0、異常時間格式 0、空字串時間 0。
- 本批新增函式／檢視／表名稱未被占用。
- 依賴函式與測試庫的差異，移除註解與空白後相同；相關既有觸發器定義相同。
- 共用欄位型別相同；正式庫 duty_matrix、line_notify、birthday_bonus_off 是 NOT NULL，測試庫可 NULL。本批只讀這些欄位、不改寫，不受此差異影響。
- 補卡 requested_by/reviewed_by 正式庫還沒有，2a 新增；回復刻意保留，避免日後丟失資料。

## 發現且修正的缺口

fn_employee_update_general 原本用 role NOT IN (...)，非員工的 role=NULL 使拒絕條件失效。已在測試庫重現成功誤改，整段回滾；正式庫沒有安裝這支函式，沒有執行誤改。
修成 NOT COALESCE(role IN (...), false)，空身分一律拒絕。verify_roles_final.sql 的 D6 納入 member 非員工；修正後教練與非員工皆 AUTH.FORBIDDEN，櫃檯正常修改仍成功。
_v2_combined_*.sql.txt 是歷史草稿，不可拿來正式執行，仍可能含舊漏洞。

## 測試庫資料保留演練

- 拍下所有既有 public 資料表和 auth.users 的筆數與完整逐列內容 hash。
- 完整套用 2a+2b，斷言上述資料完全相同。
- 以沒有員工紀錄的 authenticated 身分呼叫一般欄位更新，必須 AUTH.FORBIDDEN；再斷言所有資料相同。
- 執行 rollback 2b→2a，再斷言所有資料相同。
- 比對函式定義與 ACL、政策、觸發器、欄位、表授權、關聯，回復後與前值相同。
- 最後整段 rollback，沒有永久 DDL、資料或 Auth 變動。
- 初版演練 SQL 的 relkind 字串連接缺顯式轉型，開始快照時即失敗，未套 migration；補 ::text 後整檔成功。

完整角色驗證重跑 151 筆觀測結果，含正常寫入與預期拒絕，結果符合各項預期；刻意 RESULT>> 例外回傳結果並回滾，不把 SQL 錯誤誤認為測試失敗或籠統稱 151 個獨立斷言全過。前端 hrpermtest 33 項通過，git diff --check 通過。

## 上線前仍必須完成

1. 使用者確認主管管轄名單、人事職責名單；維持 admin_implicit_hr=true，不能直接關閉。
2. 製作正式庫環境守門、依賴與來源指紋釘住、交易內提交前比對的發布檔；目前檔案仍為測試 migration，不可直接當正式發布授權。
3. 順序 2a→匯入核准名單→發布前端→各裝置刷新驗證→2b。舊頁面讀名單會缺人，不能當成資料遭刪除。
4. 回復先還原 2b、再退前端；正式運作後 2a 新表含管轄／授權資料，不能直接 drop，需先保存資料並評估仍開啟的新版頁面。

原始 SQL 與結果：/Users/tungyeh/Documents/ChatGPT/YUGYM OS/review-evidence/hr-preservation-rehearsal-20261118.sql、hr-production-safety-preflight-20261118.json。
