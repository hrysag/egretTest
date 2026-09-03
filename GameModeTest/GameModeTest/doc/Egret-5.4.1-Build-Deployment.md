# GameModeTest Egret 5.4.1 Build 環境部署紀錄

## 文件用途

此文件獨立記錄下列專案的 Build 環境部署與修復方式：

```text
D:\Egret_test\GameModeTest\GameModeTest
```

動畫測試計畫請另外參考：

```text
doc/Animation-Test-Plan.md
```

## 問題背景

Egret Launcher 服務停止後，舊專案的 build 插件仍會呼叫 Launcher Compiler 安裝與查詢流程：

```typescript
require("./npm").installFromLauncher(...);
```

因此執行 `egret build` 或 `egret run` 時可能出現：

```text
Error: Egret Compiler 未安装
TypeError: Cannot read property 'typeSelector' of undefined
```

第二個 `typeSelector` 錯誤通常是 Compiler 載入失敗後造成的連鎖問題。

另外，舊版 Bundler 會透過 Launcher API 查詢 Egret 5.4.1 的安裝紀錄。即使本機有引擎原始碼，如果模組沒有明確設定路徑，也可能出現：

```text
找不到指定的 egret 版本: 5.4.1
```

## 部署結果

部署已於 2026-08-10 完成，並實際 build 成功。

版本：

```text
Node.js: 18.14.1
npm: 9.3.1
Egret: 5.4.1
Webpack: 4.47.0
@egret/egret-webpack-bundler: 1.2.10
@egret/eui-compiler: 1.4.9
```

最後驗證：

```text
您正在使用白鹭编译器 5.4.1 版本
Version: webpack 4.47.0
index.html emitted
main.js emitted
exit code 0
```

## 修改與產生的檔案

直接修改：

```text
egretProperties.json
scripts/plugins/package.json
scripts/plugins/webpack-plugin.ts
scripts/plugins/eui-compiler-plugin.ts
```

npm 安裝產生或更新：

```text
scripts/plugins/package-lock.json
scripts/plugins/node_modules
```

build 更新：

```text
bin-debug
```

## 固定 npm 套件版本

檔案：

```text
scripts/plugins/package.json
```

依賴固定為：

```json
{
  "dependencies": {
    "@egret/egret-webpack-bundler": "1.2.10",
    "@egret/eui-compiler": "1.4.9"
  }
}
```

不要使用：

```json
"@egret/egret-webpack-bundler": "^1.2.10"
"@egret/eui-compiler": "^1.4.8"
```

固定版本可避免 npm 在未來安裝到不同的相依版本。

## 移除 Launcher Compiler 檢查

下列兩個檔案不再呼叫 `installFromLauncher()`：

```text
scripts/plugins/webpack-plugin.ts
scripts/plugins/eui-compiler-plugin.ts
```

Webpack 插件應直接從本地 `node_modules` 載入：

```typescript
import {
    EgretWebpackBundler,
    WebpackBundleOptions,
    WebpackDevServerOptions
} from "@egret/egret-webpack-bundler";
```

EUI Compiler 插件應直接載入：

```typescript
import * as eui from "@egret/eui-compiler";
```

專案內這兩個檔案目前不應再出現：

```text
installFromLauncher
```

## 本機 Egret 引擎模組路徑

本機引擎根目錄：

```text
D:\Egret_test\egret-core-master\egret-core-master
```

GameModeTest 的 `egretProperties.json` 已設定：

```json
{
  "engineVersion": "5.4.1",
  "compilerVersion": "5.4.1",
  "template": {},
  "target": {
    "current": "web"
  },
  "modules": [
    {
      "name": "egret",
      "path": "../../egret-core-master/egret-core-master/build/egret"
    },
    {
      "name": "eui",
      "path": "../../egret-core-master/egret-core-master/build/eui"
    },
    {
      "name": "assetsmanager",
      "path": "../../egret-core-master/egret-core-master/build/assetsmanager"
    },
    {
      "name": "dragonBones",
      "path": "../../egret-core-master/egret-core-master/build/dragonBones"
    },
    {
      "name": "game",
      "path": "../../egret-core-master/egret-core-master/build/game"
    },
    {
      "name": "tween",
      "path": "../../egret-core-master/egret-core-master/build/tween"
    },
    {
      "name": "promise",
      "path": "../../egret-core-master/egret-core-master/build/promise"
    }
  ]
}
```

這些路徑是相對於：

```text
D:\Egret_test\GameModeTest\GameModeTest
```

如果日後移動 GameModeTest 或 `egret-core-master`，必須同步修改每個模組的 `path`。

## `egretProperties.json` 與 `default.res.json` 的用途差異

`egretProperties.json` 管理的是 Egret 引擎模組／Runtime，不是遊戲素材清單。
例如加入 `game` 模組會提供 `egret.MovieClip`，加入 `dragonBones` 模組會提供
DragonBones Runtime，並讓相應程式進入編譯及 Build 輸出。

遊戲使用的 JSON、PNG、音效等素材則由：

```text
resource/default.res.json
```

管理。素材即使已複製到 `resource` 資料夾，若要透過 `RES.loadGroup()`、
`RES.getRes()` 或 `RES.getResAsync()` 載入，仍必須在 `default.res.json` 的
`resources` 中登記名稱、類型與相對路徑，並在需要時加入資源群組。

簡單區分：

```text
egretProperties.json       -> 引擎功能與 Runtime 模組
resource/default.res.json  -> 遊戲素材路徑與載入群組
```

兩者有時必須同時設定。例如 MovieClip 需要：

1. `egretProperties.json` 啟用 `game` 模組，提供 MovieClip API。
2. `resource/default.res.json` 登記序列幀 JSON 與 PNG，讓 RES 載入素材。

## 安裝本地 Compiler 依賴

在 PowerShell 執行：

```powershell
cd D:\Egret_test\GameModeTest\GameModeTest\scripts\plugins
npm install --registry=https://registry.npmmirror.com
```

依賴會安裝至：

```text
scripts/plugins/node_modules
```

確認版本：

```powershell
npm ls @egret/egret-webpack-bundler @egret/eui-compiler --depth=0
```

預期：

```text
@egret/egret-webpack-bundler@1.2.10
@egret/eui-compiler@1.4.9
```

安裝時可能出現舊套件 deprecated 警告。只要安裝退出碼為 0，這些警告不會阻止目前的 Egret 5.4.1 build。

## Build 方法

### 終端可識別 egret

```powershell
cd D:\Egret_test\GameModeTest\GameModeTest
egret build
```

### 終端無法識別 egret

可直接執行 Launcher 內的 Egret 5.4.1 Node 入口：

```powershell
cd D:\Egret_test\GameModeTest\GameModeTest

node --no-deprecation --max-old-space-size=8192 "C:\Program Files (x86)\Egret\EgretLauncher\resources\app\engine\win\selector.js" build
```

Launcher 安裝目錄內的 `egret.cmd` 可能因路徑含有 `(x86)` 而被舊式批次語法錯誤解析。直接呼叫 `selector.js` 可以避開該批次檔問題。

## Run 方法

終端能識別 `egret` 時：

```powershell
cd D:\Egret_test\GameModeTest\GameModeTest
egret run
```

如果需要直接使用 Node 入口：

```powershell
cd D:\Egret_test\GameModeTest\GameModeTest

node --no-deprecation --max-old-space-size=8192 "C:\Program Files (x86)\Egret\EgretLauncher\resources\app\engine\win\selector.js" run
```

`egret run` 會持續執行本機開發伺服器及檔案監聽。關閉瀏覽器不會停止伺服器。

停止方式：

```text
Ctrl + C
```

若詢問：

```text
Terminate batch job (Y/N)?
```

輸入 `Y` 後按 Enter。

## Build 輸出驗證

主要輸出：

```text
bin-debug/index.html
bin-debug/js/main.js
```

已確認動畫模組輸出：

```text
bin-debug/js/game.js
bin-debug/js/tween.js
bin-debug/js/dragonBones.js
```

這代表下列 API 的 Runtime 已進入專案輸出：

```text
egret.MovieClip
egret.MovieClipDataFactory
egret.Tween
dragonBones.EgretFactory
```

## 快速檢查清單

重新部署或換電腦時依序確認：

1. Node.js 與 npm 可執行。
2. 本機 Egret 5.4.1 引擎目錄存在。
3. `egretProperties.json` 的七個模組路徑有效。
4. 兩個插件沒有 `installFromLauncher()`。
5. `package.json` 套件版本固定。
6. `scripts/plugins/node_modules` 存在。
7. npm 套件版本正確。
8. 執行 build。
9. 確認 `index.html` 與 `main.js` 輸出。
10. 確認 `game.js`、`tween.js`、`dragonBones.js` 輸出。

## 常見問題

### Egret Compiler 未安装

原因通常是插件仍呼叫：

```text
installFromLauncher()
```

或本地 npm 依賴不存在。

### typeSelector of undefined

通常是 Compiler 載入失敗後的連鎖錯誤，先處理前面的 Compiler 錯誤。

### 找不到指定的 egret 版本 5.4.1

檢查 `egretProperties.json` 是否為全部模組設定有效的本機 `path`。

### npm 安裝很久或逾時

確認 npm 鏡像可連線，必要時重新執行：

```powershell
npm install --registry=https://registry.npmmirror.com
```

### Buffer() deprecated

舊版 Egret 相依套件在新版 Node.js 上可能顯示：

```text
[DEP0005] DeprecationWarning: Buffer() is deprecated
```

這是淘汰警告，不會阻止目前 build。

## 與動畫測試計畫的關係

此文件只負責 Build 環境與部署。

後續 MovieClip、DragonBones 素材複製、測試類別、播放控制及移植至 EUI 專案，請依照：

```text
doc/Animation-Test-Plan.md
```
