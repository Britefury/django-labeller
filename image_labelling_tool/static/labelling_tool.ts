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

/// <reference path="d3.d.ts" />
/// <reference path="jquery.d.ts" />
/// <reference path="polyk.d.ts" />

module labelling_tool {
    /*
    2D Vector
     */
    interface Vector2 {
        x: number;
        y: number;
    }

    function ensure_flag_exists(x: any, flag_name: string, default_value: any) {
        var v = x[flag_name];
        if (v === undefined) {
            x[flag_name] = default_value;
        }
        return x[flag_name];
    }

    /*
    Colour utility functions
     */
    function lighten_colour(rgb: number[], amount: number): number[] {
        var x = 1.0 - amount;
        return [Math.round(rgb[0]*x + 255*amount),
                Math.round(rgb[1]*x + 255*amount),
                Math.round(rgb[2]*x + 255*amount)];
    }

    function rgb_to_rgba_string(rgb: number[], alpha: number): string {
        return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
    }

    function compute_centroid_of_points(vertices: Vector2[]): Vector2 {
        var sum = [0.0, 0.0];
        var N = vertices.length;
        if (N === 0) {
            return {x: 0, y: 0};
        }
        else {
            for (var i = 0; i < N; i++) {
                var vtx = vertices[i];
                sum[0] += vtx.x;
                sum[1] += vtx.y;
            }
            var scale = 1.0 / N;
            return {x: sum[0] * scale, y: sum[1] * scale};
        }
    }






    /*
    Axis-aligned box
     */
    class AABox {
        lower: Vector2;
        upper: Vector2;

        constructor(lower: Vector2, upper: Vector2) {
            this.lower = lower;
            this.upper = upper;
        }

        contains_point(point: Vector2): boolean {
            return point.x >= this.lower.x && point.x <= this.upper.x &&
                   point.y >= this.lower.y && point.y <= this.upper.y;
        }
    }

    function AABox_from_points(array_of_points: Vector2[]): AABox {
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
            return new AABox(lower, upper);
        }
        else {
            return new AABox({x: 0, y: 0}, {x: 0, y: 0});
        }
    }

    function AABox_from_aaboxes(array_of_boxes: AABox[]): AABox {
        if (array_of_boxes.length > 0) {
            var first = array_of_boxes[0];
            var result = new AABox({x: first.lower.x, y: first.lower.y},
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
            return new AABox({x: 1, y: 1}, {x: -1, y: -1});
        }
    }



    /*
    Object ID table
     */
    class ObjectIDTable {
        _id_counter:number;
        _id_to_object;

        constructor() {
            this._id_counter = 1;
            this._id_to_object = {};
        }

        get(id:number):any {
            return this._id_to_object[id];
        }

        register(obj:any):void {
            var id:number;
            if ('object_id' in obj && obj.object_id !== null) {
                id = obj.object_id;
                this._id_counter = Math.max(this._id_counter, id + 1);
                this._id_to_object[id] = obj;
            }
            else {
                id = this._id_counter;
                this._id_counter += 1;
                this._id_to_object[id] = obj;
                obj.object_id = id;
            }
        }

        unregister(obj:any) {
            delete this._id_to_object[obj.object_id];
            obj.object_id = null;
        }


        register_objects(object_array:any[]) {
            var obj:any, id:number, i:number;

            for (i = 0; i < object_array.length; i++) {
                obj = object_array[i];
                if ('object_id' in obj && obj.object_id !== null) {
                    id = obj.object_id;
                    this._id_counter = Math.max(this._id_counter, id + 1);
                    this._id_to_object[id] = obj;
                }
            }

            for (i = 0; i < object_array.length; i++) {
                obj = object_array[i];

                if ('object_id' in obj && obj.object_id !== null) {

                }
                else {
                    id = this._id_counter;
                    this._id_counter += 1;
                    this._id_to_object[id] = obj;
                    obj.object_id = id;
                }
            }
        }

        static get_id(x: any) {
            if ('object_id' in x && x.object_id !== null) {
                return x.object_id;
            }
            else {
                return null;
            }
        }
    }


    /*
    Label class
     */
    interface LabelClass {
        name: string;
        human_name: string;
        colour: number[];
    }


    /*
    Label header model

    This is the model that gets send back and forth between the frontend and the backend.
    It combines:
    - an array of labels
    - an image ID that identifies the image to which the labels belong
    - a complete flag that indicates if the image is done
     */

    interface LabelHeaderModel {
        image_id: string,
        complete: boolean,
        labels: any[]
    }

    var get_label_header_labels = function(label_header: LabelHeaderModel) {
        var labels = label_header.labels;
        if (labels === undefined || labels === null) {
            return [];
        }
        else {
            return labels;
        }
    };

    var replace_label_header_labels = function(label_header: LabelHeaderModel, labels: any[]): LabelHeaderModel {
        return {image_id: label_header.image_id,
                complete: label_header.complete,
                labels: labels};
    };



    /*
    Abstract label model
     */
    interface AbstractLabelModel {
        label_type: string;
        label_class: string;
    }


    /*
    Create a polygonal label model

    vertices: list of pairs, each pair is [x, y]
     */
    interface PolygonalLabelModel extends AbstractLabelModel {
        vertices: Vector2[];
    }

    function new_PolygonalLabelModel(): PolygonalLabelModel {
        return {label_type: 'polygon', label_class: null, vertices: []};
    }


    /*
    Composite label model
     */
    interface CompositeLabelModel extends AbstractLabelModel {
        components: number[];
    }

    function new_CompositeLabelModel(): CompositeLabelModel {
        return {label_type: 'composite', label_class: null, components: []};
    }


    /*
    Group label model
     */
    interface GroupLabelModel extends AbstractLabelModel {
        component_models: AbstractLabelModel[];
    }

    function new_GroupLabelModel(): GroupLabelModel {
        return {label_type: 'group', label_class: null, component_models: []};
    }



    interface LabelEntityEventListener {
        on_mouse_in: (entity) => void;
        on_mouse_out: (entity) => void;
    }


    /*
    Container entity
     */
    interface ContainerEntity {
        add_child(child: AbstractLabelEntity<AbstractLabelModel>): void;
        remove_child(child: AbstractLabelEntity<AbstractLabelModel>): void;
    }



    /*
    Abstract label entity
     */
    class AbstractLabelEntity<ModelType extends AbstractLabelModel> {
        model: ModelType;
        protected root_view: RootLabelView;
        _attached: boolean;
        _hover: boolean;
        _selected: boolean;
        _event_listeners: LabelEntityEventListener[];
        parent_entity: ContainerEntity;


        constructor(view: RootLabelView, model: ModelType) {
            this.root_view = view;
            this.model = model;
            this._attached = this._hover = this._selected = false;
            this._event_listeners = [];
            this.parent_entity = null;
        }


        add_event_listener(listener: LabelEntityEventListener) {
            this._event_listeners.push(listener)
        }

        remove_event_listener(listener: LabelEntityEventListener) {
            var i = this._event_listeners.indexOf(listener);
            if (i !== -1) {
                this._event_listeners.splice(i, 1);
            }
        }

        set_parent(parent: ContainerEntity) {
            this.parent_entity = parent;
        }

        attach() {
            this.root_view._register_entity(this);
            this._attached = true;
        }

        detach() {
            this._attached = false;
            this.root_view._unregister_entity(this);
        }

        destroy() {
            if (this.parent_entity !== null) {
                this.parent_entity.remove_child(this);
            }
            this.root_view.shutdown_entity(this);
        }

        update() {
        }

        commit() {
        }

        hover(state: boolean) {
            this._hover = state;
            this._update_style();
        }

        select(state: boolean) {
            this._selected = state;
            this._update_style();
        }

        notify_hide_labels_change() {
            this._update_style();
        }

        get_label_class(): string {
            return this.model.label_class;
        }

        set_label_class(label_class: string) {
            this.model.label_class = label_class;
            this._update_style();
            this.commit();
        }

        _update_style() {
        };

        compute_centroid(): Vector2 {
            return null;
        }

        compute_bounding_box(): AABox {
            return null;
        };

        distance_to_point(point: Vector2): number {
            return null;
        };

        notify_model_destroyed(model_id: number) {
        };
    }


    /*
    Polygonal label entity
     */
    class PolygonalLabelEntity extends AbstractLabelEntity<PolygonalLabelModel> {
        _polyk_poly: number[];
        poly: any;
        shape_line: any;


        constructor(view: RootLabelView, model: PolygonalLabelModel) {
            super(view, model);
            this._polyk_poly = [];
            this.poly = null;
            this.shape_line = null;
        }
        
        attach() {
            super.attach();

            this.shape_line = d3.svg.line()
                .x(function (d: any) { return d.x; })
                .y(function (d: any) { return d.y; })
                .interpolate("linear-closed");

            this.poly = this.root_view.world.append("path");
            this.poly.data(this.model.vertices).attr("d", this.shape_line(this.model.vertices));

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

            this._update_polyk_poly();
            this._update_style();
        };

        detach() {
            this.poly.remove();
            this.poly = null;
            this.shape_line = null;
            this._polyk_poly = [];
            super.detach();
        };

        _update_polyk_poly() {
            this._polyk_poly = [];
            for (var i = 0; i < this.model.vertices.length; i++) {
                this._polyk_poly.push(this.model.vertices[i].x);
                this._polyk_poly.push(this.model.vertices[i].y);
            }
        }

        update() {
            this.poly.data(this.model.vertices).attr("d", this.shape_line(this.model.vertices));
            this._update_polyk_poly();
        }

        commit() {
            this.root_view.commit_model(this.model);
        }


        _update_style() {
            if (this._attached) {
                var stroke_colour_rgb: number[] = this._selected ? [255,0,0] : [255,255,0];
                var stroke_colour: string;

                if (this.root_view.view.hide_labels) {
                    stroke_colour = rgb_to_rgba_string(stroke_colour_rgb, 0.2);
                    this.poly.attr("style", "fill:none;stroke:" + stroke_colour + ";stroke-width:1");
                }
                else {
                    var fill_colour_rgb = this.root_view.view.colour_for_label_class(this.model.label_class);
                    if (this._hover) {
                        fill_colour_rgb = lighten_colour(fill_colour_rgb, 0.4);
                    }
                    var fill_colour = rgb_to_rgba_string(fill_colour_rgb, 0.35);

                    stroke_colour = rgb_to_rgba_string(stroke_colour_rgb, 0.5);

                    this.poly.attr("style", "fill:" + fill_colour + ";stroke:" + stroke_colour + ";stroke-width:1");
                }
            }
        }

        compute_centroid(): Vector2 {
            return compute_centroid_of_points(this.model.vertices);
        }

        compute_bounding_box(): AABox {
            return AABox_from_points(this.model.vertices);
        }

        distance_to_point(point: Vector2): number {
            if (PolyK.ContainsPoint(this._polyk_poly, point.x, point.y)) {
                return 0.0;
            }
            else {
                var e = PolyK.ClosestEdge(this._polyk_poly, point.x, point.y);
                return e.dist;
            }
        }
    }


    /*
    Composite label entity
     */
    class CompositeLabelEntity extends AbstractLabelEntity<CompositeLabelModel> {
        circle: any;
        central_circle: any;
        shape_line: any;
        connections_group: any;
        
        constructor(view: RootLabelView, model: CompositeLabelModel) {
            super(view, model);
        }
        
        attach() {
            super.attach();
            this.circle = this.root_view.world.append("circle")
                .attr('r', 8.0);

            this.central_circle = this.root_view.world.append("circle")
                .attr("pointer-events", "none")
                .attr('r', 4.0);

            this.shape_line = d3.svg.line()
                .x(function (d: any) { return d.x; })
                .y(function (d: any) { return d.y; })
                .interpolate("linear-closed");

            this.connections_group = null;

            this.update();

            var self = this;
            this.circle.on("mouseover", function() {
                self._on_mouse_over_event();
            }).on("mouseout", function() {
                self._on_mouse_out_event();
            });


            this._update_style();
        }

        detach() {
            this.circle.remove();
            this.central_circle.remove();
            this.connections_group.remove();
            this.circle = null;
            this.central_circle = null;
            this.shape_line = null;
            this.connections_group = null;
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
            var component_centroids = this._compute_component_centroids();
            var centroid = compute_centroid_of_points(component_centroids);

            this.circle
                .attr('cx', centroid.x)
                .attr('cy', centroid.y);

            this.central_circle
                .attr('cx', centroid.x)
                .attr('cy', centroid.y);

            if (this.connections_group !== null) {
                this.connections_group.remove();
                this.connections_group = null;
            }

            this.connections_group = this.root_view.world.append("g");
            for (var i = 0; i < component_centroids.length; i++) {
                this.connections_group.append("path")
                    .attr("d", this.shape_line([centroid, component_centroids[i]]))
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "3, 3")
                    .attr("style", "stroke:rgba(255,0,255,0.6);");
                this.connections_group.append("circle")
                    .attr("cx", component_centroids[i].x)
                    .attr("cy", component_centroids[i].y)
                    .attr("r", 3)
                    .attr("stroke-width", 1)
                    .attr("style", "stroke:rgba(255,0,255,0.6);fill: rgba(255,0,255,0.25);");
            }
        }

        commit() {
            this.root_view.commit_model(this.model);
        }


        _update_style() {
            if (this._attached) {
                var stroke_colour_rgb = this._selected ? [255,0,0] : [255,255,0];
                var stroke_colour: string;

                if (this.root_view.view.hide_labels) {
                    stroke_colour = rgb_to_rgba_string(stroke_colour_rgb, 0.2);
                    this.circle.attr("style", "fill:none;stroke:" + stroke_colour + ";stroke-width:1");

                    this.connections_group.selectAll("path")
                        .attr("style", "stroke:rgba(255,0,255,0.2);");
                    this.connections_group.selectAll("circle")
                        .attr("style", "stroke:rgba(255,0,255,0.2);fill: none;");            }
                else {
                    var circle_fill_colour_rgb = [255, 128, 255];
                    var central_circle_fill_colour_rgb = this.root_view.view.colour_for_label_class(this.model.label_class);
                    var connection_fill_colour_rgb = [255, 0, 255];
                    var connection_stroke_colour_rgb = [255, 0, 255];
                    if (this._hover) {
                        circle_fill_colour_rgb = lighten_colour(circle_fill_colour_rgb, 0.4);
                        central_circle_fill_colour_rgb = lighten_colour(central_circle_fill_colour_rgb, 0.4);
                        connection_fill_colour_rgb = lighten_colour(connection_fill_colour_rgb, 0.4);
                        connection_stroke_colour_rgb = lighten_colour(connection_stroke_colour_rgb, 0.4);
                    }
                    var circle_fill_colour = rgb_to_rgba_string(circle_fill_colour_rgb, 0.35);
                    var central_circle_fill_colour = rgb_to_rgba_string(central_circle_fill_colour_rgb, 0.35);
                    var connection_fill_colour = rgb_to_rgba_string(connection_fill_colour_rgb, 0.25);
                    var connection_stroke_colour = rgb_to_rgba_string(connection_stroke_colour_rgb, 0.6);

                    stroke_colour = rgb_to_rgba_string(stroke_colour_rgb, 0.5);

                    this.circle.attr("style", "fill:" + circle_fill_colour + ";stroke:" + connection_stroke_colour + ";stroke-width:1");
                    this.central_circle.attr("style", "fill:" + central_circle_fill_colour + ";stroke:" + stroke_colour + ";stroke-width:1");

                    this.connections_group.selectAll("path")
                        .attr("style", "stroke:rgba(255,0,255,0.6);");
                    this.connections_group.selectAll("circle")
                        .attr("style", "stroke:"+connection_stroke_colour+";fill:"+connection_fill_colour+";");
                }
            }
        }

        _compute_component_centroids(): Vector2[] {
            var component_centroids = [];
            for (var i = 0; i < this.model.components.length; i++) {
                var model_id = this.model.components[i];
                var entity = this.root_view.get_entity_for_model_id(model_id);
                var centroid = entity.compute_centroid();
                component_centroids.push(centroid);
            }
            return component_centroids;
        }

        compute_centroid(): Vector2 {
            return compute_centroid_of_points(this._compute_component_centroids());
        };

        compute_bounding_box(): AABox {
            var centre = this.compute_centroid();
            return new AABox({x: centre.x - 1, y: centre.y - 1}, {x: centre.x + 1, y: centre.y + 1});
        }

        notify_model_destroyed(model_id: number) {
            var index = this.model.components.indexOf(model_id);

            if (index !== -1) {
                // Remove the model ID from the components array
                this.model.components = this.model.components.slice(0, index).concat(this.model.components.slice(index+1));
                this.update();
            }
        }
    }


    /*
    Group label entity
     */
    class GroupLabelEntity extends AbstractLabelEntity<GroupLabelModel> implements ContainerEntity {
        _component_entities: AbstractLabelEntity<AbstractLabelModel>[];
        _bounding_rect: any;
        _bounding_aabox: AABox;
        _component_event_listener: LabelEntityEventListener;


        constructor(view: RootLabelView, model: GroupLabelModel) {
            super(view, model);
            var self = this;
            this._component_event_listener = {
                on_mouse_in: (entity) => {
                    for (var i = 0; i < self._event_listeners.length; i++) {
                        self._event_listeners[i].on_mouse_in(self);
                    }
                },
                on_mouse_out: (entity) => {
                    for (var i = 0; i < self._event_listeners.length; i++) {
                        self._event_listeners[i].on_mouse_out(self);
                    }
                }
            };
        }


        add_child(child: AbstractLabelEntity<AbstractLabelModel>): void {
            this.model.component_models.push(child.model);
            this._component_entities.push(child);
            child.add_event_listener(this._component_event_listener);
            child.set_parent(this);

            this.update_bbox();
            this.update();
            this._update_style();
        }

        remove_child(child: AbstractLabelEntity<AbstractLabelModel>): void {
            var index = this.model.component_models.indexOf(child.model);

            if (index === -1) {
                throw "GroupLabelEntity.remove_child: could not find child model";
            }

            this.model.component_models.splice(index, 1);
            this._component_entities.splice(index, 1);
            child.remove_event_listener(this._component_event_listener);
            child.set_parent(null);

            this.update_bbox();
            this.update();
            this._update_style();
        }

        remove_all_children(): void {
            for (var i = 0; i < this._component_entities.length; i++) {
                var child = this._component_entities[i];
                child.remove_event_listener(this._component_event_listener);
                child.set_parent(null);
            }

            this.model.component_models = [];
            this._component_entities = [];

            this.update_bbox();
            this.update();
            this._update_style();
        }


        attach() {
            super.attach();

            this._bounding_rect = this.root_view.world.append("rect")
                .attr("pointer-events", "none")
                .attr("x", 0).attr("y", 0)
                .attr("width", 0).attr("height", 0)
                .attr("visibility", "hidden");

            // Initialise child entities
            this._component_entities = [];
            var component_bboxes = [];
            for (var i = 0; i < this.model.component_models.length; i++) {
                var model = this.model.component_models[i];
                var model_entity = this.root_view.get_or_create_entity_for_model(model);
                this._component_entities.push(model_entity);
                component_bboxes.push(model_entity.compute_bounding_box());
                model_entity.add_event_listener(this._component_event_listener);
                model_entity.set_parent(this);
            }
            this._bounding_aabox = AABox_from_aaboxes(component_bboxes);

            this.update();
            this._update_style();
        };

        detach() {
            for (var i = 0; i < this._component_entities.length; i++) {
                var entity = this._component_entities[i];
                this.root_view.shutdown_entity(entity);
            }
            this._bounding_rect.remove();
            super.detach();
        };

        destroy() {
            var children = this._component_entities.slice();

            this.remove_all_children();

            for (var i = 0; i < children.length; i++) {
                this.parent_entity.add_child(children[i]);
            }

            this.parent_entity.remove_child(this);
            this.root_view.shutdown_entity(this);

            this._component_entities = [];
        }

        private update_bbox() {
            var component_bboxes = [];
            for (var i = 0; i < this._component_entities.length; i++) {
                var entity = this._component_entities[i];
                component_bboxes.push(entity.compute_bounding_box());
            }
            this._bounding_aabox = AABox_from_aaboxes(component_bboxes);
        }

        update() {
            this._bounding_rect
                .attr('x', this._bounding_aabox.lower.x)
                .attr('y', this._bounding_aabox.lower.y)
                .attr('width', this._bounding_aabox.upper.x - this._bounding_aabox.lower.x)
                .attr('height', this._bounding_aabox.upper.y - this._bounding_aabox.lower.y);
        }

        commit() {
            this.root_view.commit_model(this.model);
        }




        select(state: boolean) {
            for (var i = 0; i < this._component_entities.length; i++) {
                this._component_entities[i].select(state);
            }
            super.select(state);
        }

        hover(state: boolean) {
            for (var i = 0; i < this._component_entities.length; i++) {
                this._component_entities[i].hover(state);
            }
            super.hover(state);
        }


        _update_style() {
            if (this._attached) {
                if (this._selected) {
                    if (this._hover) {
                        this._bounding_rect.attr("style", "stroke:rgba(192,128,255,0.8); fill:rgba(192,128,255,0.2); line-width: 1.0px;")
                            .attr("visibility", "visible");
                    }
                    else {
                        this._bounding_rect.attr("style", "stroke:rgba(192,128,255,0.6); fill:none; line-width: 1.0px;")
                            .attr("visibility", "visible");
                    }
                }
                else {
                    if (this._hover) {
                        this._bounding_rect.attr("style", "stroke:rgba(192,128,255,0.4); fill:none; line-width: 1.0px;")
                            .attr("visibility", "visible");
                    }
                    else {
                        this._bounding_rect.attr("visibility", "hidden");
                    }
                }
            }
        }

        _compute_component_centroids(): Vector2[] {
            var component_centroids = [];
            for (var i = 0; i < this._component_entities.length; i++) {
                var entity = this._component_entities[i];
                var centroid = entity.compute_centroid();
                component_centroids.push(centroid);
            }
            return component_centroids;
        };

        compute_centroid(): Vector2 {
            return compute_centroid_of_points(this._compute_component_centroids());
        };

        compute_bounding_box(): AABox {
            return this._bounding_aabox;
        };

        distance_to_point(point: Vector2): number {
            var best_dist = null;
            for (var i = 0; i < this._component_entities.length; i++) {
                var entity = this._component_entities[i];
                var d = entity.distance_to_point(point);
                if (d !== null) {
                    if (best_dist === null || d < best_dist) {
                        best_dist = d;
                    }
                }
            }
            return best_dist;
        }
    }



    /*
    Map label type to entity constructor
     */
    var label_type_to_entity_factory = {
        'polygon': (root_view: RootLabelView, model: AbstractLabelModel) => {
            return new PolygonalLabelEntity(root_view, model as PolygonalLabelModel);
        },
        'composite': (root_view: RootLabelView, model: AbstractLabelModel) => {
            return new CompositeLabelEntity(root_view, model as CompositeLabelModel);
        },
        'group': (root_view: RootLabelView, model: AbstractLabelModel) => {
            return new GroupLabelEntity(root_view, model as GroupLabelModel);
        },
    };


    /*
    Construct entity for given label model.
    Uses the map above to choose the appropriate constructor
     */
    var new_entity_for_model = function(root_view: RootLabelView, label_model: AbstractLabelModel) {
        var factory = label_type_to_entity_factory[label_model.label_type];
        return factory(root_view, label_model);
    };





    interface RootLabelViewListener {
        // Selection changed; update class selector dropdown
        on_selection_changed: (root_view: RootLabelView) => void;
        // Root list changed; queue push
        root_list_changed: (root_view: RootLabelView) => void;
    }

    /*
    Label view root
     */
    class RootLabelView implements ContainerEntity {
        model: LabelHeaderModel;
        private _all_entities: AbstractLabelEntity<AbstractLabelModel>[];
        private root_entities: AbstractLabelEntity<AbstractLabelModel>[];
        private selected_entities: AbstractLabelEntity<AbstractLabelModel>[];
        private _label_model_obj_table: ObjectIDTable;
        private _label_model_id_to_entity: any;

        private root_listener: RootLabelViewListener;
        private _entity_event_listener: LabelEntityEventListener;

        view: LabellingTool;

        world: d3.Selection<any>;

        constructor(model: LabelHeaderModel, root_listener: RootLabelViewListener,
                    entity_listener: LabelEntityEventListener, ltool: LabellingTool,
                    world: d3.Selection<any>) {
            this.model = model;

            this._all_entities = [];
            this.root_entities = [];
            this.selected_entities = [];

            // Label model object table
            this._label_model_obj_table = new ObjectIDTable();
            // Label model object ID to entity
            this._label_model_id_to_entity = {};

            this.root_listener = root_listener;
            this._entity_event_listener = entity_listener;
            this.view = ltool;

            this.world = world;
        }


        /*
        Set model
         */
        set_model(model: LabelHeaderModel) {
            // Remove all entities
            var entites_to_shutdown = this.root_entities.slice();
            for (var i = 0; i < entites_to_shutdown.length; i++) {
                this.shutdown_entity(entites_to_shutdown[i]);
            }

            // Update the labels
            this.model = model;
            var labels = get_label_header_labels(this.model);

            // Set up the ID counter; ensure that it's value is 1 above the maximum label ID in use
            this._label_model_obj_table = new ObjectIDTable();
            this._label_model_obj_table.register_objects(labels);
            this._label_model_id_to_entity = {};

            // Reset the entity lists
            this._all_entities = [];
            this.root_entities = [];
            this.selected_entities = [];

            for (var i = 0; i < labels.length; i++) {
                var label = labels[i];
                var entity = this.get_or_create_entity_for_model(label);
                this.register_child(entity);
            }
        }

        /*
        Set complete
         */
        set_complete(complete: boolean) {
            this.model.complete = complete;
        }

        get_current_image_id(): string {
            if (this.model !== null  &&  this.model !== undefined) {
                return this.model.image_id;
            }
            else {
                return null;
            }
        };

        /*
        Set label visibility
         */
        set_label_visibility(visibility: boolean) {
            for (var i = 0; i < this._all_entities.length; i++) {
                this._all_entities[i].notify_hide_labels_change();
            }
        }


        /*
        Select an entity
         */
        select_entity(entity, multi_select, invert) {
            multi_select = multi_select === undefined  ?  false  :  multi_select;

            if (multi_select) {
                var index = this.selected_entities.indexOf(entity);
                var changed = false;

                if (invert) {
                    if (index === -1) {
                        // Add
                        this.selected_entities.push(entity);
                        entity.select(true);
                        changed = true;
                    }
                    else {
                        // Remove
                        this.selected_entities.splice(index, 1);
                        entity.select(false);
                        changed = true;
                    }
                }
                else {
                    if (index === -1) {
                        // Add
                        this.selected_entities.push(entity);
                        entity.select(true);
                        changed = true;
                    }
                }

                if (changed) {
                    this.root_listener.on_selection_changed(this);
                }
            }
            else {
                var prev_entity = this.get_selected_entity();

                if (prev_entity !== entity) {
                    for (var i = 0; i < this.selected_entities.length; i++) {
                        this.selected_entities[i].select(false);
                    }
                    this.selected_entities = [entity];
                    entity.select(true);
                }

                this.root_listener.on_selection_changed(this);
            }
        };


        /*
        Unselect all entities
         */
        unselect_all_entities() {
            for (var i = 0; i < this.selected_entities.length; i++) {
                this.selected_entities[i].select(false);
            }
            this.selected_entities = [];
            this.root_listener.on_selection_changed(this);
        };


        /*
        Get uniquely selected entity
         */
        get_selected_entity(): AbstractLabelEntity<AbstractLabelModel> {
            return this.selected_entities.length == 1  ?  this.selected_entities[0]  :  null;
        };

        /*
        Get selected entities
         */
        get_selection() {
            return this.selected_entities;
        };

        /*
        Get all entities
         */
        get_entities() {
            return this.root_entities;
        };



        /*
        Commit model
        invoke when a model is modified
        inserts the model into the tool data model and ensures that the relevant change events get send over
         */
        commit_model(model: AbstractLabelModel) {
            var labels = get_label_header_labels(this.model);
            var index = labels.indexOf(model);

            if (index !== -1) {
                this.root_listener.root_list_changed(this);
            }
        };


        /*
        Create composite label
         */
        create_composite_label_from_selection(): CompositeLabelEntity {
            var N = this.selected_entities.length;

            if (N > 0) {
                var model = new_CompositeLabelModel();

                for (var i = 0; i < this.selected_entities.length; i++) {
                    var model_id = ObjectIDTable.get_id(this.selected_entities[i].model);
                    model.components.push(model_id);
                }

                var entity = this.get_or_create_entity_for_model(model);
                this.add_child(entity);
                return entity;
            }
            else {
                return null;
            }
        }

        /*
        Create group label
         */
        create_group_label_from_selection(): GroupLabelEntity {
            var selection = this.selected_entities.slice();
            var N = selection.length;

            if (N > 0) {
                var model = new_GroupLabelModel();
                for (var i = 0; i < selection.length; i++) {
                    var entity = selection[i];
                    model.component_models.push(entity.model);
                    this.remove_child(entity);
                }

                var group_entity = this.get_or_create_entity_for_model(model);
                this.add_child(group_entity);
                return group_entity;
            }
            else {
                return null;
            }
        }

        /*
        Destroy selection
         */
        delete_selection() {
            var entities_to_remove: AbstractLabelEntity<AbstractLabelModel>[] = this.selected_entities.slice();

            this.unselect_all_entities();

            for (var i = 0; i < entities_to_remove.length; i++) {
                entities_to_remove[i].destroy();
            }
        }


        /*
        Register and unregister entities
         */
        _register_entity(entity) {
            this._all_entities.push(entity);
            this._label_model_obj_table.register(entity.model);
            this._label_model_id_to_entity[entity.model.object_id] = entity;
        };

        _unregister_entity(entity) {
            var index = this._all_entities.indexOf(entity);

            if (index === -1) {
                throw "Attempting to unregister entity that is not in _all_entities";
            }

            // Notify all entities of the destruction of this model
            for (var i = 0; i < this._all_entities.length; i++) {
                if (i !== index) {
                    this._all_entities[i].notify_model_destroyed(entity.model);
                }
            }

            // Unregister in the ID to object table
            this._label_model_obj_table.unregister(entity.model);
            delete this._label_model_id_to_entity[entity.model.object_id];

            // Remove
            this._all_entities.splice(index, 1);
        };


        /*
        Initialise and shutdown entities
         */
        initialise_entity(entity: AbstractLabelEntity<AbstractLabelModel>) {
            entity.attach();
        };

        shutdown_entity(entity: AbstractLabelEntity<AbstractLabelModel>) {
            entity.detach();
        };


        /*
        Get entity for model ID
         */
        get_entity_for_model_id(model_id: number) {
            return this._label_model_id_to_entity[model_id];
        };

        /*
        Get entity for model
         */
        get_entity_for_model(model: AbstractLabelModel) {
            var model_id = ObjectIDTable.get_id(model);
            return this._label_model_id_to_entity[model_id];
        };

        /*
        Get or create entity for model
         */
        get_or_create_entity_for_model(model: AbstractLabelModel) {
            var model_id = ObjectIDTable.get_id(model);
            if (model_id === null ||
                !this._label_model_id_to_entity.hasOwnProperty(model_id)) {
                var entity = new_entity_for_model(this, model);
                this.initialise_entity(entity);
                return entity;
            }
            else {
                return this._label_model_id_to_entity[model_id];
            }
        };




        /*
        Register and unregister child entities
         */
        private register_child(entity) {
            this.root_entities.push(entity);
            entity.add_event_listener(this._entity_event_listener);
            entity.set_parent(this);
        };

        private unregister_child(entity) {
            // Remove from list of root entities
            var index_in_roots = this.root_entities.indexOf(entity);

            if (index_in_roots === -1) {
                throw "Attempting to unregister root entity that is not in root_entities";
            }

            this.root_entities.splice(index_in_roots, 1);

            // Remove from selection if present
            var index_in_selection = this.selected_entities.indexOf(entity);
            if (index_in_selection !== -1) {
                entity.select(false);
                this.selected_entities.splice(index_in_selection, 1);
            }

            entity.remove_event_listener(this._entity_event_listener);
            entity.set_parent(null);
        };



        /*
        Add entity:
        register the entity and add its label to the tool data model
         */
        add_child(child: AbstractLabelEntity<AbstractLabelModel>): void {
            this.register_child(child);

            var labels = get_label_header_labels(this.model);
            labels = labels.concat([child.model]);
            this.model = replace_label_header_labels(this.model, labels);

            this.root_listener.root_list_changed(this);
        };

        /*
        Remove entity
        unregister the entity and remove its label from the tool data model
         */
        remove_child(child: AbstractLabelEntity<AbstractLabelModel>): void {
            // Get the label model
            var labels = get_label_header_labels(this.model);
            var index = labels.indexOf(child.model);
            if (index === -1) {
                throw "Attempting to remove root label that is not present";
            }
            // Remove the model from the label model array
            labels = labels.slice(0, index).concat(labels.slice(index+1));
            // Replace the labels in the label header
            this.model = replace_label_header_labels(this.model, labels);

            this.unregister_child(child);

            // Commit changes
            this.root_listener.root_list_changed(this);
        };
    }



    /*
    Abstract tool
     */
    class AbstractTool{
        _view: RootLabelView;
        
        constructor(view: RootLabelView) {
            this._view = view;
            
        }
        
        on_init() {
        };

        on_shutdown() {
        };

        on_switch_in(pos: Vector2) {
        };

        on_switch_out(pos: Vector2) {
        };

        on_left_click(pos: Vector2, event: any) {
        };

        on_cancel(pos: Vector2) {
        };

        on_button_down(pos: Vector2, event: any) {
        };

        on_button_up(pos: Vector2, event: any) {
        };

        on_move(pos: Vector2): boolean {
            return false;
        };

        on_drag(pos: Vector2): boolean {
            return false;
        };

        on_wheel(pos: Vector2, wheelDeltaX: number, wheelDeltaY: number): boolean {
            return false;
        };

        on_key_down(event: any): boolean {
            return false;
        };

        on_entity_mouse_in(entity: AbstractLabelEntity<AbstractLabelModel>) {
        };

        on_entity_mouse_out(entity: AbstractLabelEntity<AbstractLabelModel>) {
        };
    }


    /*
    Select entity tool
     */
    class SelectEntityTool extends AbstractTool {
        _highlighted_entities: AbstractLabelEntity<AbstractLabelModel>[];
    
        constructor(view: RootLabelView) {
            super(view);
            this._highlighted_entities = [];
        }

        on_init() {
            this._highlighted_entities = [];
        };

        on_shutdown() {
            // Remove any hover
            var entity = this._get_current_entity();
            if (entity !== null) {
                entity.hover(false);
            }
        };


        on_entity_mouse_in(entity: AbstractLabelEntity<AbstractLabelModel>) {
            var index = this._highlighted_entities.indexOf(entity);

            if (index === -1) {
                var prev = this._get_current_entity();
                this._highlighted_entities.push(entity);
                var cur = this._get_current_entity();
                SelectEntityTool._entity_stack_modified(prev, cur);
            }
        };


        on_entity_mouse_out(entity: AbstractLabelEntity<AbstractLabelModel>) {
            var index = this._highlighted_entities.indexOf(entity);

            if (index !== -1) {
                var prev = this._get_current_entity();
                this._highlighted_entities.splice(index, 1);
                var cur = this._get_current_entity();
                SelectEntityTool._entity_stack_modified(prev, cur);
            }
        };

        on_left_click(pos: Vector2, event: any) {
            var entity = this._get_current_entity();
            if (entity !== null) {
                this._view.select_entity(entity, event.shiftKey, true);
            }
            else {
                if (!event.shiftKey) {
                    this._view.unselect_all_entities();
                }
            }
        };

        _get_current_entity() {
            return this._highlighted_entities.length !== 0  ?  this._highlighted_entities[this._highlighted_entities.length-1]  :  null;
        };

        static _entity_stack_modified(prev: AbstractLabelEntity<AbstractLabelModel>, cur: AbstractLabelEntity<AbstractLabelModel>) {
            if (cur !== prev) {
                if (prev !== null) {
                    prev.hover(false);
                }

                if (cur !== null) {
                    cur.hover(true);
                }
            }
        };
    }


    /*
    Brush select entity tool
     */
    class BrushSelectEntityTool extends AbstractTool {
        _highlighted_entities: AbstractLabelEntity<AbstractLabelModel>[];
        _brush_radius: number;
        _brush_circle: any;
        
        constructor(view: RootLabelView) {
            super(view);
            
            this._highlighted_entities = [];
            this._brush_radius = 10.0;
            this._brush_circle = null;
        }
        
        on_init() {
            this._highlighted_entities = [];
            this._brush_circle = this._view.world.append("circle");
            this._brush_circle.attr("r", this._brush_radius);
            this._brush_circle.attr("visibility", "hidden");
            this._brush_circle.style("fill", "rgba(128,0,0,0.05)");
            this._brush_circle.style("stroke-width", "1.0");
            this._brush_circle.style("stroke", "red");
        };

        on_shutdown() {
            this._brush_circle.remove();
            this._brush_circle = null;
            this._highlighted_entities = [];
        };


        _get_entities_in_range(point: Vector2) {
            var in_range = [];
            var entities = this._view.get_entities();
            for (var i = 0; i < entities.length; i++) {
                var entity = entities[i];
                var dist = entity.distance_to_point(point);
                if (dist !== null) {
                    if (dist <= this._brush_radius) {
                        in_range.push(entity);
                    }
                }
            }
            return in_range;
        };

        _highlight_entities(entities: AbstractLabelEntity<AbstractLabelModel>[]) {
            // Remove any hover
            for (var i = 0; i < this._highlighted_entities.length; i++) {
                this._highlighted_entities[i].hover(false);
            }

            this._highlighted_entities = entities;

            // Add hover
            for (var i = 0; i < this._highlighted_entities.length; i++) {
                this._highlighted_entities[i].hover(true);
            }
        };


        on_button_down(pos: Vector2, event: any) {
            this._highlight_entities([]);
            var entities = this._get_entities_in_range(pos);
            for (var i = 0; i < entities.length; i++) {
                this._view.select_entity(entities[i], event.shiftKey || i > 0, false);
            }
            return true;
        };

        on_button_up(pos: Vector2, event: any) {
            this._highlight_entities(this._get_entities_in_range(pos));
            return true;
        };

        on_move(pos: Vector2): boolean {
            this._highlight_entities(this._get_entities_in_range(pos));
            this._brush_circle.attr("cx", pos.x);
            this._brush_circle.attr("cy", pos.y);
            return true;
        };

        on_drag(pos: Vector2): boolean {
            var entities = this._get_entities_in_range(pos);
            for (var i = 0; i < entities.length; i++) {
                this._view.select_entity(entities[i], true, false);
            }
            this._brush_circle.attr("cx", pos.x);
            this._brush_circle.attr("cy", pos.y);
            return true;
        };

        on_wheel(pos: Vector2, wheelDeltaX: number, wheelDeltaY: number): boolean {
            this._brush_radius += wheelDeltaY * 0.1;
            this._brush_radius = Math.max(this._brush_radius, 1.0);
            this._brush_circle.attr("r", this._brush_radius);
            return true;
        };

        on_key_down(event: any): boolean {
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

        on_switch_in(pos: Vector2) {
            this._highlight_entities(this._get_entities_in_range(pos));
            this._brush_circle.attr("visibility", "visible");
        };

        on_switch_out(pos: Vector2) {
            this._highlight_entities([]);
            this._brush_circle.attr("visibility", "hidden");
        };
    }


    /*
    Draw polygon tool
     */
    class DrawPolygonTool extends AbstractTool {
        entity: PolygonalLabelEntity;
        
        constructor(view: RootLabelView, entity: PolygonalLabelEntity) {
            super(view);
            this.entity = entity;
        }

        on_init() {
        };

        on_shutdown() {
        };

        on_switch_in(pos: Vector2) {
            if (this.entity !== null) {
                this.add_point(pos);
            }
        };

        on_switch_out(pos: Vector2) {
            if (this.entity !== null) {
                this.remove_last_point();
            }
        };

        on_cancel(pos: Vector2) {
            if (this.entity !== null) {
                this.remove_last_point();

                var vertices = this.get_vertices();
                if (vertices.length == 1) {
                    this.destroy_entity();
                }
                else {
                    this.entity.commit();
                    this.entity = null;
                }
            }
            else {
                this._view.unselect_all_entities();
                this._view.view.set_current_tool(new SelectEntityTool(this._view));
            }
        };

        on_left_click(pos: Vector2, event: any) {
            this.add_point(pos);
        };

        on_move(pos: Vector2): boolean {
            this.update_last_point(pos);
            return true;
        };



        create_entity() {
            var model = new_PolygonalLabelModel();
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

        get_vertices() {
            return this.entity !== null  ?  this.entity.model.vertices  :  null;
        };

        update_poly() {
            if (this.entity !== null) {
                this.entity.update();
            }
        };

        add_point(pos: Vector2) {
            var entity_is_new = false;
            if (this.entity === null) {
                this.create_entity();
                entity_is_new = true;
            }
            var vertices = this.get_vertices();

            if (entity_is_new) {
                // Add a duplicate vertex; this second vertex will follow the mouse
                vertices.push(pos);
            }
            vertices.push(pos);
            this.update_poly();
        };

        update_last_point(pos: Vector2) {
            var vertices = this.get_vertices();
            if (vertices !== null) {
                vertices[vertices.length - 1] = pos;
                this.update_poly();
            }
        };

        remove_last_point() {
            var vertices = this.get_vertices();

            if (vertices !== null) {
                if (vertices.length > 0) {
                    vertices.splice(vertices.length - 1, 1);
                    this.update_poly();
                }

                if (vertices.length === 0) {
                    this.destroy_entity();
                }
            }
        };
    }



    /*
    Labelling tool view; links to the server side data structures
     */
    export class LabellingTool {
        static _global_key_handler: any;
        static _global_key_handler_connected: boolean;

        private _config: any;
        private _entity_event_listener: LabelEntityEventListener;
        private root_view: RootLabelView;
        private root_view_listener: RootLabelViewListener;
        private _current_tool: AbstractTool;
        label_classes: LabelClass[];
        hide_labels: boolean;
        private _button_down: boolean;
        private _mouse_within: boolean;
        private _last_mouse_pos: Vector2;
        private _tool_width: number;
        private _tool_height: number;
        private _image_width: number;
        private _image_height: number;
        private _labelling_area_width: number;
        private _image_ids: string[];
        private _num_images: number;
        private _requestImageCallback: any;
        private _sendLabelHeaderFn: any;

        private _pushDataTimeout: any;
        private frozen: boolean;

        private _label_class_selector_menu: JQuery;
        private _confirm_delete: JQuery;
        private _confirm_delete_visible: boolean;
        private _svg: d3.Selection<any>;
        world: any;
        private _image: d3.Selection<any>;
        private _image_index_input: JQuery;
        private _complete_checkbox: JQuery;

        private _zoom_node: d3.Selection<any>;
        private _zoom_xlat: number[];
        private _zoom_scale: number;






        constructor(element: Element, label_classes: LabelClass[], tool_width: number, tool_height: number,
                    image_ids: string[], initial_image_id: string,
                    requestImageCallback: any, sendLabelHeaderFn: any, config: any) {
            var self = this;

            if (LabellingTool._global_key_handler === undefined ||
                    LabellingTool._global_key_handler_connected === undefined) {
                LabellingTool._global_key_handler = null;
                LabellingTool._global_key_handler_connected = false;
            }

            config = config || {};
            this._config = config;

            config.tools = config.tools || {};
            ensure_flag_exists(config.tools, 'imageSelector', true);
            ensure_flag_exists(config.tools, 'labelClassSelector', true);
            ensure_flag_exists(config.tools, 'brushSelect', true);
            ensure_flag_exists(config.tools, 'drawPolyLabel', true);
            ensure_flag_exists(config.tools, 'compositeLabel', true);
            ensure_flag_exists(config.tools, 'groupLabel', true);
            ensure_flag_exists(config.tools, 'deleteLabel', true);


            /*
            Entity event listener
             */
            this._entity_event_listener = {
                on_mouse_in: (entity) => {
                    if (this._current_tool !== null) {
                        this._current_tool.on_entity_mouse_in(entity);
                    }
                },

                on_mouse_out: (entity) => {
                    if (this._current_tool !== null) {
                        this._current_tool.on_entity_mouse_out(entity);
                    }
                }
            };

            /*
            Root view listener
             */
            this.root_view_listener = {
                // Selection changed; update class selector dropdown
                on_selection_changed: (root_view: RootLabelView): void => {
                    this._update_label_class_menu_from_views(root_view.get_selection());
                },
                // Root list changed; queue push
                root_list_changed: (root_view: RootLabelView): void => {
                    this.queue_push_label_data();
                }
            };


            // Model
            var initial_model: LabelHeaderModel = {
                image_id: '',
                complete: false,
                labels: []
            };
            // Active tool
            this._current_tool = null;
            // Classes
            this.label_classes = label_classes;
            // Hide labels
            this.hide_labels = false;
            // Button state
            this._button_down = false;

            // Labelling tool dimensions
            this._tool_width = tool_width;
            this._tool_height = tool_height;

            // List of Image IDs
            this._image_ids = image_ids;

            // Number of images in dataset
            this._num_images = image_ids.length;

            // Image dimensions
            this._image_width = 0;
            this._image_height = 0;

            // Data request callback; labelling tool will call this when it needs a new image to show
            this._requestImageCallback = requestImageCallback;
            // Send data callback; labelling tool will call this when it wants to commit data to the backend in response
            // to user action
            this._sendLabelHeaderFn = sendLabelHeaderFn;

            // Send data interval for storing interval ID for queued label send
            this._pushDataTimeout = null;
            // Frozen flag; while frozen, data will not be sent to backend
            this.frozen = false;



            var toolbar_width = 220;
            this._labelling_area_width = this._tool_width - toolbar_width;
            var labelling_area_x_pos = toolbar_width + 10;


            // A <div> element that surrounds the labelling tool
            var overall_border = $('<div style="border: 1px solid gray; width: ' + this._tool_width + 'px;"/>')
                .appendTo(element);

            var toolbar_container = $('<div style="position: relative;">').appendTo(overall_border);

            var toolbar = $('<div style="position: absolute; width: ' + toolbar_width +
                'px; padding: 4px; display: inline-block; background: #d0d0d0; border: 1px solid #a0a0a0;"/>').appendTo(toolbar_container);
            var labelling_area = $('<div style="width:' + this._labelling_area_width + 'px; margin-left: ' + labelling_area_x_pos + 'px"/>').appendTo(overall_border);


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

            $('<p style="background: #b0b0b0;">Current image</p>').appendTo(toolbar);

            if (config.tools.imageSelector) {
                var _change_image = function (image_id) {
                    self._requestImageCallback(image_id);
                };

                var _increment_image_index = function (offset) {
                    var image_id = self._get_current_image_id();
                    var index = self._image_id_to_index(image_id) + offset;
                    _change_image(self._image_index_to_id(index));
                };

                this._image_index_input = $('<input type="text" style="width: 30px; vertical-align: middle;" name="image_index"/>').appendTo(toolbar);
                this._image_index_input.on('change', function () {
                    var index_str = self._image_index_input.val();
                    var index = parseInt(index_str) - 1;
                    var image_id = self._image_index_to_id(index);
                    _change_image(image_id);
                });
                $('<span>' + '/' + this._num_images + '</span>').appendTo(toolbar);


                $('<br/>').appendTo(toolbar);
                var prev_image_button: any = $('<button>Prev image</button>').appendTo(toolbar);
                prev_image_button.button({
                    text: false,
                    icons: {primary: "ui-icon-seek-prev"}
                }).click(function (event) {
                    _increment_image_index(-1);
                    event.preventDefault();
                });

                var next_image_button: any = $('<button>Next image</button>').appendTo(toolbar);
                next_image_button.button({
                    text: false,
                    icons: {primary: "ui-icon-seek-next"}
                }).click(function (event) {
                    _increment_image_index(1);
                    event.preventDefault();
                });
            }

            $('<br/>').appendTo(toolbar);
            this._complete_checkbox = $('<input type="checkbox">Finished</input>').appendTo(toolbar);
            this._complete_checkbox.change(function(event, ui) {
                self.root_view.set_complete((event.target as any).checked);
                self.queue_push_label_data();
            });




            //
            // LABEL CLASS SELECTOR AND HIDE LABELS
            //

            $('<p style="background: #b0b0b0;">Labels</p>').appendTo(toolbar);

            if (config.tools.labelClassSelector) {
                this._label_class_selector_menu = $('<select name="label_class_selector"/>').appendTo(toolbar);
                for (var i = 0; i < this.label_classes.length; i++) {
                    var cls = this.label_classes[i];
                    $('<option value="' + cls.name + '">' + cls.human_name + '</option>').appendTo(this._label_class_selector_menu);
                }
                $('<option value="__unclassified" selected="false">UNCLASSIFIED</option>').appendTo(this._label_class_selector_menu);
                this._label_class_selector_menu.change(function (event, ui) {
                    var label_class_name = (event.target as any).value;
                    if (label_class_name == '__unclassified') {
                        label_class_name = null;
                    }
                    var selection = self.root_view.get_selection();
                    for (var i = 0; i < selection.length; i++) {
                        selection[i].set_label_class(label_class_name);
                    }
                });
            }

            $('<br/>').appendTo(toolbar);
            var hide_labels_checkbox = $('<input type="checkbox">Hide labels</input>').appendTo(toolbar);
            hide_labels_checkbox.change(function(event: any, ui) {
                self.hide_labels = event.target.checked;
                self.root_view.set_label_visibility(!self.hide_labels);
            });





            //
            // Tool buttons:
            // Select, brush select, draw poly, composite, group, delete
            //

            $('<p style="background: #b0b0b0;">Tools</p>').appendTo(toolbar);
            var select_button: any = $('<button>Select</button>').appendTo(toolbar);
            select_button.button().click(function(event) {
                self.set_current_tool(new SelectEntityTool(self.root_view));
                event.preventDefault();
            });

            if (config.tools.brushSelect) {
                var brush_select_button: any = $('<button>Brush select</button>').appendTo(toolbar);
                brush_select_button.button().click(function (event) {
                    self.set_current_tool(new BrushSelectEntityTool(self.root_view));
                    event.preventDefault();
                });
            }

            if (config.tools.drawPolyLabel) {
                var draw_polygon_button: any = $('<button>Draw poly</button>').appendTo(toolbar);
                draw_polygon_button.button().click(function (event) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof PolygonalLabelEntity) {
                        self.set_current_tool(new DrawPolygonTool(self.root_view, current));
                    }
                    else {
                        self.set_current_tool(new DrawPolygonTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
            }

            if (config.tools.compositeLabel) {
                var composite_button: any = $('<button>Composite</button>').appendTo(toolbar);
                composite_button.button().click(function (event) {
                    self.root_view.create_composite_label_from_selection();

                    event.preventDefault();
                });
            }

            if (config.tools.groupLabel) {
                var group_button: any = $('<button>Group</button>').appendTo(toolbar);
                group_button.button().click(function (event) {
                    var group_entity = self.root_view.create_group_label_from_selection();

                    if (group_entity !== null) {
                        self.root_view.select_entity(group_entity, false, false);
                    }

                    event.preventDefault();
                });
            }

            if (config.tools.deleteLabel) {
                var delete_label_button: any = $('<button>Delete</button>').appendTo(toolbar);
                delete_label_button.button({
                    text: false,
                    icons: {primary: "ui-icon-trash"}
                }).click(function (event) {
                    if (!self._confirm_delete_visible) {
                        var cancel_button: any = $('<button>Cancel</button>').appendTo(self._confirm_delete);
                        var confirm_button: any = $('<button>Confirm delete</button>').appendTo(self._confirm_delete);

                        var remove_confirm_ui = function () {
                            cancel_button.remove();
                            confirm_button.remove();
                            self._confirm_delete_visible = false;
                        };

                        cancel_button.button().click(function (event) {
                            remove_confirm_ui();
                            event.preventDefault();
                        });

                        confirm_button.button().click(function (event) {
                            self.root_view.delete_selection();

                            remove_confirm_ui();
                            event.preventDefault();
                        });

                        self._confirm_delete_visible = true;
                    }

                    event.preventDefault();
                });

                this._confirm_delete = $('<span/>').appendTo(toolbar);
                this._confirm_delete_visible = false;
            }




            /*
             *
             * LABELLING AREA
             *
             */

            // Zoom callback
            function zoomed() {
                var zoom_event: d3.ZoomEvent = d3.event as d3.ZoomEvent;
                var t = zoom_event.translate, s = zoom_event.scale;
                self._zoom_xlat = t;
                self._zoom_scale = s;
                self._zoom_node.attr("transform", "translate(" + t[0] + "," + t[1] + ") scale(" + s + ")");
            }

            // Create d3.js panning and zooming behaviour
            var zoom_behaviour = d3.behavior.zoom()
                .on("zoom", zoomed);



            // Disable context menu so we can use right-click
            labelling_area[0].oncontextmenu = function() {
                return false;
            };

            // Create SVG element of the appropriate dimensions
            this._svg = d3.select(labelling_area[0])
                    .append("svg:svg")
                    .attr("width", this._labelling_area_width)
                    .attr("height", this._tool_height)
                    .call(zoom_behaviour);
            var svg = this._svg;

            // Add the zoom transformation <g> element
            this._zoom_node = this._svg.append('svg:g').attr('transform', 'scale(1)');
            this._zoom_scale = 1.0;
            this._zoom_xlat = [0.0, 0.0];

            // Create the container <g> element that will contain our scene
            this.world = this._zoom_node.append('g');

            // Add the image element to the container
            this._image = this.world.append("image")
                    .attr("x", 0)
                    .attr("y", 0);


            // Flag that indicates if the mouse pointer is within the tool area
            this._mouse_within = false;
            this._last_mouse_pos = null;


            // Create the root view
            this.root_view = new RootLabelView(initial_model, this.root_view_listener,
                this._entity_event_listener, this, this.world);


            //
            // Set up event handlers
            //

            // Click
            this.world.on("click", () => {
                var click_event: any = d3.event;
                if (click_event.button === 0) {
                    // Left click; send to tool
                    if (!click_event.altKey) {
                        if (this._current_tool !== null) {
                            this._current_tool.on_left_click(self.get_mouse_pos_world_space(), d3.event);
                        }
                        click_event.stopPropagation();
                    }

                }
            });

            // Button press
            this.world.on("mousedown", () => {
                var button_event: any = d3.event;
                if (button_event.button === 0) {
                    // Left button down
                    if (!button_event.altKey) {
                        self._button_down = true;
                        if (this._current_tool !== null) {
                            this._current_tool.on_button_down(self.get_mouse_pos_world_space(), d3.event);
                        }
                        button_event.stopPropagation();
                    }
                }
                else if (button_event.button === 2) {
                    // Right click; on_cancel current tool
                    if (this._current_tool !== null) {
                        var handled = this._current_tool.on_cancel(self.get_mouse_pos_world_space());
                        if (handled) {
                            button_event.stopPropagation();
                        }
                    }
                }
            });

            // Button press
            this.world.on("mouseup", () => {
                var button_event: any = d3.event;
                if (button_event.button === 0) {
                    // Left buton up
                    if (!button_event.altKey) {
                        self._button_down = false;
                        if (this._current_tool !== null) {
                            this._current_tool.on_button_up(self.get_mouse_pos_world_space(), d3.event);
                        }
                        button_event.stopPropagation();
                    }
                }
            });

            // Mouse on_move
            this.world.on("mousemove", () => {
                var move_event: any = d3.event;
                self._last_mouse_pos = self.get_mouse_pos_world_space();
                if (self._button_down) {
                    if (this._current_tool !== null) {
                        this._current_tool.on_drag(self._last_mouse_pos);
                    }
                    move_event.stopPropagation();
                }
                else {
                    var handled = false;
                    if (!self._mouse_within) {
                        self._init_key_handlers();

                        // Entered tool area; invoke tool.on_switch_in()
                        if (this._current_tool !== null) {
                            this._current_tool.on_switch_in(self._last_mouse_pos);
                            handled = true;
                        }

                        self._mouse_within = true;
                    }
                    else {
                        // Send mouse on_move event to tool
                        if (this._current_tool !== null) {
                            this._current_tool.on_move(self._last_mouse_pos);
                            handled = true;
                        }
                    }
                    if (handled) {
                        move_event.stopPropagation();
                    }
                }
            });

            // Mouse wheel
            this.world.on("mousewheel", () => {
                var wheel_event: any = d3.event;
                var handled = false;
                self._last_mouse_pos = self.get_mouse_pos_world_space();
                if (wheel_event.ctrlKey || wheel_event.shiftKey || wheel_event.altKey) {
                    if (this._current_tool !== null) {
                        handled = this._current_tool.on_wheel(self._last_mouse_pos,
                                                                   wheel_event.wheelDeltaX, wheel_event.wheelDeltaY);
                    }
                }
                if (handled) {
                    wheel_event.stopPropagation();
                }
            });


            var on_mouse_out = (pos, width, height) => {
                var mouse_event: any = d3.event;
                if (self._mouse_within) {
                    if (pos.x < 0.0 || pos.x > width || pos.y < 0.0 || pos.y > height) {
                        // The pointer is outside the bounds of the tool, as opposed to entering another element within the bounds of the tool, e.g. a polygon
                        // invoke tool.on_switch_out()
                        var handled = false;
                        if (this._current_tool !== null) {
                            this._current_tool.on_switch_out(self.get_mouse_pos_world_space());
                            handled = true;
                        }

                        if (handled) {
                            mouse_event.stopPropagation();
                        }

                        self._mouse_within = false;
                        self._last_mouse_pos = null;
                        self._shutdown_key_handlers();
                    }
                }
            };

            // Mouse leave
            this._svg.on("mouseout", () => {
                on_mouse_out(this.get_mouse_pos_screen_space(), this._labelling_area_width, this._tool_height);
            });


            // Global key handler
            if (!LabellingTool._global_key_handler_connected) {
                d3.select("body").on("keydown", function () {
                    if (LabellingTool._global_key_handler !== null) {
                        var key_event: any = d3.event;
                        var handled = LabellingTool._global_key_handler(key_event);
                        if (handled) {
                            key_event.stopPropagation();
                        }
                    }
                });
                LabellingTool._global_key_handler_connected = true;
            }


            // Create entities for the pre-existing labels
            this._requestImageCallback(initial_image_id)
        };


        _image_id_to_index(image_id: string) {
            var image_index = this._image_ids.indexOf(image_id);
            if (image_index === -1) {
                console.log("Image ID " + image_id + " not found");
                image_index = 0;
            }
            return image_index;
        };

        _image_index_to_id(index) {
            var clampedIndex = Math.max(Math.min(index, this._image_ids.length - 1), 0);
            console.log("index=" + index + ", clampedIndex="+clampedIndex);
            return this._image_ids[clampedIndex];
        };

        _update_image_index_input(image_id) {
            var image_index = this._image_id_to_index(image_id);

            this._image_index_input.val((image_index+1).toString());
        };

        _get_current_image_id(): string {
            return this.root_view.get_current_image_id();
        };

        setImage(image_data) {
            // Update the image SVG element
            this._image.attr("width", image_data.width + 'px');
            this._image.attr("height", image_data.height + 'px');
            this._image.attr('xlink:href', image_data.href);
            this._image_width = image_data.width;
            this._image_height = image_data.height;

            this.root_view.set_model(image_data.label_header);

            (this._complete_checkbox[0] as any).checked = this.root_view.model.complete;

            this._update_image_index_input(this.root_view.model.image_id);


            this.set_current_tool(new SelectEntityTool(this.root_view));

            console.log(this);
        };




        /*
        Get colour for a given label class
         */
        index_for_label_class(label_class) {
            if (label_class != null) {
                for (var i = 0; i < this.label_classes.length; i++) {
                    var cls = this.label_classes[i];

                    if (cls.name === label_class) {
                        return i;
                    }
                }
            }

            // Default
            return -1;
        };

        colour_for_label_class(label_class) {
            var index = this.index_for_label_class(label_class);
            if (index !== -1) {
                return this.label_classes[index].colour;
            }
            else {
                // Default
                return [0, 0, 0];
            }
        };

        _update_label_class_menu(label_class) {
            if (label_class === null) {
                label_class = '__unclassified';
            }

            this._label_class_selector_menu.children('option').each(function() {
                this.selected = (this.value == label_class);
            });
        };

        _update_label_class_menu_from_views(selection: AbstractLabelEntity<AbstractLabelModel>[]) {
            if (selection.length === 1) {
                this._update_label_class_menu(selection[0].model.label_class);
            }
            else {
                this._update_label_class_menu(null);
            }
        };



        /*
        Set the current tool; switch the old one out and a new one in
         */
        set_current_tool(tool) {
            if (this._current_tool !== null) {
                if (this._mouse_within) {
                    this._current_tool.on_switch_out(this._last_mouse_pos);
                }
                this._current_tool.on_shutdown();
            }

            this._current_tool = tool;

            if (this._current_tool !== null) {
                this._current_tool.on_init();
                if (this._mouse_within) {
                    this._current_tool.on_switch_in(this._last_mouse_pos);
                }
            }
        };


        freeze() {
            this.frozen = true;
        }

        thaw() {
            this.frozen = false;
        }

        queue_push_label_data() {
            if (!this.frozen) {
                if (this._pushDataTimeout === null) {
                    this._pushDataTimeout = setTimeout(() => {
                        this._pushDataTimeout = null;
                        this._sendLabelHeaderFn(this.root_view.model);
                    }, 0);
                }
            }
        };

        // Function for getting the current mouse position
        get_mouse_pos_world_space() {
            var pos_screen = d3.mouse(this._svg[0][0]);
            return {x: (pos_screen[0] - this._zoom_xlat[0]) / this._zoom_scale,
                    y: (pos_screen[1] - this._zoom_xlat[1]) / this._zoom_scale};
        };

        get_mouse_pos_screen_space() {
            var pos = d3.mouse(this._svg[0][0]);
            return {x: pos[0], y: pos[1]};
        };


        _init_key_handlers() {
            var self = this;
            var on_key_down = function(event: any): boolean {
                return self._on_key_down(event);
            };
            LabellingTool._global_key_handler = on_key_down;
        };

        _shutdown_key_handlers() {
            LabellingTool._global_key_handler = null;
        };

        _on_key_down(event: any): boolean {
            if (this._current_tool !== null && this._mouse_within) {
                return this._current_tool.on_key_down(event);
            }
            else {
                return false;
            }
        }
    }
}


