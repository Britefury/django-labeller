from django.db import models

from image_labelling_tool import models as lt_models
import django.utils.timezone
from labeller_project import settings
import os

# models for example_labeller app

class ImageWithLabels (models.Model):
    # image
    image = models.ImageField(blank=True)

    # labels
    labels = models.ForeignKey(lt_models.Labels, models.CASCADE, related_name='image')

    # JC edit 3/3/21
    def deleteImageMedia(self, *args, **kwargs):
        os.remove(os.path.join(settings.MEDIA_ROOT, self.image.name))

class DextrTask (models.Model):
    creation_timestamp = models.DateTimeField(default=django.utils.timezone.now)
    image = models.ForeignKey(ImageWithLabels, models.CASCADE)
    image_id_str = models.CharField(max_length=128)
    dextr_id = models.IntegerField()
    celery_task_id = models.CharField(max_length=128)