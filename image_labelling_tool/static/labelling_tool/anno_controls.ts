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
/// <reference path="./popup_menu.ts" />

module labelling_tool {
    /*
    Annotation controls
     */
    export interface AnnoControlChoiceJSON {
        value: string,
        label_text: string,
        tooltip: string
    }

    export interface AnnoControlJSON {
        control: string,
        identifier: string,
        label_text: string,
    }

    export interface CheckboxControlJSON extends AnnoControlJSON {
    }

    export interface RadioControlJSON extends AnnoControlJSON {
        choices: AnnoControlChoiceJSON[]
    }

    export interface PopupMenuControlJSON extends AnnoControlJSON {
        choices: AnnoControlChoiceJSON[]
    }

    type AnnoCtrlOnChange = (identifier: string, value: any) => void;



    export class AnnotationControl {
        on_change: AnnoCtrlOnChange;
        identifier: string;


        constructor(ctrl_json: AnnoControlJSON, on_change: AnnoCtrlOnChange) {
            this.on_change = on_change;
            this.identifier = ctrl_json.identifier;
        }

        update_from_value(value: any) {
        }

        update_from_anno_data(anno_data: any) {
            if (anno_data !== undefined && anno_data !== null) {
                let value = anno_data[this.identifier];
                this.update_from_value(value);
            }
            else {
                this.update_from_value(undefined);
            }
        }


        static from_json(ctrl_json: AnnoControlJSON, on_change: AnnoCtrlOnChange): AnnotationControl {
            if (ctrl_json.control ==='checkbox') {
                return new AnnotationCheckbox(ctrl_json as CheckboxControlJSON, on_change);
            }
            else if (ctrl_json.control ==='radio') {
                return new AnnotationRadio(ctrl_json as RadioControlJSON, on_change);
            }
            else if (ctrl_json.control ==='popup_menu') {
                return new AnnotationPopupMenu(ctrl_json as PopupMenuControlJSON, on_change);
            }
            else {
                throw "Unknown control type " + ctrl_json.control;
            }
        }
    }


    export class AnnotationCheckbox extends AnnotationControl {
        ctrl_json: CheckboxControlJSON;
        checkbox: JQuery;

        constructor(ctrl_json: CheckboxControlJSON, on_change: AnnoCtrlOnChange) {
            super(ctrl_json, on_change);

            this.ctrl_json = ctrl_json;

            let self = this;

            this.checkbox = $('#anno_ctrl_' + this.identifier);
            this.checkbox.change(function(event, ui) {
                self.on_change(self.identifier, (event.target as any).checked);
            });
        }

        update_from_value(value: any) {
            if (value !== undefined) {
                this.checkbox.prop("checked", value);
                this.checkbox.prop("indeterminate", false);
                return;
            }
            else {
                this.checkbox.prop("indeterminate", true);
            }
        }
    }


    export class AnnotationRadio extends AnnotationControl {
        ctrl_json: RadioControlJSON;
        radio_buttons: JQuery[];

        constructor(ctrl_json: RadioControlJSON, on_change: AnnoCtrlOnChange) {
            super(ctrl_json, on_change);

            this.ctrl_json = ctrl_json;

            this.radio_buttons = [];

            let self = this;

            for (var i = 0; i < ctrl_json.choices.length; i++) {
                let choice_json = ctrl_json.choices[i];
                let btn = $('#anno_ctrl_' + this.identifier + '_' + choice_json.value);
                btn.change(function(event: any, ui: any) {
                    if (event.target.checked) {
                        self.on_change(self.identifier, event.target.value);
                    }
                });
                this.radio_buttons.push(btn);
            }
        }

        update_from_value(value: any) {
            for (var i = 0; i < this.radio_buttons.length; i++) {
                if (this.ctrl_json.choices[i].value === value) {
                    this.radio_buttons[i].closest('label.btn').addClass('active');
                }
                else {
                    this.radio_buttons[i].closest('label.btn').removeClass('active');
                }
            }
        }
    }


    export class AnnotationPopupMenu extends AnnotationControl {
        ctrl_json: PopupMenuControlJSON;
        menu: popup_menu.PopupMenu;

        constructor(ctrl_json: PopupMenuControlJSON, on_change: AnnoCtrlOnChange) {
            super(ctrl_json, on_change);

            this.ctrl_json = ctrl_json;

            let self = this;

            let menu_button = $('#anno_ctrl_' + this.identifier);

            this.menu = new popup_menu.PopupMenu(menu_button,
                        $('#anno_ctrl_contents_' + this.identifier),
                        {placement: 'bottom'})

            menu_button.on('change',function (el, event: any) {
                self.on_change(self.identifier, event.value);
            });
        }

        update_from_value(value: any) {
            this.menu.setChoice(value);
        }
    }
}
