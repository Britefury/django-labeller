import json, datetime, uuid

from django.http import HttpResponse, JsonResponse
from django.views.decorators.cache import never_cache
from django.views import View
from django.utils.decorators import method_decorator

from django.conf import settings

from . import models


class LabellingToolView (View):
    """
    Labelling tool class based view

    Subclass and override the `get_labels` method (mandatory) and optionally
    the `update_labels` method to customise how label data is accessed and updated.

    `get_labels` should return a `models.Labels` instance or a dict of the form:
        {
            'completed_tasks': <list of names of completed tasks>
            'labels': labels as JSON data
            'state': 'locked'|'editable' to either disable/enable editing (e.g. if another user is editing them)
        }

    The `get_labels_for_update` method is the same, but is called by `update_labels`
    to retrieve a `Labels` instance to be updated. This could be used in a scenario in which
    you want to have `get_labels` return automatically generated labels when viewing,
    but apply updates to different manually created labels.

    Example:
    >>> class MyLabelView (LabellingToolView):
    ...     def get_labels(self, request, image_id_str, *args, **kwargs):
    ...         image = models.Image.get(id=int(image_id_string))
    ...         # Assume `image.labels` is a field that refers to the `Labels` instance
    ...         return image.labels

    Or:
    >>> class MyLabelView (LabellingToolView):
    ...     def get_labels(self, request, image_id_str, *args, **kwargs):
    ...         image = models.Image.get(id=int(image_id_string))
    ...         # Lets assume that the label data has been incorporated into the `Image` class:
    ...         labels_metadata = {
    ...             'completed_tasks': [task.name for task in image.completed_tasks.all()],
    ...             'labels': image.labels_json,
    ...             'state': ('locked' if image.in_use else 'editable')
    ...         }
    ...         return labels_metadata
    ...
    ...     def update_labels(self, request, image_id_str, labels, completed_tasks, time_elapsed, *args, **kwargs):
    ...         image = models.Image.get(id=int(image_id_string))
    ...         image.completed_tasks.set(completed_tasks)
    ...         image.edit_time_elapsed = time_elapsed
    ...         image.labels_json = labels
    ...         image.save()
    """
    def get_labels(self, request, image_id_str, *args, **kwargs):
        """
        Retrieve the `Labels` instance identified by `image_id_str` for display

        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param args: additional arguments
        :param kwargs:additional keyword arguments
        :return: a `Labels` instance
        """
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    def get_labels_for_update(self, request, image_id_str, *args, **kwargs):
        """
        Retrieve the `Labels` instance identified by `image_id_str` for updating

        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param args: additional arguments
        :param kwargs:additional keyword arguments
        :return: a `Labels` instance
        """
        return self.get_labels(request, image_id_str, *args, **kwargs)

    def update_labels(self, request, image_id_str, labels_json, completed_tasks, time_elapsed, *args, **kwargs):
        """
        Update the `Labels` instance identified by `image_id_str`

        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param labels_json: labels in JSON format (Python objects, not as a string)
        :param completed_tasks: sequence of `LabellingTask` instances that lists the tasks that have been completed
        :param time_elapsed: the amount of time taken by users to label this image
        :param args: additional arguments
        :param kwargs:additional keyword arguments
        :return: the `Labels` instance that was updated
        """
        labels = self.get_labels_for_update(request, image_id_str, *args, **kwargs)
        labels.update_labels(labels_json, completed_tasks, time_elapsed, request.user, save=True, check_lock=False)
        return labels

    def dextr_request(self, request, image_id_str, dextr_id, dextr_points):
        """
        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param dextr_id: an ID number the identifies the DEXTR request
        :param dextr_points: the 4 points as a list of 2D vectors ({'x': <x>, 'y': <y>}) in the order
            top edge, left edge, bottom edge, right edge
        :return: contours/regions a list of lists of 2D vectors, each of which is {'x': <x>, 'y': <y>}
        """
        raise NotImplementedError('abstract: dextr_request not implemented for {}'.format(type(self)))

    def dextr_poll(self, request, image_id_str, dextr_ids):
        """
        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param dextr_ids: The DEXTR request IDs that the client is interested in
        :return: a list of dicts where each dict takes the form:
            {
                'image_id': image ID string that identifies the image that the label applies to
                'dextr_id': the ID number that identifies the dextr job/request
                'regions': contours/regions a list of lists of 2D vectors, each of which is {'x': <x>, 'y': <y>}
            }
        """
        raise NotImplementedError('abstract: dextr_poll not implemented for {}'.format(type(self)))

    @method_decorator(never_cache)
    def get(self, request, *args, **kwargs):
        if 'labels_for_image_id' in request.GET:
            image_id_str = request.GET['labels_for_image_id']

            session_id = str(uuid.uuid4())

            labels = self.get_labels(request, image_id_str, *args, **kwargs)
            if labels is None:
                # No labels for this image
                labels_header = {
                    'image_id': image_id_str,
                    'completed_tasks': [],
                    'timeElapsed': 0.0,
                    'state': 'editable',
                    'labels': [],
                    'session_id': session_id,
                }
            elif isinstance(labels, models.Labels):
                # Remove existing lock
                labels_header = {
                    'image_id': image_id_str,
                    'completed_tasks': [task.name for task in labels.completed_tasks.all()],
                    'timeElapsed': labels.edit_time_elapsed,
                    'state': 'editable',
                    'labels': labels.labels_json,
                    'session_id': session_id,
                }
            elif isinstance(labels, dict):
                labels_header = {
                    'image_id': image_id_str,
                    'completed_tasks': labels['completed_tasks'],
                    'timeElapsed': labels.get('edit_time_elapsed', 0.0),
                    'state': labels.get('state', 'editable'),
                    'labels': labels['labels'],
                    'session_id': session_id,
                }
            else:
                raise TypeError('labels returned by get_labels metod should be None, a Labels model '
                                'or a dictionary; not a {}'.format(type(labels)))

            return JsonResponse(labels_header)
        elif 'next_unlocked_image_id_after' in request.GET:
            return JsonResponse({'error': 'operation_not_supported'})
        else:
            return JsonResponse({'error': 'unknown_operation'})

    @method_decorator(never_cache)
    def post(self, request, *args, **kwargs):
        if 'labels' in request.POST:
            # Write labels
            labels = json.loads(request.POST['labels'])
            image_id = labels['image_id']
            completed_task_names = labels['completed_tasks']
            time_elapsed = labels['timeElapsed']
            label_data = labels['labels']

            completed_tasks = models.LabellingTask.objects.filter(enabled=True, name__in=completed_task_names)

            try:
                self.update_labels(request, str(image_id), label_data, completed_tasks, time_elapsed, *args, **kwargs)
            except models.LabelsLockedError:
                return JsonResponse({'error': 'locked'})
            else:
                return JsonResponse({'response': 'success'})
        elif 'dextr' in request.POST:
            # DEXTR
            dextr_js = json.loads(request.POST['dextr'])
            if 'request' in dextr_js:
                dextr_request_js = dextr_js['request']
                image_id = dextr_request_js['image_id']
                dextr_id = dextr_request_js['dextr_id']
                dextr_points = dextr_request_js['dextr_points']

                regions_js = self.dextr_request(request, str(image_id), dextr_id, dextr_points)

                if regions_js is not None:
                    dextr_labels = dict(image_id=image_id, dextr_id=dextr_id, regions=regions_js)
                    dextr_reply = dict(labels=[dextr_labels])
                    return JsonResponse(dextr_reply)
                else:
                    return JsonResponse({'response': 'success'})
            elif 'poll' in dextr_js:
                dextr_poll_js = dextr_js['poll']
                image_id_str = dextr_poll_js['image_id']
                dextr_ids = dextr_poll_js['dextr_ids']

                dextr_ids = [int(x) for x in dextr_ids]

                labels_js = self.dextr_poll(request, image_id_str, dextr_ids)

                if labels_js is not None:
                    dextr_reply = dict(labels=labels_js)
                    return JsonResponse(dextr_reply)
                else:
                    return JsonResponse({'response': 'success'})
            if isinstance(dextr_js, dict):
                return JsonResponse({'error': 'unknown_dextr_api', 'keys': list(dextr_js.keys())})
            else:
                return JsonResponse({'error': 'unknown_dextr_api', 'type': str(type(dextr_js))})
        else:
            return JsonResponse({'response': 'unknown_api', 'keys': [str(k) for k in request.POST.keys()]})


class LabellingToolViewWithLocking (LabellingToolView):
    """
    Labelling tool class based view with label locking

    Subclass and override the `get_labels` method (mandatory), the
    `get_next_unlocked_image_id_after` method (mandatory) and optionally
    the `update_labels` method to customise how label data is accessed and updated.

    `get_labels` should return a `models.Labels` instance; it should NOT return anything else
    in the way that the `get_labels` method of a subclass of `LabellingToolView` can.

    The `LABELLING_TOOL_LOCK_TIME` attribute in settings can be used to set the amount of time
    that a lock lasts for in seconds; default is 10 minutes (600s).

    Example:
    >>> class MyLabelView (LabellingToolViewWithLocking):
    ...     def get_labels(self, request, image_id_str, *args, **kwargs):
    ...         image = models.Image.get(id=int(image_id_string))
    ...         # Assume `image.labels` is a field that refers to the `Labels` instance
    ...         return image.labels
    ...
    ...     def get_unlocked_image_id(self, request, image_ids, *args, **kwargs):
    ...         unlocked_labels = image_labelling_tool.models.Labels.objects.unlocked()
    ...         unlocked_q = Q(id__in=image_ids, labels__in=unlocked_labels)
    ...         # Optional: filter images for those accessible to the user to guard against maliciously crafted
    ...         # requests
    ...         accessible_q = Q(owner=request.user)
    ...         unlocked_imgs = models.Image.objects.filter(unlocked_q & accessible_q).distinct()
    ...         first_unlocked = unlocked_imgs.first()
    ...         return first_unlocked.id if first_unlocked is not None else None
    """
    def get_unlocked_image_id(self, request, image_ids, *args, **kwargs):
        """
        Get the ID of the first image from the list of provided image IDs that is unlocked.
        Images are locked when a user is editing them. This finds an image that is not being edited
        by someone else.

        :param request: HTTP request
        :param image_ids: list of image IDs to search
        :param args: additional arguments
        :param kwargs:additional keyword arguments
        :return: the ID of the next unlocked image, or `None` if not found
        """
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    def update_labels(self, request, image_id_str, labels_json, completed_tasks, time_elapsed, *args, **kwargs):
        """
        Update the `Labels` instance identified by `image_id_str`

        :param request: HTTP request
        :param image_id_str: image ID that identifies the image that we are labelling
        :param labels_json: labels in JSON format (Python objects, not as a string)
        :param completed_tasks: sequence of `LabellingTask` instances that lists the tasks that have been completed
        :param time_elapsed: the amount of time taken by users to label this image
        :param args: additional arguments
        :param kwargs:additional keyword arguments
        :return: the `Labels` instance that was updated
        """
        expire_after = getattr(settings, 'LABELLING_TOOL_LOCK_TIME', 600)
        labels = self.get_labels_for_update(request, image_id_str, *args, **kwargs)
        labels.update_labels(labels_json, completed_tasks, time_elapsed, request.user, check_lock=True, save=False)
        if request.user.is_authenticated:
            labels.refresh_lock(request.user, datetime.timedelta(seconds=expire_after), save=False)
        labels.save()
        return labels

    @method_decorator(never_cache)
    def get(self, request, *args, **kwargs):
        if 'labels_for_image_id' in request.GET:
            image_id_str = request.GET['labels_for_image_id']

            session_id = str(uuid.uuid4())

            labels = self.get_labels(request, image_id_str)

            if not isinstance(labels, models.Labels):
                raise TypeError('labels returned by get_labels metod should be a Labels '
                                'model, not a {}'.format(type(labels)))

            # Remove existing lock
            if request.user.is_authenticated:
                already_locked = models.Labels.objects.locked_by_user(request.user)
                for locked_labels in already_locked:
                    locked_labels.unlock(from_user=request.user, save=True)

            if labels.is_locked_to(request.user):
                state = 'locked'
                attempt_lock = False
            else:
                state = 'editable'
                attempt_lock = True
            labels_header = {
                'image_id': image_id_str,
                'completed_tasks': [task.name for task in labels.completed_tasks.all()],
                'timeElapsed': labels.edit_time_elapsed,
                'state': state,
                'labels': labels.labels_json,
                'session_id': session_id,
            }

            if attempt_lock and request.user.is_authenticated:
                expire_after = getattr(settings, 'LABELLING_TOOL_LOCK_TIME', 600)
                labels.lock(request.user, datetime.timedelta(seconds=expire_after), save=True)

            return JsonResponse(labels_header)
        else:
            return JsonResponse({'error': 'unknown_operation'})

    @method_decorator(never_cache)
    def post(self, request, *args, **kwargs):
        if 'get_unlocked_image_id' in request.POST:
            request_str = request.POST['get_unlocked_image_id']
            request = json.loads(request_str)
            image_ids = request['image_ids']
            unlocked_image_id = self.get_unlocked_image_id(request, image_ids)
            return JsonResponse({'image_id': str(unlocked_image_id)})
        else:
            return super(LabellingToolViewWithLocking, self).post(request, *args, **kwargs)

