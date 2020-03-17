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
/// <reference path="./object_id_table.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./composite_label.ts" />
/// <reference path="./group_label.ts" />
/// <reference path="./main_anno.ts" />
var labelling_tool;
(function (labelling_tool) {
    /*
    Label view root
     */
    var RootLabelView = /** @class */ (function () {
        function RootLabelView(model, root_listener, entity_listener, ltool, world) {
            this.model = model;
            this._all_entities = [];
            this.root_entities = [];
            this.selected_entities = [];
            this._placeholders = [];
            // Label model object table
            this._label_model_obj_table = new labelling_tool.ObjectIDTable();
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
        RootLabelView.prototype.set_model = function (model) {
            // Remove all entities
            var entites_to_shutdown = this.root_entities.slice();
            for (var i = 0; i < entites_to_shutdown.length; i++) {
                this.shutdown_entity(entites_to_shutdown[i]);
            }
            // Remove place holders
            var place_holders_to_shutdown = this._placeholders.slice();
            for (var i = 0; i < place_holders_to_shutdown.length; i++) {
                place_holders_to_shutdown[i].detach();
            }
            // Update the labels
            this.model = model;
            var labels = labelling_tool.get_label_header_labels(this.model);
            // Set up the ID counter; ensure that it's value is 1 above the maximum label ID in use
            this._label_model_obj_table = new labelling_tool.ObjectIDTable();
            this._label_model_obj_table.register_objects(labels);
            this._label_model_id_to_entity = {};
            // Reset the entity lists
            this._all_entities = [];
            this.root_entities = [];
            this.selected_entities = [];
            for (var i = 0; i < labels.length; i++) {
                var label = labels[i];
                var entity = this.get_or_create_entity_for_model(label);
                if (entity !== null) {
                    this.register_child(entity);
                }
            }
        };
        /*
        Set complete
         */
        RootLabelView.prototype.set_complete = function (complete) {
            this.model.complete = complete;
        };
        RootLabelView.prototype.get_current_image_id = function () {
            if (this.model !== null && this.model !== undefined) {
                return this.model.image_id;
            }
            else {
                return null;
            }
        };
        ;
        /*
        Notify of colour_scheme change
         */
        RootLabelView.prototype.notify_colour_scheme_changed = function () {
            for (var i = 0; i < this._all_entities.length; i++) {
                this._all_entities[i].notify_colour_scheme_changed();
            }
        };
        /*
        Set label visibility
         */
        RootLabelView.prototype.set_label_visibility = function (visibility, filter_class) {
            for (var i = 0; i < this._all_entities.length; i++) {
                this._all_entities[i].notify_hide_labels_change();
            }
        };
        /*
        Select an entity
         */
        RootLabelView.prototype.select_entity = function (entity, multi_select, invert) {
            multi_select = multi_select === undefined ? false : multi_select;
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
        ;
        /*
        Unselect all entities
         */
        RootLabelView.prototype.unselect_all_entities = function () {
            for (var i = 0; i < this.selected_entities.length; i++) {
                this.selected_entities[i].select(false);
            }
            this.selected_entities = [];
            this.root_listener.on_selection_changed(this);
        };
        ;
        /*
        Get uniquely selected entity
         */
        RootLabelView.prototype.get_selected_entity = function () {
            return this.selected_entities.length == 1 ? this.selected_entities[0] : null;
        };
        ;
        /*
        Get selected entities
         */
        RootLabelView.prototype.get_selection = function () {
            return this.selected_entities;
        };
        ;
        /*
        Get all entities
         */
        RootLabelView.prototype.get_entities = function () {
            return this.root_entities;
        };
        ;
        /*
        Commit model
        invoke when a model is modified
        inserts the model into the tool data model and ensures that the relevant change events get send over
         */
        RootLabelView.prototype.commit_model = function (model) {
            var labels = labelling_tool.get_label_header_labels(this.model);
            var index = labels.indexOf(model);
            if (index !== -1) {
                this.root_listener.root_list_changed(this);
            }
        };
        ;
        /*
        Set label class of selection
         */
        RootLabelView.prototype.set_selection_label_class = function (label_class_name) {
            var selection = this.get_selection();
            for (var i = 0; i < selection.length; i++) {
                selection[i].set_label_class(label_class_name);
            }
        };
        /*
        Set annotation data of selection
         */
        RootLabelView.prototype.set_selection_anno_data_value = function (anno_identifier, value) {
            var selection = this.get_selection();
            for (var i = 0; i < selection.length; i++) {
                selection[i].set_anno_data_value(anno_identifier, value);
            }
        };
        /*
        Create composite label
         */
        RootLabelView.prototype.create_composite_label_from_selection = function () {
            var N = this.selected_entities.length;
            if (N > 0) {
                var label_class = this.view.get_label_class_for_new_label();
                var model = labelling_tool.new_CompositeLabelModel(label_class, "manual");
                for (var i = 0; i < this.selected_entities.length; i++) {
                    var model_id = labelling_tool.ObjectIDTable.get_id(this.selected_entities[i].model);
                    model.components.push(model_id);
                }
                var entity = this.get_or_create_entity_for_model(model);
                this.add_child(entity);
                return entity;
            }
            else {
                return null;
            }
        };
        /*
        Create group label
         */
        RootLabelView.prototype.create_group_label_from_selection = function () {
            var selection = this.selected_entities.slice();
            var N = selection.length;
            if (N > 0) {
                var label_class = this.view.get_label_class_for_new_label();
                // If `label_class` is null, choose the most popular class from the components
                if (label_class === null) {
                    // Count the frequencies if the component models
                    var class_freq = {};
                    for (var i = 0; i < selection.length; i++) {
                        // Get the class of the component
                        var component_class = selection[i].model.label_class;
                        if (component_class in class_freq) {
                            class_freq[component_class] += 1;
                        }
                        else {
                            class_freq[component_class] = 1;
                        }
                    }
                    // Choose the class with the highest frequency
                    var best_class = null;
                    var best_freq = 0;
                    for (var cls in class_freq) {
                        if (class_freq[cls] > best_freq) {
                            best_class = cls;
                            best_freq = class_freq[cls];
                        }
                    }
                    label_class = best_class;
                }
                var model = labelling_tool.new_GroupLabelModel(label_class, "manual");
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
        };
        /*
        Destroy selection
         */
        RootLabelView.prototype.delete_selection = function (delete_filter_fn) {
            var entities_to_remove = this.selected_entities.slice();
            this.unselect_all_entities();
            for (var i = 0; i < entities_to_remove.length; i++) {
                if (delete_filter_fn !== undefined && delete_filter_fn !== null) {
                    if (delete_filter_fn(entities_to_remove[i])) {
                        entities_to_remove[i].destroy();
                    }
                }
                else {
                    entities_to_remove[i].destroy();
                }
            }
        };
        /*
        Register and unregister entities
         */
        RootLabelView.prototype._register_entity = function (entity) {
            this._all_entities.push(entity);
            this._label_model_obj_table.register(entity.model);
            this._label_model_id_to_entity[entity.model.object_id] = entity;
        };
        ;
        RootLabelView.prototype._unregister_entity = function (entity) {
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
        ;
        /*
        Initialise and shutdown entities
         */
        RootLabelView.prototype.initialise_entity = function (entity) {
            entity.attach();
        };
        ;
        RootLabelView.prototype.shutdown_entity = function (entity) {
            entity.detach();
            this.view.notify_entity_deleted(entity);
        };
        ;
        /*
        Get entity for model ID
         */
        RootLabelView.prototype.get_entity_for_model_id = function (model_id) {
            return this._label_model_id_to_entity[model_id];
        };
        ;
        /*
        Get or create entity for model
         */
        RootLabelView.prototype.get_or_create_entity_for_model = function (model) {
            var model_id = labelling_tool.ObjectIDTable.get_id(model);
            if (model_id === null ||
                !this._label_model_id_to_entity.hasOwnProperty(model_id)) {
                var entity = labelling_tool.new_entity_for_model(this, model);
                if (entity !== null) {
                    this.initialise_entity(entity);
                }
                else {
                    this._label_model_id_to_entity[model_id] = null;
                }
                return entity;
            }
            else {
                return this.get_entity_for_model_id(model_id);
            }
        };
        ;
        /*
        Register place holder
         */
        RootLabelView.prototype._register_placeholder = function (placeholder) {
            this._placeholders.push(placeholder);
        };
        ;
        RootLabelView.prototype._unregister_placeholder = function (placeholder) {
            var index = this._placeholders.indexOf(placeholder);
            if (index === -1) {
                throw "Attempting to unregister placeholder that is not in _placeholders";
            }
            // Remove
            this._placeholders.splice(index, 1);
        };
        ;
        /*
        Register and unregister child entities
         */
        RootLabelView.prototype.register_child = function (entity) {
            this.root_entities.push(entity);
            entity.add_event_listener(this._entity_event_listener);
            entity.set_parent(this);
        };
        ;
        RootLabelView.prototype.unregister_child = function (entity) {
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
        ;
        /*
        Add entity:
        register the entity and add its label to the tool data model
         */
        RootLabelView.prototype.add_child = function (child) {
            this.register_child(child);
            var labels = labelling_tool.get_label_header_labels(this.model);
            labels = labels.concat([child.model]);
            this.model = labelling_tool.replace_label_header_labels(this.model, labels);
            this.root_listener.root_list_changed(this);
        };
        ;
        /*
        Remove entity
        unregister the entity and remove its label from the tool data model
         */
        RootLabelView.prototype.remove_child = function (child) {
            // Get the label model
            var labels = labelling_tool.get_label_header_labels(this.model);
            var index = labels.indexOf(child.model);
            if (index === -1) {
                throw "Attempting to remove root label that is not present";
            }
            // Remove the model from the label model array
            labels = labels.slice(0, index).concat(labels.slice(index + 1));
            // Replace the labels in the label header
            this.model = labelling_tool.replace_label_header_labels(this.model, labels);
            this.unregister_child(child);
            // Commit changes
            this.root_listener.root_list_changed(this);
        };
        ;
        return RootLabelView;
    }());
    labelling_tool.RootLabelView = RootLabelView;
})(labelling_tool || (labelling_tool = {}));
