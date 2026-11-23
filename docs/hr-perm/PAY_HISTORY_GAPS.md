# 歷史薪資「仍會隨現行設定回算」的缺口（2026-11-22 盤點、同日補三個入口；**不能宣稱已全面保護，也不是月結快照系統**）

依據：整合樹 `index.html`（`PAY_RULE_KEYS`、`empAtMonth`、`empPayConfig`、`calcSalary`、`leaderBonusOf`）與寫入員工資料的函式掃描。

## 已保護（有 `payRulesPreserveHistory`，缺歷史就零寫入、不猜）
`stApplyEmpType`（改僱用別）、`saveHrSalary`（個人薪資）、`saveInsurance`（投保）、**（2026-11-22 新增）`stPickSet`（職務切換、打卡／值班）、`stCardToggle`（主管／督導旗標）、`saveSchedule`（排班設定）**——三者都改走 `payRulesApplyNow`：本月起生效、過去月份凍結、本月與未來月份快照同步；缺歷史就零寫入。測試：`tests/payhistoryentrytest.js`（22 項）。DB 端 `fn_set_employment_type` 自己會留上月快照。

## 缺口（仍會用現行值回算過去月份）
| # | 缺口 | 為什麼 | 影響 |
|---|---|---|---|
| 1 | **全域薪資模板**（`window.SALARY_TPL`，`empPayConfig` 的 fallback） | 員工個人欄位為空時，費率／底薪／值班時薪退回「該僱用別的模板現值」；快照只存當時「有值」的欄位 | 改模板 → 沒有個人值的人，**過去月份**金額跟著變 |
| 2 | **全店主管獎金與團隊獎金門檻**（`leaderBonusOf` 的 `G`：`supervisor_bonus`、`team_tiers`、`leader_per_*`、`leader_t1…`） | 讀的是算薪當下的全域設定，未版本化（七月前舊制、九月起團隊制只靠日期切換） | 改全店設定 → 過去月份主管獎金重算 |
| 3 | **生日禮金開關與生日**（`birthday_bonus_off`、`birthday` 不在 `PAY_RULE_KEYS`；2026-10-03 刻意設計，`hrsalsrctest` 釘住，未更動） | 算薪用員工現值判定「生日月」 | 關／開開關、改生日 → 過去月份禮金變動 |
| 4 | ~~未受保護的三個寫入入口~~ **已補（見上）** | — | 唯一例外：`saveSchedule` 的生日禮金開關仍寫現值（見 #3） |
| 5 | 最早快照之前的月份 | `empRuleAt` 找不到「不晚於該月」的快照就回傳現值 | 舊資料缺歷史 → 用現值，不是當時值（保護函式遇到缺漏會拒絕，不會自動填現值） |
| 6 | 已發布／已核對的月薪沒有「鎖定快照」 | 目前沒有薪資單／月結鎖定機制（`pay_publish` 職責只有授權紀錄） | 任何上述缺口都可能讓「已對過的月份」數字改變 |

## 範圍外但相關
- `salary_history` 是匯入的歷史月薪（唯讀 205 列），與上面「即時回算」是兩條路：它不受缺口影響，但目前只有管理員／pay_view／本人讀得到（2b）。
- DB 層守門（`docs/hr-pay-history/install_test.sql`）只是**測試用**，沒有正式守門檔、版本指紋與回復檔，不在這次整合範圍。

## 建議（待你決定，這輪沒做）
1. ~~補 #4 的三個入口~~ 已完成（本輪）。
2. #1～#3 需要「月結快照」：把當月實際用到的模板值／全店設定／生日判定存進該月快照，再讓 `empPayConfig`／`leaderBonusOf` 優先讀快照。這是設計變更，要另案。
3. 發布前整理並由你確認：哪些員工缺歷史資料（不可自動填成現值）。
