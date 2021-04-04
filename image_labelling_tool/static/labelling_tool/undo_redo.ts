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
/// <reference path="./abstract_label.ts" />
/// <reference path="./abstract_tool.ts" />

module labelling_tool {
    /*
    Undo-redo stack
     */
    abstract class UndoRedoAction {
        abstract invoke(): void;
        abstract revert(): void;
    }

    export class UndoRedoStack {
        private past: UndoRedoAction[] = [];
        private future: UndoRedoAction[] = [];
        private max_size: number;

        constructor(max_size: number) {
            this.max_size = max_size;
        }

        add_action(action: UndoRedoAction) {
            this.past.push(action);
            while (this.past.length > this.max_size) {
                this.past.shift();
            }
            this.future = [];
        }

        add_and_apply_action(action: UndoRedoAction) {
            this.add_action(action);
            action.invoke();
        }

        undo(): UndoRedoAction {
            if (this.past.length > 0) {
                // Move the action from the past into the future
                let action = this.past.pop();
                this.future.push(action);
                // Revert
                action.revert();
                return action;
            }
            else {
                return null;
            }
        }

        redo(): UndoRedoAction {
            if (this.future.length > 0) {
                // Move the action from the future into the past
                let action = this.future.pop();
                this.past.push(action);
                // Invoke it
                action.invoke();
                return action;
            }
            else {
                return null;
            }
        }
    }
}