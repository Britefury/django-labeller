from django.db import models


class LabelsManager (models.Manager):
    def modified_by_user(self, user):
        return self.filter(last_modified_by=user)

    def locked_by_user(self, user):
        return self.filter(locked_by=user)

