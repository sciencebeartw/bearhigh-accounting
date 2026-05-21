# 高中帳務

高中部學費、合報分攤、學生加入/退出異動與老師薪資表輸出工具。

本專案先獨立於 `bear-admin/high` 與 Dashboard 開發。`bear-admin/high` 維持家長/學生查詢端；行政老師點名也先維持 Google Sheet。這裡只解決使用者本人每月最痛的帳務與老師薪資整理流程。

## 第一階段目標

1. 讀取高中部學生名冊 Numbers 匯出的 `.xlsx` 快照。
2. 全 workbook 掃描，不只支援高二。
3. 解析學費欄位、合報尾列、老師薪資/師資分頁格式。
4. 依 Google Sheet `學費定價表` 規則重算合報分攤。
5. 產生 dry-run / diff report；確認前不寫 Firebase。
6. 後續輸出與現有老師薪資表一致格式的 Excel/Sheet。

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

