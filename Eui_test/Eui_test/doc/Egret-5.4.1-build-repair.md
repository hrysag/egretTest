# Egret 5.4.1 Build 修復紀錄

- 專案：`D:\Egret_test\Eui_test\Eui_test`
- 內容：環境安裝、建置修復、TypeScript 版本問題、build／run 操作
- 開發類知識（素材、EXML、EUI 生命週期、Theme）請見同目錄的 `Egret-5.4.1-develop.md`

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

## TypeScript 版本落差與編輯器紅字

本節整併自 `D:\Egret_test\evnInfo\Egret-5.4.1-TypeScript-tsdk-downgrade.md`。
處理日期 2026-09-07，已完成，僅餘 1 項無害的 TS2503。

### 症狀

用 VS Code 開啟 Egret 專案後，`src/` 與 `libs/` 出現大量紅字，但 `egret build` 完全正常。

代表性錯誤：

```text
Argument of type '(e: ResourceEvent) => void' is not assignable to parameter of type '(event: Event) => void'.
  Types of parameters 'e' and 'event' are incompatible.
    Type 'Event' is missing the following properties from type 'ResourceEvent': itemsLoaded, itemsTotal, groupName, resItem
```

```text
Property 'textField' has no initializer and is not definitely assigned in the constructor.
```

### 環境盤點（實測）

| 項目 | 數值 | 來源 |
| --- | --- | --- |
| Node.js | 24.19.0 | `C:\Program Files\nodejs\node.exe` |
| npm | 11.17.0 | `C:\Program Files\nodejs\npm.cmd` |
| npm 全域路徑 | `C:\Users\user\AppData\Roaming\npm` | `npm config get prefix` |
| Egret CLI | 5.4.1 | 全域 npm 套件（原本唯一一個） |
| **Egret 內建編譯器** | **typescript-plus 2.4.2（= TS 2.4，2017/07）** | `egret-core-master/tools/lib/typescript-plus` |
| VS Code | 1.134.0 | `%LOCALAPPDATA%\Programs\Microsoft VS Code\110a328ea5` |
| **VS Code 內建 TypeScript** | **6.0.3** | 同上 `resources/app/extensions/node_modules/typescript` |
| 專案 tsconfig | 沒有 `strict` 設定，`target: es5` | `tsconfig.json` |
| VS Code 使用者設定 | 不存在（`%APPDATA%\Code\User\settings.json`） | — |

專案沒有 `package.json`、沒有本地 `node_modules`，這是 Egret 專案的正常型態。

### 根因

三層版本落差：

```text
Egret 執行的編譯器   TS 2.4.2   ← 專案程式碼是為它寫的
VS Code 顯示的紅字   TS 6.0.3   ← 差了 9 年的檢查規則
```

**關鍵：TypeScript 6/7 把 `strict` 的預設值改成 `true`。**

實測（TS 7.0.2 + 專案原本的 tsconfig，不加任何額外參數）：

```text
3 × TS2564   Property has no initializer
2 × TS2345   ResourceEvent 不可指派
```

同一份 tsconfig 加上 `--strict false`：

```text
0 × TS2564
0 × TS2345
```

對照 TS 5.9.3 + 同一份 tsconfig：必須**手動加** `--strict` 才會出現這些錯誤，預設是乾淨的。

因此紅字不是專案設定問題，也不是 VS Code 設定問題（機器上根本沒有 `settings.json`），
而是新版 TypeScript 的預設值改變。

#### 各錯誤對應的檢查與引入版本

| 語法／檢查 | 需要 TS | Egret 的 TS 2.4 |
| --- | --- | --- |
| `strictFunctionTypes`（TS2345） | 2.6 | 不認識此選項 |
| `strictPropertyInitialization`（TS2564） | 2.7 | 不認識此選項 |
| `x!: T` 明確賦值斷言 | 2.7 | **語法都剖析不了** |
| `?.` / `??` | 3.7 | 不支援 |
| `override` 關鍵字 | 4.3 | 不支援（既有文件已記錄） |

實測 Egret 編譯器對 `public x!: string;` 的反應：

```text
typescript-plus 內含的 TS 版本: 2.4.2
解析 `public x!: string;` → '=' expected. / Expression expected.
是否支援 strictPropertyInitialization 選項: false
是否支援 strictFunctionTypes 選項: false
```

### 為什麼「改 tsconfig」不夠

在 `tsconfig.json` 加 `"strict": false` 只能消掉 TS2564 與 TS2345，
但 TS 6/7 還有兩個用 flag 關不掉的硬傷：

| 錯誤 | 內容 | 能否用 flag 關閉 |
| --- | --- | --- |
| TS5108 | `Option 'target=ES5' has been removed` | 否。TS 6/7 移除 ES5 目標，整份 tsconfig 第一關就過不了 |
| TS1540 | `declare module egret {` 必須改用 `namespace` | 否。這是 **Egret 官方 `.d.ts` 的寫法**，共 26 處，不可能去改引擎型別檔 |

實測 TS 7.0.2 + `--strict false` 之後仍然剩下：

```text
26 × TS1540
 1 × TS2503   (NodeJS namespace，無害)
```

**結論：唯一完整的解法是把 VS Code 使用的 TypeScript（tsdk）降級，不是改專案設定。**

### 選定的 tsdk 版本

**TypeScript 5.9.3**，理由：

- 認得 `target: es5`（TS 6/7 已移除）
- 認得 `declare module egret {`（TS 6/7 報 TS1540）
- `strict` 預設為 `false`（TS 6/7 預設為 `true`）
- VS Code 1.134 的 tsserver 協定可正常驅動（TS 2.x 太舊，帶不動）

實測 TS 5.9.3 + 專案原本的 tsconfig，全專案結果：

```text
1 × TS2503   libs/modules/egret/egret.d.ts(1,21) Cannot find namespace 'NodeJS'
```

僅此一項，且無害（來自 `declare var global: NodeJS.Global` 搭配 tsconfig 的 `"types": []`）。

### 執行步驟

#### 步驟 1：安裝全域 TypeScript 5.9.3 —— 已完成

```powershell
npm.cmd i -g typescript@5.9.3
```

結果：

```text
added 1 package in 1s
```

驗證：

```text
版本: 5.9.3
路徑: C:\Users\user\AppData\Roaming\npm\node_modules\typescript\lib\tsserver.js
```

#### 步驟 2：建立 `.vscode/settings.json` —— 已完成

在專案根目錄 `D:\Egret_test\Eui_test\Eui_test\.vscode\settings.json` 建立：

```json
{
  "typescript.tsdk": "C:/Users/user/AppData/Roaming/npm/node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

放工作區而非使用者層級的理由：只影響 Egret 專案，不會把機器上其他專案一併拖回 5.9。

`typescript.enablePromptUseWorkspaceTsdk` 的作用只是讓 VS Code 跳出「是否改用工作區版本」的
詢問；真正決定用哪個版本的是 `typescript.tsdk`。

#### 步驟 3：讓 VS Code 切換版本 —— 已完成

`Ctrl+Shift+P` → `TypeScript: Select TypeScript Version` → **Use Workspace Version (5.9.3)**。
（VS Code 若自行跳出詢問視窗，選 Use Workspace Version 即可。）

#### 步驟 4：驗證 —— 已完成

**驗證一：用全域 5.9.3 對專案實跑**

```text
Version 5.9.3
libs/modules/egret/egret.d.ts(1,21): error TS2503: Cannot find namespace 'NodeJS'.
```

全專案僅剩此 1 項。原本的 TS2564 × 3、TS2345 × 2 全部消失。

**驗證二：確認 VS Code 實際載入的 tsserver**

用下列指令查 VS Code 各程序實際載入的 tsserver 路徑（tsserver 跑在 `Code.exe` 內，
不是獨立的 `node.exe`，所以要查 `Code.exe`）：

```powershell
Get-CimInstance Win32_Process -Filter "Name='Code.exe'" |
  Where-Object { $_.CommandLine -like '*tsserver*' } |
  ForEach-Object {
    if ($_.CommandLine -match '([A-Za-z]:\[^"]*?tsserver\.js)') {
      Write-Output "PID $($_.ProcessId): $($matches[1])"
    }
  }
```

結果：

```text
PID  6136: C:\Users\user\AppData\Roaming\npm\node_modules\typescript\lib\tsserver.js        ← 5.9.3
PID 22556: C:\Users\user\AppData\Roaming\npm\node_modules\typescript\lib\tsserver.js        ← 5.9.3
PID 24292: ...\Microsoft VS Code\110a328ea5\resources\app\extensions\...\tsserver.js        ← 內建 6.0.3
PID 33972: ...\Microsoft VS Code\110a328ea5\resources\app\extensions\...\tsserver.js        ← 內建 6.0.3
```

前兩個是本 Egret 工作區，已切換至 5.9.3。後兩個是同時開啟的其他 VS Code 視窗，
仍使用內建 6.0.3 —— 這正是工作區層級設定的預期效果，其他專案不受影響。

#### 殘留項目

`libs/modules/egret/egret.d.ts` 第 1 行仍有一條紅線：

```text
TS2503: Cannot find namespace 'NodeJS'.
```

來源是 `declare var global: NodeJS.Global;` 搭配 tsconfig 的 `"types": []`，
使 `NodeJS` 型別無處可尋。不影響建置，尚未處理。

### PowerShell 執行原則的坑

在 PowerShell 執行 `npm i -g ...` 會失敗：

```text
npm : 因為這個系統上已停用指令碼執行，所以無法載入 C:\Program Files\nodejs\npm.ps1 檔案。
```

原因：本機執行原則各層級皆為 `Undefined`，Windows 用戶端預設等同 `Restricted`，
所有 `.ps1` 一律不准執行。

```text
        Scope ExecutionPolicy
   UserPolicy       Undefined
  CurrentUser       Undefined
 LocalMachine       Undefined
```

npm 在 Windows 同時安裝 `npm.cmd`（批次檔）與 `npm.ps1`（PowerShell 腳本）。
PowerShell 優先挑 `.ps1` 而被擋；cmd.exe 與 Git Bash 挑 `.cmd`，不受影響。

**解法：明確指定 `.cmd`，不需要改任何系統設定。**

```powershell
npm.cmd i -g typescript@5.9.3
```

同理，`egret` 在 Git Bash 中找不到時，可用完整路徑 `%APPDATA%\npm\egret.cmd`。

（另一個選項是 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，
但那是變更帳號安全原則，本案用 `.cmd` 即可解決，沒有必要。）

### 重要注意事項

#### 不要用 `!` 消紅字

網路上對 TS2564 最常見的建議是加明確賦值斷言：

```typescript
public numberImage!: eui.Image;   // 不要在 Egret 5.4.1 這樣寫
```

編輯器紅字會消失，但 **`egret build` 會直接失敗**，因為 Egret 的 TS 2.4.2
連這個語法都剖析不了（TS 2.7 才引入）。這是反向陷阱。

#### 這些紅字不影響建置

處理前已實測 `egret build`，零錯誤：

```text
您正在使用白鹭编译器 5.4.1 版本
index.html emitted
main.js emitted
Total project compiling time: 32.876 second
```

紅字純粹是編輯器語言服務的顯示問題。

#### EXML 綁定欄位必然觸發 TS2564

```typescript
public numberImage: eui.Image;   // exml 裡的 id
```

這類欄位由 eui 在套用 `skinName` 時於執行期注入，TypeScript 程式碼從頭到尾不會賦值，
在 `strict` 下結構上不可能滿足檢查。任何 EUI 專案只要吃到 `strict` 都會被掃出一整排。

#### `src/` 底下不能寫 `export` —— TS2354 tslib

症狀（build 直接中斷，不是紅字）：

```
[tsl] ERROR in D:\...\src\testSkin\TestSkinForExml.ts(1,30)
      TS2354: This syntax requires an imported helper but module 'tslib' cannot be found.
```

**根因鏈**：

1. 本專案的 build 走 webpack + ts-loader（錯誤前綴 `[tsl]` 就是 ts-loader）——
   `scripts/config.ts` 用的是 `WebpackBundlePlugin`，不是舊的 `CompilePlugin`
2. bundler 硬塞了 `importHelpers`：

```js
// scripts/plugins/node_modules/@egret/egret-webpack-bundler/lib/index.js:186-193
var compilerOptions = {
    sourceMap: needSourceMap,
    importHelpers: true,          // ★ helper 改成從 tslib 匯入
    noEmitHelpers: true           // ★ 不再內嵌 __extends
};
config.resolve.alias = { 'tslib': require.resolve("tslib") };
```

3. 那個 `resolve.alias` **只對 webpack 打包有效，TypeScript 的型別檢查不看它**。
   tsc 用一般模組解析從 `src/xxx/` 往上找 `node_modules/tslib` ——
   本專案根目錄沒有 `node_modules`（只有 `scripts/plugins/node_modules`）→ 找不到 → TS2354
4. `importHelpers` **只作用在 module 檔案上**。沒有 `import` / `export` 的檔案是 global script，
   helper 一律內嵌，根本不碰 tslib

**實測對照組**（兩檔內容只差一個 `export`，參數 `--target es5 --importHelpers --noEmitHelpers`）：

```
a_global.ts   class AGlobal extends eui.Component        → 通過
b_module.ts   export class BModule extends eui.Component → TS2354
```

**修法**：拿掉 `export`，或包 `namespace`（兩者都維持 global script）。

```typescript
class TestSkinForExml extends eui.Component { ... }        // ✅
namespace TestComp { export class Foo extends ... { } }    // ✅ namespace 內的 export 不算 module
export class TestSkinForExml extends eui.Component { ... } // ❌ 整個檔案變成 module
```

裝 `tslib` 也能消掉錯誤，但**不該這樣修** —— 檔案一旦是 module，class 就不會掛上全域，
`egret.getDefinitionByName()` / exml 的 `xmlns:ns1="*"` 全部找不到它
（見 [Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md) §2.2 的 `$error 2003`）。

### 與其他文件的關係

同目錄的 `Egret-5.4.1-develop.md` 在「EXML 元件與 TypeScript 欄位綁定」記錄了一條同源問題：

> Egret 5.4.1 使用的舊版 TypeScript 不支援較新的 `override` 關鍵字

該條只寫了症狀，沒有寫出根因版號（TS 2.4.2），因此無法推廣到其他症狀。
本節補上完整的版本矩陣。

#### 待修正項目（尚未處理）

1. 本文件仍有 7 處殘留 `D:\Egret_test\Test_build` 路徑（第 48、80、82、406、445、448、490 行），
   是從 Test_build 複製擴寫留下的，正確路徑應為 `D:\Egret_test\Eui_test\Eui_test`。
2. 「修復方式 3」列出的模組清單含 `build/game`，但本專案的 `egretProperties.json`
   實際沒有 `game` 模組。
3. `GameModeTest/doc/Egret-5.4.1-Build-Deployment.md` 記錄的驗證基準為
   Node.js 18.14.1 / npm 9.3.1，本機現況為 24.19.0 / 11.17.0，已漂移（build 實測仍通過）。
4. `Test_build/doc/Egret-5.4.1-build-repair.md` 是舊短版，只到 build 驗證就結束。
5. `Egret-5.4.1-develop.md` 素材節的範例列出 `assets/05.png`，但該檔實際不存在
   （已在該節「現況備註」標註，尚未修正範例本身）。

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
