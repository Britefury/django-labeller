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
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
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
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./root_label_view.ts" />
var labelling_tool;
(function (labelling_tool) {
    function new_OrientedEllipseLabelModel(centre, radius1, radius2, orientation_radians, label_class, source) {
        return { label_type: 'oriented_ellipse', label_class: label_class, source: source, anno_data: {},
            centre: centre, radius1: radius1, radius2: radius2,
            orientation_radians: orientation_radians };
    }
    function OrientedEllipseLabel_box(label) {
        var c = Math.cos(label.orientation_radians);
        var s = Math.sin(label.orientation_radians);
        var u = { x: c * label.radius1, y: s * label.radius1 };
        var v = { x: -s * label.radius2, y: c * label.radius2 };
        var e = { x: Math.sqrt(u.x * u.x + v.x * v.x),
            y: Math.sqrt(u.y * u.y + v.y * v.y) };
        var lower = { x: label.centre.x - e.x, y: label.centre.y - e.y };
        var upper = { x: label.centre.x + e.x, y: label.centre.y + e.y };
        return new labelling_tool.AABox(lower, upper);
    }
    // Converted from:
    // https://stackoverflow.com/questions/22959698/distance-from-given-point-to-given-ellipse
    function ellipseClosestPoint(rad1, rad2, p) {
        var px = Math.abs(p.x);
        var py = Math.abs(p.y);
        var tx = Math.sqrt(0.5);
        var ty = Math.sqrt(0.5);
        var a, b;
        if (rad1 > rad2) {
            a = rad1;
            b = rad2;
        }
        else {
            a = rad2;
            b = rad1;
        }
        for (var i = 0; i < 3; i++) {
            var x = a * tx;
            var y = b * ty;
            var ex = (a * a - b * b) * tx * tx * tx / a;
            var ey = (b * b - a * a) * ty * ty * ty / b;
            var rx = x - ex;
            var ry = y - ey;
            var qx = px - ex;
            var qy = py - ey;
            var r = Math.sqrt(ry * ry + rx * rx);
            var q = Math.sqrt(qy * qy + qx * qx);
            tx = Math.min(1, Math.max(0, (qx * r / q + ex) / a));
            ty = Math.min(1, Math.max(0, (qy * r / q + ey) / b));
            var t = Math.sqrt(ty * ty + tx * tx);
            tx /= t;
            ty /= t;
        }
        return { x: Math.abs(a * tx) * (p.x >= 0.0 ? 1.0 : -1.0),
            y: Math.abs(b * ty) * (p.y >= 0.0 ? 1.0 : -1.0) };
    }
    function OrientedEllipseLabel_containsPoint(label, point) {
        var c = Math.cos(label.orientation_radians);
        var s = Math.sin(label.orientation_radians);
        var m = [[c, s],
            [-s, c]];
        // Point relative to centre
        var p_c = { x: point.x - label.centre.x, y: point.y - label.centre.y };
        // Point rotated to ellipse frame; multiply by transpose of m
        var p_e = {
            x: p_c.x * m[0][0] + p_c.y * m[0][1],
            y: p_c.x * m[1][0] + p_c.y * m[1][1],
        };
        // Point relative to unit circle
        var p_u = { x: p_e.x / label.radius1, y: p_e.y / label.radius2 };
        return Math.sqrt(p_u.x * p_u.x + p_u.y * p_u.y) <= 1.0;
    }
    function OrientedEllipseLabel_closestPoint(label, point) {
        var c = Math.cos(label.orientation_radians);
        var s = Math.sin(label.orientation_radians);
        var m = [[c, s],
            [-s, c]];
        // Point relative to centre
        var p_c = { x: point.x - label.centre.x, y: point.y - label.centre.y };
        // Point rotated to ellipse frame; multiply by transpose of m
        var p_e = {
            x: p_c.x * m[0][0] + p_c.y * m[0][1],
            y: p_c.x * m[1][0] + p_c.y * m[1][1],
        };
        // Compute closes point
        var cp_e = ellipseClosestPoint(label.radius1, label.radius2, p_e);
        // Rotate to relative to centre
        var cp_c = {
            x: cp_e.x * m[0][0] + cp_e.y * m[1][0],
            y: cp_e.x * m[0][1] + cp_e.y * m[1][1],
        };
        return { x: cp_c.x + label.centre.x, y: cp_c.y + label.centre.y };
    }
    /*
    Box label entity
     */
    var OrientedEllipseLabelEntity = /** @class */ (function (_super) {
        __extends(OrientedEllipseLabelEntity, _super);
        function OrientedEllipseLabelEntity(view, model) {
            return _super.call(this, view, model) || this;
        }
        OrientedEllipseLabelEntity.prototype.attach = function () {
            _super.prototype.attach.call(this);
            this._ellipse = this.root_view.world.append("ellipse")
                .attr("rx", 0).attr("ry", 0)
                .attr("transform", "translate(0 0), rotate(0)");
            this.update();
            var self = this;
            this._ellipse.on("mouseover", function () {
                self._on_mouse_over_event();
            }).on("mouseout", function () {
                self._on_mouse_out_event();
            });
            this._update_style();
        };
        ;
        OrientedEllipseLabelEntity.prototype.detach = function () {
            this._ellipse.remove();
            this._ellipse = null;
            _super.prototype.detach.call(this);
        };
        OrientedEllipseLabelEntity.prototype._on_mouse_over_event = function () {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_in(this);
            }
        };
        OrientedEllipseLabelEntity.prototype._on_mouse_out_event = function () {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_out(this);
            }
        };
        OrientedEllipseLabelEntity.prototype.update = function () {
            var centre = this.model.centre;
            var orient_deg = this.model.orientation_radians * 180.0 / Math.PI;
            var transform = "translate(" + centre.x + " " + centre.y + "), rotate(" + orient_deg + ")";
            this._ellipse
                .attr('rx', this.model.radius1).attr('ry', this.model.radius2)
                .attr('transform', transform);
        };
        OrientedEllipseLabelEntity.prototype.commit = function () {
            this.root_view.commit_model(this.model);
        };
        OrientedEllipseLabelEntity.prototype._update_style = function () {
            if (this._attached) {
                var stroke_colour = this._outline_colour();
                var vis = this.get_visibility();
                if (vis == labelling_tool.LabelVisibility.HIDDEN) {
                    this._ellipse.attr("visibility", "hidden");
                }
                else if (vis == labelling_tool.LabelVisibility.FAINT) {
                    stroke_colour = stroke_colour.with_alpha(0.2);
                    this._ellipse.attr("style", "fill:none;stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._ellipse.attr("visibility", "visible");
                }
                else if (vis == labelling_tool.LabelVisibility.FULL) {
                    var circle_fill_colour = this.root_view.view.colour_for_label_class(this.model.label_class);
                    if (this._hover) {
                        circle_fill_colour = circle_fill_colour.lighten(0.4);
                    }
                    circle_fill_colour = circle_fill_colour.with_alpha(0.35);
                    stroke_colour = stroke_colour.with_alpha(0.5);
                    this._ellipse.attr("style", "fill:" + circle_fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._ellipse.attr("visibility", "visible");
                }
            }
        };
        OrientedEllipseLabelEntity.prototype.compute_centroid = function () {
            return this.model.centre;
        };
        ;
        OrientedEllipseLabelEntity.prototype.compute_bounding_box = function () {
            return OrientedEllipseLabel_box(this.model);
        };
        ;
        OrientedEllipseLabelEntity.prototype.contains_pointer_position = function (point) {
            return OrientedEllipseLabel_containsPoint(this.model, point);
        };
        OrientedEllipseLabelEntity.prototype.distance_to_point = function (point) {
            var closest = OrientedEllipseLabel_closestPoint(this.model, point);
            return Math.sqrt(labelling_tool.compute_sqr_dist(closest, point));
        };
        return OrientedEllipseLabelEntity;
    }(labelling_tool.AbstractLabelEntity));
    labelling_tool.OrientedEllipseLabelEntity = OrientedEllipseLabelEntity;
    labelling_tool.register_entity_factory('oriented_ellipse', function (root_view, model) {
        return new OrientedEllipseLabelEntity(root_view, model);
    });
    /*
    Draw box tool
     */
    var DrawOrientedEllipseTool = /** @class */ (function (_super) {
        __extends(DrawOrientedEllipseTool, _super);
        function DrawOrientedEllipseTool(view, entity) {
            var _this = _super.call(this, view) || this;
            _this.entity = entity;
            _this._points = [];
            return _this;
        }
        DrawOrientedEllipseTool.prototype.on_init = function () {
        };
        ;
        DrawOrientedEllipseTool.prototype.on_shutdown = function () {
        };
        ;
        DrawOrientedEllipseTool.prototype.on_switch_in = function (pos) {
            this.add_point(pos);
        };
        ;
        DrawOrientedEllipseTool.prototype.on_switch_out = function (pos) {
            this.remove_last_point();
        };
        ;
        DrawOrientedEllipseTool.prototype.on_cancel = function (pos) {
            if (this.entity !== null) {
                if (this._points.length > 0) {
                    this.remove_last_point();
                }
                if (this._points.length <= 1) {
                    this.destroy_entity();
                }
            }
            else {
                this._view.unselect_all_entities();
                this._view.view.set_current_tool(new labelling_tool.SelectEntityTool(this._view));
            }
            return true;
        };
        ;
        DrawOrientedEllipseTool.prototype.on_left_click = function (pos, event) {
            if (this.entity === null) {
                this.create_entity(pos);
            }
            this.add_point(pos);
            if (this._points.length >= 4) {
                this.update_ellipse();
                this.entity.commit();
                this._points = [pos];
                this.entity = null;
            }
        };
        ;
        DrawOrientedEllipseTool.prototype.on_move = function (pos) {
            this.update_last_point(pos);
        };
        ;
        DrawOrientedEllipseTool.prototype.add_point = function (pos) {
            this._points.push(pos);
            this.update_ellipse();
        };
        ;
        DrawOrientedEllipseTool.prototype.update_last_point = function (pos) {
            this._points[this._points.length - 1] = pos;
            this.update_ellipse();
        };
        ;
        DrawOrientedEllipseTool.prototype.remove_last_point = function () {
            if (this._points.length > 0) {
                this._points.splice(this._points.length - 1, 1);
                this.update_ellipse();
            }
        };
        ;
        DrawOrientedEllipseTool.prototype.create_entity = function (pos) {
            var label_class = this._view.view.get_label_class_for_new_label();
            var model = new_OrientedEllipseLabelModel(pos, 0.0, 0.0, 0.0, label_class, "manual");
            var entity = this._view.get_or_create_entity_for_model(model);
            this.entity = entity;
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this._view.add_child(entity);
            this._view.select_entity(entity, false, false);
            this._view.view.thaw();
        };
        ;
        DrawOrientedEllipseTool.prototype.destroy_entity = function () {
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this.entity.destroy();
            this.entity = null;
            this._view.view.thaw();
        };
        ;
        DrawOrientedEllipseTool.prototype.update_ellipse = function () {
            if (this.entity !== null) {
                var centre = { x: 0.0, y: 0.0 };
                var orientation = 0.0;
                var rad1 = 10.0;
                var rad2 = 10.0;
                if (this._points.length === 1) {
                    centre = this._points[0];
                }
                else if (this._points.length >= 2) {
                    var u = labelling_tool.sub_Vector2(this._points[1], this._points[0]);
                    centre = labelling_tool.mul_Vector2(labelling_tool.add_Vector2(this._points[0], this._points[1]), 0.5);
                    rad1 = Math.sqrt(labelling_tool.compute_sqr_length(u)) * 0.5;
                    rad2 = rad1 * 0.1;
                    orientation = Math.atan2(u.y, u.x);
                    if (this._points.length >= 3) {
                        var u_nrm = labelling_tool.mul_Vector2(u, 1.0 / Math.sqrt(labelling_tool.compute_sqr_length(u)));
                        var n = { x: u_nrm.y, y: -u_nrm.x };
                        var d = labelling_tool.dot_Vector2(n, this._points[0]);
                        var d2 = labelling_tool.dot_Vector2(n, this._points[2]);
                        rad2 = Math.abs(d2 - d);
                    }
                }
                this.entity.model.centre = centre;
                this.entity.model.orientation_radians = orientation;
                this.entity.model.radius1 = rad1;
                this.entity.model.radius2 = rad2;
                this.entity.update();
            }
        };
        ;
        return DrawOrientedEllipseTool;
    }(labelling_tool.AbstractTool));
    labelling_tool.DrawOrientedEllipseTool = DrawOrientedEllipseTool;
})(labelling_tool || (labelling_tool = {}));
//# sourceMappingURL=oriented_ellipse_label.js.map