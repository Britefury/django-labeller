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
/// <reference path="./root_label_view.ts" />

module labelling_tool {
    /*
    Box label model
     */
    interface OrientedEllipseLabelModel extends AbstractLabelModel {
        centre: Vector2;
        radius1: number;
        radius2: number;
        orientation_radians: number;
    }

    function new_OrientedEllipseLabelModel(centre: Vector2, radius1: number, radius2: number, orientation_radians: number, label_class: string, source: string): OrientedEllipseLabelModel {
        return {label_type: 'oriented_ellipse', label_class: label_class, source: source, anno_data: {},
            centre: centre, radius1: radius1, radius2: radius2,
            orientation_radians: orientation_radians};
    }

    function OrientedEllipseLabel_box(label: OrientedEllipseLabelModel): AABox {
        // The solution to this problem was obtained from here:
        // https://stackoverflow.com/questions/87734/how-do-you-calculate-the-axis-aligned-bounding-box-of-an-ellipse
        // https://gist.github.com/smidm/b398312a13f60c24449a2c7533877dc0
        var tan_orient = Math.tan(label.orientation_radians);
        var s0 = Math.atan(-label.radius2 * tan_orient / label.radius1);
        var s1 = s0 + Math.PI;
        var t0;
        if (tan_orient != 0.0) {
            t0 = Math.atan((label.radius2 / tan_orient) / label.radius1);
        }
        else {
            t0 = Math.PI * 0.5;
        }
        var t1 = t0 + Math.PI;
        var max_x = label.centre.x + label.radius1 * Math.cos(s0) * Math.cos(label.orientation_radians) -
                        label.radius2 * Math.sin(s0) * Math.sin(label.orientation_radians);
        var min_x = label.centre.x + label.radius1 * Math.cos(s1) * Math.cos(label.orientation_radians) -
                        label.radius2 * Math.sin(s1) * Math.sin(label.orientation_radians);
        var max_y = label.centre.y + label.radius2 * Math.sin(t0) * Math.cos(label.orientation_radians) +
                        label.radius1 * Math.cos(t0) * Math.sin(label.orientation_radians);
        var min_y = label.centre.y + label.radius2 * Math.sin(t1) * Math.cos(label.orientation_radians) +
                        label.radius1 * Math.cos(t1) * Math.sin(label.orientation_radians);
        var lower = {x: min_x, y: min_y};
        var upper = {x: max_x, y: max_y};
        return new AABox(lower, upper);
    }

    function ellipseClosestPoint(rad1: number, rad2: number, p: Vector2): Vector2 {
        // Converted from:
        // https://stackoverflow.com/questions/22959698/distance-from-given-point-to-given-ellipse
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

            var ex = (a*a - b*b) * tx*tx*tx / a;
            var ey = (b*b - a*a) * ty*ty*ty / b;

            var rx = x - ex;
            var ry = y - ey;

            var qx = px - ex;
            var qy = py - ey;

            var r = Math.sqrt(ry*ry + rx*rx);
            var q = Math.sqrt(qy*qy + qx*qx);

            tx = Math.min(1, Math.max(0, (qx * r / q + ex) / a));
            ty = Math.min(1, Math.max(0, (qy * r / q + ey) / b));
            var t = Math.sqrt(ty*ty + tx*tx);
            tx /= t
            ty /= t
        }

        return {x: Math.abs(a*tx) * (p.x >= 0.0 ? 1.0 : -1.0),
                y: Math.abs(b*ty) * (p.y >= 0.0 ? 1.0 : -1.0)};
    }

    function OrientedEllipseLabel_containsPoint(label: OrientedEllipseLabelModel, point: Vector2): boolean {
        var c = Math.cos(label.orientation_radians);
        var s = Math.sin(label.orientation_radians);
        var m = [[c, s],
                 [-s, c]];
        // Point relative to centre
        var p_c: Vector2 = {x: point.x - label.centre.x, y: point.y - label.centre.y};
        // Point rotated to ellipse frame; multiply by transpose of m
        var p_e: Vector2 = {
            x: p_c.x * m[0][0] + p_c.y * m[0][1],
            y: p_c.x * m[1][0] + p_c.y * m[1][1],
        };
        // Point relative to unit circle
        var p_u: Vector2 = {x: p_e.x / label.radius1, y: p_e.y / label.radius2};
        return Math.sqrt(p_u.x*p_u.x + p_u.y*p_u.y) <= 1.0;
    }

    function OrientedEllipseLabel_closestPoint(label: OrientedEllipseLabelModel, point: Vector2): Vector2 {
        var c = Math.cos(label.orientation_radians);
        var s = Math.sin(label.orientation_radians);
        var m = [[c, s],
                 [-s, c]];
        // Point relative to centre
        var p_c: Vector2 = {x: point.x - label.centre.x, y: point.y - label.centre.y};
        // Point rotated to ellipse frame; multiply by transpose of m
        var p_e: Vector2 = {
            x: p_c.x * m[0][0] + p_c.y * m[0][1],
            y: p_c.x * m[1][0] + p_c.y * m[1][1],
        };
        // Compute closes point
        var cp_e = ellipseClosestPoint(label.radius1, label.radius2, p_e);
        // Rotate to relative to centre
        var cp_c: Vector2 = {
            x: cp_e.x * m[0][0] + cp_e.y * m[1][0],
            y: cp_e.x * m[0][1] + cp_e.y * m[1][1],
        };
        return {x: cp_c.x + label.centre.x, y: cp_c.y + label.centre.y};
    }


    /*
    Box label entity
     */
    export class OrientedEllipseLabelEntity extends AbstractLabelEntity<OrientedEllipseLabelModel> {
        _ellipse: any;


        constructor(view: RootLabelView, model: OrientedEllipseLabelModel) {
            super(view, model);
        }


        attach() {
            super.attach();

            this._ellipse = this.root_view.world.append("ellipse")
                .attr("rx", 0).attr("ry", 0)
                .attr("transform", "translate(0 0), rotate(0)");

            this.update();

            var self = this;
            this._ellipse.on("mouseover", function() {
                self._on_mouse_over_event();
            }).on("mouseout", function() {
                self._on_mouse_out_event();
            });


            this._update_style();
        };

        detach() {
            this._ellipse.remove();
            this._ellipse = null;
            super.detach();
        }


        _on_mouse_over_event() {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_in(this);
            }
        }

        _on_mouse_out_event() {
            for (var i = 0; i < this._event_listeners.length; i++) {
                this._event_listeners[i].on_mouse_out(this);
            }
        }



        update() {
            var centre = this.model.centre;
            var orient_deg = this.model.orientation_radians * 180.0 / Math.PI;
            var transform = "translate(" + centre.x + " " + centre.y + "), rotate(" + orient_deg + ")";

            this._ellipse
                .attr('rx', this.model.radius1).attr('ry', this.model.radius2)
                .attr('transform', transform);
        }

        commit() {
            this.root_view.commit_model(this.model);
        }

        _update_style() {
            if (this._attached) {
                var stroke_colour: Colour4 = this._outline_colour();

                var vis: LabelVisibility = this.get_visibility();
                if (vis == LabelVisibility.HIDDEN) {
                    this._ellipse.attr("visibility", "hidden");
                }
                else if (vis == LabelVisibility.FAINT) {
                    stroke_colour = stroke_colour.with_alpha(0.2);
                    this._ellipse.attr("style", "fill:none;stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                    this._ellipse.attr("visibility", "visible");
                }
                else if (vis == LabelVisibility.FULL) {
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
        }

        compute_centroid(): Vector2 {
            return this.model.centre;
        };

        compute_bounding_box(): AABox {
            return OrientedEllipseLabel_box(this.model);
        };

        contains_pointer_position(point: Vector2): boolean {
            return OrientedEllipseLabel_containsPoint(this.model, point);
        }

        distance_to_point(point: Vector2): number {
            var closest = OrientedEllipseLabel_closestPoint(this.model, point);
            return Math.sqrt(compute_sqr_dist(closest, point));
        }
    }


    register_entity_factory('oriented_ellipse', (root_view: RootLabelView, model: AbstractLabelModel) => {
        return new OrientedEllipseLabelEntity(root_view, model as OrientedEllipseLabelModel);
    });


    /*
    Draw box tool
     */
    export class DrawOrientedEllipseTool extends AbstractTool {
        entity: OrientedEllipseLabelEntity;
        _points: Vector2[];

        constructor(view: RootLabelView, entity: OrientedEllipseLabelEntity) {
            super(view);
            this.entity = entity;
            this._points = [];
        }

        on_init() {
        };

        on_shutdown() {
        };

        on_switch_in(pos: Vector2) {
            this.add_point(pos);
        };

        on_switch_out(pos: Vector2) {
            this.remove_last_point();
        };

        on_cancel(pos: Vector2): boolean {
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
                this._view.view.set_current_tool(new SelectEntityTool(this._view));
            }
            return true;
        };

        on_left_click(pos: Vector2, event: any) {
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

        on_move(pos: Vector2) {
            this.update_last_point(pos);
        };


        add_point(pos: Vector2) {
            this._points.push(pos);
            this.update_ellipse();
        };

        update_last_point(pos: Vector2) {
            this._points[this._points.length - 1] = pos;
            this.update_ellipse();
        };

        remove_last_point() {
            if (this._points.length > 0) {
                this._points.splice(this._points.length - 1, 1);
                this.update_ellipse();
            }
        };


        create_entity(pos: Vector2) {
            var label_class = this._view.view.get_label_class_for_new_label();
            var model = new_OrientedEllipseLabelModel(pos, 0.0, 0.0, 0.0,
                                                      label_class, "manual");
            var entity = this._view.get_or_create_entity_for_model(model);
            this.entity = entity;
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this._view.add_child(entity);
            this._view.select_entity(entity, false, false);
            this._view.view.thaw();
        };

        destroy_entity() {
            // Freeze to prevent this temporary change from being sent to the backend
            this._view.view.freeze();
            this.entity.destroy();
            this.entity = null;
            this._view.view.thaw();
        };

        update_ellipse() {
            if (this.entity !== null) {
                var centre: Vector2 = {x: 0.0, y: 0.0};
                var orientation: number = 0.0;
                var rad1: number = 10.0;
                var rad2: number = 10.0;
                if (this._points.length === 1) {
                    centre = this._points[0];
                }
                else if (this._points.length >= 2) {
                    var u = sub_Vector2(this._points[1], this._points[0]);
                    centre = mul_Vector2(add_Vector2(this._points[0], this._points[1]), 0.5);
                    rad1 = Math.sqrt(compute_sqr_length(u)) * 0.5;
                    rad2 = rad1 * 0.1;
                    orientation = Math.atan2(u.y, u.x);

                    if (this._points.length >= 3) {
                        var u_nrm = mul_Vector2(u, 1.0 / Math.sqrt(compute_sqr_length(u)));
                        var n: Vector2 = {x: u_nrm.y, y: -u_nrm.x};
                        var d: number = dot_Vector2(n, this._points[0]);
                        var d2: number = dot_Vector2(n, this._points[2])
                        rad2 = Math.abs(d2-d);
                    }
                }
                this.entity.model.centre = centre;
                this.entity.model.orientation_radians = orientation;
                this.entity.model.radius1 = rad1;
                this.entity.model.radius2 = rad2;
                this.entity.update();
            }
        };
    }
}
