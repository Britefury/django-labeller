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
/// <reference path="../polyk.d.ts" />
/// <reference path="./math_primitives.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./root_label_view.ts" />
var labelling_tool;
(function (labelling_tool) {
    function new_PolygonalLabelModel(label_class, source) {
        return { label_type: 'polygon', label_class: label_class, source: source, regions: [] };
    }
    labelling_tool.new_PolygonalLabelModel = new_PolygonalLabelModel;
    var shape_line = d3.svg.line()
        .x(function (d) { return d.x; })
        .y(function (d) { return d.y; })
        .interpolate("linear-closed");
    function multi_path(regions) {
        var lines = [];
        for (var i = 0; i < regions.length; i++) {
            lines.push(shape_line(regions[i]));
        }
        return lines.join(' ');
    }
    function convert_model(model) {
        var m = model;
        if (m.hasOwnProperty('vertices')) {
            m.regions = [m.vertices];
            delete m.vertices;
        }
        return m;
    }
    /*
    Polygonal label entity
     */
    var PolygonalLabelEntity = /** @class */ (function (_super) {
        __extends(PolygonalLabelEntity, _super);
        function PolygonalLabelEntity(view, model) {
            var _this = this;
            model = convert_model(model);
            _this = _super.call(this, view, model) || this;
            _this._polyk_polys = [];
            _this._centroid = null;
            _this._bounding_box = null;
            _this.poly = null;
            return _this;
        }
        PolygonalLabelEntity.prototype.attach = function () {
            var _this = this;
            _super.prototype.attach.call(this);
            var self = this;
            // let paths = this.root_view.world.append("g").selectAll("path").data(this.model.polys).join("path");
            // paths.attr("d", function(d: SinglePolyLabel) {self.shape_line(d.vertices)});
            this.poly = this.root_view.world.append("path").attr('fill-rule', 'evenodd');
            this.poly.data(this.model.regions).attr("d", multi_path(this.model.regions));
            this.poly.on("mouseover", function () {
                for (var i = 0; i < _this._event_listeners.length; i++) {
                    _this._event_listeners[i].on_mouse_in(_this);
                }
            });
            this.poly.on("mouseout", function () {
                for (var i = 0; i < _this._event_listeners.length; i++) {
                    _this._event_listeners[i].on_mouse_out(_this);
                }
            });
            this._update_polyk_polys();
            this._update_style();
        };
        ;
        PolygonalLabelEntity.prototype.detach = function () {
            this.poly.remove();
            this.poly = null;
            this._polyk_polys = [];
            _super.prototype.detach.call(this);
        };
        ;
        PolygonalLabelEntity.prototype._update_polyk_polys = function () {
            this._polyk_polys = [];
            for (var region_i = 0; region_i < this.model.regions.length; region_i++) {
                var region = this.model.regions[region_i];
                var pkpoly = [];
                for (var vert_i = 0; vert_i < region.length; vert_i++) {
                    pkpoly.push(region[vert_i].x);
                    pkpoly.push(region[vert_i].y);
                }
                this._polyk_polys.push(pkpoly);
            }
        };
        PolygonalLabelEntity.prototype.update = function () {
            var self = this;
            this.poly.data(this.model.regions).attr("d", multi_path(this.model.regions));
            this._update_polyk_polys();
            this._centroid = null;
            this._bounding_box = null;
            this._update_style();
        };
        PolygonalLabelEntity.prototype.commit = function () {
            this.root_view.commit_model(this.model);
        };
        PolygonalLabelEntity.prototype._update_style = function () {
            if (this._attached) {
                var vis = this.get_visibility();
                if (vis == labelling_tool.LabelVisibility.HIDDEN) {
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
        };
        PolygonalLabelEntity.prototype._get_stroke_and_fill_colour = function () {
            var vis = this.get_visibility();
            var stroke_colour = this._outline_colour();
            var fill_colour = this.root_view.view.colour_for_label_class(this.model.label_class);
            if (vis == labelling_tool.LabelVisibility.FAINT) {
                stroke_colour = stroke_colour.with_alpha(0.2);
                if (this._hover) {
                    fill_colour = fill_colour.lighten(0.4);
                }
                if (this._selected) {
                    fill_colour = fill_colour.lerp(new labelling_tool.Colour4(255, 128, 0.0, 1.0), 0.2);
                }
                fill_colour = fill_colour.with_alpha(0.1);
            }
            else if (vis == labelling_tool.LabelVisibility.FULL) {
                if (this._hover) {
                    fill_colour = fill_colour.lighten(0.4);
                }
                if (this._selected) {
                    fill_colour = fill_colour.lerp(new labelling_tool.Colour4(255, 128, 0.0, 1.0), 0.2);
                }
                fill_colour = fill_colour.with_alpha(0.35);
            }
            return [stroke_colour, fill_colour];
        };
        PolygonalLabelEntity.prototype.compute_centroid = function () {
            if (this._centroid === null) {
                var centroids = [];
                for (var region_i = 0; region_i < this.model.regions.length; region_i++) {
                    centroids.push(labelling_tool.mean_of_points(this.model.regions[region_i]));
                }
                this._centroid = labelling_tool.mean_of_points(centroids);
            }
            return this._centroid;
        };
        PolygonalLabelEntity.prototype.compute_bounding_box = function () {
            if (this._bounding_box === null) {
                var boxes = [];
                for (var region_i = 0; region_i < this.model.regions.length; region_i++) {
                    boxes.push(labelling_tool.AABox_from_points(this.model.regions[region_i]));
                }
                this._bounding_box = labelling_tool.AABox_from_aaboxes(boxes);
            }
            return this._bounding_box;
        };
        PolygonalLabelEntity.prototype.contains_pointer_position = function (point) {
            if (this.compute_bounding_box().contains_point(point)) {
                var contain_count = 0;
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
        };
        PolygonalLabelEntity.prototype.distance_to_point = function (point) {
            var contain_count = 0;
            for (var region_i = 0; region_i < this._polyk_polys.length; region_i++) {
                if (PolyK.ContainsPoint(this._polyk_polys[region_i], point.x, point.y)) {
                    contain_count += 1;
                }
            }
            if ((contain_count % 2) == 1) {
                return 0.0;
            }
            var e = PolyK.ClosestEdge(this._polyk_polys[0], point.x, point.y);
            var dist = e.dist;
            for (var region_i = 1; region_i < this._polyk_polys.length; region_i++) {
                var e = PolyK.ClosestEdge(this._polyk_polys[region_i], point.x, point.y);
                if (e.dist < dist) {
                    dist = e.dist;
                }
            }
            return dist;
        };
        /*
        Create group label
         */
        PolygonalLabelEntity.merge_polygonal_labels = function (root_view) {
            var selection = root_view.get_selection().slice();
            root_view.unselect_all_entities();
            if (selection.length > 1) {
                // Can only merge if all entities are polygonal labels
                // Also compute a class frequency table
                var can_merge = true;
                var class_freq = {};
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
                    var best_class = null;
                    var best_freq = 0;
                    for (var cls in class_freq) {
                        if (class_freq[cls] > best_freq) {
                            best_class = cls;
                            best_freq = class_freq[cls];
                        }
                    }
                    var merged_pb = null;
                    for (var i = 0; i < selection.length; i++) {
                        var poly_entity = selection[i];
                        var entity_pb = EditPolyTool._model_regions_to_polybool(poly_entity.model.regions);
                        if (merged_pb === null) {
                            merged_pb = entity_pb;
                        }
                        else {
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
        };
        return PolygonalLabelEntity;
    }(labelling_tool.AbstractLabelEntity));
    labelling_tool.PolygonalLabelEntity = PolygonalLabelEntity;
    labelling_tool.register_entity_factory('polygon', function (root_view, model) {
        return new PolygonalLabelEntity(root_view, model);
    });
    var BooleanMode;
    (function (BooleanMode) {
        BooleanMode[BooleanMode["NEW"] = 0] = "NEW";
        BooleanMode[BooleanMode["ADD"] = 1] = "ADD";
        BooleanMode[BooleanMode["SUBTRACT"] = 2] = "SUBTRACT";
        BooleanMode[BooleanMode["SPLIT"] = 3] = "SPLIT";
    })(BooleanMode || (BooleanMode = {}));
    var EditPolyTool = /** @class */ (function (_super) {
        __extends(EditPolyTool, _super);
        function EditPolyTool(view, entity) {
            var _this = _super.call(this, view, null) || this;
            var self = _this;
            _this.entity = entity;
            _this.boolean_mode = BooleanMode.NEW;
            _this.draw_poly_tool = new DrawSinglePolygonTool(view, entity, self);
            _this.draw_brush_tool = new DrawBrushTool(view, entity, self);
            return _this;
        }
        EditPolyTool.prototype.on_init = function () {
            _super.prototype.on_init.call(this);
            var self = this;
            this.ui = $('.tool_edit_multi_poly');
            this.ui.removeClass('anno_hidden');
            this.ui_radio_boolean_new = this.ui.find('#multi_poly_boolean_new');
            this.ui_radio_boolean_add = this.ui.find('#multi_poly_boolean_add');
            this.ui_radio_boolean_sub = this.ui.find('#multi_poly_boolean_subtract');
            this.ui_radio_boolean_split = this.ui.find('#multi_poly_boolean_split');
            this.ui_radio_boolean_new.on('change', function (event, ui) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.NEW);
                }
            });
            this.ui_radio_boolean_add.on('change', function (event, ui) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.ADD);
                }
            });
            this.ui_radio_boolean_sub.on('change', function (event, ui) {
                if (event.target.checked) {
                    self.change_boolean_mode(BooleanMode.SUBTRACT);
                }
            });
            this.ui_radio_boolean_split.on('change', function (event, ui) {
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
            this.ui_radio_draw_poly.on('change', function (event, ui) {
                if (event.target.checked) {
                    self.draw_mode_poly();
                }
            });
            this.ui_radio_draw_brush.on('change', function (event, ui) {
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
        };
        EditPolyTool.prototype.on_shutdown = function () {
            _super.prototype.on_init.call(this);
            this.ui.addClass('anno_hidden');
            this.ui_radio_boolean_new.off('change');
            this.ui_radio_boolean_add.off('change');
            this.ui_radio_boolean_sub.off('change');
            this.ui_radio_boolean_split.off('change');
            this.ui_radio_draw_poly.off('change');
            this.ui_radio_draw_brush.off('change');
        };
        EditPolyTool.prototype.on_cancel = function (pos) {
            if (_super.prototype.on_cancel.call(this, pos)) {
                return true;
            }
            if (this.entity !== null) {
                this.entity.commit();
                this.entity = null;
            }
            else {
                this._view.unselect_all_entities();
                this._view.view.set_current_tool(new labelling_tool.SelectEntityTool(this._view));
            }
            return true;
        };
        ;
        EditPolyTool.prototype.on_key_down = function (event) {
            if (_super.prototype.on_key_down.call(this, event)) {
                return true;
            }
            var handled = false;
            var key = event.key;
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
        ;
        EditPolyTool.prototype.notify_entity_deleted = function (entity) {
            this.draw_poly_tool.notify_entity_deleted(entity);
            this.draw_brush_tool.notify_entity_deleted(entity);
            if (entity === this.entity) {
                this.entity = null;
            }
            _super.prototype.notify_entity_deleted.call(this, entity);
        };
        EditPolyTool.prototype.change_boolean_mode = function (mode) {
            this.boolean_mode = mode;
            this.draw_poly_tool._update_style();
            this.draw_brush_tool._update_style();
        };
        EditPolyTool.prototype.draw_mode_poly = function () {
            this.set_underlying_tool(this.draw_poly_tool);
        };
        EditPolyTool.prototype.draw_mode_brush = function () {
            this.set_underlying_tool(this.draw_brush_tool);
        };
        EditPolyTool._model_regions_to_polybool = function (regions) {
            var pb_regions = [];
            for (var reg_i = 0; reg_i < regions.length; reg_i++) {
                var region = regions[reg_i];
                var pb_verts = [];
                for (var i = 0; i < region.length; i++) {
                    pb_verts.push([region[i].x, region[i].y]);
                }
                pb_regions.push(pb_verts);
            }
            return { 'regions': pb_regions, 'inverted': false };
        };
        EditPolyTool._polybool_to_model = function (p) {
            var regions = [];
            for (var region_i = 0; region_i < p.regions.length; region_i++) {
                var pb_region = p.regions[region_i];
                var verts = [];
                for (var vert_i = 0; vert_i < pb_region.length; vert_i++) {
                    verts.push({ x: pb_region[vert_i][0], y: pb_region[vert_i][1] });
                }
                regions.push(verts);
            }
            return regions;
        };
        EditPolyTool.prototype.create_entity = function () {
            var label_class = this._view.view.get_label_class_for_new_label();
            var model = new_PolygonalLabelModel(label_class, "manual");
            var entity = this._view.get_or_create_entity_for_model(model);
            this.entity = entity;
            this._view.add_child(entity);
            this._view.select_entity(entity, false, false);
        };
        ;
        EditPolyTool.prototype.notify_draw = function (regions) {
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
                var existing_pb = EditPolyTool._model_regions_to_polybool(this.entity.model.regions);
                var new_pb = EditPolyTool._model_regions_to_polybool(regions);
                if (this.boolean_mode === BooleanMode.ADD) {
                    var composite_pb = PolyBool.union(existing_pb, new_pb);
                    this.entity.model.regions = EditPolyTool._polybool_to_model(composite_pb);
                    this.entity.model.source = "manual";
                    this.entity.commit();
                    this.entity.update();
                }
                else if (this.boolean_mode === BooleanMode.SUBTRACT) {
                    var composite_pb = PolyBool.difference(existing_pb, new_pb);
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
                    var remaining_pb = PolyBool.difference(existing_pb, new_pb);
                    var split_pb = PolyBool.intersect(existing_pb, new_pb);
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
                    var composite_pb = PolyBool.union(existing_pb, new_pb);
                    this.entity.model.regions = EditPolyTool._polybool_to_model(composite_pb);
                    this.entity.model.source = "manual";
                    this.entity.commit();
                    this.entity.update();
                }
            }
        };
        return EditPolyTool;
    }(labelling_tool.ProxyTool));
    labelling_tool.EditPolyTool = EditPolyTool;
    /*
    Draw polygon tool
     */
    var DrawSinglePolygonTool = /** @class */ (function (_super) {
        __extends(DrawSinglePolygonTool, _super);
        function DrawSinglePolygonTool(view, entity, edit_tool) {
            var _this = _super.call(this, view) || this;
            var self = _this;
            _this.edit_tool = edit_tool;
            _this.entity = entity;
            _this.vertices = [];
            _this.poly = null;
            _this._last_vertex_marker = null;
            _this._last_vertex_marker_visible = false;
            return _this;
        }
        DrawSinglePolygonTool.prototype._create_poly = function () {
            this.poly = this._view.world.append("path");
            this.poly.data(this.vertices).attr("d", shape_line(this.vertices));
            this._update_style();
        };
        DrawSinglePolygonTool.prototype._update_style = function () {
            if (this.poly !== null) {
                var marker_colour = null;
                var stroke_colour = null;
                var fill_colour = null;
                if (this.edit_tool.boolean_mode == BooleanMode.NEW) {
                    marker_colour = new labelling_tool.Colour4(64, 160, 255, 1.0);
                    stroke_colour = new labelling_tool.Colour4(0, 128, 255, 1.0);
                    fill_colour = new labelling_tool.Colour4(64, 80, 96, 1.0);
                }
                else if (this.edit_tool.boolean_mode == BooleanMode.ADD) {
                    marker_colour = new labelling_tool.Colour4(64, 255, 80, 1.0);
                    stroke_colour = new labelling_tool.Colour4(0, 255, 64, 1.0);
                    fill_colour = new labelling_tool.Colour4(64, 96, 80, 1.0);
                }
                else if (this.edit_tool.boolean_mode == BooleanMode.SUBTRACT) {
                    marker_colour = new labelling_tool.Colour4(255, 64, 128, 1.0);
                    stroke_colour = new labelling_tool.Colour4(255, 0, 128, 1.0);
                    fill_colour = new labelling_tool.Colour4(96, 64, 80, 1.0);
                }
                else if (this.edit_tool.boolean_mode == BooleanMode.SPLIT) {
                    marker_colour = new labelling_tool.Colour4(255, 64, 255, 1.0);
                    stroke_colour = new labelling_tool.Colour4(255, 0, 255, 1.0);
                    fill_colour = new labelling_tool.Colour4(96, 64, 96, 1.0);
                }
                fill_colour = fill_colour.with_alpha(0.35);
                if (this._last_vertex_marker !== null) {
                    this._last_vertex_marker.style("stroke", marker_colour.to_rgba_string());
                }
                this.poly.attr("style", "fill:" + fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1")
                    .attr("visibility", "visible");
            }
        };
        DrawSinglePolygonTool.prototype.on_init = function () {
            this._create_poly();
            this._last_vertex_marker = this._view.world.append("circle");
            this._last_vertex_marker.attr("r", "3.0");
            this._last_vertex_marker.attr("visibility", "hidden");
            this._last_vertex_marker.style("fill", "rgba(128,0,192,0.1)");
            this._last_vertex_marker.style("stroke-width", "1.5");
            this._last_vertex_marker.style("stroke", "rgba(0,128,255,1.0)");
            this._last_vertex_marker_visible = false;
        };
        ;
        DrawSinglePolygonTool.prototype.on_shutdown = function () {
            this._last_vertex_marker.remove();
            this._last_vertex_marker = null;
            this.poly.remove();
            this.poly = null;
        };
        ;
        DrawSinglePolygonTool.prototype.on_switch_in = function (pos) {
            this.add_point(pos);
            this._last_vertex_marker_visible = true;
        };
        ;
        DrawSinglePolygonTool.prototype.on_switch_out = function (pos) {
            this._last_vertex_marker_visible = false;
            this.remove_last_point();
        };
        ;
        DrawSinglePolygonTool.prototype.on_cancel = function (pos) {
            var handled = false;
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
        ;
        DrawSinglePolygonTool.prototype.on_left_click = function (pos, event) {
            this.add_point(pos);
        };
        ;
        DrawSinglePolygonTool.prototype.on_move = function (pos) {
            this.update_last_point(pos);
        };
        ;
        DrawSinglePolygonTool.prototype.on_drag = function (pos, event) {
            if (event.shiftKey) {
                this.add_point(pos);
                return true;
            }
            return false;
        };
        ;
        DrawSinglePolygonTool.prototype.notify_entity_deleted = function (entity) {
            if (entity === this.entity) {
                this.entity = null;
                this.vertices = [];
                if (this.poly !== null) {
                    this.poly.remove();
                }
                this._create_poly();
            }
            _super.prototype.notify_entity_deleted.call(this, entity);
        };
        DrawSinglePolygonTool.prototype.update_poly = function () {
            this.poly.data(this.vertices).attr("d", shape_line(this.vertices));
            var last_vertex_pos = null;
            if (this.vertices.length >= 1 && this._last_vertex_marker_visible) {
                last_vertex_pos = this.vertices[this.vertices.length - 1];
            }
            this.show_last_vertex_at(last_vertex_pos);
        };
        ;
        DrawSinglePolygonTool.prototype.show_last_vertex_at = function (pos) {
            if (pos === null) {
                this._last_vertex_marker.attr("visibility", "hidden");
            }
            else {
                this._last_vertex_marker.attr("visibility", "visible");
                this._last_vertex_marker.attr("cx", pos.x);
                this._last_vertex_marker.attr("cy", pos.y);
            }
        };
        DrawSinglePolygonTool.prototype.add_point = function (pos) {
            this.vertices.push(pos);
            this.update_poly();
        };
        ;
        DrawSinglePolygonTool.prototype.update_last_point = function (pos) {
            this.vertices[this.vertices.length - 1] = pos;
            this.update_poly();
        };
        ;
        DrawSinglePolygonTool.prototype.remove_last_point = function () {
            if (this.vertices.length > 0) {
                this.vertices.splice(this.vertices.length - 1, 1);
                this.update_poly();
            }
        };
        ;
        return DrawSinglePolygonTool;
    }(labelling_tool.AbstractTool));
    /*
    Draw brush tool
     */
    var DrawBrushTool = /** @class */ (function (_super) {
        __extends(DrawBrushTool, _super);
        function DrawBrushTool(view, entity, edit_tool) {
            var _this = _super.call(this, view) || this;
            var self = _this;
            _this.edit_tool = edit_tool;
            _this.entity = entity;
            _this.regions = [];
            _this.poly = null;
            _this.last_pos = null;
            _this._brush_radius = 10.0;
            _this._brush_circle = null;
            _this._brush_segments = 12;
            return _this;
        }
        DrawBrushTool.prototype._create_poly = function () {
            this.poly = this._view.world.append("path");
            this.poly.data(this.regions).attr("d", multi_path(this.regions));
            this._update_style();
        };
        DrawBrushTool.prototype._update_style = function () {
            if (this.poly !== null) {
                var stroke_colour = null;
                var fill_colour = null;
                var brush_fill_colour = null;
                if (this.edit_tool.boolean_mode == BooleanMode.NEW) {
                    stroke_colour = new labelling_tool.Colour4(0, 128, 255, 1.0);
                    fill_colour = new labelling_tool.Colour4(64, 80, 96, 1.0);
                }
                else if (this.edit_tool.boolean_mode == BooleanMode.ADD) {
                    stroke_colour = new labelling_tool.Colour4(0, 255, 64, 1.0);
                    fill_colour = new labelling_tool.Colour4(64, 96, 80, 1.0);
                }
                else if (this.edit_tool.boolean_mode == BooleanMode.SUBTRACT) {
                    stroke_colour = new labelling_tool.Colour4(255, 0, 128, 1.0);
                    fill_colour = new labelling_tool.Colour4(96, 64, 80, 1.0);
                }
                else if (this.edit_tool.boolean_mode == BooleanMode.SPLIT) {
                    stroke_colour = new labelling_tool.Colour4(255, 0, 255, 1.0);
                    fill_colour = new labelling_tool.Colour4(96, 64, 96, 1.0);
                }
                brush_fill_colour = fill_colour.with_alpha(0.05);
                fill_colour = fill_colour.with_alpha(0.35);
                this.poly.attr("style", "fill:" + fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1")
                    .attr("visibility", "visible");
                if (this._brush_circle !== null) {
                    this._brush_circle.attr("style", "fill:" + brush_fill_colour.to_rgba_string() + ";stroke:" + stroke_colour.to_rgba_string() + ";stroke-width:1");
                }
            }
        };
        DrawBrushTool.prototype.on_init = function () {
            this._brush_circle = this._view.world.append("circle");
            this._brush_circle.attr("r", this._brush_radius);
            this._brush_circle.attr("visibility", "hidden");
            this._brush_circle.style("fill", "rgba(128,0,0,0.05)");
            this._brush_circle.style("stroke-width", "1.0");
            this._brush_circle.style("stroke", "red");
            this._create_poly();
        };
        ;
        DrawBrushTool.prototype.on_shutdown = function () {
            this.poly.remove();
            this.poly = null;
            this._brush_circle.remove();
            this._brush_circle = null;
        };
        ;
        DrawBrushTool.prototype.on_switch_in = function (pos) {
            this._brush_circle.attr("visibility", "visible");
        };
        ;
        DrawBrushTool.prototype.on_switch_out = function (pos) {
            this._brush_circle.attr("visibility", "hidden");
        };
        ;
        DrawBrushTool.prototype.on_button_down = function (pos, event) {
            this.last_pos = pos;
            return true;
        };
        ;
        DrawBrushTool.prototype.on_button_up = function (pos, event) {
            this.last_pos = null;
            if (this.regions.length > 0) {
                this.edit_tool.notify_draw(this.regions);
            }
            this.regions = [];
            this.poly.remove();
            this._create_poly();
            return true;
        };
        ;
        DrawBrushTool.prototype.on_move = function (pos) {
            this._brush_circle.attr("cx", pos.x);
            this._brush_circle.attr("cy", pos.y);
        };
        ;
        DrawBrushTool.prototype.on_drag = function (pos, event) {
            var brush_poly = this.make_brush_poly(this.last_pos, pos);
            this.last_pos = pos;
            this._brush_circle.attr("cx", pos.x);
            this._brush_circle.attr("cy", pos.y);
            var existing_pb = EditPolyTool._model_regions_to_polybool(this.regions);
            var new_pb = EditPolyTool._model_regions_to_polybool([brush_poly]);
            var composite_pb = PolyBool.union(existing_pb, new_pb);
            this.regions = EditPolyTool._polybool_to_model(composite_pb);
            this.poly.data(this.regions).attr("d", multi_path(this.regions));
            return true;
        };
        ;
        DrawBrushTool.prototype.on_wheel = function (pos, wheelDeltaX, wheelDeltaY) {
            this._brush_radius += wheelDeltaY * 0.1;
            this._brush_radius = Math.max(this._brush_radius, 1.0);
            this._brush_circle.attr("r", this._brush_radius);
            return true;
        };
        ;
        DrawBrushTool.prototype.on_key_down = function (event) {
            var handled = false;
            if (event.keyCode == 219) {
                this._brush_radius -= 2.0;
                handled = true;
            }
            else if (event.keyCode == 221) {
                this._brush_radius += 2.0;
                handled = true;
            }
            if (handled) {
                this._brush_radius = Math.max(this._brush_radius, 1.0);
                this._brush_circle.attr("r", this._brush_radius);
            }
            return handled;
        };
        ;
        DrawBrushTool.prototype.notify_entity_deleted = function (entity) {
            if (entity === this.entity) {
                this.entity = null;
                this.regions = [];
                if (this.poly !== null) {
                    this.poly.remove();
                }
                this._create_poly();
            }
            _super.prototype.notify_entity_deleted.call(this, entity);
        };
        DrawBrushTool.prototype.make_brush_poly = function (start, end) {
            var poly = [];
            var delta = labelling_tool.sub_Vector2(end, start);
            var theta = 0;
            var d_theta = Math.PI * 2.0 / this._brush_segments;
            for (var vert_i = 0; vert_i < this._brush_segments; vert_i++) {
                var offset = {
                    x: Math.cos(theta) * this._brush_radius,
                    y: Math.sin(theta) * this._brush_radius
                };
                if (labelling_tool.dot_Vector2(offset, delta) >= 0.0) {
                    // Leading edge
                    poly.push(labelling_tool.add_Vector2(end, offset));
                }
                else {
                    // Trailing edge
                    poly.push(labelling_tool.add_Vector2(start, offset));
                }
                theta += d_theta;
            }
            return poly;
        };
        return DrawBrushTool;
    }(labelling_tool.AbstractTool));
})(labelling_tool || (labelling_tool = {}));
