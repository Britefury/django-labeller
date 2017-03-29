import json

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

# Create your views here.



def label_accessor_view(fn):
    """
    Decorator for making a label accessor view
    The decorated function takes the image ID in string form as a parameter and should return the labels
    as a JSON object

    :param fn: image descriptor accessor function of the form `fn(image_id_string) -> labels_metadata`
    where `labels_metadata` is a dictionary of the form:
    `{
        'complete': complete,
        'labels': labels
    }`

    where:
        `complete` is a boolean indicating if labelling is finished
        `labels` is the labels in JSON form, retrieved from label storage e.g. database/files/etc

    :return: a Django view function

    Example usage:
    >>> @label_accessor_view
    ... def get_image_descriptor(image_id_string):
    ...     image = models.Image.get(id=int(image_id_string))
    ...     labels = models.ImageLabels.get(image=image)
    ...     labels_metadata = {
    ...         'complete': labels.complete,
    ...         'labels': json.loads(labels.label_json_str)),
    ...     }
    ...     return labels_metadata
    """
    def get_labels(request, **kwargs):
        image_id_str = request.GET.get('image_id')

        labels_metadata = fn(request, image_id_str, **kwargs)

        labels_header = {
            'image_id': image_id_str,
            'complete': labels_metadata['complete'],
            'labels': labels_metadata['labels'],
        }

        return JsonResponse(labels_header)

    get_labels.__name__ = fn.__name__

    return get_labels



def label_update_view(fn):
    """
    Decorator for making a label update view.
    The decorated function takes the image ID in string form, the labels and a completeness flag as parameters.
    It should update the labels stored that are associated
    :param fn: image update function of the form `fn(image_id_string, labels, complete)`
    where:
        `image_id_string` is the ID of the image whose labels are to be updated
        `labels` is the label data in JSON form
        `complete` is a flag indicating if labelling is complete or not

    :return: the view function

    Example usage:
    @label_update_view
    def update_labels(image_id_string, labels, complete):
        image = models.Image.get(id=int(image_id_string))
        labels = models.ImageLabels.get(image=image)
        labels.complete = complete
        labels.label_json_str = json.dumps(labels)
        labels.save()
    """
    def update_labels(request, **kwargs):
        labels = json.loads(request.POST['labels'])
        image_id = labels['image_id']
        complete = labels['complete']
        label_data = labels['labels']

        fn(request, str(image_id), label_data, complete, **kwargs)

        return HttpResponse('null', content_type="application/json")

    update_labels.__name__ = fn.__name__

    return update_labels
