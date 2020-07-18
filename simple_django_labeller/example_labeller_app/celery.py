from __future__ import absolute_import

import os
from celery import Celery
from django.conf import settings

from kombu import serialization
serialization.registry._decoders.pop("application/x-python-serialize")

# set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'example_labeller_app.settings')

app = Celery('example_labeller_app')

# Using a string here means the worker will not have to
# pickle the object when using Windows.
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks(lambda: settings.INSTALLED_APPS)