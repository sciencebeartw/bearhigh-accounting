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
- Golden sample：支援生地 `12000`、自然全科 `52000`、明軒數自全報 `77000`、黃浩數自全報 `77000`。
- 月底異動：可先記錄某班某日期第幾堂學生加入/退出。
- 老師薪資草表：可先用堂數、鐘點與調整金額產生小計。
- 匯出：本機草稿 JSON 與學費分攤 CSV。

目前資料只存在瀏覽器 `localStorage`，尚未寫入 Firebase。

```bash
npm test
npm run start
```

本機網址：

```text
http://127.0.0.1:4173
```

Firebase Hosting 設定已放入 `firebase.json`，但尚未部署 Hosting。正式部署前仍需先確認 Auth / rules / 是否允許純 localStorage 草稿版上線測試。

## 安全原則

- 不直接讀寫正在編輯中的 `.numbers` 原檔。
- 每次匯入先建立快照，再跑 dry-run。
- 真實學生資料、電話、學費資料不得 commit。
- `data/snapshots/` 與 `data/reports/` 預設不納入 Git。
- Firebase 寫入必須等 dry-run 對照通過後另案開啟。

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
- 開發期 rules：預設全部拒絕讀寫，等 Auth / admin model 決定後再開節點。
