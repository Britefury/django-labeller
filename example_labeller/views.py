from django.shortcuts import render
from django.template import RequestContext, loader
from django.http import HttpResponse
from image_labelling_tool.labelling_tool_views import image_descriptor_accessor_view, label_update_view

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




def home(request):
    template = loader.get_template('index.html')
    context = RequestContext(request, {
        'label_classes': [c.to_json()   for c in label_classes],
        'image_ids': image_ids,
        'initial_image_id': image_ids[0],
    })
    return HttpResponse(template.render(context))



@image_descriptor_accessor_view
def get_image_desctriptor(request, image_id_str):
    image = images_table[image_id_str]

    labels = image.labels
    complete = False

    data, mimetype, width, height = image.data_and_mime_type_and_size()

    return {
        'width': width,
        'height': height,
        'href': '/example_labeller/image/{0}'.format(image_id_str),
        'labels': labels,
        'complete': complete
    }


@label_update_view
def set_labels(request, image_id_str, labels, complete):
    image = images_table[image_id_str]
    image.labels = labels


def get_image(request, image_id):
    image = images_table[image_id]
    data, mimetype, width, height = image.data_and_mime_type_and_size()
    return HttpResponse(data, content_type=mimetype)
