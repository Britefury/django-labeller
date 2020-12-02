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
import uuid
import numpy as np
from PyQt5 import QtCore, QtWebChannel
from image_labelling_tool import labelling_tool
from image_labelling_tool_qt import web_server


def _json_to_qt(js):
    """
    Internal helper function

    Qt is supposed to coerce between QJsonValue types and python JSON types transparently.
    This mostly works, except if your JSON data contains None/null. In that case Qt fails
    to convert Python types to Qt JSON types, so we define this function to do it by hand.

    :param js: JSON data (int/float/bool/list/dict/None)
    :return: QtCore.QJsonValue instance
    """
    if js is None:
        return QtCore.QJsonValue()
    elif isinstance(js, (bool, int, float, str)):
        return QtCore.QJsonValue(js)
    elif isinstance(js, list):
        return QtCore.QJsonValue([_json_to_qt(v) for v in js])
    elif isinstance(js, dict):
        return QtCore.QJsonValue({k: _json_to_qt(v) for k, v in js.items()})
    else:
        raise TypeError('Cant handle type {}'.format(type(js)))


def _qt_to_json(qtjs):
    """
    Internal helper function

    We handle QJsonValue to Python JSON types manually to paper over other issues...
    :param qtjs: a `QJsonValue` instance
    :return: JSON data (int/float/bool/list/dict/None)
    """
    if qtjs.isBool():
        return qtjs.toBool()
    elif qtjs.isDouble():
        return qtjs.toDouble()
    elif qtjs.isNull() or qtjs.isUndefined():
        return None
    elif qtjs.isString():
        return str(qtjs.toString())
    elif qtjs.isArray():
        arr = qtjs.toArray()
        return [_qt_to_json(x) for x in arr]
    elif qtjs.isObject():
        obj = qtjs.toObject()
        return {str(k): _qt_to_json(obj.get(k)) for k in obj.keys()}
    else:
        raise RuntimeError


class QAbstractLabeller (QtCore.QObject):
    """Qt side labeller that is to be attached to a `QtWebEngineWidgets.QWebEngineView` widget.

    Concrete implementations should implement the following methods and properties:

    image_descriptors_json: get the list of images that the tool should present to the user
    get_image_labels_for_tool(): retrieve the image labels for a given image to be displayed by the tool
    on_update_image_labels_from_tool(): update the labels for a given image
    dextr_predict_mask(): predict a mask using DEXTR for automatically assisted labelling
    dextr_available: determine if DEXTR is available/supported

    """
    _LABELLER_COUNT = 0

    def __init__(self, server, label_classes, tasks=None, colour_schemes=None,
                 anno_controls=None, config=None):
        """
        :param server: the `web_server.LabellerServer` instance that manages the Flask server.
        :param label_classes: grouped label classes that will be passed to the tool
        :param tasks: [optional] a list of tasks for the user to check when they are done
        :param colour_schemes: [optional] the list of colour schemes for display
        :param anno_controls: [optional] additional annotation controls for metadata
        :param config: [optional] labelling tool configuration
        """
        super(QAbstractLabeller, self).__init__()

        self._server = server
        self._server_pipe = self._server.image_registry()

        self._tool_id = str(QAbstractLabeller._LABELLER_COUNT)
        QAbstractLabeller._LABELLER_COUNT += 1

        # Convert the label classes to JSON
        self._label_classes_json = [(cls.to_json() if isinstance(cls, labelling_tool.LabelClassGroup) else cls)
                                    for cls in label_classes]

        # Create a default 'finished' task if none provided
        self._tasks = tasks

        # colour schemes
        self._colour_schemes = colour_schemes

        # Annotation metadata controls
        if anno_controls is not None:
            self._anno_controls_json = [c.to_json() for c in anno_controls]
        else:
            self._anno_controls_json = []

        # Configuration
        if config is None:
            config = web_server.DEFAULT_CONFIG
        self._config = config

        settings = dict(
            config=config,
            tasks=tasks,
            colour_schemes=colour_schemes,
            label_class_groups=self._label_classes_json,
            anno_controls=self._anno_controls_json,
        )
        self._server_pipe.add_settings(self._tool_id, settings)


    @property
    def image_descriptors_json(self):
        """
        A list of JSON image descriptors that will be passed to the client side tool that describe the images that
        are available for labelling.

        Create a descriptor for each image by invoking:
        `descr = labelling_tool.image_descriptor(image_id=image_id, url=url, width=width, height=height)`
        Note that `url` can be None, in which case it will be filled in for you,
        otherwise it should be the URL at which the image can be found on the Flask server.
        The URL would be '/image/<image_id>'

        :return: a list of JSON image descriptors
        """
        raise NotImplementedError('Not implemented for {}'.format(type(self)))

    def get_image_labels_for_tool(self, image_id):
        """
        Retrieve the image labels and metadata for use by the tool.

        :param image_id: the Image ID identifying the image
        :return: a dictionary with the following layout:
            labels_json: labels in JSON format
            completed_tasks: the list of names of tasks that have been completed by the user as a list of strings
        """
        raise NotImplementedError('Not implemented for {}'.format(type(self)))

    def on_update_image_labels_from_tool(self, image_id, labels_and_metadata):
        """
        Invoked when the tool supplies labels modified by the user

        :param image_id: the Image ID that identifies the image whose labels we are updating
        :param labels_and_metadata: a dictionary with the following layout:
            labels_json: updated labels in JSON format
            completed_tasks: the list of names of tasks that have been completed by the user as a list of strings
        """
        raise NotImplementedError('Not implemented for {}'.format(type(self)))

    def dextr_predict_mask(self, image_id, dextr_points):
        """
        Use DEXTR to predict a mask for an object that is identified by the points in `dextr_points`
        :param image_id: the image ID identifying the image that should be used for inference
        :param dextr_points: points to identify the image as a `(N, [y, x])` NumPy array
        :return: a mask as a `(H, W)` NumPy array whose size matches that of the image
        """
        raise NotImplementedError('Not implemented for {}'.format(type(self)))

    @property
    def dextr_available(self):
        """Return True if DEXTR automatically assisted labelling is available"""
        raise NotImplementedError('Not implemented for {}'.format(type(self)))


    def attach_to_web_engine_view(self, web_engine_view):
        """
        Attach the labeller to a `QtWebEngineWidgets.QWebEngineView` widget

        :param web_engine_view: A `QtWebEngineWidgets.QWebEngineView` instance that is the widget in which the
            labeller is to be rendered
        """
        # Start the Flask server if its not already running
        self._server.start_flask_server()
        # Create a QWebChannel to communicate with the client-side Javascript code
        channel = QtWebChannel.QWebChannel(web_engine_view.page())
        web_engine_view.page().setWebChannel(channel)
        # Register self as `qt_tool` as the `labeller_control_qt.jinja2` template will attempte to find it here
        channel.registerObject("qt_tool", self)
        # Get the server url
        tool_url = self._server.server_url(tool_id=self._tool_id, dextr_available=self._dextr_fn is not None)
        # Have the web view widget navigate there
        web_engine_view.setUrl(QtCore.QUrl(tool_url))


    _tool_load_labels = QtCore.pyqtSignal("QJsonObject")
    _tool_set_labels_reply = QtCore.pyqtSignal("QJsonObject")
    _tool_dextr_reply = QtCore.pyqtSignal("QJsonObject")

    @QtCore.pyqtSlot(str)
    def _tool_request_labels(self, image_id_str):
        image_id_str = str(image_id_str)
        labels_and_metadata = self.get_image_labels_for_tool(image_id_str)
        label_header = dict(
            image_id=image_id_str,
            labels=_json_to_qt(labels_and_metadata['labels_json']),
            completed_tasks=labels_and_metadata['completed_tasks'],
            timeElapsed=0.0,
            state='editable',
            session_id=str(uuid.uuid4()),
        )
        self._tool_load_labels.emit(label_header)

    @QtCore.pyqtSlot("QJsonValue")
    def _tool_set_labels(self, label_header):
        label_header = _qt_to_json(label_header)
        image_id_str = label_header['image_id']
        labels_and_metadata = dict(labels_json=label_header['labels'],
                                   completed_tasks=label_header['completed_tasks'])
        self.on_update_image_labels_from_tool(image_id_str, labels_and_metadata)
        self._tool_set_labels_reply.emit({})

    @QtCore.pyqtSlot("QJsonValue")
    def _tool_dextr(self, dextr_js):
        dextr_js = _qt_to_json(dextr_js)
        if 'request' in dextr_js:
            dextr_request_js = dextr_js['request']
            image_id = dextr_request_js['image_id']
            dextr_id = dextr_request_js['dextr_id']
            dextr_points = dextr_request_js['dextr_points']

            if self.dextr_available:
                # Convert to `[N, [y, x]]` NumPy array
                dextr_points_np = np.array([[p['y'], p['x']] for p in dextr_points])
                # Predict mask
                mask = self.dextr_predict_mask(image_id, dextr_points_np)
                # Convert to vector label
                regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
                # To JSON
                regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
            else:
                regions_js = []

            dextr_labels = dict(image_id=image_id, dextr_id=dextr_id, regions=regions_js)
            dextr_reply = dict(labels=[dextr_labels])
            self._tool_dextr_reply.emit(dextr_reply)
        elif 'poll' in dextr_js:
            dextr_reply = dict(labels=[])
            self._tool_dextr_reply.emit(dextr_reply)
        else:
            raise RuntimeError

    @QtCore.pyqtProperty("QJsonObject")
    def _tool_label_class_groups(self):
        return dict(value=self._label_classes_json)

    @QtCore.pyqtProperty("QJsonObject")
    def _tool_anno_tasks(self):
        return dict(value=self._tasks)

    @QtCore.pyqtProperty("QJsonObject")
    def _tool_colour_schemes(self):
        return dict(value=self._colour_schemes)

    @QtCore.pyqtProperty("QJsonObject")
    def _tool_anno_controls(self):
        return dict(value=self._anno_controls_json)

    @QtCore.pyqtProperty("QJsonObject")
    def _tool_image_descriptors(self):
        descrs = self.image_descriptors_json.copy()
        # Fixup the URLs
        for d in descrs:
            if d['img_url'] is None:
                d['img_url'] = '/image/{}'.format(d['image_id'])
        return dict(value=descrs)

    @QtCore.pyqtProperty("QJsonObject")
    def _tool_anno_config(self):
        return dict(value=self._config)

    @QtCore.pyqtProperty(bool)
    def _tool_dextr_available(self):
        return self.dextr_available


class QLabellerForLabelledImages (QAbstractLabeller):
    """Qt side Django labeller that is to be attached to a `QtWebEngineWidgets.QWebEngineView` widget.

    Operates on a provided list of labelled images (see `labelling_tool.AbstractLabelledImage`)
    """
    def __init__(self, server, label_classes, labelled_images, tasks=None, colour_schemes=None,
                 anno_controls=None, config=None, dextr_fn=None):
        """
        :param server: the `web_server.LabellerServer` instance that manages the Flask server.
        :param label_classes: grouped label classes that will be passed to the tool
        :param labelled_images: a list of labelled images to edit (see `labelling_tool.AbstractLabelledImage`)
        :param tasks: [optional] a list of tasks for the user to check when they are done
        :param colour_schemes: [optional] the list of colour schemes for display
        :param anno_controls: [optional] additional annotation controls for metadata
        :param config: [optional] labelling tool configuration
        :param dextr_fn: [optional] DEXTR prediction function
        """
        super(QLabellerForLabelledImages, self).__init__(
            server=server, label_classes=label_classes, tasks=tasks, colour_schemes=colour_schemes,
            anno_controls=anno_controls, config=config)

        self._dextr_fn = dextr_fn

        # Generate image IDs list
        image_ids = ['{}__{}'.format(self._tool_id, i) for i in range(len(labelled_images))]
        # Generate images table mapping image ID to image so we can get an image by ID
        images_table = {image_id: img for image_id, img in zip(image_ids, labelled_images)}
        # Generate image descriptors list to hand over to the labelling tool
        # Each descriptor provides the image ID, the URL and the size
        self.__image_descriptors = []
        for image_id, img in zip(image_ids, labelled_images):
            height, width = img.image_size
            if img.image_path is not None:
                self._server_pipe.add_image(image_id, web_server._ImagePath(
                    path=img.image_path, width=width, height=height))
            else:
                data, mime_type = img.data_and_mime_type
                self._server_pipe.add_image(image_id, web_server._ImageBinary(
                    data=data, mime_type=mime_type, width=width, height=height))
            self.__image_descriptors.append(labelling_tool.image_descriptor(
                image_id=image_id, url='/image/{}'.format(image_id),
                width=width, height=height
            ))
        self.__images_table = images_table

    @property
    def image_descriptors_json(self):
        return self.__image_descriptors

    def get_image_labels_for_tool(self, image_id):
        image = self.__images_table[image_id]
        return dict(labels_json=image.labels_json, completed_tasks=image.completed_tasks)

    def on_update_image_labels_from_tool(self, image_id, labels_and_metadata):
        image = self.__images_table[image_id]
        image.set_label_data_from_tool(labels_and_metadata['labels_json'], labels_and_metadata['completed_tasks'])

    def dextr_predict_mask(self, image_id, dextr_points):
        image = self.__images_table[image_id]
        return self._dextr_fn(image.read_pixels(), dextr_points)

    @property
    def dextr_available(self):
        return self._dextr_fn is not None

