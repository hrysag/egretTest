class MovieClipExample extends egret.DisplayObjectContainer{

    private movieClip:egret.MovieClip;

    constructor(){
        super();
        this.addEventListener(egret.Event.ADDED_TO_STAGE,this.init,null);
    }

    private init=()=>{
        //--這邊要load結束後才能用這種方式獲取assets
        const jsonData=RES.getRes('chunli_json');
        const texture=RES.getRes('chunli_png');

        const mcFactory:egret.MovieClipDataFactory=new egret.MovieClipDataFactory(jsonData,texture);
        
        /**
         * test對應chunli.json裡面的mc 裡的 MovieClip 資料名稱
         */
        const mcData:egret.MovieClipData=mcFactory.generateMovieClipData('test'); 
         if (!mcData) {
            throw new Error(
                "chunli.json 中找不到 MovieClip 資料：test"
            );
        }

        this.movieClip=new egret.MovieClip(mcData);
        this.movieClip.addEventListener(egret.Event.LOOP_COMPLETE,()=>{
            console.log('loop_Complete');
        },null);

        this.movieClip.addEventListener(egret.Event.COMPLETE,()=>{
            console.log('mc_Complete');
        },null);


        this.addChild(this.movieClip);
        console.log('mc_ready',mcData,this);

        

        this.createBtn();
        this.testPlay();
    }

    private createBtn():void{
        
        const btn:egret.Sprite=new egret.Sprite();
        btn.graphics.beginFill(0);
        btn.graphics.drawRect(0,0,200,200);
        btn.graphics.endFill();
        this.addChild(btn);
        btn.x=100,btn.y=100;
        btn.touchEnabled=true;

        const label:egret.TextField=new egret.TextField();
        label.text='stop';
        label.textColor = 0xffffff;
        label.size = 24;
        label.width = 160;
        label.height = 60;
        label.textAlign = egret.HorizontalAlign.CENTER;
        label.verticalAlign = egret.VerticalAlign.MIDDLE;
        label.touchEnabled = false;

        btn.addChild(label);
        btn.addEventListener(egret.TouchEvent.TOUCH_TAP,(e)=>{
            //console.log('check_isPlaying',this.movieClip.isPlaying,e.currentTarget);
            const targetLabel:egret.TextField=((e.currentTarget) as egret.Sprite).getChildAt(0) as egret.TextField;
            if(this.movieClip.isPlaying){
                this.movieClip.stop();
                targetLabel && (targetLabel.text = "PLAY");
                this.removeChild(this.movieClip);

            }else{
                this.movieClip.gotoAndPlay('attack',1);
                targetLabel && (targetLabel.text = "STOP");  

            }
        },null)

    }

    public testPlay():void{
        //this.movieClip.play();
        /**
         * attack對應chunli裡面的labels表示動畫名稱
         * -1=無限循環(儘管用stop讓他停止,但不會觸發complete事件)
         * complete事件只適用於播放到自然結束
         */
        this.movieClip.gotoAndPlay('attack',-1);
    }
   
    
}