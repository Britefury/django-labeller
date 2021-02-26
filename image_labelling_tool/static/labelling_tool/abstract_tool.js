/*
The MIT License (MIT)

Copyright (c) 2015 University of East Anglia, Norwich, UK

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

Developed by Geoffrey French in collaboration with Dr. M. Fisher and
Dr. M. Mackiewicz.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
/// <reference path="./math_primitives.ts" />
/// <reference path="./abstract_label.ts" />
var labelling_tool;
(function (labelling_tool) {
    /*
    Abstract tool
     */
    var AbstractTool = /** @class */ (function () {
        function AbstractTool(view) {
            this._view = view;
        }
        AbstractTool.prototype.on_init = function () {
        };
        ;
        AbstractTool.prototype.on_shutdown = function () {
        };
        ;
        AbstractTool.prototype.on_switch_in = function (pos) {
        };
        ;
        AbstractTool.prototype.on_switch_out = function (pos) {
        };
        ;
        AbstractTool.prototype.on_left_click = function (pos, event) {
        };
        ;
        AbstractTool.prototype.on_cancel = function (pos) {
            return false;
        };
        ;
        AbstractTool.prototype.on_button_down = function (pos, event) {
        };
        ;
        AbstractTool.prototype.on_button_up = function (pos, event) {
        };
        ;
        AbstractTool.prototype.on_move = function (pos) {
        };
        ;
        AbstractTool.prototype.on_drag = function (pos, event) {
            return false;
        };
        ;
        AbstractTool.prototype.on_wheel = function (pos, wheelDeltaX, wheelDeltaY) {
            return false;
        };
        ;
        AbstractTool.prototype.on_key_down = function (event) {
            return false;
        };
        ;
        AbstractTool.prototype.on_entity_mouse_in = function (entity) {
        };
        ;
        AbstractTool.prototype.on_entity_mouse_out = function (entity) {
        };
        ;
        AbstractTool.prototype.notify_entity_deleted = function (entity) {
        };
        return AbstractTool;
    }());
    labelling_tool.AbstractTool = AbstractTool;
    var ProxyTool = /** @class */ (function (_super) {
        __extends(ProxyTool, _super);
        function ProxyTool(view, tool) {
            var _this = _super.call(this, view) || this;
            _this.underlying_tool = tool;
            _this._last_pos = null;
            return _this;
        }
        ProxyTool.prototype.set_underlying_tool = function (tool) {
            if (this.underlying_tool !== null) {
                if (this._last_pos !== null) {
                    this.underlying_tool.on_switch_out(this._last_pos);
                }
                this.underlying_tool.on_shutdown();
            }
            this.underlying_tool = tool;
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_init();
                if (this._last_pos !== null) {
                    this.underlying_tool.on_switch_in(this._last_pos);
                }
            }
        };
        ProxyTool.prototype.on_init = function () {
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_init();
            }
        };
        ;
        ProxyTool.prototype.on_shutdown = function () {
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_shutdown();
            }
        };
        ;
        ProxyTool.prototype.on_switch_in = function (pos) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_switch_in(pos);
            }
        };
        ;
        ProxyTool.prototype.on_switch_out = function (pos) {
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_switch_out(pos);
            }
            this._last_pos = null;
        };
        ;
        ProxyTool.prototype.on_left_click = function (pos, event) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_left_click(pos, event);
            }
        };
        ;
        ProxyTool.prototype.on_cancel = function (pos) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                return this.underlying_tool.on_cancel(pos);
            }
            else {
                return false;
            }
        };
        ;
        ProxyTool.prototype.on_button_down = function (pos, event) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_button_down(pos, event);
            }
        };
        ;
        ProxyTool.prototype.on_button_up = function (pos, event) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_button_up(pos, event);
            }
        };
        ;
        ProxyTool.prototype.on_move = function (pos) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                this.underlying_tool.on_move(pos);
            }
        };
        ;
        ProxyTool.prototype.on_drag = function (pos, event) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                return this.underlying_tool.on_drag(pos, event);
            }
            else {
                return false;
            }
        };
        ;
        ProxyTool.prototype.on_wheel = function (pos, wheelDeltaX, wheelDeltaY) {
            this._last_pos = pos;
            if (this.underlying_tool !== null) {
                return this.underlying_tool.on_wheel(pos, wheelDeltaX, wheelDeltaY);
            }
            else {
                return false;
            }
        };
        ;
        ProxyTool.prototype.on_key_down = function (event) {
            if (this.underlying_tool !== null) {
                return this.underlying_tool.on_key_down(event);
            }
            else {
                return false;
            }
        };
        ;
        ProxyTool.prototype.on_entity_mouse_in = function (entity) {
            if (this.underlying_tool !== null) {
                return this.underlying_tool.on_entity_mouse_in(entity);
            }
        };
        ;
        ProxyTool.prototype.on_entity_mouse_out = function (entity) {
            if (this.underlying_tool !== null) {
                return this.underlying_tool.on_entity_mouse_out(entity);
            }
        };
        ;
        ProxyTool.prototype.notify_entity_deleted = function (entity) {
            if (this.underlying_tool !== null) {
                return this.underlying_tool.notify_entity_deleted(entity);
            }
        };
        return ProxyTool;
    }(AbstractTool));
    labelling_tool.ProxyTool = ProxyTool;
})(labelling_tool || (labelling_tool = {}));
//# sourceMappingURL=abstract_tool.js.map