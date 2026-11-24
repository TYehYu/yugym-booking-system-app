# YUGYM UI 規格 v1（2026-11-24）

統一介面第 1 批。基準＝新版員工管理。**這一批只新增規格，不改任何既有畫面**；後續各頁、各視窗逐批改用。
規格原始碼在 `index.html` 的 `/*UI-SPEC:BEGIN*/ … /*UI-SPEC:END*/`；預覽：`node docs/ui-spec/build-preview.js` 後開 `docs/ui-spec/preview.html`。

## 命名規則
所有新 class 以 `ui-` 開頭、變數以 `--ui-` 開頭，**不碰任何既有名稱**。新畫面一律用這套，不再新增行內寫死的顏色、圓角、字級。

## 設計變數
| 類別 | 變數 | 值 |
|---|---|---|
| 品牌綠 | `--ui-brand` / `-strong` / `-soft` | #245b46 / #1b4636 / #e6eee8 |
| 狀態 | `--ui-warn-bg/fg`、`--ui-danger(-soft)`、`--ui-info-bg/fg` | 金黃、紅、藍 |
| 文字 | `--ui-text` / `-2` / `-3` | #2d241c / #6a655c / #948f84 |
| 邊線與底 | `--ui-line` `--ui-line-strong` `--ui-surface` `--ui-bg` `--ui-bg-2` | #deddd5 / #b9b5a8 / #fff / #faf7f0 / #f1eee5 |
| 字級（7 級） | `--ui-fs-1…7` | 11 12 13 14 16 18 22 |
| 圓角（4 級＋膠囊） | `--ui-r-sm/md/lg/xl/pill` | 8 12 16 22 999 |
| 間距 | `--ui-sp-1…5` | 4 8 12 16 24 |
| 高度 | `--ui-h` / `--ui-h-sm` | 44 / 36 |

## 元件
- **按鈕** `.ui-btn` ＋ `--primary`（確認、儲存）`--danger`（刪除）`--danger-soft`（作廢類）`--link`（次要連結）`--sm` `--block`。次要按鈕是白底深邊框。
- **輸入框** `.ui-input` `.ui-select` `.ui-textarea`，欄位用 `.ui-field`（標籤 `.ui-label`、說明 `.ui-help`），並排用 `.ui-field-row`，勾選用 `.ui-check`。
- **卡片** `.ui-card`（標題 `.ui-card__title`），提示 `.ui-note`／`.ui-note--warn`。
- **頁籤** `.ui-tabs` ＋ `.ui-tab[aria-selected=true]`，窄螢幕可橫向捲動。
- **標籤** `.ui-badge`（預設綠）`--warn` `--danger` `--info` `--muted`。
- **視窗** 放進 `showModal()` 的內容：開頭放一個 `<div class="ui-modal"></div>` 當標記（會把外層改成規格外觀），標題 `.ui-modal-title`、副標 `.ui-modal-sub`、內容 `.ui-modal-body`、底部按鈕 `.ui-modal-foot`。
  ⚠ 底部按鈕列用 `.ui-modal-foot`，**不要用 `.modal-foot`**：手機版 `.modal-foot` 有浮動透明底欄的特殊規則，自訂按鈕會看不見（2026-11-24 薪資條件視窗踩到）。
- **表格式輸入列** `.ui-gridrow`＋`--tier`／`--bonus`／`--team`（欄頭用 `.ui-gridhead` 搭同一個 modifier，欄寬一致），刪除鈕用 `.ui-btn--icon`。
- **全店共用區塊** `.ui-card--shared`＋`.ui-sharedhead`；版本／範本狀態列 `.ui-verrow`。
- **寬視窗** 標記改成 `<div class="ui-modal ui-modal--wide"></div>`（桌機最寬 680）。
- **空狀態** `.ui-empty`。

## 遷移原則（第 2 批起）
1. 一頁一個 commit，可單獨退回。
2. 先換外殼（頁首、卡片、頁籤），再換按鈕與輸入框，最後換視窗。
3. 舊 class 在整頁換完、確認沒人用之前不刪。
4. 每批都附對照截圖與測試。
