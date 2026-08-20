# 測試工具（2026-07-26 建立）

每支測試都**從 index.html 抽出真正的原始碼**執行（非複製貼上的副本），
搭配正式庫真實案例的 fixture。改動對應邏輯後跑對應套件即可。

執行：`node tests/<檔名>.js`（部分套件用相對路徑讀 index.html，請在 repo 根目錄執行）

| 檔案 | 涵蓋 | 項數 |
|---|---|---|
| gtest.js | 團課明細名單（多位子合併、圓點、請假鈕） | 30 |
| ltest.js | 團課請假／補課券邏輯 | 17 |
| ttest.js | ticketTokens 圓點渲染 | 11 |
| feetest.js | 銷課金額 _bkFee | 9 |
| revtest.js | 儲值營收 helpers | 9 |
| ptest.js | 預約明細推估票券卡（含視窗滑動、李唯案例） | 42 |
| utest.js | 會員卡已用堂數（三訊號） | 14 |
| reacttest.js | 票券分區／重新啟用／折抵券分頁 | 24 |
| synctest.js | allocBookingsToTickets（FIFO、容量、教練課系相容） | 29 |
| sharetest.js | 票券共享（tkUsableBy、挑票、退堂） | 26 |
| fullcompare.js | 全會員卡面 vs 舊系統比對（一次性，任務已結束；需匯出檔，缺檔會自己跳過） | — |

共 211 項。

**fullcompare 已功成身退**（2026-08-20）：舊系統的帳由櫃檯手動對齊完成，不再做總整理對帳。
腳本保留當參考——它需要 tickets2.json／bookings2.json／old_map.json（真實會員資料，不進版控），
缺檔時會印一行「跳過」並正常結束，所以跑全套時它不會算失敗。
