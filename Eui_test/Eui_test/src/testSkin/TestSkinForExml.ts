

//--這編寫export這樣鐵定噴錯-你要用namespace包起來才能用
//--不然就要拿掉
//export class TestSkinForExml extends eui.Component{
class TestSkinForExml extends eui.Component{

    /**
     * 皮膚模式（你現在用的）= 宿主 + 皮膚兩個 class
     */
    constructor(){
        super();
        this.skinName='skins.Test_Skin_1';
    }

}

