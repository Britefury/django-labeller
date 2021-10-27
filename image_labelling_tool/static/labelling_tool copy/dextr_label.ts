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

/// <reference path="./math_primitives.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./polygonal_label.ts" />
/// <reference path="./root_label_view.ts" />

module labelling_tool {
    export interface DextrRequest {
        image_id: string;
        dextr_id: number;
        dextr_points: Vector2[];
    }

    export class DextrRequestState {
        private static _id_counter: number = 1;
        private static _openRequests: any = {};
        private static _interval_id: number = null;

        public req: DextrRequest;
        private _sent: boolean;
        private _view: RootLabelView;
        private _label_class: string;
        private _state: DextrState;

        constructor(view: RootLabelView, state: DextrState) {
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


        static dextr_success(dextr_id: number, regions: Vector2[][]) {
            let request: DextrRequestState = DextrRequestState._openRequests[dextr_id];
            if (request !== undefined) {
                if (request._state.is_attached()) {
                    if (regions.length > 0) {
                        var model = new_PolygonalLabelModel(request._label_class, "auto:dextr");
                        model.regions = regions;
                        var entity = request._view.get_or_create_entity_for_model(model);
                        request._view.add_child(entity);
                        request._view.select_entity(entity, false, false);
                    }

                    request._state.detach();
                }
                request.shutdown();
            }
        }


        private shutdown() {
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
        }


        send() {
            this._sent = this._view.view.sendDextrRequest(this.req);
            if (this._sent) {
                // Add to list of open requests
                DextrRequestState._openRequests[this.req.dextr_id] = this;
            }
            let polling_interval = this._view.view.dextrPollingInterval();
            if (polling_interval !== undefined) {
                this.enable_polling(polling_interval);
            }
        }

        private enable_polling(interval_time: number) {
            if (DextrRequestState._interval_id == null) {
                // Polling not yet enabled
                let self = this;
                DextrRequestState._interval_id = setInterval(function() {
                    let dextr_ids = [];
                    for (var key in DextrRequestState._openRequests) {
                        if (DextrRequestState._openRequests.hasOwnProperty(key)) {
                            let req_state: DextrRequestState = DextrRequestState._openRequests[key];
                            dextr_ids.push(req_state.req.dextr_id);
                        }
                    }
                    self._view.view.sendDextrPoll(dextr_ids);
                }, interval_time);
            }
        }
    }


    let shape_line: any = d3.svg.line()
                .x(function (d: any) { return d.x; })
                .y(function (d: any) { return d.y; })
                .interpolate("linear");


    function dextr_segment(i: number, prev: Vector2, p: Vector2): Vector2[] {
        let corner: Vector2 = null;
        let cur: Vector2 = null;
        if (i === 0) {
            // Top to left
            cur = {x: Math.min(p.x, prev.x - 1), y: Math.max(p.y, prev.y + 1)};
            corner = {x: cur.x, y: prev.y};
        }
        else if (i === 1) {
            // Left to bottom
            cur = {x: Math.max(p.x, prev.x + 1), y: Math.max(p.y, prev.y + 1)};
            corner = {x: prev.x, y: cur.y};
        }
        else if (i === 2) {
            // Bottom to right
            cur = {x: Math.max(p.x, prev.x + 1), y: Math.min(p.y, prev.y - 1)};
            corner = {x: cur.x, y: prev.y};
        }
        else if (i === 3) {
            // Right to top
            cur = {x: Math.min(p.x, prev.x - 1), y: Math.min(p.y, prev.y - 1)};
            corner = {x: prev.x, y: cur.y};
        }
        else {
            throw "Invalid i";
        }
        return [corner, cur];
    }

    /*
    Dextr marker
     */
    export class DextrState extends PlaceHolderEntity {
        _points: Vector2[];
        _group: any;
        _point_markers: any[];
        _path: any;


        constructor(view: RootLabelView) {
            super(view);
            this._points = [];
            this._group = null;
            this._point_markers = [];
            this._path = null;
        }


        attach() {
            super.attach();
            this._group = this.root_view.world.append("g");
            this._path = this._group.append("path");
            this._path.style("stroke-width", "1.5");
            this._path.style("stroke", "rgba(255,128,0,1.0)");
            this._path.style("fill", "transparent");
        };

        detach() {
            if (this._path !== null) {
                this._path.remove();
                this._path = null;
            }
            if (this._group !== null) {
                this._group.remove();
                this._group = null;
            }
            super.detach();
        }

        add_point(p: Vector2) {
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
        }

        remove_point() {
            var n = this._point_markers.length;
            var last = this._point_markers[n - 1];
            last.remove();
            this._point_markers = this._point_markers.slice(0, n - 1);
            this._points = this._points.slice(0, n - 1);

            this.update_box();
        }

        update_box() {
            let path_points: Vector2[] = this._points.slice(0, 1);
            for (var j = 1; j < this._points.length; j++) {
                var xs = dextr_segment(j - 1, path_points[path_points.length-1], this._points[j]);
                path_points.push(xs[0]);
                path_points.push(xs[1]);
            }

            if (this._points.length === 4) {
                var xs = dextr_segment(3, path_points[path_points.length-1], this._points[0]);
                path_points.push(xs[0]);
                path_points.push(xs[1]);
            }

            this._path.attr("d", shape_line(path_points));
        }

        n_points(): number {
            return this._points.length;
        }

        first_point(): Vector2 {
            if (this._points.length === 0){
                return null;
            }
            else {
                return this._points[0];
            }
        }

        last_point(): Vector2 {
            if (this._points.length === 0){
                return null;
            }
            else {
                return this._points[this._points.length - 1];
            }
        }

        segment_at_end(p: Vector2): Vector2[] {
            if (this._points.length === 0){
                return [null, p];
            }
            else {
                return dextr_segment(this._points.length - 1, this._points[this._points.length - 1], p);
            }
        }

        notify_sent() {
            for (var i = 0; i < this._point_markers.length; i++) {
                this._point_markers[i].remove();
            }
            this._point_markers = [];
            this._path.style("fill", "rgba(255, 128, 0, 0.1)");
            this._path.style("stroke-dasharray", "3,3");
        }
    }



    /*
    Draw box tool
     */
    export class DextrTool extends AbstractTool {
        state: DextrState;
        _point_marker: any;
        _box_highlight: any;

        constructor(view: RootLabelView) {
            super(view);
            this.state = new DextrState(view);
            this._point_marker = null;
        }

        update_highlight(p: Vector2) {
            let seg: Vector2[] = this.state.segment_at_end(p);
            this._point_marker.attr("visibility", "visible");
            this._point_marker.attr("cx", seg[1].x);
            this._point_marker.attr("cy", seg[1].y);
            if (seg[0] === null) {
                this._box_highlight.attr("visibility", "hidden");
            }
            else {
                if (this.state.n_points() === 3) {
                    let seg2 = dextr_segment(3, seg[1], this.state.first_point());
                    let points: Vector2[] = [this.state.last_point(), seg[0], seg[1], seg2[0], seg2[1]];
                    this._box_highlight.attr("visibility", "visible");
                    this._box_highlight.attr("d", shape_line(points));
                }
                else {
                    let points: Vector2[] = [this.state.last_point(), seg[0], seg[1]];
                    this._box_highlight.attr("visibility", "visible");
                    this._box_highlight.attr("d", shape_line(points));
                }
            }
        }

        clear_highlight() {
            this._point_marker.attr("visibility", "hidden");
        }

        on_init() {
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

        on_shutdown() {
            this._point_marker.remove();
            this._point_marker = null;
            this._box_highlight.remove();
            this._box_highlight = null;
            this.state.detach();
        };

        on_switch_in(pos: Vector2) {
            this.update_highlight(pos);
        };

        on_switch_out(pos: Vector2) {
            this.clear_highlight();
        };

        on_cancel(pos: Vector2): boolean {
            if (this.state._points.length > 0) {
                this.state.remove_point();
            }
            else {
                this._view.view.set_current_tool(new SelectEntityTool(this._view));
            }
            return true;
        };

        on_left_click(pos: Vector2, event: any) {
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

        on_move(pos: Vector2) {
            this.update_highlight(pos);
        };
    }
}
