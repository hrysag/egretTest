# GameModeTest 動畫模組測試計畫

## 文件用途

此文件供下一個 Codex session 接續 GameModeTest 的 MovieClip 與 DragonBones 測試。

目前專案：

```text
D:\Egret_test\GameModeTest\GameModeTest
```

範例來源：

```text
D:\cocosTest\engine\egret-examples-master\egret-examples-master
```

本機 Egret 5.4.1 引擎：

```text
D:\Egret_test\egret-core-master\egret-core-master
```

## 已完成狀態

GameModeTest 的 build 環境已修復並實際 build 成功。

已完成：

- 固定 `@egret/egret-webpack-bundler` 為 `1.2.10`。
- 固定 `@egret/eui-compiler` 為 `1.4.9`。
- 移除兩個插件的 `installFromLauncher()`。
- 建立 `scripts/plugins/node_modules` 及 `package-lock.json`。
- 在 `egretProperties.json` 為全部模組加入本機路徑。
- 使用 Egret 5.4.1、Webpack 4.47.0 build 成功。

已啟用模組：

```text
egret
eui
assetsmanager
dragonBones
game
tween
promise
```

已確認輸出：

```text
bin-debug/js/game.js
bin-debug/js/tween.js
bin-debug/js/dragonBones.js
bin-debug/js/main.js
bin-debug/index.html
```

MovieClip 的 `chunli.json` 與 `chunli.png` 已複製到專案，並已在
`resource/default.res.json` 建立獨立的 `movieclip` 資源群組。

目前尚未建立 MovieClip 動畫測試類別，也尚未複製或登記 DragonBones 範例素材。

## 引擎模組與遊戲素材的設定差異

`egretProperties.json` 與 `resource/default.res.json` 用途不同，兩者不能互相取代。

### `egretProperties.json`

此檔案用來設定專案需要編譯及載入的 Egret 引擎模組／Runtime，例如：

```text
egret
eui
assetsmanager
game
tween
dragonBones
promise
```

例如 MovieClip API 位於 `game` 模組，DragonBones API 位於 `dragonBones` 模組。
把模組加入 `egretProperties.json`，可讓相關型別與 Runtime 程式進入專案的編譯及 Build 輸出；
這不會自動登記任何 JSON、PNG、音效或其他遊戲素材。

### `resource/default.res.json`

此檔案是 RES 資源系統的素材清單與群組設定，用來指定：

```text
資源名稱
資源類型
素材相對路徑
資源群組
```

放入 `resource` 資料夾的素材不會只因檔案存在就能用 `RES.getRes()` 取得。
要透過 RES 載入素材，必須先在 `resource/default.res.json` 的 `resources` 中登記路徑，
並依載入時機放入適當的 `groups`。

目前 MovieClip 登記如下：

```text
movieclip group
├─ chunli_json -> assets/animation/movieclip/chunli.json
└─ chunli_png  -> assets/animation/movieclip/chunli.png
```

由於 `movieclip` 是獨立群組而非 `preload` 的一部分，程式使用素材前必須先執行：

```typescript
await RES.loadGroup("movieclip");
```

完成後才可使用：

```typescript
const jsonData = RES.getRes("chunli_json");
const texture = RES.getRes("chunli_png");
```

### RES 群組的載入與對應關係

`RES.loadGroup()` 傳入的字串來自 `resource/default.res.json` 中
`groups` 項目的 `name`，不是資料夾名稱，也不是固定的 Egret 關鍵字。

目前設定：

```json
{
    "keys": "chunli_json,chunli_png",
    "name": "movieclip"
}
```

因此：

```typescript
await RES.loadGroup("movieclip");
```

代表找到 `name` 為 `movieclip` 的群組，再載入其 `keys` 列出的
`chunli_json` 與 `chunli_png`。

每個 key 會繼續對應至 `resources` 中相同的 `name`：

```json
{
    "name": "chunli_json",
    "type": "json",
    "url": "assets/animation/movieclip/chunli.json"
},
{
    "name": "chunli_png",
    "type": "image",
    "url": "assets/animation/movieclip/chunli.png"
}
```

完整載入流程：

```text
RES.loadGroup("movieclip")
        ↓
groups 中尋找 name = "movieclip"
        ↓
讀取 keys = "chunli_json,chunli_png"
        ↓
resources 中尋找相同的 name
        ↓
根據 type 與 url 載入 chunli.json 和 chunli.png
        ↓
RES.getRes("chunli_json") / RES.getRes("chunli_png") 取得素材
```

本範例有三種不同用途的名稱：

```text
"movieclip"    -> default.res.json 中的資源群組名稱
"chunli_json"  -> default.res.json 中的 RES 資源名稱
"test"         -> chunli.json 內部的 MovieClip 資料名稱
```

對應的 API：

```typescript
await RES.loadGroup("movieclip");
const jsonData = RES.getRes("chunli_json");
const movieClipData = factory.generateMovieClipData("test");
```

## 整體策略

先在 GameModeTest 驗證動畫 Runtime、素材格式、載入、播放、停止及清理，再將已驗證結構移植回 EUI 專案。

```text
GameModeTest
→ MovieClip 最小測試
→ DragonBones 最小測試
→ 播放控制與生命週期清理
→ 移植到 EUI 專案
```

## 第一階段：MovieClip

### 來源

程式：

```text
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\src\extension\game\display\MovieClip.ts
```

素材：

```text
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\resource\assets\chunli.json
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\resource\assets\chunli.png
```

### 建議目標

```text
resource/assets/animation/movieclip/chunli.json
resource/assets/animation/movieclip/chunli.png
src/animation/MovieClipExample.ts
```

### 步驟

1. 建立目標目錄並複製兩個素材。（已完成）
2. 在 `resource/default.res.json` 登記素材。（已完成）
3. 建立獨立 MovieClip 資源群組，不先加入初始 preload。（已完成）
4. 建立 `MovieClipExample`。
5. 使用 `egret.MovieClipDataFactory` 建立資料。
6. 使用 `generateMovieClipData("test")` 建立 MovieClip。
7. 使用 `gotoAndPlay("attack", -1)` 循環播放。
8. 監聽 `COMPLETE` 與 `LOOP_COMPLETE`。
9. 在 `Main.ts` 暫時建立並加入舞台。
10. build/run 驗證播放、停止及事件清理。

核心 API：

```typescript
const factory = new egret.MovieClipDataFactory(jsonData, texture);

const movieClip = new egret.MovieClip(
    factory.generateMovieClipData("test")
);

movieClip.gotoAndPlay("attack", -1);
this.addChild(movieClip);
```

### 驗證標準

- JSON 與 PNG 載入成功。
- `attack` 標籤正常播放。
- `-1` 可持續循環。
- `LOOP_COMPLETE` 正常觸發。
- 移除後停止播放及事件。
- build/run 無錯誤。

## 第二階段：DragonBones

### 來源

程式：

```text
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\src\extension\dragonbones\Dragonbones.ts
```

DragonBoy 最小必要素材：

```text
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\resource\assets\armature\skeleton.json
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\resource\assets\armature\texture.json
D:\cocosTest\engine\egret-examples-master\egret-examples-master\CoreExample\resource\assets\armature\texture.png
```

同目錄的 `skill_*`、`button_start_*` 與 `water_bg.jpg` 不是基本範例必要素材，第一輪不要複製。

### 建議目標

```text
resource/assets/animation/dragonbones/DragonBoy/skeleton.json
resource/assets/animation/dragonbones/DragonBoy/texture.json
resource/assets/animation/dragonbones/DragonBoy/texture.png
src/animation/DragonBonesExample.ts
```

### 步驟

1. 複製三個最小必要素材。
2. 在 `default.res.json` 登記骨架、圖集及 PNG。
3. 建立獨立 DragonBones 資源群組。
4. 建立 `DragonBonesExample`。
5. 解析骨架及 Texture Atlas。
6. 建立 `DragonBoy` Armature Display。
7. 播放 `walk`。
8. 確認 WorldClock 是否需手動推進。
9. 使用可解除的更新 callback。
10. 配合 `ADDED_TO_STAGE`、`REMOVED_FROM_STAGE` 及 `dispose()`。
11. build/run 驗證。

核心 API：

```typescript
const factory = dragonBones.EgretFactory.factory;

factory.parseDragonBonesData(skeletonData);
factory.parseTextureAtlasData(textureData, texture);

const display = factory.buildArmatureDisplay("DragonBoy");
display.animation.play("walk");

this.addChild(display);
```

### WorldClock 注意事項

舊範例使用：

```typescript
egret.Ticker.getInstance().register(function (advancedTime) {
    dragonBones.WorldClock.clock.advanceTime(advancedTime / 1000);
}, this);
```

不要直接照抄匿名 callback。先確認目前 Runtime 是否已自行更新；若需手動推進，必須保存 callback 並在移出舞台或 dispose 時解除。

### 驗證標準

- 三個素材載入成功。
- `DragonBoy` 建立成功。
- `walk` 正常播放。
- 從舞台移除後停止更新。
- 重複進入不會重複註冊 WorldClock。
- build/run 無錯誤。

## 第三階段：統一播放控制與清理

兩個測試類別至少提供：

```text
play()
stop()
pause()（API 支援時）
resume()（API 支援時）
dispose()
```

生命週期原則：

```text
ADDED_TO_STAGE
→ 啟動動畫或更新

REMOVED_FROM_STAGE
→ 停止 Tick、WorldClock callback 及暫時事件

dispose
→ 永久解除事件、停止動畫並釋放引用
```

避免：

- 匿名 callback 無法解除。
- 重複加入舞台時重複註冊。
- MovieClip 移除後仍播放。
- Armature 移除後仍由 WorldClock 更新。
- 重複 parse 同名 DragonBones 資料。

## 第四階段：移植回 EUI 專案

目標：

```text
D:\Egret_test\Eui_test\Eui_test
```

GameModeTest 驗證完成後：

1. 在 EUI 專案加入 `game` 本機模組路徑。
2. 加入 `dragonBones` 本機模組路徑。
3. build 確認兩個 Runtime 正常輸出。
4. 複製已驗證素材。
5. 合併 `default.res.json` 資源與群組。
6. 移植動畫包裝類別。
7. 視需求以 `eui.Component` 或 EXML Skin 包裝。
8. 配合 `childrenCreated()`、舞台事件與 `dispose()`。
9. 確認 Theme／EXML 不影響初始化順序。
10. build/run 完整驗證。

## 建議執行順序

```text
1. MovieClip 最小素材與程式
2. MovieClip build/run
3. MovieClip 停止與清理
4. DragonBones 最小素材與程式
5. DragonBones build/run
6. DragonBones WorldClock 與清理
7. 整理共通測試入口
8. 更新本文件的實際結果
9. 移植回 EUI 專案
```

## 下一個 Session 起始動作

1. 讀取本文件。
2. 確認工作目錄為 `D:\Egret_test\GameModeTest\GameModeTest`。
3. 再執行一次 build 確認環境未改變。
4. 若使用者沒有新指示，從 MovieClip 開始。
5. 修改檔案前遵守當時的檔案變更確認規則。

## Build 指令

終端能識別 `egret` 時：

```powershell
cd D:\Egret_test\GameModeTest\GameModeTest
egret build
```

終端找不到 `egret` 時：

```powershell
node --no-deprecation --max-old-space-size=8192 "C:\Program Files (x86)\Egret\EgretLauncher\resources\app\engine\win\selector.js" build
```

最後一次驗證：

```text
Egret 5.4.1
Webpack 4.47.0
index.html emitted
main.js emitted
exit code 0
```
