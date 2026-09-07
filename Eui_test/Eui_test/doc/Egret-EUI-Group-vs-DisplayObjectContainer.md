# eui.Group 與 egret.DisplayObjectContainer 的差異

> 版本：egret-core 5.4.1（`D:\Egret_test\egret-core-master\egret-core-master`）
> 相關：[Egret-EUI-Layout-Constraints.md](Egret-EUI-Layout-Constraints.md)、[Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md)

---

## 0. 一句話

`eui.Group` **就是** `egret.DisplayObjectContainer` 加上四包東西：
① UIComponent（測量／失效／約束）、② 視圖狀態、③ layout、④ IViewport 捲動。

DOC 的 API（`addChild` / `removeChild` / `numChildren` / `swapChildren` …）Group 全部原封不動繼承。

```ts
// components/Group.ts:73, 905-906
export class Group extends egret.DisplayObjectContainer implements IViewport { ... }

sys.implementUIComponent(Group, egret.DisplayObjectContainer, true);   // ① UIComponent
sys.mixin(Group, sys.StateClient);                                     // ② 視圖狀態
```

③ `layout` 與 ④ 捲動是 Group class 內自己實作的。

---

## 1. 差異對照

| 面向 | `egret.DisplayObjectContainer` | `eui.Group` |
|---|---|---|
| **width 讀取語意** | `isNaN($explicitWidth) ? $getOriginalBounds().width : $explicitWidth`<br>（`egret/display/DisplayObject.ts:867`）—— 沒設過就是子項包圍盒 | `validateSizeNow(); return $UIComponent[UIKeys.width]`<br>（`eui/core/UIComponent.ts:1211`）—— 走測量系統 |
| **width 寫入效果** | 只存進 `$explicitWidth`。全引擎只有 `$getWidth()` 讀它<br>→ **對顯示毫無影響**，純粹改變讀回來的數字 | `$setWidth` 會 `invalidateProperties/DisplayList/ParentLayout`<br>（`UIComponent.ts:1221`），下一輪 validate 真的重新佈局 |
| **佈局** | 沒有。子項位置全靠自己設 x/y | `layout` 屬性；`createChildren()` 若未指定會塞 `new BasicLayout()`（`Group.ts:561-563`）。`measure()` / `updateDisplayList()` 整包委派給 layout（`Group.ts:605-624`） |
| **約束屬性** | 無 | `left / right / top / bottom / horizontalCenter / verticalCenter / percentWidth / percentHeight / minWidth / maxWidth / minHeight / maxHeight` |
| **子項增刪** | `$childAdded()` 是空實作（`DisplayObjectContainer.ts:681`） | 被覆寫成自動 `invalidateSize()` + `invalidateDisplayList()`（`UIComponent.ts:1859-1866`，由 `implementUIComponent(..., isContainer=true)` 安裝） |
| **捲動** | 無，要自己算 `scrollRect` | `scrollEnabled` / `scrollH` / `scrollV` / `contentWidth` / `contentHeight`；`updateScrollRect()` 自動維護 `scrollRect`（`Group.ts:327-340`） |
| **命中測試** | 子項沒命中就是沒命中 | `$hitTest` 覆寫：子項沒命中時，只要點落在 width×height 內就回傳自己（`Group.ts:443-465`）。設 `touchThrough = true` 可恢復 DOC 行為 |
| **視圖狀態** | 無 | `states` / `currentState` / `includeIn` / `excludeFrom`（StateClient mixin） |
| **EXML** | 可放，但沒有佈局能力 | `elementsContent` 批次塞子項（`Group.ts:122`），是 exml 的預設容器 |
| **子項存取** | `numChildren` / `getChildAt()` | 多一組 `numElements` / `getElementAt()`，實作上直接回 `this.$children`（`Group.ts:358-380`）。Group 這層兩者等價，差別要到 `DataGroup` 虛擬佈局才出現 |

---

## 2. 兩個實務上最容易踩的點

### 2.1 `group.width` 是「請求」不是「事實」

```ts
group.width = 300;
console.log(group.width);   // 300 —— 但這是 getter 觸發 validateSizeNow() 強制立即測量的結果
```

寫入只是 invalidate；真正生效在下一次 validate。讀取則會**同步強迫**測量一次。
DOC 沒有這套，讀寫都是即時純數值。

### 2.2 Group 預設會吃掉點擊

因為 `$hitTest` 覆寫，一個空白的 Group 只要有寬高就會攔住觸控：

```ts
// components/Group.ts:449-465
let target = super.$hitTest(stageX, stageY);
if (target || this.$Group[Keys.touchThrough]) return target;
// 子項都沒命中 → 只要點在自己的 width×height 內就回傳自己
if (bounds.contains(point.x, point.y)) return this;
return null;
```

以為「透明區域應該穿透」而卡住的情況很常見 —— 解法是 `touchThrough = true` 或 `touchEnabled = false`。

---

## 3. 順帶：Group vs Component

兩個都是 UIComponent，分工不同：

| | 職責 | 沒有的東西 |
|---|---|---|
| `eui.Group` | 有佈局的容器（`layout` 可替換） | **沒有皮膚概念** |
| `eui.Component` | 有皮膚的元件（`skinName` / `skinParts` / `partAdded`） | 佈局只有 BasicLayout 式排版，不可替換 |

`eui.UILayer extends Group`（`build/eui/eui.d.ts:9556`）→ 本專案的 `Main` 走 Group 這條。
`TestEui extends Component` → 走皮膚那條，建構鏈見 [Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md)。

---

## 4. 原始碼索引

| 主題 | 檔案:行 |
|---|---|
| Group 類別宣告 / mixin | `src/extension/eui/components/Group.ts:73, 905-906` |
| `elementsContent` | `Group.ts:122` |
| `layout` / `$setLayout` | `Group.ts:158-186` |
| `updateScrollRect` | `Group.ts:327-340` |
| `numElements` / `getElementAt` | `Group.ts:358-380` |
| `$hitTest` 覆寫 | `Group.ts:443-465` |
| `createChildren`（塞預設 BasicLayout） | `Group.ts:561-565` |
| `measure` / `updateDisplayList` 委派 | `Group.ts:605-624` |
| `implementUIComponent`（含 `$childAdded` 安裝） | `src/extension/eui/core/UIComponent.ts:1847-1868` |
| eui 版 `$getWidth` / `$setWidth` | `core/UIComponent.ts:1211, 1221` |
| egret 版 `$getWidth` / `$setWidth` | `src/egret/display/DisplayObject.ts:865-886` |
| DOC 空的 `$childAdded` | `src/egret/display/DisplayObjectContainer.ts:681` |
