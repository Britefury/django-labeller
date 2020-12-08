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
import os
import json
import collections
import multiprocessing, queue
import urllib.parse


DEFAULT_PORT = 5000

DEFAULT_CONFIG = {
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
        'brushKeyRate': 2.0,  # Change rate for brush radius (keyboard)
        'fullscreenButton': False,
    }
}

# The two kinds of images that we share between the main process and the Flask web server
# process
# _ImagePath: read from a file on disk
_ImagePath = collections.namedtuple('_ImagePath', ['path', 'width', 'height'])
# _ImageBinary: contains the binary image data along with a MIME type
_ImageBinary = collections.namedtuple('_ImageBinary', ['data', 'mime_type', 'width', 'height'])


class LabellerServer:
    """
    Global image labellers registry for Qt based labellers

    Invoke the `start_flask_server` method to start the server that will serve the index page,
    static files (CSS/JS) and the images that are to be labelled.
    """
    def __init__(self, port=DEFAULT_PORT):
        self.img_reg_command_q = multiprocessing.Queue()
        self.server_process = None
        self.port = port

    def start_flask_server(self):
        if self.server_process is None:
            img_reg = _ImageRegistryConsumer(self.img_reg_command_q)
            self.server_process = multiprocessing.Process(
                target=_flask_server, args=(img_reg,), kwargs=dict(port=self.port))
            self.server_process.start()
        return self.server_process

    def stop_server(self):
        if self.server_process is not None:
            self.server_process.terminate()
        else:
            raise RuntimeError('Flasks server not started')

    def server_url(self, tool_id=None, dextr_available=False):
        query_dict = {}
        if dextr_available:
            query_dict['dextr'] = ''
        if tool_id is not None:
            query_dict['tool_id'] = tool_id
        query = urllib.parse.urlencode(query_dict)
        return 'http://127.0.0.1:{}/?{}'.format(self.port, query)

    def image_registry(self):
        return _ImageRegistry(self.img_reg_command_q)


class _ImageRegistryConsumer:
    """
    The Flask server uses an image registry consumer to serve the images made
    available by each labeller.
    Labellers add images to an image registry, after which an image registry consumer
    allows the server to access them.
    """
    def __init__(self, command_q):
        self.command_q = command_q
        self.images = {}
        self.settings = {}

    def update(self):
        while True:
            try:
                command = self.command_q.get_nowait()
            except queue.Empty:
                break

            op = command['op']
            if op == 'add_image':
                image = command['image']
                image_id = command['image_id']
                self.images[image_id] = image
            elif op == 'remove_image':
                image_id = command['image_id']
                del self.images[image_id]
            elif op == 'add_settings':
                tool_id = command['tool_id']
                settings = command['settings']
                self.settings[tool_id] = settings
            elif op == 'remove_settings':
                tool_id = command['tool_id']
                del self.settings[tool_id]
            else:
                raise ValueError('Unknown operation {}'.format(op))

    def get_image(self, image_id):
        return self.images[image_id]

    def get_settings(self, tool_id):
        return self.settings[tool_id]


class _ImageRegistry:
    """
    The image registry provides `add_image` and `remove_image` methods for manipulating the list of images
    that are made available to the flask server.
    """
    def __init__(self, command_q):
        self.command_q = command_q

    def add_image(self, image_id, image):
        command = dict(op='add_image', image_id=image_id, image=image)
        self.command_q.put(command)

    def remove_image(self, image_id):
        command = dict(op='remove_image', image_id=image_id)
        self.command_q.put(command)

    def add_settings(self, tool_id, settings):
        command = dict(op='add_settings', tool_id=tool_id, settings=settings)
        self.command_q.put(command)

    def remove_settings(self, tool_id):
        command = dict(op='remove_settings', tool_id=tool_id)
        self.command_q.put(command)


def _flask_server(img_reg, port=5000, debug=False):
    """
    Internal helper function that runs the Flask server

    :param img_reg: an `_ImageRegistryConsumer` instance that provides images that the server will make available
    :param port: port for the server to listen on
    :param debug: if True, enable Flask debuggin
    """
    import json
    from flask import Flask, render_template, send_file, make_response, abort, request

    template_dir = os.path.join('..', 'image_labelling_tool', 'templates')
    static_dir = os.path.join('..', 'image_labelling_tool', 'static')
    app = Flask(__name__, static_folder=static_dir, template_folder=template_dir)

    @app.route('/')
    def index():
        settings = None
        tool_id = request.args.get('tool_id')
        if tool_id is not None:
            img_reg.update()
            settings = img_reg.get_settings(tool_id)

        if settings is not None:
            config = settings.get('config', DEFAULT_CONFIG)
            tasks = settings.get('tasks', None)
            colour_schemes = settings.get('colour_schemes', None)
            label_class_groups = settings.get('label_class_groups', [])
            anno_controls = settings.get('anno_controls', [])
        else:
            config = DEFAULT_CONFIG
            tasks = None
            colour_schemes = None
            label_class_groups = []
            anno_controls = []

        dextr_available = 'dextr' in request.args

        return render_template('labeller_control_qt.jinja2',
                               labelling_tool_config=config,
                               tasks=tasks,
                               colour_schemes=colour_schemes,
                               label_class_groups=label_class_groups,
                               anno_controls=anno_controls,
                               dextr_available=dextr_available)

    @app.route('/image/<image_id>')
    def get_image(image_id):
        img_reg.update()
        try:
            image = img_reg.get_image(image_id)
        except KeyError:
            abort(404)

        if isinstance(image, _ImagePath):
            return send_file(image.path)
        elif isinstance(image, _ImageBinary):
            r = make_response(image.data)
            r.mimetype = image.mime_type
            return r
        else:
            raise TypeError('Unknown image type {}'.format(type(image)))

    app.run(debug=debug, port=port, use_reloader=False)
