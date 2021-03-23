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

module labelling_tool {
   /*
    Object ID table
     */
    export class ObjectIDTable {
        _id_prefix: string;
        _id_conversion_prefix: string;
        _idx_counter: number;
        _id_to_object: any;
        _old_id_to_new_id: any;

        constructor(id_prefix: string) {
            if (id_prefix === undefined || id_prefix === null) {
                console.log("WARNING: ObjectIDTable: no id_prefix provided, making up a UUID");
                id_prefix = ObjectIDTable.uuidv4();
            }
            this._id_prefix = id_prefix;
            this._id_conversion_prefix = '';
            this._idx_counter = 1;
            this._id_to_object = {};
            this._old_id_to_new_id = {};
        }

        get(id:number):any {
            return this._id_to_object[id];
        }

        register(obj:any):void {
            var id:string;
            if ('object_id' in obj && obj.object_id !== null) {
                if (typeof(obj.object_id) === "number") {
                    // Create a new conversion ID prefix
                    if (this._id_conversion_prefix === '') {
                        this._id_conversion_prefix = ObjectIDTable.uuidv4();
                    }
                    // Update the ID to be of the form '<prefix>__<number>'
                    var old_id = obj.object_id;
                    id = this._id_conversion_prefix + "__" + old_id;
                    this._old_id_to_new_id[old_id] = id;
                    obj.object_id = id;
                }
                else {
                    id = obj.object_id;
                }
                this._id_to_object[id] = obj;
            }
            else {
                id = this._id_prefix + "__" + this._idx_counter;
                this._idx_counter += 1;
                this._id_to_object[id] = obj;
                obj.object_id = id;
            }
        }

        unregister(obj:any) {
            delete this._id_to_object[obj.object_id];
            // obj.object_id = null;
        }

        update_object_id(object_id: any) {
            if (this._old_id_to_new_id.hasOwnProperty(object_id)) {
                return this._old_id_to_new_id[object_id];
            }
            else {
                return object_id;
            }
        }

        static get_id(x: any) {
            if (x.hasOwnProperty('object_id') && x.object_id !== null) {
                return x.object_id;
            }
            else {
                return null;
            }
        }

        public static uuidv4(): string {
            // Code adapted from:
            // https://stackoverflow.com/questions/105034/how-to-create-guid-uuid/2117523#2117523
            if (crypto !== undefined) {
                return (""+1e7+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
                );
            }
            else {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        }
    }
}
