/**
 * 
 * exml = 一份記錄畫面結構的格式；標籤指到哪個類別，runtime 就把那個物件 new 出來。
 * 你自己寫一個 class（TestEui）用 skinName 跟它關聯，就能操作標籤裡擺的東西（id ↔ 同名欄位）。
 * 唯一要注意：exml 是被編成 class 再 eval，標籤的類別必須在解析當下已在全域，否則整份掛掉（$error 2003）。
 * 
 * 
 * 【以 Cocos Creator 的概念理解這個檔案】
 *
 * 一句話：exml 不是 Prefab。Prefab 是「序列化的實例資料」，
 * exml 是「一段會被 eval 成 class 的 JS 原始碼」(EXMLParser.ts:291)。
 *
 * ── 誰才是顯示物件 ──────────────────────────────────────────
 * addChild 上舞台的是 TestEui(這個手寫 class)，不是 exml 的產物。
 * exml 產出的 skins.TestImg 是 eui.Skin,而 Skin extends egret.EventDispatcher,
 * 根本不是顯示物件。實測:
 *     skin instanceof egret.DisplayObject : false
 *     container.addChild(skin) : TypeError -> child.$setParent is not a function
 *
 * 實際流程:
 *     new TestEui()
 *       └─ constructor 裡 skinName='skins.TestImg' → new skins.TestImg()
 *          └─ setSkin() 把皮膚的兩張 Image「搬進 TestEui 自己的顯示樹」
 *             skin 物件本身留在外面當「名單 + 狀態機 + 綁定根」,不進顯示樹
 *     實測: skin.$elementsContent[0].parent === host → true
 *
 * ── 對照 Cocos ─────────────────────────────────────────────
 * 拿來比的單位不同,結論就不同:
 *   TestImg.exml 單獨一個檔案     → Cocos 沒有對應物。它是「半個 Prefab」,
 *                                   沒有 TestEui.ts 就沒有東西能上場
 *   TestEui.ts + TestImg.exml 一組 → 這才等於一個「掛了腳本的 Prefab」
 *   TestGroupRoot.exml 單獨一個檔案 → 一份檔案自己就等於 Prefab(根是 <e:Group>,
 *                                   產物本身就是顯示物件,new 完直接 addChild)
 *
 * 差別:Cocos 的 Prefab 一份檔案自己成立(節點樹＋掛在上面的腳本都序列化在裡面);
 * EUI 的皮膚模式硬性拆成兩份 —— 視覺在 exml、邏輯在 .ts,靠 skinName 字串在執行期綁。
 *
 * 
 * 
 * 
 
 *
 * ── Prefab 有、exml 沒有 ───────────────────────────────────
 *   1. 巢狀 Prefab 的覆寫(overrides) —— exml 巢狀就只是 new 別的 class,
 *      屬性直接寫死在產碼裡,沒有「覆寫」概念
 *   2. 執行期可改的資料 —— exml eval 完就是 class,只能改實例
 *   3. 節點 UUID —— exml 只有 id 字串,改名就斷
 *
 * ── exml 有、Prefab 沒有 ───────────────────────────────────
 *   換皮:同一個 TestEui 改 skinName 就換一套外觀,
 *   partRemoved / partAdded 會自動跑。Cocos 得換整個 prefab。
 *   (這條血統來自 Flex 的 SkinnableComponent,不是遊戲引擎那條線)
 *
 * 詳見 doc/Egret-EUI-Skin.md、doc/Egret-EUI-Component-Lifecycle.md
 */
class TestEui extends eui.Component{
    //--這個就是 exml 裡面的id(就是面板當中物件欄位顯示的id)
    public numberImage: eui.Image;
    public numberImage2:eui.Image;
    private _lastTime:number=0;
    constructor(){
        super();
        //--對skin綁定
        this.skinName='skins.TestImg';//--skin class id path
        this.addEventListener(egret.Event.ADDED_TO_STAGE,()=>{
            //--會在partAdded->childrenCreated 完成後才呼叫
            console.log('added');
            this._lastTime = egret.getTimer();
            //--這邊註冊函示後面不帶this的話,接的方法要寫成箭頭函式,不然會抓不到this
            //egret.startTick(this.update, null);
            //egret.startTick(this.update, this);

            //this.addEventListener(egret.Event.ENTER_FRAME,this._onEnterFrame,null);
            this.testTween();
            
        },null);

        this.addEventListener(egret.Event.REMOVED_FROM_STAGE,()=>{
            egret.stopTick(this.update,this);
        },null);
    }

    private testTween():void{
        egret.Tween.get(this.numberImage,
            {
                //onChange:()=>{
                    //--有wait(delay)也會執行
                    //console.log('onChange',this);
                //}
                loop: true//--他會連Wait也一併算在loop的內容
            }
            
        )
        .wait(5000)
        .to(
            {rotation:360},
            2000,//--單位是毫秒..有夠爛的
            egret.Ease.backOut
        )
        .set({ rotation: 0 })//--這邊是立即改變的
        .call(()=>{
            console.log('tweenComplete');  
        })

    }

    private _onEnterFrame=(e)=>{
        this.numberImage.rotation += 1;
    }

    private update(timeStamp: number):boolean{
    //private update=(timeStamp: number):boolean=>{
        const dt: number = (timeStamp - this._lastTime) / 1000;
        this._lastTime = timeStamp;
        this.numberImage.rotation += 90 * dt;
        console.log('check_this',this);
        // false 表示不要求立即強制重繪。
        return false;
    }
    
    //--舊版的tsconfig不支援override
    /**
     * 會晚於partAdded被呼叫-component被創造的時候會呼叫
     * 只有component才有
     */
    protected childrenCreated(): void {
        super.childrenCreated();
        
        // EXML 內的元件建立完成後，可在這裡操作
        this.numberImage.alpha = 1;//-0到1之間
        console.log('run_childrenCreated');
        this.numberImage.anchorOffsetX=this.numberImage.width/2;
        this.numberImage.anchorOffsetY=this.numberImage.height/2;
        //--跟flash相同左上角(0,0);
        this.numberImage.x=this.width/2;
        this.numberImage.y=this.height/2;

        //this.numberImage.skewX=30;//--斜切(送角度進去,裡面會換弧度)
        this.numberImage.rotation=45;//--送角度進去(裡面會轉成弧度)flash 的座標轉法(往右開始轉)

    }

    /**
     * 1.會先被呼叫(添加皮肤部件时调用)
     * partAdded只有eui才有 
     * 
     */
    protected partAdded(partName: string, instance: any): void {
        super.partAdded(partName,instance);
        
        console.log('run_partAdded');
    }

}