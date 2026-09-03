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

## Egret UI Editor 素材登記

將圖片放入 `resource/assets` 或其子資料夾後，Egret UI Editor 不一定會自動掃描並顯示素材。Editor 的 Assets 面板會依據下列資源設定檔建立素材清單：

```text
resource/default.res.json
```

因此，素材除了存在於磁碟中，還必須登記在 `default.res.json` 的 `resources` 陣列。例如專案中有以下兩張圖片：

```text
resource/assets/05.png
resource/assets/test/05.png
```

需要加入：

```json
{
  "name": "05_png",
  "type": "image",
  "url": "assets/05.png"
},
{
  "name": "test_05_png",
  "type": "image",
  "url": "assets/test/05.png"
}
```

`name` 是 Egret 使用的資源鍵，必須保持唯一。即使不同資料夾中的圖片檔名相同，也不能使用相同的資源鍵；可在名稱前加入資料夾名稱，例如 `test_05_png`。

如果圖片需要在預載階段載入，還要將對應的資源鍵加入 `groups` 中 `preload` 群組的 `keys`。只需要在 EUI 中引用、並由其他流程按需載入時，可以不加入 `preload`。

修改 `default.res.json` 後，請重新開啟 Egret UI Editor 專案或刷新 Assets 面板，讓 Editor 重新讀取資源設定。

## EXML 與畫面尺寸

### 以 Cocos Creator 的概念理解 EXML

EXML 不是單一 Node，而比較接近 Cocos Creator 的 UI Prefab 或場景中的一組 UI 節點結構。EXML 內的各個 EUI 元件才比較接近 Node 與其 Component。

| Egret EUI | Cocos Creator 概念 |
| --- | --- |
| EXML 檔案 | UI Prefab 或一組 UI 節點結構 |
| `Group` | Node |
| `Image` | Node + Sprite |
| `Label` | Node + Label |
| `Button` | Node + Button |
| Skin | UI 元件的外觀 Prefab |
| TypeScript 類別 | 掛在 Node 上的 Component 腳本 |
| `default.thm.json` | UI 類別與 Prefab／Skin 的對應設定 |
| `default.res.json` | 資源索引或 Asset Bundle 設定 |

例如：

```xml
<e:Skin xmlns:e="http://ns.egret.com/eui">
    <e:Group>
        <e:Image source="test_05_png"/>
        <e:Label text="Hello"/>
    </e:Group>
</e:Skin>
```

可用 Cocos Creator 的概念理解為：

```text
Prefab
└─ Group（Node）
   ├─ Image（Node + Sprite）
   └─ Label（Node + Label）
```

### EXML 尺寸是否需要等於輸出解析度

EXML 的尺寸不一定要與輸出螢幕解析度相同，應依它在介面中的用途決定。

如果 EXML 代表完整畫面，可以使用設計解析度進行編輯，但執行時通常讓根容器跟隨舞台伸縮：

```xml
<e:Skin
    xmlns:e="http://ns.egret.com/eui"
    width="100%"
    height="100%">
```

也可以在對應的 TypeScript 元件中設定：

```typescript
this.percentWidth = 100;
this.percentHeight = 100;
```

如果 EXML 是按鈕、彈窗、列表項目或其他局部 UI 元件，只需設定元件本身所需的尺寸，不必設定成整個螢幕大小：

```xml
<e:Skin width="200" height="80">
```

對照 Cocos Creator：

- 全畫面 EXML：類似 Canvas 下的全螢幕 UI 根節點。
- 局部 EXML：類似 Button、Dialog、Item 等 Prefab。
- Egret 舞台尺寸：類似 Canvas 或設計解析度。
- 百分比尺寸及 `left`、`right`、`top`、`bottom`：類似 Widget 對齊。

原則上只有全畫面容器需要填滿舞台，其他 EXML 應保留各自合理的元件尺寸。

### EXML 元件與 TypeScript 欄位綁定

如果需要在 TypeScript 中操作 EXML 內的元件，必須替 EXML 元件設定 `id`，並在對應的 EUI Component 類別中宣告同名欄位。

EXML：

```xml
<e:Image
    id="numberImage"
    touchEnabled="false"
    alpha="1"
    source="test_05_png"
    fillMode="scale"
    width="160"
    height="128"
    x="0"
    y="0"/>
```

TypeScript：

```typescript
class TestEui extends eui.Component {
    public numberImage: eui.Image;

    public constructor() {
        super();
        this.skinName = "skins.TestImg";
    }

    protected childrenCreated(): void {
        super.childrenCreated();
        this.numberImage.alpha = 1;
    }
}
```

Egret 5.4.1 使用的舊版 TypeScript 不支援較新的 `override` 關鍵字，因此應使用：

```typescript
protected childrenCreated(): void {
```

不要寫成：

```typescript
protected override childrenCreated(): void {
```

### EXML XML 屬性語法

EXML 是 XML 格式，元素的屬性之間只能使用空格分隔，不能加入 JavaScript 或 JSON 風格的逗號。

下列寫法會造成 `#2002: EXML parsing error`：

```xml
<e:Image id="numberImage",touchEnabled="false"/>
```

錯誤位置是 `id` 屬性後方的逗號。正確寫法為：

```xml
<e:Image id="numberImage" touchEnabled="false"/>
```

當錯誤訊息顯示 `attributes construct error` 時，應優先檢查該行是否有多餘逗號、缺少引號、重複屬性或未正確關閉標籤。

## Egret 5.4.1 EXML 屬性速查

EXML 沒有一份所有元件完全共用的固定屬性表；實際可設定項目取決於元素所對應的 EUI 類別及其父類別。下列整理目前專案最常使用的屬性。

### 識別、位置與尺寸

| 屬性 | 用途 |
| --- | --- |
| `id` | EUI Skin Part 識別，將元件注入 TypeScript 的同名欄位 |
| `name` | DisplayObject 名稱，供 `getChildByName()` 搜尋 |
| `x`、`y` | 相對父容器的位置 |
| `width`、`height` | 固定尺寸，也可填入 `100%` |
| `percentWidth`、`percentHeight` | 相對父容器的百分比尺寸 |
| `left`、`right`、`top`、`bottom` | 相對父容器的四邊約束，類似 Cocos Widget |
| `horizontalCenter`、`verticalCenter` | 相對父容器置中及偏移 |
| `minWidth`、`minHeight` | Layout 可使用的最小尺寸 |
| `maxWidth`、`maxHeight` | Layout 可使用的最大尺寸 |
| `includeInLayout` | 是否參與父容器的 Layout 計算 |

同時設定 `left` 與 `right` 時，寬度會由父容器決定；同時設定 `top` 與 `bottom` 時，高度會由父容器決定。

### 顯示變換與互動

| 屬性 | 用途 |
| --- | --- |
| `scaleX`、`scaleY` | 水平及垂直縮放；`scaleX="-1"` 可水平翻轉 |
| `anchorOffsetX`、`anchorOffsetY` | 縮放與旋轉使用的錨點 |
| `rotation` | 旋轉角度 |
| `skewX`、`skewY` | 傾斜角度 |
| `alpha` | 透明度，範圍通常為 0～1 |
| `visible` | 是否顯示 |
| `touchEnabled` | 元件本身是否接收觸控 |
| `touchChildren` | 容器內的子元件是否接收觸控 |
| `blendMode` | 混合模式，例如 `normal`、`add`、`erase` |

### Skin 與 Component

Skin 根節點常用：

```text
class, width, height, minWidth, minHeight, maxWidth, maxHeight, states
```

Component 常用：

```text
skinName, enabled, currentState
```

`class="skins.TestImg"` 是 Skin 的完整名稱，TypeScript 可透過下列方式綁定：

```typescript
this.skinName = "skins.TestImg";
```

### Image

```text
source, fillMode, scale9Grid, smoothing, texture
```

範例：

```xml
<e:Image
    id="numberImage"
    source="test_05_png"
    width="160"
    height="128"
    fillMode="scale"
    smoothing="true"/>
```

`source` 通常填入 `default.res.json` 中登記的資源鍵。`fillMode` 常見值為 `scale`、`repeat`、`clip`。`scale9Grid` 格式為 `x,y,width,height`，適合需要伸縮的按鈕或面板背景。

### Label

```text
text, size, textColor, fontFamily, bold, italic,
textAlign, verticalAlign, multiline, wordWrap, lineSpacing,
stroke, strokeColor, maxChars, displayAsPassword
```

`textAlign` 常用值為 `left`、`center`、`right`；`verticalAlign` 常用值為 `top`、`middle`、`bottom`。

### BitmapLabel

```text
text, font, letterSpacing, lineSpacing, textAlign, verticalAlign
```

`BitmapLabel` 使用點陣字型資源，適合數字或固定字元集。

### Group 與 Layout

Group 常用：

```text
layout, scrollH, scrollV, contentWidth, contentHeight, elementsContent
```

`VerticalLayout` 與 `HorizontalLayout` 常用：

```text
gap, horizontalAlign, verticalAlign,
paddingLeft, paddingRight, paddingTop, paddingBottom,
useVirtualLayout
```

`TileLayout` 常用：

```text
requestedColumnCount, requestedRowCount,
columnWidth, rowHeight, horizontalGap, verticalGap,
orientation, columnAlign, rowAlign
```

Layout 範例：

```xml
<e:Group>
    <e:layout>
        <e:VerticalLayout
            gap="10"
            horizontalAlign="center"
            verticalAlign="middle"
            paddingLeft="10"
            paddingRight="10"
            paddingTop="10"
            paddingBottom="10"/>
    </e:layout>
</e:Group>
```

### Button、ToggleButton、CheckBox、RadioButton

Button：

```text
label, icon, enabled, skinName, autoRepeat
```

ToggleButton 與 CheckBox 額外常用：

```text
selected
```

RadioButton 常用：

```text
label, value, group, groupName, selected
```

### TextInput

```text
text, prompt, maxChars, displayAsPassword,
restrict, editable, textColor, promptColor
```

### Rect

```text
fillColor, fillAlpha, strokeColor, strokeAlpha,
strokeWeight, ellipseWidth, ellipseHeight
```

範例：

```xml
<e:Rect
    width="200"
    height="100"
    fillColor="0xFF0000"
    fillAlpha="1"
    strokeColor="0xFFFFFF"
    strokeWeight="2"
    ellipseWidth="20"
    ellipseHeight="20"/>
```

### ProgressBar 與 Slider

ProgressBar：

```text
minimum, maximum, value, slideDuration, direction, labelFunction
```

HSlider 與 VSlider：

```text
minimum, maximum, value, snapInterval, liveDragging, pendingValue
```

### Scroller

```text
viewport, scrollPolicyH, scrollPolicyV, bounces, throwSpeed
```

捲動策略常用值為 `auto`、`on`、`off`。

### List 與 DataGroup

```text
dataProvider, itemRenderer, itemRendererSkinName,
selectedIndex, selectedItem, selectedIndices, selectedItems,
allowMultipleSelection, requireSelection, layout, useVirtualLayout
```

### 狀態屬性

可讓同一個元件在不同狀態套用不同屬性：

```xml
<e:Image
    source="button_up_png"
    source.down="button_down_png"
    alpha.disabled="0.5"/>
```

也可以使用：

```text
includeIn, excludeFrom
```

控制元件只在哪些狀態出現。常見狀態包括 `up`、`down`、`disabled`、`selected`、`normal`，實際狀態由元件及 Skin 定義決定。

### 事件

EXML 可以指定事件處理函式，例如：

```xml
<e:Button label="確認" click="onConfirm(event)"/>
```

目前專案更建議在 TypeScript 中註冊，以取得較清楚的型別及生命週期管理：

```typescript
this.confirmButton.addEventListener(
    egret.TouchEvent.TOUCH_TAP,
    this.onConfirm,
    this
);
```

### 最常用屬性摘要

```text
id, name, x, y, width, height,
left, right, top, bottom,
horizontalCenter, verticalCenter,
percentWidth, percentHeight,
anchorOffsetX, anchorOffsetY,
scaleX, scaleY, rotation,
alpha, visible, touchEnabled,
includeInLayout, source, skinName,
text, label, selected, enabled
```

## Egret EUI 生命週期與 Cocos Creator 對照

Egret 沒有像 Cocos Creator 一樣完整且固定的 `onLoad()`、`start()`、`update()`、`onDestroy()` Component 生命週期，需要使用 EUI 方法、舞台事件及 Ticker 組合出相同流程。

| Cocos Creator | Egret EUI 對應方式 |
| --- | --- |
| `constructor` | `constructor()` |
| `onLoad()` | `childrenCreated()` |
| Prefab 欄位綁定 | EXML `id`、`partAdded()`、Skin Part |
| `onEnable()` | `egret.Event.ADDED_TO_STAGE` |
| `start()` | 第一次 `ADDED_TO_STAGE` 時自行呼叫 |
| `update(dt)` | `egret.startTick()` 或 `ENTER_FRAME` |
| `onDisable()` | `egret.Event.REMOVED_FROM_STAGE` |
| `onDestroy()` | 沒有完全對應，需要自行實作 `dispose()` |

### 生命週期順序

```text
constructor
    ↓
設定 skinName
    ↓
建立 EXML 元件
    ↓
partAdded（Skin Part）
    ↓
childrenCreated
    ↓
ADDED_TO_STAGE
    ↓
startTick / ENTER_FRAME
    ↓
REMOVED_FROM_STAGE
    ↓
stopTick
    ↓
自行 dispose
```

`constructor()` 適合設定 `skinName`、初始化一般變數及註冊舞台事件。此時不應假設 EXML 的 `id` 欄位已經存在。

`childrenCreated()` 會在 EXML 與 Skin Part 建立完成後呼叫，適合操作透過 `id` 綁定的元件及註冊 UI 事件，概念接近 Cocos 的 `onLoad()`。

`ADDED_TO_STAGE` 在元件真正加入顯示舞台時觸發，適合啟動 Tick、Timer、Tween 或其他更新流程。物件從舞台移除後再次加入時，這個事件會再次觸發。

`REMOVED_FROM_STAGE` 適合停止 Tick、Timer、Tween 及暫時性事件。從舞台移除不等於銷毀，物件可能稍後再次加入。

### startTick 與 Cocos update(dt)

`egret.startTick()` 是最接近 Cocos Creator `update(dt)` 的功能，但 Egret 傳入的參數是引擎啟動至今的總毫秒時間，不是兩幀之間的秒數，因此需要自行計算 `dt`。

```typescript
class TestEui extends eui.Component {
    public numberImage: eui.Image;

    private lastTime: number = 0;
    private initialized: boolean = false;

    public constructor() {
        super();
        this.skinName = "skins.TestImg";

        this.addEventListener(
            egret.Event.ADDED_TO_STAGE,
            this.onAddedToStage,
            this
        );

        this.addEventListener(
            egret.Event.REMOVED_FROM_STAGE,
            this.onRemovedFromStage,
            this
        );
    }

    protected childrenCreated(): void {
        super.childrenCreated();
        this.numberImage.alpha = 1;
    }

    private onAddedToStage(): void {
        if (!this.initialized) {
            this.initialized = true;
            this.start();
        }

        this.lastTime = egret.getTimer();
        egret.startTick(this.update, this);
    }

    private start(): void {
        console.log("start");
    }

    private update(timeStamp: number): boolean {
        const dt: number = (timeStamp - this.lastTime) / 1000;
        this.lastTime = timeStamp;

        this.numberImage.rotation += 90 * dt;

        return false;
    }

    private onRemovedFromStage(): void {
        egret.stopTick(this.update, this);
    }

    public dispose(): void {
        egret.stopTick(this.update, this);

        this.removeEventListener(
            egret.Event.ADDED_TO_STAGE,
            this.onAddedToStage,
            this
        );

        this.removeEventListener(
            egret.Event.REMOVED_FROM_STAGE,
            this.onRemovedFromStage,
            this
        );
    }
}
```

Egret 與 Cocos 更新參數的差異：

| Cocos Creator | Egret `startTick()` |
| --- | --- |
| 自動呼叫 `update(dt)` | 必須手動呼叫 `egret.startTick()` |
| `dt` 是上一幀至今的秒數 | `timeStamp` 是引擎啟動至今的總毫秒數 |
| Component 停用後由引擎停止更新 | 必須手動呼叫 `egret.stopTick()` |
| `update()` 沒有回傳值 | Tick callback 必須回傳 `boolean` |

Tick callback 回傳 `false` 代表使用正常的引擎渲染流程，通常應使用此值。回傳 `true` 會要求 Egret 在 callback 完成後立即重繪，除非有特殊需要，不建議每幀使用。

### ENTER_FRAME

也可以使用 `ENTER_FRAME`：

```typescript
this.addEventListener(
    egret.Event.ENTER_FRAME,
    this.onEnterFrame,
    this
);
```

停止時必須解除：

```typescript
this.removeEventListener(
    egret.Event.ENTER_FRAME,
    this.onEnterFrame,
    this
);
```

`ENTER_FRAME` 不直接提供 `dt`，仍需使用 `egret.getTimer()` 自行計算。

### 清理原則

Egret 的 Ticker 會保存 callback 與 `thisObject`。把元件從舞台移除不會自動停止 `startTick()`，如果沒有呼叫 `stopTick()`，可能造成元件離開畫面後仍持續更新、重複註冊或無法釋放記憶體。

建議統一使用下列結構：

```text
ADDED_TO_STAGE   → startTick()
REMOVED_FROM_STAGE → stopTick()
永久不再使用元件 → dispose()
```

## Egret 模組、Launcher 專案類型與 EUI Theme

### 透過 egretProperties.json 增加模組

建立專案時即使沒有在 Egret Launcher 勾選某個擴充庫，之後仍可在 `egretProperties.json` 的 `modules` 陣列中手動加入。

例如加入 DragonBones：

```json
{
  "name": "dragonBones",
  "path": "../../egret-core-master/egret-core-master/build/dragonBones"
}
```

加入 MovieClip 所在的 Game 模組：

```json
{
  "name": "game",
  "path": "../../egret-core-master/egret-core-master/build/game"
}
```

加入 EUI：

```json
{
  "name": "eui",
  "path": "../../egret-core-master/egret-core-master/build/eui"
}
```

修改後需執行 clean/build，讓專案同步對應的 JavaScript Runtime 與 TypeScript 型別至 `libs/modules`。

在 Launcher 服務已停止的環境中，建議明確填寫本機 `path`，不要只填模組名稱，否則工具鏈可能再次嘗試透過 Launcher 查詢已安裝的引擎版本。

加入模組只會取得 Runtime 與 API，不會自動加入範例程式或素材。例如加入 `dragonBones` 不會自動產生 `skeleton.json`、`texture.json`、`texture.png` 或範例類別。

### Launcher 建立 EUI 專案與 Game 專案的差異

Launcher 的「專案類型」和「擴充庫勾選」是兩個不同層級：

```text
擴充庫勾選
= 決定專案有哪些 Runtime 與 API

專案類型
= 決定建立時使用哪一套目錄、設定、範本程式及資源
```

在普通 Game 專案勾選 EUI，只代表專案可以使用 `eui.Button`、`eui.Component`、`eui.Image` 等 API，不代表它會變成完整的 EUI 專案範本。

| 項目 | EUI 專案範本 | Game 專案加 EUI 模組 |
| --- | --- | --- |
| `libs/modules/eui` | 有 | 有 |
| EUI Runtime／型別 | 有 | 有 |
| `resource/eui_skins` | 自動建立 | 通常不建立 |
| `resource/default.thm.json` | 自動建立 | 通常不建立 |
| `.wing/exml.json` | 自動建立或由 Editor 維護 | 通常不建立 |
| `egretProperties.eui.exmlRoot` | 有 | 通常沒有 |
| `Main extends eui.UILayer` | 預設使用 | 通常仍為 `egret.DisplayObjectContainer` |
| `loadTheme()` | 預設提供 | 需要自行加入 |
| 預設元件 Skin | 有 | 沒有 |

`resource/eui_skins` 不是 EUI 模組本身的內容，而是 EUI 專案範本產生的專案資產。因此普通 Game 專案即使勾選 EUI，也可能只有 `eui.js` 與 `eui.d.ts`，沒有任何 EXML Skin。

### eui.Theme 的用途

`eui.Theme` 是 EUI 模組提供的正式類別，用來讀取 Theme 設定並註冊 Skin：

```typescript
const theme = new eui.Theme(
    "resource/default.thm.json",
    this.stage
);
```

`default.thm.json` 主要負責兩件事。

第一，將 EUI 元件類別對應到預設 Skin：

```json
{
  "skins": {
    "eui.Button": "resource/eui_skins/ButtonSkin.exml",
    "eui.CheckBox": "resource/eui_skins/CheckBoxSkin.exml"
  }
}
```

這樣建立 `new eui.Button()` 時，EUI 才知道應使用哪一個按鈕 Skin。

第二，登記自訂 EXML：

```json
{
  "exmls": [
    "resource/eui_skins/eui_img/TestImg.exml"
  ]
}
```

Theme 載入完成後，程式即可使用：

```typescript
this.skinName = "skins.TestImg";
```

### loadTheme 不是引擎固定生命週期

`loadTheme()` 通常是 EUI 專案範本在 `Main.ts` 中自行定義的 Promise 包裝方法，不是父類別提供、也不是 Egret 自動呼叫的生命週期函式。

```typescript
private loadTheme() {
    return new Promise<void>((resolve, reject) => {
        const theme = new eui.Theme(
            "resource/default.thm.json",
            this.stage
        );

        theme.addEventListener(
            eui.UIEvent.COMPLETE,
            () => {
                resolve();
            },
            this
        );
    });
}
```

任何已加入 EUI 模組的專案都可以自行加入相同方法。

### 在 Game 專案中使用 EUI

Game 專案若只需要用程式建立簡單 UI，可先加入 EUI 模組，然後直接建立不依賴複雜 Skin 的元件：

```typescript
const group = new eui.Group();
const image = new eui.Image();
const label = new eui.Label();

label.text = "Hello";
group.addChild(image);
group.addChild(label);
this.addChild(group);
```

如果 Game 專案要使用完整 EXML／Theme 工作流，至少需要：

1. 在 `egretProperties.json` 加入 `eui` 模組及本機路徑。
2. 建立 `resource/eui_skins`。
3. 建立 `resource/default.thm.json`。
4. 在 `egretProperties.json` 加入 `eui.exmlRoot`。
5. 在 `Main.ts` 建立並等待 `eui.Theme` 載入完成。
6. 確認 build 設定啟用了 `ExmlPlugin` 或相容的 EUI Compiler。
7. 視需求讓 `Main` 繼承 `eui.UILayer`。
8. 加入 Button、CheckBox、Panel 等元件需要的預設 Skin。
9. 讓 Egret UI Editor 建立或維護 `.wing/exml.json`。
10. 執行 build 並確認 EXML 已被編譯。

`Main` 不一定非得繼承 `eui.UILayer`；`egret.DisplayObjectContainer` 也能加入 EUI 顯示物件。`eui.UILayer` 只是更符合全畫面 EUI 根容器的預設使用方式。

### 沒有 Theme 時能否使用 EUI

可以使用部分純程式建立的元件，例如：

```text
eui.Group
eui.Image
eui.Label
```

但下列元件通常依賴 Skin：

```text
Button
CheckBox
RadioButton
TextInput
Panel
ProgressBar
Scroller
Slider
ToggleSwitch
```

如果沒有 Theme 或沒有手動指定 `skinName`，它們可能只有邏輯、沒有完整外觀或缺少必要的 Skin Part。

### 自訂 Skin 可以不經 Theme 嗎

可以，但前提是 Skin 已被 EXML 編譯並且其類別可在執行時取得。這時可以直接指定 Skin 類別或實例：

```typescript
component.skinName = skins.TestImg;
```

或：

```typescript
component.skinName = new skins.TestImg();
```

如果使用字串：

```typescript
component.skinName = "skins.TestImg";
```

則必須確保該 Skin 已被編譯、載入及註冊，否則執行時會找不到類別。

技術上可以繞過 Theme，但 Theme 能集中管理預設 Skin、EXML 清單及載入順序。對目前的 Egret 5.4.1 EXML 工作流而言，統一使用 `default.thm.json` 通常最穩定。

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
