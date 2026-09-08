# Egret EUI：exml 與自訂元件是怎麼被引擎建構出來的

> 版本：egret-core 5.4.1（`D:\Egret_test\egret-core-master\egret-core-master`）
> 對照專案：`Eui_test`，`src/TestEui.ts` + `resource/eui_skins/eui_img/TestImg.exml`
> 本文所有程式碼片段皆取自引擎原始碼；第 2 節的產物是**實際跑引擎 parser 產生的**，非手寫示意。
> 姊妹文件：[EgretUIEditor-Custom-Components.md](EgretUIEditor-Custom-Components.md)（編輯器面板那一段）、[Egret-EUI-Skin.md](Egret-EUI-Skin.md)（Skin 本身）

---

## 0. 全貌

分成完全獨立的兩段：

| 段 | 做什麼 | 時機 |
|---|---|---|
| **A** | `.exml` → 一段 JS 原始碼字串 → `eval` → 掛成全域 class（`skins.TestImg`） | Theme 載入時，每個 exml 一次 |
| **B** | `new TestEui()` → 產生 skin 實例 → 分派 skinParts → 上舞台跑生命週期 | 每次 new 元件 |

### 0.1 一句話版：全部都是普通的 `new`

沒有反射、沒有工廠、沒有 DI 容器。整份文件講的機制，實質上只有四個位置：

| 誰被 new | 由誰 new | 位置 |
|---|---|---|
| `TestEui` | 你自己的程式碼；或別人的 exml 產碼裡的 `var t = new TestEui();` | 你的 `.ts` / eval 產物 |
| `skins.TestImg`（皮膚） | `$parseSkinName()` 的 `skin = new clazz()` | `components/Component.ts:~200` |
| `eui.Image` ×2（皮膚子項） | eval 產物的 `numberImage_i()` 裡 `var t = new eui.Image();` | eval 出來的 class |
| exml 產出的 class 本體 | **不是** new 出來的 —— 是 `eval(code)` 得到的建構函式 | `exml/EXMLParser.ts:291` |

唯一「不直接」的一步是**取得建構函式**：

```ts
clazz = egret.getDefinitionByName(skinName);   // 用字串 "skins.TestImg" 查全域拿 constructor
if (clazz) { skin = new clazz(); }
```

字串 → 建構函式是查表（A 段 `eval` 完就掛上全域了），拿到之後仍是規規矩矩的 `new clazz()`。

完整鏈條：
`eval` 生出建構函式 → `getDefinitionByName` 查到它 → `new` 出皮膚 →
皮膚 constructor 再 `new` 出裡面每個子元件 → 經 `skinParts` 指派到宿主的同名屬性上。

---

## 1. 走哪一條解析路徑

`resource/default.thm.json` 的 `exmls` 欄位型態決定走法（`core/Theme.ts:239-253`）：

```ts
if (!data.exmls || data.exmls.length == 0) { ... }
else if (data.exmls[0]['gjs'])
    data.exmls.forEach(exml => EXML.$parseURLContentAsJs(exml.path, exml.gjs, exml.className));
else if (data.exmls[0]['content'])
    data.exmls.forEach(exml => EXML.$parseURLContent(exml.path, exml.content));
else
    EXML.$loadAll(<string[]>data.exmls, this.onLoaded, this, true);
```

本專案的 `exmls` 是**純路徑字串陣列**，因此走最後一條 → 執行期下載 + 解析 + `eval`。
（若改用 webpack 的 `@egret/eui-compiler` 預編譯，才會走 `gjs` 分支，把編譯搬到 build 期，但產物形狀相同。）

---

## 2. A 段：exml → class（字串拼接 + `eval`）

`EXML.parse()`（`exml/EXML.ts:91`）→ `EXMLParser.parse()`（`exml/EXMLParser.ts:291`）：

```ts
let exClass = this.parseClass(xmlData, className);
let code = exClass.toCode();      // ← 拼出一段 JS 原始碼字串
let clazz: any = null;
let geval = eval;
clazz = geval(code);              // ← 真的 eval
if (hasClass && clazz) {
    egret.registerClass(clazz, className);
    let paths = className.split(".");
    let definition = __global;
    for (let i = 0; i < paths.length - 1; i++)
        definition = definition[path] || (definition[path] = {});
    definition[paths[length - 1]] = clazz;   // 掛成 skins.TestImg
}
```

主要流程：`parseClass` → `startCompile` → `addIds` → `createConstructFunc`（`EXMLParser.ts:1189`）→ `EXClass.toCode()`（`exml/CodeFactory.ts`）。

### 2.1 `TestImg.exml` 的實際產出

輸入：

```xml
<e:Skin class="skins.TestImg" width="640" height="1136"
        xmlns:e="http://ns.egret.com/eui" xmlns:w="http://ns.egret.com/wing">
	<w:Config id="19fd7916ad1"/>
	<e:Image id="numberImage" touchEnabled="false" alpha="1" source="test_05_png"
	         fillMode="scale" width="160" x="0" height="128" y="0"/>
	<e:Image id="numberImage2" width="157.006" height="107.717" x="202.773" y="17.976"
	         touchEnabled="false" source="test_02_png"/>
</e:Skin>
```

輸出（引擎 parser 實跑結果，見第 6 節的重現腳本）：

```js
(function (_super) {
	__extends(TestImg, _super);
	function TestImg() {
		_super.call(this);

		this.height = 1136;
		this.width = 640;
		this.elementsContent = [this.numberImage_i(),this.numberImage2_i()];
	}
	var _proto = TestImg.prototype;

	_proto.numberImage_i = function () {
		var t = new eui.Image();
		this.numberImage = t;
		t.alpha = 1;
		t.fillMode = "scale";
		t.height = 128;
		t.source = "test_05_png";
		t.touchEnabled = false;
		t.width = 160;
		t.x = 0;
		t.y = 0;
		return t;
	};
	_proto.numberImage2_i = function () {
		var t = new eui.Image();
		this.numberImage2 = t;
		t.height = 107.717;
		t.source = "test_02_png";
		t.touchEnabled = false;
		t.width = 157.006;
		t.x = 202.773;
		t.y = 17.976;
		return t;
	};
	Object.defineProperty(_proto, "skinParts", {
		get: function () {
			return ["numberImage","numberImage2"];
		},
		enumerable: true,
		configurable: true
	});
	return TestImg;
})(eui.Skin);
```

觀察重點：

- **每個有 `id` 的節點 → 一個 `<id>_i()` 工廠函式**，內容是 `new eui.Image()` 後把屬性一條條指派
- 屬性指派順序是**依屬性名字母排序**，不是 exml 裡的書寫順序（`alpha, fillMode, height, source, touchEnabled, width, x, y`）
- 所有 id 蒐集成 **`skinParts` getter** → 這就是之後 `partAdded` 的名單來源
- 根節點子元素放進 `elementsContent`（`Skin` 的 `@defaultProperty`，`components/Skin.ts:229-232`）
- `<w:Config>` 屬於 wing 命名空間，被略過，不產生任何程式碼
- 產物 `extends eui.Skin`，而 **`Skin extends egret.EventDispatcher`（不是顯示物件）**
  → Skin 只是「一包做好的子元件 ＋ skinParts 清單」，本身不進顯示樹

### 2.2 標籤 → class 名的對應

`EXMLConfig.getClassNameById()`（`exml/EXMLConfig.ts:135`）：

```ts
if (ns == NS_S) {
    if (id == "Object") return id;
    if (coreClasses.indexOf(id) != -1) return "egret." + id;
}
let name = "";
if (basicTypes.indexOf(id) != -1) return id;
if (ns == NS_W) { }
else if (!ns || ns == NS_S) name = MODULE_NAME + id;          // "eui." + id
else                        name = ns.substring(0, ns.length - 1) + id;
if (!getPrototypeOf(name)) name = "";                          // 找不到 → $error 2003
return name;
```

| exml 寫法 | 解析出的 class |
|---|---|
| `xmlns:e="http://ns.egret.com/eui"` + `<e:Image/>` | `eui.Image` |
| `xmlns:ns1="*"` + `<ns1:TestEui/>` | `TestEui`（`"*".substring(0,0)` = `""`） |
| `xmlns:game="game.*"` + `<game:TestEui/>` | `game.TestEui` |
| `xmlns:w=".../wing"` | 略過，不產碼 |

最後那行 `getPrototypeOf(name)` 是硬性檢查：
**解析當下該 class 必須已存在於全域**，否則報 `$error 2003` 且整個 exml 解析失敗。
→ 自訂元件被拖進別人的 exml 時，載入順序（你的 `.js` 要早於 theme 解析）是會踩到的雷。

---

### 2.3 exml 不是只能產 Skin —— 根標籤決定父類

```ts
// exml/EXMLParser.ts:405-407  startCompile()
let superClass = this.getClassNameOfNode(this.currentXML);
this.isSkinClass = (superClass == SKIN_CLASS);      // SKIN_CLASS = "eui.Skin"（:43）
this.currentClass.superClass = superClass;
```

**根標籤是什麼，產物就 extends 什麼。** 實測（腳本見 §6，把根標籤換掉就好）：

| 根標籤 | 產物 | 備註 |
|---|---|---|
| `<e:Skin>` | `extends eui.Skin` | 一般皮膚 |
| `<e:Group>` | `extends eui.Group` | **產物本身就是顯示物件**，`new` 完直接 addChild |
| `<e:Component>` | `extends eui.Component` | 同上 |
| `<ns1:TestGroup>`（自訂 class） | `extends TestGroup` | 解析當下該 class 必須已在全域（§2.2） |
| `<egret:Sprite xmlns:egret="egret.*">` | `extends egret.Sprite` | **可以**，但不能有子節點 → 見下 |

兩個實測出來的限制：

**① 有子節點的根，必須有 `@defaultProperty`。**

```
!! #2012: EXML parsing error: no default property exists on the node;
   and you must explicitly declare the property name that the child node is assigned to
   at <egret:Sprite>  <e:Image id="img"/>
```

`egret.Sprite` 沒登記預設屬性，所以只能當空殼根。
有登記的都在 eui 這邊：`Skin.elementsContent`、`Group.elementsContent`、`DataGroup.dataProvider`…
（`registerProperty(Skin, "elementsContent", "Array", true)` 的第三個參數 `true` 就是它。）
→ **實務上「要放子項的根」幾乎必然是 eui 的類別**，但這是預設屬性的限制，不是繼承關係的限制。

**② `<e:Xxx>`（eui 命名空間）不會解析到 `egret.*`。**

```ts
// exml/EXMLConfig.ts:42, 140
let coreClasses: string[] = ["Point", "Matrix", "Rectangle"];
if (ns == NS_S) { if (coreClasses.indexOf(id) != -1) return "egret." + id; }
...
else if (!ns || ns == NS_S) name = MODULE_NAME + id;      // "eui." + id
```

eui 命名空間下只有 `Point` / `Matrix` / `Rectangle` 三個會走到 `egret.`，其餘一律加 `eui.` 前綴。
所以 `<e:Sprite>` = `eui.Sprite` = 不存在 = `$error 2003`。要用 egret 的類別得自己開命名空間：`xmlns:egret="egret.*"`。
（`egret.Sprite` 當**子節點**是可以的，實測會產出 `new egret.Sprite()` —— 只是它不受 BasicLayout 管，見 [Layout 文件 §3](Egret-EUI-Layout-Constraints.md)。）

**③ `skinParts` getter 是無條件產生的。**

`isSkinClass` 在這版**只被賦值、從來沒有被讀取**（全檔只有 `:196` 宣告與 `:406` 賦值兩處）。
所以 `extends eui.Group`、甚至 `extends egret.Sprite` 的產物身上照樣掛著 `skinParts` getter ——
對非皮膚類別來說是無害的死代碼，只有走 `setSkin()` 的路徑才會有人去讀它。

### 2.4 三種用法對照（本專案實例）

| | 皮膚模式 | 直接模式 | 反向繼承模式 |
|---|---|---|---|
| exml 根標籤 | `<e:Skin>` | `<e:Group>` / `<e:Component>` | `<ns1:你的class>` |
| 產物 | `extends eui.Skin` | `extends eui.Group` | `extends 你的 class` |
| 產物是顯示物件？ | ❌ | ✅ | ✅ |
| 需要手寫宿主 class？ | ✅ 必須 `extends eui.Component` | ❌ 完全不用 | ✅ 但角色相反（被繼承） |
| class 數量 | 2（宿主＋皮膚） | 1 | 2（但只有一個實例型別） |
| `skinName` / `partAdded` | 有 | **沒有** | 沒有 |
| 子項 parent | 宿主 | 它自己 | 它自己 |
| states / 換膚 / theme 預設皮膚 | ✅ | ❌ | ❌ |
| 本專案檔案 | `TestEui.ts` + `TestImg.exml` | `TestGroupRoot.exml` | `testComp/TestGroup.ts` 可當根 |

#### 2.4.1 直接模式實測（`TestGroupRoot.exml`）

```xml
<e:Group class="ui.TestGroupRoot" width="400" height="300" xmlns:e="http://ns.egret.com/eui">
	<e:layout><e:VerticalLayout gap="10" paddingTop="20" paddingLeft="20"/></e:layout>
	<e:Image id="icon" source="test_05_png" width="160" height="128"/>
	<e:Image id="icon2" source="test_02_png" width="157" height="108"/>
</e:Group>
```

產出（節錄，實跑 parser）：

```js
function TestGroupRoot() {
    _super.call(this);
    this.height = 300;
    this.width = 400;
    this.layout = this._VerticalLayout1_i();          // ← layout 也是 new 出來指派
    this.elementsContent = [this.icon_i(), this.icon2_i()];
}
Object.defineProperty(_proto, "skinParts", { get: function () { return ["icon","icon2"]; } });
return TestGroupRoot;
})(eui.Group);                                        // ★ 不是 eui.Skin
```

`new` 出來的實測結果：

```
是 eui.Group 嗎   : true          是顯示物件嗎      : true
numChildren       : 2             icon.parent === g : true
g.icon 直接可用   : true          layout            : eui.VerticalLayout
有 skinName 嗎    : undefined     身上有 skinParts  : ["icon","icon2"]   ← 死代碼,沒人讀
```

用法就是普通顯示物件，不需要任何人來「接」：

```ts
const g = new ui.TestGroupRoot();
g.x = 50; g.y = 600;
this.stage.addChild(g);
```

#### 2.4.2 反向繼承模式：exml 的根 = 你手寫的 class

要寫邏輯又不想要宿主的話走這條。**方向是「產物繼承你」**：

```xml
<ns1:MyPanelBase xmlns:e="http://ns.egret.com/eui" xmlns:ns1="*" width="400" height="300">
    <e:Image id="icon" source="test_05_png" width="160" height="128"/>
</ns1:MyPanelBase>
```

實測（`MyPanelBase extends eui.Group`，自帶 `hello()` 與 constructor 邏輯）：

```
產物繼承鏈           : ui.MyPanel -> MyPanelBase
是 MyPanelBase 嗎    : true          是 eui.Group 嗎 : true
手寫的 method 還在嗎 : 我是手寫 class 的方法，icon=有
手寫 constructor 有跑: clickCount=0   numChildren : 1
```

邏輯在 `.ts`、視覺在 exml、只有一個實例。`src/testComp/TestGroup.ts` 就能直接當這種根。

#### 2.4.3 四個實測出來的陷阱

**① 不能反過來寫 `class MyThing extends ui.TestGroupRoot`。**

TS 編出來是 `(function(_super){...})(ui.TestGroupRoot)`，`<script>` 一載入就求值，
而那時 theme 還沒解析 exml：

```
!! TypeError: Cannot read properties of undefined (reading 'TestGroupRoot')
```

**② exml 產物是 ES5 寫法（`_super.call(this)`），根標籤指到的手寫 class 也必須是 ES5 函式。**

用原生 `class` 語法當基底會爆：

```
TypeError: Class constructor MyPanelBase cannot be invoked without 'new'
```

本專案 `tsconfig.json` 是 `"target": "es5"` 所以沒事；
**改成 es6 以上，所有被 exml 當根標籤的手寫 class 都會爛掉**（含 `TestGroup`）。

**③ build 產的 d.ts 不含子項 id。**

```js
// egret-core/tools/actions/exml.js:241
dts += "declare module " + moduleName + "{\n\tclass " + className + " extends " + result.extendName + "{\n\t}\n}\n";
```

`extendName` 是動態的（Group 根就寫 `extends eui.Group`），但 class body 永遠是空的
→ `g.icon` 型別上拿不到，要 `(g as any).icon` 或自己補 declare。
`TestEui.numberImage` 沒這問題，是因為那是你在 `.ts` 裡自己宣告的欄位。

**④ 新建的 exml 一定要跑 `egret build`。**

`ExmlPlugin.onFinish`（`tools/tasks/exml.ts:30`）才會
① 依 `autoGenerateExmlsList` 把它補進 `default.thm.json` 的 `exmls`
② 重新產生 `libs/exml.e.d.ts`。
`scripts/config.ts` 的 build 流程把 `ExmlPlugin` 排在 `WebpackBundlePlugin` 前面，所以一次 build 就夠。
沒 build 的話 theme 不會解析它，`ui.TestGroupRoot` 執行期根本不存在。

---

## 3. B 段：`new TestEui()` 的完整建構鏈

```
new TestEui()
├─ _super.call(this)                       eui.Component 建構（initializeUIValues …）
└─ this.skinName = 'skins.TestImg'         components/Component.ts:164  setter
   └─ $parseSkinName()                     components/Component.ts:~183
      ├─ typeof skinName == "string"
      │  ├─ 開頭是 "<"        → EXML.parse(text)                    （內嵌字串皮膚）
      │  ├─ getDefinitionByName("skins.TestImg") 找到 → new clazz()  ← A 段 eval 出來的
      │  └─ 找不到且含 ".exml" → EXML.load(skinName, onExmlLoaded)   ← 非同步，setSkin 延後
      └─ setSkin(skin)                     components/Component.ts:263
         ├─ 若不是 eui.Skin 實例 → 丟掉 + $error 2202
         ├─ 卸舊皮膚：setSkinPart(part, null) → partRemoved，removeChild 舊子項
         ├─ for (partName of skin.skinParts)
         │     setSkinPart(partName, skin[partName])    components/Component.ts:338
         │     ├─ this[partName] = instance             ← this.numberImage 在這裡被填上
         │     └─ partAdded(partName, instance)         ★ 你覆寫的 partAdded
         ├─ for (child of skin.$elementsContent) this.addChildAt(child, 0)
         ├─ skin.hostComponent = this
         └─ invalidateSize() / invalidateDisplayList() / dispatchEventWith(Event.COMPLETE)
```

**`partAdded` 是在 constructor 裡同步跑完的。**
`TestEui` 的 `super()`／`skinName=` 都還沒回到你 constructor 的尾巴，`this.numberImage` 就已經有值。

---

## 4. 上舞台：`createChildren` / `childrenCreated` / `ADDED_TO_STAGE` 的先後

```
parent.addChild(testEui)                          display/DisplayObjectContainer.ts:~195
├─ child.$onAddToStage(stage, nestLevel)          DisplayObjectContainer.ts:210
│  └─ eui 覆寫版                                   core/UIComponent.ts:993
│     ├─ this.$super.$onAddToStage.call(...)
│     │     └─ egret 版：只做 $EVENT_ADD_TO_STAGE_LIST.push(self)
│     │        display/DisplayObject.ts:211-216   ← **不派發事件**
│     ├─ checkInvalidateFlag()
│     └─ if (!values[UIKeys.initialized]) {
│          values[UIKeys.initialized] = true;
│          this.createChildren();                 ★ Component.ts:609
│          this.childrenCreated();                ★ 你覆寫的 childrenCreated
│          UIEvent.dispatchUIEvent(this, UIEvent.CREATION_COMPLETE);
│        }
├─ child.dispatchEventWith(Event.ADDED, true)
└─ while (list.length) {                          DisplayObjectContainer.ts:216-222
     let c = list.shift();
     if (c.$stage && notifyListeners) c.dispatchEventWith(Event.ADDED_TO_STAGE);
   }                                              ← **這裡才派發 ADDED_TO_STAGE**
```

所以 `ADDED_TO_STAGE` 一定晚於 `partAdded` → `childrenCreated`，
原因是 egret 的 `$onAddToStage` **刻意只把節點推進 `$EVENT_ADD_TO_STAGE_LIST`**，
等 eui 的生命週期同步跑完、控制權回到 `$addChild` 之後才 flush 清單派事件。
`src/TestEui.ts:11` 的註解是正確的。

順帶：`Component.createChildren()`（`Component.ts:609`）本身只做一件事 ——
**沒設 `skinName` 時**才去問 `eui.Theme` 要預設皮膚並 `$parseSkinName()`。
你已經在 constructor 指定了 `skinName`，所以這步是空轉。

---

## 5. 完整時序表

| # | 事件 | 位置 | 同步/非同步 |
|---|---|---|---|
| 1 | theme 載入 → 逐個 exml `eval` 成 class → 掛上 `skins.*` | `Theme.ts:253` → `EXMLParser.ts:291` | 非同步（一次性） |
| 2 | `new TestEui()` → `super()` | `Component` 建構 | 同步 |
| 3 | `skinName=` → `new skins.TestImg()` → `new eui.Image()` ×2 | eval 產物的 `xxx_i()` | 同步 |
| 4 | **`partAdded`** ×2；子物件 `addChildAt` 進宿主 | `Component.ts:338` | 同步 |
| 5 | `Event.COMPLETE` | `Component.ts:setSkin` 末端 | 同步 |
| 6 | `addChild` 上舞台 → **`createChildren`** → **`childrenCreated`** | `UIComponent.ts:999-1000` | 同步 |
| 7 | `UIEvent.CREATION_COMPLETE` | `UIComponent.ts:1001` | 同步 |
| 8 | **`Event.ADDED_TO_STAGE`** | `DisplayObjectContainer.ts:220` | 同步（但延後 flush） |

### 一個實用推論

若 theme 尚未載完就 `new TestEui()`，`getDefinitionByName` 會落空 →
走 `EXML.load(...)` + `onExmlLoaded` 的**非同步**分支 →
第 3~5 步（含 `partAdded`）有可能落到 `childrenCreated` **之後**，
此時在 `childrenCreated` 裡碰 `this.numberImage` 會拿到 `undefined`。

本專案 `Main.runGame()` 是先 `await` theme 載入才建 `TestEui`，所以維持在同步順序。

---

## 6. 重現腳本

引擎的 `egret.XML.parse` 定義在 `egret.web.js`（靠瀏覽器 `DOMParser`，`build/egret/egret.web.js:5161`），
node 環境沒有，因此用專案既有的 `sax` 重建同形狀的節點物件後注入即可。

```js
// scratchpad/gen.js   用法： node gen.js <path-to.exml>
const fs = require('fs'); const vm = require('vm');
const sax = require('D:/Egret_test/Eui_test/Eui_test/scripts/plugins/node_modules/sax');
const E = 'D:/Egret_test/egret-core-master/egret-core-master/build';
const sandbox = { console };
sandbox.global = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
const run = f => vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
run(E + '/egret/egret.js');
run(E + '/eui/eui.js');

// 以 sax 重建 egret.web.XML 的節點結構
function parseXML(text) {
  const p = sax.parser(true, { xmlns: false });
  let root = null, cur = null; const nsStack = [{}];
  p.onopentag = n => {
    const ns = Object.assign({}, nsStack[nsStack.length - 1]);
    for (const k in n.attributes) if (k.indexOf('xmlns:') === 0) ns[k.slice(6)] = n.attributes[k];
    nsStack.push(ns);
    const i = n.name.indexOf(':');
    const prefix = i === -1 ? '' : n.name.slice(0, i);
    const localName = i === -1 ? n.name : n.name.slice(i + 1);
    const x = { nodeType: 1, parent: cur, localName, prefix,
                namespace: ns[prefix] || '', name: n.name, attributes: {}, children: [] };
    for (const k in n.attributes)
      if (k.indexOf('xmlns:') !== 0) { x.attributes[k] = n.attributes[k]; x['$' + k] = n.attributes[k]; }
    if (cur) cur.children.push(x); else root = x;
    cur = x;
  };
  p.onclosetag = () => { nsStack.pop(); cur = cur.parent; };
  p.ontext = t => { if (cur && t.trim()) cur.children.push({ nodeType: 3, parent: cur, text: t.trim() }); };
  p.write(text).close();
  return root;
}
sandbox.__parseXML = parseXML;
sandbox.__exml = fs.readFileSync(process.argv[2], 'utf8');
vm.runInContext(`
  egret.XML = { parse: __parseXML };
  var parser = new eui.sys.EXMLParser();
  var xml = __parseXML(__exml);
  var cls = xml.attributes["class"]; delete xml.attributes["class"];
  __out = parser["parseClass"](xml, cls).toCode();
`, sandbox);
console.log(sandbox.__out);
```

改任一個 exml 後重跑，就能直接看到引擎會 `eval` 什麼 —— 排屬性順序、狀態（states）、資料綁定的產碼都看得到。

---

## 7. 引擎原始碼索引

| 主題 | 檔案:行 |
|---|---|
| theme 設定載入 / exml 分派 | `src/extension/eui/core/Theme.ts:239-253` |
| `EXML.parse` / `load` / `$loadAll` | `src/extension/eui/exml/EXML.ts:91, 127, 150` |
| 產碼主流程 | `src/extension/eui/exml/EXMLParser.ts:291`（parse）、`364`（parseClass）、`1189`（createConstructFunc） |
| 程式碼樣板 | `src/extension/eui/exml/CodeFactory.ts`（`EXClass.toCode`） |
| 標籤→class 名 | `src/extension/eui/exml/EXMLConfig.ts:135` |
| 根標籤決定父類（`startCompile`） | `exml/EXMLParser.ts:405-407`；`SKIN_CLASS` 定義在 `:43` |
| eui 命名空間只認的三個 egret 類別 | `exml/EXMLConfig.ts:42, 140` |
| exml 的 d.ts 產生器（class body 永遠空的） | `egret-core/tools/actions/exml.js:238, 241` |
| ExmlPlugin：產 d.ts ＋ 更新 thm.json | `egret-core/tools/tasks/exml.ts:30-55` |
| `skinName` setter / `$parseSkinName` | `src/extension/eui/components/Component.ts:164` |
| `setSkin` | `src/extension/eui/components/Component.ts:263` |
| `setSkinPart` / `partAdded` / `partRemoved` | `src/extension/eui/components/Component.ts:338, 376, 407` |
| `createChildren` / `childrenCreated` | `src/extension/eui/components/Component.ts:609` / `core/UIComponent.ts:926` |
| eui 版 `$onAddToStage` | `src/extension/eui/core/UIComponent.ts:993` |
| `Skin.elementsContent` / `hostComponent` | `src/extension/eui/components/Skin.ts:229, 258` |
| egret 版 `$onAddToStage`（推清單） | `src/egret/display/DisplayObject.ts:211-216` |
| `ADDED_TO_STAGE` 實際派發點 | `src/egret/display/DisplayObjectContainer.ts:216-222` |
| `egret.XML.parse` 實作（DOMParser） | `build/egret/egret.web.js:5161` |
