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

/// <reference path="../polyk.d.ts" />
/// <reference path="./math_primitives.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./root_label_view.ts" />

declare var PolyBool:any;

module labelling_tool {
    /*
    Polygonal label model
     */
    interface PolygonalLabelModel extends AbstractLabelModel {
        regions: Vector2[][];
    }

    export function new_PolygonalLabelModel(label_class: string, source: string): PolygonalLabelModel {
        return {label_type: 'polygon', label_class: label_class, source: source, anno_data: {}, regions: []};
    }

    let shape_line: any = d3.svg.line()
                .x(function (d: any) { return d.x; })
                .y(function (d: any) { return d.y; })
                .interpolate("linear-closed");

    function multi_path(regions: Vector2[][]) {
            let lines: string[] = [];
            for (var i = 0; i < regions.length; i++) {
                lines.push(shape_line(regions[i]));
            }
            return lines.join(' ');
    }

    function convert_model(model: PolygonalLabelModel): PolygonalLabelModel {
        let m: any = model as any;
        if (m.hasOwnProperty('vertices')) {
            m.regions = [m.vertices];
            delete m.vertices;
        }
        return m as PolygonalLabelModel;
    }




    /*
    Polygonal label entity
     */
    export class PolygonalLabelEntity extends AbstractLabelEntity<PolygonalLabelModel> {
        _polyk_polys: number[][];
        _centroid: Vector2;
        _bounding_box: AABox;
        poly: any;


        constructor(view: RootLabelView, model: PolygonalLabelModel) {
            model = convert_model(model);
            super(view, model);
            this._polyk_polys = [];
            this._centroid = null;
            this._bounding_box = null;
            this.poly = null;
        }

        attach() {
            super.attach();

            let self = this;

            // let paths = this.root_view.world.append("g").selectAll("path").data(this.model.polys).join("path");
            // paths.attr("d", function(d: SinglePolyLabel) {self.shape_line(d.vertices)});
            this.poly = this.root_view.world.append("path").attr('fill-rule', 'evenodd');
            this.poly.data(this.model.regions).attr("d", multi_path(this.model.regions));

            this.poly.on("mouseover", () => {
                for (var i = 0; i < this._event_listeners.length; i++) {
                    this._event_listeners[i].on_mouse_in(this);
                }
            });

            this.poly.on("mouseout", () => {
                for (var i = 0; i < this._event_listeners.length; i++) {
                    this._event_listeners[i].on_mouse_out(this);
                }
            });

            this._update_polyk_polys();
            this._update_style();
        };

        detach() {
            this.poly.remove();
            this.poly = null;
            this._polyk_polys = [];
            super.detach();
        };

        _update_polyk_polys() {
            this._polyk_polys = [];
            for (var region_i = 0; region_i < this.model.regions.length; region_i++) {
                let region = this.model.regions[region_i];
                let pkpoly: number[] = [];
                for (var vert_i = 0; vert_i < region.length; vert_i++) {
                    pkpoly.push(region[vert_i].x);
                    pkpoly.push(region[vert_i].y);
                }
                this._polyk_polys.push(pkpoly);
            }
        }

        update() {
            let self = this;
            this.poly.data(this.model.regions).attr("d", multi_path(this.model.regions));
            this._update_polyk_polys();
            this._centroid = null;
            this._bounding_box = null;
            this._update_style();
        }

        commit() {
            this.root_view.commit_model(this.model);
        }


        _update_style() {
            if (this._attached) {

                var vis: LabelVisibility = this.get_visibility();
                if (vis == LabelVisibility.HIDDEN) {
                    this.poly.attr("visibility", "hidden");
                }
                else {
                    var stroke_and_fill = this._get_stroke_and_fill_colour();
                    var stroke_colour = stroke_and_fill[0];
                    var fill_colour = stroke_and_fill[1];

                    this.poly.attr("style", "fill:" + fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1")
                        .attr("visibility", "visible");
                }
            }
        }

        _get_stroke_and_fill_colour(): Colour4[] {
            var vis: LabelVisibility = this.get_visibility();
            var stroke_colour: Colour4 = this._outline_colour();
            var fill_colour: Colour4 = this.root_view.view.colour_for_label_class(this.model.label_class);

            if (vis == LabelVisibility.FAINT) {
                stroke_colour = stroke_colour.with_alpha(0.2);

                if (this._hover) {
                    fill_colour = fill_colour.lighten(0.4);
                }
                if (this._selected) {
                    fill_colour = fill_colour.lerp(new Colour4(255, 128, 0.0, 1.0), 0.2);
                }
                fill_colour = fill_colour.with_alpha(0.1);
            }
            else if (vis == LabelVisibility.FULL) {
                if (this._hover) {
                    fill_colour = fill_colour.lighten(0.4);
                }
                if (this._selected) {
                    fill_colour = fill_colour.lerp(new Colour4(255, 128, 0.0, 1.0), 0.2);
                }
                fill_colour = fill_colour.with_alpha(0.35);
            }
            return [stroke_colour, fill_colour];
        }

        compute_centroid(): Vector2 {
            if (this._centroid === null) {
                let centroids: Vector2[] = [];
                for (var region_i = 0; region_i < this.model.regions.length; region_i++) {
                    centroids.push(mean_of_points(this.model.regions[region_i]));
                }

                this._centroid = mean_of_points(centroids);
            }
            return this._centroid;
        }

        compute_bounding_box(): AABox {
            if (this._bounding_box === null) {
                let boxes: AABox[] = [];
                for (var region_i = 0; region_i < this.model.regions.length; region_i++) {
                    boxes.push(AABox_from_points(this.model.regions[region_i]));
                }

                this._bounding_box = AABox_from_aaboxes(boxes);
            }
            return this._bounding_box;
        }

        contains_pointer_position(point: Vector2): boolean {
            if (this.compute_bounding_box().contains_point(point)) {
                let contain_count: number = 0;
                for (var region_i = 0; region_i < this._polyk_polys.length; region_i++) {
                    if (PolyK.ContainsPoint(this._polyk_polys[region_i], point.x, point.y)) {
                        contain_count += 1;
                    }
                }
                return (contain_count % 2) == 1;
            }
            else {
                return false;
            }
        }

        distance_to_point(point: Vector2): number {
            let contain_count: number = 0;
            for (var region_i = 0; region_i < this._polyk_polys.length; region_i++) {
                if (PolyK.ContainsPoint(this._polyk_polys[region_i], point.x, point.y)) {
                    contain_count += 1;
                }
            }
            if ((contain_count % 2) == 1) {
                return 0.0;
            }

            var e = PolyK.ClosestEdge(this._polyk_polys[0], point.x, point.y);
            let dist: number = e.dist;

            for (var region_i = 1; region_i < this._polyk_polys.length; region_i++) {
                var e = PolyK.ClosestEdge(this._polyk_polys[region_i], point.x, point.y);
                if (e.dist < dist) {
                    dist = e.dist;
                }
            }
            return dist;
        }

        /*
        Create group label
         */
        static merge_polygonal_labels(root_view: RootLabelView) {
            let selection: AbstractLabelEntity<AbstractLabelModel>[] = root_view.get_selection().slice();
            root_view.unselect_all_entities();

            if (selection.length > 1) {

                // Can only merge if all entities are polygonal labels
                // Also compute a class frequency table
                let can_merge: boolean = true;
                var class_freq: { [class_name: string]: number; } = {};
                for (var i = 0; i < selection.length; i++) {
                    if (selection[i] instanceof PolygonalLabelEntity) {
                        // Get the class of the component
                        var component_class = selection[i].model.label_class;

                        if (component_class in class_freq) {
                            class_freq[component_class] += 1;
                        }
                        else {
                            class_freq[component_class] = 1;
                        }
                    }
                    else {
                        can_merge = false;
                        break;
                    }
                }

                if (can_merge) {
                    // Choose the label class with the highest frequency
                    let best_class: string = null;
                    var best_freq = 0;
                    for (let cls in class_freq) {
                        if (class_freq[cls] > best_freq) {
                            best_class = cls;
                            best_freq = class_freq[cls];
                        }
                    }

                    let merged_pb = null;

                    for (var i = 0; i < selection.length; i++) {
                        let poly_entity: PolygonalLabelEntity = selection[i] as PolygonalLabelEntity;
                        let entity_pb = EditPolyTool._model_regions_to_polybool(poly_entity.model.regions);
                        if (merged_pb === null) {
                            merged_pb = entity_pb;
                        } else {
                            merged_pb = PolyBool.union(merged_pb, entity_pb);
                        }
                    }

                    var merged_model = new_PolygonalLabelModel(best_class, "manual");
                    merged_model.regions = EditPolyTool._polybool_to_model(merged_pb);

                    for (var i = 0; i < selection.length; i++) {
                        var entity = selection[i];
                        entity.destroy();
                    }

                    var merged_entity = root_view.get_or_create_entity_for_model(merged_model);
                    root_view.add_child(merged_entity);
                    return merged_entity;
                }
            }

            return null;
        }
    }


    register_entity_factory('polygon', (root_view: RootLabelView, model: AbstractLabelModel) => {
        return new PolygonalLabelEntity(root_view, model as PolygonalLabelModel);
    });


    enum BooleanMode {
        NEW,
        ADD,
        SUBTRACT,
        SPLIT,
    }

    export class EditPolyTool extends ProxyTool {
        entity: PolygonalLabelEntity;

        draw_poly_tool: DrawSinglePolygonTool;
        draw_brush_tool: DrawBrushTool;

        ui: JQuery;
        ui_radio_boolean_new: JQuery;
        ui_radio_boolean_add: JQuery;
        ui_radio_boolean_sub: JQuery;
        ui_radio_boolean_split: JQuery;
        ui_radio_draw_poly: JQuery;
        ui_radio_draw_brush: JQuery;

        boolean_mode: BooleanMode;

        constructor(view: RootLabelView, entity: PolygonalLabelEntity) {
            super(view, null);
            var self = this;
            this.entity = entity;
            this.boolean_mode = BooleanMode.NEW;

            this.draw_poly_tool = new DrawSinglePolygonTool(view, entity, self);
            this.draw_brush_tool = new DrawBrushTool(view, entity, self);
        }

        on_init() {
            super.on_init();

            let self = this;

            this.ui = $('.tool_edit_multi_poly');
            this.ui.removeClass('anno_hidden');

            this.ui_radio_boolean_new = this.ui.find('#multi_poly_boolean_new');
            this.ui_radio_boolean_add = this.ui.find('#multi_poly_boolean_add');
            this.ui_radio_boolean_sub = this.ui.find('#multi_poly_boolean_subtract');
            this.ui_radio_boolean_split = this.ui.find('#multi_poly_boolean_split');
            this.ui_radio_boolean_new.on('change', function(event: any, ui: any) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.NEW);
                }
            });
            this.ui_radio_boolean_add.on('change', function(event: any, ui: any) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.ADD);
                }
            });
            this.ui_radio_boolean_sub.on('change', function(event: any, ui: any) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.SUBTRACT);
                }
            });
            this.ui_radio_boolean_split.on('change', function(event: any, ui: any) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.SPLIT);
                }
            });
            // Read existing state
            if (this.ui_radio_boolean_new.parent().hasClass('active')) {
                self.change_boolean_mode(BooleanMode.NEW);
            }
            else if (this.ui_radio_boolean_add.parent().hasClass('active')) {
                self.change_boolean_mode(BooleanMode.ADD);
            }
            else if (this.ui_radio_boolean_sub.parent().hasClass('active')) {
                self.change_boolean_mode(BooleanMode.SUBTRACT);
            }
            else if (this.ui_radio_boolean_split.parent().hasClass('active')) {
                self.change_boolean_mode(BooleanMode.NEW);
                self.ui_radio_boolean_split.closest('label.btn').removeClass('active');
                self.ui_radio_boolean_new.closest('label.btn').addClass('active');
            }

            this.ui_radio_draw_poly = this.ui.find('#multi_poly_draw_poly');
            this.ui_radio_draw_brush = this.ui.find('#multi_poly_draw_brush');
            this.ui_radio_draw_poly.on('change', function(event: any, ui: any) {
                if (event.target.checked) {
                    self.draw_mode_poly();
                }
            });
            this.ui_radio_draw_brush.on('change', function(event: any, ui: any) {
                if (event.target.checked) {
                    self.draw_mode_brush();
                }
            });
            // Read existing state
            if (this.ui_radio_draw_poly.parent().hasClass('active')) {
                self.draw_mode_poly();
            }
            else if (this.ui_radio_draw_brush.parent().hasClass('active')) {
                self.draw_mode_brush();
            }
        }

        on_shutdown() {
            super.on_init();
            this.ui.addClass('anno_hidden');
            this.ui_radio_boolean_new.off('change');
            this.ui_radio_boolean_add.off('change');
            this.ui_radio_boolean_sub.off('change');
            this.ui_radio_boolean_split.off('change');
            this.ui_radio_draw_poly.off('change');
            this.ui_radio_draw_brush.off('change');
        }

        on_cancel(pos: Vector2): boolean {
            if (super.on_cancel(pos)) {
                return true;
            }

            if (this.entity !== null) {
                this.entity.commit();
                this.entity = null;
            }
            else {
                this._view.unselect_all_entities();
                this._view.view.set_current_tool(new SelectEntityTool(this._view));
            }
            return true;
        };



        on_key_down(event: any): boolean {
            if (super.on_key_down(event)) {
                return true;
            }
            var handled = false;
            var key: string = event.key;
            if (key === '/') {
                // Cycle between new, add and subtract; do not enter split mode
                // The use should choose split explicitly
                if (this.boolean_mode === BooleanMode.NEW) {
                    this.change_boolean_mode(BooleanMode.ADD);
                    this.ui_radio_boolean_add.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.ui_radio_boolean_add.closest('label.btn').addClass('active');
                }
                else if (this.boolean_mode === BooleanMode.ADD) {
                    this.change_boolean_mode(BooleanMode.SUBTRACT);
                    this.ui_radio_boolean_sub.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.ui_radio_boolean_sub.closest('label.btn').addClass('active');
                }
                else if (this.boolean_mode === BooleanMode.SUBTRACT || this.boolean_mode === BooleanMode.SPLIT) {
                    this.change_boolean_mode(BooleanMode.NEW);
                    this.ui_radio_boolean_new.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.ui_radio_boolean_new.closest('label.btn').addClass('active');
                }
                else {
                    throw "Unknown boolean mode= " + this.boolean_mode;
                }
                handled = true;
            }
            else if (event.key === ',') {
                if (this.underlying_tool === this.draw_poly_tool) {
                    this.set_underlying_tool(this.draw_brush_tool);
                    this.ui_radio_draw_brush.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.ui_radio_draw_brush.closest('label.btn').addClass('active');
                }
                else if (this.underlying_tool === this.draw_brush_tool) {
                    this.set_underlying_tool(this.draw_poly_tool);
                    this.ui_radio_draw_poly.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.ui_radio_draw_poly.closest('label.btn').addClass('active');
                }
                else {
                    throw "Unknown boolean mode= " + this.boolean_mode;
                }
                handled = true;
            }
            return handled;
        };


        notify_entity_deleted(entity: labelling_tool.AbstractLabelEntity<labelling_tool.AbstractLabelModel>) {
            this.draw_poly_tool.notify_entity_deleted(entity);
            this.draw_brush_tool.notify_entity_deleted(entity);
            if (entity === this.entity) {

                this.entity = null;
            }
            super.notify_entity_deleted(entity);
        }


        change_boolean_mode(mode: BooleanMode) {
            this.boolean_mode = mode;
            this.draw_poly_tool._update_style();
            this.draw_brush_tool._update_style();
        }

        draw_mode_poly() {
            this.set_underlying_tool(this.draw_poly_tool);
        }

        draw_mode_brush() {
            this.set_underlying_tool(this.draw_brush_tool);
        }


        static _model_regions_to_polybool(regions: Vector2[][]): any {
            let pb_regions: number[][][] = [];
            for (var reg_i = 0; reg_i < regions.length; reg_i++) {
                let region: Vector2[] = regions[reg_i];
                let pb_verts: number [][] = [];
                for (var i = 0; i < region.length; i++) {
                    pb_verts.push([region[i].x, region[i].y]);
                }
                pb_regions.push(pb_verts);
            }
            return {'regions': pb_regions, 'inverted': false};
        }

        static _polybool_to_model(p: any): Vector2[][] {
            let regions: Vector2[][] = [];
            for (var region_i = 0; region_i < p.regions.length; region_i++) {
                let pb_region = p.regions[region_i];
                let verts: Vector2[] = [];
                for (var vert_i = 0; vert_i < pb_region.length; vert_i++) {
                    verts.push({x: pb_region[vert_i][0], y: pb_region[vert_i][1]});
                }
                regions.push(verts);
            }
            return regions;
        }


        create_entity() {
            var label_class = this._view.view.get_label_class_for_new_label();
            var model = new_PolygonalLabelModel(label_class, "manual");
            var entity = this._view.get_or_create_entity_for_model(model);
            this.entity = entity;
            this._view.add_child(entity);
            this._view.select_entity(entity, false, false);
        };


        notify_draw(regions: Vector2[][]) {
            if (this.entity === null || this.boolean_mode === BooleanMode.NEW) {
                // Create a new label if we are in an appropriate mode
                if (this.boolean_mode === BooleanMode.NEW || this.boolean_mode === BooleanMode.ADD) {
                    this.create_entity();
                    this.entity.model.regions = regions;
                    this.entity.model.source = "manual";
                    this.entity.update();
                }
            }
            else {
                let existing_pb = EditPolyTool._model_regions_to_polybool(this.entity.model.regions);
                let new_pb = EditPolyTool._model_regions_to_polybool(regions);
                if (this.boolean_mode === BooleanMode.ADD) {
                    let composite_pb = PolyBool.union(existing_pb,  new_pb);
                    this.entity.model.regions = EditPolyTool._polybool_to_model(composite_pb);
                    this.entity.model.source = "manual";
                    this.entity.commit();
                    this.entity.update();
                }
                else if (this.boolean_mode === BooleanMode.SUBTRACT) {
                    let composite_pb = PolyBool.difference(existing_pb,  new_pb);
                    if (composite_pb.regions.length === 0) {
                        // There's nothing left...
                        this.entity.destroy();
                        this.entity = null;
                    }
                    else {
                        this.entity.model.regions = EditPolyTool._polybool_to_model(composite_pb);
                        this.entity.model.source = "manual";
                        this.entity.commit();
                        this.entity.update();
                    }
                }
                else if (this.boolean_mode === BooleanMode.SPLIT) {
                    let remaining_pb = PolyBool.difference(existing_pb,  new_pb);
                    let split_pb = PolyBool.intersect(existing_pb,  new_pb);

                    // Only split into two labels if:
                    // there are regions on *both* sides of the split, otherwise we are either
                    // leaving everything in the current/selected entity or we are splitting everything into
                    // a new entity.
                    if (remaining_pb.regions.length > 0 && split_pb.regions.length > 0) {
                        this.entity.model.regions = EditPolyTool._polybool_to_model(remaining_pb);
                        this.entity.model.source = "manual";
                        // No need to commit this entity as adding the new one below will send the changes
                        this.entity.update();

                        var split_model = new_PolygonalLabelModel(this.entity.model.label_class, "manual");
                        split_model.regions = EditPolyTool._polybool_to_model(split_pb);
                        var split_entity = this._view.get_or_create_entity_for_model(split_model);
                        this._view.add_child(split_entity);
                    }
                }
                else {
                    // Default: Add
                    let composite_pb = PolyBool.union(existing_pb,  new_pb);
                    this.entity.model.regions = EditPolyTool._polybool_to_model(composite_pb);
                    this.entity.model.source = "manual";
                    this.entity.commit();
                    this.entity.update();
                }
            }
        }
    }


    /*
    Draw polygon tool
     */
    class DrawSinglePolygonTool extends AbstractTool {
        edit_tool: EditPolyTool;
        entity: PolygonalLabelEntity;
        vertices: Vector2[];
        poly: any;
        _last_vertex_marker: any;
        _last_vertex_marker_visible: boolean;

        constructor(view: RootLabelView, entity: PolygonalLabelEntity, edit_tool: EditPolyTool) {
            super(view);
            var self = this;
            this.edit_tool = edit_tool;
            this.entity = entity;
            this.vertices = [];
            this.poly = null;

            this._last_vertex_marker = null;
            this._last_vertex_marker_visible = false;
        }

        _create_poly() {
            this.poly = this._view.world.append("path");
            this.poly.data(this.vertices).attr("d", shape_line(this.vertices));
            this._update_style();
        }

        _update_style() {
            if (this.poly !== null) {
                let marker_colour: Colour4 = null;
                let stroke_colour: Colour4 = null;
                let fill_colour: Colour4 = null;

                if (this.edit_tool.boolean_mode == BooleanMode.NEW) {
                    marker_colour = new Colour4(64, 160, 255, 1.0);
                    stroke_colour = new Colour4(0, 128, 255, 1.0);
                    fill_colour = new Colour4(64, 80, 96, 1.0);
                } else if (this.edit_tool.boolean_mode == BooleanMode.ADD) {
                    marker_colour = new Colour4(64, 255, 80, 1.0);
                    stroke_colour = new Colour4(0, 255, 64, 1.0);
                    fill_colour = new Colour4(64, 96, 80, 1.0);
                } else if (this.edit_tool.boolean_mode == BooleanMode.SUBTRACT) {
                    marker_colour = new Colour4(255, 64, 128, 1.0);
                    stroke_colour = new Colour4(255, 0, 128, 1.0);
                    fill_colour = new Colour4(96, 64, 80, 1.0);
                } else if (this.edit_tool.boolean_mode == BooleanMode.SPLIT) {
                    marker_colour = new Colour4(255, 64, 255, 1.0);
                    stroke_colour = new Colour4(255, 0, 255, 1.0);
                    fill_colour = new Colour4(96, 64, 96, 1.0);
                }
                fill_colour = fill_colour.with_alpha(0.35);

                if (this._last_vertex_marker !== null) {
                    this._last_vertex_marker.style("stroke", marker_colour.to_rgba_string());
                }
                this.poly.attr("style", "fill:" + fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1")
                    .attr("visibility", "visible");
            }
        }

        on_init() {
            this._create_poly();

            this._last_vertex_marker = this._view.world.append("circle");
            this._last_vertex_marker.attr("r", "3.0");
            this._last_vertex_marker.attr("visibility", "hidden");
            this._last_vertex_marker.style("fill", "rgba(128,0,192,0.1)");
            this._last_vertex_marker.style("stroke-width", "1.5");
            this._last_vertex_marker.style("stroke", "rgba(0,128,255,1.0)");
            this._last_vertex_marker_visible = false;
        };

        on_shutdown() {
            this._last_vertex_marker.remove();
            this._last_vertex_marker = null;

            this.poly.remove();
            this.poly = null;
        };

        on_switch_in(pos: Vector2) {
            this.add_point(pos);
            this._last_vertex_marker_visible = true;
        };

        on_switch_out(pos: Vector2) {
            this._last_vertex_marker_visible = false;
            this.remove_last_point();
        };


        on_cancel(pos: Vector2): boolean {
            let handled = false;
            this._last_vertex_marker_visible = false;
            if (this.vertices.length > 0) {
                this.remove_last_point();
                if (this.vertices.length >= 3) {
                    this.edit_tool.notify_draw([this.vertices]);
                }
                handled = this.vertices.length > 0;
            }
            this.vertices = [];
            this.add_point(pos);

            this.poly.remove();
            this._create_poly();

            return handled;
        };

        on_left_click(pos: Vector2, event: any) {
            this.add_point(pos);
        };

        on_move(pos: Vector2) {
            this.update_last_point(pos);
        };

        on_drag(pos: Vector2, event: any) {
            if (event.shiftKey) {
                this.add_point(pos);
                return true;
            }
            return false;
        };


        notify_entity_deleted(entity: labelling_tool.AbstractLabelEntity<labelling_tool.AbstractLabelModel>) {
            if (entity === this.entity) {
                this.entity = null;
                this.vertices = [];
                if (this.poly !== null) {
                    this.poly.remove();
                }
                this._create_poly();
            }
            super.notify_entity_deleted(entity);
        }


        update_poly() {
            this.poly.data(this.vertices).attr("d", shape_line(this.vertices));
            var last_vertex_pos: Vector2 = null;
            if (this.vertices.length >= 1 && this._last_vertex_marker_visible) {
                last_vertex_pos = this.vertices[this.vertices.length - 1];
            }
            this.show_last_vertex_at(last_vertex_pos);
        };

        show_last_vertex_at(pos: Vector2) {
            if (pos === null) {
                this._last_vertex_marker.attr("visibility", "hidden");
            } else {
                this._last_vertex_marker.attr("visibility", "visible");
                this._last_vertex_marker.attr("cx", pos.x);
                this._last_vertex_marker.attr("cy", pos.y);
            }
        }


        add_point(pos: Vector2) {
            this.vertices.push(pos);
            this.update_poly();
        };

        update_last_point(pos: Vector2) {
            this.vertices[this.vertices.length - 1] = pos;
            this.update_poly();
        };

        remove_last_point() {
            if (this.vertices.length > 0) {
                this.vertices.splice(this.vertices.length - 1, 1);
                this.update_poly();
            }
        };
    }


    /*
    Draw brush tool
     */
    class DrawBrushTool extends AbstractTool {
        edit_tool: EditPolyTool;
        entity: PolygonalLabelEntity;
        regions: Vector2[][];
        poly: any;
        last_pos: Vector2;

        _brush_radius: number;
        _brush_circle: any;
        _brush_segments: number;

        constructor(view: RootLabelView, entity: PolygonalLabelEntity, edit_tool: EditPolyTool) {
            super(view);
            var self = this;
            this.edit_tool = edit_tool;
            this.entity = entity;
            this.regions = [];
            this.poly = null;
            this.last_pos = null;

            this._brush_radius = 10.0;
            this._brush_circle = null;
            this._brush_segments = 12;
        }

        _create_poly() {
            this.poly = this._view.world.append("path");
            this.poly.data(this.regions).attr("d", multi_path(this.regions));
            this._update_style();
        }

        _update_style() {
            if (this.poly !== null) {
                let stroke_colour: Colour4 = null;
                let fill_colour: Colour4 = null;
                let brush_fill_colour: Colour4 = null;

                if (this.edit_tool.boolean_mode == BooleanMode.NEW) {
                    stroke_colour = new Colour4(0, 128, 255, 1.0);
                    fill_colour = new Colour4(64, 80, 96, 1.0);
                } else if (this.edit_tool.boolean_mode == BooleanMode.ADD) {
                    stroke_colour = new Colour4(0, 255, 64, 1.0);
                    fill_colour = new Colour4(64, 96, 80, 1.0);
                } else if (this.edit_tool.boolean_mode == BooleanMode.SUBTRACT) {
                    stroke_colour = new Colour4(255, 0, 128, 1.0);
                    fill_colour = new Colour4(96, 64, 80, 1.0);
                } else if (this.edit_tool.boolean_mode == BooleanMode.SPLIT) {
                    stroke_colour = new Colour4(255, 0, 255, 1.0);
                    fill_colour = new Colour4(96, 64, 96, 1.0);
                }
                brush_fill_colour = fill_colour.with_alpha(0.05);
                fill_colour = fill_colour.with_alpha(0.35);

                this.poly.attr("style", "fill:" + fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1")
                    .attr("visibility", "visible");
                if (this._brush_circle !== null) {
                    this._brush_circle.attr("style", "fill:" + brush_fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                }
            }
        }

        on_init() {
            this._brush_circle = this._view.world.append("circle");
            this._brush_circle.attr("r", this._brush_radius);
            this._brush_circle.attr("visibility", "hidden");
            this._brush_circle.style("fill", "rgba(128,0,0,0.05)");
            this._brush_circle.style("stroke-width", "1.0");
            this._brush_circle.style("stroke", "red");

            this._create_poly();
        };

        on_shutdown() {
            this.poly.remove();
            this.poly = null;

            this._brush_circle.remove();
            this._brush_circle = null;
        };

        on_switch_in(pos: Vector2) {
            this._brush_circle.attr("visibility", "visible");
        };

        on_switch_out(pos: Vector2) {
            this._brush_circle.attr("visibility", "hidden");
        };


        on_button_down(pos: Vector2, event: any) {
            this.last_pos = pos;
            return true;
        };

        on_button_up(pos: Vector2, event: any) {
            this.last_pos = null;
            if (this.regions.length > 0) {
                this.edit_tool.notify_draw(this.regions);
            }
            this.regions = [];
            this.poly.remove();
            this._create_poly();
            return true;
        };

        on_move(pos: Vector2) {
            this._brush_circle.attr("cx", pos.x);
            this._brush_circle.attr("cy", pos.y);
        };

        on_drag(pos: Vector2, event: any): boolean {
            let brush_poly = this.make_brush_poly(this.last_pos, pos);
            this.last_pos = pos;
            this._brush_circle.attr("cx", pos.x);
            this._brush_circle.attr("cy", pos.y);

            let existing_pb = EditPolyTool._model_regions_to_polybool(this.regions);
            let new_pb = EditPolyTool._model_regions_to_polybool([brush_poly]);
            let composite_pb: any = PolyBool.union(existing_pb,  new_pb);
            this.regions = EditPolyTool._polybool_to_model(composite_pb);

            this.poly.data(this.regions).attr("d", multi_path(this.regions));

            return true;
        };

        on_wheel(pos: Vector2, wheelDeltaX: number, wheelDeltaY: number): boolean {
            let wheel_rate = this._view.get_settings().brushWheelRate;
            if (typeof wheel_rate != "number") {
                wheel_rate = 0.025;
            }
            this._brush_radius += wheelDeltaY * wheel_rate;
            this._brush_radius = Math.max(this._brush_radius, 1.0);
            this._brush_circle.attr("r", this._brush_radius);
            return true;
        };

        on_key_down(event: any): boolean {
            var handled = false;
            let key_rate = this._view.get_settings().brushKeyRate;
            if (typeof key_rate != "number") {
                key_rate = 2.0;
            }
            if (event.keyCode == 219) {
                this._brush_radius -= key_rate;
                handled = true;
            }
            else if (event.keyCode == 221) {
                this._brush_radius += key_rate;
                handled = true;
            }
            if (handled) {
                this._brush_radius = Math.max(this._brush_radius, 1.0);
                this._brush_circle.attr("r", this._brush_radius);
            }
            return handled;
        };


        notify_entity_deleted(entity: labelling_tool.AbstractLabelEntity<labelling_tool.AbstractLabelModel>) {
            if (entity === this.entity) {
                this.entity = null;
                this.regions = [];
                if (this.poly !== null) {
                    this.poly.remove();
                }
                this._create_poly();
            }
            super.notify_entity_deleted(entity);
        }


        make_brush_poly(start: Vector2, end: Vector2) {
            let poly: Vector2[] = [];
            let delta: Vector2 = sub_Vector2(end, start);

            let theta: number = 0;
            let d_theta: number = Math.PI * 2.0 / this._brush_segments;
            for (var vert_i = 0; vert_i < this._brush_segments; vert_i++) {
                let offset: Vector2 = {
                    x: Math.cos(theta) * this._brush_radius,
                    y: Math.sin(theta) * this._brush_radius
                };
                if (dot_Vector2(offset, delta) >= 0.0) {
                    // Leading edge
                    poly.push(add_Vector2(end, offset));
                }
                else {
                    // Trailing edge
                    poly.push(add_Vector2(start, offset));
                }
                theta += d_theta
            }
            return poly;
        }
    }

}
