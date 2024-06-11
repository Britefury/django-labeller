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
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
/// <reference path="./math_primitives.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./root_label_view.ts" />
var labelling_tool;
(function (labelling_tool) {
    function new_BoxLabelModel(centre, size, label_class, source) {
        return { label_type: 'box', label_class: label_class, source: source, anno_data: {}, centre: centre, size: size };
    }
    function BoxLabel_box(label) {
        var lower = { x: label.centre.x - label.size.x * 0.5, y: label.centre.y - label.size.y * 0.5 };
        var upper = { x: label.centre.x + label.size.x * 0.5, y: label.centre.y + label.size.y * 0.5 };
        return new labelling_tool.AABox(lower, upper);
    }
    /*
    Box label entity
     */
    var BoxLabelEntity = /** @class */ (function (_super) {
        __extends(BoxLabelEntity, _super);
        function BoxLabelEntity(view, model) {
            var _this = _super.call(this, view, model) || this;
            _this._table = null;
            return _this;
        }
        BoxLabelEntity.prototype.attach = function () {
            _super.prototype.attach.call(this);
            this._rect = this.root_view.world.append("rect")
                .attr("class", "anno_label")
                .attr("x", 0).attr("y", 0)
                .attr("width", 0).attr("height", 0);
            this.update();
            var self = this;
            this._rect.on("mouseover", function () {
                self._on_mouse_over_event();
            }).on("mouseout", function () {
                self._on_mouse_out_event();
            });
            this._update_style();
        };
        ;
        BoxLabelEntity.prototype.detach = function () {
            this._rect.remove();
            this._rect = null;
            _super.prototype.detach.call(this);
        };
        BoxLabelEntity.prototype._on_mouse_over_event = function () {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_in(this);
            }
        };
        BoxLabelEntity.prototype._on_mouse_out_event = function () {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_out(this);
            }
        };
        BoxLabelEntity.prototype.update = function () {
            var box = BoxLabel_box(this.model);
            var size = box.size();
            this._rect
                .attr('x', box.lower.x).attr('y', box.lower.y)
                .attr('width', size.x).attr('height', size.y);
        };
        BoxLabelEntity.prototype.commit = function () {
            this.root_view.commit_model(this.model);
        };
        BoxLabelEntity.prototype._update_style = function () {
            if (this._attached) {
                var stroke_colour = this._outline_colour();
                var vis = this.get_visibility();
                if (vis == labelling_tool.LabelVisibility.HIDDEN) {
                    this._rect.attr("visibility", "hidden");
                }
                else if (vis == labelling_tool.LabelVisibility.FAINT) {
                    stroke_colour = stroke_colour.with_alpha(0.2);
                    this._rect.attr("style", "fill:none;stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._rect.attr("visibility", "visible");
                }
                else if (vis == labelling_tool.LabelVisibility.FULL) {
                    var circle_fill_colour = this.root_view.view.colour_for_label_class(this.model.label_class);
                    if (this._hover) {
                        circle_fill_colour = circle_fill_colour.lighten(0.4);
                    }
                    circle_fill_colour = circle_fill_colour.with_alpha(0.35);
                    stroke_colour = stroke_colour.with_alpha(0.5);
                    this._rect.attr("style", "fill:" + circle_fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._rect.attr("visibility", "visible");
                }
            }
        };
        BoxLabelEntity.prototype.compute_centroid = function () {
            return this.model.centre;
        };
        ;
        BoxLabelEntity.prototype.compute_bounding_box = function () {
            return BoxLabel_box(this.model);
        };
        ;
        BoxLabelEntity.prototype.contains_pointer_position = function (point) {
            return this.compute_bounding_box().contains_point(point);
        };
        BoxLabelEntity.prototype.distance_to_point = function (point) {
            return BoxLabel_box(this.model).distance_to(point);
        };
        BoxLabelEntity.prototype.is_table_structure_label = function (label) {
            var _a;
            var label_class = label !== null && label !== void 0 ? label : (_a = this === null || this === void 0 ? void 0 : this.model) === null || _a === void 0 ? void 0 : _a.label_class;
            if (label_class === null || label_class === undefined)
                return false;
            var table_structure_classes = [
                "table_column",
                "table_column_header",
                "table_projected_row_header",
                "table_row",
                "table_spanning_cell",
            ];
            return table_structure_classes.indexOf(label_class) !== -1;
        };
        BoxLabelEntity.prototype.get_parent_table = function () {
            var _this = this;
            if (this._table !== null)
                return this._table;
            if (!this.is_table_structure_label())
                return null;
            var entity_id = this.get_entity_id();
            var entities = this.root_view.get_entities();
            var table_entities = entities.filter(function (e) { return e.model.label_class === "table"; });
            table_entities.forEach(function (entity) {
                if (entity.distance_to_point(_this.compute_centroid()) < 10) {
                    var bbox_1 = entity.compute_bounding_box();
                    var columns = entities.filter(function (e) {
                        return entity_id !== e.get_entity_id() && e.model.label_class === "table_column" && bbox_1.contains_point(e.compute_bounding_box().centre());
                    }).map(function (e) { return e.compute_bounding_box(); });
                    var rows = entities.filter(function (e) {
                        return entity_id !== e.get_entity_id() && e.model.label_class === "table_row" && bbox_1.contains_point(e.compute_bounding_box().centre());
                    }).map(function (e) { return e.compute_bounding_box(); });
                    _this._table = {
                        bbox: bbox_1,
                        columns: columns,
                        entity: entity,
                        label: _this.model.label_class,
                        rows: rows,
                        threshold: {
                            x: Math.max(10, Math.ceil((bbox_1.upper.x - bbox_1.lower.x) / 100)),
                            y: Math.max(10, Math.ceil((bbox_1.upper.y - bbox_1.lower.y) / 100)),
                        }
                    };
                    return _this._table;
                }
            });
            return null;
        };
        return BoxLabelEntity;
    }(labelling_tool.AbstractLabelEntity));
    labelling_tool.BoxLabelEntity = BoxLabelEntity;
    labelling_tool.register_entity_factory('box', function (root_view, model) {
        return new BoxLabelEntity(root_view, model);
    });
    /*
    Draw box tool
     */
    var DrawBoxTool = /** @class */ (function (_super) {
        __extends(DrawBoxTool, _super);
        function DrawBoxTool(view, entity) {
            var _this = _super.call(this, view) || this;
            _this.entity = entity;
            _this._start_point = null;
            _this._current_point = null;
            return _this;
        }
        DrawBoxTool.prototype.on_init = function () {
        };
        ;
        DrawBoxTool.prototype.on_shutdown = function () {
        };
        ;
        DrawBoxTool.prototype.on_switch_in = function (pos) {
            if (this._start_point !== null) {
                this._current_point = pos;
                this.update_box();
            }
        };
        ;
        DrawBoxTool.prototype.on_switch_out = function (pos) {
            if (this._start_point !== null) {
                this._current_point = null;
                this.update_box();
            }
        };
        ;
        DrawBoxTool.prototype.on_cancel = function (pos) {
            if (this.entity !== null) {
                if (this._start_point !== null) {
                    this.destroy_entity();
                    this._start_point = null;
                }
            }
            else {
                this._view.unselect_all_entities();
                this._view.view.set_current_tool(new labelling_tool.SelectEntityTool(this._view));
            }
            return true;
        };
        ;
        DrawBoxTool.prototype.on_left_click = function (pos, event) {
            if (this._start_point === null) {
                this._start_point = pos;
                this._current_point = pos;
                this.create_entity(pos);
            }
            else {
                this._current_point = pos;
                this.update_box();
                this.entity.commit();
                this._start_point = null;
                this._current_point = null;
            }
        };
        ;
        DrawBoxTool.prototype.on_move = function (pos) {
            if (this._start_point !== null) {
                this._current_point = pos;
                this.update_box();
            }
        };
        ;
        DrawBoxTool.prototype.create_entity = function (pos) {
            var label_class = this._view.view.get_label_class_for_new_label();
            var model = new_BoxLabelModel(pos, { x: 0.0, y: 0.0 }, label_class, "manual");
            var entity = this._view.get_or_create_entity_for_model(model);
            this.entity = entity;
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this._view.add_child(entity);
            this._view.select_entity(entity, false, false);
            this._view.view.thaw();
        };
        ;
        DrawBoxTool.prototype.destroy_entity = function () {
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this.entity.destroy();
            this.entity = null;
            this._view.view.thaw();
        };
        ;
        DrawBoxTool.prototype.update_box = function () {
            var _a;
            if (this.entity !== null) {
                var box = null;
                if (this._start_point !== null) {
                    if (this._current_point !== null) {
                        box = labelling_tool.AABox_from_points([this._start_point, this._current_point]);
                        box = (_a = this.get_table_box(this._start_point, this._current_point)) !== null && _a !== void 0 ? _a : box;
                    }
                    else {
                        box = new labelling_tool.AABox(this._start_point, this._start_point);
                    }
                }
                this.entity.model.centre = box.centre();
                this.entity.model.size = box.size();
                this.entity.update();
            }
        };
        ;
        DrawBoxTool.prototype.get_table_box = function (_start, _current) {
            var table = this.entity.get_parent_table();
            if (table === null)
                return null;
            var bbox = table.bbox;
            var start = bbox.closest_point_to(_start);
            var current = bbox.closest_point_to(_current);
            var box = null;
            if (table.label === "table_row" || table.label === "table_column_header" || table.label === "table_projected_row_header") {
                // full width
                start.x = bbox.closest_boundary_to(start).x;
                current.x = start.x === bbox.lower.x ? bbox.upper.x : bbox.lower.x;
                this._snap_to_table_boundary(start, current, table, "y");
                this._snap_to_row_boundary(start, current, table);
            }
            else if (table.label === "table_column") {
                // full height
                start.y = bbox.closest_boundary_to(start).y;
                current.y = start.y === bbox.lower.y ? bbox.upper.y : bbox.lower.y;
                this._snap_to_table_boundary(start, current, table, "x");
                this._snap_to_column_boundary(start, current, table);
                // spanning cell
            }
            else {
                this._snap_to_table_boundary(start, current, table);
                this._snap_to_column_boundary(start, current, table);
                this._snap_to_row_boundary(start, current, table);
            }
            this._start_point = start;
            box = labelling_tool.AABox_from_points([start, current]);
            return box;
        };
        DrawBoxTool.prototype._snap_to_table_boundary = function (start, current, table, type) {
            if (type === undefined || type === "x") {
                if (table.bbox.distance_to(start) < table.threshold.x)
                    start.x = table.bbox.closest_point_to(start).x;
                if (table.bbox.distance_to(current) < table.threshold.x)
                    current.x = table.bbox.closest_point_to(current).x;
            }
            if (type === undefined || type === "y") {
                if (table.bbox.distance_to(start) < table.threshold.y)
                    start.y = table.bbox.closest_point_to(start).y;
                if (table.bbox.distance_to(current) < table.threshold.y)
                    current.y = table.bbox.closest_point_to(current).y;
            }
        };
        // can break with below if matching multiple columns or rows
        DrawBoxTool.prototype._snap_to_column_boundary = function (start, current, table) {
            table.columns.forEach(function (col) {
                if (col.distance_to(start) < table.threshold.x)
                    start.x = col.closest_boundary_to(start).x;
                if (col.distance_to(current) < table.threshold.x)
                    current.x = col.closest_boundary_to(current).x;
            });
        };
        DrawBoxTool.prototype._snap_to_row_boundary = function (start, current, table) {
            table.rows.forEach(function (row) {
                if (row.distance_to(start) < table.threshold.y)
                    start.y = row.closest_boundary_to(start).y;
                if (row.distance_to(current) < table.threshold.y)
                    current.y = row.closest_boundary_to(current).y;
            });
        };
        return DrawBoxTool;
    }(labelling_tool.AbstractTool));
    labelling_tool.DrawBoxTool = DrawBoxTool;
})(labelling_tool || (labelling_tool = {}));
