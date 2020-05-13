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
/// <reference path="./polygonal_label.ts" />
/// <reference path="./dextr_label.ts" />
/// <reference path="./composite_label.ts" />
/// <reference path="./group_label.ts" />
/// <reference path="./popup_menu.ts" />
/// <reference path="./anno_controls.ts" />

module labelling_tool {
    /*
    Image model
     */
    export interface ImageModel {
        image_id: string,
        img_url: string,
        width: number,
        height: number
    }

    /*
    Label header model

    This is the model that gets send back and forth between the frontend and the backend.
    It combines:
    - an array of labels
    - an image ID that identifies the image to which the labels belong
    - a complete flag that indicates if the image is done
     */

    export interface LabelHeaderModel {
        image_id: string,
        complete: boolean,
        timeElapsed: number,
        state: string,
        labels: any[],
    }

    export var get_label_header_labels = function(label_header: LabelHeaderModel) {
        var labels = label_header.labels;
        if (labels === undefined || labels === null) {
            return [];
        }
        else {
            return labels;
        }
    };

    export var replace_label_header_labels = function(label_header: LabelHeaderModel, labels: any[]): LabelHeaderModel {
        return {image_id: label_header.image_id,
                complete: label_header.complete,
                timeElapsed: label_header.timeElapsed,
                state: label_header.state,
                labels: labels};
    };

    /*
    DEXTR labels
     */
    export interface DextrLabels {
        image_id: string,
        dextr_id: number,
        regions: Vector2[][],
    }



     /*
    Labelling tool view; links to the server side data structures
     */
    export class DjangoAnnotator {
        static _global_key_handler: any;
        static _global_key_handler_connected: boolean;

        private _config: any;
        private _entity_event_listener: LabelEntityEventListener;
        private root_view: RootLabelView;
        private root_view_listener: RootLabelViewListener;
        private _current_tool: AbstractTool;
        private _current_colour_scheme: string;
        private label_classes: AbstractLabelClass[];
        private class_name_to_class: {[class_name: string]: LabelClass};
        label_visibility: LabelVisibility;
        label_visibility_class_filter: string;
        private _button_down: boolean;
        private _mouse_within: boolean;
        private _last_mouse_pos: Vector2;
        private _image_width: number;
        private _image_height: number;
        private _images: ImageModel[];
        private _num_images: number;
        private _requestLabelsCallback: any;
        private _sendLabelHeaderFn: any;
        private _getNextUnlockedImageIDCallback: any;
        private _dextrCallback: any;
        private _dextrPollingInterval: number;
        private _image_initialised: boolean;
        private _image_loaded: boolean;
        private _labels_loaded: boolean;
        private _stopwatchStart: number;
        private _stopwatchCurrent: number;
        private _stopwatchHandle: any;


        private _pushDataTimeout: any;
        private frozen: boolean;

        private _colour_scheme_selector_menu: JQuery;
        private _label_class_selector_select: JQuery = null;
        private _label_class_selector_popup: popup_menu.PopupMenu = null;
        private label_vis_hidden_radio: JQuery;
        private label_vis_faint_radio: JQuery;
        private label_vis_full_radio: JQuery;
        private _label_class_filter_select: JQuery = null;
        private _label_class_filter_popup: popup_menu.PopupMenu = null;
        private _label_class_filter_notification: JQuery;
        private _anno_controls: AnnotationControl[];
        private _confirm_delete: JQuery;
        private _svg: d3.Selection<any>;
        private _svg_q: JQuery;
        private _loading_notification_q: JQuery;
        private _loading_notification_text: JQuery;
        world: any;
        private _image: d3.Selection<any>;
        private _image_index_input: JQuery;
        private _complete_checkbox: JQuery;

        private _zoom_node: d3.Selection<any>;
        private _zoom_xlat: number[];
        private _zoom_scale: number;

        private _lockableControls: JQuery;
        private _lockNotification: JQuery;






        constructor(label_classes: LabelClassJSON[], colour_schemes: ColourSchemeJSON[],
                    anno_controls_json: AnnoControlJSON[],
                    images: ImageModel[], initial_image_index: number,
                    requestLabelsCallback: any, sendLabelHeaderFn: any,
                    getNextUnlockedImageIDCallback: any, dextrCallback: any, dextrPollingInterval: number,
                    config: any) {
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
            getNextUnlockedImageIDCallback: (optional, can be null) a function of the form
                `function(current_image_id)` that the annotator uses to asynchronously request the ID of the next
                available unlocked image. When the image ID become available (e.g. when the HTTP request succeeds),
                give it to the annotator by invoking the `goToImageById(next_unlocked_image_id)` method.
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
            let self = this;

            if (DjangoAnnotator._global_key_handler === undefined ||
                    DjangoAnnotator._global_key_handler_connected === undefined) {
                DjangoAnnotator._global_key_handler = null;
                DjangoAnnotator._global_key_handler_connected = false;
            }

            config = config || {};

            config.tools = config.tools || {};
            ensure_config_option_exists(config.tools, 'imageSelector', true);
            ensure_config_option_exists(config.tools, 'labelClassSelector', true);
            ensure_config_option_exists(config.tools, 'labelClassFilter', true);
            ensure_config_option_exists(config.tools, 'labelClassFilterInitial', false);
            ensure_config_option_exists(config.tools, 'brushSelect', true);
            ensure_config_option_exists(config.tools, 'drawPointLabel', true);
            ensure_config_option_exists(config.tools, 'drawBoxLabel', true);
            ensure_config_option_exists(config.tools, 'drawPolyLabel', true);
            ensure_config_option_exists(config.tools, 'compositeLabel', false);
            ensure_config_option_exists(config.tools, 'groupLabel', false);
            ensure_config_option_exists(config.tools, 'deleteLabel', true);

            ensure_config_option_exists(config.tools, 'colour_schemes',
                            [{name: 'default', human_name: 'Default'}]);

            if (colour_schemes === undefined || colour_schemes === null || colour_schemes.length == 0) {
                colour_schemes = [{name: 'default', human_name: 'Default'}];
            }

            this._current_colour_scheme = colour_schemes[0].name;

            config.settings = config.settings || {};
            ensure_config_option_exists(config.settings, 'inactivityTimeoutMS', 10000);

            config.tools.deleteConfig = config.tools.deleteConfig || {};
            config.tools.deleteConfig.typePermissions = config.tools.deleteConfig.typePermissions || {};
            ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'point', true);
            ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'box', true);
            ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'polygon', true);
            ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'composite', true);
            ensure_config_option_exists(config.tools.deleteConfig.typePermissions, 'group', true);

            this._config = config;

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
                // Selection changed; update annotation controls
                on_selection_changed: (root_view: RootLabelView): void => {
                    this._update_annotation_controls_from_views(root_view.get_selection());
                },
                // Root list changed; queue push
                root_list_changed: (root_view: RootLabelView): void => {
                    this._commitStopwatch();
                    this.queue_push_label_data();
                }
            };


            // Model
            var initial_model: LabelHeaderModel = {
                image_id: '',
                complete: false,
                timeElapsed: 0.0,
                state: 'editable',
                labels: []
            };
            // Active tool
            this._current_tool = null;
            // Classes
            this.label_classes = label_classes_from_json(label_classes);
            this.class_name_to_class = {};
            for (let i = 0; i < this.label_classes.length; i++) {
                this.label_classes[i].fill_name_to_class_table(this.class_name_to_class);
            }
            // Hide labels
            this.label_visibility = LabelVisibility.FULL;
            this.label_visibility_class_filter = '__all';
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
            this._getNextUnlockedImageIDCallback = getNextUnlockedImageIDCallback;
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
                var _increment_image_index = function (offset: number) {
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

                var _next_unlocked_image = function() {
                    var image_id = self._get_current_image_id();
                    if (image_id !== '') {
                        self._getNextUnlockedImageIDCallback(image_id);
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


                var prev_image_button: any = $('#btn_prev_image');
                prev_image_button.button({
                    text: false,
                    icons: {primary: "ui-icon-seek-prev"}
                }).click(function (event: any) {
                    _increment_image_index(-1);
                    event.preventDefault();
                });

                var next_image_button: any = $('#btn_next_image');
                next_image_button.button({
                    text: false,
                    icons: {primary: "ui-icon-seek-next"}
                }).click(function (event: any) {
                    _increment_image_index(1);
                    event.preventDefault();
                });

                if (this._getNextUnlockedImageIDCallback !== null && this._getNextUnlockedImageIDCallback !== undefined) {
                    var next_unlocked_image_button: any = $('#btn_next_unlocked_image');
                    next_unlocked_image_button.click(function (event: any) {
                        console.log('next...');
                        _next_unlocked_image();
                        event.preventDefault();
                    });
                }
            }

            this._lockNotification = $('#lock_warning');


            // Full screen button
            var fullscreen_button = $('#btn_fullscreen');

            fullscreen_button.click(function (event: any) {
                if (document.fullscreenElement) {
                    // In full screen mode
                    document.exitFullscreen();
                    fullscreen_button.children('span.oi').removeClass('oi-fullscreen-exit');
                    fullscreen_button.children('span.oi').addClass('oi-fullscreen-enter');
                }
                else {
                    var elem = $(event.target).closest("div.image_annotator")[0];
                    if (elem.requestFullscreen) {
                        elem.requestFullscreen();
                    fullscreen_button.children('span.oi').removeClass('oi-fullscreen-enter');
                    fullscreen_button.children('span.oi').addClass('oi-fullscreen-exit');
                    }
                }
                event.preventDefault();
            });



           /*
            *
            * TOOL PANEL
            *
            */

            this._complete_checkbox = $('#task_finished');
            this._complete_checkbox.change(function(event, ui) {
                self.root_view.set_complete((event.target as any).checked);
                self.queue_push_label_data();
            });




            //
            // LABEL CLASS SELECTOR AND HIDE LABELS
            //

            if (colour_schemes.length > 1) {
                this._colour_scheme_selector_menu = $('#colour_scheme_menu');
                this._colour_scheme_selector_menu.change(function (event, ui) {
                    self.set_current_colour_scheme((event.target as any).value);
                });
            }

            this.label_vis_hidden_radio = $('#label_vis_radio_hidden');
            this.label_vis_faint_radio = $('#label_vis_radio_faint');
            this.label_vis_full_radio = $('#label_vis_radio_full');
            this.label_vis_hidden_radio.change(function(event: any, ui: any) {
                if (event.target.checked) {
                    self.set_label_visibility(LabelVisibility.HIDDEN, self.label_visibility_class_filter);
                }
            });
            this.label_vis_faint_radio.change(function(event: any, ui: any) {
                if (event.target.checked) {
                    self.set_label_visibility(LabelVisibility.FAINT, self.label_visibility_class_filter);
                }
            });
            this.label_vis_full_radio.change(function(event: any, ui: any) {
                if (event.target.checked) {
                    self.set_label_visibility(LabelVisibility.FULL, self.label_visibility_class_filter);
                }
            });

            if (config.tools.labelClassFilter) {
                this._label_class_filter_select = $('#label_class_filter_select');
                let filter_btn = $('#label_class_filter_menu_btn');

                if (this._label_class_filter_select.length > 0) {
                    this._label_class_filter_select.change(function (event, ui) {
                        var label_filter_class = (event.target as any).value;
                        if (label_filter_class === '__unclassified') {
                            label_filter_class = null;
                        }
                        self.set_label_visibility(self.label_visibility, label_filter_class);

                        if (label_filter_class === '__all') {
                            self._label_class_filter_notification.attr('style', 'color: #008000').text(
                                'All labels visible');
                        }
                        else {
                            self._label_class_filter_notification.attr('style', 'color: #800000').text(
                                'Some labels hidden');
                        }
                    });

                    if (config.tools.labelClassFilterInitial !== false) {
                        setTimeout(function() {
                            var label_filter_class = config.tools.labelClassFilterInitial;
                            if (label_filter_class === null) {
                                self._label_class_filter_select.val('__unclassified');
                            }
                            else {
                                self._label_class_filter_select.val(config.tools.labelClassFilterInitial);
                            }
                            self._label_class_filter_notification.attr('style', 'color: #800000').text(
                                'Some labels hidden');
                            self.set_label_visibility(self.label_visibility, label_filter_class);
                        }, 0);
                    }
                }
                else if (filter_btn.length > 0) {
                    this._label_class_filter_popup = new popup_menu.PopupMenu(
                        filter_btn,
                        $('#label_class_filter_menu_contents'),
                        {placement: 'bottom'});

                    filter_btn.on('change', function (el, event: any) {
                        var label_filter_class = event.value;
                        if (label_filter_class === '__unclassified') {
                            label_filter_class = null;
                        }
                        self.set_label_visibility(self.label_visibility, label_filter_class);

                        if (label_filter_class === '__all') {
                            self._label_class_filter_notification.attr('style', 'color: #008000').text(
                                'All labels visible');
                        }
                        else {
                            self._label_class_filter_notification.attr('style', 'color: #800000').text(
                                'Some labels hidden');
                        }
                    });

                    if (config.tools.labelClassFilterInitial !== false) {
                        setTimeout(function() {
                            var label_filter_class = config.tools.labelClassFilterInitial;
                            if (label_filter_class === null) {
                                self._label_class_filter_popup.setChoice('__unclassified');
                            }
                            else {
                                self._label_class_filter_popup.setChoice(label_filter_class);
                            }
                            self._label_class_filter_notification.attr('style', 'color: #800000').text(
                                'Some labels hidden');
                            self.set_label_visibility(self.label_visibility, label_filter_class);
                        }, 0);
                    }
                }
            }





            //
            // Select / annotate section
            // Pick, brush select, delete
            // Label class selector
            // Annotation controls
            //

            var select_button: any = $('#select_pick_button');
            select_button.click(function(event: any) {
                self.set_current_tool(new SelectEntityTool(self.root_view));
                event.preventDefault();
            });

            if (config.tools.brushSelect) {
                var brush_select_button: any = $('#select_brush_button');
                brush_select_button.click(function (event: any) {
                    self.set_current_tool(new BrushSelectEntityTool(self.root_view));
                    event.preventDefault();
                });
            }

            var canDelete = function(entity: AbstractLabelEntity<AbstractLabelModel>) {
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
                var delete_label_button: any = $('#delete_label_button');
                delete_label_button.click(function (event: any) {
                    self._confirm_delete.modal({show: true});
                    var confirm_button: any = $('#btn_delete_confirm_delete');

                    confirm_button.button().click(function (event: any) {
                        self.root_view.delete_selection(canDelete);
                    });
                });
            }

            if (config.tools.labelClassSelector) {
                this._label_class_selector_select = $('#label_class_selector_select');
                let cls_sel_menu_btn: JQuery = $('#label_class_selector_menu_btn');

                if (this._label_class_selector_select.length > 0) {
                    this._label_class_selector_select.change(function (event, ui) {
                        var label_class_name = (event.target as any).value;
                        if (label_class_name == '__unclassified') {
                            label_class_name = null;
                        }
                        self.root_view.set_selection_label_class(label_class_name);
                    });
                }
                else if (cls_sel_menu_btn.length > 0 ){
                    this._label_class_selector_popup = new popup_menu.PopupMenu(
                        cls_sel_menu_btn,
                        $('#label_class_selector_menu_contents'),
                        {placement: 'bottom'});

                    cls_sel_menu_btn.on('change',function (el, event: any) {
                        var label_class_name = event.value;
                        if (label_class_name == '__unclassified') {
                            label_class_name = null;
                        }
                        self.root_view.set_selection_label_class(label_class_name);
                    });
                }
            }

            let anno_ctrl_on_change = function(identifier, value) {
                console.log("DjangoAnnotator: setting " + identifier + " to " + value);
                self.root_view.set_selection_anno_data_value(identifier, value);
            };

            this._anno_controls = [];
            for (var i = 0; i < anno_controls_json.length; i++) {
                let ctrl = AnnotationControl.from_json(anno_controls_json[i], anno_ctrl_on_change);
                this._anno_controls.push(ctrl);
            }



            //
            // Draw section
            // Draw point, box, poly, composite, group
            //

            if (config.tools.drawPointLabel) {
                var draw_point_button: any = $('#draw_point_button');
                draw_point_button.button().click(function (event: any) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof PointLabelEntity) {
                        self.set_current_tool(new DrawPointTool(self.root_view, current));
                    }
                    else {
                        self.set_current_tool(new DrawPointTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
            }

            if (config.tools.drawBoxLabel) {
                var draw_box_button: any = $('#draw_box_button');
                draw_box_button.click(function (event: any) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof BoxLabelEntity) {
                        self.set_current_tool(new DrawBoxTool(self.root_view, current));
                    }
                    else {
                        self.set_current_tool(new DrawBoxTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
            }

            if (config.tools.drawPolyLabel) {
                var draw_polygon_button: any = $('#draw_poly_button');
                draw_polygon_button.click(function (event: any) {
                    var current = self.root_view.get_selected_entity();
                    if (current instanceof PolygonalLabelEntity) {
                        self.set_current_tool(new EditPolyTool(self.root_view, current));
                    }
                    else {
                        self.set_current_tool(new EditPolyTool(self.root_view, null));
                    }
                    event.preventDefault();
                });
                var merge_button: any = $('#merge_poly_labels_button');
                merge_button.click(function (event: any) {
                    var merged_entity = PolygonalLabelEntity.merge_polygonal_labels(self.root_view);

                    if (merged_entity !== null) {
                        self.root_view.select_entity(merged_entity, false, false);
                    }

                    event.preventDefault();
                });
            }

            if (dextrCallback !== null) {
                var draw_dextr_button: any = $('#dextr_button');
                draw_dextr_button.click(function (event: any) {
                    self.set_current_tool(new DextrTool(self.root_view));
                    event.preventDefault();
                });
            }

            if (config.tools.groupLabel) {
                var group_button: any = $('#draw_group_button');
                group_button.click(function (event: any) {
                    var group_entity = self.root_view.create_group_label_from_selection();

                    if (group_entity !== null) {
                        self.root_view.select_entity(group_entity, false, false);
                    }

                    event.preventDefault();
                });
            }

            if (config.tools.compositeLabel) {
                var composite_button: any = $('#draw_composite_button');
                composite_button.button().click(function (event: any) {
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
            $('#anno_canvas_container').contextmenu(function() {
                return false
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
            this.root_view = new RootLabelView(initial_model, this.root_view_listener,
                this._entity_event_listener, this, this.world);


            //
            // Set up event handlers
            //

            // Click
            this.world.on("click", () => {
                self.notifyStopwatchChanges();
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
                self.notifyStopwatchChanges();
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
                self.notifyStopwatchChanges();
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
                self.notifyStopwatchChanges();
                var move_event: any = d3.event;
                self._last_mouse_pos = self.get_mouse_pos_world_space();
                if (self._button_down) {
                    if (this._current_tool !== null) {
                        this._current_tool.on_drag(self._last_mouse_pos, move_event);
                    }
                    move_event.stopPropagation();
                }
                else {
                    if (!self._mouse_within) {
                        self._init_key_handlers();

                        // Entered tool area; invoke tool.on_switch_in()
                        if (this._current_tool !== null) {
                            this._current_tool.on_switch_in(self._last_mouse_pos);
                        }

                        self._mouse_within = true;
                    }
                    else {
                        // Send mouse on_move event to tool
                        if (this._current_tool !== null) {
                            this._current_tool.on_move(self._last_mouse_pos);
                        }
                    }
                }
            });

            // Mouse wheel
            this.world.on("mousewheel", () => {
                self.notifyStopwatchChanges();
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


            var on_mouse_out = (pos: Vector2, width: number, height: number) => {
                self.notifyStopwatchChanges();
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
                on_mouse_out(this.get_mouse_pos_screen_space(), this._svg_q[0].clientWidth, this._svg_q[0].clientHeight);
            });


            // Global key handler
            if (!DjangoAnnotator._global_key_handler_connected) {
                d3.select("body").on("keydown", function () {
                    self.notifyStopwatchChanges();
                    if (DjangoAnnotator._global_key_handler !== null) {
                        var key_event: any = d3.event;
                        var handled = DjangoAnnotator._global_key_handler(key_event);
                        if (handled) {
                            key_event.stopPropagation();
                        }
                    }
                });
                DjangoAnnotator._global_key_handler_connected = true;
            }


            // Create entities for the pre-existing labels
            if (initial_image_index < this._images.length) {
                this.loadImage(this._images[initial_image_index]);
            }
        };


        on_key_down(event: any): boolean {
            var handled = false;
            if (event.keyCode === 186) {
                if (this.label_visibility === LabelVisibility.HIDDEN) {
                    this.set_label_visibility(LabelVisibility.FULL, this.label_visibility_class_filter);
                    this.label_vis_full_radio.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.label_vis_full_radio.closest('label.btn').addClass('active');
                }
                else if (this.label_visibility === LabelVisibility.FAINT) {
                    this.set_label_visibility(LabelVisibility.HIDDEN, this.label_visibility_class_filter);
                    this.label_vis_hidden_radio.closest('div.btn-group').find('label.btn').removeClass('active');
                    this.label_vis_hidden_radio.closest('label.btn').addClass('active');
                }
                else if (this.label_visibility === LabelVisibility.FULL) {
                    this.set_label_visibility(LabelVisibility.FAINT, this.label_visibility_class_filter);
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

        _image_id_to_index(image_id: string) {
            for (var i = 0; i < this._images.length; i++) {
                if (this._images[i].image_id === image_id) {
                    return i;
                }
            }
            console.log("Image ID " + image_id + " not found");
            return 0;
        };

        _update_image_index_input_by_id(image_id: string) {
            var image_index = this._image_id_to_index(image_id);

            this._image_index_input.val((image_index+1).toString());
        };

        _get_current_image_id(): string {
            return this.root_view.get_current_image_id();
        };

        loadImageUrl(url: string): any {
            var self = this;
            var img = new Image();
            var onload = function() {
                self._notify_image_loaded();
            };
            var onerror = function() {
                self._notify_image_error();
            };
            img.addEventListener('load', onload, false);
            img.addEventListener('error', onerror, false);
            img.src = url;
            return img;
        }

        loadImage(image: ImageModel) {
            var self = this;

            // Update the image SVG element if the image URL is available
            if (image.img_url !== null) {
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
                complete: false,
                timeElapsed: 0.0,
                state: 'editable',
                labels: []
            });
            this._resetStopwatch();
            (this._complete_checkbox[0] as any).checked = false;
            this._image_index_input.val("");
            this.set_current_tool(null);

            this._requestLabelsCallback(image.image_id);

            this._image_loaded = false;
            this._labels_loaded = false;
            this._show_loading_notification();
        }

        loadLabels(label_header: LabelHeaderModel, image: ImageModel) {
            var self = this;
            if (!this._image_initialised) {
                if (image !== null && image !== undefined) {
                    var img = self.loadImageUrl(image.img_url);
                    this._image.attr("width", image.width + 'px');
                    this._image.attr("height", image.height + 'px');
                    this._image.attr('xlink:href', img.src);
                    this._image_width = image.width;
                    this._image_height = image.height;
                    this._image_initialised = true;
                }
                else {
                    console.log("Labelling tool: Image URL was unavailable to loadImage and has not been " +
                                "provided by loadLabels");
                }
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

            (this._complete_checkbox[0] as any).checked = this.root_view.model.complete;
            this.set_current_tool(new SelectEntityTool(this.root_view));

            this._labels_loaded = true;
            this._hide_loading_notification_if_ready();
        };

        sendDextrRequest(request: DextrRequest): boolean {
            if (this._dextrCallback !== null  &&  this._dextrCallback !== undefined) {
                this._dextrCallback({'request': request});
                return true;
            }
            else {
                return false;
            }
        }

        sendDextrPoll(dextr_ids: number[]): boolean {
            if (this._dextrCallback !== null  &&  this._dextrCallback !== undefined) {
                let image_id = this._get_current_image_id();
                let poll_request = {
                    "dextr_ids": dextr_ids,
                    "image_id": image_id
                };
                this._dextrCallback({'poll': poll_request});
                return true;
            }
            else {
                return false;
            }
        }

        dextrPollingInterval(): number {
            if (this._dextrPollingInterval !== null && this._dextrPollingInterval !== undefined &&
                    this._dextrPollingInterval > 0) {
                return this._dextrPollingInterval;
            }
            else {
                return undefined;
            }
        }

        dextrSuccess(labels: DextrLabels[]) {
            for (var i = 0; i < labels.length; i++) {
                if (labels[i].image_id == this._get_current_image_id()) {
                    DextrRequestState.dextr_success(labels[i].dextr_id, labels[i].regions);
                }
            }
        }

        _notify_image_loaded() {
            this._image_loaded = true;
            this._hide_loading_notification_if_ready();
        }

        _notify_image_error() {
            var src = this._image.attr('xlink:href');
            console.log("Error loading image " + src);
            this._show_loading_notification();
            this._loading_notification_text.text("Error loading " + src);
        }

        _show_loading_notification() {
            this._svg_q.addClass('anno_hidden');
            this._loading_notification_q.removeClass('anno_hidden');
            this._loading_notification_text.text("Loading...");
        }

        _hide_loading_notification_if_ready() {
            if (this._image_loaded && this._labels_loaded) {
                this._svg_q.removeClass('anno_hidden');
                this._loading_notification_q.addClass('anno_hidden');
            }
        }

        goToImageById(image_id: any) {
            if (image_id !== null && image_id !== undefined) {
                // Convert to string in case we go something else
                image_id = image_id.toString();
                for (var i = 0; i < this._images.length; i++) {
                    if (this._images[i].image_id === image_id) {
                        this.loadImage(this._images[i]);
                    }
                }
            }
        }

        notifyLabelUpdateResponse(msg: any) {
            if (msg.error === undefined) {
                // All good
            }
            else if (msg.error === 'locked') {
                // Lock controls
                this.lockLabels();
            }
        }

        notifyStopwatchChanges() {
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
            this._stopwatchHandle = setTimeout(function() {
                self._onStopwatchInactivity();
            }, this._config.settings.inactivityTimeoutMS);
        }

        _onStopwatchInactivity() {
            if (this._stopwatchHandle !== null) {
                clearTimeout(this._stopwatchHandle);
                this._stopwatchHandle = null;
            }

            var elapsed: number = this._stopwatchCurrent - this._stopwatchStart;
            this._stopwatchStart = this._stopwatchCurrent = null;
            this._notifyStopwatchElapsed(elapsed);
        }

        _resetStopwatch() {
            this._stopwatchStart = this._stopwatchCurrent = null;

            if (this._stopwatchHandle !== null) {
                clearTimeout(this._stopwatchHandle);
                this._stopwatchHandle = null;
            }
        }

        _notifyStopwatchElapsed(elapsed: number) {
            var t = this.root_view.model.timeElapsed;
            if (t === undefined || t === null) {
                t = 0.0;
            }
            t += (elapsed * 0.001);
            this.root_view.model.timeElapsed = t;
        }

        _commitStopwatch() {
            if (this._stopwatchStart !== null) {
                var current = new Date().getTime();
                var elapsed = current - this._stopwatchStart;
                this._notifyStopwatchElapsed(elapsed);
                this._stopwatchStart = this._stopwatchCurrent = current;
            }
        }


        lockLabels() {
            this._lockNotification.removeClass('anno_hidden');
            this._lockableControls.addClass('anno_hidden');
            this.set_current_tool(null);
        }

        unlockLabels() {
            this._lockNotification.addClass('anno_hidden');
            this._lockableControls.removeClass('anno_hidden');
            this.set_current_tool(new SelectEntityTool(this.root_view));
        }



        /*
        Change colour_scheme
         */
        set_current_colour_scheme(name: string) {
            this._current_colour_scheme = name;
            this.root_view.notify_colour_scheme_changed();
        }



        /*
        Get colour for a given label class
         */
        colour_for_label_class(label_class_name: string): Colour4 {
            let label_class: LabelClass = this.class_name_to_class[label_class_name];
            if (label_class !== undefined) {
                return label_class.colours[this._current_colour_scheme];
            }
            else {
                // Default
                return Colour4.BLACK;
            }
        };

        _update_label_class_menu(label_class: string) {
            if (label_class === null || label_class === undefined) {
                label_class = '__unclassified';
            }

            if (this._label_class_selector_popup !== null) {
                this._label_class_selector_popup.setChoice(label_class);
            }
            else {
                this._label_class_selector_select.val(label_class);
            }
        };

        _update_annotation_controls_from_views(selection: AbstractLabelEntity<AbstractLabelModel>[]) {
            if (selection.length === 1) {
                this._update_label_class_menu(selection[0].model.label_class);
                for (var i = 0; i < this._anno_controls.length; i++) {
                    this._anno_controls[i].update_from_anno_data(selection[0].model.anno_data);
                }
            }
            else {
                this._update_label_class_menu(null);
                for (var i = 0; i < this._anno_controls.length; i++) {
                    this._anno_controls[i].update_from_anno_data(null);
                }
            }
        };

        get_label_class_for_new_label(): string {
            if (this.label_visibility_class_filter === '__all') {
                return null;
            }
            else if (this.label_visibility_class_filter === '__unclassified') {
                return null;
            }
            else {
                return this.label_visibility_class_filter;
            }
        }


        /*
        Set label visibility
         */
        set_label_visibility(visibility: LabelVisibility, filter_class: string) {
            this.label_visibility = visibility;
            this.label_visibility_class_filter = filter_class;
            this.root_view.set_label_visibility(visibility, filter_class);
        }

        get_label_visibility(label_class: string): LabelVisibility {
            var vis: LabelVisibility = this.label_visibility;
            if (this.label_visibility_class_filter !== '__all') {
                if (label_class !== this.label_visibility_class_filter) {
                    vis = LabelVisibility.HIDDEN;
                }
            }
            return vis;
        }



        /*
        Set the current tool; switch the old one out and a new one in
         */
        set_current_tool(tool: AbstractTool) {
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


        /*
        Notify of entity deletion
         */
        notify_entity_deleted(entity: AbstractLabelEntity<AbstractLabelModel>) {
            if (this._current_tool !== null) {
                this._current_tool.notify_entity_deleted(entity);
            }
        }


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
                return self._overall_on_key_down(event);
            };
            DjangoAnnotator._global_key_handler = on_key_down;
        };

        _shutdown_key_handlers() {
            DjangoAnnotator._global_key_handler = null;
        };

        _overall_on_key_down(event: any): boolean {
            if (this._mouse_within) {
                var handled: boolean = false;
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
        }
    }
}


