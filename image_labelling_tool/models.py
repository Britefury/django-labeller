import json, datetime
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from . import managers


class LabelsLockedError (Exception):
    pass


class LabellingTask (models.Model):
    enabled = models.BooleanField(default=True)
    name = models.CharField(max_length=256)
    human_name = models.CharField(max_length=256)
    order_key = models.IntegerField(default=0)

    def to_json(self):
        return dict(name=self.name, human_name=self.human_name)

    def __str__(self):
        return 'Task {} (identifier {})'.format(self.human_name, self.name)


class Labels (models.Model):
    # Label data
    labels_json_str = models.TextField(default='[]')

    # Task completion
    completed_tasks = models.ManyToManyField(LabellingTask)

    # Creation date
    creation_date = models.DateField()

    # Time elapsed during editing, in seconds
    edit_time_elapsed = models.FloatField(default=0.0, blank=True)

    # Last modification user and datetime
    last_modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, models.SET_NULL, related_name='modified_labels', null=True, default=None)
    last_modified_datetime = models.DateTimeField(default=datetime.datetime.now)

    # Locked by user and expiry datetime
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, models.SET_NULL, related_name='locked_labels', null=True, default=None)
    lock_expiry_datetime = models.DateTimeField(default=datetime.datetime.now)

    # Manager
    objects = managers.LabelsManager()

    @property
    def labels_json(self):
        return json.loads(self.labels_json_str)

    @labels_json.setter
    def labels_json(self, label_js):
        self.labels_json_str = json.dumps(label_js)

    @property
    def metadata(self):
        """
        Access metadata (completed tasks, creation date, last modified by, last modified date time) as a dict
        :return:
        """
        return dict(
            completed_tasks=list(self.completed_tasks.all()),
            creation_date=self.creation_date,
            last_modified_by=self.last_modified_by,
            last_modified_datetime=self.last_modified_datetime
        )

    @metadata.setter
    def metadata(self, meta):
        if 'completed_tasks' in meta:
            self.completed_tasks.set(meta['completed_tasks'])
        if 'creation_date' in meta:
            self.creation_date = meta['creation_date']
        if 'last_modified_by' in meta:
            self.last_modified_by = meta['last_modified_by']
        if 'last_modified_datetime' in meta:
            self.last_modified_datetime = meta['last_modified_datetime']

    @property
    def metadata_json(self):
        """
        Access metadata (completed tasks, creation date, last modified by, last modified date time) as a
        JSON dict. The 'last modified by' user is stored as user name and/or user ID. The completed tasks
        are stored by name. Dates and datetimes are stored in string form.
        :return:
        """
        return self.metadata_dict_to_json(self.metadata)

    @metadata_json.setter
    def metadata_json(self, meta_js):
        self.metadata = self.metadata_json_to_dict(meta_js)


    @staticmethod
    def metadata_dict_to_json(metadata):
        """
        Convert metadata in dictionary form to JSON form.

        Dates and date times are converted to string form for storage as JSON.
        The last_modified_by User object is stored in JSON as a username and user ID.
        The completed tasks are converted to a list of task names

        :param metadata: metadata in a dictionary with the following optional keys: 'creation_date', 'last_modified_by',
            'last_modified_datetime' and 'completed_tasks'
        :return: metadata in JSON form
        """
        meta_json = {}

        if 'creation_date' in metadata:
            meta_json['creation_date'] = metadata['creation_date'].strftime('%Y-%m-%d')

        if 'last_modified_by' in metadata:
            last_modified_by = metadata['last_modified_by']
            if last_modified_by is not None:
                meta_json['last_modified_by__username'] = last_modified_by.username
                meta_json['last_modified_by__id'] = last_modified_by.id

        if 'last_modified_datetime' in metadata:
            meta_json['last_modified_datetime'] = metadata['last_modified_datetime'].strftime('%Y-%m-%d %H:%M:%S')

        if 'completed_tasks' in metadata:
            meta_json['completed_tasks'] = [task.name for task in metadata['completed_tasks']]

        return meta_json

    @staticmethod
    def metadata_json_to_dict(metadata_json):
        """
        Convert metadata as a JSON dictionary to dictionary form.

        :param metadata_json: metadata as a JSON dictionary
        :return: metadata in dict form
        """
        meta = {}

        if 'creation_date' in metadata_json:
            meta['creation_date'] = datetime.datetime.strptime(metadata_json['creation_date'], '%Y-%m-%d').date()

        last_modified_by = None
        if 'last_modified_by__username' in metadata_json:
            username = metadata_json['last_modified_by__username']
            last_modified_by = get_user_model().objects.get(username=username)
        if last_modified_by is None and 'last_modified_by__id' in metadata_json:
            user_id = metadata_json['last_modified_by__id']
            last_modified_by = get_user_model().objects.get(id=user_id)
        if last_modified_by is not None:
            meta['last_modified_by'] = last_modified_by

        if 'last_modified_datetime' in metadata_json:
            meta['last_modified_datetime'] = datetime.datetime.strptime(metadata_json['last_modified_datetime'],
                                                                        '%Y-%m-%d %H:%M:%S')

        if 'complete' in metadata_json:
            completed_task_names = ['finished']
        elif 'completed_tasks' in metadata_json:
            completed_task_names = metadata_json['completed_tasks']
        else:
            completed_task_names = None
        if completed_task_names is not None:
            meta['completed_tasks'] = list(LabellingTask.objects.filter(name__in=completed_task_names).distinct())

        return meta


    @staticmethod
    def from_labels_json_str_and_metadata_dict(labels_json_str, metadata):
        keys = ['creation_date', 'completed_tasks', 'last_modified_by', 'last_modified_datetime']
        kwargs = {key: metadata[key] for key in keys}

        return Labels(labels_json_str=labels_json_str, **kwargs)

    @staticmethod
    def from_labels_json_str_and_metadata_json(labels_json_str, metadata_json):
        return Labels.from_labels_json_str_and_metadata_dict(
            labels_json_str, Labels.metadata_json_to_dict(metadata_json))


    @property
    def is_empty(self):
        return self.labels_json_str == '[]'

    @property
    def label_classes(self):
        label_classes = [x['label_class']   for x in self.labels_json]
        return set(label_classes)

    @property
    def label_class_histogram(self):
        if self.is_empty:
            return {}
        else:
            histogram = {}
            for x in self.labels_json:
                cls = x['label_class']
                histogram[cls] = histogram.get(cls, 0) + 1
            return histogram

    def update_labels(self, labels_json, completed_tasks, time_elapsed, user, save=False, check_lock=False):
        """
        Update labels, normally called by Django views that are responding to user input received from the client

        :param labels_json: labels in JSON form
        :param completed_tasks: sequence of LabellingTask instances
        :param time_elapsed: labelling time elapsed
        :param user: user account being used to edit the labels
        :param save: if `True`, invoke `self.save()` afterwards
        :param check_lock: if `True`, raise `LabelsLockedError` if this labels instance is locked by another user
        """
        # Verify time elapsed is within the bounds of possibility
        current_time = timezone.now()
        dt_since_last_mod = (current_time - self.last_modified_datetime).total_seconds()
        # Allow to either double the time since last modification or time since last modification plus 1 minute
        # to account for potential latency in delivery of last edit
        permitted_dt = max(dt_since_last_mod * 2.0, dt_since_last_mod + 60.0)
        permitted_time = self.edit_time_elapsed + permitted_dt
        if time_elapsed > permitted_time:
            print('WARNING: rejecting time_elapsed: '
                  'self.edit_time_elapsed={}, time_elapsed={}, permitted_time={}'.format(
                        self.edit_time_elapsed, time_elapsed, permitted_time
            ))
        elif time_elapsed >= self.edit_time_elapsed:
            self.edit_time_elapsed = time_elapsed

        if check_lock:
            if self.is_locked_to(user):
                raise LabelsLockedError
        self.labels_json = labels_json
        self.completed_tasks.set(completed_tasks)
        if user.is_authenticated:
            self.last_modified_by = user
        else:
            self.last_modified_by = None
        self.last_modified_datetime = timezone.now()
        if save:
            self.save()

    def is_lock_active(self):
        return timezone.now() < self.lock_expiry_datetime and self.locked_by is not None

    def is_locked_to(self, user=None):
        lock_active = self.is_lock_active()
        if user is not None and not user.is_authenticated:
            user = None
        if user is None:
            return lock_active
        else:
            return lock_active and user != self.locked_by

    def lock(self, to_user, expire_after, save=False):
        if self.is_locked_to(to_user):
            raise ValueError('Cannot lock Labels(id={}) to user {}; is already locked'.format(
                self.id, to_user.username
            ))
        self.locked_by = to_user
        expiry = timezone.now() + expire_after
        self.lock_expiry_datetime = expiry
        if save:
            self.save()

    def refresh_lock(self, to_user, expire_after, save=False):
        if self.is_lock_active():
            if self.locked_by != to_user:
                raise ValueError('Cannot refresh lock Labels(id={}) for user {}; is already locked by {}'.format(
                    self.id, to_user.username, self.locked_by.username
                ))
        expiry = timezone.now() + expire_after
        self.lock_expiry_datetime = expiry
        if save:
            self.save()

    def unlock(self, from_user, save=False):
        if self.is_lock_active():
            if from_user != self.locked_by:
                raise ValueError('Cannot unlock Labels(id={}) from user {}, it is locked by {}'.format(
                    self.id, from_user.username, self.locked_by.username
                ))
            self.locked_by = None
            self.lock_expiry_datetime = timezone.now()
            if save:
                self.save()

    def __str__(self):
        if self.last_modified_by is not None:
            return 'Labels {} (last modified by {} at {})'.format(
                self.id, self.last_modified_by.username, self.last_modified_datetime)
        else:
            return 'Labels {}'.format(self.id)
