var __reflect = (this && this.__reflect) || function (p, c, t) {
    p.__class__ = c, t ? t.push(c) : t = [c], p.__types__ = p.__types__ ? t.concat(p.__types__) : t;
};
var __extends = this && this.__extends || function __extends(t, e) { 
 function r() { 
 this.constructor = t;
}
for (var i in e) e.hasOwnProperty(i) && (t[i] = e[i]);
r.prototype = e.prototype, t.prototype = new r();
};
var TestComp;
(function (TestComp) {
    /**
     * 向這個就不行顯示在ide上面
     */
    var DisplayobjComp = (function (_super) {
        __extends(DisplayobjComp, _super);
        function DisplayobjComp() {
            return _super.call(this) || this;
        }
        return DisplayobjComp;
    }(egret.DisplayObject));
    TestComp.DisplayobjComp = DisplayobjComp;
    __reflect(DisplayobjComp.prototype, "TestComp.DisplayobjComp");
})(TestComp || (TestComp = {}));
