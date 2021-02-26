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
var labelling_tool;
(function (labelling_tool) {
    var AbstractLabelClass = /** @class */ (function () {
        function AbstractLabelClass() {
        }
        AbstractLabelClass.prototype.fill_name_to_class_table = function (table) {
        };
        AbstractLabelClass.prototype.to_html = function () {
            return '';
        };
        return AbstractLabelClass;
    }());
    labelling_tool.AbstractLabelClass = AbstractLabelClass;
    var LabelClass = /** @class */ (function (_super) {
        __extends(LabelClass, _super);
        function LabelClass(j) {
            var _this = _super.call(this) || this;
            _this.name = j.name;
            _this.human_name = j.human_name;
            _this.colours = {};
            if (j.colours !== undefined) {
                // Multiple colours; new form
                for (var colour_scheme in j.colours) {
                    _this.colours[colour_scheme] = labelling_tool.Colour4.from_rgb_a(j.colours[colour_scheme], 1.0);
                }
            }
            else if (j.colour !== undefined) {
                // Single colour; old form
                _this.colours['default'] = labelling_tool.Colour4.from_rgb_a(j.colour, 1.0);
            }
            return _this;
        }
        LabelClass.prototype.fill_name_to_class_table = function (table) {
            table[this.name] = this;
        };
        LabelClass.prototype.to_html = function () {
            return '<option value="' + this.name + '">' + this.human_name + '</option>';
        };
        return LabelClass;
    }(AbstractLabelClass));
    labelling_tool.LabelClass = LabelClass;
    var LabelClassGroup = /** @class */ (function (_super) {
        __extends(LabelClassGroup, _super);
        function LabelClassGroup(human_name, label_classes) {
            var _this = _super.call(this) || this;
            _this.human_name = human_name;
            _this.label_classes = label_classes;
            return _this;
        }
        LabelClassGroup.prototype.fill_name_to_class_table = function (table) {
            for (var i = 0; i < this.label_classes.length; i++) {
                this.label_classes[i].fill_name_to_class_table(table);
            }
        };
        LabelClassGroup.prototype.to_html = function () {
            var items = [];
            for (var i = 0; i < this.label_classes.length; i++) {
                items.push(this.label_classes[i].to_html());
            }
            return '<optgroup label="' + this.human_name + '">' + items.join('') + '</optgroup>';
        };
        return LabelClassGroup;
    }(AbstractLabelClass));
    labelling_tool.LabelClassGroup = LabelClassGroup;
    function label_classes_from_json(j_items) {
        var result = [];
        for (var i = 0; i < j_items.length; i++) {
            var j = j_items[i];
            if ((j.group_name !== undefined && j.group_name !== null) &&
                (j.group_classes !== undefined && j.group_classes !== null)) {
                // j represents a group of classes
                result.push(new LabelClassGroup(j.group_name, label_classes_from_json(j.group_classes)));
            }
            else {
                // j represents a class
                result.push(new LabelClass(j));
            }
        }
        return result;
    }
    labelling_tool.label_classes_from_json = label_classes_from_json;
})(labelling_tool || (labelling_tool = {}));
//# sourceMappingURL=label_class.js.map