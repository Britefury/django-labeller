import json

from flask import Flask, render_template, request, make_response

import labelling_tool


# Specify our 3 label classes.
# `LabelClass` parameters are: symbolic name, human readable name for UI, and RGB colour as list
label_classes = [labelling_tool.LabelClass('tree', 'Trees', [0, 255, 192]),
                 labelling_tool.LabelClass('building', 'Buldings', [255, 128, 0]),
                 labelling_tool.LabelClass('lake', 'Lake', [0, 128, 255]),
                 ]


# Load in .JPG images from the 'images' directory.
labelled_images = labelling_tool.PersistentLabelledImage.for_directory('images', image_filename_pattern='*.jpg')
print 'Loaded {0} images'.format(len(labelled_images))


# Generate image IDs list and images table mapping image ID to image
image_ids = [str(i)   for i in xrange(len(labelled_images))]
images_table = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}


app = Flask(__name__)


@app.route('/')
def index():
    label_classes_json = [{'name': cls.name, 'human_name': cls.human_name, 'colour': cls.colour}   for cls in label_classes]
    return render_template('labeller_page.jinja2',
                           label_classes=json.dumps(label_classes_json),
                           image_ids=json.dumps(image_ids),
                           initial_image_id=image_ids[0])


@app.route('/labelling/get_image_descriptor/<image_id>')
def get_image_descriptor(image_id):
    image = images_table[image_id]

    labels = image.labels
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
    image.labels = labels

    return make_response('')


@app.route('/image/<image_id>')
def get_image(image_id):
    image = images_table[image_id]
    data, mimetype, width, height = image.data_and_mime_type_and_size()
    r = make_response(data)
    r.mimetype = mimetype
    return r


if __name__ == '__main__':
    app.run(debug=True)
