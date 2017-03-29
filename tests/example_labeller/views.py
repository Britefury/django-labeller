import os, datetime

from django.shortcuts import render, get_object_or_404

from django.conf import settings

from image_labelling_tool import labelling_tool
from image_labelling_tool.labelling_tool_views import label_accessor_view, label_update_view

from . import models

def home(request):
    image_descriptors = [labelling_tool.image_descriptor(
            image_id=img.id, url=img.image.url,
            width=img.image.width, height=img.image.height) for img in models.ImageWithLabels.objects.all()]

    # Convert the label class tuples in `settings` to `labelling_tool.LabelClass` instances
    label_classes = [labelling_tool.LabelClass(*c) for c in settings.LABEL_CLASSES]

    context = {
        'label_classes': [c.to_json()   for c in label_classes],
        'image_descriptors': image_descriptors,
        'initial_image_index': 0,
        'labelling_tool_config': settings.LABELLING_TOOL_CONFIG,
    }
    return render(request, 'index.html', context)


@label_accessor_view
def get_labels(request, image_id_str):
    image = get_object_or_404(models.ImageWithLabels, id=image_id_str)
    return image.labels


@label_update_view
def set_labels(request, image_id_str, labels, complete):
    image = get_object_or_404(models.ImageWithLabels, id=image_id_str)
    image.labels.update_labels(labels, complete, request.user, save=True)
