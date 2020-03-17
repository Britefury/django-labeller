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

declare var Popper:any;

module popup_menu {
    export class PopupMenu {
        target: JQuery;
        contents: JQuery;
        buttons: JQuery;
        popper: any;
        popper_options: any;
        current_choice: string;


        constructor(target: JQuery, contents: JQuery, options: any) {
            let self = this;
            this.target = target;
            this.contents = contents;
            self.contents.appendTo($('body'));
            this.buttons = this.contents.find(".popup_menu_choice_button");
            this.popper = null;
            this.popper_options = options;

            // Display the popper on clock
            this.target.on('click', function() {
                self.popper = new Popper(
                    self.target[0],
                    self.contents[0],
                    self.popper_options
                );
                PopupMenu.all_active.push(self);
            });

            // Respond to button clicks within the popup
            this.buttons.on('click', function(e) {
                // Get the users choice
                var choice_button = $(e.target).closest('.popup_menu_choice_button');
                self.current_choice = choice_button.data('choice');

                // Modify the text of the target button
                var text = choice_button.html();
                self.target.find('.menu_choice').html(text);

                // Set active button
                self.buttons.removeClass('active');
                choice_button.addClass('active');

                self.target.trigger('change', {
                    target: self.target[0],
                    value: self.current_choice
                });
            });

            var initial_button = this.buttons.filter(".active");
            var text = initial_button.html();
            this.target.find('.menu_choice').html(text);

            PopupMenu.install_document_click_handler();
        }


        setChoice(choice: string) {
            var choice_button = this.buttons.filter("[data-choice='"  + choice + "']");
            if (choice_button.length > 0) {
                var text = choice_button.html();
                this.target.find('.menu_choice').html(text);
            }
            else {
                this.target.find('.menu_choice').html('');
            }

            // Set active button
            this.buttons.removeClass('active');
            choice_button.addClass('active');
        }

        getChoice(): string {
            return this.current_choice;
        }


        close() {
            if (this.popper !== null) {
                this.popper.destroy();
                this.popper = null;

                let index: number = -1;
                for (var i = 0; i < PopupMenu.all_active.length; i++) {
                    let menu: PopupMenu = PopupMenu.all_active[i];
                    if (menu === this) {
                        index = i;
                        break;
                    }
                }
                PopupMenu.all_active.splice(index, 1);
            }
        }


        static all_active: PopupMenu[] = [];
        static doc_click_installed: boolean = false;

        static install_document_click_handler() {
            if (!PopupMenu.doc_click_installed) {
                $(document).on('click', function(e) {
                    let clicked: JQuery = $(e.target);
                    for (var i = 0; i < PopupMenu.all_active.length; i++) {
                        let menu: PopupMenu = PopupMenu.all_active[i];
                        if (clicked.is(menu.target) || menu.target.has(e.target).length > 0) {
                            return;
                        }
                    }
                    for (var i = 0; i < PopupMenu.all_active.length; i++) {
                        PopupMenu.all_active[i].close();
                    }
                });

                PopupMenu.doc_click_installed = true;
            }
        }
    }
}
