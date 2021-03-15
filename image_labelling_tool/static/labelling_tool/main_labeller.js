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
/// <reference path="../d3.d.ts" />
/// <reference path="../jquery.d.ts" />
/// <reference path="../polyk.d.ts" />
/// <reference path="./math_primitives.ts" />
/// <reference path="./object_id_table.ts" />
/// <reference path="./label_class.ts" />
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />
/// <reference path="./select_tools.ts" />
/// <reference path="./point_label.ts" />
/// <reference path="./box_label.ts" />
/// <reference path="./oriented_ellipse_label.ts" />
/// <reference path="./polygonal_label.ts" />
/// <reference path="./dextr_label.ts" />
/// <reference path="./composite_label.ts" />
/// <reference path="./group_label.ts" />
/// <reference path="./popup_menu.ts" />
/// <reference path="./anno_controls.ts" />
var labelling_tool;
(function (labelling_tool) {
    labelling_tool.get_label_header_labels = function (label_header) {
        var labels = label_header.labels;
        if (labels === undefined || labels === null) {
            return [];
        }
        else {
            return labels;
        }
    };
    labelling_tool.replace_label_header_labels = function (label_header, labels) {
        return { image_id: label_header.image_id,
            completed_tasks: label_header.completed_tasks,
            timeElapsed: label_header.timeElapsed,
            state: label_header.state,
            labels: labels,
            session_id: label_header.session_id };
    };
    /*
   Labelling tool view; links to the server side data structures
    */
    var DjangoLabeller = /** @class */ (function () {
        function DjangoLabeller(label_classes, tasks, colour_schemes, anno_controls_json, images, initial_image_index, requestLabelsCallback, sendLabelHeaderFn, getUnlockedImageIDCallback, dextrCallback, dextrPollingInterval, config) {
            var _this = this;
            this._label_class_selector_select = null;
            this._label_class_selector_popup = null;
            this._label_class_filter_select = null;
            this._label_class_filter_popup = null;
            this._image_index_input = null;
            /*
            label_classes: label class definitions in JSON format
            colour_schemes: colour scheme definitions in JSON format
            images: images to annotate
            initial_image_index: the index of the first image to select
            requestLabelsCallback: a function of the form `function(image_id)` that the annotator uses to
                asynchronously requests labels for the given image. When the labels become available (e.g.
                when the HTTP request succeeds), give the labels to the annotator by invoking the `loadLabels` method
            sendLabelHeaderFn: a function of the form `function(label_header)` that the annotator uses to
                asynchronously send modified labels for storage. When the response to the request is
                available(e.g. when the HTTP request succeeds), reply by invoking the `notifyLabelUpdateResponse`
                method, passing a message of the form `{error: undefined}` if everything is okay,
                or `{error: 'locked'}` to indicate that these labels are locked
            getUnlockedImageIDCallback: (optional, can be null) a function of the form
                `function(image_id_list)` that the annotator uses to asynchronously request the ID of the next
                available unlocked image, chosen from the list of image IDs provided as an argument.
                When the image ID become available (e.g. when the HTTP request succeeds), give it to the annotator by
                invoking the `goToImageById(next_unlocked_image_id)` method.
            dextrCallback: (optional, can be null) a function of the form `function(dextr_api)` that the annotator
                uses to asynchronously request an automatically generated label for an object identified by four
                points in the image. The callback will be used on one of two ways:
                (1) a new request will be sent in the form of
                `{request: {image_id: string, dextr_id: int, dextr_points: Vector2[]}}`. `image_id` is a string
                used to identify the image, `dextr_id` is an integer that identifies this DEXTR request
                and `dextr_points` is a list of Vector2s that gives the four points specified by the user.
                (2) polling, in the form of `{poll: true}` that should prod the server into replying with any
                completed requests. Polling will only be sent if it is enabled.
                When the server replies that one or more DEXTR requests have succeeded with labels ready,
                invoke the `dextrSuccess(labels)` method where labels is a list of `DextrLabels`, each
                of which has the following fields:
                    image_id: (same as the request) image ID (so we can check if it pertains to the current image)
                    dextr_id: (same as the request) the request ID provided by the annotator
                    regions: contours/regions that define the label, as an array of arrays of Vector2
            dextrPollingInterval: (optional, can be null) if not `null` and non-zero, this gives the interval
                at which the client side annotation tool should poll the server for replies to DEXTR requests
             */
            var self = this;
            if (DjangoLabeller._global_key_handler === undefined ||
                DjangoLabeller._global_key_handler_connected === undefined) {
                DjangoLabeller._global_key_handler = null;
                DjangoLabeller._global_key_handler_connected = false;
            }
            // Tasks
            if (tasks === null || tasks === undefined) {
                tasks = [];
            }
            self.tasks = tasks;
            // Colour schemes
            if (colour_schemes === undefined || colour_schemes === null || colour_schemes.length == 0) {
                colour_schemes = [{ name: 'default', human_name: 'Default' }];
            }
            this._current_colour_scheme = colour_schemes[0].name;
            // Configuration
            config = config || {};
            config.tools = config.tools || {};
            labelling_tool.ensure_config_option_exists(config.tools, 'imageSelector', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'labelClassSelector', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'labelClassFilter', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'labelClassFilterInitial', false);
            labelling_tool.ensure_config_option_exists(config.tools, 'brushSelect', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'drawPointLabel', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'drawBoxLabel', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'drawOrientedEllipseLabel', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'drawPolyLabel', true);
            labelling_tool.ensure_config_option_exists(config.tools, 'groupLabel', false);
            labelling_tool.ensure_config_option_exists(config.tools, 'deleteLabel', true);
            config.tools.legacy = config.tools.deleteConfig || {};
            labelling_tool.ensure_config_option_exists(config.tools.legacy, 'compositeLabel', false);
            config.tools.deleteConfig = config.tools.deleteConfig || {};
            config.tools.deleteConfig.typePermissions = config.tools.deleteConfig.typePermissions || {};
            labelling_tool.ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'point', true);
            labelling_tool.ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'box', true);
            labelling_tool.ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'oriented_ellipse', true);
            labelling_tool.ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'polygon', true);
            labelling_tool.ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'composite', true);
            labelling_tool.ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'group', true);
            config.tools.nextUnlockedConfig = config.tools.nextUnlockedConfig || {};
            labelling_tool.ensure_config_option_exists(config.tools.nextUnlockedConfig, 'numImagesLimit', 100);
            config.settings = config.settings || {};
            labelling_tool.ensure_config_option_exists(config.settings, 'inactivityTimeoutMS', 10000);
            labelling_tool.ensure_config_option_exists(config.settings, 'brushWheelRate', 0.025);
            labelling_tool.ensure_config_option_exists(config.settings, 'brushKeyRate', 2.0);
            labelling_tool.ensure_config_option_exists(config.settings, 'fullscreenButton', true);
            this._config = config;
            /*
            Entity event listener
             */
            this._entity_event_listener = {
                on_mouse_in: function (entity) {
                    if (_this._current_tool !== null) {
                        _this._current_tool.on_entity_mouse_in(entity);
                    }
                },
                on_mouse_out: function (entity) {
                    if (_this._current_tool !== null) {
                        _this._current_tool.on_entity_mouse_out(entity);
                    }
                }
            };
            /*
            Root view listener
             */
            this.root_view_listener = {
                // Selection changed; update annotation controls
                on_selection_changed: function (root_view) {
                    _this._update_annotation_controls_from_views(root_view.get_selection());
                },
                // Root list changed; queue push
                root_list_changed: function (root_view) {
                    _this._commitStopwatch();
                    _this.queue_push_label_data();
                }
            };
            // Model
            var initial_model = {
                image_id: '',
                completed_tasks: [],
                timeElapsed: 0.0,
                state: 'editable',
                labels: [],
                session_id: labelling_tool.ObjectIDTable.uuidv4(),
            };
            // Active tool
            this._current_tool = null;
            // Classes
            this.label_classes = labelling_tool.label_classes_from_json(label_classes);
            this.class_name_to_class = {};
            for (var i_1 = 0; i_1 < this.label_classes.length; i_1++) {
                this.label_classes[i_1].fill_name_to_class_table(this.class_name_to_class);
            }
            // Hide labels
            this.label_visibility = labelling_tool.LabelVisibility.FULL;
            this.label_visibility_class_filter = '__all';
            this.label_visibility_anno_filter = {};
            // Button state
            this._button_down = false;
            // List of Image descriptors
            this._images = images;
            // Number of images in dataset
            this._num_images = images.length;
            // Image dimensions
            this._image_width = 0;
            this._image_height = 0;
            // Loaded flags
            this._image_loaded = false;
            this._labels_loaded = false;
            this._image_initialised = false;
            // Stopwatch
            // Stopwatch
            this._stopwatchStart = null;
            this._stopwatchCurrent = null;
            this._stopwatchHandle = null;
            // Data request callback; labelling tool will call this when it needs a new image to show
            this._requestLabelsCallback = requestLabelsCallback;
            // Send data callback; labelling tool will call this when it wants to commit data to the backend in response
            // to user action
            this._sendLabelHeaderFn = sendLabelHeaderFn;
            // Get unlocked image IDs callback: labelling tool will call this when the user wants to move to the
            // next available image that is not locked. If it is `null` or `undefined` then the button will not
            // be displayed to the user
            this._getUnlockedImageIDCallback = getUnlockedImageIDCallback;
            // Dextr label request callback; labelling tool will call this when it needs a new image to show
            this._dextrCallback = dextrCallback;
            // Dextr pooling interval
            this._dextrPollingInterval = dextrPollingInterval;
            // Send data interval for storing interval ID for queued label send
            this._pushDataTimeout = null;
            // Frozen flag; while frozen, data will not be sent to backend
            this.frozen = false;
            this._lockableControls = $('.anno_lockable');
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
            if (config.tools.imageSelector) {
                var _increment_image_index = function (offset) {
                    var image_id = self._get_current_image_id();
                    if (image_id !== '') {
                        var index = self._image_id_to_index(image_id);
                        var new_index = index + offset;
                        new_index = Math.max(Math.min(new_index, self._images.length - 1), 0);
                        // Only trigger an image load if the index has changed and it is valid
                        if (new_index !== index && new_index < self._images.length) {
                            self.loadImage(self._images[new_index]);
                        }
                    }
                };
                var _next_unlocked_image = function () {
                    var image_id = self._get_current_image_id();
                    if (image_id !== '') {
                        var index = self._image_id_to_index(image_id);
                        var image_ids = self._image_ids(index + 1);
                        var limit = self._config.tools.nextUnlockedConfig.numImagesLimit;
                        if (image_ids.length > limit) {
                            image_ids = image_ids.slice(0, limit);
                        }
                        self._getUnlockedImageIDCallback(image_ids);
                    }
                };
                this._image_index_input = $('#image_index_input');
                this._image_index_input.on('change', function () {
                    var index_str = self._image_index_input.val();
                    var index = parseInt(index_str) - 1;
                    index = Math.max(Math.min(index, self._images.length - 1), 0);
                    if (index < self._images.length) {
                        self.loadImage(self._images[index]);
                    }
                });
                var prev_image_button = $('#btn_prev_image');
                prev_image_button.button({
                    text: false,
                    icons: { primary: "ui-icon-seek-prev" }
                }).click(function (event) {
                    _increment_image_index(-1);
                    event.preventDefault();
                });
                var next_image_button = $('#btn_next_image');
                next_image_button.button({
                    text: false,
                    icons: { primary: "ui-icon-seek-next" }
                }).click(function (event) {
                    _increment_image_index(1);
                    event.preventDefault();
                });
                if (this._getUnlockedImageIDCallback !== null && this._getUnlockedImageIDCallback !== undefined) {
                    var next_unlocked_image_button = $('#btn_next_unlocked_image');
                    next_unlocked_image_button.click(function (event) {
                        console.log('next...');
                        _next_unlocked_image();
                        event.preventDefault();
                    });
                }
            }
            else {
                this._image_index_input = null;
            }
            this._lockNotification = $('#lock_warning');
            if (config.settings.fullScreenButton) {
                // Full screen button
                var fullscreen_button = $('#btn_fullscreen');
                fullscreen_button.click(function (event) {
                    if (document.fullscreenElement) {
                        // In full screen mode
                        document.exitFullscreen();
                        fullscreen_button.children('span.oi').removeClass('oi-fullscreen-exit');
                        fullscreen_button.children('span.oi').addClass('oi-fullscreen-enter');
                    }
                    else {
                        var elem = $(event.target).closest("div.image_labeller")[0];
                        if (elem.requestFullscreen) {
                            elem.requestFullscreen();
                            fullscreen_button.children('span.oi').removeClass('oi-fullscreen-enter');
                            fullscreen_button.children('span.oi').addClass('oi-fullscreen-exit');
                        }
                    }
                    event.preventDefault();
                });
            }
            /*
             *
             * TOOL PANEL
             *
             */
            this._task_checkboxes = {};
            var _loop_1 = function (task) {
                var task_check = $('#task_' + task.name);
                var task_name = task.name;
                task_check.change(function (event, ui) {
                    self.root_view.set_task_complete(task_name, event.target.checked);
                    self.queue_push_label_data();
                });
                this_1._task_checkboxes[task.name] = task_check;
            };
            var this_1 = this;
            for (var _i = 0, tasks_1 = tasks; _i < tasks_1.length; _i++) {
                var task = tasks_1[_i];
                _loop_1(task);
            }
            //
            // LABEL CLASS SELECTOR AND HIDE LABELS
            //
            if (colour_schemes.length > 1) {
                this._colour_scheme_selector_menu = $('#colour_scheme_menu');
                this._colour_scheme_selector_menu.change(function (event, ui) {
                    self.set_current_colour_scheme(event.target.value);
                });
            }
            this.label_vis_hidden_radio = $('#label_vis_radio_hidden');
            this.label_vis_faint_radio = $('#label_vis_radio_faint');
            this.label_vis_full_radio = $('#label_vis_radio_full');
            this.label_vis_hidden_radio.change(function (event, ui) {
                if (event.target.checked) {
                    self.set_label_visibility(labelling_tool.LabelVisibility.HIDDEN);
                }
            });
            this.label_vis_faint_radio.change(function (event, ui) {
                if (event.target.checked) {
                    self.set_label_visibility(labelling_tool.LabelVisibility.FAINT);
                }
            });
            this.label_vis_full_radio.change(function (event, ui) {
                if (event.target.checked) {
                    self.set_label_visibility(labelling_tool.LabelVisibility.FULL);
                }
            });
            if (config.tools.labelClassFilter) {
                this._label_class_filter_select = $('#label_class_filter_select');
                var filter_btn = $('#label_class_filter_menu_btn');
                if (this._label_class_filter_select.length > 0) {
                    this._label_class_filter_select.change(function (event, ui) {
                        var label_filter_class = event.target.value;
                        if (label_filter_class === '__unclassified') {
                            label_filter_class = null;
                        }
                        self.set_label_vis_filter_class(label_filter_class);
                        if (label_filter_class === '__all') {
                            self._label_class_filter_notification.attr('style', 'color: #008000').text('All labels visible');
                        }
                        else {
                            self._label_class_filter_notification.attr('style', 'color: #800000').text('Some labels hidden');
                        }
                    });
                    if (config.tools.labelClassFilterInitial !== false) {
                        setTimeout(function () {
                            var label_filter_class = config.tools.labelClassFilterInitial;
                            if (label_filter_class === null) {
                                self._label_class_filter_select.val('__unclassified');
                            }
                            else {
                                self._label_class_filter_select.val(config.tools.labelClassFilterInitial);
                            }
                            self._label_class_filter_notification.attr('style', 'color: #800000').text('Some labels hidden');
                            self.set_label_vis_filter_class(label_filter_class);
                        }, 0);
                    }
                }
                else if (filter_btn.length > 0) {
                    this._label_class_filter_popup = new popup_menu.PopupMenu(filter_btn, $('#label_class_filter_menu_contents'), { placement: 'bottom' });
                    filter_btn.on('change', function (el, event) {
                        var label_filter_class = event.value;
                        if (label_filter_class === '__unclassified') {
                            label_filter_class = null;
                        }
                        self.set_label_vis_filter_class(label_filter_class);
                        if (label_filter_class === '__all') {
                            self._label_class_filter_notification.attr('style', 'color: #008000').text('All labels visible');
                        }
                        else {
                            self._label_class_filter_notification.attr('style', 'color: #800000').text('Some labels hidden');
                        }
                    });
                    if (config.tools.labelClassFilterInitial !== false) {
                        setTimeout(function () {
                            var label_filter_class = config.tools.labelClassFilterInitial;
                            if (label_filter_class === null) {
                                self._label_class_filter_popup.setChoice('__unclassified');
                            }
                            else {
                                self._label_class_filter_popup.setChoice(label_filter_class);
                            }
                            self._label_class_filter_notification.attr('style', 'color: #800000').text('Some labels hidden');
                            self.set_label_vis_filter_class(label_filter_class);
                        }, 0);
                    }
                }
            }
            // Custom annotation visibility filters
            self._anno_vis_filters = [];
            for (var _a = 0, anno_controls_json_1 = anno_controls_json; _a < anno_controls_json_1.length; _a++) {
                var anno_ctrl = anno_controls_json_1[_a];
                var vis_ctl = anno_ctrl;
                if (vis_ctl.visibility_label_text !== undefined && vis_ctl.visibility_label_text !== null) {
                    // This can affect visibility
                    var on_change = function (identifier, value) {
                        if (value === '__all') {
                            delete self.label_visibility_anno_filter[identifier];
                        }
                        else if (value === '__no_value') {
                            self.label_visibility_anno_filter[identifier] = null;
                        }
                        else {
                            self.label_visibility_anno_filter[identifier] = value;
                        }
                        self.set_label_vis_filter_anno_data(self.label_visibility_anno_filter);
                    };
                    self._anno_vis_filters.push(new labelling_tool.AnnotationVisFilter(vis_ctl, on_change));
                }
            }
            //
            // Select / annotate section
            // Pick, brush select, delete
            // Label class selector
            // Annotation controls
            //
            var select_button = $('#select_pick_button');
            select_button.click(function (event) {
                self.set_current_tool(new labelling_tool.SelectEntityTool(self.root_view));
                event.preventDefault();
            });
            if (config.tools.brushSelect) {
                var brush_select_button = $('#select_brush_button');
                brush_select_button.click(function (event) {
                    self.set_current_tool(new labelling_tool.BrushSelectEntityTool(self.root_view));
                    event.preventDefault();
                });
            }
            var canDelete = function (entity) {
                var typeName = entity.get_label_type_name();
                var delPerm = config.tools.deleteConfig.typePermissions[typeName];
                if (delPerm === undefined) {
                    return true;
                }
                else {
                    return delPerm;
                }
            };
            if (config.tools.deleteLabel) {
                this._confirm_delete = $('#confirm-delete');
                var delete_label_button = $('#delete_label_button');
                delete_label_button.click(function (event) {
                    self._confirm_delete.modal({ show: true });
                    var confirm_button = $('#btn_delete_confirm_delete');
                    confirm_button.button().click(function (event) {
                        self.root_view.delete_selection(canDelete);
                    });
                });
            }
            if (config.tools.labelClassSelector) {
                this._label_class_selector_select = $('#label_class_selector_select');
                var cls_sel_menu_btn = $('#label_class_selector_menu_btn');
                if (this._label_class_selector_select.length > 0) {
                    this._label_class_selector_select.change(function (event, ui) {
                        var label_class_name = event.target.value;
                        if (label_class_name == '__unclassified') {
                            label_class_name = null;
                        }
                        self.root_view.set_selection_label_class(label_class_name);
                    });
                }
                else if (cls_sel_menu_btn.length > 0) {
                    this._label_class_selector_popup = new popup_menu.PopupMenu(cls_sel_menu_btn, $('#label_class_selector_menu_contents'), { placement: 'bottom' });
                    cls_sel_menu_btn.on('change', function (el, event) {
                        var label_class_name = event.value;
                        if (label_class_name == '__unclassified') {
                            label_class_name = null;
                        }
                        self.root_view.set_selection_label_class(label_class_name);
                    });
                }
            }
            else {
                this._label_class_selector_select = null;
            }
            var anno_ctrl_on_change = function (identifier, value) {
                self.root_view.set_selection_anno_data_value(identifier, value);
            };
            this._anno_controls = [];
            for (var i = 0; i < anno_controls_json.length; i++) {
                var ctrl = labelling_tool.AnnotationControl.from_json(anno_controls_json[i], anno_ctrl_on_change);
                this._anno_controls.push(ctrl);
            }
            //
            // Draw section
            // Draw point, box, poly, composite, group
            //
            if (config.tools.drawPointLabel) {
                var draw_point_button = $('#draw_point_button');
                draw_point_button.button().click(function (event) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof labelling_tool.PointLabelEntity) {
                        self.set_current_tool(new labelling_tool.DrawPointTool(self.root_view, current));
                    }
                    else {
                        self.set_current_tool(new labelling_tool.DrawPointTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
            }
            if (config.tools.drawBoxLabel) {
                var draw_box_button = $('#draw_box_button');
                draw_box_button.click(function (event) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof labelling_tool.BoxLabelEntity) {
                        self.set_current_tool(new labelling_tool.DrawBoxTool(self.root_view, null));
                    }
                    else {
                        self.set_current_tool(new labelling_tool.DrawBoxTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
            }
            if (config.tools.drawOrientedEllipseLabel) {
                var draw_oriented_ellipse_button = $('#draw_oriented_ellipse_button');
                draw_oriented_ellipse_button.click(function (event) {
                    self.set_current_tool(new labelling_tool.DrawOrientedEllipseTool(self.root_view, null));
                    event.preventDefault();
                });
            }
            if (config.tools.drawPolyLabel) {
                var draw_polygon_button = $('#draw_poly_button');
                draw_polygon_button.click(function (event) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof labelling_tool.PolygonalLabelEntity) {
                        self.set_current_tool(new labelling_tool.EditPolyTool(self.root_view, current));
                    }
                    else {
                        self.set_current_tool(new labelling_tool.EditPolyTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
                var merge_button = $('#merge_poly_labels_button');
                merge_button.click(function (event) {
                    var merged_entity = labelling_tool.PolygonalLabelEntity.merge_polygonal_labels(self.root_view);
                    if (merged_entity !== null) {
                        self.root_view.select_entity(merged_entity, false, false);
                    }
                    event.preventDefault();
                });
            }
            if (dextrCallback !== null) {
                var draw_dextr_button = $('#dextr_button');
                draw_dextr_button.click(function (event) {
                    self.set_current_tool(new labelling_tool.DextrTool(self.root_view));
                    event.preventDefault();
                });
            }
            if (config.tools.groupLabel) {
                var group_button = $('#draw_group_button');
                group_button.click(function (event) {
                    var group_entity = self.root_view.create_group_label_from_selection();
                    if (group_entity !== null) {
                        self.root_view.select_entity(group_entity, false, false);
                    }
                    event.preventDefault();
                });
            }
            if (config.tools.legacy.compositeLabel) {
                var composite_button = $('#draw_composite_button');
                composite_button.button().click(function (event) {
                    self.root_view.create_composite_label_from_selection();
                    event.preventDefault();
                });
            }
            /*
             *
             * LABELLING AREA
             *
             */
            // Zoom callback
            function zoomed() {
                var zoom_event = d3.event;
                var t = zoom_event.translate, s = zoom_event.scale;
                self._zoom_xlat = t;
                self._zoom_scale = s;
                self._zoom_node.attr("transform", "translate(" + t[0] + "," + t[1] + ") scale(" + s + ")");
            }
            // Create d3.js panning and zooming behaviour
            var zoom_behaviour = d3.behavior.zoom()
                .on("zoom", zoomed);
            // Disable context menu so we can use right-click
            $('#anno_canvas_container').contextmenu(function () {
                return false;
            });
            this._svg_q = $('#anno_canvas');
            this._loading_notification_q = $('#loading_annotation');
            this._loading_notification_text = this._loading_notification_q.find('text');
            // Create SVG element of the appropriate dimensions
            this._svg = d3.select(this._svg_q[0]).call(zoom_behaviour);
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
            this.root_view = new labelling_tool.RootLabelView(initial_model, this.root_view_listener, this._entity_event_listener, this, this.world);
            //
            // Set up event handlers
            //
            // Click
            this.world.on("click", function () {
                self.notifyStopwatchChanges();
                var click_event = d3.event;
                if (click_event.button === 0) {
                    // Left click; send to tool
                    if (!click_event.altKey) {
                        if (_this._current_tool !== null) {
                            _this._current_tool.on_left_click(self.get_mouse_pos_world_space(), d3.event);
                        }
                        click_event.stopPropagation();
                    }
                }
            });
            // Button press
            this.world.on("mousedown", function () {
                self.notifyStopwatchChanges();
                var button_event = d3.event;
                if (button_event.button === 0) {
                    // Left button down
                    if (!button_event.altKey) {
                        self._button_down = true;
                        if (_this._current_tool !== null) {
                            _this._current_tool.on_button_down(self.get_mouse_pos_world_space(), d3.event);
                        }
                        button_event.stopPropagation();
                    }
                }
                else if (button_event.button === 2) {
                    // Right click; on_cancel current tool
                    if (_this._current_tool !== null) {
                        var handled = _this._current_tool.on_cancel(self.get_mouse_pos_world_space());
                        if (handled) {
                            button_event.stopPropagation();
                        }
                    }
                }
            });
            // Button press
            this.world.on("mouseup", function () {
                self.notifyStopwatchChanges();
                var button_event = d3.event;
                if (button_event.button === 0) {
                    // Left buton up
                    if (!button_event.altKey) {
                        self._button_down = false;
                        if (_this._current_tool !== null) {
                            _this._current_tool.on_button_up(self.get_mouse_pos_world_space(), d3.event);
                        }
                        button_event.stopPropagation();
                    }
                }
            });
            // Mouse on_move
            this.world.on("mousemove", function () {
                self.notifyStopwatchChanges();
                var move_event = d3.event;
                self._last_mouse_pos = self.get_mouse_pos_world_space();
                if (self._button_down) {
                    if (_this._current_tool !== null) {
                        _this._current_tool.on_drag(self._last_mouse_pos, move_event);
                    }
                    move_event.stopPropagation();
                }
                else {
                    if (!self._mouse_within) {
                        self._init_key_handlers();
                        // Entered tool area; invoke tool.on_switch_in()
                        if (_this._current_tool !== null) {
                            _this._current_tool.on_switch_in(self._last_mouse_pos);
                        }
                        self._mouse_within = true;
                    }
                    else {
                        // Send mouse on_move event to tool
                        if (_this._current_tool !== null) {
                            _this._current_tool.on_move(self._last_mouse_pos);
                        }
                    }
                }
            });
            // Mouse wheel
            this.world.on("wheel", function () {
                self.notifyStopwatchChanges();
                var wheel_event = d3.event;
                var handled = false;
                self._last_mouse_pos = self.get_mouse_pos_world_space();
                if (wheel_event.ctrlKey || wheel_event.shiftKey || wheel_event.altKey) {
                    if (_this._current_tool !== null) {
                        handled = _this._current_tool.on_wheel(self._last_mouse_pos, wheel_event.wheelDeltaX, wheel_event.wheelDeltaY);
                    }
                }
                if (handled) {
                    wheel_event.stopPropagation();
                }
            });
            var on_mouse_out = function (pos, width, height) {
                self.notifyStopwatchChanges();
                var mouse_event = d3.event;
                if (self._mouse_within) {
                    if (pos.x < 0.0 || pos.x > width || pos.y < 0.0 || pos.y > height) {
                        // The pointer is outside the bounds of the tool, as opposed to entering another element within the bounds of the tool, e.g. a polygon
                        // invoke tool.on_switch_out()
                        var handled = false;
                        if (_this._current_tool !== null) {
                            _this._current_tool.on_switch_out(self.get_mouse_pos_world_space());
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
            this._svg.on("mouseout", function () {
                on_mouse_out(_this.get_mouse_pos_screen_space(), _this._svg_q[0].clientWidth, _this._svg_q[0].clientHeight);
            });
            // Global key handler
            if (!DjangoLabeller._global_key_handler_connected) {
                d3.select("body").on("keydown", function () {
                    self.notifyStopwatchChanges();
                    if (DjangoLabeller._global_key_handler !== null) {
                        var key_event = d3.event;
                        var handled = DjangoLabeller._global_key_handler(key_event);
                        if (handled) {
                            key_event.stopPropagation();
                        }
                    }
                });
                DjangoLabeller._global_key_handler_connected = true;
            }
            // Create entities for the pre-existing labels
            if (initial_image_index < this._images.length) {
                this.loadImage(this._images[initial_image_index]);
            }
        }
        ;
        DjangoLabeller.prototype.get_settings = function () {
            return this._config.settings;
        };
        DjangoLabeller.prototype.on_key_down = function (event) {
            var handled = false;
            if (event.keyCode === 186) {
                if (this.label_visibility === labelling_tool.LabelVisibility.HIDDEN) {
                    this.set_label_visibility(labelling_tool.LabelVisibility.FULL);
                    this.label_vis_full_radio.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.label_vis_full_radio.closest('label.btn').addClass('active');
                }
                else if (this.label_visibility === labelling_tool.LabelVisibility.FAINT) {
                    this.set_label_visibility(labelling_tool.LabelVisibility.HIDDEN);
                    this.label_vis_hidden_radio.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.label_vis_hidden_radio.closest('label.btn').addClass('active');
                }
                else if (this.label_visibility === labelling_tool.LabelVisibility.FULL) {
                    this.set_label_visibility(labelling_tool.LabelVisibility.FAINT);
                    this.label_vis_faint_radio.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.label_vis_faint_radio.closest('label.btn').addClass('active');
                }
                else {
                    throw "Unknown label visibility " + this.label_visibility;
                }
                handled = true;
            }
            return handled;
        };
        ;
        DjangoLabeller.prototype._image_id_to_index = function (image_id) {
            for (var i = 0; i < this._images.length; i++) {
                if (this._images[i].image_id === image_id) {
                    return i;
                }
            }
            console.log("Image ID " + image_id + " not found");
            return 0;
        };
        ;
        DjangoLabeller.prototype._image_ids = function (from_index) {
            var image_ids = [];
            if (from_index == -1) {
                from_index = 0;
            }
            for (var i = from_index; i < this._images.length; i++) {
                image_ids.push(this._images[i].image_id);
            }
            return image_ids;
        };
        DjangoLabeller.prototype._update_image_index_input_by_id = function (image_id) {
            var image_index = this._image_id_to_index(image_id);
            if (this._image_index_input !== null) {
                this._image_index_input.val((image_index + 1).toString());
            }
        };
        ;
        DjangoLabeller.prototype._get_current_image_id = function () {
            return this.root_view.get_current_image_id();
        };
        ;
        DjangoLabeller.prototype.loadImageUrl = function (url) {
            var self = this;
            var img = new Image();
            var onload = function () {
                self._notify_image_loaded();
            };
            var onerror = function () {
                self._notify_image_error();
            };
            img.addEventListener('load', onload, false);
            img.addEventListener('error', onerror, false);
            img.src = url;
            return img;
        };
        DjangoLabeller.prototype.loadImage = function (image) {
            var self = this;
            // Update the image SVG element if the image URL is available
            if (image.img_url !== null && image.img_url !== '') {
                var img = self.loadImageUrl(image.img_url);
                this._image.attr("width", image.width + 'px');
                this._image.attr("height", image.height + 'px');
                this._image.attr('xlink:href', img.src);
                this._image_width = image.width;
                this._image_height = image.height;
                this._image_initialised = true;
            }
            else {
                this._image_initialised = false;
            }
            this.root_view.set_model({
                image_id: "",
                completed_tasks: [],
                timeElapsed: 0.0,
                state: 'editable',
                labels: [],
                session_id: labelling_tool.ObjectIDTable.uuidv4(),
            });
            this._resetStopwatch();
            for (var task_name in self._task_checkboxes) {
                var task_check = self._task_checkboxes[task_name];
                task_check.prop('checked', false);
            }
            if (this._image_index_input !== null) {
                this._image_index_input.val("");
            }
            this.set_current_tool(null);
            this._requestLabelsCallback(image.image_id);
            this._image_loaded = false;
            this._labels_loaded = false;
            this._show_loading_notification();
        };
        DjangoLabeller.prototype.loadLabels = function (label_header) {
            var self = this;
            // Update the image SVG element
            this.root_view.set_model(label_header);
            this._resetStopwatch();
            this._update_image_index_input_by_id(this.root_view.model.image_id);
            if (this.root_view.model.state === 'locked') {
                this.lockLabels();
            }
            else {
                this.unlockLabels();
            }
            for (var _i = 0, _a = self.tasks; _i < _a.length; _i++) {
                var task = _a[_i];
                var is_complete = false;
                for (var _b = 0, _c = this.root_view.model.completed_tasks; _b < _c.length; _b++) {
                    var task_name = _c[_b];
                    if (task_name === task.name) {
                        is_complete = true;
                        break;
                    }
                }
                self._task_checkboxes[task.name].prop('checked', is_complete);
            }
            this.set_current_tool(new labelling_tool.SelectEntityTool(this.root_view));
            this._labels_loaded = true;
            this._hide_loading_notification_if_ready();
        };
        ;
        DjangoLabeller.prototype.loadImageAndLabels = function (image, label_header) {
            var self = this;
            this._image_loaded = false;
            // Update the image SVG element if the image URL is available
            if (image.img_url !== null && image.img_url !== '') {
                var img = self.loadImageUrl(image.img_url);
                this._image.attr("width", image.width + 'px');
                this._image.attr("height", image.height + 'px');
                this._image.attr('xlink:href', img.src);
                this._image_width = image.width;
                this._image_height = image.height;
                this._image_initialised = true;
            }
            else {
                this._image_initialised = false;
            }
            // Update the image SVG element
            this.root_view.set_model(label_header);
            this._resetStopwatch();
            this._update_image_index_input_by_id(this.root_view.model.image_id);
            if (this.root_view.model.state === 'locked') {
                this.lockLabels();
            }
            else {
                this.unlockLabels();
            }
            for (var _i = 0, _a = self.tasks; _i < _a.length; _i++) {
                var task = _a[_i];
                var is_complete = false;
                for (var _b = 0, _c = this.root_view.model.completed_tasks; _b < _c.length; _b++) {
                    var task_name = _c[_b];
                    if (task_name === task.name) {
                        is_complete = true;
                        break;
                    }
                }
                self._task_checkboxes[task.name].prop('checked', is_complete);
            }
            this.set_current_tool(new labelling_tool.SelectEntityTool(this.root_view));
            this._image_loaded = true;
            this._labels_loaded = true;
            this._hide_loading_notification_if_ready();
        };
        ;
        DjangoLabeller.prototype.sendDextrRequest = function (request) {
            if (this._dextrCallback !== null && this._dextrCallback !== undefined) {
                this._dextrCallback({ 'request': request });
                return true;
            }
            else {
                return false;
            }
        };
        DjangoLabeller.prototype.sendDextrPoll = function (dextr_ids) {
            if (this._dextrCallback !== null && this._dextrCallback !== undefined) {
                var image_id = this._get_current_image_id();
                var poll_request = {
                    "dextr_ids": dextr_ids,
                    "image_id": image_id
                };
                this._dextrCallback({ 'poll': poll_request });
                return true;
            }
            else {
                return false;
            }
        };
        DjangoLabeller.prototype.dextrPollingInterval = function () {
            if (this._dextrPollingInterval !== null && this._dextrPollingInterval !== undefined &&
                this._dextrPollingInterval > 0) {
                return this._dextrPollingInterval;
            }
            else {
                return undefined;
            }
        };
        DjangoLabeller.prototype.dextrSuccess = function (labels) {
            for (var i = 0; i < labels.length; i++) {
                if (labels[i].image_id == this._get_current_image_id()) {
                    labelling_tool.DextrRequestState.dextr_success(labels[i].dextr_id, labels[i].regions);
                }
            }
        };
        DjangoLabeller.prototype._notify_image_loaded = function () {
            this._image_loaded = true;
            this._hide_loading_notification_if_ready();
        };
        DjangoLabeller.prototype._notify_image_error = function () {
            var src = this._image.attr('xlink:href');
            console.log("Error loading image " + src);
            this._show_loading_notification();
            this._loading_notification_text.text("Error loading " + src);
        };
        DjangoLabeller.prototype._show_loading_notification = function () {
            if (!this._svg_q.hasClass('anno_hidden')) {
                this._svg_q.addClass('anno_hidden');
            }
            this._loading_notification_q.removeClass('anno_hidden');
            this._loading_notification_text.text("Loading...");
        };
        DjangoLabeller.prototype._hide_loading_notification_if_ready = function () {
            if (this._image_loaded && this._labels_loaded) {
                this._svg_q.removeClass('anno_hidden');
                if (!this._loading_notification_q.hasClass('anno_hidden')) {
                    this._loading_notification_q.addClass('anno_hidden');
                }
            }
        };
        DjangoLabeller.prototype.goToImageById = function (image_id) {
            if (image_id !== null && image_id !== undefined) {
                // Convert to string in case we go something else
                image_id = image_id.toString();
                for (var i = 0; i < this._images.length; i++) {
                    if (this._images[i].image_id === image_id) {
                        this.loadImage(this._images[i]);
                    }
                }
            }
        };
        DjangoLabeller.prototype.notifyLabelUpdateResponse = function (msg) {
            if (msg.error === undefined) {
                // All good
            }
            else if (msg.error === 'locked') {
                // Lock controls
                this.lockLabels();
            }
        };
        DjangoLabeller.prototype.notifyStopwatchChanges = function () {
            var self = this;
            var current = new Date().getTime();
            // Start the stopwatch if its not going
            if (this._stopwatchStart === null) {
                this._stopwatchStart = current;
            }
            this._stopwatchCurrent = current;
            if (this._stopwatchHandle !== null) {
                clearTimeout(this._stopwatchHandle);
                this._stopwatchHandle = null;
            }
            this._stopwatchHandle = setTimeout(function () {
                self._onStopwatchInactivity();
            }, this._config.settings.inactivityTimeoutMS);
        };
        DjangoLabeller.prototype._onStopwatchInactivity = function () {
            if (this._stopwatchHandle !== null) {
                clearTimeout(this._stopwatchHandle);
                this._stopwatchHandle = null;
            }
            var elapsed = this._stopwatchCurrent - this._stopwatchStart;
            this._stopwatchStart = this._stopwatchCurrent = null;
            this._notifyStopwatchElapsed(elapsed);
        };
        DjangoLabeller.prototype._resetStopwatch = function () {
            this._stopwatchStart = this._stopwatchCurrent = null;
            if (this._stopwatchHandle !== null) {
                clearTimeout(this._stopwatchHandle);
                this._stopwatchHandle = null;
            }
        };
        DjangoLabeller.prototype._notifyStopwatchElapsed = function (elapsed) {
            var t = this.root_view.model.timeElapsed;
            if (t === undefined || t === null) {
                t = 0.0;
            }
            t += (elapsed * 0.001);
            this.root_view.model.timeElapsed = t;
        };
        DjangoLabeller.prototype._commitStopwatch = function () {
            if (this._stopwatchStart !== null) {
                var current = new Date().getTime();
                var elapsed = current - this._stopwatchStart;
                this._notifyStopwatchElapsed(elapsed);
                this._stopwatchStart = this._stopwatchCurrent = current;
            }
        };
        DjangoLabeller.prototype.lockLabels = function () {
            this._lockNotification.removeClass('anno_hidden');
            this._lockableControls.addClass('anno_hidden');
            this.set_current_tool(null);
        };
        DjangoLabeller.prototype.unlockLabels = function () {
            this._lockNotification.addClass('anno_hidden');
            this._lockableControls.removeClass('anno_hidden');
            this.set_current_tool(new labelling_tool.SelectEntityTool(this.root_view));
        };
        /*
        Change colour_scheme
         */
        DjangoLabeller.prototype.set_current_colour_scheme = function (name) {
            this._current_colour_scheme = name;
            this.root_view.notify_colour_scheme_changed();
        };
        /*
        Get colour for a given label class
         */
        DjangoLabeller.prototype.colour_for_label_class = function (label_class_name) {
            var label_class = this.class_name_to_class[label_class_name];
            if (label_class !== undefined) {
                return label_class.colours[this._current_colour_scheme];
            }
            else {
                // Default
                return labelling_tool.Colour4.BLACK;
            }
        };
        ;
        DjangoLabeller.prototype._update_label_class_menu = function (label_class) {
            if (label_class === null || label_class === undefined) {
                label_class = '__unclassified';
            }
            if (this._label_class_selector_popup !== null) {
                this._label_class_selector_popup.setChoice(label_class);
            }
            else if (this._label_class_selector_select !== null) {
                this._label_class_selector_select.val(label_class);
            }
        };
        ;
        DjangoLabeller.prototype._update_annotation_controls_from_views = function (selection) {
            if (selection.length === 1) {
                this._update_label_class_menu(selection[0].model.label_class);
                for (var i = 0; i < this._anno_controls.length; i++) {
                    this._anno_controls[i].update_from_anno_data(selection[0].model.anno_data, true);
                }
            }
            else {
                this._update_label_class_menu(null);
                for (var i = 0; i < this._anno_controls.length; i++) {
                    this._anno_controls[i].update_from_anno_data(null, false);
                }
            }
        };
        ;
        DjangoLabeller.prototype.get_label_class_for_new_label = function () {
            if (this.label_visibility_class_filter === '__all') {
                return null;
            }
            else if (this.label_visibility_class_filter === '__unclassified') {
                return null;
            }
            else {
                return this.label_visibility_class_filter;
            }
        };
        /*
        Set label visibility
         */
        DjangoLabeller.prototype.set_label_visibility = function (visibility) {
            this.label_visibility = visibility;
            this.root_view.set_label_visibility(this.label_visibility, this.label_visibility_class_filter, this.label_visibility_anno_filter);
        };
        DjangoLabeller.prototype.set_label_vis_filter_class = function (filter_class) {
            this.label_visibility_class_filter = filter_class;
            this.root_view.set_label_visibility(this.label_visibility, this.label_visibility_class_filter, this.label_visibility_anno_filter);
        };
        DjangoLabeller.prototype.set_label_vis_filter_anno_data = function (filter_anno_data) {
            this.label_visibility_anno_filter = filter_anno_data;
            this.root_view.set_label_visibility(this.label_visibility, this.label_visibility_class_filter, this.label_visibility_anno_filter);
        };
        DjangoLabeller.prototype.get_label_visibility = function (label_class, anno_data) {
            if (this.label_visibility_class_filter !== '__all') {
                if (label_class !== this.label_visibility_class_filter) {
                    return labelling_tool.LabelVisibility.HIDDEN;
                }
            }
            for (var key in this.label_visibility_anno_filter) {
                var filter_val = this.label_visibility_anno_filter[key];
                if (filter_val === null) {
                    // The value is null, this indicates that the anno data should *not* be set
                    if (anno_data.hasOwnProperty(key)) {
                        return labelling_tool.LabelVisibility.HIDDEN;
                    }
                }
                else {
                    if (!anno_data.hasOwnProperty(key) ||
                        (anno_data.hasOwnProperty(key) && anno_data[key].toString() !== filter_val)) {
                        return labelling_tool.LabelVisibility.HIDDEN;
                    }
                }
            }
            return this.label_visibility;
        };
        /*
        Set the current tool; switch the old one out and a new one in
         */
        DjangoLabeller.prototype.set_current_tool = function (tool) {
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
        ;
        /*
        Notify of entity deletion
         */
        DjangoLabeller.prototype.notify_entity_deleted = function (entity) {
            if (this._current_tool !== null) {
                this._current_tool.notify_entity_deleted(entity);
            }
        };
        DjangoLabeller.prototype.freeze = function () {
            this.frozen = true;
        };
        DjangoLabeller.prototype.thaw = function () {
            this.frozen = false;
        };
        DjangoLabeller.prototype.queue_push_label_data = function () {
            var _this = this;
            if (!this.frozen) {
                if (this._pushDataTimeout === null) {
                    this._pushDataTimeout = setTimeout(function () {
                        _this._pushDataTimeout = null;
                        _this._sendLabelHeaderFn(_this.root_view.model);
                    }, 0);
                }
            }
        };
        ;
        // Function for getting the current mouse position
        DjangoLabeller.prototype.get_mouse_pos_world_space = function () {
            var pos_screen = d3.mouse(this._svg[0][0]);
            return { x: (pos_screen[0] - this._zoom_xlat[0]) / this._zoom_scale,
                y: (pos_screen[1] - this._zoom_xlat[1]) / this._zoom_scale };
        };
        ;
        DjangoLabeller.prototype.get_mouse_pos_screen_space = function () {
            var pos = d3.mouse(this._svg[0][0]);
            return { x: pos[0], y: pos[1] };
        };
        ;
        DjangoLabeller.prototype._init_key_handlers = function () {
            var self = this;
            var on_key_down = function (event) {
                return self._overall_on_key_down(event);
            };
            DjangoLabeller._global_key_handler = on_key_down;
        };
        ;
        DjangoLabeller.prototype._shutdown_key_handlers = function () {
            DjangoLabeller._global_key_handler = null;
        };
        ;
        DjangoLabeller.prototype._overall_on_key_down = function (event) {
            if (this._mouse_within) {
                var handled = false;
                if (this._current_tool !== null) {
                    handled = this._current_tool.on_key_down(event);
                }
                if (!handled) {
                    handled = this.on_key_down(event);
                }
                return handled;
            }
            else {
                return false;
            }
        };
        return DjangoLabeller;
    }());
    labelling_tool.DjangoLabeller = DjangoLabeller;
})(labelling_tool || (labelling_tool = {}));
//# sourceMappingURL=main_labeller.js.map