# 目前快照掃描摘要

來源：`/Users/huangboyu/Desktop/high_roster_export_temp.xlsx`

產生方式：

```bash
python3 src/import/scan_workbook.py \
  --input /Users/huangboyu/Desktop/high_roster_export_temp.xlsx \
  --output data/reports/current_scan.json
```

`data/reports/current_scan.json` 不納入 Git；本文件只保留非個資摘要。

## 全檔掃描結果

| 分頁 | 類型 | 列 | 欄 | 備註 |
| --- | --- | ---: | ---: | --- |
| 114學年度(111高一) | student_tuition | 250 | 149 | 有學費欄位與尾列 |
| 113學年度(110高二) | student_tuition | 420 | 134 | 有學費欄位與尾列，作為合報 golden sample |
| 112學年度(109高三) | student_tuition | 374 | 133 | 有學費欄位與尾列 |
| 化學師資 | teacher_or_reference | 774 | 181 | 老師/師資參考分頁 |
| 物理師資-Nick | teacher_or_reference | 615 | 168 | 老師/師資參考分頁 |
| 英文師資 | teacher_or_reference | 637 | 208 | 老師/師資參考分頁 |
| 數學師資-明軒 | teacher_or_reference | 642 | 194 | 老師/師資參考分頁 |
| 數學師資-黃浩 | teacher_or_reference | 604 | 200 | 老師/師資參考分頁 |
| 空白 | student_tuition | 115 | 166 | 模板分頁 |
| 社會師資-蔣明 | teacher_or_reference | 101 | 120 | 月份堂數區塊明顯 |
| 國文師資 | teacher_or_reference | 90 | 100 | 月份堂數區塊明顯 |

## 高二升高三 golden sample

`113學年度(110高二)` 尾列 `尾列不計入` 已掃到：

| 尾列 | 套餐 | 總額 |
| ---: | --- | ---: |
| 417 | 生地 | 12000 |
| 418 | 物化生地 | 52000 |
| 419 | 明軒全報 | 77000 |
| 420 | 黃浩全報 | 77000 |

後續合報分攤計算必須能重算這四列的各科分攤，或在 dry-run report 中列出合理尾差。

## 已確認

- 第一版 scanner 不是高二專用，會掃完整 workbook。
- scanner report 預設遮蔽姓名、電話、身分證、生日欄位。
- 真實快照與 report 皆被 `.gitignore` 排除。

