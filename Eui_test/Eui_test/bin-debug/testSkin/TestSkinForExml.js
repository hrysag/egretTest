"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var TestSkinForExml = (function (_super) {
    __extends(TestSkinForExml, _super);
    /**
     * 皮膚模式（你現在用的）= 宿主 + 皮膚兩個 class
     */
    function TestSkinForExml() {
        var _this = _super.call(this) || this;
        _this.skinName = 'skins.Test_Skin_1';
        return _this;
    }
    return TestSkinForExml;
}(eui.Component));
exports.TestSkinForExml = TestSkinForExml;
__reflect(TestSkinForExml.prototype, "\"D:/Egret_test/Eui_test/Eui_test/src/testSkin/TestSkinForExml\".TestSkinForExml");
