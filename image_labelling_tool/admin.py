from django.contrib import admin
from . import models

# Register your models here.
admin.site.register(models.LabellingTask)
admin.site.register(models.LabellingSchema)
admin.site.register(models.LabellingColourScheme)
admin.site.register(models.LabelClassGroup)
admin.site.register(models.LabelClass)
admin.site.register(models.LabelClassColour)
admin.site.register(models.Labels)
