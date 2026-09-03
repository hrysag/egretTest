# Egret 5.4.1 Build 修復紀錄

## 問題摘要

專案執行 `egret build` 時出現以下錯誤：

```text
Error: Egret Compiler 未安裝
TypeError: Cannot read property 'typeSelector' of undefined
```

專案原本透過 Egret Launcher 取得 Compiler 擴充套件，但 Launcher 服務已終止，無法登入後下載。原始程式會固定檢查：

```text
%APPDATA%\EgretLauncher\download\EgretCompiler\@egret
```

由於該目錄及套件不存在，build 在載入插件時便中止。後面的 `typeSelector` 錯誤是前一個錯誤造成的連鎖問題。

## 修復方式

### 1. 改用專案本地 npm 套件

在 `scripts/plugins/package.json` 中固定使用目前仍可從 npm 鏡像取得的版本：

```json
{
  "dependencies": {
    "@egret/egret-webpack-bundler": "1.2.10",
    "@egret/eui-compiler": "1.4.9"
  }
}
```

依賴安裝位置為：

```text
scripts/plugins/node_modules
```

安裝指令：

```powershell
cd D:\Egret_test\Test_build\scripts\plugins
npm install --registry=https://registry.npmmirror.com
```

### 2. 移除 Egret Launcher Compiler 檢查

以下兩個插件不再呼叫 `installFromLauncher()`：

- `scripts/plugins/webpack-plugin.ts`
- `scripts/plugins/eui-compiler-plugin.ts`

插件會直接透過 Node.js 模組解析載入 `scripts/plugins/node_modules` 中的本地套件。

### 3. 直接指定 Egret 5.4.1 引擎模組

`@egret/egret-webpack-bundler` 原本還會透過 Launcher API 查詢已登記的 Egret 引擎版本。由於 Launcher 服務及安裝紀錄不可用，會出現：

```text
找不到指定的 egret 版本: 5.4.1
```

因此已在 `egretProperties.json` 的每個模組加入本機引擎路徑：

```text
../egret-core-master/egret-core-master/build/egret
../egret-core-master/egret-core-master/build/eui
../egret-core-master/egret-core-master/build/assetsmanager
../egret-core-master/egret-core-master/build/game
../egret-core-master/egret-core-master/build/tween
../egret-core-master/egret-core-master/build/promise
```

這些是相對於專案根目錄 `D:\Egret_test\Test_build` 的路徑。

> 如果日後移動 `Test_build` 或 `egret-core-master`，必須同步修改 `egretProperties.json` 中的 `path`。

## 修改過的檔案

```text
egretProperties.json
scripts/plugins/webpack-plugin.ts
scripts/plugins/eui-compiler-plugin.ts
scripts/plugins/package.json
scripts/plugins/package-lock.json
```

另外安裝了未納入原始碼管理的本地依賴：

```text
scripts/plugins/node_modules
```

## Build 操作

在專案根目錄執行：

```powershell
cd D:\Egret_test\Test_build
egret build
```

## 驗證結果

已使用系統現有的 `egret.cmd` 實際執行 build，結果成功：

```text
您正在使用白鹭编译器 5.4.1 版本
正在编译项目...
Version: webpack 4.47.0
index.html emitted
main.js emitted
COMMAND_EXIT=0
```

生成檔案位於：

```text
bin-debug/index.html
bin-debug/main.js
```

## 已知警告

Build 過程可能顯示：

```text
[DEP0005] DeprecationWarning: Buffer() is deprecated
```

這是 Egret 舊版相依套件在新版 Node.js 上產生的淘汰警告，不會阻止目前的 build。

## 重新安裝依賴

若 `scripts/plugins/node_modules` 遺失，可執行：

```powershell
cd D:\Egret_test\Test_build\scripts\plugins
npm install --registry=https://registry.npmmirror.com

cd D:\Egret_test\Test_build
egret build
```

## `egret run` 的執行與停止方式

執行：

```powershell
egret run
```

除了開啟瀏覽器之外，還會在目前的終端中持續執行：

- 本機開發伺服器
- TypeScript／Webpack 檔案監聽
- 專案檔案修改後的自動重新編譯

因此，關閉瀏覽器並不會停止 `egret run`。修改 TypeScript 後，終端再次出現以下訊息是正常現象：

```text
[wdm]: Compiling...
[wdm]: Compiled successfully.
```

### 停止 `egret run`

回到正在執行 `egret run` 的終端，按下：

```text
Ctrl + C
```

如果終端詢問：

```text
Terminate batch job (Y/N)?
```

輸入 `Y` 後按 Enter。PowerShell 提示符重新出現，即代表開發伺服器已停止：

```text
PS D:\Egret_test\Test_build>
```

之後可再次執行：

```powershell
egret run
```

### 保留伺服器並執行其他指令

如果希望 `egret run` 持續監聽，不需要將它停止。可在 VS Code 終端右上角按 `+`，新增另一個 PowerShell 終端來執行其他指令。

即使關閉瀏覽器，只要 `egret run` 仍在執行，通常仍可重新開啟原本的 localhost 網址，不需要重新啟動伺服器。

### `Ctrl+C` 無法停止時

先查看目前的 Node.js 程序：

```powershell
Get-Process node
```

確認屬於 Egret 開發伺服器的程序後，再依程序 ID 停止：

```powershell
Stop-Process -Id <程序ID>
```

不建議直接停止所有 Node.js 程序，否則可能同時關閉其他正在使用 Node.js 的開發工具。
