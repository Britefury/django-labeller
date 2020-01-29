# The MIT License (MIT)
#
# Copyright (c) 2015 University of East Anglia, Norwich, UK
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
# Developed by Geoffrey French in collaboration with Dr. M. Fisher and
# Dr. M. Mackiewicz.

def flask_labeller(label_classes, labelled_images, colour_schemes=None, config=None, dextr_fn=None,
                   use_reloader=True, debug=True, port=None):
    import json
    import numpy as np
    from skimage.color import rgb2grey

    from flask import Flask, render_template, request, make_response, send_from_directory
    try:
        from flask_socketio import SocketIO, emit as socketio_emit
    except ImportError:
        SocketIO = None
        socketio_emit = None

    from image_labelling_tool import labelling_tool

    # Generate image IDs list
    image_ids = [str(i)   for i in range(len(labelled_images))]
    # Generate images table mapping image ID to image so we can get an image by ID
    images_table = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}
    # Generate image descriptors list to hand over to the labelling tool
    # Each descriptor provides the image ID, the URL and the size
    image_descriptors = []
    for image_id, img in zip(image_ids, labelled_images):
        height, width = img.image_size
        image_descriptors.append(labelling_tool.image_descriptor(
            image_id=image_id, url='/image/{}'.format(image_id),
            width=width, height=height
        ))


    app = Flask(__name__, static_folder='static')
    if SocketIO is not None:
        print('Using web sockets')
        socketio = SocketIO(app)
    else:
        socketio = None


    def apply_dextr_js(image, dextr_points_js):
        pixels = image.read_pixels()
        dextr_points = np.array([[p['x'], p['y']] for p in dextr_points_js])
        if dextr_fn is not None:
            mask = dextr_fn(pixels, dextr_points)
            regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
            regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
            return regions_js
        else:
            return []




    if config is None:
        config = {
            'useClassSelectorPopup': True,
            'tools': {
                'imageSelector': True,
                'labelClassSelector': True,
                'labelClassFilterInitial': None,
                'drawPolyLabel': True,
                'compositeLabel': False,
                'deleteLabel': True,
                'deleteConfig': {
                    'typePermissions': {
                        'point': True,
                        'box': True,
                        'polygon': True,
                        'composite': True,
                        'group': True,
                    }
                }
            }
        }



    @app.route('/')
    def index():
        label_classes_json = [(cls.to_json() if isinstance(cls, labelling_tool.LabelClassGroup) else cls)
                               for cls in label_classes]
        return render_template('labeller_page.jinja2',
                               colour_schemes=colour_schemes,
                               label_class_groups=label_classes_json,
                               image_descriptors=image_descriptors,
                               initial_image_index=0,
                               labelling_tool_config=config,
                               dextr_available=dextr_fn is not None,
                               use_websockets=socketio is not None)


    if socketio is not None:
        @socketio.on('get_labels')
        def handle_get_labels(arg_js):
            image_id = arg_js['image_id']

            image = images_table[image_id]

            labels, complete = image.get_label_data_for_tool()

            label_header = dict(labels=labels,
                                image_id=image_id,
                                complete=complete)

            socketio_emit('get_labels_reply', label_header)


        @socketio.on('set_labels')
        def handle_set_labels(arg_js):
            label_header = arg_js['label_header']

            image_id = label_header['image_id']

            image = images_table[image_id]

            image.set_label_data_from_tool(label_header['labels'], label_header['complete'])

            socketio_emit('set_labels_reply', '')


        @socketio.on('dextr')
        def handle_dextr(dextr_js):
            if 'request' in dextr_js:
                dextr_request_js = dextr_js['request']
                image_id = dextr_request_js['image_id']
                dextr_id = dextr_request_js['dextr_id']
                dextr_points = dextr_request_js['dextr_points']

                image = images_table[image_id]

                regions_js = apply_dextr_js(image, dextr_points)

                dextr_labels = dict(image_id=image_id, dextr_id=dextr_id, regions=regions_js)
                dextr_reply = dict(labels=[dextr_labels])

                socketio_emit('dextr_reply', dextr_reply)
            elif 'poll' in dextr_js:
                dextr_reply = dict(labels=[])
                socketio_emit('dextr_reply', dextr_reply)
            else:
                dextr_reply = {'error': 'unknown_command'}
                socketio_emit('dextr_reply', dextr_reply)


    else:
        @app.route('/labelling/get_labels/<image_id>')
        def get_labels(image_id):
            image = images_table[image_id]

            labels = image.labels_json
            complete = False


            label_header = {
                'labels': labels,
                'image_id': image_id,
                'complete': complete
            }

            r = make_response(json.dumps(label_header))
            r.mimetype = 'application/json'
            return r


        @app.route('/labelling/set_labels', methods=['POST'])
        def set_labels():
            label_header = json.loads(request.form['labels'])
            image_id = label_header['image_id']
            complete = label_header['complete']
            labels = label_header['labels']

            image = images_table[image_id]
            image.labels_json = labels

            return make_response('')


        @app.route('/labelling/dextr', methods=['POST'])
        def dextr():
            dextr_js = json.loads(request.form['dextr'])
            if 'request' in dextr_js:
                dextr_request_js = dextr_js['request']
                image_id = dextr_request_js['image_id']
                dextr_id = dextr_request_js['dextr_id']
                dextr_points = dextr_request_js['dextr_points']

                image = images_table[image_id]
                regions_js = apply_dextr_js(image, dextr_points)

                dextr_labels = dict(image_id=image_id, dextr_id=dextr_id, regions=regions_js)
                dextr_reply = dict(labels=[dextr_labels])

                return make_response(json.dumps(dextr_reply))
            elif 'poll' in dextr_js:
                dextr_reply = dict(labels=[])
                return make_response(json.dumps(dextr_reply))
            else:
                return make_response(json.dumps({'error': 'unknown_command'}))


    @app.route('/image/<image_id>')
    def get_image(image_id):
        image = images_table[image_id]
        data, mimetype, width, height = image.data_and_mime_type_and_size()
        r = make_response(data)
        r.mimetype = mimetype
        return r



    if socketio is not None:
        socketio.run(app, debug=debug, port=port, use_reloader=use_reloader)
    else:
        app.run(debug=debug, port=port, use_reloader=use_reloader)

