# eui.Skin 到底是什麼

> 版本：egret-core 5.4.1（`D:\Egret_test\egret-core-master\egret-core-master`）
> 相關：[Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md)（exml→class 的產碼那一段）、[Egret-EUI-Group-vs-DisplayObjectContainer.md](Egret-EUI-Group-vs-DisplayObjectContainer.md)
> 本文所有片段均取自引擎原始碼。

---

## 0. 一句話

**Skin 不是顯示物件。**

```ts
// components/Skin.ts:76
export class Skin extends egret.EventDispatcher {
```

它身兼**三個角色**，只有第一個是「資料」：

| 角色 | 靠什麼欄位 | 誰來消費 | 本文 |
|---|---|---|---|
| ① **exml 的反序列化目標**（資料） | `$elementsContent`（做好的子物件）<br>`skinParts`（有 id 的部件名單）<br>`width/height/min/max`（尺寸建議） | 宿主 `setSkin()`：`addChildAt()` 進顯示樹、`setSkinPart()` → `partAdded()`、`measure()` 取尺寸 | §2 §3 |
| ② **視圖狀態機**（行為） | `states` / `currentState` / `$stateValues`<br>（`sys.mixin(Skin, sys.StateClient)`） | **skin 自己跑** `commitCurrentState()`。元件只負責算出狀態名字丟過來 | §5 |
| ③ **綁定鏈的起點**（行為） | `hostComponent`（registerBindable）<br>`$watchers` | exml 裡的 `{title}` 產碼時被改寫成 `hostComponent.title`；`setSkin` 接上 hostComponent 時觸發 Watcher 重新求值 | §6.1 |

常見的誤解是把它當成「只是記錄 exml 資料的映射物件」—— 角色①確實如此，
但②③是**行為**，也正是手寫 Skin 子類（§8）時會失去的兩樣東西。

至於角色①的「映射」方向：是 **skin 的 id → 宿主的欄位**（`setSkinPart` 把 instance 寫進 `this[partName]`），
純粹給邏輯層拿參考用。皮膚**自己不畫任何東西**，也不在顯示樹上 ——
真正上場的是它 new 出來的那些子元件，而它們的 parent 是**宿主元件**，不是 skin。

---

## 1. 類別全貌（`components/Skin.ts`）

```ts
export class Skin extends egret.EventDispatcher {          // :76
    public skinParts: string[];                            // :92   exml 產的 getter 覆蓋它
    public maxWidth: number = 100000;                      // :115
    public minWidth: number = 0;                           // :137
    public maxHeight: number = 100000;                     // :159
    public minHeight: number = 0;                          // :181
    public width: number = NaN;                            // :202
    public height: number = NaN;                           // :224
    $elementsContent: egret.DisplayObject[] = [];          // :229
    public set elementsContent(value) { this.$elementsContent = value; }   // :231
    public get/set hostComponent(): Component              // :254-279
    $stateValues: sys.StateValues = new sys.StateValues(); // :294
    public states: State[];                                // :310
    public currentState: string;                           // :327
    public hasState: (name) => boolean;                    // :345   ← 宣告而已，實作靠 mixin
    private initializeStates: (stage) => void;             // :351   ← 同上
    private commitCurrentState: () => void;                // :357   ← 同上
    public $watchers: Watcher[] = [];                      // :360
    public unwatchAll()                                    // :362
}

sys.mixin(Skin, sys.StateClient);                          // :372
registerProperty(Skin, "elementsContent", "Array", true);  // :373  ← exml 的 @defaultProperty
registerProperty(Skin, "states", "State[]");               // :374
registerBindable(Skin.prototype, "hostComponent");         // :375
```

第 345/351/357 那三個只是**型別宣告**，實體方法是 `sys.mixin(Skin, sys.StateClient)` 貼上去的
（`states/State.ts:181` 的 `class StateClient`）。

**沒有 x / y / alpha / addChild / parent。** 想在 skin 上設座標是無意義的。

---

## 2. 誰持有 skin：`Component`

`eui.Component` 才有皮膚概念，`eui.Group` 沒有。整條路徑：

```
this.skinName = "skins.TestImg"        components/Component.ts:164   setter
└─ $parseSkinName()                    components/Component.ts:187
   └─ setSkin(skin)                    components/Component.ts:263
```

### 2.1 `skinName` 支援四種值（`Component.ts:187`）

```ts
$parseSkinName(): void {
    let skinName = this.skinName;
    let skin: any;
    if (skinName) {
        if (skinName.prototype) {                     // ① class 定義
            skin = new skinName();
        }
        else if (typeof (skinName) == "string") {
            let text: string = skinName.trim();
            if (text.charAt(0) == "<") {              // ② 內嵌 exml 字串
                clazz = EXML.parse(text);
            }
            else {
                clazz = egret.getDefinitionByName(skinName);          // ③ class 全名
                if (!clazz && text.toLowerCase().indexOf(".exml") != -1) {
                    EXML.load(skinName, this.onExmlLoaded, this, true);   // ④ 外部 exml 路徑（非同步！）
                    return;                            // ← 提早 return，setSkin 延後
                }
            }
            if (clazz) { skin = new clazz(); }
        }
        else { skin = skinName; }                     // ⑤ 直接給 Skin 實例
    }
    this.setSkin(skin);
}
```

第 ④ 條是唯一的非同步分支 —— `return` 掉了，`setSkin` 要等 `onExmlLoaded`（`Component.ts:223`）。
生命週期會因此錯位，見 [Lifecycle 文件 §5](Egret-EUI-Component-Lifecycle.md) 的推論。

### 2.2 `setSkin()` 的六個動作（`Component.ts:263`）

```ts
protected setSkin(skin: Skin): void {
    if (skin && !(skin instanceof eui.Skin)) { skin = null; DEBUG && egret.$error(2202); }   // ★ 型別關卡
    let oldSkin: Skin = values[sys.ComponentKeys.skin];
    if (oldSkin) {
        for (partName of oldSkin.skinParts) if (this[partName]) this.setSkinPart(partName, null);  // → partRemoved
        for (child of oldSkin.$elementsContent) if (child.$parent == this) this.removeChild(child);
        oldSkin.hostComponent = null;
    }
    values[sys.ComponentKeys.skin] = skin;
    if (skin) {
        for (partName of skin.skinParts) {
            let instance = skin[partName];
            if (instance) this.setSkinPart(partName, instance);      // → this[partName] = instance; partAdded()
        }
        for (let i = children.length - 1; i >= 0; i--) this.addChildAt(children[i], 0);   // ★ 反向插到 index 0
        skin.hostComponent = this;
    }
    this.invalidateSize();
    this.invalidateDisplayList();
    this.dispatchEventWith(egret.Event.COMPLETE);
}
```

三個要記住的細節：

1. **`$error 2202`**：`skinName` 解析出來的東西不是 `eui.Skin` 實例就整個丟掉。
2. **換皮膚會完整卸載舊的**：`partRemoved` → `removeChild` → `oldSkin.hostComponent = null`。所以 `partAdded` 裡加的事件監聽，要在 `partRemoved` 裡拿掉。
3. **`addChildAt(children[i], 0)` 由後往前**：結果是皮膚子項照原順序排在**最底層**，宿主原本就有的子項會被推到上面。

### 2.3 `setSkinPart` → `partAdded`（`Component.ts:338`）

```ts
public setSkinPart(partName: string, instance: any): void {
    let oldInstance = this[partName];
    if (oldInstance) this.partRemoved(partName, oldInstance);
    this[partName] = instance;                       // ← this.numberImage 在這裡被填上
    if (instance) this.partAdded(partName, instance);
}
```

`partAdded` / `partRemoved` 基底是空的（`Component.ts:376, 407`），純粹給你覆寫。

---

## 3. skin 的 width/height 到底做什麼

**只影響宿主的測量結果，其他什麼都不做。**

```ts
// components/Component.ts:683
protected measure(): void {
    sys.measure(this);
    let skin = this.$Component[sys.ComponentKeys.skin];
    if (!skin) return;
    let values = this.$UIComponent;
    if (!isNaN(skin.width)) {
        values[sys.UIKeys.measuredWidth] = skin.width;        // ★ 直接覆蓋，不是夾擠
    } else {
        if (values[sys.UIKeys.measuredWidth] < skin.minWidth) values[sys.UIKeys.measuredWidth] = skin.minWidth;
        if (values[sys.UIKeys.measuredWidth] > skin.maxWidth) values[sys.UIKeys.measuredWidth] = skin.maxWidth;
    }
    // height 同一套
}
```

| skin 的設定 | 效果 |
|---|---|
| `width="640"` | `measuredWidth` **直接等於 640**，子項量出來多大都不管 |
| `width` 不設（NaN） | 用 `sys.measure()` 量子項，再被 `minWidth`(0) / `maxWidth`(100000) 夾擠 |

所以 `TestImg.exml` 根節點的 `width="640" height="1136"` 唯一的意義，就是讓 `TestEui` 的
`measuredWidth/Height` 變成 640×1136。它**不會**裁切、不會縮放、也不會影響任何子項。

而 `measuredWidth` 只有在宿主自己沒被明確指定寬高時才會被採用（見 [Layout 文件](Egret-EUI-Layout-Constraints.md)）。

---

## 4. 沒設 skinName 時：Theme 查表

```ts
// components/Component.ts:609
protected createChildren(): void {
    if (!values[sys.ComponentKeys.skinName]) {
        let theme = egret.getImplementation("eui.Theme");
        if (theme) {
            let skinName = theme.getSkinName(this);
            if (skinName) { values[...skinName] = skinName; this.$parseSkinName(); }
        }
    }
}
```

```ts
// core/Theme.ts:320
public getSkinName(client: Component): string {
    if (!this.initialized) {                       // theme 還沒載完
        if (this.delayList.indexOf(client) == -1) this.delayList.push(client);
        return "";                                 // ← 先放生，之後補
    }
    let skinName: string = this.skinMap[client.hostComponentKey];   // ① hostComponentKey 優先
    if (!skinName) skinName = this.findSkinName(client);            // ② 沿 class 繼承鏈找
    return skinName;
}

// core/Theme.ts:337
private findSkinName(prototype: any): string {
    let key = prototype["__class__"];
    if (key === void 0) return "";
    let skinName = this.skinMap[key];
    if (skinName || key == "eui.Component") return skinName;        // ★ 走到 eui.Component 就停
    return this.findSkinName(Object.getPrototypeOf(prototype));
}
```

三段式查找：`hostComponentKey` → 自己的 `__class__` → 一路往父類找，到 `eui.Component` 為止。

`skinMap` 的來源就是 `default.thm.json` 的 `skins` 區塊（`Theme.ts:218-225` 逐條 `mapSkin()`）：

```json
"skins": {
    "eui.Button": "resource/eui_skins/ButtonSkin.exml",
    "eui.Panel":  "resource/eui_skins/PanelSkin.exml",
    ...
}
```

→ 這就是「`new eui.Button()` 什麼都不設也長得出樣子」的原因。
自己的元件想吃這條路，就 `theme.mapSkin("game.MyPanel", "skins.MyPanelSkin")` 或寫進 thm.json。

### 4.1 theme 未載完的補償機制

```ts
// core/Theme.ts:279  handleDelayList()
for (let client of list) {
    if (!client.$Component[sys.ComponentKeys.skinNameExplicitlySet]) {   // ★ 只補「沒手動設過」的
        let skinName = this.getSkinName(client);
        if (skinName) { client.$Component[...skinName] = skinName; client.$parseSkinName(); }
    }
}
```

`skinNameExplicitlySet` 在 `skinName` setter 第一行就被設成 `true`（`Component.ts:166`），
所以你手動指定過的元件永遠不會被 theme 蓋掉 —— 即使當時指定的名字解析失敗。

---

## 5. 視圖狀態掛在 skin 上，不在元件上

`sys.mixin(Skin, sys.StateClient)`（`Skin.ts:372`）。關鍵在 `hostComponent` setter：

```ts
// components/Skin.ts:258
public set hostComponent(value: Component) {
    if (this._hostComponent) this._hostComponent.removeEventListener(egret.Event.ADDED_TO_STAGE, this.onAddedToStage, this);
    this._hostComponent = value;
    let values = this.$stateValues;
    values.parent = value;                          // ★ state override 的作用對象＝宿主
    if (value) {
        this.commitCurrentState();
        if (!this.$stateValues.intialized) {
            if (value.$stage) this.initializeStates(value.$stage);
            else value.once(egret.Event.ADDED_TO_STAGE, this.onAddedToStage, this);   // ★ 等上舞台
        }
    }
    PropertyEvent.dispatchPropertyEvent(this, PropertyEvent.PROPERTY_CHANGE, "hostComponent");
}
```

`initializeStates` 需要 `stage`，所以宿主還沒上舞台時只能掛 `once(ADDED_TO_STAGE)` 等。

### 5.1 狀態切換的責任分工

```
button.enabled = false
└─ invalidateState()                    Component.ts:554  → invalidateProperties()
   └─ commitProperties()                Component.ts:660
      └─ skin.currentState = this.currentState        ★ Component.ts:664 —— 元件只負責「算出名字」
         └─ StateClient.commitCurrentState()          states/State.ts:232 —— skin 負責「真的套用」
            ├─ 舊 state 的 overrides[i].remove(this, parent)
            └─ 新 state 的 overrides[i].apply(this, parent)
```

- `this` = **skin**（id 都掛在 skin 上）
- `parent` = **宿主元件**（真正的顯示容器）

`Component.getCurrentState()` 基底回 `""`（`Component.ts:578`），子類覆寫：

```ts
// components/Button.ts:251
protected getCurrentState(): string {
    if (!this.enabled) return "disabled";
    if (this.touchCaptured) return "down";
    return "up";
}
```

顯式設 `component.currentState = "xxx"` 會蓋掉 `getCurrentState()` 的結果（`Component.ts:524-536` 的 `explicitState`）。

### 5.2 override 的 apply 也印證「子項屬於宿主」

```ts
// states/AddItems.ts
public apply(host: any, parent: egret.DisplayObjectContainer): void {
    let target: egret.DisplayObject = host[this.target];              // ← 從 skin 上取 id
    let container = this.propertyName ? host[this.propertyName] : parent;
    ...
    if (egret.is(container, "eui.Component")) {
        (<Skin>(<Component>container).$Component[sys.ComponentKeys.skin]).$elementsContent.push(target);
    }
    container.addChildAt(target, index);                              // ← 加進宿主
}
```

### 5.3 `State.initialize()` 的冷知識

```ts
// states/State.ts:158
public initialize(host: any, stage: egret.Stage): void {
    for (let addItems of this.overrides) {
        if (addItems instanceof eui.AddItems) {
            let target = host[addItems.target];
            if (target && target instanceof eui.Image && !target.$parent) {
                stage.addChild(target);
                stage.removeChild(target);          // ★ 加了馬上移除
            }
        }
    }
}
```

把「只在某個狀態才出現的 Image」瞬間掛上舞台再拿掉 —— 目的是**提前觸發貼圖載入**，
避免切狀態當下才開始載圖而閃一下。這是整個 State 系統唯一會碰 stage 的地方。

---

## 6. 資料綁定的清理

```ts
// components/Skin.ts:360
public $watchers: Watcher[] = [];
public unwatchAll() {
    if (this.$watchers && this.$watchers.length > 0) {
        for (let watcher of this.$watchers) watcher.unwatch();
        this.$watchers.length = 0;
    }
}
```

exml 裡寫 `{data.name}` 產生的 `Watcher` 會登記在這裡。
宿主的 `Component.unwatchAll()`（`Component.ts:1016`）只是轉呼叫 `this.skin.unwatchAll()`。
**沒有任何地方自動呼叫它** —— 要回收綁定得自己叫。

### 6.1 為什麼 `hostComponent` 要 registerBindable

因為**皮膚裡的綁定，起點是 skin，不是宿主**。產碼時會自動補前綴：

```ts
// exml/EXMLParser.ts:1117
let firstKey = item.split(".")[0];
if (firstKey != HOST_COMPONENT && this.skinParts.indexOf(firstKey) == -1) {
    item = HOST_COMPONENT + "." + item;          // ← "title" → "hostComponent.title"
}
```

規則：綁定式的第一個 key **不是 `hostComponent`、也不是任何一個 skinPart** 時，一律補上 `hostComponent.`。

所以皮膚 exml 裡寫 `{title}`，實際綁的是 `hostComponent.title` —— 拿的是宿主的屬性。
（寫 `{myLabel.text}` 這種以 skinPart 開頭的則維持原樣，綁 skin 自己的子項。）

於是這條鏈就串起來了：

```
registerBindable(Skin.prototype, "hostComponent")      Skin.ts:375
└─ set hostComponent → dispatchPropertyEvent(PROPERTY_CHANGE, "hostComponent")   Skin.ts:278
   └─ Watcher 監聽 host 的 PROPERTY_CHANGE                binding/Watcher.ts:366
      └─ setSkin() 接上 hostComponent 的瞬間，綁定重新求值   Component.ts:308
```

沒有這一段，皮膚在附加到宿主時綁定不會刷新 —— 這就是 `Skin.ts:278` 那句 `dispatchPropertyEvent` 的存在理由。

**推論**：Skin 不是純被動的資料容器。它同時是①exml 的反序列化目標、②視圖狀態機（§5）、③綁定鏈的起點。
只有①是「資料」，②③是行為 —— 也正是手寫 Skin 子類（§8）要放棄的兩樣東西。

---

## 7. UI Editor 的「Create EXML Skin」產生的是同一個東西嗎

**是。** 那個對話框只做一件事：**拼一段字串寫成 `.exml` 檔**。沒有任何額外註冊或中繼資料。

> 以下位移皆指 `C:\Program Files (x86)\Egret\Egret UI Editor\resources\app\out\egret\workbench\electron-browser\bootstrap\index.js`（單行 minified，用位元組位移定位）。

### 7.1 檔案樣板（位移 ~944,990）

```js
static createEUIExmlSkin(e, t, n, r) {
    return `<?xml version='1.0' encoding='utf-8'?>
<e:Skin class="skins.${r}"
\t${e ? 'states="' + e.toString() + '"' : ""} width="${t}"
\theight="${n}" xmlns:e="http://ns.egret.com/eui">
</e:Skin>`
}
```

參數：`e` = states、`t` = width、`n` = height、`r` = Name。

### 7.2 四個欄位各自對應到什麼

```js
// doCreateExml()  位移 ~953,496
const n = this.stat ? this.stat : null,
      r = n ? n.data.state : "",                              // ← Host Component 的唯一用途
      i = trim(this.widthTextInput.text),
      a = trim(this.heightTextInput.text),
      o = createEUIExmlSkin(r, i, a, trim(this.nameInput.text));
```

| 對話框欄位 | 進到哪裡 | 對應本文哪一節 |
|---|---|---|
| **Path** | 檔案存放位置。必須落在 `egretProperties.json` 的 `exmlRoot` 內（`pathValidation()` ~953,522），否則 Confirm 不給過 | — |
| **Name** | `class="skins.${Name}"`。**`skins.` 前綴寫死在樣板裡**，改不掉 | §2.1 的 `getDefinitionByName("skins.XXX")` |
| **Host Component** | **只取 `stat.data.state` 產生 `states="..."`。元件名稱本身完全不寫進檔案** | §5 視圖狀態 |
| **Width / Height** | `<e:Skin width= height=>` 兩個屬性 | §3 → `Component.measure()` 覆蓋 `measuredWidth/Height` |

所以填 `eui.Button` 得到 `states="up,down,disabled"`，填預設的 `eui.Component` 得到**沒有 states 屬性**（manifest 裡 `Component` 的 `state=""`）。
產出的檔案跟你手寫一個 `<e:Skin>` 完全等價 —— 執行期一樣走 `EXML.parse` → `eval` → `extends eui.Skin`（見 [Lifecycle 文件 §2](Egret-EUI-Component-Lifecycle.md)）。

### 7.3 Host Component 清單哪來的

```js
// 位移 ~649,261
const e = child(this.manifest, "component");
for (let t = 0; t < e.length; t++) {
    const n = e[t], r = n.attributes.module, i = n.attributes.id, o = n.attributes.state;
    a = r ? r + "." + i : i;
    this.isInstanceOf(a, "eui.Component") && this._hosts.push({ id: i, className: a, module: r, state: o });
}
```

manifest = `<egret-root>/tools/lib/eui/manifest.xml`（`euiManifestPath`，位移 ~639,712）：

```xml
<component id="Button"    super="eui.Component" state="up,down,disabled" show="true" module="eui"/>
<component id="Component" super="eui.DisplayObjectContainer" state="" show="true" module="eui"/>
<component id="ToggleButton" super="eui.Button"
           state="up,down,disabled,upAndSelected,downAndSelected,disabledAndSelected" show="true" module="eui"/>
```

兩個推論：

1. **清單只有引擎內建元件**，`ExmlComponentPanel.initData()`（~942,4xx）純粹把 `getHosts()` 的結果攤成樹。
   **自訂 class（例如 `TestEui`）不會出現在 Host Component 瀏覽器裡**。
2. 這裡的門檻是 `isInstanceOf(a, "eui.Component")` —— 跟 Custom 面板的
   `UIComponent / IViewport` **是不同的判斷**（見 [EgretUIEditor-Custom-Components.md](EgretUIEditor-Custom-Components.md) §3）。
   `eui.Group` 的 `super` 是 `egret.DisplayObjectContainer`，所以 Group 系列**不能當 Host Component**，但可以出現在 Custom 面板。

### 7.4 編輯器不會幫你登記到 theme

整個 bundle 裡 `.thm.json` 只出現一次（位移 945,189），是 `getWingProperties()` 的預設值；
沒有 `"exmls"` 或 `autoGenerateExmlsList` 字樣。**新建的 exml 不會被寫進 `default.thm.json`**。

補上這件事的是建置工具：

```js
// egret-core/tools/actions/exml.js:15, 81
if (!theme.exmls || theme.autoGenerateExmlsList) { ... }
if (thmData.autoGenerateExmlsList) { /* 寫回 exmls 清單 */ }
```

本專案 `default.thm.json` 的 `"autoGenerateExmlsList": true` 就是在等這個。
→ **新建皮膚後要跑一次 `egret build`**，否則執行期 theme 不會載到它，
`getDefinitionByName("skins.NewSkin")` 落空，走 §2.1 那條非同步分支或整個失敗。

### 7.5 exml 檔案裡不記錄宿主類別

實際對照本專案 editor 產出的兩個檔：

```xml
<!-- Test_Skin_1.exml —— 建完沒動過，就是 §7.1 樣板的原樣輸出 -->
<?xml version='1.0' encoding='utf-8'?>
<e:Skin class="skins.Test_Skin_1"
	 width="500"
	height="500" xmlns:e="http://ns.egret.com/eui">
</e:Skin>
```

exml 記的東西只有這五樣：**class 名、根尺寸、states、子節點與其屬性、子節點的 id**。
**沒有一個字提到宿主是誰。**

關聯是**反方向、單向、字串、執行期才成立**的：

```
元件 → 皮膚          this.skinName = "skins.TestImg"   → getDefinitionByName()  （§2.1）
theme 表 → 皮膚      default.thm.json 的 skins{}       → Theme.getSkinName()    （§4）
```

兩條都不寫在 exml 裡。皮膚要到執行期 `setSkin()` 把 `hostComponent` 指過來，才知道自己在服務誰。

唯一的耦合是**隱性的字串約定**：exml 的 `id` 必須跟宿主 TS 的欄位同名
（`TestImg.exml` 的 `numberImage` ↔ `TestEui.numberImage`），靠 `setSkinPart` 的 `this[partName] = instance` 對上。
**TS 編譯器不檢查這件事**，拼錯就是執行期 undefined。

#### 7.5.1 格式上其實留了位子，只是沒人用

wing 命名空間有一個 `<w:HostComponent name="..."/>` 節點（跟檔案裡那個 `<w:Config id="19fd7916ad1"/>` 同一類）：

```js
// 位移 ~520,936 / ~550,786
getHostComponent() { return this.getWingNode("HostComponent") ? trim(...attributes.name) : "" }
setHostComponent(e) { this.setWingNode("HostComponent", "name", e) }

// refreshWNSProps()  位移 ~557,094 —— 開檔時會把它讀進 this._hostComponent
```

甚至 xsd schema 產生器也替它建了節點定義（位移 ~681,454）。**但這版是死的**：

- `setHostComponent` 全 bundle 只有**定義本身**，沒有任何呼叫端；Create EXML Skin 對話框也不寫它
- `_hostComponent` 三個出現點全是自己的 getter / setter / 賦值，**沒有消費者**
- 執行期引擎更是直接跳過 wing 命名空間（`EXMLConfig.getClassNameById` 的 `if (ns == NS_W) { }`）

所以那是 Egret Wing 時代留下的殘留欄位，不影響結論。

#### 7.5.2 順帶：本專案的實況佐證了 §7.4

`Test_Skin_1.exml` 存在於磁碟，但 `default.thm.json` 的 `exmls` 清單裡**只有 `TestImg.exml`**。
編輯器確實沒有幫忙登記 —— 要跑 `egret build` 才會被 `autoGenerateExmlsList` 補進去。

### 7.6 一句話

對話框 = 一個檔案樣板產生器。它產的 `.exml`、你手寫的 `.exml`、`TestImg.exml`，
執行期通通變成同一種東西：`class XXX extends eui.Skin`。

---

## 8. 可以手寫一個 class 繼承 eui.Skin 嗎

**可以。** 引擎對皮膚沒有任何註冊機制，`setSkin()` 只是照著介面讀屬性 —— 誰生出來的它不在乎。

以下結論全部是**實際跑引擎跑出來的**（腳本見 §8.4）。

### 8.1 三條硬性條件

| # | 條件 | 不做會怎樣 |
|---|---|---|
| 1 | **`skinParts` 一定要有值** | `setSkin()` 直接 `skinParts.length` → `TypeError: Cannot read properties of undefined` |
| 2 | 每個 partName 對應的屬性要在 constructor 內建好 | `skin[partName]` 是 undefined → `if (instance)` 跳過 → 宿主的 `this[partName]` 永遠沒值 |
| 3 | 子項放進 `elementsContent` | Skin 沒有 `addChild`，這是唯一入口（`Skin.ts:231`） |

條件 1 的來源就是 `Component.ts:263` 那兩行沒有防呆：

```ts
let skinParts: string[] = skin.skinParts;
let length = skinParts.length;          // ← skinParts 是 undefined 就在這裡爆
```

`Skin.ts:92` 的 `public skinParts: string[];` **沒有初始值**，exml 產物是靠自己生一個 getter 補上的
（見 [Lifecycle 文件 §2.1](Egret-EUI-Component-Lifecycle.md)）。手寫就得自己補。

### 8.2 最小可用範例

```typescript
class MySkin extends eui.Skin {
    public myImg: eui.Image;
    public skinParts: string[] = ["myImg"];      // ★ 用「欄位」不要用 getter，理由見下

    constructor() {
        super();
        this.width = 200;                        // 只影響宿主 measuredWidth（§3）
        this.height = 100;

        this.myImg = new eui.Image();
        this.myImg.width = this.myImg.height = 50;
        this.elementsContent = [this.myImg];     // ★ 唯一的加子項管道
    }
}

class MyComp extends eui.Component {
    public myImg: eui.Image;                     // 會被 setSkinPart 填上
    constructor() {
        super();
        this.skinName = MySkin;                  // ★ 直接給 class，不必註冊、不必 skins. 前綴
    }
    protected partAdded(partName: string, instance: any): void {
        console.log("partAdded", partName);
    }
}
```

> **TS 注意**：用 `get skinParts()` 覆寫會編譯失敗 ——
> `error TS2611: 'skinParts' is defined as a property in class 'Skin', but is overridden here as an accessor.`
> （用 tsc 5.9.3 實測）。改成欄位指派就乾淨。exml 產物是 JS，不受這條約束。

### 8.3 實測輸出

```
A partAdded log      : ["partAdded: myImg -> eui.Image","partAdded: myLabel -> eui.Image"]
A this.myImg 有值嗎  : true
A numChildren        : 2
A 子項的 parent 是宿主: true
A skin.hostComponent : true
A skin 是顯示物件嗎  : false
A width/height       : 200 x 100
A measuredWidth      : 200 x 100        ← 讀過 width 觸發 validateSizeNow 之後
B（沒給 skinParts）  : TypeError -> Cannot read properties of undefined (reading 'length')
C（字串查不到）      : skin = undefined
D（非 Skin 型別）    : #2202: parse skinName error，the parsing result of skinName must be a instance of eui.Skin.
E（skinParts = []）  : partAdded=[] numChildren=1 width=80     ← 沒有 part 但子項照樣進顯示樹
F（直接給 Skin 實例）: skin===inst? true  partAdded 照跑
G（中途換皮膚）      : partAdded x2 → partRemoved x2, numChildren=1, myImg=null
```

逐條對應：

- **C**：`skinName` 給字串又查不到、字串裡也沒有 `.exml` → `clazz` 是 undefined → `skin` 是 undefined → `setSkin(undefined)`，**不報錯，靜靜地沒皮膚**。手寫時建議直接傳 class 或實例，別走字串。
- **E**：`skinParts = []` 完全合法 —— 純展示用、不需要在宿主拿參考的皮膚可以這樣寫。
- **F**：`skinName` 也吃**已經 new 好的實例**（`$parseSkinName` 最後那條 `else { skin = skinName; }`）。
- **G**：`skinName` 重設會走完整卸載流程，`partRemoved` 有跑、`this.myImg` 被設回 `null`。動態換皮膚是安全的。
- 附帶觀察：元件**沒上舞台時** `validateNow()` 不會產生測量結果，讀 `width` 觸發 `validateSizeNow()` 之後 `measuredWidth` 才變成 200×100。

### 8.4 重現腳本

```js
// scratchpad/handskin.js   用法：node handskin.js
const fs = require('fs'), vm = require('vm');
const E = 'D:/Egret_test/egret-core-master/egret-core-master/build';
const sandbox = { console };
sandbox.global = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
const run = f => vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
run(E + '/egret/egret.js');
run(E + '/eui/eui.js');

vm.runInContext(`
class MySkin extends eui.Skin {
    constructor() {
        super();
        this.width = 200; this.height = 100;
        const img = new eui.Image(); img.width = img.height = 50;
        this.myImg = img;
        this.elementsContent = [img];
    }
    get skinParts() { return ["myImg"]; }
}
class MyComp extends eui.Component {
    constructor(skinClass) { super(); this.log = []; this.skinName = skinClass; }
    partAdded(p, i) { this.log.push("partAdded: " + p); }
}
const a = new MyComp(MySkin);
__outArr = [JSON.stringify(a.log), "numChildren=" + a.numChildren, "w=" + a.width];
`, sandbox);
sandbox.__outArr.forEach(l => console.log(l));
```

**注意**：node 環境沒有 `egret.sys.measureText`（那是 `egret.web.js` 靠 canvas 實作的），
所以皮膚裡放 `eui.Label` 一測量就會炸。要測 Label 得改在瀏覽器跑。

### 8.5 什麼時候值得手寫

| | exml 皮膚 | 手寫 Skin 子類 |
|---|---|---|
| 編輯器可視化編輯 | ✅ | ❌ |
| 視圖狀態 `alpha.down="0.5"` 這種語法糖 | ✅ | ❌ 要自己組 `State` / `SetProperty` 物件 |
| 資料綁定 `{data.name}` | ✅ | ❌ 要自己接 `Watcher` |
| 執行期動態生成（數量／結構由資料決定） | ❌ 得靠 states 硬湊 | ✅ 就是普通程式碼 |
| 需要打包進 theme / 走 `EXML.parse` | 要 | **不用** |
| 型別安全 | 弱（id 靠字串對） | 強 |

結論：**能用 exml 就用 exml**（工具鏈都在那邊）；手寫適合「皮膚結構要由程式算出來」或「不想被 theme／載入順序綁住」的場合。
兩者產出的東西在引擎眼中完全等價 —— exml 那條路只是幫你把這個 class 用字串拼出來再 `eval`。

---

## 9. 速查表

| 問題 | 答案 | 依據 |
|---|---|---|
| Skin 是顯示物件嗎？ | ❌ `extends egret.EventDispatcher` | `Skin.ts:76` |
| 可以 `skin.addChild()` 嗎？ | ❌ 沒有這方法，只能設 `elementsContent` | `Skin.ts:231` |
| 皮膚子項的 parent 是誰？ | **宿主元件**，不是 skin | `Component.ts:263` 的 `addChildAt` |
| `skin.width` 有什麼用？ | 只覆蓋宿主的 `measuredWidth` | `Component.ts:691` |
| `skin.x` 呢？ | 不存在 | — |
| skinParts 從哪來？ | exml 產碼時生出的 getter | 見 Lifecycle 文件 §2.1 |
| `partAdded` 何時被叫？ | `setSkin` 迴圈裡，**constructor 內同步跑完** | `Component.ts:338` |
| 沒設 skinName 會怎樣？ | `createChildren()` 找 theme 要 | `Component.ts:609` |
| theme 沒載完就 new？ | 進 `delayList`，載完再補 | `Theme.ts:321, 279` |
| 手動設過 skinName 會被 theme 蓋掉嗎？ | ❌ `skinNameExplicitlySet` 擋住 | `Component.ts:166`, `Theme.ts:281` |
| states 寫在哪？ | **skin 上**，不是元件上 | `Skin.ts:310, 372` |
| 誰決定當前 state？ | 元件 `getCurrentState()` 算，skin 套用 | `Component.ts:664` |
| Group 有 skin 嗎？ | ❌ Group 不是 Component | 見 Group vs DOC 文件 |
| 給錯型別會怎樣？ | `$error 2202`，skin 設成 null | `Component.ts:265` |
| 綁定會自動解除嗎？ | ❌ 要自己叫 `unwatchAll()` | `Skin.ts:362` |

---

## 10. 原始碼索引

| 主題 | 檔案:行 |
|---|---|
| Skin 類別宣告 | `src/extension/eui/components/Skin.ts:76` |
| 尺寸欄位 | `Skin.ts:115, 137, 159, 181, 202, 224` |
| `elementsContent` | `Skin.ts:229-233` |
| `hostComponent` setter | `Skin.ts:258-279` |
| `$stateValues` / `states` / `currentState` | `Skin.ts:294, 310, 327` |
| `unwatchAll` | `Skin.ts:362` |
| 綁定自動補 `hostComponent.` 前綴 | `exml/EXMLParser.ts:1117` |
| Watcher 監聽 `PROPERTY_CHANGE` | `binding/Watcher.ts:352, 366` |
| mixin / registerProperty | `Skin.ts:372-375` |
| `skinName` setter | `components/Component.ts:164` |
| `$parseSkinName` | `Component.ts:187` |
| `onExmlLoaded`（非同步分支） | `Component.ts:223` |
| `setSkin` | `Component.ts:263` |
| `setSkinPart` / `partAdded` / `partRemoved` | `Component.ts:338, 376, 407` |
| `currentState` / `invalidateState` | `Component.ts:524, 554` |
| `getCurrentState`（基底空字串） | `Component.ts:578` |
| `createChildren`（跟 theme 要皮膚） | `Component.ts:609` |
| `commitProperties`（推 state 給 skin） | `Component.ts:660-666` |
| `measure`（吃 skin 尺寸） | `Component.ts:683-712` |
| `Component.unwatchAll` | `Component.ts:1016` |
| `Button.getCurrentState` | `components/Button.ts:251` |
| Theme 建構 / `initialized` | `core/Theme.ts:175-182` |
| `handleDelayList` | `core/Theme.ts:279` |
| `getSkinName` | `core/Theme.ts:320` |
| `findSkinName`（沿繼承鏈） | `core/Theme.ts:337` |
| `mapSkin` | `core/Theme.ts:371` |
| `sys.StateClient` | `states/State.ts:181` |
| `commitCurrentState` | `states/State.ts:232` |
| `initializeStates` | `states/State.ts:285` |
| `State.initialize`（預載 Image） | `states/State.ts:158` |
| `AddItems.apply` | `states/AddItems.ts` |

---

## 11. 尚未查證

- `SetStateProperty` / `SetProperty` 兩種 override 的差異細節本文未展開。
