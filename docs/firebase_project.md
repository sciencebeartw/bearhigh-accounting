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

目前 `database.rules.json` 採用 fail-closed：

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

後續開 UI 前需先決定 Auth / admin allowlist：

- 只允許指定管理員登入。
- 帳務、薪資節點不得公開讀取。
- import batch 寫入必須帶 `importBatchId` 與使用者資訊。

## Hosting

`firebase.json` 已加入 Hosting 設定，public directory 為 `public/`。

目前尚未部署 Hosting。第一版工作台仍是 localStorage 草稿版，正式上線測試前需確認：

- 是否接受先部署純前端草稿版。
- 是否要先加 Firebase Auth。
- 是否要在 rules 開啟任何節點。
