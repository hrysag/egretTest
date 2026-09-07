# EUI 的 layout 與約束（Constrain）：拉扯容器時子項到底會不會動

> 版本：egret-core 5.4.1 ＋ Egret UI Editor（`C:\Program Files (x86)\Egret\Egret UI Editor`）
> 相關：[Egret-EUI-Group-vs-DisplayObjectContainer.md](Egret-EUI-Group-vs-DisplayObjectContainer.md)、[Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md)

---

## 0. 先講結論

**拉容器時子項會不會動，取決於子項有沒有設約束屬性。**

| 子項的設定 | 拉容器時 |
|---|---|
| 只有 `x / y / width / height`（沒有任何約束） | **完全不動**。容器變大就露白，變小就被切掉 |
| `left` + `right` | 寬度跟著容器伸縮（貼兩邊） |
| 只有 `left` 或只有 `right` | 寬度不變，貼著那一邊 |
| `percentWidth="50"` | 寬度永遠是容器的一半 ← 這才是「維持比例」 |
| `horizontalCenter="0"` | 永遠置中 ← 這才是「置中對齊」 |
| `top` / `bottom` / `verticalCenter` / `percentHeight` | 垂直方向同理 |

**預設是什麼都不做**，沒有自動對齊、也沒有自動等比縮放。兩者都要自己開。

（例外：把 `group.layout` 換成 `VerticalLayout` / `HorizontalLayout` / `TileLayout`，x/y 就整個被接管，你設的座標直接作廢。）

---

## 1. layout 是什麼

一個**可插拔的排版策略物件**。Group 自己完全不排版，把「量多大」和「怎麼擺」整包丟給 layout：

```ts
// components/Group.ts:605-624
protected measure(): void {
    if (!this.$layout) { this.setMeasuredSize(0, 0); return; }
    this.$layout.measure();
}

protected updateDisplayList(unscaledWidth: number, unscaledHeight: number): void {
    if (this.$layout) { this.$layout.updateDisplayList(unscaledWidth, unscaledHeight); }
    this.updateScrollRect();
}
```

沒有 layout 的 Group 尺寸就是 0×0、子項也不會被動到。
`Group.createChildren()` 會在沒指定時塞一個 `new BasicLayout()`（`Group.ts:561-563`）。

### 兩個方向

| 方法 | 方向 |
|---|---|
| `measure()` | **子項 → 容器**。算出 measuredWidth/Height，只有容器自己沒被指定寬高時才採用 |
| `updateDisplayList(w, h)` | **容器 → 子項**。在給定的 w×h 內決定每個子項的位置與大小 |

### LayoutBase 介面（`layouts/supportClasses/LayoutBase.ts`）

| 成員 | 作用 |
|---|---|
| `target: Group` | 綁定的容器，`$setLayout()` 雙向接上（`Group.ts:171-186`） |
| `measure()` | 基底是空的，子類覆寫 |
| `updateDisplayList(w, h)` | 基底是空的，子類覆寫 |
| `useVirtualLayout` | 虛擬佈局開關（只有 `DataGroup` / `List` 用得到；`BasicLayout` 設了會 `$error 2201`） |
| `elementAdded` / `elementRemoved` / `scrollPositionChanged` / `getElementIndicesInView` / `setTypicalSize` | 虛擬佈局的回收與可視範圍計算 |

---

## 2. 內建的五種 layout

| class | 排法 | 主要屬性 |
|---|---|---|
| `BasicLayout` | 絕對定位 ＋ 約束求解（**Group 預設**） | 自己沒屬性，靠子項的 left/right/top/bottom/…  |
| `HorizontalLayout` | 水平排 | `gap`、`paddingLeft/Right/Top/Bottom`、`horizontalAlign`、`verticalAlign` |
| `VerticalLayout` | 垂直排 | 同上 |
| `TileLayout` | 網格 | `horizontalGap`/`verticalGap`、`requestedColumnCount`/`requestedRowCount`、`columnWidth`/`rowHeight`、`orientation`、`columnAlign`/`rowAlign` |
| `LinearLayoutBase` | Horizontal/Vertical 的共同基底 | — |

對齊常數：
`JustifyAlign.JUSTIFY / CONTENT_JUSTIFY`、
`ColumnAlign.LEFT / JUSTIFY_USING_GAP / JUSTIFY_USING_WIDTH`、
`RowAlign.TOP / JUSTIFY_USING_GAP / JUSTIFY_USING_HEIGHT`、
`TileOrientation.ROWS / COLUMNS`。

---

## 3. BasicLayout 是約束求解器，不是「不排版」

`layouts/BasicLayout.ts` 的 `sys.updateDisplayList()`，對每個子項跑這套：

```ts
for (let i = 0; i < count; i++) {
    let layoutElement = <eui.UIComponent>(target.getChildAt(i));
    if (!egret.is(layoutElement, "eui.UIComponent") || !layoutElement.$includeInLayout) continue;

    // ── 先決定大小 ──
    if (!isNaN(left) && !isNaN(right))   childWidth = unscaledWidth - right - left;
    else if (!isNaN(percentWidth))       childWidth = Math.round(unscaledWidth * Math.min(percentWidth * 0.01, 1));
    layoutElement.setLayoutBoundsSize(childWidth, childHeight);
    layoutElement.getLayoutBounds(bounds);

    // ── 再決定位置（優先序：center > left/top > right/bottom > 原本的 x/y）──
    if      (!isNaN(hCenter)) childX = Math.round((unscaledWidth - elementWidth) / 2 + hCenter);
    else if (!isNaN(left))    childX = left;
    else if (!isNaN(right))   childX = unscaledWidth - elementWidth - right;
    else                      childX = bounds.x;
    layoutElement.setLayoutBoundsPosition(childX, childY);

    maxX = Math.max(maxX, childX + elementWidth);
    maxY = Math.max(maxY, childY + elementHeight);
}
return egret.$TempPoint.setTo(maxX, maxY);   // → target.setContentSize()
```

直接從程式碼讀出來的行為：

- **left + right 同時給 → 拉伸**。這是 `percentWidth` 之外的第二種彈性寬度來源
- **優先序寫死**：`horizontalCenter` 壓過 `left`，`left` 壓過 `right`，都沒有才用原本的 x
- `left="50%"` 由 `formatRelative()` 換算 —— left/right 相對**容器全寬**，但 `horizontalCenter` 相對**半寬**
- 迴圈開頭那個 `continue`：**純 `egret.Bitmap` / `egret.Sprite` 子項會被整個跳過**，完全不受佈局管；`includeInLayout = false` 也一樣
- 回傳的 `maxX/maxY` 交給 `target.setContentSize()` → 這就是 `contentWidth` / `contentHeight` 的來源，捲動範圍靠它

---

## 4. 無約束時為什麼「看起來像沒作用」

例如 `resource/eui_skins/eui_img/TestImg.exml` 的兩張 Image，只有 x/y/width/height：

```ts
childWidth = NaN;  childHeight = NaN;          // 沒有約束可算
layoutElement.setLayoutBoundsSize(NaN, NaN);
```

`setLayoutBoundsSize(NaN, NaN)`（`core/UIComponent.ts`）：

```ts
if (isNaN(layoutWidth)) {
    values[UIKeys.layoutWidthExplicitlySet] = false;
    width = this.getPreferredUWidth();          // ← 回到 explicitWidth(160) 或 measuredWidth
} else {
    values[UIKeys.layoutWidthExplicitlySet] = true;
    width = Math.max(minWidth, Math.min(maxWidth, layoutWidth));
}
this.setActualSize(width, height);
```

位置那邊 `childX = bounds.x` —— 讀當下的 x 再寫回去。所以結果等於原值。

**但方向是相反的**：layout 每次都重算並覆寫，只是無約束時算出來的答案剛好等於你設的值。
就算完全無約束，它仍然做了這些事：

1. min/max 夾擠（`Math.max(minWidth, Math.min(maxWidth, w))`）
2. 沒設 width 的子項改用 `measuredWidth`（自動量測），不是「維持設定值」
3. 累計 `maxX/maxY` → `setContentSize()` → 捲動範圍
4. 有 rotation / scale / anchorOffset 時，改走 `sys.MatrixUtil.fitBounds()` 求解

---

## 5. 誰在什麼時候呼叫 layout

```
invalidateSize()        → validateSize()        → this.measure()              core/UIComponent.ts:1526
invalidateDisplayList() → validateDisplayList() → this.updateDisplayList(w,h)  core/UIComponent.ts:1572
```

觸發點：

- 子項增刪（`$childAdded` / `$childRemoved` 自動 invalidate）
- 改 width / height
- 改 `layout`（`$setLayout()` 尾端兩行 invalidate）
- 改任何約束屬性

實際執行在下一個 render 週期，或手動 `validateNow()`。

---

## 6. 編輯器的 Constrain 面板就是在寫這些屬性

Property 面板的 **Fast Constrain** / **Detail Constrain** 兩區，寫進 exml 的就是上面那六個約束。

編輯器 bundle `out/egret/workbench/electron-browser/bootstrap/index.js` 的 `ConstraintFastPart`：

```js
e.LEFT="left", e.HORIZONTAL_CENTER="horizontalCenter", e.RIGHT="right",
e.TOP="top",  e.VERTICAL_CENTER="verticalCenter",     e.BOTTOM="bottom",
e.LEFT_AND_RIGHT="leftAndRight", e.TOP_AND_BOTTOM="topAndBottom", e.ALL="all"
```

### Fast Constrain（那排 9 個圖示按鈕）

一鍵套用組合。前 6 個對應單一屬性，後 3 個是「左+右」「上+下」「全部」。
按下去會先把該軸的所有約束（`top` / `bottom` / `verticalCenter` / `y`）清成 NaN 再重設，避免衝突。

### Detail Constrain（方框 ＋ 8 個小方塊）

8 個 checkbox 逐一開關約束。以 LEFT 為例（`ConstraintDetailPart`）：

```js
case u.LEFT:
  if (勾選) {
    const e = this.getAABB(i, i.parent);   // localToGlobal/globalToLocal 算四角包圍盒
    r.setNumber("left", e.x);              // 寫入 left
    r.setProperty("x", null);              // ★ 把 x 移除
    s && r.setProperty("width", null);     // ★ 若 right 也勾了，把 width 一併移除
  } else {
    s ? r.setSize("width", i.width) : (l || r.setNumber("x", i.x));
    r.setProperty("left", null);           // 取消勾選 → 還原 x/width，移除 left
  }
```

`getAABB()` 走 `localToGlobal` / `globalToLocal` 取四角再算包圍盒，所以子項有 rotation / scale 也算得對。

### 對應表

| 面板上勾選 | exml 變成 | 拉容器時 |
|---|---|---|
| 只勾左 | `left="20"`（`x` 被刪掉） | 貼左邊，寬度不變 |
| 左 + 右 | `left="20" right="20"`（`x`、`width` 都被刪掉） | **寬度跟著伸縮** |
| 中間那個（hcenter） | `horizontalCenter="0"`（`x` 被刪掉） | **永遠置中** |
| 全不勾 | 保留 `x="0" width="160"` | 完全不動 ← `TestImg.exml` 目前的狀態 |

**「x 被刪掉」是關鍵。**
BasicLayout 的優先序是 `horizontalCenter > left > right > 原本的 x`，
編輯器直接把 `x` 拿掉，就是為了不讓兩套定位打架。

---

## 7. 用法

```ts
const g = new eui.Group();
const layout = new eui.VerticalLayout();
layout.gap = 10;
layout.paddingLeft = layout.paddingRight = 20;
layout.horizontalAlign = egret.HorizontalAlign.CENTER;
g.layout = layout;      // 換掉預設的 BasicLayout
```

exml：

```xml
<e:Group>
    <e:layout>
        <e:VerticalLayout gap="10" paddingTop="20"/>
    </e:layout>
    <e:Image source="a_png"/>
</e:Group>
```

自訂佈局：`extends eui.LayoutBase`，覆寫 `measure()` 與 `updateDisplayList()` 兩個方法即可，Group 那邊不用改任何東西。

---

## 8. 原始碼索引

| 主題 | 檔案:行 |
|---|---|
| Group 委派 measure / updateDisplayList | `src/extension/eui/components/Group.ts:605-624` |
| Group 預設塞 BasicLayout | `components/Group.ts:561-563` |
| `layout` setter / `$setLayout` | `components/Group.ts:158-186` |
| LayoutBase 介面 | `src/extension/eui/layouts/supportClasses/LayoutBase.ts` |
| BasicLayout 約束求解器 | `src/extension/eui/layouts/BasicLayout.ts`（`sys.measure` / `sys.updateDisplayList`） |
| Linear / Tile 佈局 | `layouts/supportClasses/LinearLayoutBase.ts`、`layouts/TileLayout.ts` |
| 對齊常數 | `layouts/JustifyAlign.ts`、`ColumnAlign.ts`、`RowAlign.ts`、`TileOrientation.ts` |
| `setLayoutBoundsSize` / `getLayoutBounds` | `src/extension/eui/core/UIComponent.ts` |
| validate → measure / updateDisplayList | `core/UIComponent.ts:1526, 1572` |
| 編輯器 Fast Constrain | `resources/app/out/egret/workbench/electron-browser/bootstrap/index.js`（`ConstraintFastPart`） |
| 編輯器 Detail Constrain | 同上（`ConstraintDetailPart`、`getAABB`） |
| 面板標題 nls key | `resources/app/nls/nls.metadata.en_US.json:1690, 1694` |
