# Numbers 本機匯入摘要

來源：`/Users/huangboyu/Desktop/high_roster_export_temp.xlsx`

產生方式：

```bash
python3 src/import/extract_workbook.py \
  --input /Users/huangboyu/Desktop/high_roster_export_temp.xlsx \
  --output public/local-data/numbers_import_latest.json \
  --summary-output data/reports/numbers_import_summary.json
```

完整輸出 `public/local-data/numbers_import_latest.json` 含真實學生與帳務資料，已被 `.gitignore` 排除，不得 commit。

Firebase 匯入批次：

```text
numbers-20260524-0105
```

已寫入 `bearhigh` RTDB：

```text
accounting/importBatches/numbers-20260524-0105
accounting/currentImportBatchId
```

公開 GitHub Pages 不部署 `public/local-data/numbers_import_latest.json`；線上版登入後改從 RTDB 讀取。

## 目前匯入結果

| 類型 | 數量 |
| --- | ---: |
| 學生/學費分頁 | 4 |
| 老師/薪資分頁 | 7 |
| 學生列 | 1018 |
| 學費/繳費/抵扣/備註/退費欄位 | 8009 |
| 老師名單區塊 | 42 |
| 老師名單列 | 1700 |
| 老師薪資/月堂數區塊 | 83 |
| 老師薪資/月堂數列 | 1186 |

## 學生分頁

| 分頁 | 學生列 | 課程勾選 | 學費欄位 | 有學費列 |
| --- | ---: | ---: | ---: | ---: |
| 114學年度(111高一) | 242 | 911 | 2028 | 159 |
| 113學年度(110高二) | 411 | 1276 | 3063 | 172 |
| 112學年度(109高三) | 365 | 1214 | 2918 | 175 |
| 空白 | 0 | 0 | 0 | 0 |

## 老師分頁

| 分頁 | 名單區塊 | 名單列 | 薪資區塊 | 薪資列 |
| --- | ---: | ---: | ---: | ---: |
| 化學師資 | 9 | 437 | 11 | 212 |
| 物理師資-Nick | 7 | 372 | 11 | 155 |
| 英文師資 | 6 | 322 | 15 | 175 |
| 數學師資-明軒 | 9 | 315 | 12 | 215 |
| 數學師資-黃浩 | 10 | 247 | 12 | 223 |
| 社會師資-蔣明 | 1 | 7 | 11 | 66 |
| 國文師資 | 0 | 0 | 11 | 140 |

## 還不是最終格式

目前是 raw normalized snapshot，適合線上看資料形狀與核對欄位；尚未把老師薪資列轉成正式 payroll run / Excel 匯出格式。
