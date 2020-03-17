import os, datetime, json
import celery.result

from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie

from django.conf import settings
import django.utils.timezone

from image_labelling_tool import labelling_tool
from image_labelling_tool import models as lt_models
from image_labelling_tool import labelling_tool_views

from . import models, tasks


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
        'anno_controls': [c.to_json() for c in settings.ANNO_CONTROLS],
        'enable_locking': settings.LABELLING_TOOL_ENABLE_LOCKING,
        'dextr_available': settings.LABELLING_TOOL_DEXTR_AVAILABLE,
        'dextr_polling_interval': settings.LABELLING_TOOL_DEXTR_POLLING_INTERVAL,
    }
    return render(request, 'tool.html', context)


class LabellingToolAPI (labelling_tool_views.LabellingToolViewWithLocking):
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
            cel_result = tasks.dextr.delay(image.image.path, dextr_points)
            dtask = models.DextrTask(image=image, image_id_str=image_id_str, dextr_id=dextr_id, celery_task_id=cel_result.id)
            dtask.save()
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
        oldest = django.utils.timezone.now() - datetime.timedelta(minutes=10)
        to_remove = []
        dextr_labels = []
        for dtask in models.DextrTask.objects.all():
            if dtask.creation_timestamp < oldest:
                to_remove.append(dtask)
            else:
                uuid = dtask.celery_task_id
                res = celery.result.AsyncResult(uuid)
                if res.ready():
                    regions = res.get()
                    dextr_label = dict(image_id=dtask.image_id_str, dextr_id=dtask.dextr_id, regions=regions)
                    dextr_labels.append(dextr_label)
                    to_remove.append(dtask)

        for r in to_remove:
            r.delete()

        return dextr_labels
