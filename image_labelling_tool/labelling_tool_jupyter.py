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


# Import this module from within a Jupyter notebook to access the Jupyter widget.


import base64, json, sys, six

from ipywidgets import widgets

from IPython.utils.traitlets import Unicode, Integer, List, Dict

from . import labelling_tool


class ImageLabellingTool (widgets.DOMWidget):
    _view_name = Unicode('ImageLabellingToolView', sync=True)
    _view_module = Unicode('image-labelling-tool', sync=True)

    label_classes = List(sync=True)

    tool_width_ = Integer(sync=True)
    tool_height_ = Integer(sync=True)

    images_ = List(sync=True)
    initial_image_index_ = Integer(sync=True)

    labelling_tool_config_ = Dict(sync=True)



    def __init__(self, labelled_images=None, label_classes=None, tool_width=1040, tool_height=585,
                 labelling_tool_config=None, **kwargs):
        """

        :type labelled_images: AbstractLabelledImage
        :param labelled_images: a list of images to label

        :type label_classes: [LabelClass]
        :param label_classes: list of label classes available to the user

        :type tool_width: int
        :param tool_width: width of tool in pixels

        :type tool_height: int
        :param tool_height: height of tool in pixels

        :param kwargs: kwargs passed to DOMWidget constructor
        """
        if label_classes is None:
            label_classes = []

        label_classes = [cls.to_json() for cls in label_classes]

        if labelled_images is None:
            labelled_images = []

        if labelling_tool_config is None:
            labelling_tool_config = {}

        image_ids = [str(i)   for i in range(len(labelled_images))]
        self.__images = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}
        self.__changing = False

        image_descriptors = []
        for image_id, img in zip(image_ids, labelled_images):
            image_descriptors.append(labelling_tool.image_descriptor(image_id=image_id))


        super(ImageLabellingTool, self).__init__(tool_width_=tool_width, tool_height_=tool_height,
                                                 images_=image_descriptors,
                                                 initial_image_index_=0,
                                                 label_classes=label_classes,
                                                 labelling_tool_config_=labelling_tool_config, **kwargs)

        self.on_msg(self._on_msg_recv)

        self.label_data = labelled_images[0].labels_json


    def _on_msg_recv(self, _, msg, *args):
        msg_type = msg.get('msg_type', '')
        if msg_type == 'get_labels':
            try:
                image_id = str(msg.get('image_id', '0'))
            except ValueError:
                image_id = '0'

            load_labels_msg = {}

            image = self.__images[image_id]
            data, mimetype, width, height = image.data_and_mime_type_and_size()

            data_b64 = base64.b64encode(data)

            if sys.version_info[0] == 3:
                data_b64 = data_b64.decode('us-ascii')

            labels_json, complete = image.get_label_data_for_tool()

            self.label_data = labels_json

            msg_label_header = {
                'image_id': image_id,
                'labels': labels_json,
                'complete': complete
            }
            msg_image = {
                'image_id': image_id,
                'img_url': 'data:{0};base64,'.format(mimetype) + data_b64,
                'width': width,
                'height': height,
            }
            self.send({
                'msg_type': 'load_labels',
                'label_header': msg_label_header,
                'image': msg_image,
            })
        elif msg_type == 'update_labels':
            label_header = msg.get('label_header')
            if label_header is not None:
                image_id = label_header['image_id']
                complete = label_header['complete']
                labels = label_header['labels']
                self.__images[image_id].set_label_data_from_tool(labels, complete)
                print('Received changes for image {0}; {1} labels'.format(image_id, len(labels)))
