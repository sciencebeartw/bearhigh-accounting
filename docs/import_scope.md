# 匯入範圍

高中帳務匯入不是單一分頁匯入，也不是高二專案。

第一版就要支援全 cohort dry-run：

- 國三升高一。
- 高一升高二。
- 高二升高三。
- 高三既有資料。
- 老師/師資/薪資參考分頁。

## 快照批次

匯入單位是 snapshot batch。

```text
snapshotBatch
  id
  sources[]
  exportedAt
  workbookSheets[]
  googleSheetTabs[]
  cohorts[]
  dryRunReport
  approvedBy
  approvedAt
```

一個 batch 可以有多個來源，例如：

- `高中部學生名冊.numbers` 匯出的 `.xlsx`
- `114學年 山熊升大 學生名單` Google Sheet
- 未來國三升高一招生表單或銜接課程名單

## Parser 原則

- parser 不得 hard-code 只讀 `113學年度(110高二)`。
- 高二升高三尾列只作合報分攤 golden sample。
- 所有 cohort 都要產生欄位結構與疑點報告。
- 國三升高一若來源不同，也應轉成同一個 normalized import record，再進入 dry-run。

## Dry-run Report 必須包含

- 每個來源檔案與分頁。
- 每個 cohort 的學生數與課程欄位。
- 新增/消失學生。
- 課程勾選變化。
- 學費總額變化。
- 合報套餐辨識與各科分攤。
- 高二升高三 golden sample 驗證。
- 國三升高一 / 高一升高二 / 高二升高三之間欄位差異。

## 寫入 Firebase 前

未經使用者確認 batch，不寫 Firebase。

寫入時必須保留：

- `importBatchId`
- 原始來源檔名/分頁
- 原始 row/column 座標
- 正規化後資料
- dry-run 差異摘要

