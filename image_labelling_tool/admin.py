from django.contrib import admin
from . import models

# Register your models here.
admin.site.register(models.LabellingTask)
admin.site.register(models.Labels)
