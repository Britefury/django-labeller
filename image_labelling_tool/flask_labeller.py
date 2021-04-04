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
from typing import Any, Optional, Sequence, Mapping, Callable, Union
import pathlib
import json
import uuid
from PIL import Image
import numpy as np
from image_labelling_tool import labelling_tool, labelling_schema, labelled_image, schema_editor_messages

import click

from flask import Flask, request, make_response, send_file, render_template

try:
    from flask_socketio import SocketIO, emit as socketio_emit
except ImportError:
    SocketIO = None
    socketio_emit = None


DextrImageType = Union[np.ndarray, Image.Image]
DextrFunctionType = Callable[[DextrImageType, np.ndarray], np.ndarray]

def _register_labeller_routes(app: Flask, socketio: Any, socketio_emit: Any,
                              images_table: Mapping[str, labelled_image.LabelledImage],
                              dextr_fn: Optional[DextrFunctionType]):
    def apply_dextr_js(image: labelled_image.LabelledImage, dextr_points_js: Any):
        image_for_dextr = image.image_source.image_as_array_or_pil()
        dextr_points = np.array([[p['y'], p['x']] for p in dextr_points_js])
        if dextr_fn is not None:
            mask = dextr_fn(image_for_dextr, dextr_points)
            regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
            regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
            return regions_js
        else:
            return []


    if socketio is not None:
        @socketio.on('get_labels')
        def handle_get_labels(arg_js: Mapping[str, Any]):
            image_id = arg_js['image_id']

            image = images_table[image_id]

            wrapped_labels = image.labels_store.get_wrapped_labels()

            label_header = dict(image_id=image_id,
                                labels=wrapped_labels.labels_json,
                                completed_tasks=wrapped_labels.completed_tasks,
                                timeElapsed=0.0,
                                state='editable',
                                session_id=str(uuid.uuid4()),
                                )

            socketio_emit('get_labels_reply', label_header)


        @socketio.on('set_labels')
        def handle_set_labels(arg_js: Mapping[str, Any]):
            label_header = arg_js['label_header']

            image_id = label_header['image_id']

            image = images_table[image_id]

            wrapped_labels = image.labels_store.get_wrapped_labels()
            wrapped_labels.labels_json = label_header['labels']
            wrapped_labels.completed_tasks = label_header['completed_tasks']
            image.labels_store.update_wrapped_labels(wrapped_labels)

            socketio_emit('set_labels_reply', '')


        @socketio.on('dextr')
        def handle_dextr(dextr_js: Mapping[str, Any]):
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
        @app.route('/labeller/get_labels/<image_id>')
        def get_labels(image_id: str):
            image = images_table[image_id]
            wrapped_labels = image.labels_store.get_wrapped_labels()

            label_header = {
                'image_id': image_id,
                'labels': wrapped_labels.labels_json,
                'completed_tasks': wrapped_labels.completed_tasks,
                'timeElapsed': 0.0,
                'state': 'editable',
                'session_id': str(uuid.uuid4()),
            }

            r = make_response(json.dumps(label_header))
            r.mimetype = 'application/json'
            return r


        @app.route('/labeller/set_labels', methods=['POST'])
        def set_labels():
            label_header = json.loads(request.form['labels'])
            image_id = label_header['image_id']

            image = images_table[image_id]

            wrapped_labels = image.labels_store.get_wrapped_labels()
            wrapped_labels.labels_json = label_header['labels']
            wrapped_labels.completed_tasks = label_header['completed_tasks']
            image.labels_store.update_wrapped_labels(wrapped_labels)

            return make_response('')


        @app.route('/labeller/dextr', methods=['POST'])
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
    def get_image(image_id: str):
        image_source = images_table[image_id].image_source
        local_path = image_source.local_path
        if local_path is not None:
            return send_file(str(local_path))
        else:
            bin_image, mimetype = image_source.image_binary_and_mime_type()
            r = make_response(bin_image)
            r.mimetype = mimetype
            return r


class FlaskSchemaEditorMessageHandler(schema_editor_messages.SchemaEditorMessageHandler):
    # Use the message dispatch from `schema_editor_api.SchemaEditorAPI`
    # We only use the `update_schema` message that we use to overwrite the schema contents
    # Our schema type is a `SchemaStore` that stores the schema to a file
    def update_schema(self, request, schema: labelling_schema.SchemaStore, schema_js: Any):
        schema.update_schema_json(schema_js)
        return None

    def create_colour_scheme(self, request, schema: labelling_schema.SchemaStore, colour_scheme_js: Any):
        return None

    def delete_colour_scheme(self, request, schema: labelling_schema.SchemaStore, colour_scheme_js: Any):
        pass

    def create_group(self, request, schema: labelling_schema.SchemaStore, group_js: Any):
        return None

    def delete_group(self, request, schema: labelling_schema.SchemaStore, group_js: Any):
        pass

    def create_label_class(self, request, schema: labelling_schema.SchemaStore,
                           containing_group_js: Any, label_class_js: Any):
        return None

    def delete_label_class(self, request, schema: labelling_schema.SchemaStore,
                           containing_group_js: Any, label_class_js: Any):
        pass


def _register_schema_editor_routes(app: Flask, socketio: Any, socketio_emit: Any,
                                   schema_store: labelling_schema.SchemaStore):
    editor = FlaskSchemaEditorMessageHandler()

    @app.route('/schema_editor/update', methods=['POST'])
    def schema_editor_update():
        messages_js = json.loads(request.form['messages'])

        # Pass the Flask request object to stay in keeping with `SchemaEditorAPI`.
        response = editor.handle_messages(request, schema_store, messages_js)

        return make_response(json.dumps(response))


def flask_labeller(labelled_images: Sequence[labelled_image.LabelledImage],
                   schema: Union[labelling_schema.LabellingSchema, labelling_schema.SchemaStore, Any],
                   tasks: Optional[Sequence[Any]] = None,
                   anno_controls: Optional[Sequence[Any]] = None,
                   config: Optional[Mapping[str, Any]] = None,
                   dextr_fn: Optional[DextrFunctionType] = None, use_reloader: bool = True, debug: bool = True,
                   port: Optional[int] = None):
    # Generate image IDs list
    image_ids = [str(i)   for i in range(len(labelled_images))]
    # Generate images table mapping image ID to image so we can get an image by ID
    images_table = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}
    # Generate image descriptors list to hand over to the labelling tool
    # Each descriptor provides the image ID, the URL and the size
    image_descriptors = []
    for image_id, img in zip(image_ids, labelled_images):
        height, width = img.image_source.image_size
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

    if config is None:
        config = labelling_tool.DEFAULT_CONFIG

    @app.route('/')
    def index():
        if isinstance(schema, labelling_schema.LabellingSchema):
            schema_json = schema.to_json()
        elif isinstance(schema, labelling_schema.SchemaStore):
            schema_json = schema.get_schema_json()
        else:
            schema_json = schema

        if anno_controls is not None:
            anno_controls_json = [c.to_json() for c in anno_controls]
        else:
            anno_controls_json = []

        return render_template('labeller_page.jinja2',
                               labelling_schema=schema_json,
                               tasks=tasks,
                               image_descriptors=image_descriptors,
                               initial_image_index=0,
                               anno_controls=anno_controls_json,
                               labelling_tool_config=config,
                               dextr_available=dextr_fn is not None,
                               use_websockets=socketio is not None)

    _register_labeller_routes(app, socketio, socketio_emit, images_table, dextr_fn)

    if socketio is not None:
        socketio.run(app, debug=debug, port=port, use_reloader=use_reloader)
    else:
        app.run(debug=debug, port=port, use_reloader=use_reloader)


def flask_labeller_and_schema_editor(labelled_images: Sequence[labelled_image.LabelledImage],
                                     schema_store: labelling_schema.SchemaStore,
                                     tasks: Optional[Sequence[Any]] = None,
                                     anno_controls: Optional[Sequence[Any]] = None,
                                     config: Optional[Mapping[str, Any]] = None,
                                     dextr_fn: Optional[DextrFunctionType] = None, use_reloader: bool = True,
                                     debug: bool = True, port: Optional[int] = None):
    vue_tmpl_path = pathlib.Path(__file__).parent / 'templates' / 'inline' / 'schema_editor_vue_templates.html'

    # Generate image IDs list
    image_ids = [str(i)   for i in range(len(labelled_images))]
    # Generate images table mapping image ID to image so we can get an image by ID
    images_table = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}
    # Generate image descriptors list to hand over to the labelling tool
    # Each descriptor provides the image ID, the URL and the size
    image_descriptors = []
    for image_id, img in zip(image_ids, labelled_images):
        height, width = img.image_source.image_size
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


    if config is None:
        config = labelling_tool.DEFAULT_CONFIG


    @app.route('/')
    def index():
        return render_template('index.jinja2',
                               num_images=len(image_descriptors),
                               )


    @app.route('/labeller')
    def labeller():
        schema_json = schema_store.get_schema_json()
        if anno_controls is not None:
            anno_controls_json = [c.to_json() for c in anno_controls]
        else:
            anno_controls_json = []
        return render_template('labeller_page.jinja2',
                               labelling_schema=schema_json,
                               tasks=tasks,
                               image_descriptors=image_descriptors,
                               initial_image_index=0,
                               anno_controls=anno_controls_json,
                               labelling_tool_config=config,
                               dextr_available=dextr_fn is not None,
                               use_websockets=socketio is not None)

    @app.route('/schema_editor')
    def schema_editor():
        schema_editor_vue_templates_html = vue_tmpl_path.open().read()

        return render_template('schema_editor_page.jinja2',
                               schema=schema_store.get_schema_json(),
                               schema_editor_vue_templates_html=schema_editor_vue_templates_html)

    _register_labeller_routes(app, socketio, socketio_emit, images_table, dextr_fn)
    _register_schema_editor_routes(app, socketio, socketio_emit, schema_store)


    if socketio is not None:
        socketio.run(app, debug=debug, port=port, use_reloader=use_reloader)
    else:
        app.run(debug=debug, port=port, use_reloader=use_reloader)



@click.command()
@click.option('--images_dir', type=click.Path(dir_okay=True, file_okay=False, exists=True), default='./images')
@click.option('--images_pat', type=str, default='*.png|*.jpg')
@click.option('--labels_dir', type=click.Path(dir_okay=True, file_okay=False, writable=True))
@click.option('--readonly', is_flag=True, default=False, help='Don\'t persist changes to disk')
@click.option('--update_label_object_ids', is_flag=True, default=False, help='Update object IDs in label JSON files')
@click.option('--enable_dextr', is_flag=True, default=False)
@click.option('--dextr_weights', type=click.Path())
def run_app(images_dir, images_pat, labels_dir, readonly, update_label_object_ids,
            enable_dextr, dextr_weights):
    if enable_dextr or dextr_weights is not None:
        from dextr.model import DextrModel
        import torch

        device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

        if dextr_weights is not None:
            dextr_weights = pathlib.Path(dextr_weights).expanduser()
            dextr_model = torch.load(dextr_weights, map_location=device)
        else:
            dextr_model = DextrModel.pascalvoc_resunet101().to(device)

        dextr_model.eval()

        dextr_fn = lambda image, points: dextr_model.predict([image], points[None, :, :])[0] >= 0.5
    else:
        dextr_fn = None

    # Load schema
    schema_path = pathlib.Path(images_dir) / 'schema.json'
    schema_store = labelling_schema.FileSchemaStore(schema_path, readonly=readonly)

    # Annotation controls
    # Labels may also have optional meta-data associated with them
    # You could use this for e.g. indicating if an object is fully visible, mostly visible or significantly obscured.
    # You could also indicate quality (e.g. blurriness, etc)
    # There are four types of annotation. They have some common properties:
    #   - name: symbolic name (Python identifier)
    #   - label_text: label text in UI
    #   Check boxes, radio buttons and popup menus also have:
    #     - visibility_label_text: [optional] if provided, label visibility can be filtered by this annotation value,
    #       in which case a drop down will appear in the UI allowing the user to select a filter value
    #       that will hide/show labels accordingly
    # Control types:
    # Check box (boolean value):
    #   `labelling_tool.AnnoControlCheckbox`; only the 3 common parameters listed above
    # Radio button (choice from a list):
    #   `labelling_tool.AnnoControlRadioButtons`; the 3 common parameters listed above and:
    #       - choices: list of `labelling_tool.AnnoControlRadioButtons.choice` that provide:
    #           - value: symbolic value name for choice
    #           - tooltip: extra information for user
    #       - label_on_own_line [optional]: if True, place the label and the buttons on a separate line in the UI
    # Popup menu (choice from a grouped list):
    #   `labelling_tool.AnnoControlPopupMenu`; the 3 common parameters listed above and:
    #       - groups: list of groups `labelling_tool.AnnoControlPopupMenu.group`:
    #           - label_text: label text in UI
    #           - choices: list of `labelling_tool.AnnoControlPopupMenu.choice` that provide:
    #               - value: symbolic value name for choice
    #               - label_text: choice label text in UI
    #               - tooltip: extra information for user
    # Text (free form plain text):
    #   `labelling_tool.AnnoControlText`; only the 2 common parameters listed above and:
    #       - multiline: boolean; if True a text area will be used, if False a single line text entry
    anno_controls = [
        labelling_tool.AnnoControlCheckbox('good_quality', 'Good quality',
                                           visibility_label_text='Filter by good quality'),
        labelling_tool.AnnoControlRadioButtons('visibility', 'Visible', choices=[
            labelling_tool.AnnoControlRadioButtons.choice(value='full', label_text='Fully',
                                                          tooltip='Object is fully visible'),
            labelling_tool.AnnoControlRadioButtons.choice(value='mostly', label_text='Mostly',
                                                          tooltip='Object is mostly visible'),
            labelling_tool.AnnoControlRadioButtons.choice(value='obscured', label_text='Obscured',
                                                          tooltip='Object is significantly obscured'),
        ], label_on_own_line=False, visibility_label_text='Filter by visibility'),
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
        ], visibility_label_text='Filter by material'),
        # labelling_tool.AnnoControlText('comment', 'Comment', multiline=False),
    ]

    image_pats = images_pat.split('|')

    # Load in .JPG images from the 'images' directory.
    labelled_images = labelled_image.LabelledImage.for_directory(
        images_dir, image_filename_patterns=image_pats, readonly=readonly)
    print('Loaded {0} images'.format(len(labelled_images)))

    if update_label_object_ids:
        n_updated = 0
        for limg in labelled_images:
            if limg.labels_store.labels_path.exists():
                label_js = json.load(limg.labels_store.labels_path.open('r'))
                prefix = str(uuid.uuid4())
                modified = labelling_tool.ensure_json_object_ids_have_prefix(
                    label_js, id_prefix=prefix)
                if modified:
                    with open(limg.labels_store.labels_path, 'w') as f_out:
                        json.dump(label_js, f_out, indent=3)
                    n_updated += 1
        print('Updated object IDs in {} files'.format(n_updated))

    # For documentation of the configuration, please see the comment above `labelling_tool.DEFAULT_CONFIG`
    config = labelling_tool.DEFAULT_CONFIG

    tasks = [
        dict(name='finished', human_name='[old] finished'),
        dict(name='segmentation', human_name='Outlines'),
        dict(name='classification', human_name='Classification'),
    ]

    flask_labeller_and_schema_editor(labelled_images, schema_store, tasks=tasks,
                   anno_controls=anno_controls, config=config, dextr_fn=dextr_fn)


if __name__ == '__main__':
    run_app()