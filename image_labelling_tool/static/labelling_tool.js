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
            return Point(0, 0);
        }
        else {
            for (var i = 0; i < N; i++) {
                var vtx = vertices[i];
                sum[0] += vtx.x;
                sum[1] += vtx.y;
            }
            var scale = 1.0 / N;
            return Point(sum[0] * scale, sum[1] * scale);
        }
    };




    /*
    Axis-aligned box
     */
    var AABox = function(lower, upper) {
        var self = {
            lower: lower,
            upper: upper
        };

        self.contains_point = function(point) {
            return point.x >= self.lower.x && point.x <= self.upper.x &&
                   point.y >= self.lower.y && point.y <= self.upper.y;
        };

        return self;
    };

    var AABox_from_points = function(array_of_points) {
        if (array_of_points.length > 0) {
            var first = array_of_points[0];
            var lower = {x: first.x, y: first.y};
            var upper = {x: first.x, y: first.y};
            for (var i = 1; i < array_of_points.length; i++) {
                var p = array_of_points[i];
                lower.x = Math.min(lower.x, p.x);
                lower.y = Math.min(lower.y, p.y);
                upper.x = Math.max(upper.x, p.x);
                upper.y = Math.max(upper.y, p.y);
            }
            return AABox(lower, upper);
        }
        else {
            return AABox({x: 0, y: 0}, {x: 0, y: 0});
        }
    };

    var AABox_from_aaboxes = function(array_of_boxes) {
        if (array_of_boxes.length > 0) {
            var first = array_of_boxes[0];
            var result = AABox({x: first.lower.x, y: first.lower.y},
                               {x: first.upper.x, y: first.upper.y});
            for (var i = 1; i < array_of_boxes.length; i++) {
                var box = array_of_boxes[i];
                result.lower.x = Math.min(result.lower.x, box.lower.x);
                result.lower.y = Math.min(result.lower.y, box.lower.y);
                result.upper.x = Math.max(result.upper.x, box.upper.x);
                result.upper.y = Math.max(result.upper.y, box.upper.y);
            }
            return result;
        }
        else {
            return AABox({x: 1, y: 1}, {x: -1, y: -1});
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

    var get_label_header_labels = function(label_header) {
        var labels = label_header.labels;
        if (labels === undefined || labels === null) {
            return [];
        }
        else {
            return labels;
        }
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

    vertices: list of pairs, each pair is [x, y]
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
    Group label model
     */
    var GroupLabelModel = function() {
        var self = AbstractLabelModel();
        self.label_type = 'group';
        self.component_models = [];

        return self;
    };




    var LabelEntityEventListener = function() {
        return {
            on_mouse_in: function(entity) {
            },
            on_mouse_out: function(entity) {
            }
        };
    };



    /*
    Abstract label entity
     */
    var AbstractLabelEntity = function(view, model) {
        var self = {
            model: model,
            _view: view,
            _hover: false,
            _selected: false,
            _event_listeners: [],
            parent_entity: null
        };

        self.add_event_listener = function(listener) {
            self._event_listeners.push(listener);
        };

        self.remove_event_listener = function(listener) {
            var i = self._event_listeners.indexOf(listener);
            if (i !== -1) {
                self._event_listeners.splice(i, 1);
            }
        };

        self.set_parent = function(parent) {
            var was_root = self.parent_entity === null;
            self.parent_entity = parent;
            var is_root = self.parent_entity === null;
            if (was_root && !is_root) {
                self._view._unregister_root_entity(self);
            }
            else if (!was_root && is_root) {
                self._view._register_root_entity(self);
            }
        };

        self.attach = function() {
            self._view._register_entity(self);
        };

        self.detach = function() {
            if (self.parent_entity === null) {
                self._view._unregister_root_entity(self)
            }
            self._view._unregister_entity(self);
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

        self.compute_bounding_box = function() {
            return null;
        };

        self.distance_to_point = function(point) {
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

        self._polyk_poly = [];

        var super_attach = self.attach;
        self.attach = function() {
            self.shape_line = d3.svg.line()
                .x(function (d) { return d.x; })
                .y(function (d) { return d.y; })
                .interpolate("linear-closed");

            self.poly = self._view.$world.append("path");
            self.poly.data(self.model.vertices).attr("d", self.shape_line(self.model.vertices));

            self.poly.on("mouseover", function() {
                for (var i = 0; i < self._event_listeners.length; i++) {
                    self._event_listeners[i].on_mouse_in(self);
                }
            });

            self.poly.on("mouseout", function() {
                for (var i = 0; i < self._event_listeners.length; i++) {
                    self._event_listeners[i].on_mouse_out(self);
                }
            });

            self._update_polyk_poly();
            self._update_style();

            super_attach();
        };

        var super_detach = self.detach;
        self.detach = function() {
            self.poly.remove();
            self._polyk_poly = [];
            super_detach();
        };

        self._update_polyk_poly = function() {
            self._polyk_poly = [];
            for (var i = 0; i < self.model.vertices.length; i++) {
                self._polyk_poly.push(self.model.vertices[i].x);
                self._polyk_poly.push(self.model.vertices[i].y);
            }
        };

        self.update = function() {
            self.poly.data(self.model.vertices).attr("d", self.shape_line(self.model.vertices));
            self._update_polyk_poly();
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

        self.compute_bounding_box = function() {
            return AABox_from_points(self.model.vertices);
        };

        self.distance_to_point = function(point) {
            if (PolyK.ContainsPoint(self._polyk_poly, point.x, point.y)) {
                return 0.0;
            }
            else {
                var e = PolyK.ClosestEdge(self._polyk_poly, point.x, point.y);
                return e.dist;
            }
        };


        self.poly = null;

        return self;
    };


    /*
    Composite label entity
     */
    var CompositeLabelEntity = function(view, composite_label_model) {
        var self = AbstractLabelEntity(view, composite_label_model);

        var super_attach = self.attach;
        self.attach = function() {
            self.circle = self._view.$world.append("circle")
                .attr('r', 8.0);

            self.central_circle = self._view.$world.append("circle")
                .attr('r', 4.0);

            self.shape_line = d3.svg.line()
                .x(function (d) { return d.x; })
                .y(function (d) { return d.y; })
                .interpolate("linear-closed");

            self.connections_group = null;

            self.update();

            //self.circle.on("mouseover", function() {
            //    self._on_mouse_over_event();
            //}).on("mouseout", function() {
            //    self._on_mouse_out_event();
            //});

            self.central_circle.on("mouseover", function() {
                self._on_mouse_over_event();
            }).on("mouseout", function() {
                self._on_mouse_out_event();
            });


            self._update_style();
            super_attach();
        };

        var super_detach = self.detach;
        self.detach = function() {
            self.circle.remove();
            self.central_circle.remove();
            self.connections_group.remove();
            self.connections_group = null;
            super_detach();
        };


        self._on_mouse_over_event = function() {
            for (var i = 0; i < self._event_listeners.length; i++) {
                self._event_listeners[i].on_mouse_in(self);
            }
            self._view.on_entity_mouse_in(self);
        };

        self._on_mouse_out_event = function() {
            for (var i = 0; i < self._event_listeners.length; i++) {
                self._event_listeners[i].on_mouse_out(self);
            }
            self._view.on_entity_mouse_out(self);
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

            self.connections_group = self._view.$world.append("g");
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

        self.compute_bounding_box = function() {
            var centre = self.compute_centroid();
            return AABox({x: centre.x - 1, y: centre.y - 1}, {x: centre.x + 1, y: centre.y + 1});
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
    Group label entity
     */
    var GroupLabelEntity = function(view, composite_label_model) {
        var self = AbstractLabelEntity(view, composite_label_model);

        self._component_entities = [];
        self._bounding_rect = null;
        self._bounding_aabox = null;

        var super_attach = self.attach;
        self.attach = function() {
            self._bounding_rect = self._view.$world.append("rect")
                .attr("x", 0).attr("y", 0)
                .attr("width", 0).attr("height", 0)
                .attr("visibility", "hidden");

            self.update();

            self._update_style();
            super_attach();
        };

        var super_detach = self.detach;
        self.detach = function() {
            self.bounding_box.remove();
            super_detach();
        };

        self.update = function() {
            for (var i = 0; i < self._component_entities.length; i++) {
                self._component_entities[i].set_parent(null);
                self._component_entities[i].remove_event_listener(self._component_event_listener);
            }

            self._component_entities = [];
            var component_bboxes = [];
            for (var i = 0; i < self.model.component_models.length; i++) {
                var model = self.model.component_models[i];
                var model_entity = self._view.get_or_create_entity_for_model(model);
                self._component_entities.push(model_entity);
                component_bboxes.push(model_entity.compute_bounding_box());
                model_entity.add_event_listener(self._component_event_listener);
                model_entity.set_parent(self);
            }
            self._bounding_aabox = AABox_from_aaboxes(component_bboxes);

            self._bounding_rect
                .attr('x', self._bounding_aabox.lower.x)
                .attr('y', self._bounding_aabox.lower.y)
                .attr('width', self._bounding_aabox.lower.x - self._bounding_aabox.lower.x)
                .attr('height', self._bounding_aabox.lower.y - self._bounding_aabox.lower.y);
        };

        self.commit = function() {
            self._view.commit_model(self.model);
        };


        self._component_event_listener = LabelEntityEventListener();
        self._component_event_listener.on_mouse_in = function(entity) {
            for (var i = 0; i < self._event_listeners.length; i++) {
                self._event_listeners[i].on_mouse_in(self);
            }
        };
        self._component_event_listener.on_mouse_out = function(entity) {
            for (var i = 0; i < self._event_listeners.length; i++) {
                self._event_listeners[i].on_mouse_out(self);
            }
        };


        self._update_style = function() {
            if (self._selected) {
                if (self._hover) {
                    self._bounding_rect.attr("style", "stroke:rgba(255,255,0,0.75); fill:rgba(255,128,0,0.1);")
                        .attr("visibility", "visible");
                }
                else {
                    self._bounding_rect.attr("style", "stroke:rgba(255,255,0,0.5); fill:none;")
                        .attr("visibility", "visible");
                }
            }
            else {
                if (self._hover) {
                    self._bounding_rect.attr("style", "stroke:rgba(255,255,0,0.2); fill:none;")
                        .attr("visibility", "visible");
                }
                else {
                    self._bounding_rect.attr("visibility", "hidden");
                }
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

        self.compute_bounding_box = function() {
            var centre = self.compute_centroid();
            return AABox({x: centre.x - 1, y: centre.y - 1}, {x: centre.x + 1, y: centre.y + 1});
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
        'composite': CompositeLabelEntity,
        'group': GroupLabelEntity
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

        self.on_button_down = function(pos, event) {
        };

        self.on_button_up = function(pos, event) {
        };

        self.on_move = function(pos) {
        };

        self.on_drag = function(pos) {
        };

        self.on_wheel = function(pos, wheelDeltaX, wheelDeltaY) {
        };

        self.on_key_down = function(event) {
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

        self._highlighted_entities = [];

        self.on_init = function() {
            self._highlighted_entities = [];
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
            self._highlighted_entities.push(entity);
            var cur = self._get_current_entity();
            self._entity_stack_modified(prev, cur);
        };


        self.on_entity_mouse_out = function(entity) {
            var index = self._highlighted_entities.indexOf(entity);

            if (index !== -1) {
                var prev = self._get_current_entity();
                self._highlighted_entities.splice(index, 1);
                var cur = self._get_current_entity();
                self._entity_stack_modified(prev, cur);
            }
        };

        self.on_left_click = function(pos, event) {
            var entity = self._get_current_entity();
            if (entity !== null) {
                self._view.select_entity(entity, event.shiftKey, true);
            }
            else {
                if (!event.shiftKey) {
                    self._view.unselect_all_entities();
                }
            }
        };

        self._get_current_entity = function() {
            return self._highlighted_entities.length !== 0  ?  self._highlighted_entities[self._highlighted_entities.length-1]  :  null;
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
    Brush select entity tool
     */
    var BrushSelectEntityTool = function(view) {
        var self = AbstractTool(view);

        self._highlighted_entities = [];
        self._brush_radius = 10.0;
        self._brush_circle = null;

        self.on_init = function() {
            self._highlighted_entities = [];
            self._brush_circle = self._view.$world.append("circle");
            self._brush_circle.attr("r", self._brush_radius);
            self._brush_circle.attr("visibility", "hidden");
            self._brush_circle.style("fill", "rgba(128,0,0,0.05)");
            self._brush_circle.style("stroke-width", "1.0");
            self._brush_circle.style("stroke", "red");
        };

        self.on_shutdown = function() {
            self._brush_circle.remove();
        };


        self._get_entities_in_range = function(point) {
            var in_range = [];
            var entities = self._view.get_entities();
            for (var i = 0; i < entities.length; i++) {
                var entity = entities[i];
                var dist = entity.distance_to_point(point);
                if (dist !== null) {
                    if (dist <= self._brush_radius) {
                        in_range.push(entity);
                    }
                }
            }
            return in_range;
        };

        self._highlight_entities = function(entities) {
            // Remove any hover
            for (var i = 0; i < self._highlighted_entities.length; i++) {
                self._highlighted_entities[i].hover(false);
            }

            self._highlighted_entities = entities;

            // Add hover
            for (var i = 0; i < self._highlighted_entities.length; i++) {
                self._highlighted_entities[i].hover(true);
            }
        };


        self.on_button_down = function(pos, event) {
            self._highlight_entities([]);
            var entities = self._get_entities_in_range(pos);
            for (var i = 0; i < entities.length; i++) {
                self._view.select_entity(entities[i], event.shiftKey || i > 0, false);
            }
            return true;
        };

        self.on_button_up = function(pos, event) {
            self._highlight_entities(self._get_entities_in_range(pos));
            return true;
        };

        self.on_move = function(pos, event) {
            self._highlight_entities(self._get_entities_in_range(pos));
            self._brush_circle.attr("cx", pos.x);
            self._brush_circle.attr("cy", pos.y);
            return true;
        };

        self.on_drag = function(pos, event) {
            var entities = self._get_entities_in_range(pos);
            for (var i = 0; i < entities.length; i++) {
                self._view.select_entity(entities[i], true, false);
            }
            self._brush_circle.attr("cx", pos.x);
            self._brush_circle.attr("cy", pos.y);
            return true;
        };

        self.on_wheel = function(pos, wheelDeltaX, wheelDeltaY) {
            self._brush_radius += wheelDeltaY * 0.1;
            self._brush_radius = Math.max(self._brush_radius, 1.0);
            self._brush_circle.attr("r", self._brush_radius);
            return true;
        };

        self.on_key_down = function(event) {
            var changed = false;
            if (event.keyCode == 219) {
                self._brush_radius -= 2.0;
                changed = true;
            }
            else if (event.keyCode == 221) {
                self._brush_radius += 2.0;
                changed = true;
            }
            if (changed) {
                self._brush_radius = Math.max(self._brush_radius, 1.0);
                self._brush_circle.attr("r", self._brush_radius);
                return true;
            }
        };

        self.on_switch_in = function(pos) {
            self._highlight_entities(self._get_entities_in_range(pos));
            self._brush_circle.attr("visibility", "visible");
        };

        self.on_switch_out = function(pos) {
            self._highlight_entities([]);
            self._brush_circle.attr("visibility", "hidden");
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
            self._view.add_root_entity(entity, false);
            self._view.select_entity(entity, false, false);
        };

        self.destroy_entity = function() {
            self._view.remove_root_entity(self.entity, false);
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


    var ensure_flag_exists = function(x, flag_name, default_value) {
        var v = x[flag_name];
        if (v === undefined) {
            x[flag_name] = default_value;
        }
        return x[flag_name];
    };


    LabellingToolSelf.initialise = function(element, label_classes, tool_width, tool_height,
                                            image_ids, initial_image_id, requestImageCallback, sendLabelHeaderFn, config) {
        config = config || {};
        LabellingToolSelf._config = config;

        config.tools = config.tools || {};
        ensure_flag_exists(config.tools, 'imageSelector', true);
        ensure_flag_exists(config.tools, 'labelClassSelector', true);
        ensure_flag_exists(config.tools, 'brushSelect', true);
        ensure_flag_exists(config.tools, 'drawPolyLabel', true);
        ensure_flag_exists(config.tools, 'compositeLabel', true);
        ensure_flag_exists(config.tools, 'deleteLabel', true);


        // Model
        LabellingToolSelf._label_header = {};
        // Entity list
        LabellingToolSelf.root_entities = [];
        LabellingToolSelf._all_entities = [];
        // Active tool
        LabellingToolSelf.$tool = null;
        // Selected entity
        LabellingToolSelf.$selected_entities = [];
        // Classes
        LabellingToolSelf.$label_classes = label_classes;
        // Hide labels
        LabellingToolSelf.hide_labels = false;
        // Button state
        LabellingToolSelf._button_down = false;
        LabellingToolSelf._capture_move_events = false;

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
        // Send data interval for storing interval ID for queued label send
        LabellingToolSelf._pushDataTimeout = null;



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
        // IMAGE SELECTOR
        //

        $('<p style="background: #b0b0b0;">Current image</p>').appendTo(LabellingToolSelf._toolbar);

        if (config.tools.imageSelector) {
            var _change_image = function (image_id) {
                LabellingToolSelf._requestImageCallback(image_id);
            };

            var _increment_image_index = function (offset) {
                var image_id = LabellingToolSelf._get_current_image_id();
                var index = LabellingToolSelf._image_id_to_index(image_id) + offset;
                _change_image(LabellingToolSelf._image_index_to_id(index));
            };

            LabellingToolSelf._image_index_input = $('<input type="text" style="width: 30px; vertical-align: middle;" name="image_index"/>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._image_index_input.on('change', function () {
                var index_str = LabellingToolSelf._image_index_input.val();
                var index = parseInt(index_str) - 1;
                var image_id = LabellingToolSelf._image_index_to_id(index);
                _change_image(image_id);
            });
            $('<span>' + '/' + LabellingToolSelf._num_images + '</span>').appendTo(LabellingToolSelf._toolbar);


            $('<br/>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._prev_image_button = $('<button>Prev image</button>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._prev_image_button.button({
                text: false,
                icons: {primary: "ui-icon-seek-prev"}
            }).click(function (event) {
                _increment_image_index(-1);
                event.preventDefault();
            });

            LabellingToolSelf._next_image_button = $('<button>Next image</button>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._next_image_button.button({
                text: false,
                icons: {primary: "ui-icon-seek-next"}
            }).click(function (event) {
                _increment_image_index(1);
                event.preventDefault();
            });
        }

        $('<br/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._complete_checkbox = $('<input type="checkbox">Finished</input>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._complete_checkbox.change(function(event, ui) {
            var value = event.target.checked;
            LabellingToolSelf._label_header.complete = value;
            LabellingToolSelf.queue_push_label_data();
        });




        //
        // LABEL CLASS SELECTOR AND HIDE LABELS
        //

        $('<p style="background: #b0b0b0;">Labels</p>').appendTo(LabellingToolSelf._toolbar);

        if (config.tools.labelClassSelector) {
            LabellingToolSelf._label_class_selector_menu = $('<select name="label_class_selector"/>').appendTo(LabellingToolSelf._toolbar);
            for (var i = 0; i < LabellingToolSelf.$label_classes.length; i++) {
                var cls = LabellingToolSelf.$label_classes[i];
                $('<option value="' + cls.name + '">' + cls.human_name + '</option>').appendTo(LabellingToolSelf._label_class_selector_menu);
            }
            $('<option value="__unclassified" selected="false">UNCLASSIFIED</option>').appendTo(LabellingToolSelf._label_class_selector_menu);
            LabellingToolSelf._label_class_selector_menu.change(function (event, ui) {
                var label_class_name = event.target.value;
                if (label_class_name == '__unclassified') {
                    label_class_name = null;
                }
                for (var i = 0; i < LabellingToolSelf.$selected_entities.length; i++) {
                    LabellingToolSelf.$selected_entities[i].set_label_class(label_class_name);
                }
            });
        }

        $('<br/>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._hide_labels_checkbox = $('<input type="checkbox">Hide labels</input>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._hide_labels_checkbox.change(function(event, ui) {
            var value = event.target.checked;
            LabellingToolSelf.hide_labels = value;

            for (var i = 0; i < LabellingToolSelf._all_entities.length; i++) {
                LabellingToolSelf._all_entities[i].notify_hide_labels_change(value);
            }
        });





        //
        // SELECT, DRAW POLY, COMPOSITE, DELETE
        //

        $('<p style="background: #b0b0b0;">Tools</p>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._select_button = $('<button>Select</button>').appendTo(LabellingToolSelf._toolbar);
        LabellingToolSelf._select_button.button().click(function(event) {
            LabellingToolSelf.set_current_tool(SelectEntityTool(LabellingToolSelf));
            event.preventDefault();
        });

        if (config.tools.brushSelect) {
            LabellingToolSelf._brush_select_button = $('<button>Brush select</button>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._brush_select_button.button().click(function (event) {
                LabellingToolSelf.set_current_tool(BrushSelectEntityTool(LabellingToolSelf));
                event.preventDefault();
            });
        }

        if (config.tools.drawPolyLabel) {
            LabellingToolSelf._draw_polygon_button = $('<button>Draw poly</button>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._draw_polygon_button.button().click(function (event) {
                var current = LabellingToolSelf.get_selected_entity();
                LabellingToolSelf.set_current_tool(DrawPolygonTool(LabellingToolSelf, current));
                event.preventDefault();
            });
        }

        if (config.tools.compositeLabel) {
            LabellingToolSelf._composite_button = $('<button>Composite</button>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._composite_button.button().click(function (event) {
                var N = LabellingToolSelf.$selected_entities.length;

                if (N > 0) {
                    var model = CompositeLabelModel();
                    var entity = CompositeLabelEntity(LabellingToolSelf, model);

                    for (var i = 0; i < LabellingToolSelf.$selected_entities.length; i++) {
                        model.components.push(LabellingToolSelf.$selected_entities[i].model.object_id);
                    }

                    LabellingToolSelf.add_root_entity(entity, true);
                    LabellingToolSelf.select_entity(entity, false, false);
                }

                event.preventDefault();
            });
        }

        if (config.tools.deleteLabel) {
            LabellingToolSelf._delete_label_button = $('<button>Delete</button>').appendTo(LabellingToolSelf._toolbar);
            LabellingToolSelf._delete_label_button.button({
                text: false,
                icons: {primary: "ui-icon-trash"}
            }).click(function (event) {
                if (!LabellingToolSelf._confirm_delete_visible) {
                    var cancel_button = $('<button>Cancel</button>').appendTo(LabellingToolSelf._confirm_delete);
                    var confirm_button = $('<button>Confirm delete</button>').appendTo(LabellingToolSelf._confirm_delete);

                    var remove_confirm_ui = function () {
                        cancel_button.remove();
                        confirm_button.remove();
                        LabellingToolSelf._confirm_delete_visible = false;
                    };

                    cancel_button.button().click(function (event) {
                        remove_confirm_ui();
                        event.preventDefault();
                    });

                    confirm_button.button().click(function (event) {
                        var entities_to_remove = LabellingToolSelf.$selected_entities.slice();

                        for (var i = 0; i < entities_to_remove.length; i++) {
                            LabellingToolSelf.remove_root_entity(entities_to_remove[i], true);
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
        }




        /*
         *
         * LABELLING AREA
         *
         */

        // Zoom callback
        function zoomed() {
            var t = d3.event.translate, s = d3.event.scale;
            LabellingToolSelf._zoom_xlat = t;
            LabellingToolSelf._zoom_scale = s;
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
        var svg = LabellingToolSelf.$svg;

        // Add the zoom transformation <g> element
        LabellingToolSelf._zoom_node = LabellingToolSelf.$svg.append('svg:g').attr('transform', 'scale(1)');
        LabellingToolSelf._zoom_scale = 1.0;
        LabellingToolSelf._zoom_xlat = [0.0, 0.0];

        // Create the container <g> element that will contain our scene
        LabellingToolSelf.$world = LabellingToolSelf._zoom_node.append('g');

        // Add the image element to the container
        LabellingToolSelf._image = LabellingToolSelf.$world.append("image")
                .attr("x", 0)
                .attr("y", 0);


        // Flag that indicates if the mouse pointer is within the tool area
        LabellingToolSelf._mouse_within = false;
        LabellingToolSelf._last_mouse_pos = null;


        //
        // Set up event handlers
        //

        // Click
        LabellingToolSelf.$world.on("click", function() {
            if (d3.event.button === 0) {
                // Left click; send to tool
                if (!d3.event.altKey) {
                    if (LabellingToolSelf.$tool !== null) {
                        LabellingToolSelf.$tool.on_left_click(LabellingToolSelf.get_mouse_pos_world_space(), d3.event);
                    }
                    d3.event.stopPropagation();
                }

            }
        });

        // Button press
        LabellingToolSelf.$world.on("mousedown", function() {
            if (d3.event.button === 0) {
                // Left button down
                if (!d3.event.altKey) {
                    LabellingToolSelf._button_down = true;
                    if (LabellingToolSelf.$tool !== null) {
                        LabellingToolSelf.$tool.on_button_down(LabellingToolSelf.get_mouse_pos_world_space(), d3.event);
                    }
                    d3.event.stopPropagation();
                }
            }
            else if (d3.event.button === 2) {
                // Right click; on_cancel current tool
                if (LabellingToolSelf.$tool !== null) {
                    var handled = LabellingToolSelf.$tool.on_cancel(LabellingToolSelf.get_mouse_pos_world_space());
                    if (handled) {
                        d3.event.stopPropagation();
                    }
                }
            }
        });

        // Button press
        LabellingToolSelf.$world.on("mouseup", function() {
            if (d3.event.button === 0) {
                // Left buton up
                if (!d3.event.altKey) {
                    LabellingToolSelf._button_down = false;
                    if (LabellingToolSelf.$tool !== null) {
                        LabellingToolSelf.$tool.on_button_up(LabellingToolSelf.get_mouse_pos_world_space(), d3.event);
                    }
                    d3.event.stopPropagation();
                }
            }
        });

        // Mouse on_move
        LabellingToolSelf.$world.on("mousemove", function() {
            LabellingToolSelf._last_mouse_pos = LabellingToolSelf.get_mouse_pos_world_space();
            if (LabellingToolSelf._button_down) {
                if (LabellingToolSelf.$tool !== null) {
                    LabellingToolSelf.$tool.on_drag(LabellingToolSelf._last_mouse_pos);
                }
                d3.event.stopPropagation();
            }
            else {
                var handled = false;
                if (!LabellingToolSelf._mouse_within) {
                    LabellingToolSelf._init_key_handlers();

                    // Entered tool area; invoke tool.on_switch_in()
                    if (LabellingToolSelf.$tool !== null) {
                        handled = LabellingToolSelf.$tool.on_switch_in(LabellingToolSelf._last_mouse_pos);
                    }

                    LabellingToolSelf._mouse_within = true;
                }
                else {
                    // Send mouse on_move event to tool
                    if (LabellingToolSelf.$tool !== null) {
                        handled = LabellingToolSelf.$tool.on_move(LabellingToolSelf._last_mouse_pos);
                    }
                }
                if (handled) {
                    d3.event.stopPropagation();
                }
            }
        });

        // Mouse wheel
        LabellingToolSelf.$world.on("mousewheel", function() {
            var handled = false;
            LabellingToolSelf._last_mouse_pos = LabellingToolSelf.get_mouse_pos_world_space();
            if (d3.event.ctrlKey || d3.event.shiftKey || d3.event.altKey) {
                if (LabellingToolSelf.$tool !== null) {
                    handled = LabellingToolSelf.$tool.on_wheel(LabellingToolSelf._last_mouse_pos,
                                                               d3.event.wheelDeltaX, d3.event.wheelDeltaY);
                }
            }
            if (handled) {
                d3.event.stopPropagation();
            }
        });


        var on_mouse_out = function(pos, width, height) {
            if (LabellingToolSelf._mouse_within) {
                if (pos.x < 0.0 || pos.x > width || pos.y < 0.0 || pos.y > height) {
                    // The pointer is outside the bounds of the tool, as opposed to entering another element within the bounds of the tool, e.g. a polygon
                    // invoke tool.on_switch_out()
                    var handled = false;
                    if (LabellingToolSelf.$tool !== null) {
                        handled = LabellingToolSelf.$tool.on_switch_out(LabellingToolSelf.get_mouse_pos_world_space());
                    }

                    if (handled) {
                        d3.event.stopPropagation();
                    }

                    LabellingToolSelf._mouse_within = false;
                    LabellingToolSelf._last_mouse_pos = null;
                    LabellingToolSelf._shutdown_key_handlers();
                }
            }
        };

        // Mouse leave
        LabellingToolSelf.$svg.on("mouseout", function() {
            on_mouse_out(LabellingToolSelf.get_mouse_pos_screen_space(), LabellingToolSelf._labelling_area_width, LabellingToolSelf._tool_height);
        });


        // Global key handler
        if (!__labelling_tool_key_handler.connected) {
            d3.select("body").on("keydown", function () {
                if (__labelling_tool_key_handler.handler !== null) {
                    var handled = __labelling_tool_key_handler.handler(d3.event);
                    if (handled) {
                        d3.event.stopPropagation();
                    }
                }
            });
            __labelling_tool_key_handler.connected = true;
        }


        // Create entities for the pre-existing labels
        LabellingToolSelf._requestImageCallback(initial_image_id)
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
        while (LabellingToolSelf.root_entities.length > 0) {
            LabellingToolSelf.shutdown_entity(LabellingToolSelf.root_entities[LabellingToolSelf.root_entities.length-1]);
        }

        // Update the image SVG element
        LabellingToolSelf._image.attr("width", image_data.width + 'px');
        LabellingToolSelf._image.attr("height", image_data.height + 'px');
        LabellingToolSelf._image.attr('xlink:href', image_data.href);
        LabellingToolSelf._image_width = image_data.width;
        LabellingToolSelf._image_height = image_data.height;

        // Update the labels
        LabellingToolSelf._label_header = image_data.label_header;
        var labels = get_label_header_labels(LabellingToolSelf._label_header);

        // Set up the ID counter; ensure that it's value is 1 above the maximum label ID in use
        LabellingToolSelf._label_model_obj_table = ObjectIDTable();
        LabellingToolSelf._label_model_obj_table.register_objects(labels);

        for (var i = 0; i < labels.length; i++) {
            var label = labels[i];
            var entity = new_entity_for_model(LabellingToolSelf, label);
            LabellingToolSelf.initialise_entity(entity);
            LabellingToolSelf._register_root_entity(entity);
        }

        LabellingToolSelf._complete_checkbox[0].checked = LabellingToolSelf._label_header.complete;

        LabellingToolSelf._update_image_index_input(LabellingToolSelf._label_header.image_id);


        LabellingToolSelf.set_current_tool(SelectEntityTool(LabellingToolSelf));

        console.log(LabellingToolSelf);
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
    LabellingToolSelf.select_entity = function(entity, multi_select, invert) {
        multi_select = multi_select === undefined  ?  false  :  multi_select;

        if (multi_select) {
            var index = LabellingToolSelf.$selected_entities.indexOf(entity);
            var changed = false;

            if (invert) {
                if (index === -1) {
                    // Add
                    LabellingToolSelf.$selected_entities.push(entity);
                    entity.select(true);
                    changed = true;
                }
                else {
                    // Remove
                    LabellingToolSelf.$selected_entities.splice(index, 1);
                    entity.select(false);
                    changed = true;
                }
            }
            else {
                if (index === -1) {
                    // Add
                    LabellingToolSelf.$selected_entities.push(entity);
                    entity.select(true);
                    changed = true;
                }
            }

            if (changed) {
                if (LabellingToolSelf.$selected_entities.length === 1) {
                    LabellingToolSelf._update_label_class_menu(LabellingToolSelf.$selected_entities[0].get_label_class());
                }
                else {
                    LabellingToolSelf._update_label_class_menu(null);
                }
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
    Get all entities
     */
    LabellingToolSelf.get_entities = function() {
        return LabellingToolSelf.root_entities;
    };



    /*
    Entity event listener
     */
    LabellingToolSelf._entity_event_listener = LabelEntityEventListener();
    LabellingToolSelf._entity_event_listener.on_mouse_in = function(entity) {
        if (LabellingToolSelf.$tool !== null) {
            LabellingToolSelf.$tool.on_entity_mouse_in(entity);
        }
    };

    LabellingToolSelf._entity_event_listener.on_mouse_out = function(entity) {
        if (LabellingToolSelf.$tool !== null) {
            LabellingToolSelf.$tool.on_entity_mouse_out(entity);
        }
    };


    /*
    Register and unregister entities
     */
    LabellingToolSelf._register_entity = function(entity) {
        LabellingToolSelf._all_entities.push(entity);
        LabellingToolSelf._label_model_obj_table.register(entity.model);
        LabellingToolSelf._label_model_id_to_entity[entity.model.object_id] = entity;
    };

    LabellingToolSelf._unregister_entity = function(entity) {
        var index = LabellingToolSelf._all_entities.indexOf(entity);

        if (index === -1) {
            throw "Attempting to unregister entity that is not in _all_entities";
        }

        // Notify all entities of the destruction of this model
        for (var i = 0; i < LabellingToolSelf._all_entities.length; i++) {
            if (i !== index) {
                LabellingToolSelf._all_entities[i].notify_model_destroyed(entity.model);
            }
        }

        // Unregister in the ID to object table
        LabellingToolSelf._label_model_obj_table.unregister(entity.model);
        delete LabellingToolSelf._label_model_id_to_entity[entity.model.object_id];

        // Remove
        LabellingToolSelf._all_entities.splice(index, 1);
    };

    /*
    Register and unregister root entities
     */
    LabellingToolSelf._register_root_entity = function(entity) {
        LabellingToolSelf.root_entities.push(entity);
        entity.add_event_listener(LabellingToolSelf._entity_event_listener);
    };

    LabellingToolSelf._unregister_root_entity = function(entity) {
        // Remove from list of root entities
        var index_in_roots = LabellingToolSelf.root_entities.indexOf(entity);

        if (index_in_roots === -1) {
            throw "Attempting to unregister root entity that is not in root_entities";
        }

        LabellingToolSelf.root_entities.splice(index_in_roots, 1);

        // Remove from selection if present
        var index_in_selection = LabellingToolSelf.$selected_entities.indexOf(entity);
        if (index_in_selection !== -1) {
            entity.select(false);
            LabellingToolSelf.$selected_entities.splice(index_in_selection, 1);
        }

        entity.remove_event_listener(LabellingToolSelf._entity_event_listener);
    };


    /*
    Initialise and shutdown entities
     */
    LabellingToolSelf.initialise_entity = function(entity) {
        entity.attach();
    };

    LabellingToolSelf.shutdown_entity = function(entity) {
        entity.detach();
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
    Get or create entity for model
     */
    LabellingToolSelf.get_or_create_entity_for_model = function(model) {
        var model_id = model.object_id;
        if (model_id === undefined || model_id === null ||
            !LabellingToolSelf._label_model_id_to_entity.hasOwnProperty(model_id)) {
            var entity = new_entity_for_model(LabellingToolSelf, model);
            LabellingToolSelf.initialise_entity(entity);
        }
        else {
            return LabellingToolSelf._label_model_id_to_entity[model.object_id];
        }
    };



    /*
    Add entity:
    register the entity and add its label to the tool data model
     */
    LabellingToolSelf.add_root_entity = function(entity, commit) {
        LabellingToolSelf.initialise_entity(entity);
        LabellingToolSelf._register_root_entity(entity);

        var labels = get_label_header_labels(LabellingToolSelf._label_header);
        labels = labels.concat([entity.model]);
        LabellingToolSelf._label_header = replace_label_header_labels(LabellingToolSelf._label_header, labels);

        if (commit) {
            LabellingToolSelf.queue_push_label_data();
        }
    };

    /*
    Remove entity
    unregister the entity and remove its label from the tool data model
     */
    LabellingToolSelf.remove_root_entity = function(entity, commit) {
        // Find the entity's index in the array
        var index = LabellingToolSelf._all_entities.indexOf(entity);

        if (index === -1) {
            throw "Attempting to remove root entity that is not in _all_entities";
        }

        // Unregister the entity
        LabellingToolSelf.shutdown_entity(entity);

        // Get the label model
        var labels = get_label_header_labels(LabellingToolSelf._label_header);

        // Remove the model from the label model array
        labels = labels.slice(0, index).concat(labels.slice(index+1));
        // Replace the labels in the label header
        LabellingToolSelf._label_header = replace_label_header_labels(LabellingToolSelf._label_header, labels);

        if (commit) {
            // Commit changes
            LabellingToolSelf.queue_push_label_data();
        }
    };

    /*
    Commit model
    invoke when a model is modified
    inserts the model into the tool data model and ensures that the relevant change events get send over
     */
    LabellingToolSelf.commit_model = function(model) {
        var labels = get_label_header_labels(LabellingToolSelf._label_header);
        var index = labels.indexOf(model);

        if (index !== -1) {
            LabellingToolSelf.queue_push_label_data();
        }
    };

    LabellingToolSelf.queue_push_label_data = function() {
        if (LabellingToolSelf._pushDataTimeout === null) {
            LabellingToolSelf._pushDataTimeout = setTimeout(function() {
                LabellingToolSelf._pushDataTimeout = null;
                LabellingToolSelf._sendLabelHeaderFn(LabellingToolSelf._label_header);
            }, 0);
        }
    };

    // Function for getting the current mouse position
    LabellingToolSelf.get_mouse_pos_world_space = function() {
        var pos_screen = d3.mouse(LabellingToolSelf.$svg[0][0]);
        return {x: (pos_screen[0] - LabellingToolSelf._zoom_xlat[0]) / LabellingToolSelf._zoom_scale,
                y: (pos_screen[1] - LabellingToolSelf._zoom_xlat[1]) / LabellingToolSelf._zoom_scale};
    };

    LabellingToolSelf.get_mouse_pos_screen_space = function() {
        var pos = d3.mouse(LabellingToolSelf.$svg[0][0]);
        return {x: pos[0], y: pos[1]};
    };


    LabellingToolSelf._init_key_handlers = function() {
        __labelling_tool_key_handler.handler = LabellingToolSelf._on_key_down;
    };

    LabellingToolSelf._shutdown_key_handlers = function() {
        __labelling_tool_key_handler.handler = null;
    };

    LabellingToolSelf._on_key_down = function(event) {
        if (LabellingToolSelf.$tool !== null) {
            LabellingToolSelf.$tool.on_key_down(event);
        }
    };


    return LabellingToolSelf;
}


var __labelling_tool_key_handler = {};

__labelling_tool_key_handler.handler = null;
__labelling_tool_key_handler.connected = false;

