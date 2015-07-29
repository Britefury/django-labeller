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
function LabellingTool() {
    /*
    Colour utility functions
     */
    var lighten_colour = function(rgb, amount) {
        var x = 1.0 - amount;
        return [Math.round(rgb[0]*x + 255*amount),
            Math.round(rgb[1]*x + 255*amount),
            Math.round(rgb[2]*x + 255*amount)];
    };

    var rgb_to_rgba_string = function(rgb, alpha) {
        return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
    };

    var compute_centroid_of_points = function(vertices) {
        var sum = [0.0, 0.0];
        var N = vertices.length;
        if (N === 0) {
            return {
                x: 0.0,
                y: 0.0
            };
        }
        else {
            for (var i = 0; i < N; i++) {
                var vtx = vertices[i];
                sum[0] += vtx.x;
                sum[1] += vtx.y;
            }
            var scale = 1.0 / N;
            return {
                x: sum[0] * scale,
                y: sum[1] * scale
            };
        }
    };



    /*
    Object ID table
     */
    var ObjectIDTable = function() {
        var self = {
            _id_counter: 1,
            _id_to_object: {}
        };

        self.get = function(id) {
            return self._id_to_object[id];
        };

        self.register = function(obj) {
            var id;
            if ('object_id' in obj  &&  obj.object_id !== null) {
                id = obj.object_id;
                self._id_counter = Math.max(self._id_counter, id+1);
                self._id_to_object[id] = obj;
            }
            else {
                id = self._id_counter;
                self._id_counter += 1;
                self._id_to_object[id] = obj;
            }
        };

        self.unregister = function(obj) {
            self._id_to_object[obj.object_id] = null;
            obj.object_id = null;
        };


        self.register_objects = function(object_array) {
            var obj, id, i;

            for (i = 0; i < object_array.length; i++) {
                obj = object_array[i];
                if ('object_id' in obj  &&  obj.object_id !== null) {
                    id = obj.object_id;
                    self._id_counter = Math.max(self._id_counter, id+1);
                    self._id_to_object[id] = obj;
                }
            }

            for (i = 0; i < object_array.length; i++) {
                obj = object_array[i];

                if ('object_id' in obj  &&  obj.object_id !== null) {

                }
                else {
                    id = self._id_counter;
                    self._id_counter += 1;
                    self._id_to_object[id] = obj;
                    obj.object_id = id;
                }
            }
        };

        return self;
    };


    /*
    Label header model

    This is the model that gets send back and forth between the frontend and the backend.
    It combines:
    - an array of labels
    - an image ID that identifies the image to which the labels belong
    - a complete flag that indicates if the image is done
     */

    var LabelHeaderModel = function(image_id, complete, labels) {
        var self = {image_id: image_id,
            complete: complete,
            labels: labels};

        return self;
    };

    var replace_label_header_labels = function(label_header, labels) {
        return LabelHeaderModel(label_header.image_id, label_header.complete, labels);
    };



    /*
    Abstract label model
     */
    var AbstractLabelModel = function() {
        var self = {
            label_type: null,
            label_class: null,
        };
        return self;
    };


    /*
    Create a polygonal label model
     */
    var PolygonalLabelModel = function() {
        var self = AbstractLabelModel();
        self.label_type = 'polygon';
        self.vertices = [];
        return self;
    };


    /*
    Composite label model
     */
    var CompositeLabelModel = function() {
        var self = AbstractLabelModel();
        self.label_type = 'composite';
        self.components = [];

        return self;
    };





    /*
    Abstract label entity
     */
    var AbstractLabelEntity = function(view, model) {
        var self = {
            model: model,
            _view: view,
            _hover: false,
            _selected: false
        };

        self.attach = function() {
        };

        self.detach = function() {
        };

        self.update = function() {
        };

        self.commit = function() {
        };

        self.hover = function(state) {
            self._hover = state;
            self._update_style();
        };

        self.select = function(state) {
            self._selected = state;
            self._update_style();
        };

        self.notify_hide_labels_change = function(state) {
            self._update_style();
        };

        self.get_label_class = function() {
            return self.model.label_class;
        };

        self.set_label_class = function(label_class) {
            self.model.label_class = label_class;
            self._update_style();
            view.commit_model(self.model);
        };

        self._update_style = function() {
        };

        self.compute_centroid = function() {
            return null;
        };

        self.notify_model_destroyed = function(model_id) {
        };

        return self;
    };


    /*
    Polygonal label entity
     */
    var PolygonalLabelEntity = function(view, polygonal_label_model) {
        var self = AbstractLabelEntity(view, polygonal_label_model);

        self.ev_mouse_in = [];
        self.ev_mouse_out = [];

        self._hover = false;
        self._selected = false;

        self.attach = function() {
            self.shape_line = d3.svg.line()
                .x(function (d) { return d.x; })
                .y(function (d) { return d.y; })
                .interpolate("linear-closed");

            self.poly = self._view.$container.append("path");
            self.poly.data(self.model.vertices).attr("d", self.shape_line(self.model.vertices));

            self.poly.on("mouseover", function() {
                for (var i = 0; i < self.ev_mouse_in.length; i++) {
                    self.ev_mouse_in[i](self);
                }
                self._view.on_entity_mouse_in(self);
            });

            self.poly.on("mouseout", function() {
                for (var i = 0; i < self.ev_mouse_in.length; i++) {
                    self.ev_mouse_out[i](self);
                }
                self._view.on_entity_mouse_out(self);
            });

            self._update_style();
        };

        self.detach = function() {
            self.poly.remove();
        };

        self.update = function() {
            self.poly.data(self.model.vertices).attr("d", self.shape_line(self.model.vertices));
        };

        self.commit = function() {
            self._view.commit_model(self.model);
        };


        self._update_style = function() {
            var stroke_colour = self._selected ? [255,0,0] : [255,255,0];

            if (self._view.hide_labels) {
                stroke_colour = rgb_to_rgba_string(stroke_colour, 0.2);
                self.poly.attr("style", "fill:none;stroke:" + stroke_colour + ";stroke-width:1");
            }
            else {
                var fill_colour = self._view.colour_for_label_class(self.model.label_class);
                if (self._hover) {
                    fill_colour = lighten_colour(fill_colour, 0.4);
                }
                fill_colour = rgb_to_rgba_string(fill_colour, 0.35);

                stroke_colour = rgb_to_rgba_string(stroke_colour, 0.5);

                self.poly.attr("style", "fill:" + fill_colour + ";stroke:" + stroke_colour + ";stroke-width:1");
            }
        };

        self.compute_centroid = function() {
            return compute_centroid_of_points(self.model.vertices);
        };


        self.poly = null;

        return self;
    };


    /*
    Composite label entity
     */
    var CompositeLabelEntity = function(view, composite_label_model) {
        var self = AbstractLabelEntity(view, composite_label_model);

        self.ev_mouse_in = [];
        self.ev_mouse_out = [];

        self._hover = false;
        self._selected = false;

        self.attach = function() {
            self.circle = self._view.$container.append("circle")
                .attr('r', 8.0);

            self.central_circle = self._view.$container.append("circle")
                .attr('r', 4.0);

            self.shape_line = d3.svg.line()
                .x(function (d) { return d.x; })
                .y(function (d) { return d.y; })
                .interpolate("linear-closed");

            self.connections_group = null;

            self.update();

            self.circle.on("mouseover", function() {
                self._on_mouse_over_event();
            }).on("mouseout", function() {
                self._on_mouse_out_event();
            });

            self.central_circle.on("mouseover", function() {
                self._on_mouse_over_event();
            }).on("mouseout", function() {
                self._on_mouse_out_event();
            });


            self._update_style();
        };


        self._on_mouse_over_event = function() {
            for (var i = 0; i < self.ev_mouse_in.length; i++) {
                self.ev_mouse_in[i](self);
            }
            self._view.on_entity_mouse_in(self);
        };

        self._on_mouse_out_event = function() {
            for (var i = 0; i < self.ev_mouse_in.length; i++) {
                self.ev_mouse_out[i](self);
            }
            self._view.on_entity_mouse_out(self);
        };


        self.detach = function() {
            self.circle.remove();
            self.central_circle.remove();
            self.connections_group.remove();
            self.connections_group = null;
        };

        self.update = function() {
            var component_centroids = self._compute_component_centroids();
            var centroid = compute_centroid_of_points(component_centroids);

            self.circle
                .attr('cx', centroid.x)
                .attr('cy', centroid.y);

            self.central_circle
                .attr('cx', centroid.x)
                .attr('cy', centroid.y);

            if (self.connections_group !== null) {
                self.connections_group.remove();
                self.connections_group = null;
            }

            self.connections_group = self._view.$container.append("g");
            for (var i = 0; i < component_centroids.length; i++) {
                self.connections_group.append("path")
                    .attr("d", self.shape_line([centroid, component_centroids[i]]))
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "3, 3")
                    .attr("style", "stroke:rgba(255,0,255,0.6);");
                self.connections_group.append("circle")
                    .attr("cx", component_centroids[i].x)
                    .attr("cy", component_centroids[i].y)
                    .attr("r", 3)
                    .attr("stroke-width", 1)
                    .attr("style", "stroke:rgba(255,0,255,0.6);fill: rgba(255,0,255,0.25);");
            }
        };

        self.commit = function() {
            self._view.commit_model(self.model);
        };


        self._update_style = function() {
            var stroke_colour = self._selected ? [255,0,0] : [255,255,0];

            if (self._view.hide_labels) {
                stroke_colour = rgb_to_rgba_string(stroke_colour, 0.2);
                self.circle.attr("style", "fill:none;stroke:" + stroke_colour + ";stroke-width:1");

                self.connections_group.selectAll("path")
                    .attr("style", "stroke:rgba(255,0,255,0.2);");
                self.connections_group.selectAll("circle")
                    .attr("style", "stroke:rgba(255,0,255,0.2);fill: none;");            }
            else {
                var circle_fill_colour = [255, 128, 255];
                var central_circle_fill_colour = self._view.colour_for_label_class(self.model.label_class);
                var connection_fill_colour = [255, 0, 255];
                var connection_stroke_colour = [255, 0, 255];
                if (self._hover) {
                    circle_fill_colour = lighten_colour(circle_fill_colour, 0.4);
                    central_circle_fill_colour = lighten_colour(central_circle_fill_colour, 0.4);
                    connection_fill_colour = lighten_colour(connection_fill_colour, 0.4);
                    connection_stroke_colour = lighten_colour(connection_stroke_colour, 0.4);
                }
                circle_fill_colour = rgb_to_rgba_string(circle_fill_colour, 0.35);
                central_circle_fill_colour = rgb_to_rgba_string(central_circle_fill_colour, 0.35);
                connection_fill_colour = rgb_to_rgba_string(connection_fill_colour, 0.25);
                connection_stroke_colour = rgb_to_rgba_string(connection_stroke_colour, 0.6);

                stroke_colour = rgb_to_rgba_string(stroke_colour, 0.5);

                self.circle.attr("style", "fill:" + circle_fill_colour + ";stroke:" + connection_stroke_colour + ";stroke-width:1");
                self.central_circle.attr("style", "fill:" + central_circle_fill_colour + ";stroke:" + stroke_colour + ";stroke-width:1");

                self.connections_group.selectAll("path")
                    .attr("style", "stroke:rgba(255,0,255,0.6);");
                self.connections_group.selectAll("circle")
                    .attr("style", "stroke:"+connection_stroke_colour+";fill:"+connection_fill_colour+";");
            }
        };

        self._compute_component_centroids = function() {
            var component_centroids = [];
            for (var i = 0; i < self.model.components.length; i++) {
                var model_id = self.model.components[i];
                var entity = self._view.get_entity_for_model_id(model_id);
                var centroid = entity.compute_centroid();
                component_centroids.push(centroid);
            }
            return component_centroids;
        };

        self.compute_centroid = function() {
            return compute_centroid_of_points(self._compute_component_centroids());
        };

        self.notify_model_destroyed = function(model_id) {
            var index = self.model.components.indexOf(model_id);

            if (index !== -1) {
                // Remove the model ID from the components array
                self.model.components = self.model.components.slice(0, index).concat(self.model.components.slice(index+1));
                self.update();
            }
        };

        self.poly = null;

        return self;
    };



    /*
    Map label type to entity constructor
     */
    var label_type_to_entity_constructor = {
        'polygon': PolygonalLabelEntity,
        'composite': CompositeLabelEntity
    };


    /*
    Construct entity for given label model.
    Uses the map above to choose the appropriate constructor
     */
    var new_entity_for_model = function(view, label_model) {
        var constructor = label_type_to_entity_constructor[label_model.label_type];
        return constructor(view, label_model);
    };



    /*
    Abstract tool
     */
    var AbstractTool = function(view) {
        var self = {
            _view: view
        };

        self.on_init = function() {
        };

        self.on_shutdown = function() {
        };

        self.on_switch_in = function(pos) {
        };

        self.on_switch_out = function(pos) {
        };

        self.on_left_click = function(pos, event) {
        };

        self.on_cancel = function(pos) {
        };

        self.on_move = function(pos) {
        };

        self.on_entity_mouse_in = function(entity) {
        };

        self.on_entity_mouse_out = function(entity) {
        };

        return self;
    };


    /*
    Select entity tool
     */
    var SelectEntityTool = function(view) {
        var self = AbstractTool(view);

        self._highlighted_entity_stack = [];

        self.on_init = function() {
            self._highlighted_entity_stack = [];
        };

        self.on_shutdown = function() {
            // Remove any hover
            var entity = self._get_current_entity();
            if (entity !== null) {
                entity.hover(false);
            }
        };


        self.on_entity_mouse_in = function(entity) {
            var prev = self._get_current_entity();
            self._highlighted_entity_stack.push(entity);
            var cur = self._get_current_entity();
            self._entity_stack_modified(prev, cur);
        };


        self.on_entity_mouse_out = function(entity) {
            var index = self._highlighted_entity_stack.indexOf(entity);

            if (index !== -1) {
                var prev = self._get_current_entity();
                self._highlighted_entity_stack.splice(index, 1);
                var cur = self._get_current_entity();
                self._entity_stack_modified(prev, cur);
            }
        };

        self.on_left_click = function(pos, event) {
            var entity = self._get_current_entity();
            if (entity !== null) {
                self._view.select_entity(entity, event.shiftKey);
            }
            else {
                if (!event.shiftKey) {
                    self._view.unselect_all_entities();
                }
            }
        };

        self._get_current_entity = function() {
            return self._highlighted_entity_stack.length !== 0  ?  self._highlighted_entity_stack[self._highlighted_entity_stack.length-1]  :  null;
        };

        self._entity_stack_modified = function(prev, cur) {
            if (cur !== prev) {
                if (prev !== null) {
                    prev.hover(false);
                }

                if (cur !== null) {
                    cur.hover(true);
                }
            }
        };

        return self;
    };


    /*
    Draw polygon tool
     */
    var DrawPolygonTool = function(view, entity) {
        var self = AbstractTool(view);

        self.entity = entity;

        self.on_init = function() {
        };

        self.on_shutdown = function() {
        };

        self.on_switch_in = function(pos) {
            if (self.entity !== null) {
                self.add_point(pos);
            }
        };

        self.on_switch_out = function(pos) {
            if (self.entity !== null) {
                self.remove_last_point();
            }
        };

        self.on_cancel = function(pos) {
            if (self.entity !== null) {
                self.remove_last_point();

                var vertices = self.get_vertices();
                if (vertices.length == 1) {
                    self.destroy_entity();
                }
                else {
                    self.entity.commit();
                    self.entity = null;
                }
            }
            else {
                self._view.unselect_all_entities();
                self._view.set_current_tool(SelectEntityTool(self._view));
            }
        };

        self.on_left_click = function(pos, event) {
            self.add_point(pos);
        };

        self.on_move = function(pos) {
            self.update_last_point(pos);
        };



        self.create_entity = function() {
            var model = PolygonalLabelModel();
            var entity = PolygonalLabelEntity(self._view, model);
            self.entity = entity;
            self._view.add_entity(entity, false);
            self._view.select_entity(entity, false);
        };

        self.destroy_entity = function() {
            self._view.remove_entity(self.entity, false);
            self.entity = null;
        };

        self.get_vertices = function() {
            return self.entity !== null  ?  self.entity.model.vertices  :  null;
        };

        self.update_poly = function() {
            if (self.entity !== null) {
                self.entity.update();
            }
        };

        self.add_point = function(pos) {
            var entity_is_new = false;
            if (self.entity === null) {
                self.create_entity();
                entity_is_new = true;
            }
            var vertices = self.get_vertices();

            if (entity_is_new) {
                // Add a duplicate vertex; this second vertex will follow the mouse
                vertices.push(pos);
            }
            vertices.push(pos);
            self.update_poly();
        };

        self.update_last_point = function(pos) {
            var vertices = self.get_vertices();
            if (vertices !== null) {
                vertices[vertices.length - 1] = pos;
                self.update_poly();
            }
        };

        self.remove_last_point = function() {
            var vertices = self.get_vertices();

            if (vertices !== null) {
                if (vertices.length > 0) {
                    vertices.splice(vertices.length - 1, 1);
                    self.update_poly();
                }

                if (vertices.length === 0) {
                    self.destroy_entity();
                }
            }
        };

        return self;
    };



    /*
    Labelling tool view; links to the server side data structures
     */
    var LabellingToolSelf = {};


    LabellingToolSelf.initialise = function(element, label_classes, tool_width, tool_height, image_ids, initial_image_id, requestImageCallback, sendLabelHeaderFn) {
        // Model
        LabellingToolSelf._label_header = {};
        // Entity list
        LabellingToolSelf.entities = [];
        // Active tool
        LabellingToolSelf.$tool = null;
        // Selected entity
        LabellingToolSelf.$selected_entities = [];
        // Classes
        LabellingToolSelf.$label_classes = label_classes;
        // Hide labels
        LabellingToolSelf.hide_labels = false;

        // Label model object table
        LabellingToolSelf._label_model_obj_table = ObjectIDTable();
        // Label model object ID to entity
        LabellingToolSelf._label_model_id_to_entity = {};

        // Labelling tool dimensions
        LabellingToolSelf._tool_width = tool_width;
        LabellingToolSelf._tool_height = tool_height;

        // List of Image IDs
        LabellingToolSelf._image_ids = image_ids;

        // Number of images in dataset
        LabellingToolSelf._num_images = image_ids.length;

        // Image dimensions
        LabellingToolSelf._image_width = 0;
        LabellingToolSelf._image_height = 0;

        // Data request callback; labelling tool will call this when it needs a new image to show
        LabellingToolSelf._requestImageCallback = requestImageCallback;
        // Send data callback; labelling tool will call this when it wants to commit data to the backend in response
        // to user action
        LabellingToolSelf._sendLabelHeaderFn = sendLabelHeaderFn;


        var toolbar_width = 220;
        LabellingToolSelf._labelling_area_width = LabellingToolSelf._tool_width - toolbar_width;
        var labelling_area_x_pos = toolbar_width + 10;


        // A <div> element that surrounds the labelling tool
        LabellingToolSelf._div = $('<div style="border: 1px solid gray; width: ' + LabellingToolSelf._tool_width + 'px;"/>')
            .appendTo(element);

        var toolbar_container = $('<div style="position: relative;">').appendTo(LabellingToolSelf._div);

        LabellingToolSelf._toolbar = $('<div style="position: absolute; width: ' + toolbar_width + 'px; padding: 4px; display: inline-block; background: #d0d0d0; border: 1px solid #a0a0a0;"/>').appendTo(toolbar_container);
        LabellingToolSelf._labelling_area = $('<div style="width:' + LabellingToolSelf._labelling_area_width + 'px; margin-left: ' + labelling_area_x_pos + 'px"/>').appendTo(LabellingToolSelf._div);


        /*
         *
         *
         * TOOLBAR CONTENTS
         *
         *
         */

        //
        // IMAGE CHOOSER
        //

        var _change_image = function(image_id) {
            LabellingToolSelf._requestImageCallback(image_id);
        };

        var _increment_image_index = function(offset) {
            var image_id = LabellingToolSelf._get_current_image_id();
            var index = LabellingToolSelf._image_id_to_index(image_id) + offset;
            _change_image(LabellingToolSelf._image_index_to_id(index));
        };

        $('<p style="background: #b0b0b0;">Current image</p>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._image_index_input = $('<input type="text" style="width: 30px; vertical-align: middle;" name="image_index"/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._image_index_input.on('change', function() {
            var index_str = LabellingToolSelf._image_index_input.val();
            var index = parseInt(index_str) - 1;
            var image_id = LabellingToolSelf._image_index_to_id(index);
            _change_image(image_id);
        });
        $('<span>' + '/' + LabellingToolSelf._num_images + '</span>').appendTo(LabellingToolSelf._toolbar);


        $('<br/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._prev_image_button = $('<button>Prev image</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._prev_image_button.button({text: false, icons: {primary: "ui-icon-seek-prev"}}).click(function(event) {
            _increment_image_index(-1);
            event.preventDefault();
        });

        LabellingToolSelf._next_image_button = $('<button>Next image</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._next_image_button.button({text: false, icons: {primary: "ui-icon-seek-next"}}).click(function(event) {
            _increment_image_index(1);
            event.preventDefault();
        });

        $('<br/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._complete_checkbox = $('<input type="checkbox">Finished</input>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._complete_checkbox.change(function(event, ui) {
            var value = event.target.checked;
            LabellingToolSelf._label_header.complete = value;
            LabellingToolSelf.push_label_data();
        });




        //
        // LABEL CLASS CHOOSER AND LABEL REMOVE
        //

        $('<p style="background: #b0b0b0;">Labels</p>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._label_class_selector_menu = $('<select name="label_class_selector"/>').appendTo(LabellingToolSelf._toolbar);
        for (var i = 0; i < LabellingToolSelf.$label_classes.length; i++) {
            var cls = LabellingToolSelf.$label_classes[i];
            $('<option value="' + cls.name + '">' + cls.human_name + '</option>').appendTo(LabellingToolSelf._label_class_selector_menu);
        }
        $('<option value="__unclassified" selected="false">UNCLASSIFIED</option>').appendTo(LabellingToolSelf._label_class_selector_menu);
        LabellingToolSelf._label_class_selector_menu.change(function(event, ui) {
            var label_class_name = event.target.value;
            if (label_class_name == '__unclassified') {
                label_class_name = null;
            }
            for (var i = 0; i < LabellingToolSelf.$selected_entities.length; i++) {
                LabellingToolSelf.$selected_entities[i].set_label_class(label_class_name);
            }
        });

        $('<br/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._hide_labels_checkbox = $('<input type="checkbox">Hide labels</input>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._hide_labels_checkbox.change(function(event, ui) {
            var value = event.target.checked;
            LabellingToolSelf.hide_labels = value;

            for (var i = 0; i < LabellingToolSelf.entities.length; i++) {
                LabellingToolSelf.entities[i].notify_hide_labels_change(value);
            }
        });





        $('<p style="background: #b0b0b0;">Tools</p>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._select_button = $('<button>Select</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._select_button.button().click(function(event) {
            LabellingToolSelf.set_current_tool(SelectEntityTool(LabellingToolSelf));
            event.preventDefault();
        });

        LabellingToolSelf._draw_polygon_button = $('<button>Draw poly</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._draw_polygon_button.button().click(function(event) {
            var current = LabellingToolSelf.get_selected_entity();
            LabellingToolSelf.set_current_tool(DrawPolygonTool(LabellingToolSelf, current));
            event.preventDefault();
        });

        LabellingToolSelf._composite_button = $('<button>Composite</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._composite_button.button().click(function(event) {
            var N = LabellingToolSelf.$selected_entities.length;

            if (N > 0) {
                var model = CompositeLabelModel();
                var entity = CompositeLabelEntity(LabellingToolSelf, model);

                for (var i = 0; i < LabellingToolSelf.$selected_entities.length; i++) {
                    model.components.push(LabellingToolSelf.$selected_entities[i].model.object_id);
                }

                LabellingToolSelf.add_entity(entity, true);
                LabellingToolSelf.select_entity(entity, false);
            }

            event.preventDefault();
        });

        LabellingToolSelf._delete_label_button = $('<button>Delete</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._delete_label_button.button({text: false, icons: {primary: "ui-icon-trash"}}).click(function(event) {
            if (!LabellingToolSelf._confirm_delete_visible) {
                var cancel_button = $('<button>Cancel</button>').appendTo(LabellingToolSelf._confirm_delete);
                var confirm_button = $('<button>Confirm delete</button>').appendTo(LabellingToolSelf._confirm_delete);

                var remove_confirm_ui = function() {
                    cancel_button.remove();
                    confirm_button.remove();
                    LabellingToolSelf._confirm_delete_visible = false;
                };

                cancel_button.button().click(function(event) {
                    remove_confirm_ui();
                    event.preventDefault();
                });

                confirm_button.button().click(function(event) {
                    var entities_to_remove = LabellingToolSelf.$selected_entities.slice();

                    for (var i = 0; i < entities_to_remove.length; i++) {
                        LabellingToolSelf.remove_entity(entities_to_remove[i], true);
                    }

                    remove_confirm_ui();
                    event.preventDefault();
                });

                LabellingToolSelf._confirm_delete_visible = true;
            }

            event.preventDefault();
        });

        LabellingToolSelf._confirm_delete = $('<span/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._confirm_delete_visible = false;




        /*
         *
         * TOOL AREA
         *
         */

        // Zoom callback
        function zoomed() {
            var t = d3.event.translate, s = d3.event.scale;
            LabellingToolSelf._zoom_node.attr("transform", "translate(" + t[0] + "," + t[1] + ") scale(" + s + ")");
        }

        // Create d3.js panning and zooming behaviour
        LabellingToolSelf._zoom_behaviour = d3.behavior.zoom()
            .on("zoom", zoomed);



        // Disable context menu so we can use right-click
        LabellingToolSelf._labelling_area[0].oncontextmenu = function() {
            return false;
        };

        // Create SVG element of the appropriate dimensions
        LabellingToolSelf.$svg = d3.select(LabellingToolSelf._labelling_area[0])
                .append("svg:svg")
                .attr("width", LabellingToolSelf._labelling_area_width)
                .attr("height", LabellingToolSelf._tool_height)
                .call(LabellingToolSelf._zoom_behaviour);

        // Add the zoom transformation <g> element
        LabellingToolSelf._zoom_node = LabellingToolSelf.$svg.append('svg:g').attr('transform', 'scale(1)');

        // Create the container <g> element that will contain our scene
        var container = LabellingToolSelf._zoom_node.append('g');
        LabellingToolSelf.$container = container;

        // Add the image element to the container
        LabellingToolSelf._image = container.append("image")
                .attr("x", 0)
                .attr("y", 0);


        // Flag that indicates if the mouse pointer is within the tool area
        LabellingToolSelf._mouse_within = false;
        LabellingToolSelf._last_mouse_pos = null;


        //
        // Set up event handlers
        //

        // Click
        container.on("click", function() {
            if (d3.event.button === 0) {
                // Left click; send to tool
                var handled = false;
                if (LabellingToolSelf.$tool !== null) {
                    handled = LabellingToolSelf.$tool.on_left_click(LabellingToolSelf.get_mouse_pos(), d3.event);
                }

                if (handled) {
                    d3.event.stopPropagation();
                }
            }
        });

        // Button press
        container.on("mousedown", function() {
            if (d3.event.button === 2) {
                // Right click; on_cancel current tool
                var handled = false;
                if (LabellingToolSelf.$tool !== null) {
                    handled = LabellingToolSelf.$tool.on_cancel(LabellingToolSelf.get_mouse_pos());
                }

                if (handled) {
                    d3.event.stopPropagation();
                }
            }
        });

        // Mouse on_move
        container.on("mousemove", function() {
            var handled = false;
            LabellingToolSelf._last_mouse_pos = LabellingToolSelf.get_mouse_pos();
            if (!LabellingToolSelf._mouse_within) {
                // Entered tool area; invoke tool.on_switch_in()
                if (LabellingToolSelf.$tool !== null) {
                    handled = LabellingToolSelf.$tool.on_switch_in(LabellingToolSelf._last_mouse_pos);
                }

                if (handled) {
                    d3.event.stopPropagation();
                }

                LabellingToolSelf._mouse_within = true;
            }
            else {
                // Send mouse on_move event to tool
                if (LabellingToolSelf.$tool !== null) {
                    handled = LabellingToolSelf.$tool.on_move(LabellingToolSelf._last_mouse_pos);
                }

                if (handled) {
                    d3.event.stopPropagation();
                }
            }
        });


        var on_mouse_out = function(pos, width, height) {
            if (LabellingToolSelf._mouse_within) {
                if (pos.x < 0.0 || pos.x > width || pos.y < 0.0 || pos.y > height) {
                    // The pointer is outside the bounds of the tool, as opposed to entering another element within the bounds of the tool, e.g. a polygon
                    // invoke tool.on_switch_out()
                    var handled = false;
                    if (LabellingToolSelf.$tool !== null) {
                        handled = LabellingToolSelf.$tool.on_switch_out(pos);
                    }

                    if (handled) {
                        d3.event.stopPropagation();
                    }

                    LabellingToolSelf._mouse_within = false;
                    LabellingToolSelf._last_mouse_pos = null;
                }
            }
        };

        // Mouse leave
        LabellingToolSelf.$svg.on("mouseout", function() {
            on_mouse_out(LabellingToolSelf.get_tool_area_mouse_pos(), LabellingToolSelf._labelling_area_width, LabellingToolSelf._tool_height);
        });

        container.on("mouseout", function() {
            on_mouse_out(LabellingToolSelf.get_mouse_pos(), LabellingToolSelf._image_width, LabellingToolSelf._image_height);
        });



        // Create entities for the pre-existing labels
        _change_image(initial_image_id);
    };


    LabellingToolSelf._image_id_to_index = function(image_id) {
        var image_index = LabellingToolSelf._image_ids.indexOf(image_id);
        if (image_index === -1) {
            console.log("Image ID " + image_id + " not found");
            image_index = 0;
        }
        return image_index;
    };

    LabellingToolSelf._image_index_to_id = function(index) {
        var clampedIndex = Math.max(Math.min(index, LabellingToolSelf._image_ids.length - 1), 0);
        console.log("index=" + index + ", clampedIndex="+clampedIndex);
        return LabellingToolSelf._image_ids[clampedIndex];
    };

    LabellingToolSelf._update_image_index_input = function(image_id) {
        var image_index = LabellingToolSelf._image_id_to_index(image_id);

        LabellingToolSelf._image_index_input.val((image_index+1).toString());
    };

    LabellingToolSelf._get_current_image_id = function() {
        if (LabellingToolSelf._label_header !== null  &&  LabellingToolSelf._label_header !== undefined) {
            return LabellingToolSelf._label_header.image_id;
        }
        else {
            return null;
        }
    };

    LabellingToolSelf.setImage = function(image_data) {
        // Remove all entities
        while (LabellingToolSelf.entities.length > 0) {
            LabellingToolSelf.unregister_entity_by_index(LabellingToolSelf.entities.length-1);
        }

        // Update the image SVG element
        LabellingToolSelf._image.attr("width", image_data.width + 'px');
        LabellingToolSelf._image.attr("height", image_data.height + 'px');
        LabellingToolSelf._image.attr('xlink:href', image_data.href);
        LabellingToolSelf._image_width = image_data.width;
        LabellingToolSelf._image_height = image_data.height;

        // Update the labels
        LabellingToolSelf._label_header = image_data.label_header;
        var labels = LabellingToolSelf._label_header.labels;
        if (labels === null) {
            labels = [];
        }

        // Set up the ID counter; ensure that it's value is 1 above the maximum label ID in use
        LabellingToolSelf._label_model_obj_table = ObjectIDTable();
        LabellingToolSelf._label_model_obj_table.register_objects(labels);

        for (var i = 0; i < labels.length; i++) {
            var label = labels[i];
            var entity = new_entity_for_model(LabellingToolSelf, label);
            LabellingToolSelf.register_entity(entity);
        }

        LabellingToolSelf._complete_checkbox[0].checked = LabellingToolSelf._label_header.complete;

        LabellingToolSelf._update_image_index_input(LabellingToolSelf._label_header.image_id);


        LabellingToolSelf.set_current_tool(SelectEntityTool(LabellingToolSelf));

        console.log(LabellingToolSelf);
    };




    /*
    Entity mouse in event
     */
    LabellingToolSelf.on_entity_mouse_in = function(entity) {
        if (LabellingToolSelf.$tool !== null) {
            LabellingToolSelf.$tool.on_entity_mouse_in(entity);
        }
    };

    LabellingToolSelf.on_entity_mouse_out = function(entity) {
        if (LabellingToolSelf.$tool !== null) {
            LabellingToolSelf.$tool.on_entity_mouse_out(entity);
        }
    };



    /*
    Get colour for a given label class
     */
    LabellingToolSelf.index_for_label_class = function(label_class) {
        if (label_class != null) {
            for (var i = 0; i < LabellingToolSelf.$label_classes.length; i++) {
                var cls = LabellingToolSelf.$label_classes[i];

                if (cls.name === label_class) {
                    return i;
                }
            }
        }

        // Default
        return -1;
    };

    LabellingToolSelf.colour_for_label_class = function(label_class) {
        var index = LabellingToolSelf.index_for_label_class(label_class);
        if (index !== -1) {
            return LabellingToolSelf.$label_classes[index].colour;
        }
        else {
            // Default
            return [0, 0, 0];
        }
    };

    LabellingToolSelf._update_label_class_menu = function(label_class) {
        if (label_class === null) {
            label_class = '__unclassified';
        }

        LabellingToolSelf._label_class_selector_menu.children('option').each(function() {
            this.selected = (this.value == label_class);
        });
    };



    /*
    Set the current tool; switch the old one out and a new one in
     */
    LabellingToolSelf.set_current_tool = function(tool) {
        if (LabellingToolSelf.$tool !== null) {
            if (LabellingToolSelf._mouse_within) {
                LabellingToolSelf.$tool.on_switch_out(LabellingToolSelf._last_mouse_pos);
            }
            LabellingToolSelf.$tool.on_shutdown();
        }

        LabellingToolSelf.$tool = tool;

        if (LabellingToolSelf.$tool !== null) {
            LabellingToolSelf.$tool.on_init();
            if (LabellingToolSelf._mouse_within) {
                LabellingToolSelf.$tool.on_switch_in(LabellingToolSelf._last_mouse_pos);
            }
        }
    };


    /*
    Select an entity
     */
    LabellingToolSelf.select_entity = function(entity, multi_select) {
        multi_select = multi_select === undefined  ?  false  :  multi_select;

        if (multi_select) {
            var index = LabellingToolSelf.$selected_entities.indexOf(entity);

            if (index === -1) {
                // Add
                LabellingToolSelf.$selected_entities.push(entity);
                entity.select(true);
            }
            else {
                // Remove
                LabellingToolSelf.$selected_entities.splice(index, 1);
                entity.select(false);
            }

            if (LabellingToolSelf.$selected_entities.length === 1) {
                LabellingToolSelf._update_label_class_menu(LabellingToolSelf.$selected_entities[0].get_label_class());
            }
            else {
                LabellingToolSelf._update_label_class_menu(null);
            }
        }
        else {
            var prev_entity = LabellingToolSelf.get_selected_entity();

            if (prev_entity !== entity) {
                for (var i = 0; i < LabellingToolSelf.$selected_entities.length; i++) {
                    LabellingToolSelf.$selected_entities[i].select(false);
                }
                LabellingToolSelf.$selected_entities = [entity];
                entity.select(true);
            }

            LabellingToolSelf._update_label_class_menu(entity.get_label_class());
        }
    };


    /*
    Unselect all entities
     */
    LabellingToolSelf.unselect_all_entities = function() {
        for (var i = 0; i < LabellingToolSelf.$selected_entities.length; i++) {
            LabellingToolSelf.$selected_entities[i].select(false);
        }
        LabellingToolSelf.$selected_entities = [];
        LabellingToolSelf._update_label_class_menu(null);
    };


    /*
    Get uniquely selected entity
     */
    LabellingToolSelf.get_selected_entity = function() {
        return LabellingToolSelf.$selected_entities.length == 1  ?  LabellingToolSelf.$selected_entities[0]  :  null;
    };



    /*
    Register entity
     */
    LabellingToolSelf.register_entity = function(entity) {
        LabellingToolSelf._label_model_obj_table.register(entity.model);
        LabellingToolSelf.entities.push(entity);
        LabellingToolSelf._label_model_id_to_entity[entity.model.object_id] = entity;
        entity.attach();
    };

    /*
    Unregister entity by index
     */
    LabellingToolSelf.unregister_entity_by_index = function(index) {
        var entity = LabellingToolSelf.entities[index];

        // Notify all models of the destruction of this model
        for (var i = 0; i < LabellingToolSelf.entities.length; i++) {
            if (i !== index) {
                LabellingToolSelf.entities[i].notify_model_destroyed(entity.model);
            }
        }

        // Unregister in the ID to object table
        LabellingToolSelf._label_model_obj_table.unregister(entity.model);
        delete LabellingToolSelf._label_model_id_to_entity[entity.model.object_id];


        // Remove from selection if present
        var index_in_selection = LabellingToolSelf.$selected_entities.indexOf(entity);
        if (index_in_selection !== -1) {
            entity.select(false);
            LabellingToolSelf.$selected_entities.splice(index_in_selection, 1);
        }

        entity.detach();
        // Remove
        LabellingToolSelf.entities.splice(index, 1);
    };


    /*
    Get entity for model ID
     */
    LabellingToolSelf.get_entity_for_model_id = function(model_id) {
        return LabellingToolSelf._label_model_id_to_entity[model_id];
    };

    /*
    Get entity for model
     */
    LabellingToolSelf.get_entity_for_model = function(model) {
        return LabellingToolSelf._label_model_id_to_entity[model.object_id];
    };



    /*
    Add entity:
    register the entity and add its label to the tool data model
     */
    LabellingToolSelf.add_entity = function(entity, commit) {
        LabellingToolSelf.register_entity(entity);

        var labels = LabellingToolSelf._label_header.labels;
        labels = labels.concat([entity.model]);
        LabellingToolSelf._label_header = replace_label_header_labels(LabellingToolSelf._label_header, labels);

        if (commit) {
            LabellingToolSelf.push_label_data();
        }
    };

    /*
    Remove entity
    unregister the entity and remove its label from the tool data model
     */
    LabellingToolSelf.remove_entity = function(entity, commit) {
        // Find the entity's index in the array
        var index = LabellingToolSelf.entities.indexOf(entity);

        if (index !== -1) {
            // Unregister the entity
            LabellingToolSelf.unregister_entity_by_index(index);

            // Get the label model
            var labels = LabellingToolSelf._label_header.labels;

            // Remove the model from the label model array
            labels = labels.slice(0, index).concat(labels.slice(index+1));
            // Replace the labels in the label header
            LabellingToolSelf._label_header = replace_label_header_labels(LabellingToolSelf._label_header, labels);

            if (commit) {
                // Commit changes
                LabellingToolSelf.push_label_data();
            }
        }
    };

    /*
    Commit model
    invoke when a model is modified
    inserts the model into the tool data model and ensures that the relevant change events get send over
     */
    LabellingToolSelf.commit_model = function(model) {
        var labels = LabellingToolSelf._label_header.labels;
        var index = labels.indexOf(model);

        if (index !== -1) {
            LabellingToolSelf.push_label_data();
        }
    };

    LabellingToolSelf.push_label_data = function() {
        LabellingToolSelf._sendLabelHeaderFn(LabellingToolSelf._label_header);
    };

    // Function for getting the current mouse position
    LabellingToolSelf.get_mouse_pos = function() {
        var pos = d3.mouse(LabellingToolSelf.$container[0][0]);
        return {x: pos[0], y: pos[1]};
    };

    LabellingToolSelf.get_tool_area_mouse_pos = function() {
        var pos = d3.mouse(LabellingToolSelf.$svg[0][0]);
        return {x: pos[0], y: pos[1]};
    };


    return LabellingToolSelf;
}