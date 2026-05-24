# 高中帳務

高中部學費、合報分攤、學生加入/退出異動與老師薪資表輸出工具。

本專案先獨立於 `bear-admin/high` 與 Dashboard 開發。`bear-admin/high` 維持家長/學生查詢端；行政老師點名也先維持 Google Sheet。這裡只解決使用者本人每月最痛的帳務與老師薪資整理流程。

Firebase 專案也獨立使用 `bearhigh`，避免開發期與 `sciencebear-admin` 正式行政資料互相污染。

## 第一階段目標

1. 讀取高中部學生名冊 Numbers 匯出的 `.xlsx` 快照。
2. 全 workbook 掃描，不只支援高二。
3. 解析學費欄位、合報尾列、老師薪資/師資分頁格式。
4. 依 Google Sheet `學費定價表` 規則重算合報分攤。
5. 產生 dry-run / diff report；確認前不寫 Firebase。
6. 後續輸出與現有老師薪資表一致格式的 Excel/Sheet。

## 目前可跑版本

第一版本機工作台已建立在 `public/`：

- 學費登記：學生、cohort、學校、課程、實收金額、額外合報優惠、抵用券、手動折扣、備註。
- 分攤計算：支援舊制 `16800` 與今年度調漲制 `21600` 的一般 24 堂級距。
- 金額模型：保留原價、內建合報優惠、額外合報優惠、抵用券、手動折扣、實收與各科實際收入。
- Golden sample：支援生地 `12000`、自然全科 `52000`、明軒數自全報 `77000`、黃浩數自全報 `77000`。
- 送出防呆：未選課、特殊套餐課程不一致、負數或無效金額都不能記入。
- 月底異動：可先記錄某班某日期第幾堂學生加入/退出。
- 老師薪資草表：可先用堂數、鐘點與調整金額產生小計。
- 老師薪資試算：可選 Numbers 匯入的老師名單區塊，依每位學生 `單堂`、本月堂數、加入/退出異動、分潤比例或固定鐘點產生試算，並可匯出 CSV 或 Excel 可開啟的正式薪資表 `.xls`。
- 堂次日期表：薪資試算可為每個老師名單區塊與月份儲存一組本月上課日期；進退班異動若未填第幾堂，會用異動日期自動推算從哪一堂開始加入或退出。堂次日期必須依序遞增且數量需等於本月堂數，避免錯算。
- 學生資料中心：可依學生、分頁/cohort、班級/課程、繳費狀態與同名風險查詢。
- CRM 檔案：學生明細可看基本資料、課程、學費欄位、手動學費、進退班異動、追蹤備註與時間軸。
- 班級名單：選定班級/課程後可查看該班名單與指定月份的加入/退出異動，並匯出 CSV。
- 匯出：本機草稿 JSON 與學費分攤 CSV。

目前已接上 Firebase Google Auth 與 `bearhigh` RTDB：

- 未登入時仍可用本機 `localStorage` 草稿。
- 登入 `neatnelsonhuang@gmail.com` 後可讀取雲端匯入快照。
- 線上新增的學費、異動、薪資草表會同步到 `accounting/manual/*`。
- 線上新增的學生 CRM 狀態與追蹤備註也會同步到 `accounting/manual/studentProfiles` 與 `accounting/manual/studentNotes`。
- 線上新增的堂次日期表會同步到 `accounting/manual/courseSessionPlans`，用於月底薪資試算的日期轉堂次。
- 登入後會讀回雲端 `accounting/manual/*`，避免換裝置後看不到先前手動紀錄。
- `public/js/firebase-config.mjs` 不納入 Git；GitHub Pages 由 Actions 變數 `BEARHIGH_FIREBASE_API_KEY` 在部署時產生。

```bash
npm test
npm run start
```

本機網址：

```text
http://127.0.0.1:4173
```

前端網址走 GitHub Pages；`bearhigh` 只作資料庫 / Auth。

```text
https://www.sciencebear.com.tw/bearhigh-accounting/
```

## Numbers 本機匯入

目前可從 Numbers 匯出的 `.xlsx` 建立本機快照：

```bash
python3 src/import/extract_workbook.py \
  --input /Users/huangboyu/Desktop/high_roster_export_temp.xlsx \
  --output public/local-data/numbers_import_latest.json \
  --summary-output data/reports/numbers_import_summary.json
```

`public/local-data/numbers_import_latest.json` 會包含真實學生與帳務資料，已被 `.gitignore` 排除，不得 commit。開本機工作台後，到「匯入」頁籤可載入這份快照。

若要產生 Firebase 匯入 payload：

```bash
python3 src/import/build_firebase_import.py \
  --input public/local-data/numbers_import_latest.json \
  --output data/snapshots/firebase_import_update.json \
  --batch-id numbers-20260524-0105
```

`data/snapshots/firebase_import_update.json` 同樣包含真實資料，已被 `.gitignore` 排除，不得 commit。

目前匯入範圍：

- 學生/學費分頁：學生基本資料、課程勾選、學收、抵扣/抵用、繳費日期、退費、備註。
- 老師/薪資分頁：老師名單區塊、月薪資/堂數區塊的 raw rows。

## 安全原則

- 不直接讀寫正在編輯中的 `.numbers` 原檔。
- 每次匯入先建立快照，再跑 dry-run。
- 真實學生資料、電話、學費資料不得 commit。
- `data/snapshots/` 與 `data/reports/` 預設不納入 Git。
- Firebase 寫入只開 `accounting` 節點，並由 Google Auth email allowlist 保護。
- Firebase Web API key 是前端初始化用公開設定，不是 service account；repo 不直接 commit 實值以避免 GitHub secret scanning 告警。

## 參考來源

- 本機 Numbers：`/Users/huangboyu/Desktop/山熊/山熊升大/高中部學生名冊.numbers`
- 暫存匯出：`/Users/huangboyu/Desktop/high_roster_export_temp.xlsx`
- Google Sheet：`114學年 山熊升大 學生名單`
- Google Sheet id：`1HrLdpUdv_zDtFczsNW-v1N-nXnL1-YgygiXz4siaikA`

## Firebase

- Project ID：`bearhigh`
- Web App：`BearHigh Accounting`
- Realtime Database：`bearhigh-default-rtdb`
- Location：`asia-southeast1`
- Rules：根節點拒絕；`accounting` 只允許 `neatnelsonhuang@gmail.com` 登入後讀寫。
