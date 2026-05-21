# 高中帳務開發計畫

## 不做的事

- 不先取代行政老師點名 Google Sheet。
- 不先修改 `bear-admin/high` 家長端。
- 不直接把 Numbers / Google Sheet 全量寫入 Firebase。
- 不把學生名冊、電話、學費快照 commit 到 Git。

## 第一版 MVP

### 0. 本機帳務工作台

已完成第一版純前端工作台，先用 `localStorage` 保存草稿，不寫 Firebase。

已包含：

- 學費登記表單。
- 即時各科收入分攤表。
- 月底加入/退出異動紀錄。
- 老師薪資草表。
- JSON / CSV 匯出。
- Node 內建測試覆蓋主要 pricing rules。

尚未完成：

- 真實 workbook normalized import。
- Firebase Auth / admin allowlist。
- Firebase 寫入。
- 老師薪資表輸出成完全對齊 Numbers 的 Excel/Sheet 格式。

### 1. 全檔掃描

讀取 Numbers 匯出的 `.xlsx` 快照，掃描全部分頁：

- 學生/學費主表：高一、高二、高三、空白模板。
- 老師/薪資參考表：化學、物理、英文、數學、社會、國文等師資分頁。

匯入 scope 一開始就是全 cohort：

- 國三升高一。
- 高一升高二。
- 高二升高三。
- 高三既有資料。
- 後續招生期新增 cohort。

高二升高三只是合報分攤的 golden sample，不是唯一支援範圍。
合報優惠、學費抵用券與手動折扣必須套用到所有 cohort，包含國三升高一、高一升高二、高二升高三與高三既有資料。

輸出：

- 每個分頁 rows / cols / 非空格數。
- 學生主表的區塊 header。
- 學費相關欄位。
- 尾列不計入樣板。
- 老師分頁的月區塊與欄位格式。

### 2. 合報分攤

從 Google Sheet `學費定價表` 與現有 workbook 匯入/驗證規則：

- 定價版本。
- 單科有效價。
- 合報級距總價。
- 特殊套餐合報總價。
- 滿 2/3/4 科折扣。

一般 24 堂課目前至少有兩個定價版本：

| 版本 | 一科 | 兩科合報 | 兩科平均 | 三科合報 | 三科平均 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 舊制 | 16800 | 32600 | 16300 | 47400 | 15800 |
| 今年度調漲制 | 21600 | 42200 | 21100 | 61800 | 20600 |

pricing engine 必須先判定 `pricingVersion`，再做合報與抵用券分攤。不可把舊制 `16800` 與新制 `21600` 混在同一個級距裡。

pricing engine 要對所有 cohort 生效。每個學生的每筆學費都要做：

- 課程辨識。
- 定價版本辨識。
- 套餐/數量折扣辨識。
- 學費抵用券分攤。
- 手動折扣分攤。
- 各科實際收入分攤。

目前以高二升高三尾列作 golden sample：

- 生地。
- 物化生地。
- 明軒全報。
- 黃浩全報。

目標是先重算出現有尾列分攤數字，或列出可接受的四捨五入尾差；之後同一套計算器要套到國三升高一、高一升高二、高二升高三與高三既有資料，不允許寫成高二特例。

### 3. 學費登記

使用者可用低摩擦方式輸入：

```text
學生 年級 學校 報名課程 實收金額 合報優惠 抵用券 備註
```

系統產生：

- 收款主檔。
- 各科分攤明細。
- 抵用券/優惠分攤。
- 後續老師拆帳可用的每科實際收入。

### 4. 月底異動

使用者月底補登：

```text
某班 某日期 第幾堂 某學生 加入/退出
```

系統重建每堂有效名單，用於老師薪資表與未來拆帳。

### 5. 老師薪資表輸出

輸出格式盡量對齊現有 Numbers 老師師資/薪資分頁。第一版先支援堂數/鐘點，資料契約預留每堂實際收入拆帳。

## 建議資料契約

- `students`
- `courses`
- `courseTerms`
- `pricingRules`
- `tuitionPayments`
- `tuitionAllocations`
- `courseMembershipEvents`
- `courseSessions`
- `teacherPayrollRuns`

## 匯入驗證

每次匯入必須產出 dry-run report：

- 新增/消失學生。
- 課程勾選變化。
- 學費總額變化。
- 每個 cohort 的合報套餐辨識。
- 各科分攤差異。
- 尾列 golden sample 驗證結果。
- 老師分頁格式差異。
- 國三升高一 / 高一升高二 / 高二升高三 / 高三既有資料的欄位差異。

## 匯入批次

一次匯入應以「快照批次」為單位，而不是以單一分頁為單位。

```text
snapshotBatch
  sourceWorkbook
  exportedAt
  sheets[]
  cohorts[]
  dryRunReport
  approvedBy
  approvedAt
```

同一批次可以包含多個 cohort。未來如果國三升高一資料來自另一個 Google Sheet 或另一個 Numbers 檔，也應加入同一個 batch manifest，一起產生 diff report，再決定是否寫入 Firebase。
