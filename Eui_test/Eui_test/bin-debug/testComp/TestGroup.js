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
var TestGroup = (function (_super) {
    __extends(TestGroup, _super);
    /**
     * 在ui editor裡面要可見有兩條路
     * 1.實踐UIComponent interface
     * 2.實踐 IViewport interface
     * 只有這兩條路才會被接受
     *
     *
     */
    function TestGroup() {
        return _super.call(this) || this;
    }
    return TestGroup;
}(eui.Group));
__reflect(TestGroup.prototype, "TestGroup");
