> 已完成真人UI、真測試庫與官方sandbox開票驗收及全部清除還原，詳見 ACCEPTANCE_COMPLETE.md。以下先前的等待狀態已由此結果取代；仍未發布。

# 首次購買與發票重試補驗（尚未發布）

進度與精確操作見 STATE.md。已完成官方綠界 sandbox 的真HTTP介接，以及實際前端函式的成功回應遺失恢復；首次購買的真人UI與真測試庫持久化尚待隱藏輸入建立驗收登入。

API依據：[綠界B2C發票明細](https://developers.ecpay.com.tw/7923/) 的 RelateNumber、IIS_Number、IIS_Sales_Amount、開立／作廢狀態欄位。只在同編號同額且仍有效時承接原號碼；查詢結果不明不重開。正式 keys 未讀取、未使用。

`stage_provider_report.json`6項、`app_stage_report.json`5項；兩者有真sandbox往返，但後者的資料層是記憶體假資料，不能冒充真人UI／DB驗收。首次購買等待中，請勿發布。
