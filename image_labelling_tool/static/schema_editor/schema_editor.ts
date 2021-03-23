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
/// <reference path="../jquery.d.ts" />
/// <reference path="../labelling_tool/object_id_table.ts" />

declare var Vue: any;
declare var vuedraggable: any;

module schema_editor {
    type ResponseCallback = (any) => void;

    interface MessageWithCallback {
        message: any;
        on_response: ResponseCallback;
    }


    export class SchemaEditor {
        // We put updates in a queue that we can send
        private update_timeout_id: number = null;

        private update_url: string;

        private app: any = null;

        private get_schema: () => any = null;


        /**
         * Constructor
         * @param update_url - the URL to which updates should be sent via POST request
         * @param schema_js - JSON representation of the schema to be edited
         */
        constructor(update_url: string, schema_js: any) {
            let self = this;

            this.update_url = update_url;

            const RootComponent = {
                el: '#schema_editor',
                data() {
                    return {
                        schema: schema_js
                    }
                },
                created: function() {
                    let component = this;
                    self.get_schema = function(): any {
                        return component.schema;
                    }
                }
            };

            self.app = Vue.createApp(RootComponent);

            // Register draggable component so we can use it in the templates
            self.app.component('draggable', vuedraggable);

            // Update mixin
            self.app.mixin({
                methods: {
                    queue_send_schema_update: function() {
                        self.enqueue_update_schema(2000);
                    },
                    send_create_colour_scheme: function(colour_scheme) {
                        self.send_create_colour_scheme(colour_scheme);
                    },
                    send_delete_colour_scheme: function(colour_scheme) {
                        self.send_delete_colour_scheme(colour_scheme);
                    },
                    send_create_group: function(group) {
                        self.send_create_group(group);
                    },
                    send_delete_group: function(group) {
                        self.send_delete_group(group);
                    },
                    send_create_label_class: function(label_class, containing_group) {
                        self.send_create_label_class(label_class, containing_group);
                    },
                    send_delete_label_class: function(label_class, containing_group) {
                        self.send_delete_label_class(label_class, containing_group);
                    },
                }
            });

            /*
            Colour schemes component
             */
            self.app.component('colour-schemes', {
                template: '#colour_schemes_template',
                props: {
                    schema: Object,
                },
                data: function() {
                    return {
                        'show_new_form': false,
                        'new_form_data': {
                            'name': '',
                            'human_name': ''
                        }
                    };
                },
                methods: {
                    on_new: function() {
                        this.show_new_form = true;
                    },
                    on_cancel_new: function() {
                        this.show_new_form = false;
                    },
                    on_create_new: function() {
                        if (this.new_form_data.name !== '') {
                            var scheme = {
                                id: labelling_tool.ObjectIDTable.uuidv4(),
                                name: this.new_form_data.name,
                                human_name: this.new_form_data.human_name
                            };
                            this.send_create_colour_scheme(scheme);
                            this.schema.colour_schemes.push(scheme);
                            this.new_form_data.name = '';
                            this.new_form_data.human_name = '';
                        }
                        this.show_new_form = false;
                    },
                    open_delete_modal: function(col_scheme) {
                        let component = this;
                        SchemaEditor.confirm_deletion('colour scheme', col_scheme.human_name, function() {
                            for (var i = 0; i < component.schema.colour_schemes.length; i++) {
                                if (component.schema.colour_schemes[i] === col_scheme) {
                                    component.schema.colour_schemes.splice(i, 1);
                                    component.send_delete_colour_scheme(col_scheme);
                                    break;
                                }
                            }
                        });
                    },
                    on_reorder: function() {
                        this.queue_send_schema_update();
                    }
                },
                created: function() {
                    Vue.watch(this.schema.colour_schemes, (x, prev_x) => {
                        this.queue_send_schema_update();
                    });
                },
                computed: {
                    new_name_state: function(): string {
                        if (this.new_form_data.name === '') {
                            return 'empty';
                        }
                        else if (!SchemaEditor.check_identifier(this.new_form_data.name)) {
                            return 'invalid'
                        }
                        else {
                            for (let col_scheme of this.schema.colour_schemes) {
                                if (this.new_form_data.name === col_scheme.name) {
                                    return 'in_use';
                                }
                            }
                            return 'ok'
                        }
                    },
                }
            });

            /*
            All label classes component
             */
            self.app.component('all-label-classes', {
                template: '#all_label_classes_template',
                props: {
                    schema: Object,
                },
                data: function() {
                    return {
                        'show_new_form': false,
                        'new_form_data': {
                            'group_name': '',
                        }
                    };
                },
                methods: {
                    on_new: function() {
                        this.show_new_form = true;
                    },
                    on_cancel_new: function() {
                        this.show_new_form = false;
                    },
                    on_create_new: function() {
                        if (this.new_form_data.name !== '') {
                            var new_group = {
                                id: labelling_tool.ObjectIDTable.uuidv4(),
                                group_name: this.new_form_data.group_name,
                                group_classes: [],
                            };
                            this.send_create_group(new_group);
                            this.schema.label_class_groups.push(new_group);
                            this.new_form_data.group_name = '';
                        }
                        this.show_new_form = false;
                    },
                },
                created: function() {
                    Vue.watch(this.schema.label_class_groups, (x, prev_x) => {
                        this.queue_send_schema_update();
                    });
                }
            });

            /*
            Label class group template
            new_lcls_form_data is the form data for creating a new label class
             */
            self.app.component('label-class-group', {
                template: '#label_class_group_template',
                props: {
                    group: Object,
                    schema: Object
                },
                data: function() {
                    return {
                        'show_new_form': false,
                        'new_lcls_form_data': {
                            'name': '',
                            'human_name': ''
                        }
                    };
                },
                methods: {
                    on_new: function() {
                        this.show_new_form = true;
                    },
                    on_cancel_new: function() {
                        this.show_new_form = false;
                    },
                    on_create_new: function() {
                        if (this.new_lcls_form_data.name !== '') {
                            var colours = {};
                            for (let scheme of this.schema.colour_schemes) {
                                colours[scheme.name] = [128, 128, 128];
                            }
                            colours['default'] = [128, 128, 128];
                            var lcls = {
                                id: labelling_tool.ObjectIDTable.uuidv4(),
                                name: this.new_lcls_form_data.name,
                                human_name: this.new_lcls_form_data.human_name,
                                colours: colours
                            };
                            this.send_create_label_class(lcls, this.group);
                            this.group.group_classes.push(lcls);
                            this.new_lcls_form_data.name = '';
                            this.new_lcls_form_data.human_name = '';
                        }
                        this.show_new_form = false;
                    },
                    open_delete_group_modal: function() {
                        let component = this;
                        let group = this.group;
                        SchemaEditor.confirm_deletion('group', group.human_name, function() {
                            if (group.group_classes.length === 0) {
                                for (var i = 0; i < component.schema.label_class_groups.length; i++) {
                                    if (component.schema.label_class_groups[i] === group) {
                                        component.schema.label_class_groups.splice(i, 1);
                                        component.send_delete_group(group);
                                        break;
                                    }
                                }
                            }
                        });
                    },
                    open_delete_lcls_modal: function(label_class) {
                        let component = this;
                        SchemaEditor.confirm_deletion('label class', label_class.human_name, function() {
                            for (var i = 0; i < component.group.group_classes.length; i++) {
                                if (component.group.group_classes[i] === label_class) {
                                    component.group.group_classes.splice(i, 1);
                                        component.send_delete_label_class(label_class, component.group);
                                    break;
                                }
                            }
                        });
                    }
                },
                created: function() {
                    Vue.watch(this.group, (x, prev_x) => {
                        this.queue_send_schema_update();
                    });
                },
                computed: {
                    new_lcls_name_state: function(): string {
                        if (this.new_lcls_form_data.name === '') {
                            return 'empty';
                        }
                        else if (!SchemaEditor.check_identifier(this.new_lcls_form_data.name)) {
                            return 'invalid'
                        }
                        else {
                            for (let group of this.schema.label_class_groups) {
                                for (let lcls of group.group_classes) {
                                    if (this.new_lcls_form_data.name === lcls.name) {
                                        return 'in_use';
                                    }
                                }
                            }
                            return 'ok'
                        }
                    },
                    can_delete: function(): boolean {
                        return this.group.group_classes.length === 0;
                    },
                }
            });

            /*
            Colour editor text entry
             */
            self.app.component('colour-editor', {
                template: '#colour_editor_template',
                props: {
                    colour_table: Object,
                    scheme_name: String,
                },
                data: function() {
                    return {
                        _text_value: '',
                        _colour_value: ''
                    }
                },
                emits: ['update:modelValue'],
                methods: {
                    on_text_input(e) {
                        if (SchemaEditor.check_colour(e.target.value)) {
                            this.update(e.target.value);
                        }
                    },
                    on_colour_input(e) {
                        this.update(e.target.value);
                    },
                    update(colour) {
                        var rgb = SchemaEditor.hex_to_rgb(colour);
                        this.colour_table[this.scheme_name] = rgb;
                        this._colour_value = colour;
                        this._text_value = colour;
                        this.queue_send_schema_update();
                    }
                },
                computed: {
                    html_colour: function() {
                        if (this.colour_table.hasOwnProperty(this.scheme_name)) {
                            return SchemaEditor.rgb_to_hex(this.colour_table[this.scheme_name]) as string;
                        }
                        else {
                            return '#808080';
                        }
                    },
                    is_text_valid: function() {
                        return SchemaEditor.check_colour(this._text_value);
                    },
                    tracked_scheme_name: function() {
                        this._text_value = this.html_colour;
                        this._colour_value = this.html_colour;
                        return this.scheme_name;
                    },
                    text_value: function() {
                        // We wrap the `_text_value` data attribute in this computed value so that we can access
                        // the `tracked_scheme_name` computed value, that will update the underlying `_text_value`
                        // and `_colour_value` attributes when the scheme name changes. Otherwise, re-ordering
                        // the colour schemes will not cause the colour swatches to swap over.
                        let name = this.tracked_scheme_name;
                        return this._text_value;
                    },
                    colour_value: function() {
                        // We wrap the `_colour_value` data attribute in this computed value so that we can access
                        // the `tracked_scheme_name` computed value, that will update the underlying `_text_value`
                        // and `_colour_value` attributes when the scheme name changes. Otherwise, re-ordering
                        // the colour schemes will not cause the colour swatches to swap over.
                        let name = this.tracked_scheme_name;
                        return this._colour_value;
                    }
                },
            });

            /*
            Mount the app
             */
            const vm = self.app.mount('#schema_editor');
        }



        /**
         * Send an update to the server at `this.update_url`
         * @param messages_and_callbacks - array of objects with layout:
         *      {message: <message_as_json>, on_response: <>callback function that takes a single parameter>}
         * @private
         */
        private send_messages(messages_and_callbacks: MessageWithCallback[]) {
            let self = this;

            let messages: any[] = [];
            for (let msg_cb of messages_and_callbacks) {
                console.log('Sending ' + msg_cb.message.method);
                messages.push(msg_cb.message);
            }

            let post_data = {
                messages: JSON.stringify(messages)
            };

            $.ajax({
                type: 'POST',
                url: self.update_url,
                data: post_data,
                success: function (reply: any) {
                    let responses = reply.responses;
                    for (var i = 0; i < responses.length; i++) {
                        let msg_cb = messages_and_callbacks[i];
                        if (msg_cb.on_response !== undefined && msg_cb.on_response !== null) {
                            msg_cb.on_response(responses[i]);
                        }
                    }
                },
                dataType: 'json'
            });
        }

        /**
         * Queue a schema update to execute after a provided delay
         *
         * @param milliseconds - delay after which the task is to be executed
         */
        enqueue_update_schema(milliseconds: number) {
            let self = this;
            this.dequeue_update_schema();
            this.update_timeout_id = setTimeout(function() {
                self.send_update_schema_message();
                self.update_timeout_id = null;
            }, milliseconds);
        }

        /**
         * Dequeue any queued schema update
         */
        dequeue_update_schema() {
            if (this.update_timeout_id !== null) {
                clearTimeout(this.update_timeout_id);
                this.update_timeout_id = null;
            }
        }

        /**
         * Determine if a schema update is queued
         */
        is_update_schema_queued(): boolean {
            return this.update_timeout_id !== null;
        }

        /**
         * Send a schema update message immediately
         */
        send_update_schema_message() {
            this.send_messages([this.create_update_schema_message()]);
        }

        /**
         * Create a schema update message
         */
        private create_update_schema_message(): MessageWithCallback {
            let self = this;
            let schema = self.get_schema();
            return {
                message: {method: 'update_schema', params: {schema: schema}},
                on_response: function (msg) {
                    if (msg.status === 'success') {
                        console.log('Schema update successful');
                        let colour_scheme_id_mapping = msg.colour_scheme_id_mapping;
                        let group_id_mapping = msg.group_id_mapping;
                        let label_class_id_mapping = msg.label_class_id_mapping;
                        if (colour_scheme_id_mapping !== undefined) {
                            for (let scheme of schema.colour_schemes) {
                                if (colour_scheme_id_mapping[scheme.id] !== undefined) {
                                    console.log('Remapping colour scheme ID ' + scheme.id + ' to ' + colour_scheme_id_mapping[scheme.id]);
                                    scheme.id = colour_scheme_id_mapping[scheme.id];
                                }
                            }
                        }
                        for (let group of schema.label_class_groups) {
                            if (group_id_mapping !== undefined) {
                                if (group_id_mapping[group.id] !== undefined) {
                                    console.log('Remapping group ID ' + group.id + ' to ' + group_id_mapping[group.id]);
                                    group.id = group_id_mapping[group.id];
                                }
                            }

                            if (label_class_id_mapping !== undefined) {
                                for (let lcls of group.group_classes) {
                                    if (label_class_id_mapping[lcls.id] !== undefined) {
                                        console.log('Remapping label class ID ' + lcls.id + ' to ' + label_class_id_mapping[lcls.id]);
                                        lcls.id = label_class_id_mapping[lcls.id];
                                    }
                                }
                            }
                        }
                    }
                    else {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }
            };
        }

        private send_queued_update_followed_by(msg_cb: MessageWithCallback) {
            let messages: MessageWithCallback[] = [];
            if (this.is_update_schema_queued()) {
                let msg = this.create_update_schema_message();
                messages.push(msg);
                this.dequeue_update_schema();
            }
            messages.push(msg_cb);
            this.send_messages(messages);
        }


        private send_create_colour_scheme(colour_scheme) {
            this.send_queued_update_followed_by(
                {message: {method: 'create_colour_scheme', params: {colour_scheme: colour_scheme}},
                 on_response: function(msg) {
                    if (msg.status === 'success') {
                        if (msg.new_colour_scheme_id !== undefined) {
                            console.log('Remapping colour scheme id ' + colour_scheme.id + ' to ' + msg.new_colour_scheme_id);
                            colour_scheme.id = msg.new_colour_scheme_id;
                        }
                    }
                    else {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }});
        }

        send_delete_colour_scheme(colour_scheme) {
            this.send_queued_update_followed_by(
                {message: {method: 'delete_colour_scheme', params:{colour_scheme: colour_scheme}},
                on_response: function(msg) {
                    if (msg.status !== 'success') {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }});
        }

        send_create_group(group) {
            this.send_queued_update_followed_by(
                {message: {method: 'create_group', params:{group: group}},
                on_response: function(msg) {
                    if (msg.status === 'success') {
                        if (msg.new_group_id !== undefined) {
                            console.log('Remapping group id ' + group.id + ' to ' + msg.new_group_id);
                            group.id = msg.new_group_id;
                        }
                    }
                    else {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }});
        }

        send_delete_group(group) {
            this.send_queued_update_followed_by(
                {message: {method: 'delete_group', params:{group: group}},
                on_response: function(msg) {
                    if (msg.status !== 'success') {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }});
        }

        send_create_label_class(label_class, containing_group) {
            this.send_queued_update_followed_by(
                {message: {method: 'create_label_class', params:{label_class: label_class, containing_group: containing_group}},
                on_response: function(msg) {
                    if (msg.status === 'success') {
                        if (msg.new_label_class_id !== undefined) {
                            console.log('Remapping label class id ' + label_class.id + ' to ' + msg.new_label_class_id);
                            label_class.id = msg.new_label_class_id;
                        }
                    }
                    else {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }});
        }

        send_delete_label_class(label_class, containing_group) {
            this.send_queued_update_followed_by(
                {message: {method: 'delete_label_class', params: {label_class: label_class, containing_group: containing_group}},
                on_response: function (msg) {
                    if (msg.status !== 'success') {
                        SchemaEditor.error_from_server(msg.status);
                    }
                }});

        }

        private static confirm_deletion(entity_type: string, entity_name: string, on_delete: () => void) {
            let modal = $('#delete_modal');
            modal.find('.delete_target_type').text(entity_type);
            modal.find('#delete_target_name').text(entity_name);
            let confirm_button = modal.find('#delete_confirm_button');
            confirm_button.on('click', function() {
                on_delete();
                modal.modal('hide');
            });
            modal.modal();
        }

        private static error_from_server(error_code: string) {
            let modal = $('#error_modal');
            modal.find('#error_modal_code').text(error_code);
            let confirm_button = modal.find('#error_reload_button');
            confirm_button.on('click', function() {
                window.location.reload();
                modal.modal('hide');
            });
            modal.modal();
        }


        private static colour_regex = /#[A-Fa-f0-9]{6}/;
        private static identifier_regex = /[A-Za-z_]\w*/;

        private static matches(pattern: RegExp, x: string): boolean {
            var match = pattern.exec(x);
            if (match !== null) {
                return match.toString() === x;
            }
            return false;
        }

        private static check_colour(col: string): boolean {
            return SchemaEditor.matches(SchemaEditor.colour_regex, col);
        }

        private static check_identifier(identifier: string): boolean {
            return SchemaEditor.matches(SchemaEditor.identifier_regex, identifier);
        }


        private static rgb_to_hex(col: number[]): string {
            return "#" + ((1 << 24) + (col[0] << 16) + (col[1] << 8) + col[2]).toString(16).slice(1);
        }

        private static hex_to_rgb(hex: string): number[] {
          // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
          var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
          hex = hex.replace(shorthandRegex, function(m, r, g, b) {
            return r + r + g + g + b + b;
          });

          var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? [parseInt(result[1], 16),
                           parseInt(result[2], 16),
                           parseInt(result[3], 16)
          ] : null;
        }
    }

}

