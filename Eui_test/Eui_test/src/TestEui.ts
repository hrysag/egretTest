class TestEui extends eui.Component{
    //--這個就是 exml 裡面的id(就是面板當中物件欄位顯示的id)
    public numberImage: eui.Image;
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