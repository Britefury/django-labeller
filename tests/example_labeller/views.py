import os, datetime, json

import numpy as np

from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie

from django.conf import settings

from image_labelling_tool import labelling_tool
from image_labelling_tool import models as lt_models
from image_labelling_tool import labelling_tool_views

from . import models


@ensure_csrf_cookie
def home(request):
    image_descriptors = [labelling_tool.image_descriptor(
            image_id=img.id, url=img.image.url,
            width=img.image.width, height=img.image.height) for img in models.ImageWithLabels.objects.all()]

    # Convert the label class tuples in `settings` to `labelling_tool.LabelClass` instances
    label_classes = settings.LABEL_CLASSES

    context = {
        'label_classes': [c.to_json()   for c in label_classes],
        'image_descriptors': image_descriptors,
        'initial_image_index': 0,
        'labelling_tool_config': settings.LABELLING_TOOL_CONFIG,
    }
    return render(request, 'index.html', context)


@ensure_csrf_cookie
def tool(request):
    image_descriptors = [labelling_tool.image_descriptor(
            image_id=img.id, url=img.image.url,
            width=img.image.width, height=img.image.height) for img in models.ImageWithLabels.objects.all()]

    context = {
        'colour_schemes': settings.LABEL_COLOUR_SCHEMES,
        'label_class_groups': [g.to_json() for g in settings.LABEL_CLASSES],
        'image_descriptors': image_descriptors,
        'initial_image_index': str(0),
        'labelling_tool_config': settings.LABELLING_TOOL_CONFIG,
        'enable_locking': settings.LABELLING_TOOL_ENABLE_LOCKING,
        'dextr_available': settings.LABELLING_TOOL_DEXTR_AVAILABLE,
        'dextr_polling_interval': settings.LABELLING_TOOL_DEXTR_POLLING_INTERVAL,
    }
    return render(request, 'tool.html', context)


class LabellingToolAPI (labelling_tool_views.LabellingToolViewWithLocking):
    def _apply_dextr(self, image, dextr_points_np):
        if settings.LABELLING_TOOL_DEXTR_WEIGHTS_PATH is not None:
            if not hasattr(self, '_dextr_model'):
                import os
                from dextr.dextr import ResNet101DeepLabDEXTR
                import torch

                dextr_weights = os.path.expanduser(settings.LABELLING_TOOL_DEXTR_WEIGHTS_PATH)

                dextr_model = ResNet101DeepLabDEXTR()
                dextr_model.load_weights(dextr_weights)

                device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
                dextr_model.eval()
                dextr_model.to(device)

                self._dextr_model = dextr_model

            import numpy as np
            from PIL import Image

            im = np.array(Image.open(image.image.path))

            mask = self._dextr_model.inference(im, dextr_points_np)
            regions = labelling_tool.PolygonLabel.mask_image_to_regions_cv(mask, sort_decreasing_area=True)
            regions_js = labelling_tool.PolygonLabel.regions_to_json(regions)
            return regions_js
        else:
            return None


    def get_labels(self, request, image_id_str, *args, **kwargs):
        image = get_object_or_404(models.ImageWithLabels, id=int(image_id_str))
        return image.labels

    def get_next_unlocked_image_id_after(self, request, current_image_id_str, *args, **kwargs):
        unlocked_labels = lt_models.Labels.objects.unlocked()
        unlocked_imgs = models.ImageWithLabels.objects.filter(labels__in=unlocked_labels)
        unlocked_img_ids = [img.id for img in unlocked_imgs]
        try:
            index = unlocked_img_ids.index(int(current_image_id_str))
        except ValueError:
            return None
        index += 1
        if index < len(unlocked_img_ids):
            return unlocked_img_ids[index]
        else:
            return None

    def dextr_request(self, request, image_id_str, dextr_id, dextr_points):
        """
        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param dextr_id: an ID number the identifies the DEXTR request
        :param dextr_points: the 4 points as a list of 2D vectors ({'x': <x>, 'y': <y>}) in the order
            top edge, left edge, bottom edge, right edge
        :return: contours/regions a list of lists of 2D vectors, each of which is {'x': <x>, 'y': <y>}
        """
        if settings.LABELLING_TOOL_DEXTR_AVAILABLE:
            image = get_object_or_404(models.ImageWithLabels, id=int(image_id_str))
            dextr_points = np.array([[p['x'], p['y']] for p in dextr_points])
            regions_js = self._apply_dextr(image, dextr_points)
            return regions_js
        else:
            return None

    def dextr_poll(self, request):
        """
        :param request: HTTP request
        :return: a list of dicts where each dict takes the form:
            {
                'image_id': image ID string that identifies the image that the label applies to
                'dextr_id': the ID number that identifies the dextr job/request
                'regions': contours/regions a list of lists of 2D vectors, each of which is {'x': <x>, 'y': <y>}
            }
        """
        return None
