# TypeScript 版本落差與編輯器紅字（已整併）

- 原建立日期：2026-09-07
- 狀態：已處理完成，僅餘 1 項無害的 TS2503

本文件的完整內容已整併至專案文件：

```text
D:\Egret_test\Eui_test\Eui_test\doc\Egret-5.4.1-build-repair.md
```

該文件的「TypeScript 版本落差與編輯器紅字」章節，包含：

- 症狀與環境盤點（實測數值）
- 根因：TypeScript 6/7 將 `strict` 預設改為 `true`
- 為什麼改 tsconfig 不夠（TS5108 / TS1540 無法用 flag 關閉）
- 為什麼選定 tsdk 5.9.3
- 執行步驟 1～4 與驗證數據
- PowerShell 執行原則的坑與 `npm.cmd` 解法
- 注意事項（`!` 語法陷阱、紅字不影響建置、EXML 欄位必然觸發 TS2564）

## 結論摘要

| 項目 | 版本 |
| --- | --- |
| Egret 5.4.1 內建編譯器 | typescript-plus 2.4.2（TS 2.4） |
| VS Code 內建 TypeScript | 6.0.3 |
| 指定給編輯器使用的 tsdk | **5.9.3** |

處理方式：全域安裝 `typescript@5.9.3`，並在
`Eui_test\Eui_test\.vscode\settings.json` 以 `typescript.tsdk` 指向它。
