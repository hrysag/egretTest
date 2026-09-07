# Egret UI Editor：自訂元件如何出現在 Component → Custom

> 版本：Egret UI Editor（`C:\Program Files (x86)\Egret\Egret UI Editor`）＋ egret-core 5.4.1
> 本文結論全部取自編輯器 bundle 與引擎 `.d.ts` 的實際原始碼，非推測。

## 0. 一句話結論

要出現在右側面板的 **Custom**，你的 class 必須 **繼承**（extends）一個「自己或祖先類別有寫 `implements eui.UIComponent` 或 `implements eui.IViewport`」的 class，
並且該 class 宣告在 `tsconfig.json` 的 `include` 目錄下、位於檔案最上層或 `namespace` 內。
不需要任何註冊、裝飾器或設定檔。

---

## 1. 決定清單的那段程式碼

檔案：`resources/app/out/egret/workbench/electron-browser/bootstrap/index.js`
模組：`ComponentSourceDataCreater.getRoot()`

```js
const e = exmlConfig.getCustomClasses();
for (let t = 0; t < e.length; t++)
  if (exmlConfig.isInstanceOf(e[t].fullName, "eui.UIComponent") ||
      exmlConfig.isInstanceOf(e[t].fullName, "eui.IViewport")) {
      /* 建立 ComponentStat，isCustom = true，放進 Custom 資料夾 */
  }
```

面板的三個分類（nls key 見 `nls/nls.metadata.zh_CN.json`）：

| id | nls key | 中文 | 資料來源 |
|---|---|---|---|
| `custom` | `componentSourceDataCreater.getRoot.custom` | 自定义 | `getCustomClasses()` 過濾後 |
| `component` | `componentSourceDataCreater.getRoot.component` | 控件 | `getDefaultComponentsDirect()` |
| `container` | `componentSourceDataCreater.getRoot.container` | 布局 | `getDefaultContainersDriect()` |

所以 Custom 要通過**兩道關卡**：進得了 `getCustomClasses()`，再通過 `isInstanceOf`。

---

## 2. 第一關：`getCustomClasses()`

```js
getCustomClasses() {
  this.customClasses = [];
  const e = this._classMap;
  for (const t in e)
    e[t].inEngine || e[t].isInterface || this.customClasses.push(e[t]);
  return this.customClasses;
}
```

= 所有被解析到的 ClassNode 中，**不是引擎內建**且**不是 interface** 的全部收進來。

### 2.1 `inEngine` 怎麼判定

檔案：`resources/app/out/egret/exts/exml-exts/exml/common/project/parsers/process/parseProcess.node.js`（`TsParser` 模組）

```js
const c = ["/libs/modules/egret/", "/libs/modules/eui/",
           "/libs/modules/egret-wasm/", "/libs/modules/eui-wasm/",
           "/libs/modules/gui/", "/libs/modules/res/", "/libs/modules/tween/"];

function l(e) {
  e = e.replace(/\\/g, "/");
  for (let t = 0; t < c.length; t++) if (-1 !== e.indexOf(c[t])) return true;
  return false;
}
// inEngine = l(sourceFile.fileName)
```

純粹是**路徑字串比對**，沒有其他判斷。

> 副作用：本專案的 `libs/exml.e.d.ts` 不在 `/libs/modules/eui/` 底下，
> 所以 `skins.TestImg`、`skins.ButtonSkin` 這些**確實有進** customClasses，
> 只是下一關 `isInstanceOf` 過不了（`eui.Skin extends egret.EventDispatcher`），才沒顯示在面板上。

### 2.2 掃描哪些目錄

`index.js` 的 `getParseFolders()`：

```js
const r = ts.readConfigFile(join(workspace, "/tsconfig.json"), ts.sys.readFile);
const i = r.config.include;
if (i && isArray(i)) for (const n of i) e.push(join(workspace, n));
else { e.push(join(workspace, "src")); e.push(join(workspace, "libs")); }
// 再加上 egretProperties.json 的 eui.exmlRoot
for (const r of projectModel.exmlRoot) e.push(join(workspace, r.fsPath));
return [...new Set(e)];
```

- 主要來源＝ **`tsconfig.json` 的 `include`**（本專案：`src`、`libs`），沒有才 fallback 成 `src` + `libs`
- 外加 `egretProperties.json` → `eui.exmlRoot`（本專案：`resource/eui_skins`）
- `getFiles()` 只收 `.exml` 與 `.ts`，排除 `node_modules`、`.git`、`.DS_Store`
- 另有 `isIgnore()`：路徑以 `bin-debug/`、`bin-release/` 開頭，或含 `node_modules/`，一律略過
  → **`bin-debug` 裡的舊編譯產物完全不影響面板**

`tsconfig.json` 變動會觸發 `onTsConfigChanged` → `changeParseFolders()` 重掃。

### 2.3 哪些宣告會被收進 classMap

`delintNode()`：

```js
if ((e.kind === ts.SyntaxKind.ClassDeclaration ||
     e.kind === ts.SyntaxKind.InterfaceDeclaration) && this.isExport(e, t)) { ... }

isExport(e, t) {
  const r = t.getTypeAtLocation(e).getSymbol();
  return !(!e.parent || e.parent.kind !== ts.SyntaxKind.SourceFile) || !!r.parent;
}
```

- 只認 `class` / `interface` 宣告
- 必須在**檔案最上層**（parent 是 SourceFile），或在 `namespace` / `module` 內（symbol 有 parent）
- **包在函式裡的 class 不會被收**
- `interface` 收得到，但 `isInterface = true`，在 `getCustomClasses()` 被濾掉

解析是用 TypeScript LanguageService 直接讀 `.ts` 原始碼，不是讀編譯後的 JS。

---

## 3. 第二關：`isInstanceOf`（有坑）

```js
isInstanceOfClass(e, t) { return "any" === t || "Class" === t || e === t }

isInstanceOf(e, t) {
  if (this.isInstanceOfClass(e, t)) return true;
  const n = this.getClassNode(e);
  if (!n) return false;
  let r = n.baseClass;                        // ← 從「父類別」開始，跳過自己
  while (r) {
    if (this.isInstanceOfClass(r.fullName, t)) return true;
    const im = r.implementeds;
    for (let k = 0; k < im.length; k++)
      if (this.isInstanceOfClass(im[k].fullName, t)) return true;
    r = r.baseClass;
  }
  return false;
}
```

三個必須知道的細節：

1. **從 `n.baseClass` 起跳，不檢查自己這個 class 的 `implements`。**
   `class Foo extends egret.Sprite implements eui.UIComponent {}` → **不會**出現在 Custom。
2. **比對只是 `fullName` 字串相等，不展開介面繼承。**
   雖然 `IViewport extends UIComponent`，編輯器不會由 `IViewport` 推導出 `UIComponent`
   → 這正是它必須同時判斷兩個介面名的原因。
3. 只沿著 `baseClass` 這條單鏈往上走，每一層順便看該層的 `implementeds`。

---

## 4. 引擎端的實際宣告（`build/eui/eui.d.ts`）

| 行 | 宣告 |
|---|---|
| 410 | `interface UIComponent extends egret.DisplayObject` |
| 1452 | `class Group extends egret.DisplayObjectContainer implements IViewport` |
| 2089 | `class Component extends egret.DisplayObjectContainer implements UIComponent` |
| 2722 | `class DataGroup extends Group` |
| 6154 | `class Image extends egret.Bitmap implements UIComponent` |
| 6578 | `class ItemRenderer extends Component implements IItemRenderer` |
| 6769 | `class Label extends egret.TextField implements UIComponent, IDisplayText` |
| 7359 | `class Panel extends Component` |
| 8281 | `class Rect extends Component` |
| 8476 | `class Scroller extends Component` |
| 8861 | `class Skin extends egret.EventDispatcher` |
| 9556 | `class UILayer extends Group` |
| 11329 | `interface IViewport extends UIComponent` |

**`eui.UIComponent` 是 interface，不是 class。**
引擎 runtime 那邊靠 `sys.implementUIComponent()` 做 mixin
（定義在 `src/extension/eui/core/UIComponent.ts:1847`，於 `Component.ts:1023`、`Group.ts:905`、`Image.ts:675` 呼叫），
但編輯器讀的是 `.d.ts` 上的 `implements` 字面 —— 兩者是不同機制，別混淆。

---

## 5. 對照本專案

| class | 檔案 | 命中路徑 |
|---|---|---|
| `TestEui extends eui.Component` | `src/TestEui.ts:1` | baseClass `eui.Component` 的 `implements UIComponent` → 命中 **UIComponent** |
| `Main extends eui.UILayer` | `src/Main.ts:30` | `UILayer` 無 implements → 上一層 `Group` 的 `implements IViewport` → 命中 **IViewport** |
| `skins.TestImg extends eui.Skin` | `libs/exml.e.d.ts` | 有進 customClasses，但 `Skin` 鏈上無任何 implements → **淘汰** |

兩者走的是**不同**的判斷分支，不是都靠 `UIComponent`。

---

## 6. 速查表

| 寫法 | 出現在 Custom？ | 原因 |
|---|---|---|
| `extends eui.Component` | ✅ | `Component implements UIComponent` |
| `extends eui.Group` / `UILayer` / `DataGroup` | ✅ | `Group implements IViewport` |
| `extends eui.Image` / `eui.Label` | ✅ | 自身 `implements UIComponent` |
| `extends eui.Button` / `Panel` / `Rect` / `Scroller` / `List` | ✅ | 父類是 `Component` |
| `extends MyOwnComponent`（再繼承自己的元件） | ✅ | baseClass 鏈會一路走到 `eui.Component` |
| `extends egret.Sprite` / `egret.DisplayObjectContainer` | ❌ | 鏈上沒有任何 implements |
| `extends egret.Sprite implements eui.UIComponent` | ❌ | 自己的 implements 不被檢查 |
| `extends eui.Skin` | ❌ | `Skin extends egret.EventDispatcher` |
| `interface` | ❌ | `isInterface` 被濾掉 |
| class 寫在函式內 | ❌ | `isExport()` 不通過 |
| class 放在 `bin-debug/` | ❌ | `isIgnore()` 排除 |
| class 放在 `include` 之外的目錄 | ❌ | 根本不會被掃到 |

---

## 7. 最小可用範例

```typescript
// src/MyPanel.ts
class MyPanel extends eui.Component {
    constructor() {
        super();
        this.skinName = "skins.MyPanelSkin";
    }
}
```

存檔後 `MyPanel` 即出現在 Custom。
若包在 `namespace game { }` 內，面板會顯示為 `game.MyPanel`。

### 拖進 exml 時的命名空間

`createNamespace()` 的規則：

- 全域 class（名稱不含 `.`）→ `xmlns:ns1="*"`，寫成 `<ns1:MyPanel/>`
- `namespace game` 內 → `xmlns:game="game.*"`，寫成 `<game:MyPanel/>`
- prefix 若撞名，自動遞增成 `ns2`、`ns3`…

---

## 8. 注意事項

- **不要把 `TestEui` 拖進 `resource/eui_skins/eui_img/TestImg.exml`。**
  `TestImg.exml` 正是 `TestEui` 的皮膚（`this.skinName='skins.TestImg'`），拖進去會造成循環參照。
- 面板刷新由 `fireClassChanged` 觸發（`.ts` 存檔 → `tsFileChanged` → `doFilesChanged`）；
  改 `tsconfig.json` 的 `include` 或 `egretProperties.json` 的 `exmlRoot` 也會重掃。

---

## 9. 尚未查證

Design 視圖是否真的把自訂 class 實例化來繪製（`resources/app/euiruntime` 那條路徑），
本文尚未追過原始碼，暫不下結論。
