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
import click


def flask_labeller(label_classes, labelled_images, colour_schemes=None, anno_controls=None,
                   config=None, dextr_fn=None, use_reloader=True, debug=True, port=None):
    import json
    import uuid
    import numpy as np

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
        dextr_points = np.array([[p['y'], p['x']] for p in dextr_points_js])
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
        if anno_controls is not None:
            anno_controls_json = [c.to_json() for c in anno_controls]
        else:
            anno_controls_json = []
        return render_template('labeller_page.jinja2',
                               colour_schemes=colour_schemes,
                               label_class_groups=label_classes_json,
                               image_descriptors=image_descriptors,
                               initial_image_index=0,
                               anno_controls=anno_controls_json,
                               labelling_tool_config=config,
                               dextr_available=dextr_fn is not None,
                               use_websockets=socketio is not None)


    if socketio is not None:
        @socketio.on('get_labels')
        def handle_get_labels(arg_js):
            image_id = arg_js['image_id']

            image = images_table[image_id]

            labels, complete = image.get_label_data_for_tool()

            label_header = dict(image_id=image_id,
                                labels=labels,
                                complete=complete,
                                timeElapsed=0.0,
                                state='editable',
                                session_id=str(uuid.uuid4()),
            )

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
                'image_id': image_id,
                'labels': labels,
                'complete': complete,
                'timeElapsed': 0.0,
                'state': 'editable',
                'session_id': str(uuid.uuid4()),
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



@click.command()
@click.option('--images_pat', type=str, default='', help='Image path pattern e.g. \'images/*.jpg\'')
@click.option('--labels_dir', type=click.Path(dir_okay=True, file_okay=False, writable=True))
@click.option('--slic', is_flag=True, default=False, help='Use SLIC segmentation to generate initial labels')
@click.option('--readonly', is_flag=True, default=False, help='Don\'t persist changes to disk')
@click.option('--update_label_object_ids', is_flag=True, default=False, help='Update object IDs in label JSON files')
@click.option('--enable_dextr', is_flag=True, default=False)
@click.option('--dextr_weights', type=click.Path())
def run_app(images_pat, labels_dir, slic, readonly, update_label_object_ids,
            enable_dextr, dextr_weights):
    import os
    import glob
    import json
    import uuid
    from image_labelling_tool import labelling_tool

    if enable_dextr or dextr_weights is not None:
        from dextr.model import DextrModel
        import torch

        device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

        if dextr_weights is not None:
            dextr_weights = os.path.expanduser(dextr_weights)
            dextr_model = torch.load(dextr_weights, map_location=device)
        else:
            dextr_model = DextrModel.pascalvoc_resunet101().to(device)

        dextr_model.eval()

        dextr_fn = lambda image, points: dextr_model.predict([image], points[None, :, :])[0] >= 0.5
    else:
        dextr_fn = None


    # Colour schemes
    # The user may select different colour schemes for different tasks.
    # If you have a lot of classes, it will be difficult to select colours that are easily distinguished
    # from one another. For one task e.g. segmentation, design a colour scheme that highlights the different
    # classes for that task, while another task e.g. fine-grained classification would use another scheme.
    # Each colour scheme is a dictionary containing the following:
    #   name: symbolic name (Python identifier)
    #   human_name: human readable name for UI
    # These colour schemes are going to split the classes by 'default' (all), natural, and artificial.
    # Not really useful, but demonstrates the feature.
    colour_schemes = [
        dict(name='default', human_name='All'),
        dict(name='natural', human_name='Natural'),
        dict(name='artificial', human_name='Artifical')
    ]

    # Specify our label classes, organised in groups.
    # `LabelClass` parameters are:
    #   symbolic name (Python identifier)
    #   human readable name for UI
    #   and colours by colour scheme, as a dict mapping colour scheme name to RGB value as a list
    # The label classes are arranged in groups and will be displayed as such in the UI.
    # `LabelClassGroup` parameters are:
    #   human readable name for UI
    #   label class (`LabelClass` instance) list
    label_classes = [
        labelling_tool.LabelClassGroup('Natural', [
            labelling_tool.LabelClass('tree', 'Trees', dict(default=[0, 255, 192], natural=[0, 255, 192],
                                                            artificial=[128, 128, 128])),
            labelling_tool.LabelClass('lake', 'Lake', dict(default=[0, 128, 255], natural=[0, 128, 255],
                                                           artificial=[128, 128, 128])),
            labelling_tool.LabelClass('flower', 'Flower', dict(default=[255, 96, 192], natural=[255, 192, 96],
                                                               artificial=[128, 128, 128])),
            labelling_tool.LabelClass('leaf', 'Leaf', dict(default=[65, 255, 0], natural=[65, 255, 0],
                                                           artificial=[128, 128, 128])),
            labelling_tool.LabelClass('stem', 'Stem', dict(default=[128, 64, 0], natural=[128, 64, 0],
                                                           artificial=[128, 128, 128])),
        ]),
        labelling_tool.LabelClassGroup('Artificial', [
            labelling_tool.LabelClass('building', 'Buildings', dict(default=[255, 128, 0], natural=[128, 128, 128],
                                                                   artificial=[255, 128, 0])),
            labelling_tool.LabelClass('wall', 'Wall', dict(default=[0, 128, 255], natural=[128, 128, 128],
                                                           artificial=[0, 128, 255])),
        ])]

    # Annotation controls
    # Labels may also have optional meta-data associated with them
    # You could use this for e.g. indicating if an object is fully visible, mostly visible or significantly obscured.
    # You could also indicate quality (e.g. blurriness, etc)
    # There are three types of annotation:
    # Check box (boolean value):
    #   `labelling_tool.AnnoControlCheckbox` parameters:
    #       name: symbolic name (Python identifier)
    #       label_text: label text in UI
    # Radio button (choice from a list):
    #   `labelling_tool.AnnoControlRadioButtons` parameters:
    #       name: symbolic name (Python identifier)
    #       label_text: label text in UI
    #       choices: list of `labelling_tool.AnnoControlRadioButtons.choice` that provide:
    #           value: symbolic value name for choice
    #           label_text: choice label text in UI
    #           tooltip: extra information for user
    #       label_on_own_line [optional]: if True, place the label and the buttons on a separate line in the UI
    # Popup menu (choice from a grouped list):
    #   `labelling_tool.AnnoControlPopupMenu` parameters:
    #       name: symbolic name (Python identifier)
    #       label_text: label text in UI
    #       groups: list of groups `labelling_tool.AnnoControlPopupMenu.group`:
    #           label_text: group label text in UI
    #           choices: list of `labelling_tool.AnnoControlPopupMenu.choice` that provide:
    #               value: symbolic value name for choice
    #               label_text: choice label text in UI
    #               tooltip: extra information for user
    anno_controls = [
        labelling_tool.AnnoControlCheckbox('good_quality', 'Good quality'),
        labelling_tool.AnnoControlRadioButtons('visibility', 'Visible', choices=[
            labelling_tool.AnnoControlRadioButtons.choice(value='full', label_text='Fully',
                                                          tooltip='Object is fully visible'),
            labelling_tool.AnnoControlRadioButtons.choice(value='mostly', label_text='Mostly',
                                                          tooltip='Object is mostly visible'),
            labelling_tool.AnnoControlRadioButtons.choice(value='obscured', label_text='Obscured',
                                                          tooltip='Object is significantly obscured'),
        ], label_on_own_line=False),
        labelling_tool.AnnoControlPopupMenu('material', 'Material', groups=[
            labelling_tool.AnnoControlPopupMenu.group(label_text='Artifical/buildings', choices=[
                labelling_tool.AnnoControlPopupMenu.choice(value='concrete', label_text='Concrete',
                                                           tooltip='Concrete objects'),
                labelling_tool.AnnoControlPopupMenu.choice(value='plastic', label_text='Plastic',
                                                           tooltip='Plastic objects'),
                labelling_tool.AnnoControlPopupMenu.choice(value='asphalt', label_text='Asphalt',
                                                           tooltip='Road, pavement, etc.'),
            ]),
            labelling_tool.AnnoControlPopupMenu.group(label_text='Flat natural', choices=[
                labelling_tool.AnnoControlPopupMenu.choice(value='grass', label_text='Grass',
                                                           tooltip='Grass covered ground'),
                labelling_tool.AnnoControlPopupMenu.choice(value='water', label_text='Water', tooltip='Water/lake')]),
            labelling_tool.AnnoControlPopupMenu.group(label_text='Vegetation', choices=[
                labelling_tool.AnnoControlPopupMenu.choice(value='trees', label_text='Trees', tooltip='Trees'),
                labelling_tool.AnnoControlPopupMenu.choice(value='shrubbery', label_text='Shrubs',
                                                           tooltip='Shrubs/bushes'),
                labelling_tool.AnnoControlPopupMenu.choice(value='flowers', label_text='Flowers',
                                                           tooltip='Flowers'),
                labelling_tool.AnnoControlPopupMenu.choice(value='ivy', label_text='Ivy', tooltip='Ivy')]),
        ])
    ]

    if images_pat.strip() == '':
        image_paths = glob.glob('images/*.jpg') + glob.glob('images/*.png')
    else:
        image_paths = glob.glob(images_pat)

    if slic:
        from matplotlib import pyplot as plt
        from skimage.segmentation import slic as slic_segment

        labelled_images = []
        for path in image_paths:
            print('Segmenting {0}'.format(path))
            img = plt.imread(path)
            # slic_labels = slic_segment(img, 1000, compactness=20.0)
            slic_labels = slic_segment(img, 1000, slic_zero=True) + 1

            print('Converting SLIC labels to vector labels...')
            labels = labelling_tool.ImageLabels.from_label_image(slic_labels)

            limg = labelling_tool.LabelledImageFile(path, labels)
            labelled_images.append(limg)

        print('Segmented {0} images'.format(len(labelled_images)))
    else:
        # Load in .JPG images from the 'images' directory.
        labelled_images = labelling_tool.PersistentLabelledImage.for_files(
            image_paths, labels_dir=labels_dir, readonly=readonly)
        print('Loaded {0} images'.format(len(labelled_images)))

    if update_label_object_ids:
        n_updated = 0
        for limg in labelled_images:
            if os.path.exists(limg.labels_path):
                label_js = json.load(open(limg.labels_path, 'r'))
                prefix = str(uuid.uuid4())
                modified = labelling_tool.ensure_json_object_ids_have_prefix(
                    label_js, id_prefix=prefix)
                if modified:
                    with open(limg.labels_path, 'w') as f_out:
                        json.dump(label_js, f_out, indent=3)
                    n_updated += 1
        print('Updated object IDs in {} files'.format(n_updated))



    config = {
        'tools': {
            'imageSelector': True,
            'labelClassSelector': True,
            'drawPointLabel': False,
            'drawBoxLabel': True,
            'drawOrientedEllipseLabel': True,
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
        },
        'settings': {
            'brushWheelRate': 0.025,  # Change rate for brush radius (mouse wheel)
            'brushKeyRate': 2.0,    # Change rate for brush radius (keyboard)
        }
    }

    flask_labeller(label_classes, labelled_images, colour_schemes, anno_controls=anno_controls,
                   config=config, dextr_fn=dextr_fn)


if __name__ == '__main__':
    run_app()