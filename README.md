# 高中帳務

高中部學費、合報分攤、學生加入/退出異動與老師薪資表輸出工具。

本專案先獨立於 `bear-admin/high` 與 Dashboard 開發。`bear-admin/high` 維持家長/學生查詢端；行政老師點名也先維持 Google Sheet。這裡只解決使用者本人每月最痛的帳務與老師薪資整理流程。

Firebase 專案也獨立使用 `bearhigh`，避免開發期與 `sciencebear-admin` 正式行政資料互相污染。

後續產品設計請先讀 `docs/numbers_workflow.md`。該文件把目前 Numbers 的學生修課、學費合報/退費、老師課程名單與月薪資公式整理成主檔化工作流，之後 UI 與資料模型應以那份規格為準。

## 第一階段目標

1. 讀取高中部學生名冊 Numbers 匯出的 `.xlsx` 快照。
2. 全 workbook 掃描，不只支援高二。
3. 解析學費欄位、合報尾列、老師薪資/師資分頁格式。
4. 依 Google Sheet `學費定價表` 規則重算合報分攤。
5. 產生 dry-run / diff report；確認前不寫 Firebase。
6. 輸出接近現有 Numbers 老師薪資表邏輯的月底付款總表，方便列印、存 PDF 或截圖給老闆。

## 目前可跑版本

第一版本機工作台已建立在 `public/`：

- 工作台主流程：學生資料與大表、收款登記、月底老師薪資；舊「學費」試算頁已從主分頁移除，正式繳費資料統一走「收款」頁。
- 分攤計算：支援舊制 `16800` 與今年度調漲制 `21600` 的一般 24 堂級距。
- 金額模型：保留原價、內建合報優惠、額外合報優惠、抵用券、手動折扣、實收與各科實際收入。
- Golden sample：支援生地 `12000`、自然全科 `52000`、明軒數自全報 `77000`、黃浩數自全報 `77000`。
- 收款防呆：未選科目、負數或無效金額不能記入；合報優惠、抵用券、分期與退班退費集中在收款流程處理。
- 月底異動：可先記錄某班某日期第幾堂學生加入/退出。
- 老師薪資試算：可選 Numbers 匯入的老師名單區塊，依每位學生 `單堂`、本月堂數、加入/退出異動、分潤比例或固定鐘點產生單班試算，並可列印 / 存 PDF。
- 月底薪資結算：先為各老師名單區塊儲存本月上課日期，再一次產生所有老師付款小計與班級明細；一般老師用人均堂收 `670` / 自然科學班 `900` 再乘分潤，明軒數學用 `4500 + max(人數 - 15, 0) * 300`，國文或手動鐘點課可用鐘點制。
- Numbers 薪資表轉月結：若某月份已在 Numbers 做完老師薪資，可先重新匯入 `.xlsx` 快照，再於薪資頁按「從 Numbers 薪資表建立月結」，直接把該月歷史薪資表轉成可列印 / 儲存的月結資料；適合用來承接已完成月份或核對網頁新流程。
- 單一老師薪資表：月底結算的老師付款小計可逐位老師列印 / 存 PDF，一張表只列該老師的課程、堂次明細、應付小計與簽核欄。
- 月結檢查：薪資頁會先列出每個老師名單區塊是否可結算、缺堂次、是否有本月進退班異動；若像國文只有歷史薪資區塊但沒有老師名單，會標成需手動處理，避免月底漏算。
- 快速處理缺堂次：月結檢查每列可直接「處理堂次 / 查看」，會帶入對應老師名單區塊並捲到堂次編輯器，減少月底在下拉選單找班級的時間。
- 月結作業清單：依月份自動彙整載入名單、需手動項目、缺堂次、本月進退班、是否已產生結算、是否已儲存快照，方便月底照順序處理。
- 月結快照：月底結算產生後可儲存成固定快照，之後即使修改堂次、名單或公式設定，也不會覆蓋已存版本；已存月結可重新列印 / 存 PDF。
- 堂次日期表：薪資試算可為每個老師名單區塊與月份儲存一組本月上課日期；進退班異動若未填第幾堂，會用異動日期自動推算從哪一堂開始加入或退出。堂次日期必須依序遞增且數量需等於本月堂數，避免錯算。
- 學生資料中心：可依學生、分頁/cohort、班級/課程、繳費狀態與同名風險查詢。
- 乾淨主操作入口：新增「學生資料表」「老師課程表」「異動收退費」「老師薪資表」四個新分頁；舊學生/課程/老師/收款/薪資頁保留作工具箱與細部操作。
- 學生資料表：可依 112/111/110/109/108 年級與姓名/學校/課程搜尋學生，點學生後看基本資料、各學年度/學期修課、對應老師、學收、合報優惠提示、收款與退班退費；同頁可新增、修改與封存學生，封存不硬刪歷史資料。
- 單一學生修課顯示：只列該學生實際有學收或退班紀錄的科目，不再把所有 Numbers 欄位列出；系統會用已登記金額與同學期科目數推論新制/舊制合報、特殊合報與平均分攤。
- 老師課程表：可依學期、老師、課程搜尋，點課程查看學生名單、科目收入、每堂平均與退班狀態，方便從老師角度核對課程；同頁可新增、修改與封存老師，並依學期看該老師高一/高二/高三課程。
- 異動收退費：把加入/退出事件、收款流水與退費紀錄集中到同一入口；正式金額仍寫入既有 `receivables` / `paymentLedger` / `membershipEvents`，避免長出第二套帳。
- 老師薪資表：作為月底輸出入口，依月份與老師查看目前月結/快照資料，並可跳回舊薪資工具補堂次、產生月結與列印。
- 主檔化工作區：新增「課程」與「老師」頁籤；課程頁可依學期、老師、關鍵字查課程，點課程可看學生名單、應收/已收、堂次日期與進退班異動；老師頁可依學期查老師開課、學生人次、收費合計與預設薪資規則。
- 主檔匯入：匯入頁提供「Dry-run 主檔轉換」與「寫入主檔」，可把目前 Numbers / Firebase 匯入快照轉成學生、學期、老師、課程、選課與應收主檔；轉換使用穩定 id 去重，可重跑。寫入時使用 RTDB scoped multi-location update 到 `accounting/manual/*`，不覆蓋整個 `accounting` 節點。
- CRM 檔案：學生明細可看基本資料、課程、Numbers 學費欄位、網頁報名/收費、進退班異動、追蹤備註與時間軸。
- 班級名單：選定班級/課程後可查看該班名單與指定月份的加入/退出異動，並匯出 CSV。
- 匯入 / 網頁資料比對：學生頁會把 Numbers 匯入資料與網頁新增學生、科目、報名互相比對，標示「疑似重複報名」、「同名需確認」、「匯入生加網頁課」與「網頁新增」，方便短期雙軌測試時核對。
- 收款流程：學生加入科目後會自動產生收款狀態，可看科目淨額、已收、未收、分期與追蹤狀態。
- 合報/抵用券：學生收款表單可一次勾多科，合報優惠與學費抵用券會依 Numbers 口徑平均分到每一科，再把本次實收依各科淨額分攤。
- 分期付款：本次實收可少於總額，系統保留未收餘額作尾款；收款紀錄保留付款日期、方式與備註。
- 退班退費：可記錄從第幾堂退、已上堂數、總堂數、每堂原價；系統用「一堂以原價計，剩餘退回」計算退費，並同步新增一筆退出異動給月底薪資使用。
- 底層紀錄：仍保留收款/退費流水與稽核資料，但操作畫面不再主打會計科目表、正式報表或 ERP 式功能。
- 匯出：本機草稿 JSON、學生大表/班級名單/年級總表/收款狀態與薪資相關 CSV。
- 本月結算入口：工作台第一個分頁改為「本月結算」，把月底實際流程集中在同一頁：選月份、看月結作業清單、檢查缺堂次班級、跳到薪資工具補堂次、產生月底結算、從 Numbers 薪資表建立月結、列印 / 存 PDF 與儲存快照。此入口沿用既有薪資結算與堂次日期邏輯，不另建第二套公式。

目前已接上 Firebase Google Auth 與 `bearhigh` RTDB：

- 未登入時只顯示登入畫面；完整工作台需登入後使用，避免真實帳務資料在公開頁面裸露。
- 登入 `neatnelsonhuang@gmail.com` 後可讀取雲端匯入快照。
- 線上新增的異動、薪資草表與舊版學費草稿讀回資料會同步到 `accounting/manual/*`；新收款以收款頁的應收/流水帳為主。
- 線上新增的學生 CRM 狀態與追蹤備註也會同步到 `accounting/manual/studentProfiles` 與 `accounting/manual/studentNotes`。
- 線上新增的堂次日期表會同步到 `accounting/manual/courseSessionPlans`，用於月底薪資試算的日期轉堂次。
- 線上儲存的月結快照會同步到 `accounting/manual/payrollSettlements`，用於保留已送審或已付款的薪資總表版本。
- 線上新增的學期/梯次、老師、學生、課程與報名收費會同步到 `accounting/manual/manualTerms`、`manualTeachers`、`manualStudents`、`manualCourses`、`manualCourseEnrollments`。
- 線上新增的收款狀態、收款/退費流水與稽核紀錄會同步到 `accounting/manual/receivables`、`paymentLedger`、`auditLogs`。
- 匯入快照轉主檔時會寫入同一組 `accounting/manual/*` 主檔集合；舊 `manual*` 命名仍保留作相容層，畫面上以學生/課程/老師主檔操作。
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
