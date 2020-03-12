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
/// <reference path="./polygonal_label.ts" />
/// <reference path="./root_label_view.ts" />
var labelling_tool;
(function (labelling_tool) {
    var DextrRequestState = /** @class */ (function () {
        function DextrRequestState(view, state) {
            this._view = view;
            this._label_class = this._view.view.get_label_class_for_new_label();
            this.req = {
                image_id: this._view.get_current_image_id(),
                dextr_id: DextrRequestState._id_counter,
                dextr_points: state._points
            };
            this._sent = false;
            this._state = state;
            DextrRequestState._id_counter += 1;
        }
        DextrRequestState.dextr_success = function (dextr_id, regions) {
            var request = DextrRequestState._openRequests[dextr_id];
            if (request !== undefined) {
                if (request._state.is_attached()) {
                    if (regions.length > 0) {
                        var model = labelling_tool.new_PolygonalLabelModel(request._label_class, "auto:dextr");
                        model.regions = regions;
                        var entity = request._view.get_or_create_entity_for_model(model);
                        request._view.add_child(entity);
                        request._view.select_entity(entity, false, false);
                    }
                    request._state.detach();
                }
                request.shutdown();
            }
        };
        DextrRequestState.prototype.shutdown = function () {
            if (this._sent) {
                // Remove from list of open requests
                delete DextrRequestState._openRequests[this.req.dextr_id];
            }
            if (Object.keys(DextrRequestState._openRequests).length == 0) {
                if (DextrRequestState._interval_id !== null) {
                    clearInterval(DextrRequestState._interval_id);
                    DextrRequestState._interval_id = null;
                }
            }
        };
        DextrRequestState.prototype.send = function () {
            this._sent = this._view.view.sendDextrRequest(this.req);
            if (this._sent) {
                // Add to list of open requests
                DextrRequestState._openRequests[this.req.dextr_id] = this;
            }
            var polling_interval = this._view.view.dextrPollingInterval();
            if (polling_interval !== undefined) {
                this.enable_polling(polling_interval);
            }
        };
        DextrRequestState.prototype.enable_polling = function (interval_time) {
            if (DextrRequestState._interval_id == null) {
                // Polling not yet enabled
                var self_1 = this;
                DextrRequestState._interval_id = setInterval(function () {
                    self_1._view.view.sendDextrPoll();
                }, interval_time);
            }
        };
        DextrRequestState._id_counter = 1;
        DextrRequestState._openRequests = {};
        DextrRequestState._interval_id = null;
        return DextrRequestState;
    }());
    labelling_tool.DextrRequestState = DextrRequestState;
    var shape_line = d3.svg.line()
        .x(function (d) { return d.x; })
        .y(function (d) { return d.y; })
        .interpolate("linear");
    function dextr_segment(i, prev, p) {
        var corner = null;
        var cur = null;
        if (i === 0) {
            // Top to left
            cur = { x: Math.min(p.x, prev.x - 1), y: Math.max(p.y, prev.y + 1) };
            corner = { x: cur.x, y: prev.y };
        }
        else if (i === 1) {
            // Left to bottom
            cur = { x: Math.max(p.x, prev.x + 1), y: Math.max(p.y, prev.y + 1) };
            corner = { x: prev.x, y: cur.y };
        }
        else if (i === 2) {
            // Bottom to right
            cur = { x: Math.max(p.x, prev.x + 1), y: Math.min(p.y, prev.y - 1) };
            corner = { x: cur.x, y: prev.y };
        }
        else if (i === 3) {
            // Right to top
            cur = { x: Math.min(p.x, prev.x - 1), y: Math.min(p.y, prev.y - 1) };
            corner = { x: prev.x, y: cur.y };
        }
        else {
            throw "Invalid i";
        }
        return [corner, cur];
    }
    /*
    Dextr marker
     */
    var DextrState = /** @class */ (function (_super) {
        __extends(DextrState, _super);
        function DextrState(view) {
            var _this = _super.call(this, view) || this;
            _this._points = [];
            _this._group = null;
            _this._point_markers = [];
            _this._path = null;
            return _this;
        }
        DextrState.prototype.attach = function () {
            _super.prototype.attach.call(this);
            this._group = this.root_view.world.append("g");
            this._path = this._group.append("path");
            this._path.style("stroke-width", "1.5");
            this._path.style("stroke", "rgba(255,128,0,1.0)");
            this._path.style("fill", "transparent");
        };
        ;
        DextrState.prototype.detach = function () {
            if (this._path !== null) {
                this._path.remove();
                this._path = null;
            }
            if (this._group !== null) {
                this._group.remove();
                this._group = null;
            }
            _super.prototype.detach.call(this);
        };
        DextrState.prototype.add_point = function (p) {
            var point_marker = this._group.append("circle");
            point_marker.attr("r", "4.0");
            point_marker.style("fill", "rgba(128,0,192,0.1)");
            point_marker.style("stroke-width", "1.5");
            point_marker.style("stroke", "rgba(128,0,255,1.0)");
            point_marker.attr("cx", p.x);
            point_marker.attr("cy", p.y);
            this._points.push(p);
            this._point_markers.push(point_marker);
            this.update_box();
        };
        DextrState.prototype.remove_point = function () {
            var n = this._point_markers.length;
            var last = this._point_markers[n - 1];
            last.remove();
            this._point_markers = this._point_markers.slice(0, n - 1);
            this._points = this._points.slice(0, n - 1);
            this.update_box();
        };
        DextrState.prototype.update_box = function () {
            var path_points = this._points.slice(0, 1);
            for (var j = 1; j < this._points.length; j++) {
                var xs = dextr_segment(j - 1, path_points[path_points.length - 1], this._points[j]);
                path_points.push(xs[0]);
                path_points.push(xs[1]);
            }
            if (this._points.length === 4) {
                var xs = dextr_segment(3, path_points[path_points.length - 1], this._points[0]);
                path_points.push(xs[0]);
                path_points.push(xs[1]);
            }
            this._path.attr("d", shape_line(path_points));
        };
        DextrState.prototype.n_points = function () {
            return this._points.length;
        };
        DextrState.prototype.first_point = function () {
            if (this._points.length === 0) {
                return null;
            }
            else {
                return this._points[0];
            }
        };
        DextrState.prototype.last_point = function () {
            if (this._points.length === 0) {
                return null;
            }
            else {
                return this._points[this._points.length - 1];
            }
        };
        DextrState.prototype.segment_at_end = function (p) {
            if (this._points.length === 0) {
                return [null, p];
            }
            else {
                return dextr_segment(this._points.length - 1, this._points[this._points.length - 1], p);
            }
        };
        DextrState.prototype.notify_sent = function () {
            for (var i = 0; i < this._point_markers.length; i++) {
                this._point_markers[i].remove();
            }
            this._point_markers = [];
            this._path.style("fill", "rgba(255, 128, 0, 0.1)");
            this._path.style("stroke-dasharray", "3,3");
        };
        return DextrState;
    }(labelling_tool.PlaceHolderEntity));
    labelling_tool.DextrState = DextrState;
    /*
    Draw box tool
     */
    var DextrTool = /** @class */ (function (_super) {
        __extends(DextrTool, _super);
        function DextrTool(view) {
            var _this = _super.call(this, view) || this;
            _this.state = new DextrState(view);
            _this._point_marker = null;
            return _this;
        }
        DextrTool.prototype.update_highlight = function (p) {
            var seg = this.state.segment_at_end(p);
            this._point_marker.attr("visibility", "visible");
            this._point_marker.attr("cx", seg[1].x);
            this._point_marker.attr("cy", seg[1].y);
            if (seg[0] === null) {
                this._box_highlight.attr("visibility", "hidden");
            }
            else {
                if (this.state.n_points() === 3) {
                    var seg2 = dextr_segment(3, seg[1], this.state.first_point());
                    var points = [this.state.last_point(), seg[0], seg[1], seg2[0], seg2[1]];
                    this._box_highlight.attr("visibility", "visible");
                    this._box_highlight.attr("d", shape_line(points));
                }
                else {
                    var points = [this.state.last_point(), seg[0], seg[1]];
                    this._box_highlight.attr("visibility", "visible");
                    this._box_highlight.attr("d", shape_line(points));
                }
            }
        };
        DextrTool.prototype.clear_highlight = function () {
            this._point_marker.attr("visibility", "hidden");
        };
        DextrTool.prototype.on_init = function () {
            this.state.attach();
            this._point_marker = this._view.world.append("circle");
            this._point_marker.attr("visibility", "hidden");
            this._point_marker.attr("r", "4.0");
            this._point_marker.style("fill", "rgba(192,128,0,0.1)");
            this._point_marker.style("stroke-width", "1.5");
            this._point_marker.style("stroke", "rgba(255,128,0,1.0)");
            this._box_highlight = this._view.world.append("path");
            this._box_highlight.attr("visibility", "hidden");
            this._box_highlight.style("stroke-width", "1.5");
            this._box_highlight.style("stroke", "rgba(255,128,0,1.0)");
            this._box_highlight.style("stroke-dasharray", "3,3");
            this._box_highlight.style("fill", "transparent");
        };
        ;
        DextrTool.prototype.on_shutdown = function () {
            this._point_marker.remove();
            this._point_marker = null;
            this._box_highlight.remove();
            this._box_highlight = null;
            this.state.detach();
        };
        ;
        DextrTool.prototype.on_switch_in = function (pos) {
            this.update_highlight(pos);
        };
        ;
        DextrTool.prototype.on_switch_out = function (pos) {
            this.clear_highlight();
        };
        ;
        DextrTool.prototype.on_cancel = function (pos) {
            if (this.state._points.length > 0) {
                this.state.remove_point();
            }
            else {
                this._view.view.set_current_tool(new labelling_tool.SelectEntityTool(this._view));
            }
            return true;
        };
        ;
        DextrTool.prototype.on_left_click = function (pos, event) {
            var seg = this.state.segment_at_end(pos);
            this.state.add_point(seg[1]);
            if (this.state.n_points() === 4) {
                var api = new DextrRequestState(this._view, this.state);
                api.send();
                this.state.notify_sent();
                this.state = new DextrState(this._view);
                this.state.attach();
            }
        };
        ;
        DextrTool.prototype.on_move = function (pos) {
            this.update_highlight(pos);
        };
        ;
        return DextrTool;
    }(labelling_tool.AbstractTool));
    labelling_tool.DextrTool = DextrTool;
})(labelling_tool || (labelling_tool = {}));
