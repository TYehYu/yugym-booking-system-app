# 在公司繼續製作的流程

這份文件是給你之後在公司打開 Codex、繼續修改預約系統時使用。

## 你要先知道的事

目前系統分成兩種東西：

- 程式碼：畫面、功能、規則，適合用 GitHub 同步。
- 營運資料：會員、預約、票券、儲值紀錄，正式要用 Supabase 同步。

也就是說，GitHub 會幫你把「系統本身」帶到公司電腦，但不會自動帶走每台瀏覽器本機儲存的會員資料。

## 家裡電腦完成後

1. 確認畫面測試正常。
2. 用 GitHub Desktop 檢查變更。
3. 不要勾選真實會員 Excel、CSV 或任何私人資料。
4. Commit。
5. Push 到 GitHub。

建議 commit 訊息可以寫：

```text
Update booking system prototype
```

## 公司電腦第一次使用

1. 安裝 GitHub Desktop。
2. 登入同一個 GitHub 帳號。
3. Clone 這個 repository：

```text
TYehYu/yugym-booking-system
```

4. 用 Codex 開啟 clone 下來的專案資料夾。
5. 點兩下 `開啟預約系統.bat`。
6. 用瀏覽器打開：

```text
http://127.0.0.1:8765/index.html
```

## 公司電腦之後每次使用

1. 先打開 GitHub Desktop。
2. 按 `Fetch origin`。
3. 如果有更新，按 `Pull origin`。
4. 打開 Codex。
5. 打開同一個專案資料夾。
6. 點兩下 `開啟預約系統.bat`。

## 回家後要接續公司進度

1. 在公司先 commit 與 push。
2. 回家打開 GitHub Desktop。
3. 按 `Fetch origin`。
4. 按 `Pull origin`。
5. 再打開 Codex 繼續改。

## 如果瀏覽器資料不同步

這是正常的。

原因是目前資料仍主要存在每台瀏覽器本機，例如：

- 家裡 Chrome。
- 公司 Chrome。
- Codex 內建瀏覽器。

它們各自保存資料，不會自動共享。

正式要讓家裡、公司、員工都看到同一份資料，需要完成 Supabase 串接。

## 推薦下一步

低風險順序如下：

1. 先用 GitHub 同步程式碼。
2. 展示版保留假會員資料。
3. 完成 Supabase 第一階段同步。
4. 再做員工端與會員端。
5. 最後加入登入、權限與正式報表。
