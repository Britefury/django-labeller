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

module labelling_tool {
    /*
    Label class
     */
    export interface LabelClassJSON {
        name: string;
        human_name: string;
        colour: number[];
        colours: { [colour_scheme: string]: number[]; };
        group_name: string;
        group_classes: LabelClassJSON[];
    }


    export interface TasksJSON {
        name: string;
        human_name: string;
    }


    export interface ColourSchemeJSON {
        name: string;
        human_name: string;
    }


    export class AbstractLabelClass {
        human_name: string;

        fill_name_to_class_table(table: {[class_name: string]: LabelClass}) {
        }

        to_html(): string {
            return '';
        }
    }


    export class LabelClass extends AbstractLabelClass {
        name: string;
        colours: { [colour_scheme: string]: Colour4; };

        constructor(j: LabelClassJSON) {
            super();
            this.name = j.name;
            this.human_name = j.human_name;
            this.colours = {};
            if (j.colours !== undefined) {
                // Multiple colours; new form
                for (let colour_scheme in j.colours) {
                    this.colours[colour_scheme] = Colour4.from_rgb_a(j.colours[colour_scheme], 1.0);
                }
            }
            else if (j.colour !== undefined) {
                // Single colour; old form
                this.colours['default'] = Colour4.from_rgb_a(j.colour, 1.0);
            }
        }

        fill_name_to_class_table(table: {[class_name: string]: LabelClass}) {
            table[this.name] = this;
        }

        to_html(): string {
            return '<option value="' + this.name + '">' + this.human_name + '</option>';
        }
    }

    export class LabelClassGroup extends AbstractLabelClass {
        label_classes: AbstractLabelClass[];

        constructor(human_name: string, label_classes: AbstractLabelClass[]) {
            super();
            this.human_name = human_name;
            this.label_classes = label_classes;
        }

        fill_name_to_class_table(table: {[class_name: string]: LabelClass}) {
            for (let i = 0; i < this.label_classes.length; i++) {
                this.label_classes[i].fill_name_to_class_table(table);
            }
        }

        to_html(): string {
            let items: string[] = [];
            for (let i = 0; i < this.label_classes.length; i++) {
                items.push(this.label_classes[i].to_html());
            }
            return '<optgroup label="' + this.human_name + '">' + items.join('') + '</optgroup>';
        }
    }

    export function label_classes_from_json(j_items: LabelClassJSON[]): AbstractLabelClass[] {
        let result: AbstractLabelClass[] = [];

        for (let i = 0; i < j_items.length; i++) {
            let j = j_items[i];
            if ((j.group_name !== undefined && j.group_name !== null) &&
                (j.group_classes !== undefined && j.group_classes !== null)) {
                // j represents a group of classes
                result.push(new LabelClassGroup(j.group_name, label_classes_from_json(j.group_classes)));
            }
            else {
                // j represents a class
                result.push(new LabelClass(j));
            }
        }

        return result;
    }
}
