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
import json, argparse

from flask import Flask, render_template, request, make_response, send_from_directory

import labelling_tool

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Image labelling tool - Flask app')
    parser.add_argument('--slic', action='store_true', help='Use SLIC segmentation to generate initial labels')
    parser.add_argument('--readonly', action='store_true', help='Don\'t persist changes to disk')
    args = parser.parse_args()

    # Specify our 3 label classes.
    # `LabelClass` parameters are: symbolic name, human readable name for UI, and RGB colour as list
    label_classes = [labelling_tool.LabelClass('tree', 'Trees', [0, 255, 192]),
                     labelling_tool.LabelClass('building', 'Buldings', [255, 128, 0]),
                     labelling_tool.LabelClass('lake', 'Lake', [0, 128, 255]),
                     ]
    if args.slic:
        import glob
        import numpy as np
        from matplotlib import pyplot as plt
        from skimage.segmentation import slic
        from skimage.util import pad
        from skimage.measure import find_contours

        labelled_images = []
        for path in glob.glob('images/*.jpg'):
            print 'Segmenting {0}'.format(path)
            img = plt.imread(path)
            # slic_labels = slic(img, 1000, compactness=20.0)
            slic_labels = slic(img, 1000, slic_zero=True) + 1

            print 'Converting SLIC labels to vector labels...'
            labels = labelling_tool.ImageLabels.from_label_image(slic_labels)

            limg = labelling_tool.LabelledImageFile(path, labels)
            labelled_images.append(limg)

        print 'Segmented {0} images'.format(len(labelled_images))
    else:
        readonly = args.readonly
        # Load in .JPG images from the 'images' directory.
        labelled_images = labelling_tool.PersistentLabelledImage.for_directory('images', image_filename_pattern='*.jpg',
                                                                               readonly=readonly)
        print 'Loaded {0} images'.format(len(labelled_images))



    # Generate image IDs list and images table mapping image ID to image
    image_ids = [str(i)   for i in xrange(len(labelled_images))]
    images_table = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}


    app = Flask(__name__, static_folder='image_labelling_tool/static')


    config = {
        'tools': {
            'imageSelector': True,
            'labelClassSelector': True,
            'drawPolyLabel': True,
            'compositeLabel': True,
            'deleteLabel': True,
        }
    }


    @app.route('/')
    def index():
        label_classes_json = [{'name': cls.name, 'human_name': cls.human_name, 'colour': cls.colour}   for cls in label_classes]
        return render_template('labeller_page.jinja2',
                               label_classes=json.dumps(label_classes_json),
                               image_ids=json.dumps(image_ids),
                               initial_image_id=image_ids[0],
                               config=json.dumps(config))


    @app.route('/labelling/get_image_descriptor/<image_id>')
    def get_image_descriptor(image_id):
        image = images_table[image_id]

        labels = image.labels_json
        complete = False

        data, mimetype, width, height = image.data_and_mime_type_and_size()


        descriptor = {
            'width': width,
            'height': height,
            'href': '/image/{0}'.format(image_id),
            'label_header': {
                'labels': labels,
                'image_id': image_id,
                'complete': complete
            }
        }

        r = make_response(json.dumps(descriptor))
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


    @app.route('/image/<image_id>')
    def get_image(image_id):
        image = images_table[image_id]
        data, mimetype, width, height = image.data_and_mime_type_and_size()
        r = make_response(data)
        r.mimetype = mimetype
        return r



    @app.route('/ext_static/<path:filename>')
    def base_static(filename):
        return send_from_directory(app.root_path + '/ext_static/', filename)


    app.run(debug=True)
