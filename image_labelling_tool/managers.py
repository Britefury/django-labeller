import datetime
from django.db import models
from django.db.models import Q
from django.utils import timezone


class LabelsManager (models.Manager):
    def empty(self):
        return self.filter(labels_json_str='[]')

    def not_empty(self):
        return self.exclude(labels_json_str='[]')

    def modified_by_user(self, user):
        return self.filter(last_modified_by=user)

    def locked_by_user(self, user):
        return self.filter(locked_by=user)

    def unlocked(self):
        return self.filter(self.unlocked_q())

    @staticmethod
    def unlocked_q():
        now = timezone.now()
        return Q(locked_by=None) | Q(lock_expiry_datetime__gte=now)


