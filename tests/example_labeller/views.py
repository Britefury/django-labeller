import os

from django.http import HttpResponse
from django.template import RequestContext, loader

from image_labelling_tool import labelling_tool
from image_labelling_tool.labelling_tool_views import label_accessor_view, label_update_view

# Specify our 3 label classes.
# `LabelClass` parameters are: symbolic name, human readable name for UI, and RGB colour as list
label_classes = [labelling_tool.LabelClass('tree', 'Trees', [0, 255, 192]),
                 labelling_tool.LabelClass('building', 'Buldings', [255, 128, 0]),
                 labelling_tool.LabelClass('lake', 'Lake', [0, 128, 255]),
                 ]


# Load in .JPG images from the 'images' directory.
labelled_images = labelling_tool.PersistentLabelledImage.for_directory(
    os.path.join('..', 'images'), image_filename_pattern='*.jpg'
)
print 'Loaded {0} images'.format(len(labelled_images))


# Generate image IDs list and images table mapping image ID to image
image_ids = [str(i)   for i in xrange(len(labelled_images))]
images_table = {image_id: img   for image_id, img in zip(image_ids, labelled_images)}
image_descriptors = []
for image_id, img in zip(image_ids, labelled_images):
    data, mimetype, width, height = img.data_and_mime_type_and_size()
    image_descriptors.append({
        'image_id': image_id,
        'img_url': '/example_labeller/image/{}'.format(image_id),
        'width': width,
        'height': height,
    })


# Configuration
config = {
    'tools': {
        'imageSelector': True,
        'labelClassSelector': True,
        'drawPolyLabel': True,
        'compositeLabel': True,
        'deleteLabel': True,
    }
}




def home(request):
    template = loader.get_template('index.html')
    context = RequestContext(request, {
        'label_classes': [c.to_json()   for c in label_classes],
        'image_descriptors': image_descriptors,
        'initial_image_index': 0,
        'labelling_tool_config': config,
    })
    return HttpResponse(template.render(context))



@label_accessor_view
def get_labels(request, image_id_str):
    image = images_table[image_id_str]

    labels = image.labels_json
    complete = False

    labels_metadata = {
        'complete': complete,
        'labels': labels,
    }

    return labels_metadata


@label_update_view
def set_labels(request, image_id_str, labels, complete):
    image = images_table[image_id_str]
    image.labels_json = labels


def get_image(request, image_id):
    image = images_table[image_id]
    data, mimetype, width, height = image.data_and_mime_type_and_size()
    return HttpResponse(data, content_type=mimetype)
