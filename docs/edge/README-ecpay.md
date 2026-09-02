# 綠界電子發票（B2C）介接筆記

2026-09-02。使用者定案：**只串發票、不串金流**；不用 POS（不要兩套帳）。

## 部署

Edge Function：`ecpay-invoice`（Supabase 專案 rlpiomzplckzqnqrvrwc，`verify_jwt: true`）
原始碼＝本資料夾的 `ecpay-invoice.ts`。

```
supabase secrets set ECPAY_ENV=prod \
  ECPAY_MID=xxx ECPAY_HASHKEY=xxx ECPAY_HASHIV=xxx
```

⚠ **金鑰只能放 secrets**：index.html 是 GitHub Pages 上的公開檔，寫進去等於公開
「用本店統編開發票」的權限。前端只呼叫這一支 Edge Function。

`ECPAY_ENV` 沒設或設成 `stage` 時，會用綠界官方公開的共用測試帳號（2000132）。
設成 `prod` 但 secrets 沒設齊 → 直接擋下來，不會拿測試帳號去開正式發票。

## 已實測通過（2026-09-02，stage）

| 動作 | 結果 |
|---|---|
| 一般開立（紙本 Print=1） | ✅ `LO22002942` |
| 綠界載具（CarrierType=1，預設路徑） | ✅ `LO22002943` |
| 統編發票（CustomerIdentifier） | ✅ `LO22002944` |
| 捐贈（Donation=1 + LoveCode） | ✅ `LO22002945` |
| 作廢 Invalid | ✅ |
| 查詢 GetIssue | ✅（見下方陷阱） |

## 踩過的坑

- **URLEncode 要模仿 .NET**：空白是 `+`、十六進位**小寫**、`- _ . ! * ( )` 不編碼。
  錯一條綠界只回「解密失敗」，訊息看不出是哪裡錯。
- **TransCode 與 RtnCode 是兩件事**：前者是「綠界收下了嗎」，後者才是「發票開成了嗎」。
  只看一個會把「收下了但開立失敗」當成成功。
- **查詢只吃 `RelateNumber`**：文件說可用 `InvoiceNo`+`InvoiceDate`，實測一律回「查無發票資料」
  （兩種日期格式都試過）。RelateNumber 用 `purchases.id`，本來就該用它查。
- **Timestamp 只有 10 分鐘有效**；Unix 秒與時區無關，文件寫的 GMT+8 是他們那端的判讀。
- stage 開立成功後綠界會直接把狀態壓成「已上傳」，不真的送財政部（他們的測試系統常掛），
  所以折讓／作廢測得完整。

## Print / Donation / CarrierType / 統編 的互斥規則

| 情境 | Print | Donation | CarrierType | 統編 |
|---|---|---|---|---|
| 捐贈 | 0 | 1 | 可空 | 必須空 |
| 有統編・無載具 | **1** | 0 | 空 | 有 |
| 有統編・綠界或自然人載具 | **0** | 0 | 1 或 2 | 有 |
| 有統編・手機條碼 | 0 或 1 | 0 | 3 | 有 |
| 只有載具（無統編） | **0** | 0 | 非空 | 空 |
| 什麼都沒有 | **1** | 0 | 空 | 空 |

⚠ email 與 phone **至少要有一個**，不能都空。

## 待辦

- [ ] 字軌下來後：`ECPAY_ENV=prod` ＋ 三個 secrets
- [ ] 前端〔收款〕加載具／統編／捐贈三格
- [ ] 發票號碼寫回 purchases、作廢票券連動作廢發票
