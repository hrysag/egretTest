# Egret 5.4.1 EUI 開發筆記

- 專案：`D:\Egret_test\Eui_test\Eui_test`
- 環境建置與修復請參考同目錄的 `Egret-5.4.1-build-repair.md`

本文件記錄 EUI 開發時的素材、EXML、生命週期與 Theme 相關知識，
不含環境安裝與建置修復（那些在環境文件中）。

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

### 素材的完整讀取鏈路

上面說明的是編輯器端。素材從磁碟到畫面上，編輯器與執行期是兩條分岔的路，
但**共用同一個入口**：`resource/default.res.json`。

以專案中的 `resource/assets/test/05.png` 為例：

```text
resource/assets/test/05.png                        磁碟上的檔案
        │
        ↓ 唯一的登記入口
resource/default.res.json     test_05_png → assets/test/05.png
        │
   ┌────┴──────────────────────────────┐
   │                                   │
編輯器端                            執行期
   │                                   │
Egret UI Editor 的 Assets 面板       Main.ts  RES.loadConfig(
讀同一份 json 建立素材清單               "resource/default.res.json", "resource/")
   │                                   │ 只建立索引，不讀取檔案
   ↓                                   ↓
在 EXML 中拖出 Image 元件            Main.ts  RES.loadGroup("preload", 0, loadingView)
source="test_05_png"                   │ test_05_png 不在 preload 的 keys 裡
   │                                   │
   └────────────┬──────────────────────┘
                ↓
   TestImg.exml  <e:Image id="numberImage" source="test_05_png"/>
                ↓ eui.Image.parseSource()
             eui.getAssets()  →  eui.IAssetAdapter
                ↓ src/AssetAdapter.ts（於 Main.ts 用 egret.registerImplementation 註冊）
             RES.hasRes("test_05_png")  →  true   （loadConfig 已建索引）
             RES.getRes("test_05_png")  →  null   （沒有預載，記憶體裡沒有）
                ↓
             RES.getResAsync("test_05_png")       ← 到這一步才真的讀磁碟
```

#### 為什麼不加入 preload 也顯示得出來

關鍵在專案自己的 `src/AssetAdapter.ts`，不是引擎寫死的行為：

```typescript
public getAsset(source: string, compFunc: Function, thisObject: any): void {
    if (RES.hasRes(source)) {
        let data = RES.getRes(source);
        if (data) {
            onGetRes(data);              // 已預載，直接取用
        }
        else {
            RES.getResAsync(source, onGetRes, this);   // 有登記但沒預載，按需載入
        }
    }
    else {
        RES.getResByUrl(source, onGetRes, this, RES.ResourceItem.TYPE_IMAGE);
    }
}
```

因此三種狀態要分清楚：

| 狀態 | `hasRes` | `getRes` | 結果 |
| --- | --- | --- | --- |
| 已登記 + 在 preload 群組 | true | 有資料 | 立即顯示 |
| 已登記 + 不在 preload | true | null | `getResAsync` 按需載入，會有短暫延遲 |
| **沒登記** | false | — | 退回 `getResByUrl`，把資源鍵當成 URL，通常會失敗 |

第三種就是「圖片明明在磁碟上卻顯示不出來」的典型原因——`default.res.json` 沒登記。

#### 資源群組（groups）的載入與對應關係

以下整理自 `GameModeTest/doc/Animation-Test-Plan.md`。GameModeTest 是動畫功能的先行驗證專案，
其結論預定移植回本專案，資源群組的機制兩邊完全相同。

`RES.loadGroup()` 傳入的字串來自 `resource/default.res.json` 中 `groups` 項目的 `name`，
**不是資料夾名稱，也不是固定的 Egret 關鍵字**。

GameModeTest 的設定：

```json
{
    "keys": "chunli_json,chunli_png",
    "name": "movieclip"
}
```

每個 key 會繼續對應到 `resources` 中相同的 `name`：

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

由於 `movieclip` 是獨立群組而非 `preload` 的一部分，程式使用素材前必須先執行：

```typescript
await RES.loadGroup("movieclip");
```

完成後才可使用：

```typescript
const jsonData = RES.getRes("chunli_json");
const texture = RES.getRes("chunli_png");
```

#### 群組載入與按需載入的取捨

本節出現的兩種做法是同一件事的兩個選擇：

| 做法 | 例子 | 時機 | 代價 |
| --- | --- | --- | --- |
| 放進 `preload` 群組 | 本專案的 `bg_jpg`、`button_up_png` | 啟動時一次載完 | 拉長啟動時間 |
| 放進**獨立群組**，程式自行 `loadGroup` | GameModeTest 的 `movieclip` | 進入某個功能前整組載入 | 需要自行安排載入時機 |
| **不放進任何群組**，靠 AssetAdapter 按需載入 | 本專案的 `test_05_png` | EUI 用到時才載 | 首次顯示會有短暫延遲 |

三種都必須先登記在 `resources`；差別只在**什麼時候被載入記憶體**。

#### 三種名稱不要混淆

同一段流程裡會出現三個長得很像、但層級不同的名稱：

| 名稱 | 定義在哪 | 給誰用 |
| --- | --- | --- |
| `"movieclip"` | `default.res.json` 的 `groups[].name` | 資源**群組**名 → `RES.loadGroup()` |
| `"chunli_json"` | `default.res.json` 的 `resources[].name` | 資源**鍵** → `RES.getRes()` |
| `"test"` | `chunli.json` **檔案內部**的 MovieClip 資料名稱 | `factory.generateMovieClipData()` |

對應的 API：

```typescript
await RES.loadGroup("movieclip");
const jsonData = RES.getRes("chunli_json");
const movieClipData = factory.generateMovieClipData("test");
```

EUI 這邊有相同的分層：`source="test_05_png"` 是**資源鍵**，
`skinName="skins.TestImg"` 是 **EXML 編譯後的 Skin 類別名**，兩者不同層級，不要互相代入。

#### 三個設定檔的分工

| 檔案 | 負責 |
| --- | --- |
| `resource/default.res.json` | 資源鍵 → 檔案路徑，以及載入群組。編輯器與執行期共用 |
| `resource/default.thm.json` | EXML 清單與 EUI 元件的預設 Skin 對應 |
| `egretProperties.json` | 引擎模組／Runtime，與素材無關 |

`TestImg.exml` 必須同時滿足兩邊才會正常：素材鍵登記在 `default.res.json`，
EXML 本身登記在 `default.thm.json` 的 `exmls` 陣列。

`egretProperties.json` 與 `resource/default.res.json` **不能互相取代**：

- `egretProperties.json` 決定哪些引擎模組／Runtime 進入編譯與 Build 輸出。
  例如 MovieClip API 位於 `game` 模組、DragonBones API 位於 `dragonBones` 模組。
  加入模組**不會**自動登記任何 JSON、PNG、音效或其他遊戲素材。
- `resource/default.res.json` 決定 RES 認得哪些素材。
  放進 `resource` 資料夾的檔案不會只因為存在就能用 `RES.getRes()` 取得。

兩者常常必須同時設定。以 MovieClip 為例：

1. `egretProperties.json` 啟用 `game` 模組，提供 `egret.MovieClip` API。
2. `resource/default.res.json` 登記序列幀 JSON 與 PNG，讓 RES 能載入素材。

#### 現況備註

本節前面的範例列出了 `assets/05.png` 與 `assets/test/05.png` 兩張圖，
但專案目前**只有 `assets/test/05.png` 存在並登記為 `test_05_png`**；
`assets/05.png` 與資源鍵 `05_png` 都不存在。前者是當初的規劃，後者是實際結果。

本專案的 `default.res.json` 目前**只有 `preload` 一個群組**，尚未建立任何獨立群組。
GameModeTest 的 `movieclip` 群組是移植來源，尚未併入。

依 `GameModeTest/doc/Animation-Test-Plan.md` 的移植清單，與本節相關的是：

```text
4. 複製已驗證素材。
5. 合併 default.res.json 資源與群組。
9. 確認 Theme／EXML 不影響初始化順序。
```

第 5 項要注意資源鍵不可衝突（同 `name` 唯一性規則）；
第 9 項是因為本專案的 `Main.ts` 會先 `loadTheme()` 再 `loadGroup()`，
移植動畫時要確認新增的群組載入不會插進 Theme 尚未就緒的時間點。

## EXML 與畫面尺寸

### 結論：exml 是什麼

> exml = 一份記錄畫面結構的格式；標籤指到哪個類別，runtime 就把那個物件 new 出來。
> 你自己寫一個 class（`TestEui`）用 `skinName` 跟它關聯，就能操作標籤裡擺的東西（id ↔ 同名欄位）。
> 唯一要注意：exml 是被編成 class 再 `eval`，標籤的類別必須在解析當下已在全域，否則整份掛掉（`$error 2003`）。

以下兩節是拿其他引擎來對照，方便從既有經驗切進來，不影響上面的結論。

### 以 Cocos Creator 的概念理解 EXML

> 本節 Egret 側的敘述都經原始碼查證（見 [Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md)、
> [Egret-EUI-Skin.md](Egret-EUI-Skin.md)）；Cocos 側是概念對照，未查 Cocos 原始碼。

#### 一句話：exml 不是 Prefab

| | Cocos Prefab | Egret exml |
|---|---|---|
| 本體 | 序列化的**資料**（JSON asset） | 一段 **JS 原始碼字串** |
| 執行期怎麼變成東西 | `instantiate()` 反序列化 → 深拷貝節點樹 | `eval(code)` → 得到一個 **class**，再 `new`（`EXMLParser.ts:291`） |
| 產物 | 節點樹實例 | 建構函式 |
| 屬性怎麼套上去 | 反序列化寫回欄位 | **產碼時就寫死成一行行指派**（`t.width = 160; t.x = 0;`） |

比喻上更接近 **Android 的 XML layout** 或 **Qt 的 `.ui`** ——「會被編譯成 class 的介面原始碼」，
而不是 Prefab 那種「實例快照」。實跑 parser 的產物（本文件姊妹篇 §2.1）就是硬編碼的建構函式，不是資料。

#### 比較單位不同，結論就不同

**根是 `<e:Skin>` 的 exml 單獨拿出來，沒有東西可以放上舞台。** 實測：

```
skin instanceof egret.DisplayObject : false
container.addChild(skin) : TypeError -> child.$setParent is not a function
```

`Skin extends egret.EventDispatcher`，不是顯示物件。真正上舞台的是你手寫的宿主：

```
new TestEui()  →  constructor 裡 new skins.TestImg()  →  setSkin() 把皮膚的子項
                  「搬進 TestEui 自己的顯示樹」，skin 物件本身留在外面
實測：skin.$elementsContent[0].parent === host  →  true
```

| 拿來比的單位 | Cocos 對應 |
|---|---|
| `TestImg.exml` **單獨一個檔案** | **沒有對應物**。它是「半個 Prefab」，沒有 `TestEui.ts` 就沒有東西能上場 |
| `TestEui.ts` **＋** `TestImg.exml` 一組 | ✅ 這才等於一個「掛了腳本的 Prefab」 |
| `TestGroupRoot.exml` 單獨一個檔案 | ✅ 一份檔案自己就等於 Prefab（根是 `<e:Group>`，產物本身就是顯示物件） |

差別：Cocos 的 Prefab **一份檔案自己成立**（節點樹＋掛在上面的腳本都序列化在裡面）；
EUI 的皮膚模式**硬性拆成兩份** —— 視覺在 exml、邏輯在 `.ts`，靠 `skinName` 字串在執行期綁。

#### 逐項對照

| Egret EUI | Cocos Creator | 差在哪 |
|---|---|---|
| exml（根是 `<e:Group>`） | Prefab | 最貼近的一個 |
| exml（根是 `<e:Skin>`） | 沒有對應物 | 見上表 |
| `eui.Group` | Node（＋ Layout component） | Group 自帶 layout，Cocos 是另外掛一顆 |
| `eui.Image` / `Label` | Node ＋ Sprite / Label | **EUI 是繼承**（`Image extends egret.Bitmap`），Cocos 是 Node 掛 component 的**組合** |
| exml 的 `id` → `partAdded` | `@property(Sprite) icon` ＋ 編輯器拖引用 | Cocos 在編輯期把引用序列化進 prefab；EUI 是**執行期用字串名比對**（`this[partName] = instance`），拼錯就是 undefined，編譯器不管 |
| `left/right/top/bottom`、`percentWidth` | Widget | 最像的一組。差別：Widget 是掛在子節點上的 component，EUI 是子項的屬性、由父容器的 `BasicLayout` 求解 |
| `VerticalLayout` / `TileLayout` | Layout component | 幾乎一樣，都掛在父容器上 |
| `states` ＋ `alpha.down="0.5"` | 沒有通用等價物 | 勉強像 Button 的 transition；EUI 的 states 可覆寫任意屬性、增刪節點 |
| `default.thm.json` | 沒有 | 一張全域的「元件類別 → 預設皮膚」表，Cocos 得自己 `resources.load` |
| `default.res.json` | 資源索引 / Asset Bundle | — |

#### Prefab 有、exml 沒有

1. **巢狀 Prefab 的覆寫（overrides）** —— exml 巢狀就只是 `new` 別的 class（`<ns1:TestGroup width="200"/>`），屬性直接寫死在產碼裡，沒有「覆寫」概念
2. **執行期可改的資料** —— exml `eval` 完就是 class，只能改實例
3. **節點 UUID** —— exml 只有 `id` 字串，改名就斷

#### exml 有、Prefab 沒有

**換皮**：同一個 `TestEui` 改 `skinName` 就換一套外觀，`partRemoved` / `partAdded` 會自動跑（實測見 [Egret-EUI-Skin.md](Egret-EUI-Skin.md) §8.3 的 G 案例）。Cocos 得換整個 prefab。

這條血統來自 **Flex 的 SkinnableComponent**，不是遊戲引擎那條線 —— 所以它在 Cocos 裡找不到對應物是正常的。

#### 結構理解仍然成立

```xml
<e:Skin xmlns:e="http://ns.egret.com/eui">
    <e:Group>
        <e:Image source="test_05_png"/>
        <e:Label text="Hello"/>
    </e:Group>
</e:Skin>
```

節點層級上可以這樣看：

```text
（宿主元件 = 掛了腳本的 Node）
└─ Group（Node）
   ├─ Image（Node + Sprite）
   └─ Label（Node + Label）
```

只是要記得最外層那個 `<e:Skin>` **不是一個節點** —— 它是「一包子節點 ＋ skinParts 名單」，
執行期會被拆開塞進宿主。

### 以 Flash / AS3 的概念理解 EXML

> Egret 側經原始碼查證；Flash / Flex 側是概念對照。

#### exml 就是 MXML

EUI 是 **Flex 4（Spark）架構的移植**，連方法名都照抄。前面文件裡幾個看起來莫名其妙的設計，用 Flex 一看就通：

| Flex 4 / MXML | Egret EUI | 出處 |
|---|---|---|
| `.mxml` → mxmlc 編成 AS3 class | `.exml` → 產 JS 原始碼 → `eval` 成 class | `EXMLParser.ts:291` |
| `<s:Skin>` | `<e:Skin>` | — |
| `skinClass`（CSS） | `skinName` | `Component.ts:164` |
| `[SkinPart]` metadata | `skinParts` 陣列 | `CodeFactory.ts:436` 產 getter |
| `partAdded()` / `partRemoved()` | **同名** | `Component.ts:376, 407` |
| `getCurrentSkinState()` | `getCurrentState()` | `Component.ts:578` |
| `[HostComponent("...")]` metadata | `<w:HostComponent name="..."/>` | 編輯器留著讀但沒人用的死欄位，見 [Egret-EUI-Skin.md](Egret-EUI-Skin.md) §7.5.1 |
| skin 內用 `hostComponent.xxx` | **同名**，parser 自動補前綴 | `EXMLParser.ts:1117` |
| `alpha.down="0.5"` 狀態屬性語法 | **同語法** | `EXMLParser.ts:524-526`；`ButtonSkin.exml` 就有 `alpha.disabled="0.5"` |
| `<fx:Declarations>` | `<w:Declarations>` | `EXMLParser.ts:44` |
| `SkinnableComponent` | `eui.Component` | — |
| `Group` / `BasicLayout` / `VerticalLayout` | **全部同名** | — |
| `left/right/top/bottom`、`percentWidth` | **全部同名** | — |

→ 「Skin 為什麼要拆成兩個 class」的答案在這裡：它不是遊戲引擎的設計，是 Flex 的血統。

#### 只講純 Flash：Library symbol + Export for ActionScript

| Flash IDE | Egret exml |
|---|---|
| Library 裡擺好美術的 MovieClip symbol | 一份 exml |
| 勾 **Export for ActionScript** ＋ 填 **Class** 欄位 | `class="skins.TestImg"` |
| Symbol Properties 的 **Base class** 欄位 | **根標籤**（決定 extends 誰） |
| 子項的 **instance name** → 自動變成類別屬性 `this.icon` | `id` → `this.numberImage` |
| `new MySymbol()` 得到一個 MovieClip 子類 | `new skins.TestImg()` 得到一個 class |

**Base class 欄位**那條就是 [Egret-EUI-Component-Lifecycle.md](Egret-EUI-Component-Lifecycle.md) §2.4.2 的「反向繼承模式」——
Flash 裡填自己的類別，生成的 symbol 就 extends 你的類別；exml 把根標籤指到自訂 class 是同一回事。

`this.icon` vs `getChildByName('icon')`、拼錯 instance name 就拿到 undefined —— Flash 時代一模一樣的坑。

#### 差異

| | Flash symbol | exml |
|---|---|---|
| 儲存形式 | SWF 內的**二進位序列化資料** | **產原始碼再 eval** |
| 屬性 | 反序列化寫回 | 編譯進建構函式的硬編碼指派（`t.width = 160;`） |
| 時間軸 / frame label / `gotoAndPlay` | 有 | **沒有**。states 取代 frame label（`currentState = "down"` ≈ `gotoAndStop("down")`），補間交給 `egret.Tween` |
| 測量 / 失效系統 | 沒有 | 有（`invalidateSize` → `measure` → `updateDisplayList`），Flex 帶進來的 |

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

