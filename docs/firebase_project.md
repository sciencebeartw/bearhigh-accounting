# Firebase 專案

## Current Truth

- Project ID：`bearhigh`
- Project display name：`BearHigh`
- Console：`https://console.firebase.google.com/project/bearhigh/overview`
- Web App display name：`BearHigh Accounting`
- Web App ID：`1:1035765660629:web:2eb7b64579decc05b61b5c`
- Realtime Database instance：`bearhigh-default-rtdb`
- RTDB location：`asia-southeast1`

## 邊界

`bearhigh` 是高中系統的新 Firebase 專案。

第一階段只承載高中帳務 MVP：

- 學費登記。
- 合報/抵用券/手動折扣分攤。
- import dry-run batch。
- 老師薪資輸出。

第二階段才評估把 `sciencebear-admin/high` 遷出，遷移前應先雙寫比對：

```text
sciencebear-admin/high          舊正式
bearhigh/highPublic             新測試
```

不可在帳務 MVP 尚未穩定前直接切換高中家長端資料來源。

## Rules

目前 `database.rules.json` 採用 root fail-closed，只開高中帳務 `accounting`：

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "accounting": {
      ".read": "auth != null && auth.token.email == 'neatnelsonhuang@gmail.com'",
      ".write": "auth != null && auth.token.email == 'neatnelsonhuang@gmail.com'"
    }
  }
}
```

目前 allowlist：

- `neatnelsonhuang@gmail.com`

帳務、薪資節點不得公開讀取；未登入 REST 讀取 `/accounting/currentImportBatchId.json` 已確認回 `401 Permission denied`。

目前雲端資料節點：

```text
accounting/currentImportBatchId
accounting/importBatches/{batchId}
accounting/manual/tuitionPayments/{recordId}
accounting/manual/membershipEvents/{recordId}
accounting/manual/payrollRuns/{recordId}
```

## 前端部署

前端網址走 GitHub Pages，不走 Firebase Hosting：

```text
https://www.sciencebear.com.tw/bearhigh-accounting/
```

`bearhigh` 只作高中帳務資料庫 / Auth / 未來後端資料層。GitHub Pages 只部署程式碼，不部署 `public/local-data/numbers_import_latest.json`。

## Auth

Google 登入提供者已啟用，支援電子郵件為 `neatnelsonhuang@gmail.com`。

已授權 OAuth 重新導向網域：

```text
localhost
bearhigh.firebaseapp.com
bearhigh.web.app
www.sciencebear.com.tw
```
