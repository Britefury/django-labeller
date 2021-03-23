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

declare var Sortable: any;

module schema_editor {
    export class LabelClassEditor {
        private update_url: string;

        private send_update(action: string, params: object, on_success: any) {
            let self = this;

            let post_data = {
                action: action,
                params: JSON.stringify(params)
            };

            $.ajax({
                type: 'POST',
                url: self.update_url,
                data: post_data,
                success: function (msg) {
                    if (on_success !== undefined && on_success !== null) {
                        on_success();
                    }
                },
                dataType: 'json'
            });
        }

        private static colour_regex = /#[A-Fa-f0-9]{6}/;

        private static check_colour(col: string): boolean {
            var match = LabelClassEditor.colour_regex.exec(col);
            if (match !== null) {
                return match.toString() == col;
            }
            return false;
        }



        constructor(update_url: string) {
            let self = this;

            self.update_url = update_url;


            var group_container = $(".group_container");
            new Sortable(group_container[0], {
                animation: 150,
                onEnd: function(evt: any) {
                    let end_pos = evt.newIndex;
                    let src_panel = $(evt.item);
                    let params = {
                        src_group_id: src_panel.data('group-id'),
                        dst_index: end_pos
                    };
                    self.send_update('group_reorder', params, null);
                }
            });

            var group_table_bodies = $(".class_labels_table tbody");
            for (var i = 0; i < group_table_bodies.length; i++) {
                new Sortable(group_table_bodies[i], {
                    animation: 150,
                    group: 'label_class_groups',
                    onEnd: function(evt: any) {
                        let end_pos = evt.newIndex;
                        let src_row = $(evt.item);
                        let src_group_id = $(evt.from).closest('.group_panel').data('group-id');
                        let dst_group_id = $(evt.to).closest('.group_panel').data('group-id');
                        if (dst_group_id !== src_group_id) {
                            let params = {
                                src_lcls_id: src_row.data('lcls-id'),
                                dst_group_id: dst_group_id,
                                dst_index: end_pos
                            };
                            self.send_update('move_label_to_group', params, null);
                        }
                        else {
                            let params = {
                                src_lcls_id: src_row.data('lcls-id'),
                                dst_index: end_pos
                            };
                            self.send_update('label_class_reorder', params, null);
                        }
                    }
                });
            }


            //
            // EDIT GROUPS
            //

            var input_group_active = $(".input_group_active");
            input_group_active.change(function () {
                var card_body = $(this).closest('div.card-body');
                var card_subtitle = card_body.find('.card-subtitle');
                var group_panel = $(this).closest('div.group_panel');
                var group_id = group_panel.data('group-id');
                if (this.checked) {
                    card_body.removeClass('bg-light');
                    card_subtitle.removeClass('text-muted');
                } else {
                    card_body.addClass('bg-light');
                    card_subtitle.addClass('text-muted');
                }
                var params = {
                    group_id: group_id,
                    active: this.checked
                };
                self.send_update('group', params, null);
            });

            var input_group_name = $(".input_group_name");
            input_group_name.on('input', function () {
                $(this).addClass('unsaved');
            });
            input_group_name.on('change', function () {
                var elem = $(this);
                var group_panel = elem.closest('div.group_panel');
                var group_id = group_panel.data('group-id');
                var human_name = this.value;
                var params = {
                    group_id: group_id,
                    human_name: human_name
                };
                self.send_update('group', params, function () {
                    elem.removeClass('unsaved');
                });
            });


            //
            // EDIT LABEL CLASSES
            //
            var input_lcls_active = $(".input_lcls_active");
            input_lcls_active.change(function () {
                var lcls_row = $(this).closest('.lcls_row');
                var lcls_id = lcls_row.data('lcls-id');
                var params = {
                    lcls_id: lcls_id,
                    active: this.checked
                };
                self.send_update('label_class', params, null);
            });

            var input_lcls_name = $(".input_lcls_name");
            input_lcls_name.on('input', function () {
                $(this).addClass('unsaved');
            });
            input_lcls_name.on('change', function () {
                var elem = $(this);
                var lcls_row = elem.closest('.lcls_row');
                var lcls_id = lcls_row.data('lcls-id');
                var params = {
                    lcls_id: lcls_id,
                    human_name: this.value
                };
                self.send_update('label_class', params, function () {
                    elem.removeClass('unsaved');
                });
            });

            //
            // Colour
            //

            var input_lcls_colour_picker = $(".input_lcls_colour_picker");
            for (var i = 0; i < input_lcls_colour_picker.length; i++) {
                var elem = $(input_lcls_colour_picker[i]);
                elem.spectrum({color: elem.data('colour')});

                elem.on('change', function (x, colour) {
                    var lcls_row = $(this).closest('.lcls_row');
                    var lcls_id = lcls_row.data('lcls-id');
                    var text_elem = lcls_row.find(".input_lcls_colour_text");
                    text_elem.val(colour.toHexString());
                    text_elem.addClass('unsaved');

                    var lcls_td = $(this).closest('.lcls_colour');
                    var scheme = lcls_td.data('colour-scheme');

                    var params = {
                        lcls_id: lcls_id,
                        colour: {
                            scheme: scheme,
                            colour: colour.toHexString()
                        }
                    };
                    self.send_update('label_class', params, function () {
                        text_elem.removeClass('unsaved');
                    });
                });
            }

            var input_lcls_colour_text = $(".input_lcls_colour_text");
            input_lcls_colour_text.on('input', function () {
                $(this).addClass('unsaved');
                if (LabelClassEditor.check_colour(this.value)) {
                    var elem = $(this);
                    var picker = elem.siblings('.input_lcls_colour_picker');
                    picker.spectrum('set', this.value);
                }
            });
            input_lcls_colour_text.on('change', function () {
                if (LabelClassEditor.check_colour(this.value)) {
                    var elem = $(this);
                    var lcls_row = elem.closest('.lcls_row');
                    var lcls_id = lcls_row.data('lcls-id');

                    var lcls_td = $(this).closest('.lcls_colour');
                    var scheme = lcls_td.data('colour-scheme');

                    var picker = elem.siblings('.input_lcls_colour_picker');
                    var colour = this.value;
                    picker.spectrum('set', colour);
                    var params = {
                        lcls_id: lcls_id,
                        colour: {
                            scheme: scheme,
                            colour: colour
                        }
                    };
                    self.send_update('label_class', params, function () {
                        elem.removeClass('unsaved');
                    });
                }
            });

            //
            // Species ID colour
            //
            var input_lcls_specid_colour_picker = $(".input_lcls_specid_colour_picker");
            for (var i = 0; i < input_lcls_specid_colour_picker.length; i++) {
                var elem = $(input_lcls_specid_colour_picker[i]);
                elem.spectrum({color: elem.data('colour')});

                elem.on('change', function (x, colour) {
                    var lcls_row = $(this).closest('.lcls_row');
                    var lcls_id = lcls_row.data('lcls-id');
                    var text_elem = lcls_row.find(".input_lcls_specid_colour_text");
                    text_elem.val(colour.toHexString());
                    text_elem.addClass('unsaved');

                    var params = {
                        lcls_id: lcls_id,
                        colour_species_id: colour.toHexString()
                    };
                    self.send_update('label_class', params, function () {
                        text_elem.removeClass('unsaved');
                    });
                });
            }

            var input_lcls_specid_colour_text = $(".input_lcls_specid_colour_text");
            input_lcls_specid_colour_text.on('input', function () {
                $(this).addClass('unsaved');
                if (LabelClassEditor.check_colour(this.value)) {
                    var elem = $(this);
                    var picker = elem.siblings('.input_lcls_specid_colour_picker');
                    picker.spectrum('set', this.value);
                }
            });
            input_lcls_specid_colour_text.on('change', function () {
                if (LabelClassEditor.check_colour(this.value)) {
                    var elem = $(this);
                    var lcls_row = elem.closest('.lcls_row');
                    var lcls_id = lcls_row.data('lcls-id');
                    var picker = elem.siblings('.input_lcls_specid_colour_picker');
                    var colour = this.value;
                    picker.spectrum('set', colour);
                    var params = {
                        lcls_id: lcls_id,
                        colour_species_id: colour
                    };
                    self.send_update('label_class', params, function () {
                        elem.removeClass('unsaved');
                    });
                }
            });


            // New label class button
            let new_label_class_button = $(".new_label_class_button");
            new_label_class_button.on("click", function() {
                let group_panel = $(this).closest(".group_panel");
                let group_id = group_panel.data('group-id');
                let dialog = $("#label_class_create_form");
                let group_id_hid = dialog.find("#class_editor_new_cls_group_id");
                let group_name = group_panel.find(".input_group_name").val();
                let group_name_span = dialog.find("#class_editor_create_label_group_name");
                group_id_hid.val(group_id);
                group_name_span.text(group_name);
            });
        }


    }
}