import json

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

# Create your views here.



def image_descriptor_accessor_view(fn):
    """
    Decorator for making an image descriptor accessor view.
    The decorated function takes the image ID in string form as a parameter and should return a dictionary
    that provides the image metadata.

    :param fn: image descriptor accessor function of the form fn(image_id_string) -> image_metadata
    where image_metadata is a dictionary of the form
        {'width': <image width as integer>,
         'height': <image height as integer>,
         'href': <image URL or image encoded as a URL>,
         'labels': label JSON data from label storage e.g. database/files/etc
         'complete': boolean indicating if the label data is complete
    :return: a view function

    Example usage:
    @image_descriptor_accessor_view
    def get_image_descriptor(image_id_string):
        image = models.Image.get(id=int(image_id_string))
        labels = models.ImageLabels.get(image=image)
        return {
            'width': image.width,
            'height': image.height,
            'href': '/image/{0}'.format(image_id_string),
            'labels': json.loads(labels.label_json_str),
            'complete': labels.complete
        }
    """
    def get_image_descriptor_view(request):
        image_id_str = request.GET.get('image_id')

        image_metadata = fn(image_id_str)

        descriptor = {
            'width': image_metadata['width'],
            'height': image_metadata['height'],
            'href': image_metadata['href'],
            'label_header': {
                'labels': image_metadata['labels'],
                'image_id': image_id_str,
                'complete': image_metadata['complete']
            }
        }

        return JsonResponse(descriptor)

    get_image_descriptor_view.__name__ = fn.__name__

    return get_image_descriptor_view



def label_update_view(fn):
    """
    Decorator for making a label update view.
    The decorated function takes the image ID in string form, the labels and a completeness flag as parameters.
    It should update the labels stored that are associated
    :param fn: image update function of the form fn(image_id_string, labels, complete)
    where image_data is a dictionary of the form
        {'width': <image width as integer>,
         'height': <image height as integer>,
         'href': <image URL or image encoded as a URL>,
         'labels': label JSON data from label storage e.g. database/files/etc
         'complete': boolean indicating if the label data is complete

    :return: the view function

    Example usage:
    @image_descriptor_accessor_view
    def get_image_descriptor(image_id_string):
        image = models.Image.get(id=int(image_id_string))
        labels = models.ImageLabels.get(image=image)
        return {
            'width': image.width,
            'height': image.height,
            'href': '/image/{0}'.format(image_id_string),
            'labels': json.loads(labels.label_json_str),
            'complete': labels.complete
        }
    """
    def set_labels_view(request):
        labels = json.loads(request.POST['labels'])
        image_id = labels['image_id']
        complete = labels['complete']
        label_data = labels['labels']

        fn(image_id, label_data, complete)

        return HttpResponse('null', content_type="application/json")

    set_labels_view.__name__ = fn.__name__

    return set_labels_view
