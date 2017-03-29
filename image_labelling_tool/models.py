import json, datetime
from django.db import models
from django.conf import settings
from . import managers

# Create your models here.
class Labels (models.Model):
    # Label data
    labels_json_str = models.TextField()
    complete = models.BooleanField(default=False)

    # Creation date
    creation_date = models.DateField()

    # Last modification user and datetime
    last_modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='modified_labels', null=True, default=None)
    last_modified_datetime = models.DateTimeField(default=datetime.datetime.now)

    # Locked by user and expiry datetime
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='locked_labels', null=True, default=None)
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
    def label_classes(self):
        label_classes = [x['label_class']   for x in self.labels_json]
        return set(label_classes)

    @property
    def is_locked(self, user=None):
        lock_active = datetime.datetime.now() < self.lock_expiry_datetime
        if user is not None and not user.is_authenticated():
            user = None
        if user is None:
            return lock_active
        else:
            return lock_active and user == self.locked_by

    def update_labels(self, labels_json, complete, user, save=False):
        print('Updating labels from {} to {}'.format(len(self.labels_json), len(labels_json)))
        self.labels_json = labels_json
        self.complete = complete
        if user.is_authenticated():
            self.last_modified_by = user
        else:
            self.last_modified_by = None
        self.last_modified_datetime = datetime.datetime.now()
        if save:
            self.save()

        print('Updated labels to {}'.format(len(self.labels_json)))

    def __unicode__(self):
        return 'Labels (last modified by {} at {})'.format(
            self.last_modified_by.username, self.last_modified_datetime)
